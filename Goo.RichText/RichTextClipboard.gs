package Goo.RichText

import Goo
import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Threading
import System.Threading.Tasks

/// Binds HTML and RTF clipboard commands to one editor and its persistent style layer.
class RichTextClipboard : IDisposable {
    private let owner Window
    private let controller TextEditorController
    private let layer TextPresentationLayer
    private let previous((TextCommandEvent) -> void)?
    private let interceptor(TextCommandEvent) -> void
    private let threadId int32 = Environment.CurrentManagedThreadId
    private let lifetime CancellationTokenSource = CancellationTokenSource()
    private var readOnly bool
    private var disposed bool
    private var applying bool
    private var generation int32
    private var checking bool
    private var interceptAllowed bool

    /// Installs a command interceptor. Add the supplied persistent layer to TextEditor.Layers.
    init(owner Window, controller TextEditorController, layer TextPresentationLayer) {
        ArgumentNullException.ThrowIfNull(owner, paramName: "owner")
        ArgumentNullException.ThrowIfNull(controller, paramName: "controller")
        ArgumentNullException.ThrowIfNull(layer, paramName: "layer")
        if !object.ReferenceEquals(layer.Document, controller.Document) {
            throw ArgumentException("The layer belongs to another document.", "layer")
        }
        this.owner = owner
        this.controller = controller
        this.layer = layer
        previous = controller.OnCommand
        interceptor = Intercept
        controller.OnCommand = interceptor
    }

    /// Disables Cut and Paste. Set this with TextEditor.ReadOnly.
    prop ReadOnly bool {
        get -> readOnly
        set {
            RequireOwner()
            if readOnly != value {
                readOnly = value
                generation++
            }
        }
    }

    /// Reports commands started by the editor shortcut interceptor, on the owner thread.
    event Completed Action[RichTextResult]?

    /// Publishes the selected source text and persistent inline styles.
    func CopyAsync(cancellation CancellationToken = default(CancellationToken)) Task[RichTextResult] -> RunAsync(
        TextCommandKind.Copy,
        false,
        true,
        cancellation
    )

    /// Publishes Copy intent and deletes only after success while the captured editor state still matches.
    func CutAsync(cancellation CancellationToken = default(CancellationToken)) Task[RichTextResult] -> RunAsync(
        TextCommandKind.Cut,
        false,
        true,
        cancellation
    )

    /// Pastes supported rich content, or plain text only when no rich format is present.
    func PasteAsync(cancellation CancellationToken = default(CancellationToken)) Task[RichTextResult] -> RunAsync(
        TextCommandKind.Paste,
        false,
        true,
        cancellation
    )

    /// Pastes only the plain-text representation by explicit caller choice.
    func PastePlainTextAsync(cancellation CancellationToken = default(CancellationToken)) Task[
        RichTextResult
    ] -> RunAsync(TextCommandKind.Paste, true, true, cancellation)

    /// Cancels pending commands and restores the previous interceptor if this binding still owns it.
    func Dispose() {
        if disposed {
            return
        }
        RequireOwner()
        disposed = true
        lifetime.Cancel()
        lifetime.Dispose()
        if controller.OnCommand == interceptor {
            this.controller.OnCommand = previous
        }
    }

    private func Intercept(command TextCommandEvent) {
        if applying {
            return
        }
        previous?(command)
        if checking {
            interceptAllowed = !command.Cancel
            command.Cancel = true
            return
        }
        if command.Command.Kind == TextCommandKind.Paste && command.Command.Text != nil {
            return
        }
        if command.Cancel ||
            disposed ||
            command
            .Command
            .Kind is not(TextCommandKind.Copy or TextCommandKind.Cut or TextCommandKind.Paste) {
            return
        }
        command.Cancel = true
        let _ = ObserveAsync(RunAsync(command.Command.Kind, false, false, CancellationToken.None))
    }

