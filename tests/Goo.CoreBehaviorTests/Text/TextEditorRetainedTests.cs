using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Goo;
using Xunit;

public sealed class TextEditorRetainedTests
{
    [Theory]
    [InlineData("office", 0)]
    [InlineData("a\u0301b", 0)]
    [InlineData("abc \u05e9\u05dc\u05d5\u05dd def", 0)]
    [InlineData("\u05e9\u05dc\u05d5\u05dd", 2)]
    public void CaretFastPathMatchesPreparedGeometry(string text, int direction)
    {
        using var shaped = TextShaping.Shape(text, "", 20, 400, false, 0, direction);
        var boundaries = new List<int>(StringInfo.ParseCombiningCharacters(text)) { text.Length };
        var expected = boundaries
            .SelectMany(index => new[]
            {
                (Index: index, Affinity: 0, X: shaped.CaretX(index, 0)),
                (Index: index, Affinity: 1, X: shaped.CaretX(index, 1)),
            })
            .ToArray();

        shaped.PrepareGeometry();

        foreach (var value in expected)
            Assert.InRange(Math.Abs(shaped.CaretX(value.Index, value.Affinity) - value.X), 0, 0.001);
    }

    [Fact]
    public void ProjectionLayersRejectOverlapAndRender()
    {
        var document = new TextDocument("abc");
        using var controller = new TextEditorController(document);
        using var first = new TextPresentationLayer(document);
        using var second = new TextPresentationLayer(document);
        first.SetReplacement("first", new TextRange(0, 1), "X");
        var node = Mount(new TextEditor(controller, new[] { first, second })
        {
            Width = 200.0,
            Height = 40.0,
        });

        var layout = TextEditorLayouts.For(node, 200, 40);
        Assert.Equal("Xbc", layout.Lines[0].Paragraph.Text);
        Assert.Throws<ArgumentException>(() =>
            second.SetHiddenRange("overlap", new TextRange(0, 1)));
    }

    [Fact]
    public void CompositionRendersWithoutEditingDocument()
    {
        var document = new TextDocument("ab");
        using var controller = new TextEditorController(document)
        {
            Selection = new TextSelection(
                new TextPosition(1, TextAffinity.Upstream),
                new TextPosition(1, TextAffinity.Downstream)),
        };
        var node = Mount(new TextEditor(controller) { Width = 200.0, Height = 40.0 });
        new Layout().Calculate(node, 200, 40);
        Assert.Equal("ab", TextEditorLayouts.For(node, 200, 40).Lines[0].Paragraph.Text);
        controller.UpdateComposition("xy", 1, 1);

        var layout = TextEditorLayouts.For(node, 200, 40);
        Assert.Contains(layout.Lines[0].Paragraph.Segments, segment => segment.Composition);
        Assert.Equal("axyb", layout.Lines[0].Paragraph.Text);
        Assert.Equal("ab", document.GetText());
        controller.UpdateComposition("X\nY", 3, 0);
        Assert.Equal("aX\nYb", TextEditorLayouts.For(node, 200, 40).Lines[0].Paragraph.Text);
        Assert.Equal("ab", document.GetText());

        Assert.True(controller.CommitComposition());
        Assert.Null(controller.Composition);
        Assert.Equal("aX\nYb", document.GetText());
        var committed = TextEditorLayouts.For(node, 200, 40);
        Assert.Equal(new[] { "aX", "Yb" }, committed.Lines.Select(line => line.Paragraph.Text));
        Assert.DoesNotContain(committed.Lines.SelectMany(line => line.Paragraph.Segments),
            segment => segment.Composition);
    }

    [Fact]
    public void SelectionOnlyChangesRetainVisualLayout()
    {
        var document = new TextDocument("abc");
        using var controller = new TextEditorController(document);
        var node = Mount(new TextEditor(controller) { Width = 200.0, Height = 40.0 });
        new Layout().Calculate(node, 200, 40);
        var before = TextEditorLayouts.For(node, 200, 40);

        controller.Selection = new TextSelection(
            new TextPosition(1, TextAffinity.Downstream),
            new TextPosition(1, TextAffinity.Downstream));

        Assert.Same(before, TextEditorLayouts.For(node, 200, 40));
    }

