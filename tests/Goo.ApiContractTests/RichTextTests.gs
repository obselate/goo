package Goo.ApiContractTests

import Goo
import Goo.RichText
import System
import System.Linq
import System.Text
import Xunit

public class RichTextTests {
    @Fact
    public func HtmlAndRtfRoundTripPersistentUnicodeStyles() {
        const text string = "red 😀\r\nsecond\tline"
        let style = Style{FontFamily: "DejaVu Sans", FontSize: 20, FontWeight: 700, FontStyle: FontStyle.Italic,
            Color: Color.Rgb(210, 30, 40), TextDecoration: TextDecoration.Underline | TextDecoration.LineThrough}
        let fragment = RichTextFragment(text, []TextStyleSpan{TextStyleSpan("format", TextRange(0, text.Length), style)})
        let data = RichTextCodec.Write(fragment)
        for type in []string{"text/html", "text/rtf"} {
            let bytes = data.Representations.Single(value -> value.ContentType == type).Bytes
            let decoded = RichTextCodec.Read(type, bytes)
            Assert.Equal(RichTextStatus.Success, decoded.Status)
            Assert.Equal(text, decoded.Fragment.Text)
            Assert.Single(decoded.Fragment.Styles)
            Assert.True(style.TryGetTextStyle(out var expected))
            Assert.True(decoded.Fragment.Styles[0].Style.TryGetTextStyle(out var actual))
            Assert.Equal(expected, actual)
        }
        let html = RichTextCodec.Read("text/html", Encoding.UTF8.GetBytes("<p><b>A&amp;😀</b></p><p>B<br>C</p>"))
        Assert.Equal("A&😀\nB\nC", html.Fragment.Text)
        Assert.Equal(RichTextStatus.UnsupportedContent,
            RichTextCodec.Read("text/html", Encoding.UTF8.GetBytes("<table><tr><td>x</td></tr></table>")).Status)
        Assert.Equal(RichTextStatus.UnsupportedContent,
            RichTextCodec.Read("text/rtf", Encoding.ASCII.GetBytes("{\\rtf1 {\\pict content}}")).Status)
        let encoded = RichTextCodec.Read("text/rtf", Encoding.ASCII.GetBytes("{\\rtf1\\ansi\\ansicpg1252 caf\\'e9 \\uc2\\u233??}"))
        Assert.Equal("café é", encoded.Fragment.Text)
    }

    @Fact
    public func RichReplacementFormattingAndTextShareUndoHistory() {
        let document = TextDocument("abc")
        using let controller = TextEditorController(document)
        using let layer = TextPresentationLayer(document)
        let red = Style{Color: Color.Rgb(210, 30, 40)}
        let bold = Style{FontWeight: 700}
        layer.SetStyle("old", TextRange(0, 3), red)
        let owned = layer.GetStyles()
        var callbacks = 0
        controller.OnCommand = command -> {
            if command.Command.Kind == TextCommandKind.Paste { callbacks++ }
        }
        controller.Selection = Selection(0, 3)
        Assert.True(controller.ReplaceSelection(layer, "abc", []TextStyleSpan{TextStyleSpan("new", TextRange(0, 3), bold)}))
        Assert.Equal(1, callbacks)
        Assert.Equal("abc", document.GetText())
        Assert.Equal(3, controller.Selection.Active.Offset)
        Assert.True(layer.GetStyles().Single().Style.TryGetTextStyle(out var applied))
        Assert.Equal[float64?](700.0, applied.FontWeight)
        Assert.True(document.Undo())
        Assert.Equal("abc", document.GetText())
        Assert.Equal("old", layer.GetStyles().Single().Key)
        Assert.True(document.Redo())
        Assert.True(layer.GetStyles().Single().Style.TryGetTextStyle(out var restored))
        Assert.Equal(applied, restored)
        Assert.Equal("old", owned.Single().Key)
        layer.ApplyTransaction(Array.Empty[TextChange](), []TextStyleSpan{TextStyleSpan("only", TextRange(1, 1), red)})
        Assert.True(document.Undo())
        Assert.Equal(applied, Properties(layer))
        document.Apply(TextChange(TextRange(3, 0), "d"))
        Assert.False(document.CanRedo)
        controller.Selection = Selection(1, 2)
        Assert.True(controller.ReplaceSelection(layer, "😀", []TextStyleSpan{TextStyleSpan("emoji", TextRange(0, 2), red)}))
        Assert.Equal("a😀cd", document.GetText())
        Assert.True(document.Undo())
        Assert.Equal("abcd", document.GetText())
        Assert.Throws[ArgumentOutOfRangeException](() -> layer.ApplyTransaction(Array.Empty[TextChange](),
            []TextStyleSpan{TextStyleSpan("bad", TextRange(99, 1), red)}))
        Assert.Equal("abcd", document.GetText())
    }

    shared {
        private func Selection(start int32, end int32) TextSelection -> TextSelection(
            TextPosition(start, TextAffinity.Upstream), TextPosition(end, TextAffinity.Downstream))

        private func Properties(layer TextPresentationLayer) TextStyleProperties {
            Assert.True(layer.GetStyles().Single().Style.TryGetTextStyle(out var style))
            return style
        }
    }
}
