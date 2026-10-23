using Android.App;
using Android.Content;
using Android.OS;
using Android.Print;
using Android.Runtime;
using OperationCanceledException = System.OperationCanceledException;

namespace Goo.Printing;

/// <summary>Shows Android's print UI from an Activity and writes requested pages as raster PDF.</summary>
public sealed class AndroidPrinting
{
    private readonly Activity activity;

    /// <summary>Creates an optional adapter for the Activity that owns the Goo view.</summary>
    public AndroidPrinting(Activity activity)
    {
        ArgumentNullException.ThrowIfNull(activity);
        this.activity = activity;
    }

    /// <summary>Starts printing on the Android main thread. Keep the Goo owner active until the result completes.</summary>
    public Task<PrintResult> ShowDialogAsync(Window owner, IPrintDocument document, string title,
        CancellationToken cancellation = default)
    {
        ArgumentNullException.ThrowIfNull(owner);
        ArgumentNullException.ThrowIfNull(document);
        ArgumentException.ThrowIfNullOrWhiteSpace(title);
        if (Looper.MyLooper() != Looper.MainLooper)
            throw new InvalidOperationException("Start Android printing on the main thread.");
        if (cancellation.IsCancellationRequested)
            return Task.FromResult(new PrintResult(PrintStatus.Cancelled));
        if (activity.IsDestroyed || activity.IsFinishing || owner.Closed.IsCancellationRequested)
            return Task.FromResult(new PrintResult(PrintStatus.NotReady));
        var manager = activity.GetSystemService(Context.PrintService) as PrintManager;
        if (manager == null)
            return Task.FromResult(new PrintResult(PrintStatus.Unsupported));
        var adapter = new DocumentAdapter(owner, document, title, cancellation);
        try
        {
            adapter.Job = manager.Print(title, adapter, null);
            if (adapter.Job == null)
            {
                adapter.Release();
                return Task.FromResult(new PrintResult(PrintStatus.Failed, Error: "Android did not create a print job."));
            }
            adapter.CheckCancellation();
            return adapter.Result.Task;
        }
        catch (Java.Lang.IllegalStateException error)
        {
            adapter.Release();
            return Task.FromResult(new PrintResult(PrintStatus.NotReady, Error: Printing.Detail(error.Message ?? "")));
        }
        finally { manager.Dispose(); }
    }

    private sealed class DocumentAdapter : PrintDocumentAdapter
    {
        private readonly Window owner;
        private readonly IPrintDocument document;
        private readonly string title;
        private readonly Handler handler = new(Looper.MainLooper!);
        private readonly CancellationTokenSource lifetime;
        private readonly CancellationTokenRegistration cancellation;
        private PrintPageSettings settings;
        private int pageCount;
        private int layoutGeneration;
        private bool finished;
        private bool released;
        private PrintResult? failure;
        internal PrintJob? Job;
        internal readonly TaskCompletionSource<PrintResult> Result = new(TaskCreationOptions.RunContinuationsAsynchronously);

        internal DocumentAdapter(Window owner, IPrintDocument document, string title, CancellationToken cancellation)
        {
            this.owner = owner;
            this.document = document;
            this.title = title;
            lifetime = CancellationTokenSource.CreateLinkedTokenSource(cancellation, owner.Closed);
            this.cancellation = lifetime.Token.Register(() => handler.Post(CheckCancellation));
        }

        public override void OnLayout(PrintAttributes? oldAttributes, PrintAttributes? newAttributes,
            CancellationSignal? cancellationSignal, LayoutResultCallback? callback, Bundle? extras)
        {
            ArgumentNullException.ThrowIfNull(callback);
            if (finished || lifetime.IsCancellationRequested || cancellationSignal?.IsCanceled == true)
            {
                callback.OnLayoutCancelled();
                return;
            }
            try
            {
                using var media = newAttributes?.GetMediaSize();
                using var margins = newAttributes?.MinMargins;
                using var resolution = newAttributes?.GetResolution();
                if (media == null)
                {
                    callback.OnLayoutFailed("Choose a paper size.");
                    return;
                }
                const double pointsPerMil = 72.0 / 1000;
                var next = new PrintPageSettings(media.WidthMils * pointsPerMil, media.HeightMils * pointsPerMil,
                    (margins?.LeftMils ?? 0) * pointsPerMil, (margins?.TopMils ?? 0) * pointsPerMil,
                    (margins?.RightMils ?? 0) * pointsPerMil, (margins?.BottomMils ?? 0) * pointsPerMil,
                    Math.Min(resolution?.HorizontalDpi ?? 300, 300), Math.Min(resolution?.VerticalDpi ?? 300, 300));
                Printing.Validate(next);
                var layout = document.Paginate(next);
                if (cancellationSignal?.IsCanceled == true || layout.Status == PrintLayoutStatus.Cancelled)
                {
                    callback.OnLayoutCancelled();
                    return;
                }
                if (layout.Status != PrintLayoutStatus.Ready || layout.PageCount <= 0)
                {
                    failure = Printing.LayoutFailure(layout);
                    callback.OnLayoutFailed(failure.Error);
                    return;
                }
                var changed = next != settings || pageCount != layout.PageCount;
                settings = next;
                pageCount = layout.PageCount;
                failure = null;
                layoutGeneration++;
                using var builder = new PrintDocumentInfo.Builder(title + ".pdf");
                builder.SetContentType(PrintContentType.Document);
                builder.SetPageCount(pageCount);
                using var info = builder.Build();
                callback.OnLayoutFinished(info, changed);
            }
            catch (OperationCanceledException) { callback.OnLayoutCancelled(); }
            catch (Exception error)
            {
                failure = new(PrintStatus.Failed, Error: Printing.Detail(error.Message));
                callback.OnLayoutFailed(failure.Error);
            }
        }