    [Fact]
    public void EditAfterViewportRetainsVisualLayout()
    {
        var document = new TextDocument(string.Join("\n", Enumerable.Range(0, 200)));
        using var controller = new TextEditorController(document);
        var node = Mount(new TextEditor(controller) { Width = 200.0, Height = 40.0 });
        var before = TextEditorLayouts.For(node, 200, 40);

        document.Apply(new TextChange(new TextRange(document.Length, 0), "\ntail"));

        Assert.Same(before, TextEditorLayouts.For(node, 200, 40));
        Assert.Equal(document.Version, before.Version);
    }

    [Fact]
    public void PresentationRebaseRetainsUnchangedViewportParagraph()
    {
        var document = new TextDocument("visible\nstyled");
        using var controller = new TextEditorController(document);
        using var layer = new TextPresentationLayer(document);
        layer.SetStyle("styled", new TextRange(8, 6), new Style { FontWeight = 700 });
        var node = Mount(new TextEditor(controller, new[] { layer })
        {
            Width = 200.0,
            Height = 1.0,
            OverscanLines = 0,
        });
        var before = TextEditorLayouts.For(node, 200, 1);
        var visible = Assert.Single(before.Lines);

        document.Apply(new TextChange(new TextRange(8, 0), "x"));

        var after = TextEditorLayouts.For(node, 200, 1);
        Assert.Same(visible, Assert.Single(after.Lines));
        Assert.Equal("visible", after.Lines[0].Paragraph.Text);
    }

    [Fact]
    public void InitialCrossLayerOverlapThrowsAtReconcile()
    {
        var document = new TextDocument("abc");
        using var controller = new TextEditorController(document);
        using var first = new TextPresentationLayer(document);
        using var second = new TextPresentationLayer(document);
        first.SetHiddenRange("first", new TextRange(0, 2));
        second.SetHiddenRange("second", new TextRange(1, 2));
        var editor = new TextEditor(controller, new[] { first, second });

        Assert.Throws<ArgumentException>(() => Mount(editor));
    }

    [Fact]
    public void PresentationStylesCascade()
    {
        var document = new TextDocument("styled");
        using var controller = new TextEditorController(document);
        using var first = new TextPresentationLayer(document);
        using var second = new TextPresentationLayer(document);
        first.SetStyle("syntax", new TextRange(0, 6), new Style
        {
            Color = Color.Rgb(255, 0, 0),
            FontFamily = "Arial",
            FontSize = 18,
            FontWeight = 650,
            FontStyle = FontStyle.Italic,
            LetterSpacing = 2,
            LineHeight = 1.5,
            TextDecoration = TextDecoration.Underline,
            TextStrokeWidth = 1,
            TextStrokeColor = Color.Rgb(0, 255, 0),
            Direction = Direction.RightToLeft,
            TextTransform = TextTransform.Uppercase,
        });
        second.SetStyle("diagnostic", new TextRange(0, 6), new Style
        {
            Color = Color.Rgb(0, 0, 255),
            FontWeight = 700,
        });
        var node = Mount(new TextEditor(controller, new[] { first, second })
        {
            Width = 240.0,
            Height = 60.0,
        });

        var layout = TextEditorLayouts.For(node, 240, 60);
        var run = Assert.Single(layout.Lines[0].Runs);

        Assert.Equal("STYLED", layout.Lines[0].Paragraph.Text);
        Assert.Equal(Color.Rgb(0, 0, 255), run.Style.Color);
        Assert.Equal("Arial", run.Style.FontFamily);
        Assert.Equal(18, run.Style.FontSize);
        Assert.Equal(700, run.Style.FontWeight);
        Assert.Equal(FontStyle.Italic, run.Style.FontStyle);
        Assert.Equal(2, run.Style.LetterSpacing);
        Assert.Equal(1.5f, run.Style.LineHeight);
        Assert.Equal(TextDecoration.Underline, run.Style.Decoration);
        Assert.Equal(1, run.Style.StrokeWidth);
        Assert.Equal(Color.Rgb(0, 255, 0), run.Style.StrokeColor);
        Assert.Equal(Direction.RightToLeft, run.Style.Direction);
        Assert.Equal(TextTransform.Uppercase, run.Style.Transform);
        Assert.Throws<ArgumentException>(() => first.SetStyle("paragraph", new TextRange(0, 1),
            new Style { TextWrap = TextWrap.NoWrap }));
    }

