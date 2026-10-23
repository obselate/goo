namespace Goo.RichText;

/// <summary>Binds HTML and RTF clipboard commands to one editor and its persistent style layer.</summary>
public sealed class RichTextClipboard : IDisposable
{
    private static readonly string[] RichTypes = ["text/html", "text/rtf", "application/rtf", "text/plain;charset=utf-8", "text/plain"];
    private static readonly string[] PlainTypes = ["text/plain;charset=utf-8", "text/plain"];
    private readonly Window owner;
    private readonly TextEditorController controller;
    private readonly TextPresentationLayer layer;
    private readonly Action<TextCommandEvent>? previous;
    private readonly Action<TextCommandEvent> interceptor;
    private readonly int threadId = Environment.CurrentManagedThreadId;
    private readonly CancellationTokenSource lifetime = new();
    private bool readOnly;
    private bool disposed;
    private bool applying;
    private int generation;
    private bool checking;
    private bool interceptAllowed;

    /// <summary>Installs a command interceptor. Add the supplied persistent layer to TextEditor.Layers.</summary>
    public RichTextClipboard(Window owner, TextEditorController controller, TextPresentationLayer layer)
    {
        ArgumentNullException.ThrowIfNull(owner);
        ArgumentNullException.ThrowIfNull(controller);
        ArgumentNullException.ThrowIfNull(layer);
        if (!ReferenceEquals(layer.Document, controller.Document))
            throw new ArgumentException("The layer belongs to another document.", nameof(layer));
        this.owner = owner;
        this.controller = controller;
        this.layer = layer;
        previous = controller.OnCommand;
        interceptor = Intercept;
        controller.OnCommand = interceptor;
    }

    /// <summary>Disables Cut and Paste. Set this with TextEditor.ReadOnly.</summary>
    public bool ReadOnly
    {
        get => readOnly;
        set { RequireOwner(); if (readOnly != value) { readOnly = value; generation++; } }
    }

    /// <summary>Reports commands started by the editor shortcut interceptor, on the owner thread.</summary>
    public event Action<RichTextResult>? Completed;

    /// <summary>Publishes the selected source text and persistent inline styles.</summary>
    public Task<RichTextResult> CopyAsync(CancellationToken cancellation = default) => RunAsync(TextCommandKind.Copy, false, true, cancellation);
    /// <summary>Publishes Copy intent and deletes only after success while the captured editor state still matches.</summary>
    public Task<RichTextResult> CutAsync(CancellationToken cancellation = default) => RunAsync(TextCommandKind.Cut, false, true, cancellation);
    /// <summary>Pastes supported rich content, or plain text only when no rich format is present.</summary>
    public Task<RichTextResult> PasteAsync(CancellationToken cancellation = default) => RunAsync(TextCommandKind.Paste, false, true, cancellation);
    /// <summary>Pastes only the plain-text representation by explicit caller choice.</summary>
    public Task<RichTextResult> PastePlainTextAsync(CancellationToken cancellation = default) => RunAsync(TextCommandKind.Paste, true, true, cancellation);

    /// <summary>Cancels pending commands and restores the previous interceptor if this binding still owns it.</summary>
    public void Dispose()
    {
        if (disposed) return;
        RequireOwner();
        disposed = true;
        lifetime.Cancel();
        lifetime.Dispose();
        if (controller.OnCommand == interceptor) controller.OnCommand = previous;
    }

    private void Intercept(TextCommandEvent command)
    {
        if (applying) return;
        previous?.Invoke(command);
        if (checking)
        {
            interceptAllowed = !command.Cancel;
            command.Cancel = true;
            return;
        }
        if (command.Command.Kind == TextCommandKind.Paste && command.Command.Text != null) return;
        if (command.Cancel || disposed || command.Command.Kind is not (TextCommandKind.Copy or TextCommandKind.Cut or TextCommandKind.Paste)) return;
        command.Cancel = true;
        _ = ObserveAsync(RunAsync(command.Command.Kind, false, false, CancellationToken.None));
    }

    private async Task ObserveAsync(Task<RichTextResult> pending)
    {
        RichTextResult result;
        try { result = await pending.ConfigureAwait(false); }
        catch (Exception error) { result = RichTextCodec.Failure(RichTextStatus.Failed, error.Message); }
        try { await OnOwnerAsync(() => { if (!disposed) Completed?.Invoke(result); return true; }, owner.Closed).ConfigureAwait(false); }
        catch (OperationCanceledException) { }
    }

