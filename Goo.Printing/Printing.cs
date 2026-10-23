namespace Goo.Printing;

/// <summary>Exports raster PDF pages or submits them through the platform print dialog.</summary>
public static class Printing
{
    internal const long MaxPageBytes = 134217728;
    private const double PointsPerInch = 72;
    private const double LogicalUnitsPerInch = 96;

    /// <summary>Shows the OS print dialog. Keep the Goo owner pumping until native work completes.</summary>
    public static async Task<PrintResult> ShowDialogAsync(Window owner, IPrintDocument document, string title,
        CancellationToken cancellation = default)
    {
        ArgumentNullException.ThrowIfNull(owner);
        ArgumentNullException.ThrowIfNull(document);
        ArgumentException.ThrowIfNullOrWhiteSpace(title);
        if (title.Length > 256 || title.Contains('\0'))
            throw new ArgumentException("The print title exceeds 256 characters or contains NUL.", nameof(title));
        NativeDialogOwnerLease? lease = null;
        try
        {
            var acquisition = await (await OnOwnerAsync(owner,
                () => owner.AcquireNativeDialogOwnerAsync(cancellation), cancellation).ConfigureAwait(false))
                .ConfigureAwait(false);
            if (acquisition.Status != NativeDialogOwnerStatus.Success || acquisition.Owner == null)
                return new(MapOwner(acquisition.Status), Error: acquisition.Error ?? "");
            lease = acquisition.Owner;
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellation, lease.Closed);
            return lease.Kind switch
            {
                NativeDialogOwnerKind.Win32 => await WindowsPrinting.PrintAsync(owner, lease, document, title,
                    linked.Token).ConfigureAwait(false),
                NativeDialogOwnerKind.Cocoa => await MacPrinting.PrintAsync(owner, lease, document, title,
                    linked.Token).ConfigureAwait(false),
                NativeDialogOwnerKind.Wayland => await PortalPrinting.PrintAsync(owner, lease, document, title,
                    linked.Token).ConfigureAwait(false),
                _ => new(PrintStatus.Unsupported)
            };
        }
        catch (OperationCanceledException) { return new(PrintStatus.Cancelled); }
        catch (IOException error) { return new(PrintStatus.Failed, Error: Detail(error.Message)); }
        catch (UnauthorizedAccessException error) { return new(PrintStatus.Failed, Error: Detail(error.Message)); }
        finally
        {
            if (lease != null)
                await OnOwnerAsync(owner, () => { lease.Dispose(); return true; }, CancellationToken.None)
                    .ConfigureAwait(false);
        }
    }

    /// <summary>Writes a complete raster PDF to an empty writable stream. The caller owns the stream.</summary>
    /// <remarks>On cancellation or failure the stream can contain partial output. Each page uses at most 128 MiB
    /// for output pixels and new GPU allocations. The document owns margins and page breaks.</remarks>
    public static async Task<PrintResult> ExportPdfAsync(Window owner, IPrintDocument document,
        PrintPageSettings settings, Stream destination, CancellationToken cancellation = default)
    {
        ArgumentNullException.ThrowIfNull(owner);
        ArgumentNullException.ThrowIfNull(document);
        ArgumentNullException.ThrowIfNull(destination);
        Validate(settings);
        if (!destination.CanWrite || destination.CanSeek && (destination.Position != 0 || destination.Length != 0))
            throw new ArgumentException("PDF output requires an empty writable stream.", nameof(destination));
        try
        {
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellation, owner.Closed);
            var layout = await OnOwnerAsync(owner, () => document.Paginate(settings), linked.Token).ConfigureAwait(false);
            if (layout.Status != PrintLayoutStatus.Ready || layout.PageCount <= 0)
                return LayoutFailure(layout);
            var pdf = new RasterPdf(destination, layout.PageCount, settings);
            WindowCapture? reusable = null;
            for (var index = 0; index < layout.PageCount; index++)
            {
                var result = await RenderPageAsync(owner, document, index, settings, reusable, linked.Token)
                    .ConfigureAwait(false);
                if (result.Status != OffscreenRenderStatus.Success || result.Capture == null)
                    return RenderFailure(result);
                reusable = result.Capture;
                pdf.AddPage(reusable, linked.Token);
            }
            linked.Token.ThrowIfCancellationRequested();
            pdf.Complete();
            return new(PrintStatus.Exported);
        }
        catch (OperationCanceledException) { return new(PrintStatus.Cancelled); }
        catch (IOException error) { return new(PrintStatus.Failed, Error: Detail(error.Message)); }
        catch (UnauthorizedAccessException error) { return new(PrintStatus.Failed, Error: Detail(error.Message)); }
        catch (OverflowException) { return new(PrintStatus.BudgetExceeded); }
    }

    internal static async Task<OffscreenRenderResult> RenderPageAsync(Window owner, IPrintDocument document,
        int index, PrintPageSettings settings, WindowCapture? reusable, CancellationToken cancellation)
    {
        Validate(settings);
        var width = settings.WidthPoints * settings.DpiX / PointsPerInch;
        var height = settings.HeightPoints * settings.DpiY / PointsPerInch;
        if (width > uint.MaxValue || height > uint.MaxValue || width * height > MaxPageBytes / 12.0)
            return new OffscreenRenderResult { Status = OffscreenRenderStatus.BudgetExceeded, Error = "The page exceeds 128 MiB." };
        var options = new OffscreenRenderOptions((float)(settings.WidthPoints * LogicalUnitsPerInch / PointsPerInch),
            (float)(settings.HeightPoints * LogicalUnitsPerInch / PointsPerInch),
            checked((uint)Math.Ceiling(width)), checked((uint)Math.Ceiling(height)), Color.Rgb(255, 255, 255), MaxPageBytes);
        var pending = await OnOwnerAsync(owner, () =>
            owner.RenderOffscreenAsync(document.CreatePage(index, settings), options, cancellation, reusable), cancellation)
            .ConfigureAwait(false);
        return await pending.ConfigureAwait(false);
    }

    internal static Task<T> OnOwnerAsync<T>(Window owner, Func<T> action, CancellationToken cancellation)
    {
        if (cancellation.IsCancellationRequested)
            return Task.FromCanceled<T>(cancellation);
        var ownerClosed = owner.Closed;
        if (ownerClosed.IsCancellationRequested)
            return Task.FromCanceled<T>(ownerClosed);
        var completion = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
        var claimed = 0;
        var registration = cancellation.Register(() => Cancel(cancellation));
        var closed = ownerClosed.Register(() => Cancel(ownerClosed));
        if (!owner.TryPost(() =>
        {
            if (Interlocked.CompareExchange(ref claimed, 1, 0) != 0)
                return;
            try { completion.TrySetResult(action()); }
            catch (Exception error) { completion.TrySetException(error); }
        }))
            Cancel(new CancellationToken(true));
        return CompleteAsync();

        void Cancel(CancellationToken token)
        {
            if (Interlocked.CompareExchange(ref claimed, 1, 0) == 0)
                completion.TrySetCanceled(token);
        }

        async Task<T> CompleteAsync()
        {
            try { return await completion.Task.ConfigureAwait(false); }
            finally { registration.Dispose(); closed.Dispose(); }
        }
    }

    internal static PrintResult RenderFailure(OffscreenRenderResult result) => new(result.Status switch
    {
        OffscreenRenderStatus.Busy => PrintStatus.Busy,
        OffscreenRenderStatus.NotReady => PrintStatus.NotReady,
        OffscreenRenderStatus.Unsupported => PrintStatus.Unsupported,
        OffscreenRenderStatus.BudgetExceeded => PrintStatus.BudgetExceeded,
        OffscreenRenderStatus.DeviceLost => PrintStatus.DeviceLost,
        OffscreenRenderStatus.Cancelled => PrintStatus.Cancelled,
        _ => PrintStatus.Failed
    }, Error: result.Error ?? "");

    internal static PrintResult LayoutFailure(PrintLayoutResult layout) => new(
        layout.Status == PrintLayoutStatus.Cancelled ? PrintStatus.Cancelled : PrintStatus.Failed,
        Error: string.IsNullOrEmpty(layout.Error) ? "The document has no printable pages." : Detail(layout.Error));

    internal static void Validate(PrintPageSettings settings)
    {
        if (!double.IsFinite(settings.WidthPoints) || !double.IsFinite(settings.HeightPoints) ||
            settings.WidthPoints <= 0 || settings.HeightPoints <= 0 || settings.DpiX <= 0 || settings.DpiY <= 0 ||
            !double.IsFinite(settings.LeftPoints) || !double.IsFinite(settings.RightPoints) ||
            !double.IsFinite(settings.TopPoints) || !double.IsFinite(settings.BottomPoints) ||
            settings.LeftPoints < 0 || settings.RightPoints < 0 || settings.TopPoints < 0 || settings.BottomPoints < 0 ||
            settings.LeftPoints + settings.RightPoints >= settings.WidthPoints ||
            settings.TopPoints + settings.BottomPoints >= settings.HeightPoints)
            throw new ArgumentOutOfRangeException(nameof(settings));
    }

    internal static string Detail(string message) => message.Length <= 512 ? message : message[..512];

    private static PrintStatus MapOwner(NativeDialogOwnerStatus status) => status switch
    {
        NativeDialogOwnerStatus.Busy => PrintStatus.Busy,
        NativeDialogOwnerStatus.NotReady or NativeDialogOwnerStatus.Closed => PrintStatus.NotReady,
        NativeDialogOwnerStatus.Cancelled => PrintStatus.Cancelled,
        NativeDialogOwnerStatus.Unsupported => PrintStatus.Unsupported,
        _ => PrintStatus.Failed
    };
}