    private async func ObserveAsync(pending Task[RichTextResult]) {
        var result RichTextResult
        try {
            result = await pending.ConfigureAwait(false)
        } catch (error Exception) {
            result = RichTextCodec.Failure(RichTextStatus.Failed, error.Message)
        }
        try {
            await OnOwnerAsync(
                () -> {
                    if !disposed {
                        Completed?(result)
                    }
                    return true
                },
                owner.Closed
            ).ConfigureAwait(false)
        } catch (OperationCanceledException) { }
    }

    private async func RunAsync(
        kind TextCommandKind,
        plain bool,
        intercept bool,
        cancellation CancellationToken
    ) RichTextResult {
        RequireOwner()
        if intercept {
            checking = true
            interceptAllowed = false
            try {
                controller.Execute(TextCommand(kind, "", false))
            } finally {
                checking = false
            }
            if !interceptAllowed {
                return RichTextCodec.Failure(RichTextStatus.Cancelled)
            }
        }
        if kind != TextCommandKind.Copy && readOnly {
            return RichTextCodec.Failure(RichTextStatus.ReadOnly)
        }
        let snapshot = controller.Document.Snapshot()
        var selection = controller.Selection
        let revision = layer.Revision
        let capturedGeneration = generation
        let composition = controller.Composition
        let Current = () -> !disposed && snapshot.Version == controller.Document.Version &&
            selection.Equals(controller.Selection) && revision == layer.Revision && capturedGeneration == generation &&
            object.Equals(composition, controller.Composition)
        let start = Math.Min(selection.Anchor.Offset, selection.Active.Offset)
        let range_ = TextRange(start, Math.Abs(selection.Active.Offset - selection.Anchor.Offset))
        using let linked = CancellationTokenSource.CreateLinkedTokenSource(cancellation, lifetime.Token, owner.Closed)
        try {
            linked.Token.ThrowIfCancellationRequested()
            if kind == TextCommandKind.Copy || kind == TextCommandKind.Cut {
                if range_.Length == 0 {
                    return RichTextCodec.Failure(RichTextStatus.Empty)
                }
                let selected = Capture(snapshot, range_)
                let publication = RichTextCodec.Write(selected)
                let written = await owner
                    .WriteClipboardAsync(publication, ClipboardIntent.Copy)
                    .WaitAsync(linked.Token)
                    .ConfigureAwait(false)
                if written.Status != DataTransferStatus.Success {
                    return RichTextCodec.Failure(Map(written.Status), written.Error)
                }
                if kind == TextCommandKind.Copy {
                    return RichTextResult(RichTextStatus.Success, selected)
                }
                return await OnOwnerAsync(
                    () -> {
                        if !Current() {
                            return RichTextResult(RichTextStatus.Stale, selected)
                        }
                        if readOnly {
                            return RichTextResult(RichTextStatus.ReadOnly, selected)
                        }
                        return if Apply("", Array.Empty[TextStyleSpan]()) {
                            RichTextResult(RichTextStatus.Success, selected)
                        } else {
                            RichTextResult(RichTextStatus.Cancelled, selected)
                        }
                    },
                    linked.Token
                ).ConfigureAwait(false)
            }
            let data = await owner.ReadClipboardDataAsync(if plain { PlainTypes } else { RichTypes })
                .WaitAsync(linked.Token).ConfigureAwait(false)
            if data.Status != ClipboardReadStatus.Success {
                return RichTextCodec.Failure(Map(data.Status), data.Error)
            }
            var decoded = RichTextCodec.Failure(RichTextStatus.Empty)
            for type in (if plain { PlainTypes } else { RichTypes }) {
                let representation = data.Data.Representations.FirstOrDefault(
                    (item TransferRepresentation) -> item.ContentType.Equals(type, StringComparison.OrdinalIgnoreCase))
                if representation == nil {
                    continue
                }
                decoded = RichTextCodec.Read(representation.ContentType, representation.Bytes)
                break
            }
            if decoded.Status is not(RichTextStatus.Success or RichTextStatus.PlainText) {
                return decoded
            }
            return await OnOwnerAsync(
                () -> {
                    if !Current() {
                        return decoded with{Status = RichTextStatus.Stale}
                    }
                    if readOnly {
                        return decoded with{Status = RichTextStatus.ReadOnly}
                    }
                    return if Apply(decoded.Fragment.Text, decoded.Fragment.Styles) {
                        decoded
                    } else {
                        decoded with{Status = RichTextStatus.Cancelled}
                    }
                },
                linked.Token
            ).ConfigureAwait(false)
        } catch (OperationCanceledException) {
            return RichTextCodec.Failure(RichTextStatus.Cancelled)
        } catch (RichLimitException) {
            return RichTextCodec.Failure(RichTextStatus.TooLarge)
        } catch (error UnsupportedContentException) {
            return RichTextCodec.Failure(RichTextStatus.UnsupportedContent, error.Message)
        } catch (error FormatException) {
            return RichTextCodec.Failure(RichTextStatus.Failed, error.Message)
        } catch (error IOException) {
            return RichTextCodec.Failure(RichTextStatus.Failed, error.Message)
        }
    }

