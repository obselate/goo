package Goo.CoreBehaviorTests

import Goo
import Goo.RichText
import Goo.Svg
import System
import System.IO
import Xunit

class ContentContractTests {
    @Fact
    func EllipsisFitsResolvedInlineTypography() {
        for limit in []int32{0, 1} {
            let resolver = Goo.Resolver()
            let node = Reconciler(){Res = resolver}.Mount(Text{
                Content: "MMMM", FontFamily: "DejaVu Sans", FontSize: 10,
                TextWrap: limit == 0 ? TextWrap.NoWrap : TextWrap.Wrap,
                TextTrimming: TextTrimming.Ellipsis, TextMaxLines: limit,
                StyleRanges: []TextStyleRange{TextStyleRange(TextRange(0, 4), Style{FontSize: 60})}})
            resolver.FlushEffects()
            try {
                let layout = TextLayouts.For(node, 100f)
                Console.WriteLine("maxLines=" + limit.ToString() + ", text=" + layout.Lines[0].Content
                    + ", width=" + layout.Width.ToString())
                Assert.Single(layout.Lines)
                Assert.EndsWith("…", layout.Lines[0].Content)
                Assert.InRange(layout.Width, 0f, 100f)
            } finally { TextLayouts.Dispose(node) }
        }
    }

    @Fact
    func ClipboardDisposalRestoresOnlyItsOwnCommandHandler() {
        let owner = Window()
        try {
            using let controller = TextEditorController(TextDocument("abc"))
            using let layer = TextPresentationLayer(controller.Document)
            let previous Action[TextCommandEvent] = _ -> { }
            controller.OnCommand = previous
            let clipboard = RichTextClipboard(owner, controller, layer)
            clipboard.Dispose()
            Assert.Same(previous, controller.OnCommand)
            clipboard.Dispose()
            Assert.Same(previous, controller.OnCommand)
            let replacement Action[TextCommandEvent] = _ -> { }
            let second = RichTextClipboard(owner, controller, layer)
            controller.OnCommand = replacement
            second.Dispose()
            Assert.Same(replacement, controller.OnCommand)
        } finally { owner.Close() }
    }

    @Fact
    func SelectableTextLeavesUnhandledKeysToAncestorBindings() {
        let handle = ElementHandle()
        var bindings = 0
        var callbacks = 0
        let window = Window{Root: ContentContractTests.BuildCell(() -> Container{
            OnKeyDown: (_ KeyEvent) -> callbacks++,
            KeyBindings: []KeyBinding{
                KeyBinding(Key.Escape, KeyModifiers.None, () -> bindings++),
                KeyBinding(Key.Z, KeyModifiers.Primary, () -> bindings++),
                KeyBinding(Key.Enter, KeyModifiers.None, () -> bindings++),
                KeyBinding(Key.Delete, KeyModifiers.None, () -> bindings++),
            },
            Children: []Blob{Text{Content: "selectable", Selectable: true, Handle: handle, Width: 200}}
        })}
        try {
            window.UpdateTree()
            Assert.True(handle.Focus())
            for key in []Key{Key.Escape, Key.Z, Key.Enter, Key.Delete} {
                let modifiers = key == Key.Z ? KeyModifiers.Primary : KeyModifiers.None
                window.PlatformInput.KeyPress(key, modifiers)
                window.PlatformInput.KeyRelease(key, modifiers)
            }
            Assert.Equal(4, bindings)
            window.PlatformInput.KeyPress(Key.Backspace, KeyModifiers.None)
            window.PlatformInput.KeyRelease(Key.Backspace, KeyModifiers.None)
            Assert.Equal(5, callbacks)
        } finally { window.Close() }
    }

    @Fact
    func SelectableTextClearsSelectionWhenFocusMoves() {
        let first = ElementHandle()
        let second = ElementHandle()
        let window = Window{Root: ContentContractTests.BuildCell(() -> Container{
            Children: []Blob{
                Text{Content: "first text", Selectable: true, Handle: first, Width: 200},
                Text{Content: "second text", Selectable: true, Handle: second, Width: 200},
            }
        })}
        try {
            window.UpdateTree()
            Assert.True(first.Focus())
            Assert.True(window.Focus.SetSelection(TextSelection{
                Anchor: TextPosition(0, TextAffinity.Downstream), Active: TextPosition(5, TextAffinity.Downstream)}))
            let node = first.AttachedNode() ?? throw InvalidOperationException("Text is not attached")
            let version = node.ScenePaintVersion
            Assert.True(second.Focus())
            Assert.Equal(0, node.Anchor)
            Assert.Equal(0, node.Caret)
            Assert.True(node.ScenePaintVersion > version)
        } finally { window.Close() }
    }

