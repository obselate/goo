package Goo.Printing

import Android.App
import Android.Content
import Android.OS
import Android.Print
import Android.Runtime
import Goo
import Java.Lang
import OperationCanceledException = System.OperationCanceledException
import System
import System.Collections.Generic
import System.IO
import System.Threading
import System.Threading.Tasks
import SystemException_2 = System.Exception
import SystemMath = System.Math

/// Shows Android's print UI from an Activity and writes requested pages as raster PDF.
class AndroidPrinting {
    private let activity Activity

    /// Creates an optional adapter for the Activity that owns the Goo view.
    init(activity Activity) {
        ArgumentNullException.ThrowIfNull(activity, paramName: "activity")
        this.activity = activity
    }

    /// Starts printing on the Android main thread. Keep the Goo owner active until the result completes.
    func ShowDialogAsync(
        owner Window,
        document IPrintDocument,
        title string,
        cancellation CancellationToken = default(CancellationToken)
    ) Task[PrintResult] {
        ArgumentNullException.ThrowIfNull(owner, paramName: "owner")
        ArgumentNullException.ThrowIfNull(document, paramName: "document")
        ArgumentException.ThrowIfNullOrWhiteSpace(title, paramName: "title")
        if Looper.MyLooper() != Looper.MainLooper {
            throw InvalidOperationException("Start Android printing on the main thread.")
        }
        if cancellation.IsCancellationRequested {
            return Task.FromResult(PrintResult(PrintStatus.Cancelled))
        }
        if activity.IsDestroyed || activity.IsFinishing || owner.Closed.IsCancellationRequested {
            return Task.FromResult(PrintResult(PrintStatus.NotReady))
        }
        let manager PrintManager? = activity.GetSystemService(Context.PrintService) as PrintManager
        if manager == nil {
            return Task.FromResult(PrintResult(PrintStatus.Unsupported))
        }
        let adapter = DocumentAdapter(owner, document, title, cancellation)
        try {
            adapter.Job = manager.Print(title, adapter, nil)
            if adapter.Job == nil {
                adapter.Release()
                return Task.FromResult(PrintResult(PrintStatus.Failed, Error: "Android did not create a print job."))
            }
            adapter.CheckCancellation()
            return adapter.Result.Task
        } catch (error IllegalStateException) {
            adapter.Release()
            return Task.FromResult(PrintResult(PrintStatus.NotReady, Error: Printing.Detail(error.Message ?? "")))
        } finally {
            manager.Dispose()
        }
    }

    private class DocumentAdapter : PrintDocumentAdapter {
        private let owner Window
        private let document IPrintDocument
        private let title string
        private let handler Handler = Handler(Looper.MainLooper!!)
        private let lifetime CancellationTokenSource
        private let cancellation CancellationTokenRegistration
        private var settings PrintPageSettings
        private var pageCount int32
        private var layoutGeneration int32
        private var finished bool
        private var released bool
        private var failure PrintResult?
        internal var Job PrintJob?
        internal let Result TaskCompletionSource[PrintResult] = TaskCompletionSource[PrintResult](
            TaskCreationOptions.RunContinuationsAsynchronously
        )

        internal init(owner Window, document IPrintDocument, title string, cancellation CancellationToken) {
            this.owner = owner
            this.document = document
            this.title = title
            lifetime = CancellationTokenSource.CreateLinkedTokenSource(cancellation, owner.Closed)
            this.cancellation = lifetime.Token.Register(() -> handler.Post(CheckCancellation))
        }