    private func Capture(snapshot TextSnapshot, $range TextRange) RichTextFragment {
        if $range.Length > RichInput.MaxText {
            throw RichLimitException()
        }
        let spans = List[TextStyleSpan]()
        for span in layer.GetStyles() {
            let start = Math.Max($range.Start, span.Range.Start)
            let end = Math.Min($range.Start + $range.Length, span.Range.Start + span.Range.Length)
            if start < end {
                spans.Add(TextStyleSpan(span.Key, TextRange(start - $range.Start, end - start), span.Style))
            }
        }
        if spans.Count > RichInput.MaxStyles {
            throw RichLimitException()
        }
        return RichTextFragment(snapshot.GetText($range), spans)
    }

    private func Apply(text string, styles IReadOnlyList[TextStyleSpan]) bool {
        applying = true
        try {
            return controller.ReplaceSelection(layer, text, styles)
        } finally {
            applying = false
        }
    }

    private func OnOwnerAsync[T](action() -> T, cancellation CancellationToken) Task[T] {
        let completion = TaskCompletionSource[T](TaskCreationOptions.RunContinuationsAsynchronously)
        var claimed = 0
        let registration = cancellation.Register(
            () -> {
                if Interlocked.CompareExchange(&claimed, 1, 0) == 0 {
                    completion.TrySetCanceled(cancellation)
                }
            }
        )
        let FinishAsync = async () -> {
            try {
                return await completion.Task.ConfigureAwait(false)
            } finally {
                registration.Dispose()
            }
        }
        if !owner.TryPost(
            () -> {
                if Interlocked.CompareExchange(&claimed, 1, 0) != 0 {
                    return
                }
                try {
                    completion.TrySetResult(action())
                } catch (error Exception) {
                    completion.TrySetException(error)
                }
            }
        ) {
            completion.TrySetCanceled(CancellationToken(true))
        }
        return FinishAsync()
    }

    private func RequireOwner() {
        ObjectDisposedException.ThrowIf(disposed, this)
        if threadId != Environment.CurrentManagedThreadId {
            throw InvalidOperationException("Use the rich clipboard binding on its owner thread.")
        }
    }

    shared {
        private let RichTypes[]string = []string{
            "text/html",
            "text/rtf",
            "application/rtf",
            "text/plain;charset=utf-8",
            "text/plain"
        }
        private let PlainTypes[]string = []string{"text/plain;charset=utf-8", "text/plain"}

        private func Map(status DataTransferStatus) RichTextStatus -> switch status {
            case DataTransferStatus.Cancelled: RichTextStatus.Cancelled
            case DataTransferStatus.Unsupported: RichTextStatus.Unsupported
            case DataTransferStatus.TooLarge: RichTextStatus.TooLarge
            default: RichTextStatus.Failed
        }

        private func Map(status ClipboardReadStatus) RichTextStatus -> switch status {
            case ClipboardReadStatus.Empty: RichTextStatus.Empty
            case ClipboardReadStatus.Unsupported: RichTextStatus.Unsupported
            case ClipboardReadStatus.TooLarge: RichTextStatus.TooLarge
            default: RichTextStatus.Failed
        }
    }
}