    [Fact]
    public void OverlappingPresentationStylesDoNotMutateTheBaseRun()
    {
        var document = new TextDocument("abcd");
        using var controller = new TextEditorController(document);
        using var layer = new TextPresentationLayer(document);
        layer.SetStyle("red", new TextRange(0, 3), new Style { Color = Color.Rgb(255, 0, 0) });
        layer.SetStyle("blue", new TextRange(1, 1), new Style { Color = Color.Rgb(0, 0, 255) });
        var node = Mount(new TextEditor(controller, new[] { layer })
        {
            Width = 240.0,
            Height = 40.0,
            Color = Color.Rgb(0, 255, 0),
        });

        var runs = Assert.Single(TextEditorLayouts.For(node, 240, 40).Lines).Runs;

        Assert.Equal(4, runs.Count);
        Assert.Equal(Color.Rgb(255, 0, 0), runs[0].Style.Color);
        Assert.Equal(Color.Rgb(0, 0, 255), runs[1].Style.Color);
        Assert.Equal(Color.Rgb(255, 0, 0), runs[2].Style.Color);
        Assert.Equal(Color.Rgb(0, 255, 0), runs[3].Style.Color);
    }

    [Fact]
    public void ReconciledLineHeightChangeRefreshesTheRetainedBaseStyle()
    {
        var document = new TextDocument("line");
        using var controller = new TextEditorController(document);
        var reconciler = new Reconciler { Res = new Resolver() };
        var node = reconciler.Mount(new TextEditor(controller)
        {
            Width = 240.0,
            Height = 80.0,
            Color = Color.Rgb(255, 0, 0),
            LineHeight = 1.0,
        });
        var before = Assert.Single(TextEditorLayouts.For(node, 240, 80).Lines);

        node = reconciler.Diff(node, new TextEditor(controller)
        {
            Width = 240.0,
            Height = 80.0,
            Color = Color.Rgb(0, 0, 255),
            LineHeight = 2.0,
        });
        var after = Assert.Single(TextEditorLayouts.For(node, 240, 80).Lines);

        Assert.Equal(Color.Rgb(255, 0, 0), before.Paragraph.BaseStyle!.Color);
        Assert.Equal(Color.Rgb(0, 0, 255), after.Paragraph.BaseStyle!.Color);
        Assert.Equal(2.0f, after.Paragraph.BaseStyle!.LineHeight);
        Assert.True(after.Height > before.Height);
    }

    [Fact]
    public void BlockSlotsBreakLines()
    {
        var document = new TextDocument("before X after");
        using var controller = new TextEditorController(document);
        using var layer = new TextPresentationLayer(document);
        layer.SetBlockSlot("block", new TextRange(7, 1), new Container { Width = 120.0, Height = 24.0 });
        var node = Mount(new TextEditor(controller, new[] { layer })
        {
            Width = 200.0,
            Height = 100.0,
        });
        new Layout().Calculate(node, 200, 100);

        var layout = TextEditorLayouts.For(node, 200, 100);
        var block = Assert.Single(layout.Lines, line => line.Slots.Any(slot => slot.Block));
        var slot = Assert.Single(block.Slots);

        Assert.True(block.Height >= 24);
        Assert.Equal(200, slot.Width);
        Assert.Contains(layout.Lines, line => line.Paragraph.Text.StartsWith("before"));
        Assert.Contains(layout.Lines, line => line.Paragraph.Text.EndsWith("after"));
    }

    [Fact]
    public void PrefixCacheFindsTheViewportParagraph()
    {
        var document = new TextDocument("X\nsecond\nthird");
        using var controller = new TextEditorController(document);
        using var layer = new TextPresentationLayer(document);
        layer.SetBlockSlot("block", new TextRange(0, 1), new Container { Width = 120.0, Height = 80.0 });
        var node = Mount(new TextEditor(controller, new[] { layer })
        {
            Width = 200.0,
            Height = 20.0,
            OverscanLines = 0,
        });
        new Layout().Calculate(node, 200, 20);
        var all = TextEditorLayouts.For(node, 200, -1);
        var firstHeight = Assert.Single(all.Lines, line => line.Slots.Any(slot => slot.Block)).Height;

        controller.ScrollTo(0, firstHeight);

        var viewport = TextEditorLayouts.For(node, 200, 20);
        Assert.Equal("second", viewport.Lines[0].Paragraph.Text);
    }

    [Fact]
    public void EmptyReplacementIsRejected()
    {
        var document = new TextDocument();
        using var layer = new TextPresentationLayer(document);

        Assert.Throws<ArgumentException>(() => layer.SetReplacement("empty", new TextRange(0, 0), "x"));
    }

