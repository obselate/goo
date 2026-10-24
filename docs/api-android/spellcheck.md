# SpellCheck API

Generated from `Goo.Android.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo.Android/SpellCheck`](../../Goo.Android/SpellCheck)

## `AndroidSpellingService`

Source:

- [`AndroidSpellingService.gs`](../../Goo.Android/SpellCheck/AndroidSpellingService.gs)

Uses the user-enabled Android spell service. Submit only text that the app permits the service to read.

### `new(Android.Content.Context)`

Creates an adapter using the application context. Requests must start on the Android main thread.

### `CheckAsync(TextSnapshot,TextRange,string,System.Threading.CancellationToken)`

Checks a snapshot with an explicit locale and absolute UTF-16 result ranges.

### `SuggestAsync(TextSnapshot,TextRange,string,System.Threading.CancellationToken)`

Gets suggestions for the supplied word through the same sentence-suggestion API.
