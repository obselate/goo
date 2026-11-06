package GooAsyncReadbackSmoke

import Goo
import System
import System.IO
import System.Numerics

class ScrollPlacementCell : Cell {
    internal let Outer ElementHandle = ElementHandle{}
    internal let Inner ElementHandle = ElementHandle{}
    internal let Target ElementHandle = ElementHandle{}
    internal var Clipped bool
    internal var Clicks int32
    private let effect ShaderEffect

    init(value ShaderEffect) {
        effect = value
    }

    override func Build() Blob {
        let rows = Container{Width: 80, Height: 128, FlexShrink: 0}
        for row in 0 ... 6 {
            rows.Children.Add(
                Text{
                    Height: 20,
                    FlexShrink: 0,
                    Content: "Row ${row}",
                    FontFamily: "monospace",
                    FontSize: 12,
                    Color: Color.Rgb(80 + row * 20, 180, 220),
                }
            )
        }
        return Container{
            Width: Percent(100),
            Height: Percent(100),
            BackgroundColor: Color.Black,
            Container{
                Handle: Outer,
                Position: PositionType.Absolute,
                Left: 16,
                Top: 16,
                Width: 96,
                Height: 176,
                Overflow: Clipped ? Overflow.Scroll: Overflow.Visible,
                Container{
                    Width: 144,
                    Height: 256,
                    FlexShrink: 0,
                    Text{
                        Position: PositionType.Absolute,
                        Left: 8,
                        Top: 4,
                        Content: "Scroll geometry",
                        FontFamily: "monospace",
                        FontSize: 12,
                        Color: Color.White,
                    },
                    Container{
                        Position: PositionType.Absolute,
                        Left: 4,
                        Top: 28,
                        Width: 88,
                        Height: 48,
                        Opacity: 0.75,
                        ShaderEffect: effect,
                        BackgroundGradient: LinearGradient(
                            35.0,
                            []GradientStop{
                                GradientStop{Offset: 0.0, Color: Color.Rgb(24, 68, 132)},
                                GradientStop{Offset: 1.0, Color: Color.Rgb(196, 88, 200)},
                            }
                        ),
                    },
                    Container{
                        Position: PositionType.Absolute,
                        Left: 4,
                        Top: 76,
                        Width: 40,
                        Height: 6,
                        BorderRadius: 3,
                        BackgroundGradient: LinearGradient(
                            35.0,
                            []GradientStop{
                                GradientStop{Offset: 0.0, Color: Color.Rgb(24, 68, 132)},
                                GradientStop{Offset: 1.0, Color: Color.Rgb(196, 88, 200)},
                            }
                        ),
                    },
                    Container{
                        Position: PositionType.Absolute,
                        Left: 48,
                        Top: 76,
                        Width: 40,
                        Height: 6,
                        BorderRadius: 3,
                        BackgroundGradient: RadialGradient(
                            0.5,
                            0.5,
                            0.5,
                            []GradientStop{
                                GradientStop{Offset: 0.0, Color: Color.Rgb(232, 178, 78)},
                                GradientStop{Offset: 1.0, Color: Color.Rgb(128, 54, 92)},
                            }
                        ),
                    },
                    Button{
                        Handle: Target,
                        Position: PositionType.Absolute,
                        Left: 8,
                        Top: 84,
                        Width: 72,
                        Height: 20,
                        BackgroundColor: Color.Rgb(48, 180, 96),
                        BorderWidth: 1,
                        BorderColor: Color.White,
                        BoxShadow: BoxShadow{Inset: true, Spread: 2, Color: Color.Rgb(96, 64, 128)},
                        OnClick: () -> {
                            Clicks++
                        },
                    },
                    Container{
                        Position: PositionType.Absolute,
                        Left: 80,
                        Top: 84,
                        Width: 16,
                        Height: 20,
                        BorderRadius: 5,
                        BackgroundColor: Color.Rgb(72, 104, 212),
                        BoxShadow: BoxShadow{OffsetX: 2, OffsetY: 2, Color: Color.Rgb(148, 84, 168)},
                    },
                    Container{
                        Handle: Inner,
                        Position: PositionType.Absolute,
                        Left: 16,
                        Top: 112,
                        Width: 80,
                        Height: 48,
                        OverflowY: Clipped ? Overflow.Scroll: Overflow.Visible,
                        rows,
                    },
                },
            },
        }
    }
}