    [Fact]
    public void EmptyDocumentCompositionRenders()
    {
        var document = new TextDocument();
        using var controller = new TextEditorController(document);
        var node = Mount(new TextEditor(controller) { Width = 200.0, Height = 40.0 });

        controller.UpdateComposition("x", 0, 0);

        var layout = TextEditorLayouts.For(node, 200, 40);
        Assert.Equal("x", layout.Lines[0].Paragraph.Text);
        Assert.Contains(layout.Lines[0].Paragraph.Segments, segment => segment.Composition);
    }

    [Fact]
    public void HorizontalCommandsUseVisualOrder()
    {
        var document = new TextDocument("abc אבג def");
        using var controller = new TextEditorController(document)
        {
            Selection = new TextSelection(
                new TextPosition(7, TextAffinity.Downstream),
                new TextPosition(7, TextAffinity.Downstream)),
        };
        var node = Mount(new TextEditor(controller) { Width = 240.0, Height = 40.0 });
        var position = controller.Selection.Active;
        var expected = TextEditorLayouts.MoveHorizontal(node, position, -1);

        Assert.NotNull(expected);
        controller.Execute(Command(TextCommandKind.MoveLeft));

        Assert.Equal(expected!.Value.Offset, controller.Selection.Active.Offset);
        Assert.Equal(expected.Value.Affinity, controller.Selection.Active.Affinity);
    }

    [Fact]
    public void VisualMovementUsesExtendedGraphemeBoundaries()
    {
        var document = new TextDocument("a\u0301fi");
        using var controller = new TextEditorController(document);
        var node = Mount(new TextEditor(controller)
        {
            Width = 200.0,
            Height = 40.0,
            TextWrap = TextWrap.NoWrap,
        });
        var priorX = float.NegativeInfinity;

        foreach (var offset in new[] { 0, 2, 3, 4 })
        {
            var rect = TextEditorLayouts.CaretRect(
                node, new TextPosition(offset, TextAffinity.Downstream));
            Assert.True(rect.X > priorX, $"offset={offset} prior={priorX} current={rect.X}");
            priorX = rect.X;
        }
    }

    [Fact]
    public void WrappedCaretsRespectAffinity()
    {
        var document = new TextDocument("aaaa aaaa");
        using var controller = new TextEditorController(document);
        var node = Mount(new TextEditor(controller)
        {
            Width = 45.0,
            Height = 100.0,
            FontSize = 16.0,
        });
        var layout = TextEditorLayouts.For(node, 45, 100);
        Assert.True(layout.Lines.Count >= 2);
        var boundary = layout.Lines[0].SourceEnd;
        Assert.Equal(boundary, layout.Lines[1].SourceStart);

        var upstream = TextEditorLayouts.CaretRect(
            node, new TextPosition(boundary, TextAffinity.Upstream));
        var downstream = TextEditorLayouts.CaretRect(
            node, new TextPosition(boundary, TextAffinity.Downstream));

        Assert.True(downstream.Y > upstream.Y);
    }

    [Fact]
    public void ReplacementsMapSourceAndDisplayOffsets()
    {
        var document = new TextDocument("za");
        using var controller = new TextEditorController(document);
        using var layer = new TextPresentationLayer(document);
        layer.SetReplacement("wide", new TextRange(0, 1), "WIDE");
        var node = Mount(new TextEditor(controller, new[] { layer })
        {
            Width = 200.0,
            Height = 40.0,
        });
        var paragraph = TextEditorLayouts.For(node, 200, 40).Lines[0].Paragraph;

        Assert.Equal("WIDEa", paragraph.Text);
        Assert.Equal(4, TextEditorLayouts.DisplayOffsetForSource(
            paragraph, 1, TextAffinity.Downstream));
        Assert.Equal(0, TextEditorLayouts.SourceOffsetForDisplay(
            paragraph, 1, TextAffinity.Upstream));
        Assert.Equal(1, TextEditorLayouts.SourceOffsetForDisplay(
            paragraph, 1, TextAffinity.Downstream));
    }

    [Fact]
    public void AtomicSlotEditsDeleteWholeSourceAndTrackUndoRedo()
    {
        var document = new TextDocument("a [[status]] b");
        using var controller = new TextEditorController(document);
        using var layer = new TextPresentationLayer(document);
        layer.SetInlineSlot("status", new TextRange(2, 10), new Text { Content = "Status" });
        var projection = Assert.Single(layer.ReadProjections());
        _ = Mount(new TextEditor(controller, new[] { layer })
        {
            Width = 240.0,
            Height = 40.0,
        });
        controller.Selection = new TextSelection(
            new TextPosition(12, TextAffinity.Downstream),
            new TextPosition(12, TextAffinity.Downstream));

        Assert.True(controller.Execute(Command(TextCommandKind.DeleteBackward)));
        Assert.Equal("a  b", document.GetText());
        Assert.Empty(layer.ReadProjections());
        Assert.Equal(1, document.Version);

        Assert.True(controller.Execute(Command(TextCommandKind.Undo)));
        Assert.Equal("a [[status]] b", document.GetText());
        Assert.Same(projection, Assert.Single(layer.ReadProjections()));

        Assert.True(controller.Execute(Command(TextCommandKind.Redo)));
        Assert.Equal("a  b", document.GetText());
        Assert.Empty(layer.ReadProjections());
    }

