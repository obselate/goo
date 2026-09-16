using System;
using Goo;
using Xunit;

public sealed class TextEditorInputTests
{

    [Fact]
    public void PointerJitterDoesNotCollapseWordOrLineSelection()
    {
        var document = new TextDocument("one two\nthree");
        using var controller = new TextEditorController(document);
        var driver = new InputFixtureDriver(new TextEditorInputCell(document, controller), 320, 120);
        var editor = driver.Window.Tree!;
        var caret = TextEditorLayouts.CaretRect(editor,
            new TextPosition(1, TextAffinity.Downstream));
        var x = editor.Rect.X + caret.X + 0.5f;
        var y = editor.Rect.Y + caret.Y + caret.H * 0.5f;

        driver.Press(x, y);
        driver.Release(x, y);
        driver.Press(x, y);
        driver.Move(x + 1, y);
        driver.Release(x + 1, y);
        Assert.Equal(new TextRange(0, 3), SelectionRange(controller.Selection));

        driver.Press(x, y);
        driver.Move(x + 1, y);
        driver.Release(x + 1, y);
        Assert.Equal(new TextRange(0, 7), SelectionRange(controller.Selection));
    }

    private static TextRange SelectionRange(TextSelection selection)
    {
        var start = Math.Min(selection.Anchor.Offset, selection.Active.Offset);
        var end = Math.Max(selection.Anchor.Offset, selection.Active.Offset);
        return new TextRange(start, end - start);
    }
}
