# Goo.SpellCheck.Hunspell API

Generated from `Goo.SpellCheck.Hunspell.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo.SpellCheck.Hunspell`](../../Goo.SpellCheck.Hunspell)

## `HunspellSpellingService`

Source:

- [`HunspellSpellingService.gs`](../../Goo.SpellCheck.Hunspell/HunspellSpellingService.gs)

Uses the installed Linux Hunspell 1.7 library and app-selected dictionary files. No assets are downloaded.

### `new(string,string,string)`

Configures the explicit BCP 47 language and .aff/.dic paths. Missing native support is an operation status.

### `CheckAsync(TextSnapshot,TextRange,string,System.Threading.CancellationToken)`

Checks dictionary words and returns source UTF-16 ranges without normalizing the input.

### `Dispose`

Waits for any active request and releases the dictionary and system library.

### `SuggestAsync(TextSnapshot,TextRange,string,System.Threading.CancellationToken)`

Gets dictionary suggestions, decoding the dictionary's declared encoding.