    [Fact]
    public void UnrelatedUndoDoesNotRestoreDeletedProjection()
    {
        var document = new TextDocument("a [[status]] b");
        using var controller = new TextEditorController(document);
        using var layer = new TextPresentationLayer(document);
        layer.SetInlineSlot("status", new TextRange(2, 10), new Text { Content = "Status" });
        _ = Mount(new TextEditor(controller, new[] { layer })
        {
            Width = 240.0,
            Height = 40.0,
        });
        controller.Selection = new TextSelection(
            new TextPosition(12, TextAffinity.Downstream),
            new TextPosition(12, TextAffinity.Downstream));
        controller.Execute(Command(TextCommandKind.DeleteBackward));
        document.Apply(new TextChange(new TextRange(0, 0), "!"));

        Assert.True(document.Undo());
        Assert.Equal("a  b", document.GetText());
        Assert.Empty(layer.ReadProjections());
    }

    [Fact]
    public void AtomicProjectionForwardDeleteAndReplacementUseWholeRange()
    {
        var forwardDocument = new TextDocument("a [[status]] b");
        using (var forwardController = new TextEditorController(forwardDocument))
        using (var forwardLayer = new TextPresentationLayer(forwardDocument))
        {
            forwardLayer.SetInlineSlot("status", new TextRange(2, 10),
                new Text { Content = "Status" });
            _ = Mount(new TextEditor(forwardController, new[] { forwardLayer })
            {
                Width = 240.0,
                Height = 40.0,
            });
            forwardController.Selection = new TextSelection(
                new TextPosition(2, TextAffinity.Upstream),
                new TextPosition(2, TextAffinity.Upstream));

            Assert.True(forwardController.Execute(Command(TextCommandKind.DeleteForward)));
            Assert.Equal("a  b", forwardDocument.GetText());
            Assert.Empty(forwardLayer.ReadProjections());
        }

        var replaceDocument = new TextDocument("a [[status]] b");
        using var replaceController = new TextEditorController(replaceDocument);
        using var replaceLayer = new TextPresentationLayer(replaceDocument);
        replaceLayer.SetInlineSlot("status", new TextRange(2, 10),
            new Text { Content = "Status" });
        var projection = Assert.Single(replaceLayer.ReadProjections());
        _ = Mount(new TextEditor(replaceController, new[] { replaceLayer })
        {
            Width = 240.0,
            Height = 40.0,
        });
        replaceController.Selection = new TextSelection(
            new TextPosition(4, TextAffinity.Upstream),
            new TextPosition(6, TextAffinity.Downstream));

        Assert.True(replaceController.Execute(Command(TextCommandKind.Insert, "ok")));
        Assert.Equal("a ok b", replaceDocument.GetText());
        Assert.Empty(replaceLayer.ReadProjections());
        Assert.True(replaceController.Execute(Command(TextCommandKind.Undo)));
        Assert.Equal("a [[status]] b", replaceDocument.GetText());
        Assert.Same(projection, Assert.Single(replaceLayer.ReadProjections()));
    }