    @Fact
    func SelectableTextPreservesSelectionOnlyForAppendedContent() {
        let handle = ElementHandle()
        var content = "hello world"
        let cell = ContentContractTests.BuildCell(() -> Text{
            Content: content, Selectable: true, Handle: handle, Width: 200})
        let window = Window{Root: cell}
        try {
            window.UpdateTree()
            Assert.True(handle.Focus())
            Assert.True(window.Focus.SetSelection(TextSelection{
                Anchor: TextPosition(0, TextAffinity.Downstream), Active: TextPosition(5, TextAffinity.Downstream)}))
            content += "!"
            cell.Rebuild()
            window.UpdateTree()
            Assert.Equal(5, window.Focus.Selection?.Active.Offset)
            for replacement in []string{"other text!", "other"} {
                content = replacement
                cell.Rebuild()
                window.UpdateTree()
                Assert.Equal(0, window.Focus.Selection?.Anchor.Offset)
                Assert.Equal(0, window.Focus.Selection?.Active.Offset)
                Assert.True(window.Focus.SetSelection(TextSelection{
                    Anchor: TextPosition(0, TextAffinity.Downstream), Active: TextPosition(3, TextAffinity.Downstream)}))
            }
        } finally { window.Close() }
    }

    @Fact
    func VectorPathParseReportsOffendingPosition() {
        try {
            VectorPath.Parse("M 1e39 0 L 10 10 L 20 20 L 30 30", ElementRect{X: 0, Y: 0, Width: 100, Height: 100})
        } catch (error SvgParseException) {
            Assert.Contains("character position 6:", error.Message)
            return
        }
        Assert.Fail("Out-of-range coordinates must be rejected")
    }

    @Fact
    func PlayUsesDefaultSpecification() {
        let method = typeof(Anim[float64]).GetMethod("Play", []Type{typeof(float64), typeof(float64)})
        Assert.NotNull(method)
        let original = Motion.Default
        let pump = MotionPump()
        let cell = ContentContractTests.BuildCell(() -> Text{})
        cell.BindPump(pump)
        let animation = cell.Animate(0.0)
        try {
            Motion.Default = Motion.Tween(1000.0)
            let play = cast[Action[float64, float64]](method!!.CreateDelegate(typeof(Action[float64, float64]), animation))
            play(2.0, 10.0)
            Assert.Equal(2.0, animation.Value)
            Assert.Equal(10.0, animation.Target)
            pump.Sweep(0.5)
            Assert.Equal(6.0, animation.Value)
            play(4.0, 12.0)
            Assert.Equal(4.0, animation.Value)
            pump.Sweep(1.0)
            Assert.Equal(12.0, animation.Value)
            Assert.False(animation.Running)
        } finally {
            cell.DisposeMounted()
            Motion.Default = original
        }
    }

    @Fact
    func SelectableTextUsesConfiguredSelectionColor() {
        let defaultText = Text{}
        Assert.Equal(TextEntry{}.SelectionColor, defaultText.SelectionColor)
        let handle = ElementHandle()
        var color = Color.Rgb(255, 0, 0)
        let cell = ContentContractTests.BuildCell(() -> Text{
            Content: "text", Selectable: true, SelectionColor: color, Handle: handle})
        let window = Window{Root: cell}
        try {
            window.UpdateTree()
            let node = handle.AttachedNode() ?? throw InvalidOperationException("Text is not attached")
            Assert.Equal(color, node.SelectionColor)
            let version = node.ScenePaintVersion
            color = Color.Rgb(0, 255, 0)
            cell.Rebuild()
            window.UpdateTree()
            Assert.Equal(color, node.SelectionColor)
            Assert.True(node.ScenePaintVersion > version)
        } finally { window.Close() }
    }

    @Fact
    func VectorStrokeInitOptionsKeepDefaultsAndValidateMiterLimit() {
        let defaults = VectorStroke(2.0, Color.White)
        Assert.Equal(StrokeCap.Butt, defaults.Cap)
        Assert.Equal(StrokeJoin.Miter, defaults.Join)
        Assert.Equal(4.0, defaults.MiterLimit)
        Assert.Null(defaults.Dashes)
        let dashes = DashPattern([]float64{2.0, 3.0}, 1.0)
        let stroke = VectorStroke(2.0, Color.White){
            .Cap: StrokeCap.Round, .Join: StrokeJoin.Bevel, .MiterLimit: 0.0, .Dashes: dashes}
        Assert.Equal(StrokeCap.Round, stroke.Cap)
        Assert.Equal(StrokeJoin.Bevel, stroke.Join)
        Assert.Equal(0.0, stroke.MiterLimit)
        Assert.Same(dashes, stroke.Dashes)
        for limit in []float64{-1.0, Double.NaN, Double.PositiveInfinity, Double.NegativeInfinity} {
            var rejected = false
            try { let invalid = VectorStroke(2.0, Color.White){.MiterLimit: limit} }
            catch (_ ArgumentOutOfRangeException) { rejected = true }
            Assert.True(rejected)
        }
    }

