# SpellCheck API

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/SpellCheck`](https://github.com/obselate/goo/tree/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/SpellCheck)

## `HunspellSpellingService`

Source:

- [`HunspellSpellingService.gs`](https://github.com/obselate/goo/blob/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/SpellCheck/HunspellSpellingService.gs)

Uses the installed Linux Hunspell 1.7 library and app-selected dictionary files. No assets are downloaded.

### `new(string,string,string)`

Configures the explicit BCP 47 language and .aff/.dic paths. Missing native support is an operation status.

### `CheckAsync(TextSnapshot,TextRange,string,System.Threading.CancellationToken)`

Checks dictionary words and returns source UTF-16 ranges without normalizing the input.

### `Dispose`

Waits for any active request and releases the dictionary and system library.

### `SuggestAsync(TextSnapshot,TextRange,string,System.Threading.CancellationToken)`

Gets dictionary suggestions, decoding the dictionary's declared encoding.

## `ISpellingService`

Source:

- [`Spelling.gs`](https://github.com/obselate/goo/blob/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/SpellCheck/Spelling.gs)

Checks immutable text without changing the document or learning words.

### `CheckAsync(TextSnapshot,TextRange,string,System.Threading.CancellationToken)`

Checks a UTF-16 range, returning absolute source offsets.

### `SuggestAsync(TextSnapshot,TextRange,string,System.Threading.CancellationToken)`

Suggests replacements for the word in a UTF-16 source range.

## `Misspelling`

Source:

- [`Spelling.gs`](https://github.com/obselate/goo/blob/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/SpellCheck/Spelling.gs)

A misspelled Word and its absolute UTF-16 source Range.

## `SpellCheckSession`

Source:

- [`SpellCheckSession.gs`](https://github.com/obselate/goo/blob/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/SpellCheck/SpellCheckSession.gs)

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

- [`Spelling.gs`](https://github.com/obselate/goo/blob/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/SpellCheck/Spelling.gs)

Owned spelling Status, document Version, Language, Errors and optional Error detail.

## `SpellingStatus`

Source:

- [`Spelling.gs`](https://github.com/obselate/goo/blob/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/SpellCheck/Spelling.gs)

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

- [`Spelling.gs`](https://github.com/obselate/goo/blob/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/SpellCheck/Spelling.gs)

Suggestion Status, document Version, Language, source Range, Word, Values and optional Error detail.

## `SystemSpellingService`

Source:

- [`SystemSpellingService.gs`](https://github.com/obselate/goo/blob/d6099a4268d148253a82e6d53a56cba17134c7fc/Goo/SpellCheck/SystemSpellingService.gs)

Uses Windows ISpellChecker or macOS NSSpellChecker. Other hosts return Unsupported.

### `new`

Creates a system spelling service without opening a native checker.

### `CheckAsync(TextSnapshot,TextRange,string,System.Threading.CancellationToken)`

Checks a snapshot range using an installed dictionary for the explicit language.

### `SuggestAsync(TextSnapshot,TextRange,string,System.Threading.CancellationToken)`

Gets bounded replacement choices without learning or automatically correcting words.
