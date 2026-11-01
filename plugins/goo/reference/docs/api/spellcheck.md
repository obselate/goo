# SpellCheck API

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/SpellCheck`](https://github.com/obselate/goo/tree/main/Goo/SpellCheck)

## `HunspellSpellingService`

Source:

- [`HunspellSpellingService.gs`](https://github.com/obselate/goo/blob/main/Goo/SpellCheck/HunspellSpellingService.gs)

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

- [`Spelling.gs`](https://github.com/obselate/goo/blob/main/Goo/SpellCheck/Spelling.gs)

Checks immutable text without changing the document or learning words.

### `CheckAsync(TextSnapshot,TextRange,string,System.Threading.CancellationToken)`

Checks a UTF-16 range, returning absolute source offsets.

### `SuggestAsync(TextSnapshot,TextRange,string,System.Threading.CancellationToken)`

Suggests replacements for the word in a UTF-16 source range.

## `Misspelling`

Source:

- [`Spelling.gs`](https://github.com/obselate/goo/blob/main/Goo/SpellCheck/Spelling.gs)

A misspelled Word and its absolute UTF-16 source Range.

## `SpellCheckSession`

Source:

- [`SpellCheckSession.gs`](https://github.com/obselate/goo/blob/main/Goo/SpellCheck/SpellCheckSession.gs)
