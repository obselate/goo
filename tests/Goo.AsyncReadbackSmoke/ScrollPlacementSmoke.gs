package GooAsyncReadbackSmoke

import Goo
import System
import System.IO
import System.Collections.Generic
import System.Numerics

class ScrollPlacementCell : Cell {
    internal let Outer ElementHandle = ElementHandle{}
    internal let Inner ElementHandle = ElementHandle{}
    internal let Target ElementHandle = ElementHandle{}
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
                    BackgroundColor: Color.Rgb(30 + row * 12, 24, 40),
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
                Overflow: Overflow.Scroll,
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
                        OverflowY: Overflow.Scroll,
                        rows,
                    },
                },
            },
        }
    }
}

func ScrollPlacementOpen(cell ScrollPlacementCell, scale float64) Window {
    let window = Window{
        Title: "Goo canonical scroll placement gate",
        Width: int32(320.0 * scale),
        Height: int32(288.0 * scale),
        UiScale: float32(scale),
        VSync: false,
        Decorated: false,
        Root: cell,
    }
    window.Open()
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    let metrics = WindowReadbackTestFixture.Metrics(window)
    Require(metrics.FramebufferWidth == int32(320.0 * scale) && metrics.FramebufferHeight == int32(288.0 * scale),
        "Scroll placement window did not open at ${320.0 * scale}x${288.0 * scale}")
    return window
}

func ScrollPlacementFresh(effect ShaderEffect, scale float64, outerX float64, outerY float64, innerY float64)[]uint8 {
    let cell = ScrollPlacementCell(effect)
    let window = ScrollPlacementOpen(cell, scale)
    try {
        Require(cell.Outer.JumpTo(outerX, outerY) && cell.Inner.JumpTo(0.0, innerY),
            "Fresh scroll placement offsets were not applied")
        WindowReadbackTestFixture.ForceRender(window, 0.0)
        WindowReadbackTestFixture.ForceRender(window, 0.0)
        return PartialRedrawSettledCapture(window, WindowReadbackTestFixture.Metrics(window))
    } finally {
        window.Close()
    }
}

/// Returns the device rows in [top, bottom) whose pixel at column x differs from the row above.
func ScrollPlacementBoundaries(pixels[]uint8, width int32, x int32, top int32, bottom int32) List[int32] {
    let rows = List[int32]()
    for y in top + 1 ... bottom {
        let index = (y * width + x) * 4
        let above = ((y - 1) * width + x) * 4
        if pixels[index] != pixels[above] || pixels[index + 1] != pixels[above + 1]
        || pixels[index + 2] != pixels[above + 2] {
            rows.Add(y)
        }
    }
    return rows
}

/// Returns the first device row in [top, bottom) with at least minimum opaque white pixels in [left, right).
func ScrollPlacementWhiteRow(pixels[]uint8, width int32, left int32, right int32, top int32, bottom int32, minimum int32) int32 {
    for y in top ... bottom {
        var count = 0
        for x in left ... right {
            let index = (y * width + x) * 4
            if pixels[index] == uint8(255) && pixels[index + 1] == uint8(255) && pixels[index + 2] == uint8(255) {
                count++
            }
        }
        if count >= minimum { return y }
    }
    return -1
}

