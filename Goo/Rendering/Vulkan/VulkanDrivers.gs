package Goo

import System
import System.Runtime.InteropServices

/// Configures additional Vulkan drivers for the process.
public class VulkanDrivers {
  private init() { }

  shared {
    private let gate object = Object()
    private var direct []string = []string{}
    private var procedures []nint = []nint{}
    private var frozen bool

    /// Gets or sets driver DLL paths added to system drivers in inclusive mode on Windows.
    /// Set this before opening the first window. Paths are copied and are never read from the environment.
    /// Throws PlatformNotSupportedException on other platforms and InvalidOperationException after Vulkan loading starts.
    public prop Direct []string {
      get { lock gate { return (direct.Clone() as []string)!! } }
      set {
        lock gate {
          if !OperatingSystem.IsWindows() { throw PlatformNotSupportedException("Direct Vulkan drivers require Windows.") }
          if frozen { throw InvalidOperationException("Vulkan drivers must be configured before Vulkan is loaded.") }
          direct = (value.Clone() as []string)!!
        }
      }
    }

    internal prop Enabled bool { get { lock gate { return direct.Length != 0 } } }

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
