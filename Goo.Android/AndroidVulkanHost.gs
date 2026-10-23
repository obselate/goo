package Goo.Android

import Android.Runtime
import Android.Views
import Goo
import System
import System.Runtime.InteropServices

internal class AndroidVulkanHost(view GooView) : EmbeddedWindowHost {
    private var library nint
    private var nativeWindow nint

    internal func AcquireSurface(surface Surface) {
        if nativeWindow != 0 {
            throw InvalidOperationException("An Android native window is already attached.")
        }
        nativeWindow = ANativeWindow_fromSurface(JNIEnv.Handle, surface.Handle)
        if nativeWindow == 0 {
            throw InvalidOperationException("Android did not provide a native Vulkan window.")
        }
    }

    internal func ReleaseSurface() {
        if nativeWindow == 0 {
            return
        }
        ANativeWindow_release(nativeWindow)
        nativeWindow = 0
    }

    internal func RefreshSurface(surface Surface) {
        let next = ANativeWindow_fromSurface(JNIEnv.Handle, surface.Handle)
        if next == 0 {
            throw InvalidOperationException("Android did not provide a resized native window.")
        }
        if next == nativeWindow {
            ANativeWindow_release(next)
            return
        }
        try {
            DetachPresentation()
        } catch {
            ANativeWindow_release(next)
            rethrow
        }
        ReleaseSurface()
        nativeWindow = next
    }

    protected override func GetNativeHandle() nint -> nativeWindow

    protected override func PreferRequestedFramebufferExtent() bool -> true

    protected override func AllowInheritedCompositeAlpha() bool -> true

    protected override func StartTextInput() bool -> view.BeginTextInput()

    protected override func StopTextInput() -> view.EndTextInput()

    protected override func SetImeArea(
        x int32,
        y int32,
        width int32,
        height int32,
        cursor int32
    ) bool -> view.SetImeArea(x, y, width, height)

    protected override func GetClipboardText() string -> view.GetClipboardText()

    protected override func SetClipboardText(value string) -> view.SetClipboardText(value)

    protected override func RequestFrame() -> view.RequestFrame()

    protected override func LoadVulkanLibrary() bool -> NativeLibrary.TryLoad("libvulkan.so", out library)

    protected override func GetVulkanGetInstanceProcAddr() nint -> NativeLibrary.GetExport(
        library,
        "vkGetInstanceProcAddr"
    )

    protected override func GetVulkanInstanceExtensions()[]string -> []string{
        "VK_KHR_surface",
        "VK_KHR_android_surface"
    }

    protected override func UnloadVulkanLibrary() {
        if library != 0 {
            NativeLibrary.Free(library)
        }
        library = 0
    }

    protected override func CreateVulkanSurface(instance nint, out surface uint64) bool {
        unsafe {
            surface = uint64(0)
            if nativeWindow == 0 {
                return false
            }
            let get = GetVulkanGetInstanceProcAddr() as (unmanaged[Cdecl](nint, *uint8) -> nint)?
            if get == nil {
                return false
            }
            let name = []uint8{
                0x76,
                0x6B,
                0x43,
                0x72,
                0x65,
                0x61,
                0x74,
                0x65,
                0x41,
                0x6E,
                0x64,
                0x72,
                0x6F,
                0x69,
                0x64,
                0x53,
                0x75,
                0x72,
                0x66,
                0x61,
                0x63,
                0x65,
                0x4B,
                0x48,
                0x52,
                0x00
            }
            fixed pointer *uint8 = name {
                let create = get(instance, pointer) as (
                    unmanaged[Cdecl](nint, *AndroidSurfaceCreateInfo, nint, *uint64) -> int32
                )?
                if create == nil {
                    return false
                }
                var info = AndroidSurfaceCreateInfo{Type: 1000008000, Window: nativeWindow}
                var created uint64 = uint64(0)
                let result = create(instance, &info, 0, &created)
                surface = created
                return result == 0
            }
        }
    }

    protected override func DestroyVulkanSurface(instance nint, surface uint64) {
        unsafe {
            let get = GetVulkanGetInstanceProcAddr() as (unmanaged[Cdecl](nint, *uint8) -> nint)?
            if get == nil {
                return
            }
            let name = []uint8{
                0x76,
                0x6B,
                0x44,
                0x65,
                0x73,
                0x74,
                0x72,
                0x6F,
                0x79,
                0x53,
                0x75,
                0x72,
                0x66,
                0x61,
                0x63,
                0x65,
                0x4B,
                0x48,
                0x52,
                0x00
            }
            fixed pointer *uint8 = name {
                let destroy = get(instance, pointer) as (unmanaged[Cdecl](nint, uint64, nint) -> void)?
                if destroy != nil {
                    destroy(instance, surface, 0)
                }
            }
        }
    }

    @StructLayout(LayoutKind.Sequential)
    private struct AndroidSurfaceCreateInfo {
        var Type uint32
        var Next nint
        var Flags uint32
        var Window nint
    }

    shared {
        @DllImport("libandroid.so")
        private func ANativeWindow_fromSurface(environment nint, surface nint) nint;

        @DllImport("libandroid.so")
        private func ANativeWindow_release(window nint);
    }
}
