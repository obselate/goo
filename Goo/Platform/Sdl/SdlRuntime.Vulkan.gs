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
        VulkanDrivers.Freeze()
        if VulkanDrivers.Enabled {
          if directLoader == nint(0) {
            let local = Path.Combine(AppContext.BaseDirectory, "vulkan-1.dll")
            if !NativeLibrary.TryLoad(local, out directLoader) {
              directLoader = NativeLibrary.Load(Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.System), "vulkan-1.dll"))
            }
          }
          let address = NativeLibrary.GetExport(directLoader, "vkGetInstanceProcAddr")
          vulkanSnapshot = SdlVulkanInstanceSnapshot(address,
            []string{"VK_KHR_surface", "VK_KHR_win32_surface"})
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
            return false
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
          throw error
        }
      }
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
          if vulkanLoaded && !VulkanDrivers.Enabled {
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
