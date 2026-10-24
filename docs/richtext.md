# Rich text clipboard

```gsharp
import Goo
import Goo.RichText

using let formatting = TextPresentationLayer(controller.Document)
using let clipboard = RichTextClipboard(window, controller, formatting)
let editor = TextEditor(controller, []TextPresentationLayer{formatting})
clipboard.Completed += result -> ShowStatus(result.Status)
```

Rich text clipboard support is included in `Goo`. Remove the old `Goo.RichText` package reference. Keep `import Goo.RichText`.
Create and dispose the binding on the window thread. Keep pumping Goo during clipboard requests.

```gsharp
clipboard.ReadOnly = true
let result = await clipboard.CopyAsync()
```

Set `ReadOnly` on both the editor and the binding. Copy remains available.

## Supported content

| Content | Round-trip |
| --- | --- |
| Unicode source text | UTF-16 ranges, line breaks and tabs |
| Font | One family, pixel size, normal or bold weight, normal or italic style |
| Color | Opaque 8-bit foreground color |
| Lines | Underline and strike-through |
| HTML | Inline tags and CSS, entities, paragraphs and line breaks |
| RTF | Font and color tables, groups, code pages, Unicode fallback escapes |

- RTF font size uses half-points. A Goo size must be a multiple of two-thirds of a pixel.
- HTML can import other numeric weights. Copy reports `UnsupportedContent` if RTF cannot preserve them.
- Source formatting comes only from the supplied layer. Spelling overlays, caret state and slot children are not copied.
- Images, tables, paragraph layout and unsupported declarations return `UnsupportedContent` before an edit.
- Parsing limits are 16 MiB encoded data, 1 Mi UTF-16 units, 4096 styles and 64 nested groups.
- HTML and RTF round-trip their supported text and inline styles. Markup bytes are normalized.

## Paste

```gsharp
var result = await clipboard.PasteAsync()
if result.Status == RichTextStatus.UnsupportedContent {
    result = await clipboard.PastePlainTextAsync()
}
```

`PasteAsync` prefers HTML, then RTF. It uses plain text only when no rich representation is present.

- A paste replaces the captured selection as one undo step.
- Supplied Paste text and direct styled replacements do not read the clipboard.
- Changed text, selection, formatting, composition or read-only state returns `Stale`.
- Cut publishes Copy intent. It deletes only after publication succeeds and the captured state still matches.
- A stale Cut leaves the text intact. The clipboard can already contain the copied selection.
- One publication contains plain text, HTML and RTF. Native publication failure can replace the old clipboard.
- Android HTML uses the native text clip. RTF is offered through an exact-MIME document reference for compatible consumers.
- MIME transport comes from the Window host. The binding does not install another native clipboard adapter.
