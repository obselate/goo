package GooPackageSmoke

import Goo
import System
import System.Runtime.InteropServices

class NativeBackdropProbe {
    shared {
        internal func Verify(window Window, windowsMaterial int32, macMaterial int32,
            macState int32, emphasized bool, masked bool) {
            if OperatingSystem.IsWindowsVersionAtLeast(10, 0, 22621) && window.BackdropAvailable {
                let native = FindWindow(nint(0), window.Title)
                BackdropRequire(native != nint(0), "Backdrop HWND was not found")
                var process uint32
                GetWindowThreadProcessId(native, out process)
                BackdropRequire(process == uint32(Environment.ProcessId), "Backdrop HWND belongs to another process")
                var material int32
                BackdropRequire(DwmGetWindowAttribute(native, 38u, out material, 4u) >= 0
                    && material == windowsMaterial, "DWM did not apply the requested material")
            }
            if OperatingSystem.IsMacOS() {
                let windows = Send(Send(objc_getClass("NSApplication"), sel_registerName("sharedApplication")),
                    sel_registerName("windows"))
                let count = int32(Send(windows, sel_registerName("count")))
                var effect nint
                for i in 0 ... count {
                    let native = SendArg(windows, sel_registerName("objectAtIndex:"), nint(i))
                    let title = Send(Send(native, sel_registerName("title")), sel_registerName("UTF8String"))
                    if Marshal.PtrToStringUTF8(title) != window.Title { continue }
                    let views = Send(Send(native, sel_registerName("contentView")), sel_registerName("subviews"))
                    let viewCount = int32(Send(views, sel_registerName("count")))
                    for j in 0 ... viewCount {
                        let view = SendArg(views, sel_registerName("objectAtIndex:"), nint(j))
                        if IsKind(view, sel_registerName("isKindOfClass:"), objc_getClass("NSVisualEffectView")) != 0 {
                            effect = view
                        }
                    }
                }
                BackdropRequire(effect != nint(0), "AppKit backdrop view was not found")
                BackdropRequire(int32(Send(effect, sel_registerName("material"))) == macMaterial,
                    "AppKit material did not update")
                BackdropRequire(int32(Send(effect, sel_registerName("state"))) == macState,
                    "AppKit activation policy did not update")
                BackdropRequire((GetBool(effect, sel_registerName("isEmphasized")) != 0) == emphasized,
                    "AppKit emphasis did not update")
                BackdropRequire((GetBool(effect, sel_registerName("isHidden")) == 0) == window.BackdropAvailable,
                    "AppKit fallback visibility did not match availability")
                let mask = Send(effect, sel_registerName("maskImage"))
                BackdropRequire((mask != nint(0)) == masked, "AppKit mask did not update")
                if masked {
                    let image = GetImage(mask, sel_registerName("CGImageForProposedRect:context:hints:"),
                        nint(0), nint(0), nint(0))
                    BackdropRequire(image != nint(0) && CGImageGetWidth(image) == nuint(2)
                        && CGImageGetHeight(image) == nuint(2), "AppKit mask dimensions changed")
                    let data = CGDataProviderCopyData(CGImageGetDataProvider(image))
                    BackdropRequire(data != nint(0), "AppKit mask pixels were unavailable")
                    try {
                        let bytes = CFDataGetBytePtr(data)
                        let stride = int32(CGImageGetBytesPerRow(image))
                        BackdropRequire(Marshal.ReadByte(bytes, 3) == uint8(0)
                            && Marshal.ReadByte(bytes, 7) == uint8(255)
                            && Marshal.ReadByte(bytes, stride + 3) == uint8(128),
                            "AppKit mask did not preserve copied alpha pixels")
                    } finally { CFRelease(data) }
                }
            }
        }

        @DllImport("user32.dll", EntryPoint: "FindWindowW", CharSet: CharSet.Unicode)
        private func FindWindow(className nint, title string) nint;
        @DllImport("user32.dll") private func GetWindowThreadProcessId(window nint, out process uint32) uint32;
        @DllImport("dwmapi.dll") private func DwmGetWindowAttribute(window nint, attribute uint32,
            out value int32, size uint32) int32;
        @DllImport("/usr/lib/libobjc.A.dylib") private func objc_getClass(name string) nint;
        @DllImport("/usr/lib/libobjc.A.dylib") private func sel_registerName(name string) nint;
        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func Send(receiver nint, selector nint) nint;
        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func SendArg(receiver nint, selector nint, value nint) nint;
        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func GetBool(receiver nint, selector nint) uint8;
        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func IsKind(receiver nint, selector nint, type nint) uint8;
        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func GetImage(receiver nint, selector nint,
            rect nint, context nint, hints nint) nint;
        @DllImport("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics") private func CGImageGetWidth(image nint) nuint;
        @DllImport("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics") private func CGImageGetHeight(image nint) nuint;
        @DllImport("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics") private func CGImageGetBytesPerRow(image nint) nuint;
        @DllImport("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics") private func CGImageGetDataProvider(image nint) nint;
        @DllImport("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics") private func CGDataProviderCopyData(provider nint) nint;
        @DllImport("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation") private func CFDataGetBytePtr(data nint) nint;
        @DllImport("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation") private func CFRelease(value nint);
    }
}
