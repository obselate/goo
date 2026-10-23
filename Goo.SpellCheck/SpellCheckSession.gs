package Goo.SpellCheck

import Goo
import System
import System.Collections.Generic
import System.Threading
import System.Threading.Tasks

/// Maintains an optional misspelling layer and explicit suggestion commands on the owner thread.
class SpellCheckSession : IDisposable {
    private let owner Window
    private let controller TextEditorController
    private let service ISpellingService
    private let threadId int32 = Environment.CurrentManagedThreadId
    private let errors List[Misspelling] = List[Misspelling]()
    private let lifetime CancellationTokenSource = CancellationTokenSource()
    private var pending CancellationTokenSource?
    private var pendingRange TextRange?
    private var language string
    private var languageGeneration int32
    private var disposed bool

    /// Creates a session. Add Layer after persistent formatting in TextEditor.Layers.
    init(owner Window, controller TextEditorController, service ISpellingService, language string) {
        ArgumentNullException.ThrowIfNull(owner, paramName: "owner")
        ArgumentNullException.ThrowIfNull(controller, paramName: "controller")
        ArgumentNullException.ThrowIfNull(service, paramName: "service")
        this.owner = owner
        this.controller = controller
        this.service = service
        this.language = SpellingInput.Validate(controller.Document.Snapshot(), default(TextRange), language)
        Layer = TextPresentationLayer(controller.Document)
        controller.Document.Changed += OnDocumentChanged
    }

    /// The transient spelling layer. This session owns and disposes it.
    prop Layer TextPresentationLayer {
        get;
    }

    /// Disables applying suggestions without disabling read-only checking.
    prop ReadOnly bool

    /// The explicit BCP 47 language. Changing it cancels and clears old diagnoses.
    prop Language string {
        get -> language
        set {
            RequireOwnerThread()
            let next = SpellingInput.Validate(controller.Document.Snapshot(), default(TextRange), value)
            if next == language {
                return
            }
            language = next
            languageGeneration++
            pending?.Cancel()
            errors.Clear()
            Layer.Clear()
        }
    }

    /// Reports completed automatic or explicit checks on the owner thread.
    event Updated Action[SpellingResult]