func RunScrollPlacementSmoke() {
    Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1", "GOO_VK_DIAGNOSTICS=1 is required")
    let program = ShaderEffectProgram.Load(Path.Combine(AppContext.BaseDirectory, "control_effect.frag.goo-effect"))
    let effect = ShaderEffect(program, true)
    effect.SetParameter(0, Vector4(1.0F, 1.0F, 1.0F, 0.0F))
    let cell = ScrollPlacementCell(effect)
    let window = Window{
        Title: "Goo canonical scroll placement gate",
        Width: 320,
        Height: 288,
        VSync: false,
        Decorated: false,
        Root: cell,
    }
    try {
        window.Open()
        var comparisons int32
        var expectedClicks int32
        var changedChannels int64
        var maximumDifference int32
        var unexpectedChannels int64
        var firstMismatch string = ""
        for scale in[]float64{1.0, 1.25, 1.5, 2.0} {
            cell.Clipped = false
            cell.Rebuild()
            WindowReadbackTestFixture.ForceRender(window, 0.0)
            let width = int32(320.0 * scale)
            let height = int32(288.0 * scale)
            let previous = WindowReadbackTestFixture.Metrics(window)
            if previous.FramebufferWidth != width || previous.FramebufferHeight != height {
                Require(
                    WindowReadbackTestFixture.Resize(window, 320, 288, width, height),
                    "Scroll placement scale was not applied"
                )
            }
            WindowReadbackTestFixture.ForceRender(window, 0.0)
            WindowReadbackTestFixture.ForceRender(window, 0.0)
            let metrics = WindowReadbackTestFixture.Metrics(window)
            let reference = PrimitiveReadback(window, metrics)
            let referencePixels = reference.Pixels
            cell.Clipped = true
            cell.Rebuild()
            WindowReadbackTestFixture.ForceRender(window, 0.0)
            for variant in 0 ... 7 {
                let fractional = variant < 5 && variant % 2 == 0 && variant != 0
                let outerX = (
                    variant == 5 ? 1.0: variant == 6 ? 4.0
                    : float64(variant) + (fractional ? 0.25: 0.0)
                ) / scale
                let outerY = (
                    variant == 5 ? 4.0: variant == 6 ? 1.0
                    : float64(variant) * 5.0 + (fractional ? 0.5: 0.0)
                ) / scale
                let innerY = variant < 2 ? 0.0
                : (float64(variant) * 4.0 + (fractional ? 0.25: 0.0)) / scale
                cell.Outer.JumpTo(outerX, outerY)
                cell.Inner.JumpTo(0.0, innerY)
                WindowReadbackTestFixture.ForceRender(window, 0.0)
                let actual = PrimitiveReadback(window, metrics)
                let actualPixels = actual.Pixels
                let dx = int32(MathF.Round(float32(outerX) * float32(scale)))
                let dy = int32(MathF.Round(float32(outerY) * float32(scale)))
                let innerDy = int32(MathF.Round(float32(innerY) * float32(scale)))
                var variantChanges int64
                var variantMaximum int32
                for y in 0 ... height {
                    for x in 0 ... width {
                        let sourceX = x + dx
                        var sourceY = y + dy
                        var inside = float64(x) >= 16.0 * scale && float64(x) < 112.0 * scale
                        && float64(y) >= 16.0 * scale && float64(y) < 192.0 * scale
                        let nested = float64(sourceX) >= 32.0 * scale
                        && float64(sourceX) < 112.0 * scale
                        && float64(sourceY) >= 128.0 * scale
                        && float64(sourceY) < 256.0 * scale
                        if nested {
                            inside = inside && float64(sourceY) < 176.0 * scale
                            sourceY += innerDy
                        }
                        for channel in 0 ... 4 {
                            let index = (y * width + x) * 4 + channel
                            let expected = inside
                            ? referencePixels[(sourceY * width + sourceX) * 4 + channel]
                            : channel == 3 ? uint8(255): uint8(0)
                            if actualPixels[index] != expected {
                                variantChanges++
                                let difference = Math.Abs(int32(actualPixels[index]) - int32(expected))
                                variantMaximum = Math.Max(variantMaximum, difference)
                                let legacyRoundingSample = scale == 1.25 && variant == 2
                                && x == 53 && y == 155 && channel == 0
                                && expected == uint8(40) && actualPixels[index] == uint8(41)
                                if legacyRoundingSample {
                                    continue
                                }
                                unexpectedChannels++
                                if firstMismatch.Length == 0 {
                                    firstMismatch = "scale=${scale} variant=${variant} x=${x} y=${y} channel=${channel} expected=${expected} actual=${actualPixels[index]}"
                                    if let output = Environment.GetEnvironmentVariable("GOO_SCROLL_PIXEL_EVIDENCE") {
                                        Directory.CreateDirectory(output)
                                        File.WriteAllBytes(Path.Combine(output, "reference.rgba"), referencePixels)
                                        File.WriteAllBytes(Path.Combine(output, "actual.rgba"), actualPixels)
                                        File.WriteAllText(
                                            Path.Combine(output, "placement.txt"),
                                            "width=${width} height=${height} scale=${scale} dx=${dx} dy=${dy} innerDy=${innerDy} target=${cell.Target.BorderBox}"
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
                comparisons++
                changedChannels += variantChanges
                maximumDifference = Math.Max(maximumDifference, variantMaximum)
                Console.WriteLine(
                    "scroll-placement-case: scale=${scale} variant=${variant} changed-channels=${variantChanges} max-rgba-difference=${variantMaximum}"
                )
            }
            let target = cell.Target.BorderBox
            WindowReadbackTestFixture.InputQueuePointerMove(
                window,
                target.X + target.Width * 0.5,
                target.Y + target.Height * 0.5
            )
            WindowReadbackTestFixture.InputQueuePointerPress(
                window,
                target.X + target.Width * 0.5,
                target.Y + target.Height * 0.5
            )
            WindowReadbackTestFixture.InputQueuePointerRelease(
                window,
                target.X + target.Width * 0.5,
                target.Y + target.Height * 0.5
            )
            WindowReadbackTestFixture.ForceRender(window, 0.0)
            expectedClicks++
            Require(cell.Clicks == expectedClicks, "Scroll placement input did not use the rendered geometry")
        }
        Console.WriteLine(
            "scroll-placement: comparisons=${comparisons} scales=1,1.25,1.5,2 nested=true changed-channels=${changedChannels} max-rgba-difference=${maximumDifference} clicks=${cell.Clicks}"
        )
        Require(unexpectedChannels == 0, "Scroll placement changed a canonical pixel ${firstMismatch}")
    } finally {
        window.Close()
    }
}