func RunScrollPlacementSmoke() {
    RunScrollImagePlacementSmoke()
    Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1", "GOO_VK_DIAGNOSTICS=1 is required")
    let program = ShaderEffectProgram.Load(Path.Combine(AppContext.BaseDirectory, "control_effect.frag.goo-effect"))
    let effect = ShaderEffect(program, true)
    effect.SetParameter(0, Vector4(1.0F, 1.0F, 1.0F, 0.0F))
    var comparisons int32
    var partialSteps int32
    for scale in[]float64{1.0, 1.25, 1.5, 2.0} {
        let cell = ScrollPlacementCell(effect)
        let window = ScrollPlacementOpen(cell, scale)
        try {
            guard let target = WindowReadbackTestFixture.CaptureTarget(window) else {
                throw InvalidOperationException("Scroll placement render target is unavailable")
            }
            let metrics = WindowReadbackTestFixture.Metrics(window)
            let width = metrics.FramebufferWidth
            let height = metrics.FramebufferHeight
            let device = (value float64) -> int32(MathF.Round(float32(value * scale)))
            let viewportLeft = device(16.0)
            let viewportRight = device(112.0)
            let viewportTop = device(16.0)
            let viewportBottom = device(192.0)
            let nestedLeft = device(32.0)
            let nestedTop = device(128.0)
            let nestedBottom = device(176.0)
            let rowColumn = nestedLeft + device(70.0)
            let reference = PartialRedrawSettledCapture(window, metrics)
            let buttonTop = ScrollPlacementWhiteRow(reference, width, viewportLeft, viewportRight,
                viewportTop, viewportBottom, device(60.0))
            Require(buttonTop > 0, "Scroll placement reference did not show the button border")
            let referenceRows = ScrollPlacementBoundaries(reference, width, rowColumn, nestedTop, nestedBottom)
            Require(referenceRows.Count == 2 && referenceRows[0] == device(148.0) && referenceRows[1] == device(168.0),
                "Scroll placement reference did not show the nested rows at ${string.Join(",", referenceRows)}")
            var appliedVersion = WindowReadbackTestFixture.SceneVersion(window)
            let retainedFrames = List[[]uint8]()
            let partialFrames = List[bool]()
            let outerXs = List[float64]()
            let outerYs = List[float64]()
            let innerOffsets = List[float64]()
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
                outerXs.Add(outerX)
                outerYs.Add(outerY)
                innerOffsets.Add(innerY)
                Require(cell.Outer.JumpTo(outerX, outerY) && cell.Inner.JumpTo(0.0, innerY),
                    "Scroll placement offsets were not applied")
                WindowReadbackTestFixture.ForceRender(window, 0.0)
                var damage VulkanDamageRegion
                let partial = variant > 0
                && WindowReadbackTestFixture.ScenePartialDamageSince(window, appliedVersion, out damage)
                if partial {
                    partialSteps++
                    WindowReadbackTestFixture.SetPartialRepeat(window, damage, true)
                }
                target.UsePresentedSceneForTest(float32(metrics.DisplayScaleX * scale), float32(metrics.DisplayScaleY * scale))
                let retained = ClipCaptureReadback(window, metrics).Pixels
                WindowReadbackTestFixture.SetPartialRepeat(window, VulkanDamageRegion{})
                appliedVersion = WindowReadbackTestFixture.SceneVersion(window)
                retainedFrames.Add(retained)
                partialFrames.Add(partial)
                let dx = device(outerX)
                let dy = device(outerY)
                let innerDy = device(innerY)
                let movedTop = ScrollPlacementWhiteRow(retained, width, viewportLeft, viewportRight,
                    viewportTop, viewportBottom, device(60.0))
                Require(movedTop == buttonTop - dy,
                    "Scroll placement moved the button border to ${movedTop}, expected ${buttonTop - dy} (scale=${scale} variant=${variant})")
                let movedRows = ScrollPlacementBoundaries(retained, width, rowColumn - dx,
                    nestedTop - dy, nestedBottom - dy)
                let expectedRows = List[int32]()
                for row in 1 ... 6 {
                    let moved = device(128.0 + 20.0 * float64(row)) - dy - innerDy
                    if moved > nestedTop - dy && moved < nestedBottom - dy { expectedRows.Add(moved) }
                }
                Require(movedRows.Count == expectedRows.Count,
                    "Scroll placement nested rows at ${string.Join(",", movedRows)}, expected ${string.Join(",", expectedRows)} (scale=${scale} variant=${variant})")
                for index in 0 ... expectedRows.Count {
                    Require(movedRows[index] == expectedRows[index],
                        "Scroll placement nested row boundary at ${movedRows[index]}, expected ${expectedRows[index]} (scale=${scale} variant=${variant})")
                }
                comparisons++
                Console.WriteLine(
                    "scroll-placement-case: scale=${scale} variant=${variant} dx=${dx} dy=${dy} innerDy=${innerDy} partial=${partial}"
                )
            }
            let box = cell.Target.BorderBox
            let clickX = box.X + box.Width * 0.5
            let clickY = box.Y + box.Height * 0.5
            WindowReadbackTestFixture.InputQueuePointerMove(window, clickX, clickY)
            WindowReadbackTestFixture.InputQueuePointerPress(window, clickX, clickY)
            WindowReadbackTestFixture.InputQueuePointerRelease(window, clickX, clickY)
            WindowReadbackTestFixture.ForceRender(window, 0.0)
            Require(cell.Clicks == 1, "Scroll placement input did not use the rendered geometry: clicks=${cell.Clicks}")
            for variant in 0 ... 7 {
                let fresh = ScrollPlacementFresh(effect, scale, outerXs[variant], outerYs[variant],
                    innerOffsets[variant])
                RetainedEqualityCompare(fresh, retainedFrames[variant], width, height, int32(scale * 100.0),
                    "scroll-variant-${variant}" + (partialFrames[variant] ? "-partial": "-full"))
            }
        } finally {
            window.Close()
        }
    }
    Require(partialSteps >= 8, "Scroll placement did not exercise partial redraw")
    Console.WriteLine(
        "scroll-placement: comparisons=${comparisons} scales=1,1.25,1.5,2 nested=true partial-steps=${partialSteps} fresh-equal=1"
    )
}