        override func OnLayout(
            oldAttributes PrintAttributes?,
            newAttributes PrintAttributes?,
            cancellationSignal CancellationSignal?,
            callback PrintDocumentAdapter.LayoutResultCallback?,
            extras Bundle?
        ) {
            ArgumentNullException.ThrowIfNull(callback, paramName: "callback")
            if finished || lifetime.IsCancellationRequested || cancellationSignal?.IsCanceled == true {
                callback!!.OnLayoutCancelled()
                return
            }
            try {
                using let media PrintAttributes.MediaSize? = newAttributes?.GetMediaSize()
                using let margins = newAttributes?.MinMargins
                using let resolution = newAttributes?.GetResolution()
                if media == nil {
                    callback!!.OnLayoutFailed("Choose a paper size.")
                    return
                }
                const pointsPerMil = 72.0 / float64(1000.0)
                let next = PrintPageSettings{
                    WidthPoints: float64(media.WidthMils) * pointsPerMil,
                    HeightPoints: float64(media.HeightMils) * pointsPerMil,
                    LeftPoints: float64(margins?.LeftMils ?? 0) * pointsPerMil,
                    TopPoints: float64(margins?.TopMils ?? 0) * pointsPerMil,
                    RightPoints: float64(margins?.RightMils ?? 0) * pointsPerMil,
                    BottomPoints: float64(margins?.BottomMils ?? 0) * pointsPerMil,
                    DpiX: SystemMath.Min(resolution?.HorizontalDpi ?? 300, 300),
                    DpiY: SystemMath.Min(resolution?.VerticalDpi ?? 300, 300)
                }
                Printing.Validate(next)
                var layout = document.Paginate(next)
                if cancellationSignal?.IsCanceled == true || layout.Status == PrintLayoutStatus.Cancelled {
                    callback!!.OnLayoutCancelled()
                    return
                }
                if layout.Status != PrintLayoutStatus.Ready || layout.PageCount <= 0 {
                    failure = Printing.LayoutFailure(layout)
                    callback!!.OnLayoutFailed(failure!!.Error)
                    return
                }
                let changed = next != settings || pageCount != layout.PageCount
                settings = next
                pageCount = layout.PageCount
                failure = nil
                layoutGeneration++
                using let builder = PrintDocumentInfo.Builder(title + ".pdf")
                builder.SetContentType(PrintContentType.Document)
                builder.SetPageCount(pageCount)
                using let info = builder.Build()
                callback!!.OnLayoutFinished(info, changed)
            } catch (OperationCanceledException) {
                callback!!.OnLayoutCancelled()
            } catch (error SystemException_2) {
                failure = PrintResult(PrintStatus.Failed, Error: Printing.Detail(error.Message))
                callback!!.OnLayoutFailed(failure!!.Error)
            }
        }

        override func OnWrite(
            pages[]?PageRange,
            destination ParcelFileDescriptor?,
            cancellationSignal CancellationSignal?,
            callback PrintDocumentAdapter.WriteResultCallback?
        ) {
            ArgumentNullException.ThrowIfNull(callback, paramName: "callback")
            ArgumentNullException.ThrowIfNull(destination, paramName: "destination")
            ArgumentNullException.ThrowIfNull(cancellationSignal, paramName: "cancellationSignal")
            if finished {
                destination!!.Close()
                callback!!.OnWriteCancelled()
                return
            }
            let _ = WriteAsync(
                pages ?? System.Array.Empty[PageRange](),
                destination!!,
                cancellationSignal!!,
                callback!!,
                settings,
                pageCount,
                layoutGeneration
            )
        }

