package Goo

import System
import System.IO
import System.Runtime.InteropServices

internal sealed class VulkanHeadlessHost : VulkanSurfaceHost {
    private var library nint
    public prop LogicalWidth int32 {
        get -> 1
    }
    public prop LogicalHeight int32 {
        get -> 1
    }
    public prop FramebufferWidth int32 {
        get -> 1
    }
    public prop FramebufferHeight int32 {
        get -> 1
    }
    public prop Transparent bool {
        get -> false
    }
    public prop VSync bool {
        get -> false
    }
    public prop WindowHandle nint {
        get -> nint(0)
    }
    public prop PreferRequestedFramebufferExtent bool {
        get -> false
    }
    public prop AllowInheritedCompositeAlpha bool {
        get -> false
    }
    public func Wake() { }

    public func RefreshDisplayPacing(reset bool) { }

    public func LoadVulkanLibrary() bool {
        let name = if OperatingSystem.IsWindows() {
            "vulkan-1.dll"
        } else if OperatingSystem.IsMacOS() {
            "libMoltenVK.dylib"
        } else {
            "libvulkan.so.1"
        }
        return NativeLibrary.TryLoad(Path.Combine(AppContext.BaseDirectory, name), out library) ||
            NativeLibrary.TryLoad(name, out library)
    }

    public func GetVulkanGetInstanceProcAddr() nint -> NativeLibrary.GetExport(library, "vkGetInstanceProcAddr")

    public func UnloadVulkanLibrary() {
        if library != nint(0) {
            NativeLibrary.Free(library)
            library = nint(0)
        }
    }

    public func GetVulkanInstanceExtensions()[]string -> []string{"VK_KHR_surface"}

    public func CreateVulkanSurface(instance nint, out surface uint64) bool {
        surface = 0uL
        return false
    }

    public func DestroyVulkanSurface(instance nint, surface uint64) { }
}
