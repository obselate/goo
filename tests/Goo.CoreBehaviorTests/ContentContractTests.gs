package Goo.CoreBehaviorTests

import Goo
import Goo.Svg
import System
import System.Reflection
import Xunit

class ContentContractTests {
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
    func VectorAssetPreservesViewBoxPrecision() {
        let x = 0.1234567890123
        let y = -0.9876543210123
        let width = 20.1234567890123
        let height = 10.9876543210123
        let asset = VectorAsset(x, y, width, height, []VectorNode{})
        Assert.Equal(x, asset.ViewBoxX)
        Assert.Equal(y, asset.ViewBoxY)
        Assert.Equal(width, asset.ViewBoxWidth)
        Assert.Equal(height, asset.ViewBoxHeight)
    }

    @Fact
    func ShaderEffectAcceptsAndValidatesDoubleLayoutDistances() {
        let constructor = typeof(ShaderEffect).GetConstructor(
            []Type{typeof(ShaderEffectProgram), typeof(bool), typeof(float64), typeof(float64)})
        Assert.NotNull(constructor)
        let program = ShaderEffectProgram.LoadEmbedded("filtered_backdrop.goo-effect")
        let effect = cast[ShaderEffect](constructor!!.Invoke([]object{program, true, 1.25, 2.25}))
        effect.CopySnapshot(out var snapshot)
        Assert.Equal(6.75F, snapshot.BackdropOutset)
        Assert.Equal(2.25F, snapshot.BackdropBlur)
        for distance in []float64{-Double.Epsilon, Double.NaN, Double.PositiveInfinity, 256.0000001} {
            let error = Assert.Throws[TargetInvocationException](() -> {
                constructor!!.Invoke([]object{program, true, distance, 0.0})
            })
            Assert.IsType[ArgumentOutOfRangeException](error.InnerException)
        }
        for distance in []float64{-Double.Epsilon, Double.NaN, Double.PositiveInfinity, 86.0} {
            let error = Assert.Throws[TargetInvocationException](() -> {
                constructor!!.Invoke([]object{program, true, 0.0, distance})
            })
            Assert.IsType[ArgumentOutOfRangeException](error.InnerException)
        }
        let error = Assert.Throws[TargetInvocationException](() -> {
            constructor!!.Invoke([]object{program, false, Double.Epsilon, 0.0})
        })
        Assert.IsType[ArgumentException](error.InnerException)
    }

    private class BuildCell(build() -> Blob) : Cell {
        override func Build() Blob -> build()
    }
}
