package Goo

import System
import System.IO
import System.Runtime.InteropServices

internal sealed class VulkanHeadlessHost : VulkanSurfaceHost {
    private var library nint
    private var loaderReferences int32
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
        if loaderReferences > 0 {
            loaderReferences++
            return true
        }
        let name = if OperatingSystem.IsWindows() {
            "vulkan-1.dll"
        } else if OperatingSystem.IsMacOS() {
            "libMoltenVK.dylib"
        } else {
            "libvulkan.so.1"
        }
        let loaded = NativeLibrary.TryLoad(Path.Combine(AppContext.BaseDirectory, name), out library) ||
            NativeLibrary.TryLoad(name, out library)
        if loaded { loaderReferences = 1 }
        return loaded
    }

    public func RetainVulkanLibrary() Action {
        loaderReferences++
        return () -> UnloadVulkanLibrary()
    }

    public func GetVulkanGetInstanceProcAddr() nint -> NativeLibrary.GetExport(library, "vkGetInstanceProcAddr")

    public func UnloadVulkanLibrary() {
        loaderReferences--
        if loaderReferences > 0 { return }
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
