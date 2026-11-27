package WebView2Spike

import Goo
import Microsoft.Web.WebView2.Core
import System
import System.Collections.Generic
import System.Diagnostics
import System.Globalization
import System.IO
import System.Runtime.InteropServices
import System.Text.Json
import System.Threading.Tasks

class SelfTest {
    private const Threshold float64 = 0.95
    private const BorderThreshold float64 = 0.9
    private let window Window
    private let host WebViewHost
    private let directory string
    private let mode string
    private let acrylic bool
    private let records List[Dictionary[string, object?]] = List[Dictionary[string, object?]]()
    private let failures List[string] = List[string]()
    private var frameTicks int64
    private var reference Window?
    private var referenceTicks int64
    private var initialRegion PixelRect
    var ExitCode int32 = 1

    init(window Window, host WebViewHost, directory string, mode string) {
        this.window = window
        this.host = host
        this.directory = Path.GetFullPath(directory)
        this.mode = mode
        acrylic = mode == "transparent-acrylic"
        window.PresentationAccepted += receipt -> {
            frameTicks = receipt.AcceptedTicks
        }
    }

    async func Run() void {
        var step = "first-frame"
        try {
            await WaitUntil(() -> frameTicks != 0L, step)
            step = "webview-start"
            await host.Start(window).WaitAsync(TimeSpan.FromSeconds(60.0))
            Native.Require(
                Native.SetWindowPos(
                    host.Hwnd,
                    Native.TopmostWindow,
                    0,
                    0,
                    0,
                    0,
                    Native.NoMove | Native.NoSize | Native.NoActivate
                ) != 0,
                "SetWindowPos(topmost)"
            )
            let start = Record(step)
            start["webView2Runtime"] = CoreWebView2Environment.GetAvailableBrowserVersionString(nil)
            start["windowsVersion"] = Environment.OSVersion.Version.ToString()
            start["renderingDevice"] = window.RenderingDevice.Name
            start["transparent"] = window.IsTransparent
            start["backdropAvailable"] = window.BackdropAvailable
            if acrylic {
                Check(start, "window_transparent", window.IsTransparent)
                Check(start, "backdrop_available", window.BackdropAvailable)
                let opened = Window{
                    Title: "WebView2 spike backdrop reference",
                    Size: LayoutSize(900, 600),
                    Background: SpikeTheme.Reference,
                    Root: ReferenceView(),
                }.Open()
                opened.PresentationAccepted += receipt -> {
                    referenceTicks = receipt.AcceptedTicks
                }
                reference = opened
                await WaitUntil(() -> referenceTicks != 0L, "the reference window frame")
                PlaceReference()
            }
            step = "navigation"
            await WaitUntil(() -> host.Navigation != nil, "NavigationCompleted")
            Check(Record(step), "navigation_succeeded", host.Navigation == true)
            step = "initial"
            await Task.Delay(500)
            initialRegion = host.RegionRect
            await Measure(step, SpikeTheme.Magenta)
            step = "click"
            host.ClickCenter()
            await WaitUntil(() -> host.Message != nil, "the clicked web message")
            await Task.Delay(500)
            let clicked = await Measure(step, SpikeTheme.Cyan)
            clicked["webMessage"] = host.Message
            Check(clicked, "web_message_received", host.Message == "clicked:#00FFFF")
            step = "resize"
            let since = Stopwatch.GetTimestamp()
            let dpi = int32(Native.GetDpiForWindow(host.Hwnd))
            Native.Require(
                Native.SetWindowPos(
                    host.Hwnd,
                    nint(0),
                    0,
                    0,
                    1100 * dpi / 96,
                    700 * dpi / 96,
                    Native.NoMove | Native.NoZOrder | Native.NoActivate
                ) != 0,
                "SetWindowPos(1100x700)"
            )
            PlaceReference()
            await WaitUntil(
                () -> host.SyncTicks >= since && frameTicks >= host.SyncTicks && (!acrylic || referenceTicks >= since),
                "Goo frames and web view bounds after the resize"
            )
            await Task.Delay(500)
            let resized = await Measure(step, SpikeTheme.Cyan)
            resized["dpi"] = dpi
            Check(
                resized,
                "webview_follows_resize",
                host.RegionRect.Left != initialRegion.Left
                && "PASS".Equals(resized["webview_visible_in_region"]) && "PASS".Equals(
                    resized["controller_bounds_match_region"]
                )
            )
            step = "overlay"
            await host.ShowOverlay(window)
            await Task.Delay(500)
            let client = Native.ClientRect(host.Hwnd)
            let region = host.RegionRect
            let badge = host.BadgeRect
            let corner = int32(Math.Round(SpikeTheme.BadgeRadius * host.Scale))
            let border = int32(Math.Round(SpikeTheme.BorderWidth * host.Scale))
            let image = Path.Combine(directory, "overlay.bmp")
            let captured = TaskCompletionSource[[]uint8](TaskCreationOptions.RunContinuationsAsynchronously)
            go {
                try {
                    captured.SetResult(ScreenCapture.Capture(client, image))
                } catch (error Exception) {
                    captured.SetException(error)
                }
            }
            let pixels = await captured.Task
            let overWebView = ScreenCapture.Count(
                pixels,
                client.Width,
                PixelRect(region.Left + corner, badge.Top + corner / 2, badge.Right - corner, badge.Top + corner),
                Over(SpikeTheme.Cyan)
            )
            let overGoo = ScreenCapture.Count(
                pixels,
                client.Width,
                PixelRect(badge.Left + corner, badge.Top + corner / 2, region.Left - border - corner, badge.Top + corner),
                Over(SpikeTheme.Panel)
            )
            let outside = ScreenCapture.Count(
                pixels,
                client.Width,
                PixelRect(badge.Right + corner, region.Top + corner, region.Right - corner, region.Bottom - corner),
                Rgb(SpikeTheme.Cyan)
            )
            let record = Record(step)
            record["overlayDriver"] = host.OverlayDriver
            record["badgeRectClient"] = badge.Coordinates()
            record["regionRectClient"] = region.Coordinates()
            record["overWebViewSampledMatched"] = []int32{overWebView.Sampled, overWebView.Matched}
            record["overGooSampledMatched"] = []int32{overGoo.Sampled, overGoo.Matched}
            record["outsideSampledMatched"] = []int32{outside.Sampled, outside.Matched}
            record["image"] = Path.GetFileName(image)
            Check(record, "overlay_over_webview", overWebView.Ratio >= Threshold)
            Check(record, "overlay_over_goo", overGoo.Ratio >= Threshold)
            Check(record, "webview_outside_overlay", outside.Ratio >= Threshold)
            let message = host.Message
            let x = (region.Left + badge.Right) / 2
            let y = (badge.Top + badge.Bottom) / 2
            let point = nint((y << 16) | (x & 0xFFFF))
            record["clickPointClient"] = []int32{x, y}
            Native.Require(Native.PostMessageW(host.Hwnd, Native.MouseMoveMessage, nuint(0), point) != 0, "WM_MOUSEMOVE")
            Native.Require(
                Native.PostMessageW(host.Hwnd, Native.LeftButtonDownMessage, nuint(1), point) != 0,
                "WM_LBUTTONDOWN"
            )
            Native.Require(Native.PostMessageW(host.Hwnd, Native.LeftButtonUpMessage, nuint(0), point) != 0, "WM_LBUTTONUP")
            await WaitUntil(() -> host.BadgePresses > 0, "the badge press in Goo")
            await Task.Delay(500)
            record["badgePresses"] = host.BadgePresses
            record["webMessage"] = host.Message
            Check(record, "overlay_click_reaches_goo", host.Message == message)
            ExitCode = failures.Count == 0 ? 0 : 1
        } catch (error Exception) {
            let record = Record("exception")
            record["failedStep"] = step
            record["type"] = error.GetType().FullName
            record["message"] = error.Message
            record["hresult"] = "0x" + error.HResult.ToString("X8")
            record["detail"] = error.ToString()
            failures.Add(step + ":exception")
        } finally {
            let summary = Record("summary")
            summary["result"] = ExitCode == 0 ? "PASS" : "FAIL"
            summary["failedChecks"] = failures.ToArray()
            reference?.RequestClose()
            window.RequestClose()
        }
    }