    @Fact
    func ShaderEffectValidatesDoubleLayoutDistancesBeforeNarrowing() {
        let program = ShaderEffectProgram.LoadEmbedded("filtered_backdrop.goo-effect")
        let effect = ShaderEffect(program, true, 1.25, 2.25)
        effect.CopySnapshot(out var snapshot)
        Assert.Equal(6.75F, snapshot.BackdropOutset)
        Assert.Equal(2.25F, snapshot.BackdropBlur)
        for distance in []float64{-Double.Epsilon, Double.NaN, Double.PositiveInfinity, 256.0000001} {
            Assert.Throws[ArgumentOutOfRangeException](() -> {
                ShaderEffect(program, true, distance, 0.0)
            })
        }
        for distance in []float64{-Double.Epsilon, Double.NaN, Double.PositiveInfinity, 86.0} {
            Assert.Throws[ArgumentOutOfRangeException](() -> {
                ShaderEffect(program, true, 0.0, distance)
            })
        }
        Assert.Throws[ArgumentException](() -> {
            ShaderEffect(program, false, Double.Epsilon, 0.0)
        })
    }

    @Fact
    func RichTextGeometryMatchesRenderedRunsAndSpanLetterSpacing() {
        let codeFamily = "RichGeometryMonoTest"
        using let font = FontSource.FromPath(codeFamily, 400, false,
            Path.Combine(AppContext.BaseDirectory, "Layout", "VendSans-VariableFont_wght.ttf"))
        font.Register()
        let handle = ElementHandle()
        let spanStyle = Style{FontFamily: codeFamily, FontSize: 22, LetterSpacing: 3}
        let window = Window{
            Size: LayoutSize(800, 300),
            Root: ContentContractTests.BuildCell(() -> Container{
                AlignItems: AlignItems.FlexStart,
                Children: []Blob{
                    Text(
                        TextSpan("file (", nil),
                        TextSpan("BuildDisclosure", spanStyle),
                        TextSpan("): the", nil)
                    ){
                        .Handle: handle,
                        .FontFamily: "sans-serif",
                        .FontSize: 14,
                    },
                },
            }),
        }
        try {
            window.UpdateTree()
            let node = handle.AttachedNode() ?? throw InvalidOperationException("Text is not attached")
            let layout = TextLayouts.For(node, BoxGeometry.ContentWidth(node), true)
            let rich = layout.Rich ?? throw InvalidOperationException("Expected rich layout")
            let richLine = rich.Lines[0]
            Assert.Equal(3, richLine.Runs.Count)
            let prefixRun = richLine.Runs[0]
            let spanRun = richLine.Runs[1]
            let suffixRun = richLine.Runs[2]
            let prefixRenderedWidth = prefixRun.Shape!!.Runs[0].VisualEnd - prefixRun.Shape!!.Runs[0].VisualStart
            let spanRenderedWidth = spanRun.Shape!!.Runs[0].VisualEnd - spanRun.Shape!!.Runs[0].VisualStart
            let expectedSpanWidth = window.MeasureText("BuildDisclosure", spanStyle)
            Assert.InRange(Math.Abs(float64(spanRenderedWidth) - expectedSpanWidth), 0.0, 1.5)

            let rects = [4]ElementRect
            Assert.True(handle.TryCopyTextRangeRects(TextRange(6, 15), TextCoordinateSpace.Element,
                Span[ElementRect](rects), out var spanCount))
            Assert.Equal(1, spanCount)
            Assert.InRange(Math.Abs(rects[0].X - float64(prefixRenderedWidth)), 0.0, 0.5)
            Assert.InRange(Math.Abs(rects[0].Width - float64(spanRenderedWidth)), 0.0, 0.5)
            Assert.InRange(Math.Abs(rects[0].Height - float64(richLine.Height)), 0.0, 0.5)

            let spanVisualEnd = spanRun.X + spanRun.Shape!!.Runs[0].VisualEnd
            Assert.True(handle.TryCopyTextRangeRects(TextRange(21, 6), TextCoordinateSpace.Element,
                Span[ElementRect](rects), out var suffixCount))
            Assert.Equal(1, suffixCount)
            Assert.InRange(Math.Abs(rects[0].X - float64(spanVisualEnd)), 0.0, 0.5)
            Assert.True(rects[0].X > float64(prefixRenderedWidth) + 120.0)

            Assert.True(handle.TryCopyTextRangeRects(TextRange(0, 27), TextCoordinateSpace.Element,
                Span[ElementRect](rects), out var fullCount))
            Assert.Equal(1, fullCount)
            Assert.InRange(Math.Abs(rects[0].Width - float64(richLine.Width)), 0.0, 0.5)

            Assert.True(handle.TryGetTextCaretRect(TextPosition(6, TextAffinity.Downstream),
                TextCoordinateSpace.Element, out var spanStartCaret))
            Assert.InRange(Math.Abs(spanStartCaret.X - float64(prefixRenderedWidth)), 0.0, 0.5)
            Assert.InRange(Math.Abs(spanStartCaret.Height - float64(richLine.Height)), 0.0, 0.5)

            Assert.True(handle.TryGetTextCaretRect(TextPosition(21, TextAffinity.Downstream),
                TextCoordinateSpace.Element, out var suffixCaret))
            Assert.InRange(Math.Abs(suffixCaret.X - float64(spanVisualEnd)), 0.0, 0.5)

            Assert.True(handle.TryGetTextPositionAt(
                Point{X: suffixCaret.X + 4.0, Y: suffixCaret.Y + 4.0},
                TextCoordinateSpace.Element, out var hitAfterSpan))
            Assert.True(hitAfterSpan.Offset >= 21)
        } finally { window.Close() }
    }