        private async func WriteAsync(
            pages[]PageRange,
            destination ParcelFileDescriptor,
            signal CancellationSignal,
            callback PrintDocumentAdapter.WriteResultCallback,
            pageSettings PrintPageSettings,
            count int32,
            generation int32
        ) {
            using let cancelled = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token)
            using let listener = CancelListener(cancelled)
            var renderFailure PrintResult? = nil
            var outcome PrintResult? = nil
            var completed[]PageRange = System.Array.Empty[PageRange]()
            try {
                signal.SetOnCancelListener(listener)
                if signal.IsCanceled || finished {
                    cancelled.Cancel()
                }
                let selected = List[int32]()
                let written = List[PageRange]()
                for range_ in pages {
                    let first = SystemMath.Max(0, range_.Start)
                    let last = SystemMath.Min(count - 1, range_.End)
                    if first > last {
                        continue
                    }
                    written.Add(PageRange(first, last))
                    for var page = first; page <= last; page++ {
                        selected.Add(page)
                    }
                }
                if selected.Count == 0 {
                    throw IOException("No requested page exists in the document.")
                }
                using let nativeStream = ParcelFileDescriptor.AutoCloseOutputStream(destination)
                using let output = OutputStreamInvoker(nativeStream)
                let pdf = RasterPdf(output, selected.Count, pageSettings)
                var reusable WindowCapture? = nil
                for page in selected {
                    cancelled.Token.ThrowIfCancellationRequested()
                    if finished || generation != Volatile.Read(&layoutGeneration) {
                        throw OperationCanceledException(cancelled.Token)
                    }
                    var rendered = await Printing.RenderPageAsync(
                        owner,
                        document,
                        page,
                        pageSettings,
                        reusable,
                        cancelled.Token
                    )
                        .ConfigureAwait(false)
                    if rendered.Status != OffscreenRenderStatus.Success || rendered.Capture == nil {
                        renderFailure = Printing.RenderFailure(rendered)
                        throw IOException(
                            if renderFailure.Error.Length == 0 {
                                renderFailure.Status.ToString()
                            } else {
                                renderFailure.Error
                            }
                        )
                    }
                    reusable = rendered.Capture
                    pdf.AddPage(reusable!!, cancelled.Token)
                }
                pdf.Complete()
                completed = written.ToArray()
            } catch (OperationCanceledException) {
                outcome = PrintResult(PrintStatus.Cancelled)
            } catch (error SystemException_2) {
                outcome = renderFailure ?? PrintResult(PrintStatus.Failed, Error: Printing.Detail(error.Message))
            } finally {
                try {
                    try {
                        signal.SetOnCancelListener(nil)
                    } finally {
                        destination.Close()
                    }
                } catch (error SystemException_2) {
                    outcome ??= PrintResult(PrintStatus.Failed, Error: Printing.Detail(error.Message))
                }
            }
            handler.Post(
                () -> {
                    if outcome == nil {
                        callback.OnWriteFinished(completed)
                    } else if outcome.Status == PrintStatus.Cancelled {
                        callback.OnWriteCancelled()
                    } else {
                        failure = outcome
                        callback.OnWriteFailed(outcome.Error)
                    }
                }
            )
        }

        override func OnFinish() {
            finished = true
            ObserveJob()
        }

        internal func CheckCancellation() {
            if released || !lifetime.IsCancellationRequested {
                return
            }
            Job?.Cancel()
            if Job?.IsCompleted == true || Job?.IsQueued == true || Job?.IsStarted == true || Job?.IsBlocked == true {
                Result.TrySetResult(PrintResult(PrintStatus.Submitted, Job!!.Id?.ToString() ?? ""))
            } else {
                Result.TrySetResult(PrintResult(PrintStatus.Cancelled))
            }
        }

        private func ObserveJob() {
            if released {
                return
            }
            if Job?.IsQueued == true || Job?.IsStarted == true || Job?.IsBlocked == true || Job?.IsCompleted == true {
                Result.TrySetResult(PrintResult(PrintStatus.Submitted, Job!!.Id?.ToString() ?? ""))
            } else if Job?.IsCancelled == true {
                Result.TrySetResult(failure ?? PrintResult(PrintStatus.Cancelled))
            } else if Job?.IsFailed == true {
                Result.TrySetResult(failure ?? PrintResult(PrintStatus.Failed))
            } else if !Result.Task.IsCompleted {
                handler.PostDelayed(ObserveJob, 100)
                return
            }
            Release()
        }

        internal func Release() {
            if released {
                return
            }
            released = true
            cancellation.Dispose()
            lifetime.Dispose()
            Job?.Dispose()
            Job = nil
        }
    }

    private class CancelListener(cancellation CancellationTokenSource) : Java
        .Lang
        .Object,
    CancellationSignal.IOnCancelListener {
        func OnCancel() -> cancellation.Cancel()
    }
}
