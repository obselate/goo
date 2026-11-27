package WebView2Spike

import Goo
import Microsoft.Web.WebView2.Core
import System
import System.Diagnostics
import System.IO
import System.Runtime.InteropServices
import System.Threading
import System.Threading.Tasks

unsafe class WebViewHost {
    let Root ElementHandle = ElementHandle()
    let Region ElementHandle = ElementHandle()
    let Badge ElementHandle = ElementHandle()
    var Hwnd nint
    var Controller CoreWebView2CompositionController?
    var RegionRect PixelRect
    var BadgeRect PixelRect
    var BadgePresses int32
    var OverlayDriver string = ""
    var SyncTicks int64
    var Navigation bool?
    var Message string?
    private var composition nint
    private var visual nint
    private var overlay nint
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
        Native.Check(createVisual(composition, &overlay), "CreateVisual(overlay)")
        let setRoot = cast[unmanaged[Stdcall](nint, nint) -> int32](Native.Method(target, 3))
        Native.Check(setRoot(target, root), "SetRoot")
        let addVisual = cast[unmanaged[Stdcall](nint, nint, int32, nint) -> int32](Native.Method(root, 16))
        Native.Check(addVisual(root, visual, 1, nint(0)), "AddVisual")
        Native.Check(addVisual(root, overlay, 1, visual), "AddVisual(overlay)")
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
            await ShowOverlay(window)
        } catch (error Exception) {
            Console.Error.WriteLine(error)
        }
    }

    async func ShowOverlay(window Window) Task {
        let result = await window.RenderOffscreenAsync(
            OverlayView(),
            OffscreenRenderOptions(
                LayoutSize(SpikeTheme.BadgeWidth, SpikeTheme.BadgeHeight),
                uint32(BadgeRect.Width),
                uint32(BadgeRect.Height),
                Color.Transparent,
                536870912L
            ),
            CancellationToken.None
        )
        PresentOverlay(result.Capture ?? throw InvalidOperationException("Overlay render: ${result.Status} ${result.Error}"))
    }

    private func PresentOverlay(capture WindowCapture) {
        var device nint
        var level int32
        var context nint
        OverlayDriver = "hardware"
        if Native.D3D11CreateDevice(nint(0), 1, nint(0), 0u, nint(0), 0u, 7u, out device, out level, out context) < 0 {
            OverlayDriver = "warp"
            Native.Check(
                Native.D3D11CreateDevice(nint(0), 5, nint(0), 0u, nint(0), 0u, 7u, out device, out level, out context),
                "D3D11CreateDevice(WARP)"
            )
        }
        var dxgi nint
        var adapter nint
        var factory nint
        var swapChain nint
        var texture nint
        var dxgiIdentifier = Guid("54ec77fa-1377-44e6-8c32-88fd5f44c84c")
        var factoryIdentifier = Guid("50c83a1c-e072-4c48-87b0-3630fa36a6d0")
        var textureIdentifier = Guid("6f15aaf2-d208-4e89-9ab4-489535d34f9c")
        var description = SwapChainDescription{
            Width: capture.Width,
            Height: capture.Height,
            Format: 28u,
            SampleCount: 1u,
            BufferUsage: 0x20u,
            BufferCount: 2u,
            SwapEffect: 3u,
            AlphaMode: 1u
        }
        let query = cast[unmanaged[Stdcall](nint, *Guid, *nint) -> int32](Native.Method(device, 0))
        Native.Check(query(device, &dxgiIdentifier, &dxgi), "QueryInterface(IDXGIDevice)")
        let getAdapter = cast[unmanaged[Stdcall](nint, *nint) -> int32](Native.Method(dxgi, 7))
        Native.Check(getAdapter(dxgi, &adapter), "IDXGIDevice.GetAdapter")
        let getParent = cast[unmanaged[Stdcall](nint, *Guid, *nint) -> int32](Native.Method(adapter, 6))
        Native.Check(getParent(adapter, &factoryIdentifier, &factory), "IDXGIAdapter.GetParent(IDXGIFactory2)")
        let createSwapChain = cast[unmanaged[Stdcall](nint, nint, *SwapChainDescription, nint, *nint) -> int32](
            Native.Method(factory, 24)
        )
        Native.Check(
            createSwapChain(factory, device, &description, nint(0), &swapChain),
            "CreateSwapChainForComposition"
        )
        let getBuffer = cast[unmanaged[Stdcall](nint, uint32, *Guid, *nint) -> int32](Native.Method(swapChain, 9))
        Native.Check(getBuffer(swapChain, 0u, &textureIdentifier, &texture), "IDXGISwapChain.GetBuffer")
        let update = cast[unmanaged[Stdcall](nint, nint, uint32, nint, *uint8, uint32, uint32) -> void](
            Native.Method(context, 48)
        )
        fixed pixels *uint8 = capture.Pixels {
            update(context, texture, 0u, nint(0), pixels, capture.RowBytes, 0u)
        }
        let present = cast[unmanaged[Stdcall](nint, uint32, uint32) -> int32](Native.Method(swapChain, 8))
        Native.Check(present(swapChain, 0u, 0u), "IDXGISwapChain.Present")
        let setContent = cast[unmanaged[Stdcall](nint, nint) -> int32](Native.Method(overlay, 15))
        Native.Check(setContent(overlay, swapChain), "SetContent(overlay)")
        Commit()
        for reference in []nint{texture, swapChain, factory, adapter, dxgi, context, device} {
            Marshal.Release(reference)
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
        let rect = Pixels(box, scale)
        BadgeRect = Pixels(Badge.BorderBox, scale)
        Place(visual, rect)
        Place(overlay, BadgeRect)
        controller.Bounds = System.Drawing.Rectangle(0, 0, rect.Width, rect.Height)
        controller.NotifyParentWindowPositionChanged()
        Commit()
        RegionRect = rect
        SyncTicks = Stopwatch.GetTimestamp()
    }

    func BadgePressed() {
        BadgePresses++
    }

    private func Pixels(box ElementRect, scale float64) PixelRect -> PixelRect(
        int32(Math.Round(box.X * scale)),
        int32(Math.Round(box.Y * scale)),
        int32(Math.Round((box.X + box.Width) * scale)),
        int32(Math.Round((box.Y + box.Height) * scale))
    )

    private func Place(target nint, rect PixelRect) {
        let setOffsetX = cast[unmanaged[Stdcall](nint, float32) -> int32](Native.Method(target, 4))
        let setOffsetY = cast[unmanaged[Stdcall](nint, float32) -> int32](Native.Method(target, 6))
        Native.Check(setOffsetX(target, float32(rect.Left)), "SetOffsetX")
        Native.Check(setOffsetY(target, float32(rect.Top)), "SetOffsetY")
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