    // HWND_TOP places the reference at the top of the non-topmost band, directly below the topmost spike window.
    private func PlaceReference() {
        guard let opened = reference else {
            return
        }
        Native.Require(Native.GetWindowRect(host.Hwnd, out var rect) != 0, "GetWindowRect")
        Native.Require(
            Native.SetWindowPos(
                opened.NativeHandle.Handle,
                nint(0),
                rect.Left,
                rect.Top,
                rect.Width,
                rect.Height,
                Native.NoActivate
            ) != 0,
            "SetWindowPos(reference)"
        )
        Native.SetForegroundWindow(host.Hwnd)
    }

    func Write() {
        Directory.CreateDirectory(directory)
        File.WriteAllLines(
            Path.Combine(directory, "selftest.jsonl"),
            records.ConvertAll(record -> JsonSerializer.Serialize(record))
        )
    }

    private async func Measure(step string, expected Color) Task[Dictionary[string, object?]] {
        let client = Native.ClientRect(host.Hwnd)
        let region = host.RegionRect.Offset(client.Left, client.Top)
        let bounds = host.Controller!!.Bounds
        let border = int32(Math.Round(SpikeTheme.BorderWidth * host.Scale))
        let margin = int32(Math.Round(SpikeTheme.WindowPadding * host.Scale))
        let image = Path.Combine(directory, step + ".bmp")
        Directory.CreateDirectory(directory)
        let done = TaskCompletionSource[ScreenSample](TaskCreationOptions.RunContinuationsAsynchronously)
        go {
            try {
                done.SetResult(
                    ScreenCapture.Sample(
                        client,
                        region,
                        border,
                        margin,
                        Rgb(expected),
                        Rgb(SpikeTheme.Panel),
                        Rgb(SpikeTheme.Border),
                        image
                    )
                )
            } catch (error Exception) {
                done.SetException(error)
            }
        }
        let sample = await done.Task
        let record = Record(step)
        record["clientRectScreen"] = client.Coordinates()
        record["regionRectScreen"] = region.Coordinates()
        record["controllerBounds"] = []int32{bounds.X, bounds.Y, bounds.Width, bounds.Height}
        record["scale"] = host.Scale
        record["borderPixels"] = border
        record["expectedRegionColor"] = Rgb(expected).ToString("X6")
        record["regionSampled"] = sample.Inner.Sampled
        record["regionMatched"] = sample.Inner.Matched
        record["panelSampled"] = sample.Panel.Sampled
        record["panelMatched"] = sample.Panel.Matched
        record["borderSampled"] = sample.Border.Sampled
        record["borderMatched"] = sample.Border.Matched
        record["image"] = Path.GetFileName(image)
        record["marginMeanRgb"] = []float64{sample.Margin.R, sample.Margin.G, sample.Margin.B}
        record["foreground"] = Native.GetForegroundWindow() == host.Hwnd
        Check(record, "webview_visible_in_region", sample.Inner.Ratio >= Threshold)
        Check(record, "goo_panel_visible_outside_region", sample.Panel.Ratio >= Threshold)
        Check(record, "orange_border_visible", sample.Border.Ratio >= BorderThreshold)
        Check(record, "controller_bounds_match_region", bounds.Width == region.Width && bounds.Height == region.Height)
        if acrylic {
            let margin = sample.Margin
            Check(
                record,
                "acrylic_margin_shows_backdrop",
                Math.Min(margin.R, margin.G) >= 96.0 && Math.Min(margin.R, margin.G) - margin.B >= 32.0
            )
        }
        return record
    }

