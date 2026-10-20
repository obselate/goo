package Goo

import System
import System.Collections.Generic
import System.Runtime.InteropServices
import Hexa.NET.SDL3

internal unsafe data struct SdlVulkanExtensionPointer {
  var Value * int8
}

internal unsafe partial class SdlHost {
  public prop PreferRequestedFramebufferExtent bool{ get -> false }
  public prop AllowInheritedCompositeAlpha bool{ get -> OperatingSystem.IsMacOS() || OperatingSystem.IsWindows() }
  public func LoadVulkanLibrary() bool {
    ThrowIfDisposed()
    if vulkanOwned {
      return true
    }
    let loaded = SdlRuntime.AcquireVulkan()
    if loaded {
      vulkanOwned = true
    }
    return loaded
  }

  public func GetVulkanGetInstanceProcAddr() nint {
    ThrowIfDisposed()
    return SdlRuntime.GetVulkanGetInstanceProcAddress()
  }

  public func UnloadVulkanLibrary() {
    ThrowIfDisposed()
    if !vulkanOwned {
      return
    }
    vulkanOwned = false
    SdlRuntime.ReleaseVulkan()
  }

  public func GetVulkanInstanceExtensions() []string {
    ThrowIfDisposed()
    return SdlRuntime.GetVulkanInstanceExtensions()
  }

  public func CreateVulkanSurface(instance nint, out surface uint64) bool {
    ThrowIfDisposed()
    if VulkanDrivers.Enabled {
      let createSurface = DirectVulkanProc(instance, "vkCreateWin32SurfaceKHR")
        as (unmanaged[Cdecl](VkInstance, *VkWin32SurfaceCreateInfoKHR, *VkAllocationCallbacks, *VkSurfaceKHR) -> VkResult)?
      if createSurface == nil { throw InvalidOperationException("vkCreateWin32SurfaceKHR is unavailable.") }
      let properties = SDL.GetWindowProperties(window)
      var info = VkWin32SurfaceCreateInfoKHR{}
      info.sType = VkConstants.VK_STRUCTURE_TYPE_WIN32_SURFACE_CREATE_INFO_KHR
      info.hwnd = nint(SDL.GetPointerProperty(properties, "SDL.window.win32.hwnd", nil))
      info.hinstance = nint(SDL.GetPointerProperty(properties, "SDL.window.win32.instance", nil))
      var createdSurface VkSurfaceKHR = 0uL
      let create = createSurface
      let result = create(instance, &info, nil, &createdSurface)
      surface = createdSurface
      return result == VkConstants.VK_SUCCESS
    }
    var nativeSurface = Hexa.NET.SDL3.VkSurfaceKHR.Null
    if !SDL.VulkanCreateSurface(
      window,
      Hexa.NET.SDL3.VkInstance(instance),
      Hexa.NET.SDL3.VkAllocationCallbacksPtr.Null,
      &nativeSurface) {
        surface = 0uL
        return false
      }
    surface = uint64(nativeSurface.Handle)
    return true
  }

  public func DestroyVulkanSurface(instance nint, surface uint64) {
    ThrowIfDisposed()
    if surface == 0uL {
      return
    }
    if VulkanDrivers.Enabled {
      let destroySurface = DirectVulkanProc(instance, "vkDestroySurfaceKHR")
        as (unmanaged[Cdecl](VkInstance, VkSurfaceKHR, *VkAllocationCallbacks) -> void)?
      if destroySurface == nil { throw InvalidOperationException("vkDestroySurfaceKHR is unavailable.") }
      let destroy = destroySurface
      destroy(instance, surface, nil)
      return
    }
    SDL.VulkanDestroySurface(
      Hexa.NET.SDL3.VkInstance(instance),
      Hexa.NET.SDL3.VkSurfaceKHR(nint(surface)),
      Hexa.NET.SDL3.VkAllocationCallbacksPtr.Null)
  }

  private func DirectVulkanProc(instance nint, name string) nint {
    let address = SdlRuntime.GetVulkanGetInstanceProcAddress()
    let getProc = address as (unmanaged[Cdecl](VkInstance, *int8) -> nint)?
    if getProc == nil { throw InvalidOperationException("vkGetInstanceProcAddr is unavailable.") }
    let storage = Marshal.StringToCoTaskMemUTF8(name)
    try {
      let lookup = getProc
      return lookup(instance, *int8(storage))
    } finally { Marshal.FreeCoTaskMem(storage) }
  }
}
