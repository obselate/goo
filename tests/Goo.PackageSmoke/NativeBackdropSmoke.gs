package GooPackageSmoke

import Goo
import System
import System.Diagnostics
import System.Threading

func BackdropRequire(value bool, message string) {
    if !value {
        throw InvalidOperationException(message)
    }
}

func BackdropPump(window Window) {
    for frame in 0 ... 8 {
        window.Pump(0.0)
        Thread.Sleep(2)
    }
}

func BackdropCapture(window Window, opaque bool) {
    let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 10
    var accepted bool
    while Stopwatch.GetTimestamp() < deadline {
        window.Pump(0.0)
        if !accepted {
            let status = window.RequestCapture()
            BackdropRequire(
                status == WindowCaptureRequestStatus.Accepted || status == WindowCaptureRequestStatus.Busy
                || status == WindowCaptureRequestStatus.NotReady,
                "Backdrop capture failed: " + status.ToString()
            )
            accepted = status == WindowCaptureRequestStatus.Accepted
        }
        if accepted {
            if let capture = window.PollCapture() {
                let alpha = int32(capture.Pixels[3])
                BackdropRequire(
                    opaque ? alpha == 255: Math.Abs(alpha - 89) <= 1,
                    "Backdrop fallback did not preserve the expected framebuffer alpha: " + alpha.ToString()
                )
                return
            }
        }
        Thread.Sleep(1)
    }
    throw InvalidOperationException("Backdrop capture timed out")
}

func BackdropClose(window Window) {
    window.RequestClose()
    let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 10
    while window.IsOpen && Stopwatch.GetTimestamp() < deadline {
        window.Pump(0.0)
        Thread.Sleep(1)
    }
    BackdropRequire(!window.IsOpen, "Backdrop window did not close")
    BackdropRequire(!window.BackdropAvailable, "Closed window retained a native backdrop")
}

func RunNativeBackdropSmoke() {
    let maskAlpha = []uint8{0, 255, 128, 255}
    let mask = WindowBackdropMask(2, 2, maskAlpha)
    Array.Clear(maskAlpha)
    for opening in 0 ... 3 {
        let window = Window{
            Title: "Goo native backdrop smoke",
            Width: 320,
            Height: 200,
            Backdrop: WindowBackdrop.Blur,
            WindowsBackdrop: WindowsBackdropOptions{Material: WindowsBackdropMaterial.Mica},
            MacOSBackdrop: MacOSBackdropOptions{
                Material: MacOSBackdropMaterial.Sidebar,
                State: MacOSBackdropState.Active,
                Emphasized: true,
                Mask: mask,
            },
            WaylandBackdrop: WaylandBackdropOptions{Region: ElementRect{X: 8.5, Y: 12.5, Width: 143, Height: 95}},
            BackdropFallbackColor: Color.Rgb(18, 52, 86),
            Background: Color.Rgb(9, 11, 16).WithAlpha(0.35),
            Root: Cell{},
        }
        BackdropRequire(!window.BackdropAvailable, "Unopened window advertised native blur")
        window.Open()
        try {
            BackdropPump(window)
            let available = window.BackdropAvailable
            let required = Environment.GetEnvironmentVariable("GOO_REQUIRE_BACKDROP")
            if required == "1" {
                BackdropRequire(available, "Expected compositor blur is unavailable")
            }
            if required == "0" {
                BackdropRequire(!available, "Expected a compositor without blur")
            }
            BackdropCapture(window, !available)
            NativeBackdropProbe.Verify(window, 2, 7, 1, true, true)
            window.WindowsBackdrop = WindowsBackdropOptions{Material: WindowsBackdropMaterial.MicaAlt}
            window.MacOSBackdrop = MacOSBackdropOptions{
                Material: MacOSBackdropMaterial.HudWindow,
                State: MacOSBackdropState.Inactive,
            }
            window.WaylandBackdrop = WaylandBackdropOptions{Region: ElementRect{X: 20, Y: 24, Width: 80, Height: 64}}
            BackdropPump(window)
            NativeBackdropProbe.Verify(window, 4, 13, 2, false, false)
            BackdropRequire(window.BackdropAvailable == available, "Live native options changed support")
            window.WindowsBackdrop = WindowsBackdropOptions{Material: WindowsBackdropMaterial.Automatic}
            window.WaylandBackdrop = WaylandBackdropOptions{Region: ElementRect{X: 0.5, Width: 0, Height: 50}}
            BackdropPump(window)
            NativeBackdropProbe.Verify(window, 0, 13, 2, false, false)
            window.Backdrop = WindowBackdrop.None
            BackdropPump(window)
            BackdropRequire(!window.BackdropAvailable, "Disabled backdrop retained native blur")
            BackdropCapture(window, false)
            window.WindowsBackdrop = WindowsBackdropOptions{}
            window.MacOSBackdrop = MacOSBackdropOptions{}
            window.WaylandBackdrop = WaylandBackdropOptions{}
            window.Backdrop = WindowBackdrop.Blur
            window.Width = 360 + opening * 8
            window.Height = 220 + opening * 8
            BackdropPump(window)
            BackdropRequire(window.BackdropAvailable == available, "Backdrop support changed after resize")
            NativeBackdropProbe.Verify(window, 3, 21, 0, false, false)
            BackdropRequire(window.Hide() == WindowOperationResult.Accepted, "Backdrop window did not hide")
            BackdropPump(window)
            BackdropRequire(window.Show() == WindowOperationResult.Accepted, "Backdrop window did not show")
            GC.Collect()
            GC.WaitForPendingFinalizers()
            GC.Collect()
            BackdropPump(window)
            BackdropRequire(window.BackdropAvailable == available, "Backdrop support changed after show")
            BackdropCapture(window, !available)
            var invalidRegionRejected bool
            try {
                window.WaylandBackdrop = WaylandBackdropOptions{Region: ElementRect{Width: Double.NaN}}
            } catch (error ArgumentOutOfRangeException) {
                invalidRegionRejected = true
            }
            BackdropRequire(invalidRegionRejected && window.WaylandBackdrop.Region == nil,
                "Invalid region changed the active backdrop")
            Console.WriteLine("Native backdrop opening=" + opening.ToString() + " available=" + available.ToString())
        } finally {
            BackdropClose(window)
        }
    }
    let opaque = Window{Title: "Goo opaque backdrop smoke", Width: 160, Height: 100, Root: Cell{}}
    opaque.Open()
    try {
        var rejected bool
        try {
            opaque.Backdrop = WindowBackdrop.Blur
        } catch (error InvalidOperationException) {
            rejected = true
        }
        BackdropRequire(
            rejected && opaque.Backdrop == WindowBackdrop.None,
            "Opaque window accepted live blur without an alpha surface"
        )
    } finally {
        BackdropClose(opaque)
    }
    Console.WriteLine("Native backdrop options, lifecycle and fallback smoke passed")
}