    /// Checks a source range and discards stale results.
    async func CheckAsync(
        $range TextRange,
        cancellation CancellationToken = default(CancellationToken)
    ) SpellingResult {
        var $range = $range
        RequireOwnerThread()
        let snapshot = controller.Document.Snapshot()
        let requestedLanguage = language
        let generation = languageGeneration
        SpellingInput.Validate(snapshot, $range, requestedLanguage)
        using let linked = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token, owner.Closed, cancellation)
        var result = SpellingResult(SpellingStatus.Cancelled, snapshot.Version, requestedLanguage, []Misspelling{})
        try {
            result = await service.CheckAsync(snapshot, $range, requestedLanguage, linked.Token).ConfigureAwait(false)
        } catch (OperationCanceledException) when linked.IsCancellationRequested { }
        let completion = TaskCompletionSource[SpellingResult](TaskCreationOptions.RunContinuationsAsynchronously)
        let token = linked.Token
        using let registration = token.Register(
            () -> completion.TrySetResult(
                result with{Status = SpellingStatus.Cancelled, Errors = Array.Empty[Misspelling]()}
            )
        )
        if !owner.TryPost(
            () -> {
                if disposed || token.IsCancellationRequested {
                    result = result with{Status = SpellingStatus.Cancelled, Errors = Array.Empty[Misspelling]()}
                } else if snapshot.Version != controller.Document.Version || generation != languageGeneration {
                    result = result with{Status = SpellingStatus.Stale, Errors = Array.Empty[Misspelling]()}
                } else if result.Status == SpellingStatus.Success {
                    errors.RemoveAll((error Misspelling) -> Overlaps(error.Range, $range))
                    for error in result.Errors {
                        if error
                            .Range
                            .Start < $range.Start ||
                            error
                            .Range
                            .Length <= 0 ||
                            int64(error.Range.Start) +
                            int64(error.Range.Length) > int64($range.Start) +
                            int64($range.Length) ||
                            snapshot.GetText(error.Range) != error.Word {
                            continue
                        }
                        let __spill0 = controller.Composition
                        var composition TextComposition
                        if __spill0 != nil && {
                            composition = __spill0!!
                            true
                        } && Overlaps(error.Range, composition.Range) {
                            continue
                        }
                        errors.Add(error)
                    }
                    var dirty TextRange
                    if pendingRange != nil && {
                        dirty = pendingRange!!
                        true
                    } &&
                        $range.Start <= dirty.Start &&
                        int64($range.Start) +
                        int64($range.Length) >= int64(dirty.Start) +
                        int64(dirty.Length) {
                        pendingRange = nil
                    }
                    PublishLayer()
                }
                completion.TrySetResult(result)
                if !disposed {
                    Updated?(result)
                }
            }
        ) {
            return result with{Status = SpellingStatus.Disabled, Errors = Array.Empty[Misspelling]()}
        }
        return await completion.Task.ConfigureAwait(false)
    }

    /// Gets suggestions for the misspelling at a source position without moving the selection.
    async func SuggestAsync(
        position TextPosition,
        cancellation CancellationToken = default(CancellationToken)
    ) SpellingSuggestions {
        var position = position
        RequireOwnerThread()
        let snapshot = controller.Document.Snapshot()
        let requestedLanguage = language
        if position.Offset < 0 || position.Offset > snapshot.Length {
            throw ArgumentOutOfRangeException("position")
        }
        for error in errors {
            if position.Offset < error.Range.Start || position.Offset > error.Range.Start + error.Range.Length {
                continue
            }
            using let linked = CancellationTokenSource.CreateLinkedTokenSource(
                cancellation,
                lifetime.Token,
                owner.Closed
            )
            try {
                let result = await service.SuggestAsync(snapshot, error.Range, requestedLanguage, linked.Token)
                    .ConfigureAwait(false)
                return if linked.IsCancellationRequested {
                    result with{Status = SpellingStatus.Cancelled, Values = Array.Empty[string]()}
                } else {
                    result
                }
            } catch (OperationCanceledException) when linked.IsCancellationRequested {
                return SpellingSuggestions(
                    SpellingStatus.Cancelled,
                    snapshot.Version,
                    requestedLanguage,
                    error.Range,
                    "",
                    Array.Empty[string]()
                )
            }
        }
        return SpellingSuggestions(
            SpellingStatus.Success,
            snapshot.Version,
            requestedLanguage,
            TextRange(position.Offset, 0),
            "",
            Array.Empty[string]()
        )
    }

    /// Replaces a still-current misspelling with one suggestion as a normal undoable edit.
    func ApplySuggestion(suggestions SpellingSuggestions, index int32) SpellingStatus {
        RequireOwnerThread()
        ArgumentNullException.ThrowIfNull(suggestions, paramName: "suggestions")
        if index < 0 || index >= suggestions.Values.Count {
            throw ArgumentOutOfRangeException("index")
        }
        if ReadOnly || controller.Composition != nil {
            return SpellingStatus.Disabled
        }
        if suggestions.Status != SpellingStatus.Success ||
            suggestions.Version != controller
            .Document
            .Version ||
            suggestions.Language != language ||
            controller
            .Document
            .GetText(suggestions.Range) != suggestions.Word {
            return SpellingStatus.Stale
        }
        controller.BreakUndoGroup()
        this
            .controller
            .Selection = TextSelection(
            TextPosition(suggestions.Range.Start, TextAffinity.Upstream),
            TextPosition(suggestions.Range.Start + suggestions.Range.Length, TextAffinity.Downstream)
        )
        let applied = controller.Execute(TextCommand(TextCommandKind.Insert, suggestions.Values[index], false))
        controller.BreakUndoGroup()
        return if applied {
            SpellingStatus.Success
        } else {
            SpellingStatus.Disabled
        }
    }

    /// Cancels work, removes subscriptions and releases the presentation layer on the owner thread.
    func Dispose() {
        if disposed {
            return
        }
        RequireOwnerThread()
        disposed = true
        controller.Document.Changed -= OnDocumentChanged
        lifetime.Cancel()
        pending?.Cancel()
        pending?.Dispose()
        lifetime.Dispose()
        Layer.Clear()
        Layer.Dispose()
    }

    private func OnDocumentChanged(change TextDocumentChange) {
        var change = change
        if disposed || change.Changes.Count == 0 {
            return
        }
        pending?.Cancel()
        pending?.Dispose()
        pending = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token, owner.Closed)
        for var i = errors.Count - 1; i >= 0; i-- {
            var error = errors[i]
            var shift = 0
            var affected = false
            for edit in change.Changes {
                if edit
                    .Range
                    .Start <= error
                    .Range
                    .Start +
                    error
                    .Range
                    .Length &&
                    edit
                    .Range
                    .Start +
                    edit
                    .Range
                    .Length >= error
                    .Range
                    .Start {
                    affected = true
                    break
                }
                if edit.Range.Start + edit.Range.Length < error.Range.Start {
                    shift += edit.InsertedText.Length - edit.Range.Length
                }
            }
            if affected {
                errors.RemoveAt(i)
            } else if shift != 0 {
                errors[i] = error with{Range = TextRange(error.Range.Start + shift, error.Range.Length)}
            }
        }
        let snapshot = controller.Document.Snapshot()
        var start = Math.Min(change.Changes[0].Range.Start, snapshot.Length)
        var end = start
        var delta = 0
        for edit in change.Changes {
            end = Math.Max(end, edit.Range.Start + delta + edit.InsertedText.Length)
            delta += edit.InsertedText.Length - edit.Range.Length
        }
        var dirty TextRange
        if pendingRange != nil && {
            dirty = pendingRange!!
            true
        } {
            var dirtyStart int64 = dirty.Start
            var dirtyEnd = int64(dirty.Start) + int64(dirty.Length)
            for var i = change.Changes.Count - 1; i >= 0; i-- {
                var edit = change.Changes[i]
                let oldEnd = int64(edit.Range.Start) + int64(edit.Range.Length)
                let shift = edit.InsertedText.Length - edit.Range.Length
                dirtyStart = if dirtyStart < int64(edit.Range.Start) {
                    dirtyStart
                } else {
                    (
                        if dirtyStart <= oldEnd {
                            int64(edit.Range.Start)
                        } else {
                            dirtyStart + int64(shift)
                        }
                    )
                }
                dirtyEnd = if dirtyEnd < int64(edit.Range.Start) {
                    dirtyEnd
                } else {
                    (
                        if dirtyEnd <= oldEnd {
                            int64(edit.Range.Start) + int64(edit.InsertedText.Length)
                        } else {
                            dirtyEnd + int64(shift)
                        }
                    )
                }
            }
            start = int32(Math.Min(start, dirtyStart))
            end = int32(Math.Max(end, dirtyEnd))
        }
        var firstLine = snapshot.GetLineRange(snapshot.GetLineIndex(start))
        var lastLine = snapshot.GetLineRange(snapshot.GetLineIndex(Math.Min(end, snapshot.Length)))
        let range_ = TextRange(firstLine.Start, lastLine.Start + lastLine.Length - firstLine.Start)
        pendingRange = range_
        errors.RemoveAll((error Misspelling) -> Overlaps(error.Range, range_))
        PublishLayer()
        let _ = CheckAfterDelayAsync(range_, pending!!.Token)
    }

    private async func CheckAfterDelayAsync($range TextRange, cancellation CancellationToken) {
        try {
            await Task.Delay(CheckDelayMilliseconds, cancellation).ConfigureAwait(false)
            if !cancellation.IsCancellationRequested {
                owner.TryPost(
                    () -> {
                        if !disposed && !cancellation.IsCancellationRequested {
                            let _ = CheckAsync($range, cancellation)
                        }
                    }
                )
            }
        } catch (OperationCanceledException) when cancellation.IsCancellationRequested { }
    }

    private func PublishLayer() {
        let spans = [errors.Count]TextStyleSpan
        let style = Style{TextDecoration: TextDecoration.Underline}
        for var i = 0; i < errors.Count; i++ {
            spans[i] = TextStyleSpan("spelling:" + i.ToString(), errors[i].Range, style)
        }
        Layer.ReplaceStyles(Array.AsReadOnly(spans))
    }

    private func RequireOwnerThread() {
        ObjectDisposedException.ThrowIf(disposed, this)
        if Environment.CurrentManagedThreadId != threadId {
            throw InvalidOperationException("Use SpellCheckSession on its owner thread.")
        }
    }

    shared {
        private const CheckDelayMilliseconds int32 = 200

        private func Overlaps(left TextRange, right TextRange) bool {
            var left = left
            var right = right
            return int64(left.Start) < int64(right.Start) +
                int64(right.Length) &&
                int64(right.Start) < int64(left.Start) +
                int64(left.Length)
        }
    }
}
