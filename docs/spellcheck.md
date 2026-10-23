# Spell checking

```cs
var service = new SystemSpellingService();
using var spelling = new SpellCheckSession(window, controller, service, "en-US");
var editor = new TextEditor(controller, [spelling.Layer]);
var result = await spelling.CheckAsync(new TextRange(0, controller.Document.Length));
```

Create and use the session on the window thread. Dispose it when the editor is removed.

| Package | Checker |
| --- | --- |
| `Goo.SpellCheck` | Windows ISpellChecker and macOS NSSpellChecker |
| `Goo.SpellCheck.Hunspell` | System `libhunspell-1.7.so.0` and app-selected `.aff`/`.dic` files |
| `Goo.SpellCheck.Android` | User-enabled Android SpellCheckerSession |

```cs
using var service = new HunspellSpellingService("en-US", affPath, dictionaryPath);
```

```cs
var service = new AndroidSpellingService(context);
```

Choose one service. Hunspell ships no native library or dictionaries.

## Suggestions

```cs
var choices = await spelling.SuggestAsync(controller.Selection.Active);
window.Post(() => spelling.ApplySuggestion(choices, selectedIndex));
```

Show `choices.Values` in your menu. Run `ApplySuggestion` on the window thread.

- Changes check the affected paragraphs after a short delay.
- Each request accepts at most 65,536 UTF-16 units. Split longer checks at paragraph boundaries.
- Result ranges use UTF-16 source offsets.
- The mark is a straight underline. Add the spelling layer after persistent formatting.
- Set `spelling.ReadOnly` to the editor's `ReadOnly` value.
- Suggestions use normal undo. Changed text or language returns `Stale`.
- Active IME composition blocks suggestion edits.
- `LanguageUnavailable` means no installed dictionary matches the requested language.
- `Unsupported` means the platform, library or dictionary encoding cannot serve the request.
- `Disabled`, `Cancelled`, `TooLarge` and `Failed` are not successful empty checks.
- macOS checker calls run on the main thread. Android requests start on the main thread.
- Hunspell checks words, not sentence grammar. Word boundaries vary by language.
- Do not check passwords. Android's selected service can read submitted text.
- Link pending app work to `Window.Closed`. Teardown can discard an accepted `Post`.
