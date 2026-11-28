package Goo

import System
import System.IO
import System.Runtime.InteropServices
import Hexa.NET.SDL3

internal class SdlVulkanInstanceSnapshot {
  private let getInstanceProcAddress nint
  private let extensions []string

  internal init(getInstanceProcAddress nint, extensions []string) {
    this.getInstanceProcAddress = getInstanceProcAddress
    this.extensions = extensions
  }

  internal prop GetInstanceProcAddress nint{
    get -> getInstanceProcAddress
  }

  internal prop Extensions []string{
    get -> extensions
  }
}

internal unsafe partial class SdlRuntime {
  shared {
    private var vulkanReferenceCount int32
    private var vulkanLoaded bool
    private var vulkanSnapshot SdlVulkanInstanceSnapshot?
    private var directLoader nint

    internal func AcquireVulkan() bool {
      lock (sync) {
        RequireMainThreadLocked("SDL Vulkan acquisition")
        if vulkanReferenceCount > 0 {
          if !vulkanLoaded || vulkanSnapshot == nil {
            throw InvalidOperationException("SDL Vulkan loader state is invalid.")
          }
          if vulkanReferenceCount == Int32.MaxValue {
            throw OverflowException("SDL Vulkan reference count overflow.")
          }
          vulkanReferenceCount++
          return true
        }
        if vulkanLoaded || vulkanSnapshot != nil {
          throw InvalidOperationException("SDL Vulkan loader state is invalid.")
        }
        try {
          VulkanDrivers.Freeze()
          if VulkanDrivers.ManualLoader {
            if directLoader == nint(0) {
              if OperatingSystem.IsWindows() && VulkanDrivers.Enabled {
                let local = Path.Combine(AppContext.BaseDirectory, "vulkan-1.dll")
                if VulkanDiagnostics.StartupReportEnabled { VulkanStartupReport.TryLoad(local, out directLoader) }
                else { NativeLibrary.TryLoad(local, out directLoader) }
              }
              if directLoader == nint(0) {
                let system = if OperatingSystem.IsWindows() {
                  Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "vulkan-1.dll")
                } else { "libvulkan.so.1" }
                if VulkanDiagnostics.StartupReportEnabled { VulkanStartupReport.TryLoad(system, out directLoader) }
                else { NativeLibrary.TryLoad(system, out directLoader) }
              }
              if directLoader != nint(0) {
                var version uint32 = 0u
                var address nint = nint(0)
                if NativeLibrary.TryGetExport(directLoader, "vkEnumerateInstanceVersion", out address) {
                  let enumerate = address as (unmanaged[Cdecl](*uint32) -> VkResult)?
                  if enumerate != nil {
                    let enumerateVersion = enumerate
                    enumerateVersion(&version)
                  }
                }
                if version < ((1u << 22) | (3u << 12) | 238u) {
                  NativeLibrary.Free(directLoader)
                  directLoader = nint(0)
                }
              }
              if directLoader == nint(0) {
                let bundled = Path.Combine(AppContext.BaseDirectory,
                  if OperatingSystem.IsWindows() { "vulkan-1.dll" } else { "libgoo-vulkan.so.1" })
                directLoader = if VulkanDiagnostics.StartupReportEnabled { VulkanStartupReport.Load(bundled) }
                  else { NativeLibrary.Load(bundled) }
              }
            }
            let surface = if OperatingSystem.IsWindows() { "VK_KHR_win32_surface" }
              else if SDL.GetCurrentVideoDriverS() == "wayland" { "VK_KHR_wayland_surface" }
              else { throw PlatformNotSupportedException("Direct Vulkan loading on Linux requires Wayland.") }
            vulkanSnapshot = SdlVulkanInstanceSnapshot(NativeLibrary.GetExport(directLoader, "vkGetInstanceProcAddr"),
              []string{"VK_KHR_surface", surface})
            vulkanLoaded = true
            vulkanReferenceCount = 1
            return true
          }

          var pathStorage nint = nint(0)
          if OperatingSystem.IsMacOS() {
            let bundledPath = Path.Combine(AppContext.BaseDirectory, "libMoltenVK.dylib")
            if File.Exists(bundledPath) {
              pathStorage = Marshal.StringToCoTaskMemUTF8(bundledPath)
            }
          }
          try {
            let path = if pathStorage == nint(0) { nil } else { *uint8(pathStorage) }
            if !SDL.VulkanLoadLibrary(path) {
              let error = SDL.GetErrorS()
              if NoVulkanDevices() {
                throw InvalidOperationException(VulkanWindowTarget.NoUsableDriverMessage())
              }
              throw InvalidOperationException("SDL Vulkan loader initialization failed: " + error)
            }
          } finally {
            if pathStorage != nint(0) {
              Marshal.FreeCoTaskMem(pathStorage)
            }
          }

          try {
            let getInstanceProcAddress = SDL_Vulkan_GetVkGetInstanceProcAddrRaw()
            if getInstanceProcAddress == nint(0) {
              throw InvalidOperationException("SDL Vulkan instance procedure lookup failed.")
            }

            var count uint32 = 0u
            let raw = SDL.VulkanGetInstanceExtensions(&count)
            if raw == nil || count == 0u || count > uint32(Int32.MaxValue) {
              throw InvalidOperationException("SDL Vulkan instance extension lookup failed: " + SDL.GetErrorS())
            }

            let pointers = *SdlVulkanExtensionPointer(raw)
            let values = [int32(count)]string
            var index uint32 = 0u
            var validCount int32 = 0
            while index < count {
              let value = Marshal.PtrToStringUTF8(nint(pointers[index].Value)) ?? ""
              if value.Length != 0 {
                values[validCount] = value
                validCount++
              }
              index++
            }
            if validCount == 0 {
              throw InvalidOperationException("SDL returned no Vulkan instance extensions.")
            }

            let extensions = [validCount]string
            var extensionIndex int32 = 0
            while extensionIndex < validCount {
              extensions[extensionIndex] = values[extensionIndex]
              extensionIndex++
            }
            vulkanSnapshot = SdlVulkanInstanceSnapshot(getInstanceProcAddress, extensions)
            vulkanLoaded = true
            vulkanReferenceCount = 1
            return true
          } catch (error Exception) {
            SDL.VulkanUnloadLibrary()
            vulkanLoaded = false
            vulkanSnapshot = nil
            vulkanReferenceCount = 0
            rethrow
          }
        } catch (error Exception) when (error is InvalidOperationException || error is DllNotFoundException
          || error is EntryPointNotFoundException || error is BadImageFormatException) {
          throw GraphicsUnavailableException(error.Message, error)
        }
      }
    }

