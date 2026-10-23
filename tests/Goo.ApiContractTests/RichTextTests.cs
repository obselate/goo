using System;
using System.Linq;
using System.Text;
using Goo;
using Goo.RichText;
using Xunit;

namespace Goo.ApiContractTests;

public sealed class RichTextTests
{
    [Fact]
    public void HtmlAndRtfRoundTripPersistentUnicodeStyles()
    {
        const string text = "red 😀\r\nsecond\tline";
        var style = new Style
        {
            FontFamily = "DejaVu Sans", FontSize = 20, FontWeight = 700, FontStyle = FontStyle.Italic,
            Color = Color.Rgb(210, 30, 40), TextDecoration = TextDecoration.Underline | TextDecoration.LineThrough
        };
        var fragment = new RichTextFragment(text, [new TextStyleSpan("format", new TextRange(0, text.Length), style)]);
        var data = RichTextCodec.Write(fragment);
        foreach (var type in new[] { "text/html", "text/rtf" })
        {
            var bytes = data.Representations.Single(value => value.ContentType == type).Bytes;
            var decoded = RichTextCodec.Read(type, bytes);
            Assert.Equal(RichTextStatus.Success, decoded.Status);
            Assert.Equal(text, decoded.Fragment.Text);
            Assert.Single(decoded.Fragment.Styles);
            Assert.True(style.TryGetTextStyle(out var expected));
            Assert.True(decoded.Fragment.Styles[0].Style.TryGetTextStyle(out var actual));
            Assert.Equal(expected, actual);
        }
        var html = RichTextCodec.Read("text/html", Encoding.UTF8.GetBytes("<p><b>A&amp;😀</b></p><p>B<br>C</p>"));
        Assert.Equal("A&😀\nB\nC", html.Fragment.Text);
        Assert.Equal(RichTextStatus.UnsupportedContent,
            RichTextCodec.Read("text/html", Encoding.UTF8.GetBytes("<table><tr><td>x</td></tr></table>")).Status);
        Assert.Equal(RichTextStatus.UnsupportedContent,
            RichTextCodec.Read("text/rtf", Encoding.ASCII.GetBytes("{\\rtf1 {\\pict content}}")).Status);
        var encoded = RichTextCodec.Read("text/rtf", Encoding.ASCII.GetBytes("{\\rtf1\\ansi\\ansicpg1252 caf\\'e9 \\uc2\\u233??}"));
        Assert.Equal("café é", encoded.Fragment.Text);
    }

    [Fact]
    public void RichReplacementFormattingAndTextShareUndoHistory()
    {
        var document = new TextDocument("abc");
        using var controller = new TextEditorController(document);
        using var layer = new TextPresentationLayer(document);
        var red = new Style { Color = Color.Rgb(210, 30, 40) };
        var bold = new Style { FontWeight = 700 };
        layer.SetStyle("old", new TextRange(0, 3), red);
        var owned = layer.GetStyles();
        var callbacks = 0;
        controller.OnCommand = command => { if (command.Command.Kind == TextCommandKind.Paste) callbacks++; };
        controller.Selection = Selection(0, 3);
        Assert.True(controller.ReplaceSelection(layer, "abc", [new TextStyleSpan("new", new TextRange(0, 3), bold)]));
        Assert.Equal(1, callbacks);
        Assert.Equal("abc", document.GetText());
        Assert.Equal(3, controller.Selection.Active.Offset);
        Assert.True(layer.GetStyles().Single().Style.TryGetTextStyle(out var applied));
        Assert.Equal(700, applied.FontWeight);
        Assert.True(document.Undo());
        Assert.Equal("abc", document.GetText());
        Assert.Equal("old", layer.GetStyles().Single().Key);
        Assert.True(document.Redo());
        Assert.True(layer.GetStyles().Single().Style.TryGetTextStyle(out var restored));
        Assert.Equal(applied, restored);
        Assert.Equal("old", owned.Single().Key);
        layer.ApplyTransaction([], [new TextStyleSpan("only", new TextRange(1, 1), red)]);
        Assert.True(document.Undo());
        Assert.Equal(applied, Properties(layer));
        document.Apply(new TextChange(new TextRange(3, 0), "d"));
        Assert.False(document.CanRedo);
        controller.Selection = Selection(1, 2);
        Assert.True(controller.ReplaceSelection(layer, "😀", [new TextStyleSpan("emoji", new TextRange(0, 2), red)]));
        Assert.Equal("a😀cd", document.GetText());
        Assert.True(document.Undo());
        Assert.Equal("abcd", document.GetText());
        Assert.Throws<ArgumentOutOfRangeException>(() => layer.ApplyTransaction([], [new TextStyleSpan("bad", new TextRange(99, 1), red)]));
        Assert.Equal("abcd", document.GetText());
    }

    private static TextSelection Selection(int start, int end) => new(
        new TextPosition(start, TextAffinity.Upstream), new TextPosition(end, TextAffinity.Downstream));
    private static TextStyleProperties Properties(TextPresentationLayer layer)
    {
        Assert.True(layer.GetStyles().Single().Style.TryGetTextStyle(out var style));
        return style;
    }
}
