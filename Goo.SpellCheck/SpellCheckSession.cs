namespace Goo.SpellCheck;

/// <summary>Maintains an optional misspelling layer and explicit suggestion commands on the owner thread.</summary>
public sealed class SpellCheckSession : IDisposable
{
    private const int CheckDelayMilliseconds = 200;
    private readonly Window owner;
    private readonly TextEditorController controller;
    private readonly ISpellingService service;
    private readonly int threadId = Environment.CurrentManagedThreadId;
    private readonly List<Misspelling> errors = [];
    private readonly CancellationTokenSource lifetime = new();
    private CancellationTokenSource? pending;
    private TextRange? pendingRange;
    private string language;
    private int languageGeneration;
    private bool disposed;

    /// <summary>Creates a session. Add Layer after persistent formatting in TextEditor.Layers.</summary>
    public SpellCheckSession(Window owner, TextEditorController controller, ISpellingService service, string language)
    {
        ArgumentNullException.ThrowIfNull(owner);
        ArgumentNullException.ThrowIfNull(controller);
        ArgumentNullException.ThrowIfNull(service);
        this.owner = owner;
        this.controller = controller;
        this.service = service;
        this.language = SpellingInput.Validate(controller.Document.Snapshot(), default, language);
        Layer = new TextPresentationLayer(controller.Document);
        controller.Document.Changed += OnDocumentChanged;
    }

    /// <summary>The transient spelling layer. This session owns and disposes it.</summary>
    public TextPresentationLayer Layer { get; }

    /// <summary>Disables applying suggestions without disabling read-only checking.</summary>
    public bool ReadOnly { get; set; }

    /// <summary>The explicit BCP 47 language. Changing it cancels and clears old diagnoses.</summary>
    public string Language
    {
        get => language;
        set
        {
            RequireOwnerThread();
            var next = SpellingInput.Validate(controller.Document.Snapshot(), default, value);
            if (next == language)
                return;
            language = next;
            languageGeneration++;
            pending?.Cancel();
            errors.Clear();
            Layer.Clear();
        }
    }

    /// <summary>Reports completed automatic or explicit checks on the owner thread.</summary>
    public event Action<SpellingResult>? Updated;

    /// <summary>Checks a source range and discards stale results.</summary>
    public async Task<SpellingResult> CheckAsync(TextRange range, CancellationToken cancellation = default)
    {
        RequireOwnerThread();
        var snapshot = controller.Document.Snapshot();
        var requestedLanguage = language;
        var generation = languageGeneration;
        SpellingInput.Validate(snapshot, range, requestedLanguage);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token, owner.Closed, cancellation);
        var result = new SpellingResult(SpellingStatus.Cancelled, snapshot.Version, requestedLanguage, []);
        try
        {
            result = await service.CheckAsync(snapshot, range, requestedLanguage, linked.Token).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (linked.IsCancellationRequested)
        {
        }
        var completion = new TaskCompletionSource<SpellingResult>(TaskCreationOptions.RunContinuationsAsynchronously);
        var token = linked.Token;
        using var registration = token.Register(() => completion.TrySetResult(
            result with { Status = SpellingStatus.Cancelled, Errors = Array.Empty<Misspelling>() }));
        if (!owner.TryPost(() =>
        {
            if (disposed || token.IsCancellationRequested)
                result = result with { Status = SpellingStatus.Cancelled, Errors = Array.Empty<Misspelling>() };
            else if (snapshot.Version != controller.Document.Version || generation != languageGeneration)
                result = result with { Status = SpellingStatus.Stale, Errors = Array.Empty<Misspelling>() };
            else if (result.Status == SpellingStatus.Success)
            {
                errors.RemoveAll(error => Overlaps(error.Range, range));
                foreach (var error in result.Errors)
                {
                    if (error.Range.Start < range.Start || error.Range.Length <= 0 ||
                        (long)error.Range.Start + error.Range.Length > (long)range.Start + range.Length ||
                        snapshot.GetText(error.Range) != error.Word)
                        continue;
                    if (controller.Composition is { } composition && Overlaps(error.Range, composition.Range))
                        continue;
                    errors.Add(error);
                }
                if (pendingRange is { } dirty && range.Start <= dirty.Start &&
                    (long)range.Start + range.Length >= (long)dirty.Start + dirty.Length)
                    pendingRange = null;
                PublishLayer();
            }
            completion.TrySetResult(result);
            if (!disposed)
                Updated?.Invoke(result);
        }))
            return result with { Status = SpellingStatus.Disabled, Errors = Array.Empty<Misspelling>() };
        return await completion.Task.ConfigureAwait(false);
    }