    private func NoVulkanDevices() bool {
      let libraryName = if OperatingSystem.IsWindows() { "vulkan-1.dll" }
        else if OperatingSystem.IsMacOS() { "libMoltenVK.dylib" }
        else { "libvulkan.so.1" }
      var library nint = nint(0)
      let loaded = if VulkanDiagnostics.StartupReportEnabled { VulkanStartupReport.TryLoad(libraryName, out library) }
        else { NativeLibrary.TryLoad(libraryName, out library) }
      if !loaded { return true }
      try {
        let createAddress = NativeLibrary.GetExport(library, "vkCreateInstance")
          as (unmanaged[Cdecl](*VkInstanceCreateInfo, *VkAllocationCallbacks, *VkInstance) -> VkResult)?
        if createAddress == nil { return false }
        let create = createAddress
        var info = VkInstanceCreateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_INSTANCE_CREATE_INFO }
        var instance VkInstance = VkInstance.Null
        let result = create(&info, nil, &instance)
        if result == VkConstants.VK_ERROR_INCOMPATIBLE_DRIVER { return true }
        if result != VkConstants.VK_SUCCESS { return false }
        let destroyAddress = NativeLibrary.GetExport(library, "vkDestroyInstance")
          as (unmanaged[Cdecl](VkInstance, *VkAllocationCallbacks) -> void)?
        if destroyAddress == nil { return false }
        let destroy = destroyAddress
        try {
          let enumerateAddress = NativeLibrary.GetExport(library, "vkEnumeratePhysicalDevices")
            as (unmanaged[Cdecl](VkInstance, *uint32, *VkPhysicalDevice) -> VkResult)?
          if enumerateAddress == nil { return false }
          let enumerate = enumerateAddress
          var count uint32 = 0u
          let enumerated = enumerate(instance, &count, nil)
          return enumerated == VkConstants.VK_ERROR_INITIALIZATION_FAILED
            || (enumerated == VkConstants.VK_SUCCESS && count == 0u)
        } finally { destroy(instance, nil) }
      } finally { NativeLibrary.Free(library) }
    }

    internal func GetVulkanGetInstanceProcAddress() nint {
      lock (sync) {
        RequireMainThreadLocked("SDL Vulkan procedure lookup")
        if vulkanReferenceCount == 0 || vulkanSnapshot == nil {
          throw InvalidOperationException("SDL Vulkan loader is not acquired.")
        }
        return vulkanSnapshot!!.GetInstanceProcAddress
      }
    }

    internal func GetVulkanInstanceExtensions() []string {
      lock (sync) {
        RequireMainThreadLocked("SDL Vulkan instance extension lookup")
        if vulkanReferenceCount == 0 || vulkanSnapshot == nil {
          throw InvalidOperationException("SDL Vulkan loader is not acquired.")
        }
        let source = vulkanSnapshot!!.Extensions
        let copy = [int32(source.Length)]string
        var index int32 = 0
        while index < source.Length {
          copy[index] = source[index]
          index++
        }
        return copy
      }
    }

    internal func ReleaseVulkan() {
      lock (sync) {
        RequireMainThreadLocked("SDL Vulkan release")
        if vulkanReferenceCount == 0 {
          throw InvalidOperationException("SDL Vulkan loader is not acquired.")
        }
        vulkanReferenceCount--
        if vulkanReferenceCount != 0 {
          return
        }
        try {
          if vulkanLoaded && !VulkanDrivers.ManualLoader {
            SDL.VulkanUnloadLibrary()
          }
        } finally {
          vulkanLoaded = false
          vulkanSnapshot = nil
        }
      }
    }
  }
}