    private func Check(record Dictionary[string, object?], name string, passed bool) {
        record[name] = passed ? "PASS" : "FAIL"
        if !passed {
            failures.Add(record["step"]!!.ToString() + ":" + name)
        }
    }

    private func Record(step string) Dictionary[string, object?] {
        let record = Dictionary[string, object?]()
        record["step"] = step
        record["mode"] = mode
        record["utc"] = DateTime.UtcNow.ToString("O", CultureInfo.InvariantCulture)
        record["hwnd"] = "0x" + host.Hwnd.ToString("X")
        records.Add(record)
        return record
    }

    private async func WaitUntil(condition() -> bool, what string) Task {
        let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 30L
        while !condition() {
            if Stopwatch.GetTimestamp() > deadline {
                throw TimeoutException("Timed out waiting for " + what)
            }
            await Task.Delay(50)
        }
    }

    private func Rgb(color Color) uint32 -> (uint32(Math.Round(color.R * 255.0F)) << 16)
    | (uint32(Math.Round(color.G * 255.0F)) << 8) | uint32(Math.Round(color.B * 255.0F))

    private func Over(below Color) uint32 {
        let top = SpikeTheme.Overlay
        return Rgb(Color.FromNormalized(
            top.R * top.A + below.R * (1.0F - top.A),
            top.G * top.A + below.G * (1.0F - top.A),
            top.B * top.A + below.B * (1.0F - top.A),
            1.0F
        ))
    }
}