    /// <summary>Gets suggestions for the misspelling at a source position without moving the selection.</summary>
    public async Task<SpellingSuggestions> SuggestAsync(TextPosition position, CancellationToken cancellation = default)
    {
        RequireOwnerThread();
        var snapshot = controller.Document.Snapshot();
        var requestedLanguage = language;
        if (position.Offset < 0 || position.Offset > snapshot.Length)
            throw new ArgumentOutOfRangeException(nameof(position));
        foreach (var error in errors)
        {
            if (position.Offset < error.Range.Start || position.Offset > error.Range.Start + error.Range.Length)
                continue;
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellation, lifetime.Token, owner.Closed);
            try
            {
                var result = await service.SuggestAsync(snapshot, error.Range, requestedLanguage, linked.Token)
                    .ConfigureAwait(false);
                return linked.IsCancellationRequested
                    ? result with { Status = SpellingStatus.Cancelled, Values = Array.Empty<string>() } : result;
            }
            catch (OperationCanceledException) when (linked.IsCancellationRequested)
            {
                return new(SpellingStatus.Cancelled, snapshot.Version, requestedLanguage, error.Range, "", Array.Empty<string>());
            }
        }
        return new(SpellingStatus.Success, snapshot.Version, requestedLanguage,
            new TextRange(position.Offset, 0), "", Array.Empty<string>());
    }

    /// <summary>Replaces a still-current misspelling with one suggestion as a normal undoable edit.</summary>
    public SpellingStatus ApplySuggestion(SpellingSuggestions suggestions, int index)
    {
        RequireOwnerThread();
        ArgumentNullException.ThrowIfNull(suggestions);
        if (index < 0 || index >= suggestions.Values.Count)
            throw new ArgumentOutOfRangeException(nameof(index));
        if (ReadOnly || controller.Composition != null)
            return SpellingStatus.Disabled;
        if (suggestions.Status != SpellingStatus.Success || suggestions.Version != controller.Document.Version ||
            suggestions.Language != language || controller.Document.GetText(suggestions.Range) != suggestions.Word)
            return SpellingStatus.Stale;
        controller.BreakUndoGroup();
        controller.Selection = new TextSelection(
            new TextPosition(suggestions.Range.Start, TextAffinity.Upstream),
            new TextPosition(suggestions.Range.Start + suggestions.Range.Length, TextAffinity.Downstream));
        var applied = controller.Execute(new TextCommand(TextCommandKind.Insert, suggestions.Values[index], false));
        controller.BreakUndoGroup();
        return applied ? SpellingStatus.Success : SpellingStatus.Disabled;
    }

    /// <summary>Cancels work, removes subscriptions and releases the presentation layer on the owner thread.</summary>
    public void Dispose()
    {
        if (disposed)
            return;
        RequireOwnerThread();
        disposed = true;
        controller.Document.Changed -= OnDocumentChanged;
        lifetime.Cancel();
        pending?.Cancel();
        pending?.Dispose();
        lifetime.Dispose();
        Layer.Clear();
        Layer.Dispose();
    }

    private void OnDocumentChanged(TextDocumentChange change)
    {
        if (disposed || change.Changes.Count == 0)
            return;
        pending?.Cancel();
        pending?.Dispose();
        pending = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token, owner.Closed);
        for (var i = errors.Count - 1; i >= 0; i--)
        {
            var error = errors[i];
            var shift = 0;
            var affected = false;
            foreach (var edit in change.Changes)
            {
                if (edit.Range.Start <= error.Range.Start + error.Range.Length &&
                    edit.Range.Start + edit.Range.Length >= error.Range.Start)
                {
                    affected = true;
                    break;
                }
                if (edit.Range.Start + edit.Range.Length < error.Range.Start)
                    shift += edit.InsertedText.Length - edit.Range.Length;
            }
            if (affected)
                errors.RemoveAt(i);
            else if (shift != 0)
                errors[i] = error with { Range = new TextRange(error.Range.Start + shift, error.Range.Length) };
        }
        var snapshot = controller.Document.Snapshot();
        var start = Math.Min(change.Changes[0].Range.Start, snapshot.Length);
        var end = start;
        var delta = 0;
        foreach (var edit in change.Changes)
        {
            end = Math.Max(end, edit.Range.Start + delta + edit.InsertedText.Length);
            delta += edit.InsertedText.Length - edit.Range.Length;
        }
        if (pendingRange is { } dirty)
        {
            long dirtyStart = dirty.Start, dirtyEnd = (long)dirty.Start + dirty.Length;
            for (var i = change.Changes.Count - 1; i >= 0; i--)
            {
                var edit = change.Changes[i];
                var oldEnd = (long)edit.Range.Start + edit.Range.Length;
                var shift = edit.InsertedText.Length - edit.Range.Length;
                dirtyStart = dirtyStart < edit.Range.Start ? dirtyStart :
                    dirtyStart <= oldEnd ? edit.Range.Start : dirtyStart + shift;
                dirtyEnd = dirtyEnd < edit.Range.Start ? dirtyEnd :
                    dirtyEnd <= oldEnd ? (long)edit.Range.Start + edit.InsertedText.Length : dirtyEnd + shift;
            }
            start = (int)Math.Min(start, dirtyStart);
            end = (int)Math.Max(end, dirtyEnd);
        }
        var firstLine = snapshot.GetLineRange(snapshot.GetLineIndex(start));
        var lastLine = snapshot.GetLineRange(snapshot.GetLineIndex(Math.Min(end, snapshot.Length)));
        var range = new TextRange(firstLine.Start, lastLine.Start + lastLine.Length - firstLine.Start);
        pendingRange = range;
        errors.RemoveAll(error => Overlaps(error.Range, range));
        PublishLayer();
        _ = CheckAfterDelayAsync(range, pending.Token);
    }

    private async Task CheckAfterDelayAsync(TextRange range, CancellationToken cancellation)
    {
        try
        {
            await Task.Delay(CheckDelayMilliseconds, cancellation).ConfigureAwait(false);
            if (!cancellation.IsCancellationRequested)
                owner.TryPost(() => { if (!disposed && !cancellation.IsCancellationRequested) _ = CheckAsync(range, cancellation); });
        }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested)
        {
        }
    }

    private void PublishLayer()
    {
        var spans = new TextStyleSpan[errors.Count];
        var style = new Style { TextDecoration = TextDecoration.Underline };
        for (var i = 0; i < errors.Count; i++)
            spans[i] = new TextStyleSpan("spelling:" + i, errors[i].Range, style);
        Layer.ReplaceStyles(Array.AsReadOnly(spans));
    }

    private void RequireOwnerThread()
    {
        ObjectDisposedException.ThrowIf(disposed, this);
        if (Environment.CurrentManagedThreadId != threadId)
            throw new InvalidOperationException("Use SpellCheckSession on its owner thread.");
    }

    private static bool Overlaps(TextRange left, TextRange right) =>
        left.Start < (long)right.Start + right.Length && right.Start < (long)left.Start + left.Length;
}
