# Text API

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/Text`](https://github.com/obselate/goo/tree/5616973a1626ffc6cd0c3693f52832f4ad9cb72d/Goo/Text)

## `FontSource`

Source:

- [`FontSource.gs`](https://github.com/obselate/goo/blob/5616973a1626ffc6cd0c3693f52832f4ad9cb72d/Goo/Text/FontSource.gs)

Owns one font face and its registration state.

### `new(string,int32,bool,System.Byte[])`

Creates a font source for the default face and variation set.

### `new(string,int32,bool,System.Byte[],System.UInt32,FontVariation[])`

Creates a font source for a face and variation set.

### `Dispose`

Releases the source and unregisters it when necessary.

### `FromPath(string,int32,bool,string)`

Creates an unregistered font source by reading a file of at most 64 MiB. The source owns the bytes and does not retain an open file.

### `FromPath(string,int32,bool,string,System.UInt32,FontVariation[])`

Creates an unregistered file-backed font source for a face and variation set. Reads at most 64 MiB and owns the bytes independently of the file.

### `Register`

Registers the source with Goo's font registry.

### `FaceIndex`

Gets the face index in the font bytes.

### `Family`

Gets the canonical family name.

### `IsDisposed`

Gets whether the source has been disposed.

### `IsRegistered`

Gets whether the source is registered and usable.

### `Italic`

Gets whether the font is italic.

### `Variations`

Gets a copy of the validated font variations.

### `Weight`

Gets the font weight.

## `FontVariation`

Source:

- [`FontSource.gs`](https://github.com/obselate/goo/blob/5616973a1626ffc6cd0c3693f52832f4ad9cb72d/Goo/Text/FontSource.gs)

Stores one four-character font variation axis and value.

### `new(string,float32)`

Creates a font variation value.

### `Deconstruct(string@,float32@)`

Deconstructs the variation into its tag and value.

### `Equals(FontVariation)`

Tests equality with another variation.

### `Equals(System.Object)`

Tests equality with another value.

### `GetHashCode`

Gets the variation hash code.

### `ToString`

Returns the variation text representation.

### `op_Equality(FontVariation,FontVariation)`

Tests whether two variations are equal.

### `op_Inequality(FontVariation,FontVariation)`

Tests whether two variations are different.

### `Tag`

Gets the four-character variation axis tag.

### `Value`

Gets the variation axis value.

## `RichTextClipboard`

Source:

- [`RichTextClipboard.gs`](https://github.com/obselate/goo/blob/5616973a1626ffc6cd0c3693f52832f4ad9cb72d/Goo/Text/RichText/RichTextClipboard.gs)

Binds HTML and RTF clipboard commands to one editor and its persistent style layer.

### `Completed`

Reports commands started by the editor shortcut interceptor, on the owner thread.

### `new(Window,TextEditorController,TextPresentationLayer)`

Installs a command interceptor. Add the supplied persistent layer to TextEditor.Layers.

### `CopyAsync(System.Threading.CancellationToken)`

Publishes the selected source text and persistent inline styles.

### `CutAsync(System.Threading.CancellationToken)`

Publishes Copy intent and deletes only after success while the captured editor state still matches.

### `Dispose`

Cancels pending commands and restores the previous interceptor if this binding still owns it.

### `PasteAsync(System.Threading.CancellationToken)`

Pastes supported rich content, or plain text only when no rich format is present.

### `PastePlainTextAsync(System.Threading.CancellationToken)`

Pastes only the plain-text representation by explicit caller choice.

### `ReadOnly`

Disables Cut and Paste. Set this with TextEditor.ReadOnly.

## `RichTextCodec`

Source:

- [`RichTextCodec.gs`](https://github.com/obselate/goo/blob/5616973a1626ffc6cd0c3693f52832f4ad9cb72d/Goo/Text/RichText/RichTextCodec.gs)

Reads and writes the supported inline HTML and RTF clipboard subset.

### `Read(string,System.ReadOnlyMemory{System.Byte})`

Decodes a complete representation before returning an owned fragment.

### `Write(RichText.RichTextFragment)`

Encodes one publication with UTF-8 plain text, HTML and RTF alternatives.

## `RichTextFragment`

Source:

- [`RichText.gs`](https://github.com/obselate/goo/blob/5616973a1626ffc6cd0c3693f52832f4ad9cb72d/Goo/Text/RichText/RichText.gs)

Owns source text and persistent, fragment-relative UTF-16 style spans.

### `new(string,System.Collections.Generic.IReadOnlyList{TextStyleSpan})`

Creates an owned fragment. Every range must end on a UTF-16 boundary.

### `Styles`

Gets owned persistent styles. Later spans override earlier declarations.

### `Text`

Gets immutable Unicode source text.

## `RichTextResult`

Source:

- [`RichText.gs`](https://github.com/obselate/goo/blob/5616973a1626ffc6cd0c3693f52832f4ad9cb72d/Goo/Text/RichText/RichText.gs)

Contains Status, Fragment and bounded Error detail.

## `RichTextStatus`

Source:

- [`RichText.gs`](https://github.com/obselate/goo/blob/5616973a1626ffc6cd0c3693f52832f4ad9cb72d/Goo/Text/RichText/RichText.gs)

Reports rich clipboard parsing, publication or editing.

### Values

- `Success`
- `PlainText`
- `Unsupported`
- `UnsupportedContent`
- `Empty`
- `TooLarge`
- `ReadOnly`
- `Cancelled`
- `Stale`
- `Failed`

### `Cancelled`

The command was cancelled.

### `Empty`

The selection or clipboard has no text.

### `Failed`

The content is malformed or a native operation failed.

### `PlainText`

Plain text was transferred without formatting.

### `ReadOnly`

The editor does not allow this edit.

### `Stale`

The document, selection or formatting changed before completion.

### `Success`

The supported rich content was transferred.

### `TooLarge`

The encoded content, decoded text or style count exceeds its limit.

### `Unsupported`

The host cannot provide the requested transfer.

### `UnsupportedContent`

The content uses document features outside the supported inline subset.

## `TextChange`

Source:

- [`TextDocument.Models.gs`](https://github.com/obselate/goo/blob/5616973a1626ffc6cd0c3693f52832f4ad9cb72d/Goo/Text/TextDocument.Models.gs)

Specifies one replacement with a Range and InsertedText.

## `TextCommand`

Source:

- [`TextEditorController.gs`](https://github.com/obselate/goo/blob/5616973a1626ffc6cd0c3693f52832f4ad9cb72d/Goo/Text/TextEditorController.gs)

Describes an operation with a Kind, Text, ExtendSelection flag, and optional Position.

### `Position`

Gets the optional source position for SelectWord or SelectLine. Omission uses the caret.

## `TextCommandEvent`

Source:

- [`TextEditorController.gs`](https://github.com/obselate/goo/blob/5616973a1626ffc6cd0c3693f52832f4ad9cb72d/Goo/Text/TextEditorController.gs)

Provides mutable cancellation state before a text-editor command runs.

### `Cancel`

Gets or sets whether Goo skips its default command behavior.

### `Command`

Gets the semantic command being dispatched.

## `TextCommandKind`

Source:

- [`TextEditorController.gs`](https://github.com/obselate/goo/blob/5616973a1626ffc6cd0c3693f52832f4ad9cb72d/Goo/Text/TextEditorController.gs)

Selects a semantic text-editor operation.

### Values

- `Insert`
- `DeleteBackward`
- `DeleteForward`
- `DeleteWordBackward`
- `DeleteWordForward`
- `MoveLeft`
- `MoveRight`
- `MoveUp`
- `MoveDown`
- `MoveWordLeft`
- `MoveWordRight`
- `MoveLineStart`
- `MoveLineEnd`
- `MoveDocumentStart`
- `MoveDocumentEnd`
- `PageUp`
- `PageDown`
- `SelectAll`
- `Copy`
- `Cut`
- `Paste`
- `Undo`
- `Redo`
- `Indent`
- `Outdent`
- `Submit`
- `ToggleOverwrite`
- `BeginComposition`
- `UpdateComposition`
- `CommitComposition`
- `CancelComposition`
- `CancelEdit`
- `SelectWord`
- `SelectLine`
- `InsertTab`

### `CancelEdit`

Restores the focused TextEntry's value from focus time and blurs it through PlatformInput.

### `InsertTab`

Inserts a tab at the caret, or indents every selected logical line.

### `SelectLine`

Selects the logical line at Position or the caret, including its line ending.

### `SelectWord`

Selects the word, whitespace, punctuation, or symbol run at Position or the caret.

## `TextComposition`

Source:

- [`TextEditorController.gs`](https://github.com/obselate/goo/blob/5616973a1626ffc6cd0c3693f52832f4ad9cb72d/Goo/Text/TextEditorController.gs)

Describes preedit Range, Text, SelectionStart, and SelectionLength values.

## `TextDocument`

Source:

- [`TextDocument.gs`](https://github.com/obselate/goo/blob/5616973a1626ffc6cd0c3693f52832f4ad9cb72d/Goo/Text/TextDocument.gs)

Stores editable text and versioned immutable snapshots.

### `Changed`

Occurs after one document transaction commits.

### `new`

Creates an empty document.

### `new(string)`

Creates a document from text without normalizing its line endings.

- `text`: The initial UTF-16 text.

### `Apply(TextChange)`

Applies one replacement against the current document version.

- `change`: The replacement to apply.

Returns: The committed change description.

### `ApplyTransaction(TextChange[])`

Applies ordered, non-overlapping replacements against the current version.

- `changes`: The replacements, interpreted against the pre-edit snapshot.

Returns: The committed change description.

### `BeginUndoGroup`

Starts an undo group. Nested groups commit when the outer group ends.

### `BreakUndoGroup`

Creates an undo boundary within an active group.

### `EndUndoGroup`

Ends an undo group and commits its pending edits as one history entry.

### `GetLineIndex(int32)`

Gets the logical line that contains a UTF-16 offset.

- `offset`: The zero-based UTF-16 offset.

Returns: The zero-based line index.

### `GetLineRange(int32)`

Gets the content range of a logical line, excluding its line ending.

- `line`: The zero-based line index.

Returns: The line content range.

### `GetLineText(int32)`

Gets the content of a logical line, excluding its line ending.

- `line`: The zero-based line index.

Returns: The line content.

### `GetText`

Gets all document text.

Returns: The complete document text.

### `GetText(TextRange)`

Gets text in a UTF-16 range.

- `textRange`: The range to read.

Returns: The text in the range.

### `Redo`

Reapplies the most recently reverted undo group.

Returns: True when a group was reapplied.

### `Snapshot`

Creates an immutable snapshot of the current document version.

Returns: The immutable snapshot.

### `Undo`

Reverts the most recent undo group.

Returns: True when a group was reverted.

### `CanRedo`

Gets whether a redo operation is available.

### `CanUndo`

Gets whether an undo operation is available.

### `Length`

Gets the document length in UTF-16 code units.

### `LineCount`

Gets the number of logical lines.

### `Version`

Gets the monotonically increasing document version.

## `TextDocumentChange`

Source:

- [`TextDocument.Models.gs`](https://github.com/obselate/goo/blob/5616973a1626ffc6cd0c3693f52832f4ad9cb72d/Goo/Text/TextDocument.Models.gs)

Describes a transaction with BeforeVersion, AfterVersion, and Changes.

## `TextEditorController`

Source:

- [`TextEditorController.gs`](https://github.com/obselate/goo/blob/5616973a1626ffc6cd0c3693f52832f4ad9cb72d/Goo/Text/TextEditorController.gs)

Owns editing state and semantic commands for one text document view.

### `new(TextDocument)`

Creates a controller for one document.

- `document`: The document edited by this controller.

### `Blur`

Clears focus and cancels transient IME composition.

### `BreakUndoGroup`

Creates an undo boundary without ending an active group.

### `CommitComposition`

Commits the current transient composition text.

Returns: True when default handling ran.

### `CommitComposition(string)`

Commits the supplied text over the current composition or selection.

- `text`: The committed text.

Returns: True when default handling ran.

### `Copy`

Gets the selected text after command interception.

Returns: The selected text, or an empty string when canceled.

### `Cut`

Gets and deletes the selected text after command interception.

Returns: The deleted text, or an empty string when canceled.

### `Dispose`

Releases document subscriptions held by this controller.

### `Execute(TextCommand)`

Dispatches and performs a semantic text-editor command. MoveLeft and MoveRight use visual order while mounted and logical document order otherwise.

- `command`: The command to dispatch.

Returns: True when default handling ran.

### `Focus`

Marks this controller focused.

### `ReplaceSelection(TextPresentationLayer,string,System.Collections.Generic.IReadOnlyList{TextStyleSpan})`

Replaces the selection with source text and persistent fragment-relative styles as one undoable edit.

- `layer`: The persistent formatting layer bound to this controller's document.
- `text`: The replacement source text.
- `fragmentRelativeStyles`: The replacement's inline styles, measured from zero.

Returns: True when the Paste interceptor allowed the edit.

### `ScrollTo(float64,float64)`

Changes the logical scroll target.

- `x`: The non-negative horizontal target.
- `y`: The non-negative vertical target.

### `UpdateComposition(string,int32,int32)`

Updates transient IME composition text and its selected segment.

- `text`: The transient preedit text.
- `selectionStart`: The UTF-16 selected-segment start.
- `selectionLength`: The UTF-16 selected-segment length.

Returns: True when default handling ran.

### `Composition`

Gets the transient IME composition, or nil when none is active.

### `DesiredHorizontalPosition`

Gets the desired horizontal caret position used by vertical movement.

### `Document`

Gets the document edited by this controller.

### `IndentWidth`

Gets or sets the number of columns in one indentation level.

### `IsFocused`

Gets whether this controller owns editor focus.

### `OnCommand`

Gets or sets the interceptor called before every semantic command.

### `OnSubmit`

Gets or sets the callback invoked by an accepted submit command.

### `Overwrite`

Gets or sets whether typed text overwrites following grapheme clusters.

### `ScrollTargetX`

Gets the horizontal scroll target in logical pixels.

### `ScrollTargetY`

Gets the vertical scroll target in logical pixels.

### `Selection`

Gets or sets the current selection.

### `TabWidth`

Gets or sets the number of columns between displayed tab stops.

### `UseTabs`

Gets or sets whether indentation inserts tabs instead of spaces.

## `TextPosition`

Source:

- [`TextDocument.Models.gs`](https://github.com/obselate/goo/blob/5616973a1626ffc6cd0c3693f52832f4ad9cb72d/Goo/Text/TextDocument.Models.gs)

Specifies a caret position with an Offset and Affinity.

## `TextPresentationLayer`

Source:

- [`TextPresentationLayer.gs`](https://github.com/obselate/goo/blob/5616973a1626ffc6cd0c3693f52832f4ad9cb72d/Goo/Text/TextPresentationLayer.gs)

Owns keyed text styles and atomic source projections for one document.

### `new(TextDocument)`

Creates a presentation layer bound to one document.

- `document`: The document whose source ranges this layer references.

### `ApplyTransaction(TextChange[],System.Collections.Generic.IReadOnlyList{TextStyleSpan})`

Commits source changes and the complete final style state as one undoable operation.

- `changes`: Ordered source replacements against the current document.
- `styles`: The complete post-edit style state. Projections retain normal rebase behavior.

Returns: The committed document change.

### `Clear`

Removes every style span and atomic projection from this layer.

### `Dispose`

Releases document subscriptions held by this layer.

### `GetStyles`

Returns an owned immutable snapshot of the layer's current source style spans.

Returns: Keyed source spans in declaration order.

### `Remove(string)`

Removes matching style and projection keys.

- `key`: The key to remove.

Returns: True when at least one item was removed.

### `RemoveProjection(string)`

Removes a keyed atomic projection.

- `key`: The projection key.

Returns: True when a projection was removed.

### `RemoveStyle(string)`

Removes a keyed style span.

- `key`: The style-span key.

Returns: True when a span was removed.

### `ReplaceStyles(System.Collections.Generic.IReadOnlyList{TextStyleSpan})`

Replaces every style span in this layer without changing its projections.

- `spans`: Ordered keyed inline styles. Later overlapping spans override earlier fields.

### `SetBlockSlot(string,TextRange,Blob)`

Adds or updates an atomic block Goo slot.

- `key`: The stable projection key.
- `textRange`: The source range represented by the slot.
- `content`: The retained block slot content.

### `SetHiddenRange(string,TextRange)`

Adds or updates a hidden atomic source range.

- `key`: The stable projection key.
- `textRange`: The source range to hide.

### `SetInlineSlot(string,TextRange,Blob)`

Adds or updates an atomic inline Goo slot.

- `key`: The stable projection key.
- `textRange`: The source range represented by the slot.
- `content`: The retained inline slot content.

### `SetReplacement(string,TextRange,string)`

Adds or updates an atomic source-range text replacement.

- `key`: The stable projection key.
- `textRange`: The source range to replace.
- `text`: The replacement text.

### `SetStyle(string,TextRange,Style)`

Adds or updates a keyed style span.

- `key`: The stable style-span key.
- `textRange`: The source range to style.
- `style`: Inline text fields only. Paragraph and box fields are rejected.

### `Document`

Gets the document whose source ranges this layer references.

### `Revision`

Gets the monotonic revision of presentation-layer mutations.

## `TextRange`

Source:

- [`TextDocument.Models.gs`](https://github.com/obselate/goo/blob/5616973a1626ffc6cd0c3693f52832f4ad9cb72d/Goo/Text/TextDocument.Models.gs)

Specifies a UTF-16 range with a Start offset and Length.

## `TextSelection`

Source:

- [`TextDocument.Models.gs`](https://github.com/obselate/goo/blob/5616973a1626ffc6cd0c3693f52832f4ad9cb72d/Goo/Text/TextDocument.Models.gs)

Specifies an Anchor and Active position for one text selection.

## `TextSnapshot`

Source:

- [`TextDocument.gs`](https://github.com/obselate/goo/blob/5616973a1626ffc6cd0c3693f52832f4ad9cb72d/Goo/Text/TextDocument.gs)

Provides an immutable, thread-safe view of one text document version.

### `GetLineIndex(int32)`

Gets the logical line that contains a UTF-16 offset.

- `offset`: The zero-based UTF-16 offset.

Returns: The zero-based line index.

### `GetLineRange(int32)`

Gets the content range of a logical line, excluding its line ending.

- `line`: The zero-based line index.

Returns: The line content range.

### `GetLineText(int32)`

Gets the content of a logical line, excluding its line ending.

- `line`: The zero-based line index.

Returns: The line content.

### `GetText`

Gets all text in this snapshot.

Returns: The complete snapshot text.

### `GetText(TextRange)`

Gets text in a UTF-16 range.

- `textRange`: The range to read.

Returns: The text in the range.

### `Length`

Gets the document length in UTF-16 code units.

### `LineCount`

Gets the number of logical lines.

### `Version`

Gets the version represented by this snapshot.

## `TextStyleProperties`

Source:

- [`TextStyleProperties.gs`](https://github.com/obselate/goo/blob/5616973a1626ffc6cd0c3693f52832f4ad9cb72d/Goo/Text/TextStyleProperties.gs)

Holds explicit FontFamily, FontSize in pixels, FontWeight, FontStyle, Color and TextDecoration declarations.

## `TextStyleRange`

Source:

- [`TextDocument.Models.gs`](https://github.com/obselate/goo/blob/5616973a1626ffc6cd0c3693f52832f4ad9cb72d/Goo/Text/TextDocument.Models.gs)

Specifies one ordered passive Text Style over a Range in source UTF-16 offsets. Later overlapping ranges override earlier fields. Use Text.TextTransform for transformations.

## `TextStyleSpan`

Source:

- [`TextPresentationLayer.gs`](https://github.com/obselate/goo/blob/5616973a1626ffc6cd0c3693f52832f4ad9cb72d/Goo/Text/TextPresentationLayer.gs)

Specifies a Key, source Range, and inline Style for one document span.