class ScrollImagePlacementCell(source ImageSourceProvider) : Cell {
    internal let Scroller ElementHandle = ElementHandle{}

    override func Build() Blob -> Container{
        Width: 96,
        Height: 96,
        OverflowY: Overflow.Scroll,
        Handle: Scroller,
        BackgroundColor: Color.White,
        Container{
            Width: 96,
            Height: 7752.76171875,
            FlexShrink: 0,
            Container{
                Position: PositionType.Absolute,
                Top: 7672.76171875,
                Width: 96,
                Height: 64,
                Opacity: 0.999999,
                BorderRadius: 6,
                Overflow: Overflow.Hidden,
                Image{
                    Width: 96,
                    Height: 64,
                    BorderRadius: 8,
                    Overflow: Overflow.Hidden,
                    Source: source,
                    Fit: ImageFit.Fill,
                },
            },
        },
    }
}

func RunScrollImagePlacementSmoke() {
    for variant in 0 ... 3 {
        let scale = variant == 0 ? 1.0F : 2.625F
        let provider = ImageStagingProvider(
            ImageStagingSource(2, 2, uint8(224), uint8(48), uint8(32)))
        let root = ScrollImagePlacementCell(provider)
        var lastMetrics ElementMetrics
        root.Scroller.MetricsChanged += value -> { lastMetrics = value }
        let host EmbeddedSmokeHost? = variant == 2 ? EmbeddedSmokeHost() : nil
        let window = Window{
            Title: "Goo retained scroll image gate",
            Width: int32(96.0F * scale),
            Height: int32(96.0F * scale),
            UiScale: scale,
            VSync: false,
            Root: root,
        }
        try {
            if let embedded = host {
                embedded.Resize(252, 252, 252, 251)
                window.Attach(embedded)
                embedded.CreateNative()
                embedded.AttachPresentation()
            } else {
                window.Open()
            }
            WindowReadbackTestFixture.ForceRender(window, 0.0)
            provider.Replace(ImageSource(2, 2, []uint8{
                48, 96, 224, 255, 48, 96, 224, 255,
                240, 192, 48, 255, 240, 192, 48, 255,
            }))
            for frame in 0 ... 8 {
                Require(root.Scroller.JumpTo(0.0, 7656.77783203125), "Image scroll placement failed")
                WindowReadbackTestFixture.ForceRender(window, 0.0166666666666667)
            }
            Require(root.Scroller.ScrollOffset.Y <= root.Scroller.ScrollRange.Y
                && lastMetrics.ScrollOffset.Y <= lastMetrics.ScrollRange.Y,
                "Scroll offset exceeded its clamped logical range")
            let metrics = WindowReadbackTestFixture.Metrics(window)
            if variant == 2 {
                Require(metrics.DisplayScaleX != metrics.DisplayScaleY,
                    "Unequal image framebuffer scales were lost")
            }
            PrimitiveReadback(window, metrics)
            WindowReadbackTestFixture.SetPartialRepeat(window, VulkanDamageRegion{
                X: 0, Y: int32(16.0 * float64(scale) * metrics.DisplayScaleY),
                Width: metrics.FramebufferWidth,
                Height: int32(64.0 * float64(scale) * metrics.DisplayScaleY),
            })
            let readback = PrimitiveReadback(window, metrics)
            WindowReadbackTestFixture.SetPartialRepeat(window, VulkanDamageRegion{})
            PrimitiveRequirePixelNear(readback.Pixels, readback.Width, metrics,
                48.0 * float64(scale), 24.0 * float64(scale),
                uint8(48), uint8(96), uint8(224), 3, "retained_scroll_image_top")
            PrimitiveRequirePixelNear(readback.Pixels, readback.Width, metrics,
                48.0 * float64(scale), 72.0 * float64(scale),
                uint8(240), uint8(192), uint8(48), 3, "retained_scroll_image_bottom")
        } finally {
            window.Close()
            host?.DestroyNative()
            host?.Dispose()
            provider.DisposeSource()
        }
    }
    Console.WriteLine("scroll-image-placement: scales=1,2.625 unequal-axes=true late-content=true frames=8 pixels=passed")
}
