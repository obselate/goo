# Text API

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/Text`](../../Goo/Text)

## `FontSource`

Source:

- [`FontSource.gs`](../../Goo/Text/FontSource.gs)

Owns one font face and its registration state.

### `new(string,int32,bool,System.Byte[])`

Creates a font source for the default face and variation set.

### `new(string,int32,bool,System.Byte[],System.UInt32,FontVariation[])`

Creates a font source for a face and variation set.

### `Dispose`

Releases the source and unregisters it when necessary.

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

- [`FontSource.gs`](../../Goo/Text/FontSource.gs)

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

## `TextChange`

Source:

- [`TextDocument.Models.gs`](../../Goo/Text/TextDocument.Models.gs)

Specifies one replacement with a Range and InsertedText.

## `TextCommand`

Source:

- [`TextEditorController.gs`](../../Goo/Text/TextEditorController.gs)

Describes an operation with a Kind, Text, and ExtendSelection flag.

## `TextCommandEvent`

Source:

- [`TextEditorController.gs`](../../Goo/Text/TextEditorController.gs)

Provides mutable cancellation state before a text-editor command runs.

### `Cancel`

Gets or sets whether Goo skips its default command behavior.

### `Command`

Gets the semantic command being dispatched.

## `TextCommandKind`

Source:

- [`TextEditorController.gs`](../../Goo/Text/TextEditorController.gs)

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

## `TextComposition`

Source:

- [`TextEditorController.gs`](../../Goo/Text/TextEditorController.gs)

Describes preedit Range, Text, SelectionStart, and SelectionLength values.

## `TextDocument`

Source:

- [`TextDocument.gs`](../../Goo/Text/TextDocument.gs)

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

- [`TextDocument.Models.gs`](../../Goo/Text/TextDocument.Models.gs)

Describes a transaction with BeforeVersion, AfterVersion, and Changes.

## `TextEditorController`

Source:

- [`TextEditorController.gs`](../../Goo/Text/TextEditorController.gs)

Owns editing state and semantic commands for one text document view.

### `new(TextDocument)`

Creates a controller for one document.

- `document`: The document edited by this controller.

### `Blur`

Clears focus and cancels transient IME composition.

### `BreakUndoGroup`

Creates an undo boundary without ending a currently active group.

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

### `IsFocused`

Gets whether this controller currently owns editor focus.

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

## `TextPosition`

Source:

- [`TextDocument.Models.gs`](../../Goo/Text/TextDocument.Models.gs)

Specifies a caret position with an Offset and Affinity.

## `TextPresentationLayer`

Source:

- [`TextPresentationLayer.gs`](../../Goo/Text/TextPresentationLayer.gs)

Owns keyed text styles and atomic source projections for one document.

### `new(TextDocument)`

Creates a presentation layer bound to one document.

- `document`: The document whose source ranges this layer references.

### `Clear`

Removes every style span and atomic projection from this layer.

### `Dispose`

Releases document subscriptions held by this layer.

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

- [`TextDocument.Models.gs`](../../Goo/Text/TextDocument.Models.gs)

Specifies a UTF-16 range with a Start offset and Length.

## `TextSelection`

Source:

- [`TextDocument.Models.gs`](../../Goo/Text/TextDocument.Models.gs)

Specifies an Anchor and Active position for one text selection.

## `TextSnapshot`

Source:

- [`TextDocument.gs`](../../Goo/Text/TextDocument.gs)

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

## `TextStyleRange`

Source:

- [`TextDocument.Models.gs`](../../Goo/Text/TextDocument.Models.gs)

Specifies one ordered passive Text Style over a Range in source UTF-16 offsets. Later overlapping ranges override earlier fields. Use Text.TextTransform for transformations.
