package Goo

import System
import System.IO
import System.Runtime.InteropServices

/// Configures additional Vulkan drivers for the process.
/// Referencing Goo.SoftwareRenderer enables automatic hardware-first fallback to bundled Mesa lavapipe on Windows x64 and Linux x64.
/// Explicit Direct or Exclusive settings disable automatic fallback.
public class VulkanDrivers {
  private init() { }

  shared {
    private let gate object = Object()
    private var direct []string = []string{}
    private var procedures []nint = []nint{}
    private var frozen bool
    private var exclusive bool
    private var configured bool
    private var software bool
    private var fallbackReason string = ""

    /// Gets or sets driver library paths loaded on Windows or Linux, alongside system drivers unless Exclusive is true.
    /// Set this before opening the first window. Paths are copied and are never read from the environment.
    /// Throws PlatformNotSupportedException on other platforms and InvalidOperationException after Vulkan loading starts.
    public prop Direct []string {
      get { lock gate { return (direct.Clone() as []string)!! } }
      set {
        lock gate {
          if !OperatingSystem.IsWindows() && !OperatingSystem.IsLinux() { throw PlatformNotSupportedException("Direct Vulkan drivers require Windows or Linux.") }
          if frozen { throw InvalidOperationException("Vulkan drivers must be configured before Vulkan is loaded.") }
          direct = (value.Clone() as []string)!!
          configured = true
        }
      }
    }

    /// Gets or sets whether only Direct drivers are enumerated on Windows or Linux.
    /// Set this before opening the first window. The default is false.
    /// Throws PlatformNotSupportedException on other platforms and InvalidOperationException after Vulkan loading starts.
    public prop Exclusive bool {
      get { lock gate { return exclusive } }
      set {
        lock gate {
          if !OperatingSystem.IsWindows() && !OperatingSystem.IsLinux() { throw PlatformNotSupportedException("Direct Vulkan drivers require Windows or Linux.") }
          if frozen { throw InvalidOperationException("Vulkan drivers must be configured before Vulkan is loaded.") }
          exclusive = value
          configured = true
        }
      }
    }

    internal prop Enabled bool { get { lock gate { return direct.Length != 0 } } }

    internal prop BundledPath string {
      get -> Path.Combine(AppContext.BaseDirectory,
        if OperatingSystem.IsWindows() { "vulkan_lvp.dll" } else { "libvulkan_lvp.so" })
    }

    internal prop Bundled bool {
      get -> (OperatingSystem.IsWindows() || OperatingSystem.IsLinux()) && File.Exists(BundledPath)
    }

    internal prop ManualLoader bool { get { lock gate { return direct.Length != 0 || (!configured && Bundled) } } }
    internal prop FallbackReason string { get { lock gate { return fallbackReason } } }

    internal func TryUseSoftware(reason string) bool {
      lock gate {
        if configured || software || !Bundled { return false }
        direct = []string{BundledPath}
        procedures = []nint{}
        exclusive = true
        software = true
        fallbackReason = reason
        return true
      }
    }

    internal func Freeze() {
      lock gate { frozen = true }
    }

    internal func Load() []nint {
      lock gate {
        frozen = true
        if procedures.Length != 0 || direct.Length == 0 { return procedures }
        let loaded = [direct.Length]nint
        for index in 0 ... direct.Length {
          let path = direct[index]
          try {
            let library = NativeLibrary.Load(path)
            loaded[index] = NativeLibrary.GetExport(library, "vk_icdGetInstanceProcAddr")
          } catch (error Exception) {
            throw InvalidOperationException("Cannot load direct Vulkan driver '" + path + "' and its vk_icdGetInstanceProcAddr export.", error)
          }
        }
        procedures = loaded
        return procedures
      }
    }
  }
}
