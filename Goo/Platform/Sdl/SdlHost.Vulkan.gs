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
    SDL.VulkanDestroySurface(
      Hexa.NET.SDL3.VkInstance(instance),
      Hexa.NET.SDL3.VkSurfaceKHR(nint(surface)),
      Hexa.NET.SDL3.VkAllocationCallbacksPtr.Null)
  }
}