    @Fact
    func RichTextWrappedLinesAndNoWrapMinWidthMatchRichLayout() {
        let bigStyle = Style{FontSize: 28, LetterSpacing: 2}
        let handle = ElementHandle()
        let noWrapHandle = ElementHandle()
        let window = Window{
            Size: LayoutSize(220, 300),
            Root: ContentContractTests.BuildCell(() -> Container{
                Width: 220,
                AlignItems: AlignItems.FlexStart,
                Children: []Blob{
                    Text(
                        TextSpan("wrapped ", nil),
                        TextSpan("BIGCODE ", bigStyle),
                        TextSpan("here", nil)
                    ){
                        .Handle: handle,
                        .Width: 200,
                        .FontFamily: "sans-serif",
                        .FontSize: 12,
                    },
                    Text(
                        TextSpan("a ", nil),
                        TextSpan("WIDE", bigStyle)
                    ){
                        .Handle: noWrapHandle,
                        .FontFamily: "sans-serif",
                        .FontSize: 12,
                        .TextWrap: TextWrap.NoWrap,
                    },
                },
            }),
        }
        try {
            window.UpdateTree()
            let node = handle.AttachedNode() ?? throw InvalidOperationException("Wrapped text is not attached")
            let layout = TextLayouts.For(node, BoxGeometry.ContentWidth(node), true)
            let rich = layout.Rich ?? throw InvalidOperationException("Expected rich layout")
            Assert.True(rich.Lines.Count >= 2)
            let rects = [4]ElementRect
            Assert.True(handle.TryCopyTextRangeRects(TextRange(0, node.Content.Length),
                TextCoordinateSpace.Element, Span[ElementRect](rects), out var count))
            Assert.Equal(rich.Lines.Count, count)
            var expectedY = 0.0
            for i in 0 ... rich.Lines.Count {
                Assert.InRange(Math.Abs(rects[i].Y - expectedY), 0.0, 0.5)
                Assert.InRange(Math.Abs(rects[i].Height - float64(rich.Lines[i].Height)), 0.0, 0.5)
                expectedY = expectedY + float64(rich.Lines[i].Height)
            }
            let noWrapNode = noWrapHandle.AttachedNode() ?? throw InvalidOperationException("NoWrap text is not attached")
            let noWrapLayout = TextLayouts.For(noWrapNode, -1.0F)
            let noWrapRich = noWrapLayout.Rich ?? throw InvalidOperationException("Expected rich NoWrap layout")
            Assert.InRange(Math.Abs(noWrapLayout.MinWidth - noWrapRich.Lines[0].Width), 0.0F, 0.1F)
        } finally { window.Close() }
    }

    private class BuildCell(build() -> Blob) : Cell {
        override func Build() Blob -> build()
    }
}
