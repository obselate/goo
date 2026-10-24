package Goo

import System
import System.Collections.Generic
import System.Runtime.InteropServices

@StructLayout(LayoutKind.Sequential)
internal struct TrayMacSize {
    internal var Width float64
    internal var Height float64
}

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate TrayMacCallback(receiver nint, selector nint, argument nint);

internal unsafe class MacTrayBackend : TrayBackend {
    private let icon TrayIcon
    private var item nint
    private var target nint
    private var menu nint
    private var content TrayContent
    private var closed bool

    private init(owner TrayIcon, value TrayContent) {
        icon = owner
        content = value
    }

    public func Update(value TrayContent, pixels IReadOnlyList[uint8]) TrayStatus {
        if closed { return TrayStatus.Closed }
        let image = CreateImage(value, pixels)
        if image == nint(0) { return TrayStatus.Failed }
        var next = nint(0)
        try {
            if value.Menu.Items.Count != 0 {
                next = MacMenuBridge.Build(value.Menu.Items, value.Menu, target)
                if next == nint(0) { return TrayStatus.Failed }
            }
            let button = Send(item, Sel("button"))
            Arg(button, Sel("setImage:"), image)
            Arg(button, Sel("setToolTip:"), Text(objc_getClass("NSString"), Sel("stringWithUTF8String:"), value.Tooltip))
            Arg(item, Sel("setMenu:"), next)
            let previous = menu
            menu = next
            next = nint(0)
            content = value
            MacMenuBridge.Release(previous)
            return TrayStatus.Registered
        } finally {
            MacMenuBridge.Release(image)
            MacMenuBridge.Release(next)
        }
    }

    public func Dispose() {
        if closed { return }
        closed = true
        if item != nint(0) {
            Arg(item, Sel("setMenu:"), nint(0))
            let button = Send(item, Sel("button"))
            Arg(button, Sel("setTarget:"), nint(0))
            Arg(button, Sel("setAction:"), nint(0))
            Arg(Send(objc_getClass("NSStatusBar"), Sel("systemStatusBar")), Sel("removeStatusItem:"), item)
            MacMenuBridge.Release(item)
            item = nint(0)
        }
        MacMenuBridge.Release(menu)
        menu = nint(0)
        if target != nint(0) {
            targets.Remove(target)
            MacMenuBridge.Release(target)
            target = nint(0)
        }
    }

