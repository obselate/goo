package GooAsyncReadbackSmoke

import Goo
import System
import System.Diagnostics
import System.IO
import System.Text

class RetainedEqualityCell(seed int32, source ImageSourceProvider) : Cell {
    internal let Scroller ElementHandle = ElementHandle()
    internal let HoverTarget ElementHandle = ElementHandle()
    internal var Step int32
    internal var Offset int32
    internal var Transpose bool
    internal var GeometryOnly bool

    override func Build() Blob {
        let content = Container{Width: 88, Height: 7792, FlexShrink: 0}
        let items = Container{
            Position: PositionType.Absolute,
            Left: 4,
            Top: 7680,
            Width: 80,
            Height: 80,
            Opacity: 0.75,
            Overflow: Overflow.Hidden,
            BorderRadius: 8,
            FlexDirection: Transpose ? FlexDirection.Column: FlexDirection.Row,
        }
        for index in 0 ... 4 {
            let identity = Step >= 7 ? 3 - index: index
            let random = Random(seed + identity)
            let color = Color.Rgb(random.Next(40, 240), random.Next(40, 240), random.Next(40, 240))
            let size = 12 + random.Next(3) * 4
            items.Children.Add(
                Container{Key: identity.ToString(), Width: size, Height: size, FlexShrink: 0, BackgroundColor: color,}
            )
        }
        content.Children.Add(items)
        if !GeometryOnly {
            content.Children.Add(
                Container{
                    Position: PositionType.Absolute,
                    Left: 8,
                    Top: 7712,
                    Width: 64,
                    Height: 48,
                    Opacity: 0.8,
                    BorderRadius: 8,
                    Overflow: Overflow.Hidden,
                    Image{Width: 64, Height: 48, Source: source, Fit: ImageFit.Fill},
                }
            )
        }
        let root = Container{
            Width: Percent(100),
            Height: Percent(100),
            BackgroundColor: Color.Black,
            Container{
                Position: PositionType.Absolute,
                Left: 8 + Offset,
                Top: 8 + Offset,
                Width: 88,
                Height: 112,
                Overflow: Overflow.Scroll,
                Handle: Scroller,
                content,
            },
        }
        if !GeometryOnly {
            root.Children.Add(
                Button{
                    Position: PositionType.Absolute,
                    Left: 112,
                    Top: 12,
                    Width: 48,
                    Height: 24,
                    Handle: HoverTarget,
                    BackgroundColor: Color.Rgb(40, 80, 120),
                    Hover: Style{BackgroundColor: Color.Rgb(180, 100, 60)},
                    OnKeyDown: (event KeyEvent) -> {
                        if event.Key == Key.E {
                            Step = 4
                        }
                    },
                }
            )
            root.Children.Add(
                Text{
                    Position: PositionType.Absolute,
                    Left: 12,
                    Top: 132,
                    Width: 100,
                    Height: 10,
                    TextWrap: TextWrap.NoWrap,
                    Content: Step >= 4 ? "Edited underline": "Original words",
                    FontFamily: "ReadbackGateFont",
                    FontSize: 16,
                    TextDecoration: TextDecoration.Underline,
                    Color: Color.White,
                }
            )
            if Step != 5 {
                root.Children.Add(
                    Container{
                        Key: "visibility",
                        Position: PositionType.Absolute,
                        Left: 140,
                        Top: 84,
                        Width: 20,
                        Height: 20,
                        BackgroundColor: Color.Rgb(60, 180, 100),
                    }
                )
            }
        }
        return root
    }
}

