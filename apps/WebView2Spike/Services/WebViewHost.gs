package WebView2Spike

import Goo
import Microsoft.Web.WebView2.Core
import System
import System.Diagnostics
import System.IO
import System.Runtime.InteropServices
import System.Threading.Tasks

unsafe class WebViewHost {
    let Root ElementHandle = ElementHandle()
    let Region ElementHandle = ElementHandle()
    var Hwnd nint
    var Controller CoreWebView2CompositionController?
    var RegionRect PixelRect
    var SyncTicks int64
    var Navigation bool?
    var Message string?
    private var composition nint
    private var visual nint
    private var subclass SubclassProcedure?

    private let page string = "<!DOCTYPE html><html><head><style>" +
        "html,body{margin:0;height:100%;background:#FF00FF;user-select:none;cursor:default}" +
        "h1{margin:0;padding:24px;font:bold 40px sans-serif;color:#000}</style></head>" +
        "<body><h1>WebView2</h1><script>" +
        "document.addEventListener('click',()=>{" +
        "const next=document.body.style.background==='rgb(0, 255, 255)'?'#FF00FF':'#00FFFF';" +
        "document.body.style.background=next;" +
        "chrome.webview.postMessage('clicked:'+next);});" +
        "</script></body></html>"

    async func Start(window Window) Task {
        Hwnd = window.NativeHandle.Handle
        var compositionIdentifier = Guid("c37ea93a-e7aa-450d-b16f-9746cb0407f3")
        Native.Check(
            Native.DCompositionCreateDevice2(nint(0), ref compositionIdentifier, out composition),
            "DCompositionCreateDevice2"
        )
        var target nint
        let createTarget = cast[unmanaged[Stdcall](nint, nint, int32, *nint) -> int32](Native.Method(composition, 6))
        Native.Check(createTarget(composition, Hwnd, 1, &target), "CreateTargetForHwnd(topmost)")
        var root nint
        let createVisual = cast[unmanaged[Stdcall](nint, *nint) -> int32](Native.Method(composition, 7))
        Native.Check(createVisual(composition, &root), "CreateVisual(root)")
        Native.Check(createVisual(composition, &visual), "CreateVisual(web view)")
        let setRoot = cast[unmanaged[Stdcall](nint, nint) -> int32](Native.Method(target, 3))
        Native.Check(setRoot(target, root), "SetRoot")
        let addVisual = cast[unmanaged[Stdcall](nint, nint, int32, nint) -> int32](Native.Method(root, 16))
        Native.Check(addVisual(root, visual, 1, nint(0)), "AddVisual")
        Commit()

        let folder = Path.Combine(AppContext.BaseDirectory, "WebView2Data")
        let environment = await CoreWebView2Environment.CreateAsync(nil, folder, nil)
        let controller = await environment.CreateCoreWebView2CompositionControllerAsync(Hwnd)
        controller.RootVisualTarget = Marshal.GetObjectForIUnknown(visual)
        controller.CoreWebView2.NavigationCompleted += (_, e) -> {
            Navigation = e.IsSuccess
        }
        controller.CoreWebView2.WebMessageReceived += (_, e) -> {
            Message = e.TryGetWebMessageAsString()
        }
        Controller = controller
        Region.MetricsChanged += (metrics ElementMetrics) -> Sync()
        subclass = (handle, message, wparam, lparam, _, _) -> {
            if message == Native.MoveMessage {
                Controller?.NotifyParentWindowPositionChanged()
            }
            return Native.DefSubclassProc(handle, message, wparam, lparam)
        }
        Native.Require(Native.SetWindowSubclass(Hwnd, subclass!!, nuint(0x5732u), nuint(0)) != 0, "SetWindowSubclass")
        Sync()
        controller.CoreWebView2.NavigateToString(page)
    }

    async func Run(window Window) void {
        try {
            await Start(window)
        } catch (error Exception) {
            Console.Error.WriteLine(error)
        }
    }