    shared {
        private const LogicalImageSize float64 = 18
        private let targets Dictionary[nint, MacTrayBackend] = Dictionary[nint, MacTrayBackend]()
        private let callback TrayMacCallback = Dispatch
        private var targetClass nint
        private var activateSelector nint
        private var clickSelector nint

        @DllImport("/usr/lib/libobjc.A.dylib") private func objc_getClass(name string) nint;
        @DllImport("/usr/lib/libobjc.A.dylib") private func objc_allocateClassPair(parent nint, name string, extra nuint) nint;
        @DllImport("/usr/lib/libobjc.A.dylib") private func objc_registerClassPair(value nint);
        @DllImport("/usr/lib/libobjc.A.dylib") private func objc_disposeClassPair(value nint);
        @DllImport("/usr/lib/libobjc.A.dylib") private func class_addMethod(value nint, selector nint, callback nint, types string) uint8;
        @DllImport("/usr/lib/libobjc.A.dylib") private func sel_registerName(name string) nint;
        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func Send(value nint, selector nint) nint;
        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func Arg(value nint, selector nint, argument nint) nint;
        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func Number(value nint, selector nint, argument float64) nint;
        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func Text(value nint, selector nint, argument string) nint;
        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func Image(value nint, selector nint, size TrayMacSize) nint;
        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend")
        private func Bitmap(value nint, selector nint, planes nint, width nint, height nint, bits nint, samples nint,
            alpha uint8, planar uint8, space nint, format nuint, row nint, pixel nint) nint;

        private func Sel(name string) nint -> sel_registerName(name)

        internal func Create(icon TrayIcon, content TrayContent, pixels IReadOnlyList[uint8],
            out status TrayStatus, out error string) TrayBackend? {
            status = TrayStatus.Failed
            error = ""
            if targetClass == nint(0) {
                targetClass = objc_allocateClassPair(objc_getClass("NSObject"), "GooNativeTrayTarget", nuint(0))
                if targetClass == nint(0) {
                    error = "AppKit did not create the tray callback target"
                    return nil
                }
                activateSelector = Sel("activate:")
                clickSelector = Sel("clicked:")
                let pointer = Marshal.GetFunctionPointerForDelegate(callback)
                if class_addMethod(targetClass, activateSelector, pointer, "v@:@") == 0
                    || class_addMethod(targetClass, clickSelector, pointer, "v@:@") == 0 {
                    objc_disposeClassPair(targetClass)
                    targetClass = nint(0)
                    error = "AppKit did not install tray callbacks"
                    return nil
                }
                objc_registerClassPair(targetClass)
            }
            let result = MacTrayBackend(icon, content)
            result.target = Send(Send(targetClass, Sel("alloc")), Sel("init"))
            result.item = Number(Send(objc_getClass("NSStatusBar"), Sel("systemStatusBar")),
                Sel("statusItemWithLength:"), -1.0)
            if result.item != nint(0) { Send(result.item, Sel("retain")) }
            if result.target == nint(0) || result.item == nint(0) {
                result.Dispose()
                error = "AppKit did not create the status item"
                return nil
            }
            let button = Send(result.item, Sel("button"))
            if button == nint(0) {
                result.Dispose()
                error = "AppKit did not create the status button"
                return nil
            }
            targets.Add(result.target, result)
            Arg(button, Sel("setTarget:"), result.target)
            Arg(button, Sel("setAction:"), clickSelector)
            status = result.Update(content, pixels)
            if status == TrayStatus.Failed {
                result.Dispose()
                error = "AppKit did not accept the tray image or menu"
                return nil
            }
            return result
        }

        private func Dispatch(receiver nint, selector nint, argument nint) {
            if !targets.TryGetValue(receiver, out var backend) || backend.closed { return }
            try {
                if selector == clickSelector { backend.icon.PostActivation() }
                else if selector == activateSelector {
                    let tag = int64(Send(argument, Sel("tag")))
                    if tag > 0 && tag <= backend.content.Menu.Actions.Count {
                        backend.icon.PostCommand(backend.content.Menu.Actions[int32(tag) - 1].Id)
                    }
                }
            } catch (error Exception) { backend.icon.PostStatus(TrayStatus.Failed) }
        }

        private func CreateImage(content TrayContent, pixels IReadOnlyList[uint8]) nint {
            let space = Text(objc_getClass("NSString"), Sel("stringWithUTF8String:"), "NSDeviceRGBColorSpace")
            let bitmap = Bitmap(Send(objc_getClass("NSBitmapImageRep"), Sel("alloc")),
                Sel("initWithBitmapDataPlanes:pixelsWide:pixelsHigh:bitsPerSample:samplesPerPixel:hasAlpha:isPlanar:colorSpaceName:bitmapFormat:bytesPerRow:bitsPerPixel:"),
                nint(0), nint(content.Width), nint(content.Height), nint(8), nint(4), uint8(1), uint8(0), space,
                nuint(2), nint(content.Width * 4), nint(32))
            if bitmap == nint(0) { return nint(0) }
            try {
                let memory = Send(bitmap, Sel("bitmapData"))
                if memory == nint(0) { return nint(0) }
                let bytes = *uint8(memory)
                for index in 0 ... pixels.Count { bytes[index] = pixels[index] }
                let tagged = Arg(bitmap, Sel("bitmapImageRepByRetaggingWithColorSpace:"),
                    Send(objc_getClass("NSColorSpace"), Sel("sRGBColorSpace")))
                if tagged == nint(0) { return nint(0) }
                let scale = LogicalImageSize / float64(Math.Max(content.Width, content.Height))
                let image = Image(Send(objc_getClass("NSImage"), Sel("alloc")), Sel("initWithSize:"),
                    TrayMacSize{Width: float64(content.Width) * scale, Height: float64(content.Height) * scale})
                if image != nint(0) { Arg(image, Sel("addRepresentation:"), tagged) }
                return image
            } finally { MacMenuBridge.Release(bitmap) }
        }
    }
}