func RetainedEqualityCompare(expected[]uint8, actual[]uint8, width int32, height int32, seed int32, step string) {
    Require(expected.Length == actual.Length, "Retained equality frame extent changed")
    var count = 0
    var left = width
    var top = height
    var right = 0
    var bottom = 0
    let diff = [width * height * 3]uint8
    for pixel in 0 ... width * height {
        let at = pixel * 4
        if expected[at] == actual[at] && expected[at + 1] == actual[at + 1]
        && expected[at + 2] == actual[at + 2] && expected[at + 3] == actual[at + 3] {
            continue
        }
        count++
        left = Math.Min(left, pixel % width)
        top = Math.Min(top, pixel / width)
        right = Math.Max(right, pixel % width + 1)
        bottom = Math.Max(bottom, pixel / width + 1)
        diff[pixel * 3] = uint8(255)
        diff[pixel * 3 + 2] = uint8(255)
    }
    if count == 0 {
        return
    }
    let directory = Path.GetFullPath("artifacts/reports/retained-frame-equality")
    Directory.CreateDirectory(directory)
    let path = Path.Combine(directory, "seed-${seed}-${step}-diff.ppm")
    using let image = File.Create(path)
    image.Write(Encoding.ASCII.GetBytes("P6\n${width} ${height}\n255\n"))
    image.Write(diff)
    throw InvalidOperationException(
        "retained-frame-equality: step=${step} seed=${seed} differing-pixels=${count} bounds=${left},${top},${right - left},${bottom - top} diff=${path}"
    )
}

func RetainedEqualityOpen(root RetainedEqualityCell, host EmbeddedSmokeHost, width int32, height int32) Window {
    let window = Window{Title: "Goo retained frame equality", Width: width, Height: height, Root: root, VSync: false}
    host.Resize(width, height, root.GeometryOnly ? width: width * 5 / 4, root.GeometryOnly ? height: height * 3 / 2)
    window.Attach(host)
    host.RenderFrame(0.0)
    if root.Step >= 1 || root.GeometryOnly {
        Require(root.Scroller.JumpTo(0.0, 7656), "Retained equality scroll did not apply")
        host.RenderFrame(0.0)
    }
    host.CreateNative()
    host.AttachPresentation()
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    if root.Step >= 3 && !root.GeometryOnly {
        let box = root.HoverTarget.BorderBox
        WindowReadbackTestFixture.InputQueuePointerMove(window, box.X + 8, box.Y + 8)
        WindowReadbackTestFixture.ForceRender(window, 0.0)
    }
    return window
}

func RetainedEqualityClose(window Window, host EmbeddedSmokeHost) {
    window.Close()
    host.DestroyNative()
    host.Dispose()
}

func RetainedEqualityFresh(
    seed int32,
    step int32,
    source ImageSourceProvider,
    offset int32 = 0,
    transpose bool = false,
    geometryOnly bool = false
)[]uint8 {
    let root = RetainedEqualityCell(seed, source)
    root.Step = step
    root.Offset = offset
    root.Transpose = transpose
    root.GeometryOnly = geometryOnly
    let host = EmbeddedSmokeHost()
    let window = RetainedEqualityOpen(root, host, step >= 2 ? 208: 192, 160)
    try {
        return PartialRedrawSettledCapture(window, WindowReadbackTestFixture.Metrics(window))
    } finally {
        RetainedEqualityClose(window, host)
    }
}