    prop Scale float64 {
        get -> Root.BorderBox.Width > 0.0 ? float64(Native.ClientRect(Hwnd).Width) / Root.BorderBox.Width : 0.0
    }

    func Sync() {
        guard let controller = Controller else {
            return
        }
        let scale = Scale
        let box = Region.BorderBox
        if scale == 0.0 || box.Width == 0.0 {
            return
        }
        let rect = PixelRect(
            int32(Math.Round(box.X * scale)),
            int32(Math.Round(box.Y * scale)),
            int32(Math.Round((box.X + box.Width) * scale)),
            int32(Math.Round((box.Y + box.Height) * scale))
        )
        let setOffsetX = cast[unmanaged[Stdcall](nint, float32) -> int32](Native.Method(visual, 4))
        let setOffsetY = cast[unmanaged[Stdcall](nint, float32) -> int32](Native.Method(visual, 6))
        Native.Check(setOffsetX(visual, float32(rect.Left)), "SetOffsetX")
        Native.Check(setOffsetY(visual, float32(rect.Top)), "SetOffsetY")
        controller.Bounds = System.Drawing.Rectangle(0, 0, rect.Width, rect.Height)
        controller.NotifyParentWindowPositionChanged()
        Commit()
        RegionRect = rect
        SyncTicks = Stopwatch.GetTimestamp()
    }

    func PointerMoved(position Point) -> Send(
        CoreWebView2MouseEventKind.Move,
        CoreWebView2MouseEventVirtualKeys.None,
        0u,
        position
    )

    func PointerPressed(button PointerButton, position Point) {
        if button != PointerButton.Primary {
            return
        }
        Controller?.MoveFocus(CoreWebView2MoveFocusReason.Programmatic)
        Send(CoreWebView2MouseEventKind.LeftButtonDown, CoreWebView2MouseEventVirtualKeys.LeftButton, 0u, position)
    }

    func PointerReleased(button PointerButton, position Point) {
        if button != PointerButton.Primary {
            return
        }
        Send(CoreWebView2MouseEventKind.LeftButtonUp, CoreWebView2MouseEventVirtualKeys.None, 0u, position)
    }

    func Wheel(delta float64, position Point) -> Send(
        CoreWebView2MouseEventKind.Wheel,
        CoreWebView2MouseEventVirtualKeys.None,
        uint32(int64(Math.Round(delta * 120.0)) & 0xFFFFFFFFL),
        position
    )

    func ClickCenter() {
        let center = System.Drawing.Point(RegionRect.Width / 2, RegionRect.Height / 2)
        let controller = Controller!!
        controller.MoveFocus(CoreWebView2MoveFocusReason.Programmatic)
        controller.SendMouseInput(CoreWebView2MouseEventKind.Move, CoreWebView2MouseEventVirtualKeys.None, 0u, center)
        controller.SendMouseInput(
            CoreWebView2MouseEventKind.LeftButtonDown,
            CoreWebView2MouseEventVirtualKeys.LeftButton,
            0u,
            center
        )
        controller.SendMouseInput(
            CoreWebView2MouseEventKind.LeftButtonUp,
            CoreWebView2MouseEventVirtualKeys.None,
            0u,
            center
        )
    }

    private func Send(
        kind CoreWebView2MouseEventKind,
        keys CoreWebView2MouseEventVirtualKeys,
        data uint32,
        position Point
    ) {
        guard let controller = Controller else {
            return
        }
        let scale = Scale
        controller.SendMouseInput(
            kind,
            keys,
            data,
            System.Drawing.Point(int32(Math.Round(position.X * scale)), int32(Math.Round(position.Y * scale)))
        )
    }

    private func Commit() {
        let commit = cast[unmanaged[Stdcall](nint) -> int32](Native.Method(composition, 3))
        Native.Check(commit(composition), "IDCompositionDevice.Commit")
    }
}