        public override void OnWrite(PageRange[]? pages, ParcelFileDescriptor? destination,
            CancellationSignal? cancellationSignal, WriteResultCallback? callback)
        {
            ArgumentNullException.ThrowIfNull(callback);
            ArgumentNullException.ThrowIfNull(destination);
            ArgumentNullException.ThrowIfNull(cancellationSignal);
            if (finished)
            {
                destination.Close();
                callback.OnWriteCancelled();
                return;
            }
            _ = WriteAsync(pages ?? [], destination, cancellationSignal, callback, settings, pageCount, layoutGeneration);
        }

        private async Task WriteAsync(PageRange[] pages, ParcelFileDescriptor destination,
            CancellationSignal signal, WriteResultCallback callback, PrintPageSettings pageSettings, int count, int generation)
        {
            using var cancelled = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
            using var listener = new CancelListener(cancelled);
            PrintResult? renderFailure = null;
            PrintResult? outcome = null;
            PageRange[] completed = [];
            try
            {
                signal.SetOnCancelListener(listener);
                if (signal.IsCanceled || finished)
                    cancelled.Cancel();
                var selected = new List<int>();
                var written = new List<PageRange>();
                foreach (var range in pages)
                {
                    var first = Math.Max(0, range.Start);
                    var last = Math.Min(count - 1, range.End);
                    if (first > last)
                        continue;
                    written.Add(new PageRange(first, last));
                    for (var page = first; page <= last; page++)
                        selected.Add(page);
                }
                if (selected.Count == 0)
                    throw new IOException("No requested page exists in the document.");
                using var nativeStream = new ParcelFileDescriptor.AutoCloseOutputStream(destination);
                using var output = new OutputStreamInvoker(nativeStream);
                var pdf = new RasterPdf(output, selected.Count, pageSettings);
                WindowCapture? reusable = null;
                foreach (var page in selected)
                {
                    cancelled.Token.ThrowIfCancellationRequested();
                    if (finished || generation != Volatile.Read(ref layoutGeneration))
                        throw new OperationCanceledException(cancelled.Token);
                    var rendered = await Printing.RenderPageAsync(owner, document, page, pageSettings, reusable,
                        cancelled.Token).ConfigureAwait(false);
                    if (rendered.Status != OffscreenRenderStatus.Success || rendered.Capture == null)
                    {
                        renderFailure = Printing.RenderFailure(rendered);
                        throw new IOException(renderFailure.Error.Length == 0 ? renderFailure.Status.ToString() : renderFailure.Error);
                    }
                    reusable = rendered.Capture;
                    pdf.AddPage(reusable, cancelled.Token);
                }
                pdf.Complete();
                completed = written.ToArray();
            }
            catch (OperationCanceledException)
            {
                outcome = new(PrintStatus.Cancelled);
            }
            catch (Exception error)
            {
                outcome = renderFailure ?? new(PrintStatus.Failed, Error: Printing.Detail(error.Message));
            }
            finally
            {
                try
                {
                    try { signal.SetOnCancelListener(null); }
                    finally { destination.Close(); }
                }
                catch (Exception error)
                {
                    outcome ??= new(PrintStatus.Failed, Error: Printing.Detail(error.Message));
                }
            }
            handler.Post(() =>
            {
                if (outcome == null)
                    callback.OnWriteFinished(completed);
                else if (outcome.Status == PrintStatus.Cancelled)
                    callback.OnWriteCancelled();
                else
                {
                    failure = outcome;
                    callback.OnWriteFailed(outcome.Error);
                }
            });
        }

        public override void OnFinish()
        {
            finished = true;
            ObserveJob();
        }

        internal void CheckCancellation()
        {
            if (released || !lifetime.IsCancellationRequested)
                return;
            Job?.Cancel();
            if (Job?.IsCompleted == true || Job?.IsQueued == true || Job?.IsStarted == true || Job?.IsBlocked == true)
                Result.TrySetResult(new(PrintStatus.Submitted, Job.Id?.ToString() ?? ""));
            else
                Result.TrySetResult(new(PrintStatus.Cancelled));
        }

        private void ObserveJob()
        {
            if (released)
                return;
            if (Job?.IsQueued == true || Job?.IsStarted == true || Job?.IsBlocked == true || Job?.IsCompleted == true)
                Result.TrySetResult(new(PrintStatus.Submitted, Job.Id?.ToString() ?? ""));
            else if (Job?.IsCancelled == true)
                Result.TrySetResult(failure ?? new(PrintStatus.Cancelled));
            else if (Job?.IsFailed == true)
                Result.TrySetResult(failure ?? new(PrintStatus.Failed));
            else if (!Result.Task.IsCompleted)
            {
                handler.PostDelayed(ObserveJob, 100);
                return;
            }
            Release();
        }

        internal void Release()
        {
            if (released)
                return;
            released = true;
            cancellation.Dispose();
            lifetime.Dispose();
            Job?.Dispose();
            Job = null;
        }
    }

    private sealed class CancelListener(CancellationTokenSource cancellation) : Java.Lang.Object,
        CancellationSignal.IOnCancelListener
    {
        public void OnCancel() => cancellation.Cancel();
    }
}