    private async Task<RichTextResult> RunAsync(TextCommandKind kind, bool plain, bool intercept, CancellationToken cancellation)
    {
        RequireOwner();
        if (intercept)
        {
            checking = true;
            interceptAllowed = false;
            try { controller.Execute(new TextCommand(kind, "", false)); }
            finally { checking = false; }
            if (!interceptAllowed) return RichTextCodec.Failure(RichTextStatus.Cancelled);
        }
        if (kind != TextCommandKind.Copy && readOnly) return RichTextCodec.Failure(RichTextStatus.ReadOnly);
        var snapshot = controller.Document.Snapshot();
        var selection = controller.Selection;
        var revision = layer.Revision;
        var capturedGeneration = generation;
        var composition = controller.Composition;
        var start = Math.Min(selection.Anchor.Offset, selection.Active.Offset);
        var range = new TextRange(start, Math.Abs(selection.Active.Offset - selection.Anchor.Offset));
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellation, lifetime.Token, owner.Closed);
        try
        {
            linked.Token.ThrowIfCancellationRequested();
            if (kind is TextCommandKind.Copy or TextCommandKind.Cut)
            {
                if (range.Length == 0) return RichTextCodec.Failure(RichTextStatus.Empty);
                var selected = Capture(snapshot, range);
                var publication = RichTextCodec.Write(selected);
                var written = await owner.WriteClipboardAsync(publication, ClipboardIntent.Copy).WaitAsync(linked.Token).ConfigureAwait(false);
                if (written.Status != DataTransferStatus.Success) return RichTextCodec.Failure(Map(written.Status), written.Error);
                if (kind == TextCommandKind.Copy) return new(RichTextStatus.Success, selected);
                return await OnOwnerAsync(() =>
                {
                    if (!Current()) return new RichTextResult(RichTextStatus.Stale, selected);
                    if (readOnly) return new RichTextResult(RichTextStatus.ReadOnly, selected);
                    return Apply("", Array.Empty<TextStyleSpan>()) ? new(RichTextStatus.Success, selected) : new(RichTextStatus.Cancelled, selected);
                }, linked.Token).ConfigureAwait(false);
            }
            var data = await owner.ReadClipboardDataAsync(plain ? PlainTypes : RichTypes).WaitAsync(linked.Token).ConfigureAwait(false);
            if (data.Status != ClipboardReadStatus.Success) return RichTextCodec.Failure(Map(data.Status), data.Error);
            RichTextResult decoded = RichTextCodec.Failure(RichTextStatus.Empty);
            foreach (var type in plain ? PlainTypes : RichTypes)
            {
                var representation = data.Data.Representations.FirstOrDefault(item => item.ContentType.Equals(type, StringComparison.OrdinalIgnoreCase));
                if (representation == null) continue;
                decoded = RichTextCodec.Read(representation.ContentType, representation.Bytes);
                break;
            }
            if (decoded.Status is not (RichTextStatus.Success or RichTextStatus.PlainText)) return decoded;
            return await OnOwnerAsync(() =>
            {
                if (!Current()) return decoded with { Status = RichTextStatus.Stale };
                if (readOnly) return decoded with { Status = RichTextStatus.ReadOnly };
                return Apply(decoded.Fragment.Text, decoded.Fragment.Styles) ? decoded : decoded with { Status = RichTextStatus.Cancelled };
            }, linked.Token).ConfigureAwait(false);
        }
        catch (OperationCanceledException) { return RichTextCodec.Failure(RichTextStatus.Cancelled); }
        catch (RichLimitException) { return RichTextCodec.Failure(RichTextStatus.TooLarge); }
        catch (UnsupportedContentException error) { return RichTextCodec.Failure(RichTextStatus.UnsupportedContent, error.Message); }
        catch (FormatException error) { return RichTextCodec.Failure(RichTextStatus.Failed, error.Message); }
        catch (IOException error) { return RichTextCodec.Failure(RichTextStatus.Failed, error.Message); }

        bool Current() => !disposed && snapshot.Version == controller.Document.Version &&
            selection.Equals(controller.Selection) && revision == layer.Revision && capturedGeneration == generation &&
            Equals(composition, controller.Composition);
    }

    private RichTextFragment Capture(TextSnapshot snapshot, TextRange range)
    {
        if (range.Length > RichInput.MaxText) throw new RichLimitException();
        var spans = new List<TextStyleSpan>();
        foreach (var span in layer.GetStyles())
        {
            var start = Math.Max(range.Start, span.Range.Start);
            var end = Math.Min(range.Start + range.Length, span.Range.Start + span.Range.Length);
            if (start < end) spans.Add(new(span.Key, new TextRange(start - range.Start, end - start), span.Style));
        }
        if (spans.Count > RichInput.MaxStyles) throw new RichLimitException();
        return new(snapshot.GetText(range), spans);
    }

    private bool Apply(string text, IReadOnlyList<TextStyleSpan> styles)
    {
        applying = true;
        try { return controller.ReplaceSelection(layer, text, styles); }
        finally { applying = false; }
    }

    private Task<T> OnOwnerAsync<T>(Func<T> action, CancellationToken cancellation)
    {
        var completion = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
        var claimed = 0;
        var registration = cancellation.Register(() =>
        {
            if (Interlocked.CompareExchange(ref claimed, 1, 0) == 0) completion.TrySetCanceled(cancellation);
        });
        if (!owner.TryPost(() =>
        {
            if (Interlocked.CompareExchange(ref claimed, 1, 0) != 0) return;
            try { completion.TrySetResult(action()); }
            catch (Exception error) { completion.TrySetException(error); }
        })) completion.TrySetCanceled(new CancellationToken(true));
        return FinishAsync();
        async Task<T> FinishAsync()
        {
            try { return await completion.Task.ConfigureAwait(false); }
            finally { registration.Dispose(); }
        }
    }

    private void RequireOwner()
    {
        ObjectDisposedException.ThrowIf(disposed, this);
        if (threadId != Environment.CurrentManagedThreadId) throw new InvalidOperationException("Use the rich clipboard binding on its owner thread.");
    }

    private static RichTextStatus Map(DataTransferStatus status) => status switch
    {
        DataTransferStatus.Cancelled => RichTextStatus.Cancelled,
        DataTransferStatus.Unsupported => RichTextStatus.Unsupported,
        DataTransferStatus.TooLarge => RichTextStatus.TooLarge,
        _ => RichTextStatus.Failed
    };
    private static RichTextStatus Map(ClipboardReadStatus status) => status switch
    {
        ClipboardReadStatus.Empty => RichTextStatus.Empty,
        ClipboardReadStatus.Unsupported => RichTextStatus.Unsupported,
        ClipboardReadStatus.TooLarge => RichTextStatus.TooLarge,
        _ => RichTextStatus.Failed
    };
}