func RunRetainedFrameEqualitySmoke() {
    let timer = Stopwatch.StartNew()
    using let font = FontSource(
        "ReadbackGateFont",
        400,
        false,
        File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "VendSans-VariableFont_wght.ttf"))
    )
    font.Register()
    var partialSteps = 0
    let names = []string{"initial", "scroll", "resize", "hover", "text-edit", "hide", "show", "reorder", "late-image"}
    for seed in[]int32{626, 627} {
        let source = ImageStagingProvider(ImageStagingSource(2, 2, uint8(40), uint8(100), uint8(180)))
        let root = RetainedEqualityCell(seed, source)
        let host = EmbeddedSmokeHost()
        let window = RetainedEqualityOpen(root, host, 192, 160)
        var accepted = 0
        var acceptedAt int64
        guard let target = WindowReadbackTestFixture.CaptureTarget(window) else {
            throw InvalidOperationException("Retained equality render target is unavailable")
        }
        target.PresentationAccepted += ticks -> {
            accepted++
            acceptedAt = ticks
        }
        try {
            for step in 0 ... names.Length {
                let applied = WindowReadbackTestFixture.SceneVersion(window)
                if step != 4 {
                    root.Step = step
                }
                if step == 1 {
                    Require(root.Scroller.JumpTo(0.0, 7656), "Retained equality scroll failed")
                } else if step == 2 {
                    host.Resize(208, 160, 260, 240)
                } else if step == 3 {
                    let box = root.HoverTarget.BorderBox
                    WindowReadbackTestFixture.InputQueuePointerMove(window, box.X + 8, box.Y + 8)
                } else if step == 4 {
                    root.HoverTarget.Focus()
                    window.InputQueueKeyPressForTest(Key.E)
                    window.InputQueueKeyReleaseForTest(Key.E)
                } else if step == 8 {
                    source.Replace(ImageStagingSource(2, 2, uint8(220), uint8(60), uint8(100)))
                } else if step > 0 {
                    root.Rebuild()
                }
                let fresh = RetainedEqualityFresh(seed, step, source)
                let inputAt = Stopwatch.GetTimestamp()
                let first = accepted
                var appliedVersion = applied
                for attempt in 0 ... 8 {
                    let previous = accepted
                    WindowReadbackTestFixture.ForceRender(window, 0.0)
                    if accepted == previous {
                        continue
                    }
                    let frame = accepted - first - 1
                    if step == 4 && frame == 0 {
                        Console.WriteLine(
                            "retained-frame-keystroke: seed=${seed} input-to-present-ms=${Stopwatch.GetElapsedTime(inputAt, acceptedAt).TotalMilliseconds}"
                        )
                    }
                    let metrics = WindowReadbackTestFixture.Metrics(window)
                    var damage VulkanDamageRegion
                    let partial = step > 0
                    && WindowReadbackTestFixture.ScenePartialDamageSince(window, appliedVersion, out damage)
                    if partial {
                        partialSteps++
                        WindowReadbackTestFixture.SetPartialRepeat(window, damage, true)
                    }
                    target.UsePresentedSceneForTest(
                        float32(metrics.DisplayScaleX),
                        float32(metrics.DisplayScaleY)
                    )
                    let retained = ClipCaptureReadback(window, metrics).Pixels
                    WindowReadbackTestFixture.SetPartialRepeat(window, VulkanDamageRegion{})
                    RetainedEqualityCompare(
                        fresh,
                        retained,
                        metrics.FramebufferWidth,
                        metrics.FramebufferHeight,
                        seed,
                        names[step] + "-frame-" + frame.ToString() + (partial ? "-partial": "-full")
                    )
                    appliedVersion = WindowReadbackTestFixture.SceneVersion(window)
                }
                Require(accepted > first, "Retained equality did not present step " + names[step])
            }
            let reference = RetainedEqualityFresh(seed, 1, source, 0, false, true)
            let translated = RetainedEqualityFresh(seed, 1, source, 8, false, true)
            let shifted = [reference.Length]uint8
            let width = 192
            let height = 160
            for y in 0 ... height {
                for x in 0 ... width {
                    let at = (y * width + x) * 4
                    shifted[at + 3] = uint8(255)
                    if x >= 8 && y >= 8 {
                        Array.Copy(reference, ((y - 8) * width + x - 8) * 4, shifted, at, 4)
                    }
                }
            }
            RetainedEqualityCompare(shifted, translated, width, height, seed, "translation")
            let column = RetainedEqualityFresh(seed, 1, source, 0, true, true)
            let transposed = [reference.Length]uint8
            Array.Copy(reference, transposed, reference.Length)
            for y in 0 ... 80 {
                for x in 0 ... 80 {
                    Array.Copy(
                        reference,
                        ((32 + x) * width + 12 + y) * 4,
                        transposed,
                        ((32 + y) * width + 12 + x) * 4,
                        4
                    )
                }
            }
            RetainedEqualityCompare(transposed, column, width, height, seed, "axis-swap")
        } finally {
            RetainedEqualityClose(window, host)
            source.DisposeSource()
        }
    }
    Require(partialSteps >= 4, "Retained equality did not exercise partial damage")
    Require(timer.Elapsed.TotalSeconds < 60.0, "Retained equality exceeded 60 seconds")
    Console.WriteLine(
        "retained-frame-equality: seeds=626,627 steps=18 partial-steps=${partialSteps} elapsed-ms=${timer.ElapsedMilliseconds}"
    )
}
