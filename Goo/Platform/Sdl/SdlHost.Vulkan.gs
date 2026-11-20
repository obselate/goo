package Goo

import System
import System.Collections.Generic
import System.Runtime.InteropServices
import Hexa.NET.SDL3

internal unsafe struct SdlVulkanExtensionPointer {
  var Value * int8
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct SdlVulkanWaylandSurfaceInfo {
  var sType VkStructureType
  var pNext *void
  var flags uint32
  var display nint
  var surface nint
}

internal unsafe partial class SdlHost {
  private var waylandVulkanFrame bool

  shared {
    @DllImport("SDL3", EntryPoint: "Goo_WaylandVulkanGeometryVersion", CallingConvention: CallingConvention.Cdecl)
    private func WaylandVulkanGeometryVersionNative(window nint) uint64;
    @DllImport("SDL3", EntryPoint: "Goo_WaylandVulkanFrameReady", CallingConvention: CallingConvention.Cdecl)
    private func WaylandVulkanFrameReadyNative(window nint) uint8;
    @DllImport("SDL3", EntryPoint: "Goo_PrepareWaylandVulkanFrame", CallingConvention: CallingConvention.Cdecl)
    private func PrepareWaylandVulkanFrameNative(window nint);
    @DllImport("SDL3", EntryPoint: "Goo_FinishWaylandVulkanFrame", CallingConvention: CallingConvention.Cdecl)
    private func FinishWaylandVulkanFrameNative(window nint, committed uint8);
  }

  internal func WaylandVulkanFrameReady() bool ->
    !waylandVulkanFrame || WaylandVulkanFrameReadyNative(windowHandle) != uint8(0)

  internal func WaylandVulkanGeometryVersion() uint64 ->
    waylandVulkanFrame ? WaylandVulkanGeometryVersionNative(windowHandle) : 0uL

  internal func WaylandVulkanFrameMatches(version uint64, extent VkExtent2D) bool {
    let current = WaylandVulkanGeometryVersion()
    if current == 0uL { return true }
    var width int32
    var height int32
    return current == version && SDL.GetWindowSizeInPixels(window, &width, &height)
      && uint32(width) == extent.width && uint32(height) == extent.height
  }

  internal func PrepareWaylandVulkanFrame() {
    if waylandVulkanFrame { PrepareWaylandVulkanFrameNative(windowHandle) }
  }

  internal func FinishWaylandVulkanFrame(committed bool) {
    if waylandVulkanFrame { FinishWaylandVulkanFrameNative(windowHandle, committed ? uint8(1) : uint8(0)) }
  }

  public prop PreferRequestedFramebufferExtent bool{ get -> false }
  public prop AllowInheritedCompositeAlpha bool{ get -> OperatingSystem.IsMacOS() || OperatingSystem.IsWindows() }
  internal prop WindowsPresentationHandle nint {
    get -> if OperatingSystem.IsWindows() {
      nint(SDL.GetPointerProperty(SDL.GetWindowProperties(window), "SDL.window.win32.hwnd", nil))
    } else { nint(0) }
  }
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

  public func RetainVulkanLibrary() Action {
    ThrowIfDisposed()
    SdlRuntime.Acquire()
    try {
      if !SdlRuntime.AcquireVulkan() {
        throw InvalidOperationException("Vulkan loader initialization failed")
      }
    } catch {
      SdlRuntime.Release()
      rethrow
    }
    return () -> {
      try { SdlRuntime.ReleaseVulkan() } finally { SdlRuntime.Release() }
    }
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
    if VulkanDrivers.ManualLoader && OperatingSystem.IsLinux() {
      let createSurface = DirectVulkanProc(instance, "vkCreateWaylandSurfaceKHR")
        as (unmanaged[Cdecl](VkInstance, *SdlVulkanWaylandSurfaceInfo, *VkAllocationCallbacks, *VkSurfaceKHR) -> VkResult)?
      if createSurface == nil { throw InvalidOperationException("vkCreateWaylandSurfaceKHR is unavailable.") }
      let properties = SDL.GetWindowProperties(window)
      var info = SdlVulkanWaylandSurfaceInfo{
        sType: VkConstants.VK_STRUCTURE_TYPE_WAYLAND_SURFACE_CREATE_INFO_KHR,
        display: nint(SDL.GetPointerProperty(properties, "SDL.window.wayland.display", nil)),
        surface: nint(SDL.GetPointerProperty(properties, "SDL.window.wayland.surface", nil)) }
      var createdSurface VkSurfaceKHR = 0uL
      let create = createSurface
      let result = create(instance, &info, nil, &createdSurface)
      surface = createdSurface
      return result == VkConstants.VK_SUCCESS
    }
    if VulkanDrivers.ManualLoader {
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
    if VulkanDrivers.ManualLoader {
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
