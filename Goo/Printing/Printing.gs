package Goo.Printing

import Goo
import System
import System.IO
import System.Threading
import System.Threading.Tasks

/// Exports raster PDF pages or submits them through the platform print dialog.
public shared class Printing {
    internal const MaxPageBytes int64 = 134217728
    private const PointsPerInch float64 = 72
    private const LogicalUnitsPerInch float64 = 96

    /// Shows the OS print dialog. Keep the Goo owner pumping until native work completes.
    public async func ShowDialogAsync(owner Window, document IPrintDocument, title string,
        cancellation CancellationToken = default(CancellationToken)) PrintResult {
        ArgumentNullException.ThrowIfNull(owner)
        ArgumentNullException.ThrowIfNull(document)
        ArgumentException.ThrowIfNullOrWhiteSpace(title)
        if title.Length > 256 || title.Contains('\0') {
            throw ArgumentException("The print title exceeds 256 characters or contains NUL.", nameof(title))
        }
        var lease NativeDialogOwnerLease? = nil
        try {
            let acquisition = await (await OnOwnerAsync(owner,
                () -> owner.AcquireNativeDialogOwnerAsync(cancellation), cancellation).ConfigureAwait(false))
                .ConfigureAwait(false)
            if acquisition.Status != NativeDialogOwnerStatus.Success || acquisition.Owner == nil {
                return PrintResult(MapOwner(acquisition.Status), Error: acquisition.Error ?? "")
            }
            let active = acquisition.Owner!!
            lease = active
            using let linked = CancellationTokenSource.CreateLinkedTokenSource(cancellation, active.Closed)
            return switch active.Kind {
                case NativeDialogOwnerKind.Win32:
                    await WindowsPrinting.PrintAsync(owner, active, document, title, linked.Token).ConfigureAwait(false)
                case NativeDialogOwnerKind.Cocoa:
                    await MacPrinting.PrintAsync(owner, active, document, title, linked.Token).ConfigureAwait(false)
                case NativeDialogOwnerKind.Wayland:
                    await PortalPrinting.PrintAsync(owner, active, document, title, linked.Token).ConfigureAwait(false)
                default: PrintResult(PrintStatus.Unsupported)
            }
        } catch (OperationCanceledException) { return PrintResult(PrintStatus.Cancelled) }
        catch (error IOException) { return PrintResult(PrintStatus.Failed, Error: Detail(error.Message)) }
        catch (error UnauthorizedAccessException) { return PrintResult(PrintStatus.Failed, Error: Detail(error.Message)) }
        finally {
            if let active = lease {
                await OnOwnerAsync(owner, () -> {
                    active.Dispose()
                    return true
                }, CancellationToken.None).ConfigureAwait(false)
            }
        }
    }

    /// Writes a complete raster PDF to an empty writable stream. The caller owns the stream.
    /// @remarks On cancellation or failure the stream can contain partial output. Each page uses at most 128 MiB
    /// for output pixels and new GPU allocations. The document owns margins and page breaks.
    public async func ExportPdfAsync(owner Window, document IPrintDocument, settings PrintPageSettings,
        destination Stream, cancellation CancellationToken = default(CancellationToken)) PrintResult {
        ArgumentNullException.ThrowIfNull(owner)
        ArgumentNullException.ThrowIfNull(document)
        ArgumentNullException.ThrowIfNull(destination)
        Validate(settings)
        if !destination.CanWrite || destination.CanSeek && (destination.Position != 0 || destination.Length != 0) {
            throw ArgumentException("PDF output requires an empty writable stream.", nameof(destination))
        }
        try {
            using let linked = CancellationTokenSource.CreateLinkedTokenSource(cancellation, owner.Closed)
            let layout = await OnOwnerAsync(owner, () -> document.Paginate(settings), linked.Token).ConfigureAwait(false)
            if layout.Status != PrintLayoutStatus.Ready || layout.PageCount <= 0 { return LayoutFailure(layout) }
            let pdf = RasterPdf(destination, layout.PageCount, settings)
            var reusable WindowCapture? = nil
            for index in 0 ... layout.PageCount {
                let result = await RenderPageAsync(owner, document, index, settings, reusable, linked.Token)
                    .ConfigureAwait(false)
                if result.Status != OffscreenRenderStatus.Success || result.Capture == nil { return RenderFailure(result) }
                reusable = result.Capture
                pdf.AddPage(reusable!!, linked.Token)
            }
            linked.Token.ThrowIfCancellationRequested()
            pdf.Complete()
            return PrintResult(PrintStatus.Exported)
        } catch (OperationCanceledException) { return PrintResult(PrintStatus.Cancelled) }
        catch (error IOException) { return PrintResult(PrintStatus.Failed, Error: Detail(error.Message)) }
        catch (error UnauthorizedAccessException) { return PrintResult(PrintStatus.Failed, Error: Detail(error.Message)) }
        catch (OverflowException) { return PrintResult(PrintStatus.BudgetExceeded) }
    }

    internal async func RenderPageAsync(owner Window, document IPrintDocument, index int32,
        settings PrintPageSettings, reusable WindowCapture?, cancellation CancellationToken,
        session OffscreenRenderSession? = nil, post ((Action) -> bool)? = nil) OffscreenRenderResult {
        Validate(settings)
        let width = settings.WidthPoints * settings.DpiX / PointsPerInch
        let height = settings.HeightPoints * settings.DpiY / PointsPerInch
        if width > uint32.MaxValue || height > uint32.MaxValue || width * height > MaxPageBytes / 12.0 {
            return OffscreenRenderResult{Status: OffscreenRenderStatus.BudgetExceeded, Error: "The page exceeds 128 MiB."}
        }
        let options = OffscreenRenderOptions(float32(settings.WidthPoints * LogicalUnitsPerInch / PointsPerInch),
            float32(settings.HeightPoints * LogicalUnitsPerInch / PointsPerInch),
            checked(uint32(Math.Ceiling(width))), checked(uint32(Math.Ceiling(height))), Color.Rgb(255, 255, 255), MaxPageBytes)
        let pending = await OnOwnerAsync(owner, () -> {
            let page = document.CreatePage(index, settings)
            return if session == nil { owner.RenderOffscreenAsync(page, options, cancellation, reusable) }
                else { session.RenderAsync(page, options, cancellation, reusable) }
        }, cancellation, post).ConfigureAwait(false)
        return await pending.ConfigureAwait(false)
    }

    internal func OnOwnerAsync[T](owner Window, action () -> T, cancellation CancellationToken,
        post ((Action) -> bool)? = nil) Task[T] {
        if cancellation.IsCancellationRequested { return Task.FromCanceled[T](cancellation) }
        let ownerClosed = owner.Closed
        if ownerClosed.IsCancellationRequested { return Task.FromCanceled[T](ownerClosed) }
        let completion = TaskCompletionSource[T](TaskCreationOptions.RunContinuationsAsynchronously)
        var claimed = 0
        let cancel = (token CancellationToken) -> {
            if Interlocked.CompareExchange(&claimed, 1, 0) == 0 { completion.TrySetCanceled(token) }
        }
        let registration = cancellation.Register(() -> cancel(cancellation))
        let closed = ownerClosed.Register(() -> cancel(ownerClosed))
        let complete = async () -> {
            try { return await completion.Task.ConfigureAwait(false) }
            finally {
                registration.Dispose()
                closed.Dispose()
            }
        }
        let run Action = () -> {
            if Interlocked.CompareExchange(&claimed, 1, 0) != 0 { return }
            try { completion.TrySetResult(action()) }
            catch (error Exception) { completion.TrySetException(error) }
        }
        if !(if post == nil { owner.TryPost(run) } else { post(run) }) { cancel(CancellationToken(true)) }
        return complete()
    }

    internal func RenderFailure(result OffscreenRenderResult) PrintResult -> PrintResult(switch result.Status {
        case OffscreenRenderStatus.Busy: PrintStatus.Busy
        case OffscreenRenderStatus.NotReady: PrintStatus.NotReady
        case OffscreenRenderStatus.Unsupported: PrintStatus.Unsupported
        case OffscreenRenderStatus.BudgetExceeded: PrintStatus.BudgetExceeded
        case OffscreenRenderStatus.DeviceLost: PrintStatus.DeviceLost
        case OffscreenRenderStatus.Cancelled: PrintStatus.Cancelled
        default: PrintStatus.Failed
    }, Error: result.Error ?? "")

    internal func LayoutFailure(layout PrintLayoutResult) PrintResult -> PrintResult(
        if layout.Status == PrintLayoutStatus.Cancelled { PrintStatus.Cancelled } else { PrintStatus.Failed },
        Error: if string.IsNullOrEmpty(layout.Error) { "The document has no printable pages." } else { Detail(layout.Error) })

    internal func Validate(settings PrintPageSettings) {
        if !float64.IsFinite(settings.WidthPoints) || !float64.IsFinite(settings.HeightPoints) ||
            settings.WidthPoints <= 0 || settings.HeightPoints <= 0 || settings.DpiX <= 0 || settings.DpiY <= 0 ||
            !float64.IsFinite(settings.LeftPoints) || !float64.IsFinite(settings.RightPoints) ||
            !float64.IsFinite(settings.TopPoints) || !float64.IsFinite(settings.BottomPoints) ||
            settings.LeftPoints < 0 || settings.RightPoints < 0 || settings.TopPoints < 0 || settings.BottomPoints < 0 ||
            settings.LeftPoints + settings.RightPoints >= settings.WidthPoints ||
            settings.TopPoints + settings.BottomPoints >= settings.HeightPoints {
            throw ArgumentOutOfRangeException(nameof(settings))
        }
    }

    internal func Detail(message string) string -> if message.Length <= 512 { message } else { message[..512] }

    private func MapOwner(status NativeDialogOwnerStatus) PrintStatus -> switch status {
        case NativeDialogOwnerStatus.Busy: PrintStatus.Busy
        case NativeDialogOwnerStatus.NotReady or NativeDialogOwnerStatus.Closed: PrintStatus.NotReady
        case NativeDialogOwnerStatus.Cancelled: PrintStatus.Cancelled
        case NativeDialogOwnerStatus.Unsupported: PrintStatus.Unsupported
        default: PrintStatus.Failed
    }
}
