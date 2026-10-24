# Goo.SpellCheck API

Generated from `Goo.SpellCheck.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo.SpellCheck`](../../Goo.SpellCheck)

## `ISpellingService`

Source:

- [`Spelling.gs`](../../Goo.SpellCheck/Spelling.gs)

Checks immutable text without changing the document or learning words.

### `CheckAsync(TextSnapshot,TextRange,string,System.Threading.CancellationToken)`

Checks a UTF-16 range, returning absolute source offsets.

### `SuggestAsync(TextSnapshot,TextRange,string,System.Threading.CancellationToken)`

Suggests replacements for the word in a UTF-16 source range.

## `Misspelling`

Source:

- [`Spelling.gs`](../../Goo.SpellCheck/Spelling.gs)

A misspelled word and its absolute UTF-16 source range.

## `SpellCheckSession`

Source:

- [`SpellCheckSession.gs`](../../Goo.SpellCheck/SpellCheckSession.gs)

Maintains an optional misspelling layer and explicit suggestion commands on the owner thread.

### `Updated`

Reports completed automatic or explicit checks on the owner thread.

### `new(Window,TextEditorController,SpellCheck.ISpellingService,string)`

Creates a session. Add Layer after persistent formatting in TextEditor.Layers.

### `ApplySuggestion(SpellCheck.SpellingSuggestions,int32)`

Replaces a still-current misspelling with one suggestion as a normal undoable edit.

### `CheckAsync(TextRange,System.Threading.CancellationToken)`

Checks a source range and discards stale results.

### `Dispose`

Cancels work, removes subscriptions and releases the presentation layer on the owner thread.

### `SuggestAsync(TextPosition,System.Threading.CancellationToken)`

Gets suggestions for the misspelling at a source position without moving the selection.

### `Language`

The explicit BCP 47 language. Changing it cancels and clears old diagnoses.

### `Layer`

The transient spelling layer. This session owns and disposes it.

### `ReadOnly`

Disables applying suggestions without disabling read-only checking.

## `SpellingResult`

Source:

- [`Spelling.gs`](../../Goo.SpellCheck/Spelling.gs)

Owned spelling results for one immutable document version and language.

## `SpellingStatus`

Source:

- [`Spelling.gs`](../../Goo.SpellCheck/Spelling.gs)

Reports a spelling operation independently of the returned words.

### Values

- `Success`
- `Unsupported`
- `LanguageUnavailable`
- `Disabled`
- `Cancelled`
- `Stale`
- `TooLarge`
- `Failed`

### `Cancelled`

The caller cancelled the operation.

### `Disabled`

Checking is disabled, the owner closed, or editing is read-only.

### `Failed`

The checker could not complete the operation.

### `LanguageUnavailable`

No dictionary supports the requested language.

### `Stale`

The document, selection or checker language changed.

### `Success`

The checker completed the operation.

### `TooLarge`

The requested text exceeds the checker limit.

### `Unsupported`

The platform or optional native checker is unavailable.

## `SpellingSuggestions`

Source:

- [`Spelling.gs`](../../Goo.SpellCheck/Spelling.gs)

Owned suggestions for one word at an absolute UTF-16 source range.

## `SystemSpellingService`

Source:

- [`SystemSpellingService.gs`](../../Goo.SpellCheck/SystemSpellingService.gs)

Uses Windows ISpellChecker or macOS NSSpellChecker. Other hosts return Unsupported.

### `CheckAsync(TextSnapshot,TextRange,string,System.Threading.CancellationToken)`

Checks a snapshot range using an installed dictionary for the explicit language.

### `SuggestAsync(TextSnapshot,TextRange,string,System.Threading.CancellationToken)`

Gets bounded replacement choices without learning or automatically correcting words.
