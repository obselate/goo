package GooAsyncReadbackSmoke

import Goo
import Hexa.NET.SDL3
import System
import System.IO

class ScrollbarSmokeCell : Cell {
    shared {
        let Track ElementHandle = ElementHandle{}
        let Thumb ElementHandle = ElementHandle{}
    }

    internal var ThumbPresses int32

    override func Build() Blob -> Container(){
        .Width: Percent(100),
        .Height: Percent(100),
        .BackgroundColor: Color.Rgb(12, 20, 32),
        .OverflowY: Overflow.Scroll,
        .ScrollbarVisibilityY: ScrollbarVisibility.Always,
        .ScrollbarY: Scrollbar{
            Thickness: 12,
            HitThickness: 18,
            Inset: 8,
            MinThumbLength: 32,
            ReserveSpace: true,
            Track: Container{
                Handle: ScrollbarSmokeCell.Track,
                BackgroundColor: Color.Rgb(176, 42, 74),
                BorderRadius: 6,
            },
            Thumb: Container{
                Handle: ScrollbarSmokeCell.Thumb,
                BackgroundColor: Color.Rgb(38, 224, 112),
                BorderRadius: 6,
                OnPointerDown: (e PointerEvent) -> ThumbPresses++,
            },
        },
        Container{Width: Percent(100), Height: 420, FlexShrink: 0, BackgroundColor: Color.Rgb(28, 84, 180),},
    }
}