    [Fact]
    public void AtomicProjectionBoundaryInsertionsStayVisible()
    {
        var beforeDocument = new TextDocument("a [[status]] b");
        using (var beforeController = new TextEditorController(beforeDocument))
        using (var beforeLayer = new TextPresentationLayer(beforeDocument))
        {
            beforeLayer.SetInlineSlot("status", new TextRange(2, 10),
                new Text { Content = "Status" });
            _ = Mount(new TextEditor(beforeController, new[] { beforeLayer })
            {
                Width = 240.0,
                Height = 40.0,
            });
            beforeController.Selection = new TextSelection(
                new TextPosition(2, TextAffinity.Upstream),
                new TextPosition(2, TextAffinity.Upstream));

            Assert.True(beforeController.Execute(Command(TextCommandKind.Insert, "x")));
            Assert.Equal("a x[[status]] b", beforeDocument.GetText());
            Assert.Equal(new TextRange(3, 10), Assert.Single(beforeLayer.ReadProjections()).Range);
        }

        var afterDocument = new TextDocument("a [[status]] b");
        using var afterController = new TextEditorController(afterDocument);
        using var afterLayer = new TextPresentationLayer(afterDocument);
        afterLayer.SetInlineSlot("status", new TextRange(2, 10),
            new Text { Content = "Status" });
        _ = Mount(new TextEditor(afterController, new[] { afterLayer })
        {
            Width = 240.0,
            Height = 40.0,
        });
        afterController.Selection = new TextSelection(
            new TextPosition(12, TextAffinity.Downstream),
            new TextPosition(12, TextAffinity.Downstream));

        Assert.True(afterController.Execute(Command(TextCommandKind.Insert, "x")));
        Assert.Equal("a [[status]]x b", afterDocument.GetText());
        Assert.Equal(new TextRange(2, 10), Assert.Single(afterLayer.ReadProjections()).Range);
    }

    [Fact]
    public void AtomicProjectionOutdentAndGroupedUndoRemainAtomic()
    {
        var outdentDocument = new TextDocument("\tstatus\nnext");
        using (var outdentController = new TextEditorController(outdentDocument))
        using (var outdentLayer = new TextPresentationLayer(outdentDocument))
        {
            outdentLayer.SetInlineSlot("status", new TextRange(0, 7),
                new Text { Content = "Status" });
            var projection = Assert.Single(outdentLayer.ReadProjections());
            _ = Mount(new TextEditor(outdentController, new[] { outdentLayer })
            {
                Width = 240.0,
                Height = 80.0,
            });

            Assert.True(outdentController.Execute(Command(TextCommandKind.Outdent)));
            Assert.Equal("\nnext", outdentDocument.GetText());
            Assert.Empty(outdentLayer.ReadProjections());
            Assert.True(outdentController.Execute(Command(TextCommandKind.Undo)));
            Assert.Same(projection, Assert.Single(outdentLayer.ReadProjections()));
        }

        var groupedDocument = new TextDocument("x[[status]]");
        using var groupedController = new TextEditorController(groupedDocument);
        using var groupedLayer = new TextPresentationLayer(groupedDocument);
        groupedLayer.SetInlineSlot("status", new TextRange(1, 10),
            new Text { Content = "Status" });
        var groupedProjection = Assert.Single(groupedLayer.ReadProjections());
        _ = Mount(new TextEditor(groupedController, new[] { groupedLayer })
        {
            Width = 240.0,
            Height = 40.0,
        });
        groupedController.Selection = new TextSelection(
            new TextPosition(11, TextAffinity.Downstream),
            new TextPosition(11, TextAffinity.Downstream));

        groupedController.Execute(Command(TextCommandKind.DeleteBackward));
        groupedController.Execute(Command(TextCommandKind.DeleteBackward));
        Assert.Equal("", groupedDocument.GetText());
        Assert.True(groupedController.Execute(Command(TextCommandKind.Undo)));
        Assert.Equal("x[[status]]", groupedDocument.GetText());
        Assert.Same(groupedProjection, Assert.Single(groupedLayer.ReadProjections()));
        Assert.True(groupedController.Execute(Command(TextCommandKind.Redo)));
        Assert.Equal("", groupedDocument.GetText());
        Assert.Empty(groupedLayer.ReadProjections());
    }

    [Fact]
    public void TextTransformUpdatesParagraph()
    {
        var document = new TextDocument("abc");
        using var controller = new TextEditorController(document);
        var reconciler = new Reconciler { Res = new Resolver() };
        var node = reconciler.Mount(new TextEditor(controller)
        {
            Width = 200.0,
            Height = 40.0,
        });
        Assert.Equal("abc", TextEditorLayouts.For(node, 200, 40).Lines[0].Paragraph.Text);

        node = reconciler.Diff(node, new TextEditor(controller)
        {
            Width = 200.0,
            Height = 40.0,
            TextTransform = TextTransform.Uppercase,
        });

        Assert.Equal("ABC", TextEditorLayouts.For(node, 200, 40).Lines[0].Paragraph.Text);
    }

    private static Node Mount(TextEditor editor)
    {
        var reconciler = new Reconciler { Res = new Resolver() };
        return reconciler.Mount(editor);
    }

    private static TextCommand Command(TextCommandKind kind, string text = "") =>
        new(kind, text, false);
}