func RunScrollbarSmoke() {
    Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1", "GOO_VK_DIAGNOSTICS=1 is required")
    let cell = ScrollbarSmokeCell{}
    let capturedError = StringWriter()
    let originalError = Console.Error
    var window Window? = nil
    try {
        let opened = Window{
            Title: "Goo scrollbar visual interaction gate",
            Width: 180,
            Height: 140,
            VSync: false,
            Decorated: false,
            Resizable: true,
            Root: cell,
        }
        window = opened
        Console.SetError(capturedError)
        opened.Open()
        WindowReadbackTestFixture.ForceRender(opened, 0.0)
        WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
        let metrics = WindowReadbackTestFixture.Metrics(opened)
        Require(
            ScrollbarSmokeCell.Track.IsMounted && ScrollbarSmokeCell.Thumb.IsMounted,
            "Scrollbar visual parts did not mount"
        )
        let track = ScrollbarSmokeCell.Track.BorderBox
        let initialThumb = ScrollbarSmokeCell.Thumb.BorderBox
        Require(
            track.Width == 12.0 && track.Height > initialThumb.Height
            && initialThumb.Width == 12.0 && initialThumb.Height >= 32.0,
            "Scrollbar visual geometry is incorrect"
        )

        let first = PrimitiveReadback(opened, metrics)
        let initialCenterX = initialThumb.X + initialThumb.Width * 0.5
        let initialCenterY = initialThumb.Y + initialThumb.Height * 0.5
        let initialPixel = PrimitiveLogicalPixel(first.Pixels, first.Width, metrics, initialCenterX, initialCenterY)
        Require(
            int32(initialPixel[1]) > int32(initialPixel[0]) + 100
            && int32(initialPixel[1]) > int32(initialPixel[2]) + 70,
            "Scrollbar thumb visual was not rendered: " + PrimitivePixelText(initialPixel)
        )
        PrimitiveRequirePixelNear(
            first.Pixels,
            first.Width,
            metrics,
            track.X + track.Width + 4.0,
            track.Y + track.Height * 0.5,
            uint8(12),
            uint8(20),
            uint8(32),
            8,
            "reserved_gutter"
        )

        let dragY = track.Y + track.Height - initialThumb.Height * 0.5
        WindowReadbackTestFixture.InputQueuePointerMove(opened, initialCenterX, initialCenterY)
        WindowReadbackTestFixture.InputQueuePointerPress(opened, initialCenterX, initialCenterY)
        WindowReadbackTestFixture.InputQueuePointerMove(opened, initialCenterX, dragY)
        WindowReadbackTestFixture.InputQueuePointerRelease(opened, initialCenterX, dragY)
        WindowReadbackTestFixture.ForceRender(opened, 0.0)
        let movedThumb = ScrollbarSmokeCell.Thumb.BorderBox
        Require(
            cell.ThumbPresses == 1 && movedThumb.Y > initialThumb.Y + 30.0,
            "Scrollbar thumb drag did not move the retained visual"
        )

        let second = PrimitiveReadback(opened, metrics)
        let movedPixel = PrimitiveLogicalPixel(
            second.Pixels,
            second.Width,
            metrics,
            movedThumb.X + movedThumb.Width * 0.5,
            movedThumb.Y + movedThumb.Height * 0.5
        )
        Require(
            int32(movedPixel[1]) > int32(movedPixel[0]) + 100
            && int32(movedPixel[1]) > int32(movedPixel[2]) + 70,
            "Dragged scrollbar thumb visual was not rendered: " + PrimitivePixelText(movedPixel)
        )

        let nativeThumb = ScrollbarSmokeCell.Thumb.BorderBox
        let nativeX = nativeThumb.X + nativeThumb.Width * 0.5
        let nativeY = nativeThumb.Y + nativeThumb.Height * 0.5
        let outsideX = -20.0
        let outsideY = nativeY - 20.0
        let edgeX = 0
        let edgeY = opened.Height / 2
        WindowReadbackTestFixture.NativeMousePress(opened, nativeX, nativeY)
        Require(
            WindowReadbackTestFixture.NativeHitTest(opened, edgeX, edgeY) == SDLHitTestResult.Normal
            && WindowReadbackTestFixture.NativeHitTest(opened, -20, edgeY) == SDLHitTestResult.Normal,
            "Held native press did not suppress resize hit-test"
        )
        WindowReadbackTestFixture.NativeMouseMove(opened, outsideX, outsideY, PointerButtons.Primary)
        WindowReadbackTestFixture.ForceRender(opened, 0.0)
        let outsideThumb = ScrollbarSmokeCell.Thumb.BorderBox
        Require(outsideThumb.Y < nativeThumb.Y - 8.0, "Held primary motion outside did not drag")
        let heldY = outsideThumb.Y
        WindowReadbackTestFixture.NativeMousePress(opened, outsideX, outsideY, PointerButton.Secondary)
        WindowReadbackTestFixture.NativeMouseRelease(opened, outsideX, outsideY, PointerButton.Secondary)
        WindowReadbackTestFixture.NativeMouseMove(opened, outsideX, outsideY - 24.0, PointerButtons.Primary)
        WindowReadbackTestFixture.ForceRender(opened, 0.0)
        Require(
            ScrollbarSmokeCell.Thumb.BorderBox.Y < heldY - 4.0,
            "Secondary release stopped primary drag"
        )
        let releasedY = ScrollbarSmokeCell.Thumb.BorderBox.Y
        WindowReadbackTestFixture.NativeMouseRelease(opened, outsideX, outsideY - 24.0)
        Require(
            WindowReadbackTestFixture.NativeHitTest(opened, edgeX, edgeY) == SDLHitTestResult.ResizeLeft,
            "Outside native release did not restore resize hit-test"
        )
        WindowReadbackTestFixture.NativeMouseMove(opened, nativeX, nativeY, PointerButtons.None)
        WindowReadbackTestFixture.ForceRender(opened, 0.0)
        Require(ScrollbarSmokeCell.Thumb.BorderBox.Y == releasedY, "Outside native release did not stop drag")
        let fresh = ScrollbarSmokeCell.Thumb.BorderBox
        let freshX = fresh.X + fresh.Width * 0.5
        let freshY = fresh.Y + fresh.Height * 0.5
        WindowReadbackTestFixture.NativeMousePress(opened, freshX, freshY)
        WindowReadbackTestFixture.NativeMouseMove(opened, freshX, dragY, PointerButtons.Primary)
        WindowReadbackTestFixture.NativeMouseRelease(opened, freshX, dragY)
        WindowReadbackTestFixture.ForceRender(opened, 0.0)
        Require(
            ScrollbarSmokeCell.Thumb.BorderBox.Y > releasedY + 8.0,
            "Fresh native press did not drag"
        )

        opened.RequestClose()
        WindowReadbackTestFixture.Pump(opened, 0.0)
        Require(!opened.IsOpen, "Scrollbar smoke window did not close")
    } finally {
        Console.SetError(originalError)
        if let active = window {
            if active.IsOpen {
                active.RequestClose()
                WindowReadbackTestFixture.DrainWindowQueue(active, 10000)
                WindowReadbackTestFixture.Pump(active, 0.0)
            }
        }
    }
    ReadbackValidateCommonDiagnostics(capturedError.ToString())
    Console.WriteLine("scrollbar-visual-interaction: mounted=1 pixels=validated drag=1 callbacks=1 close=1")
}
