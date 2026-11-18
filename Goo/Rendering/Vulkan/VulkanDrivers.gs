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

    /// Gets or sets the optional startup graphics report path. Set an empty string for the per-app default, or nil to disable.
    /// The default is disabled. GOO_VK_STARTUP_REPORT=1 enables the default path, or its value can specify a path.
    /// Set this before Vulkan loading starts. After a report is written, the getter returns its full path.
    /// Reports contain local machine and environment details, never use the network, and are limited to 64 KiB.
    /// The default file is LocalApplicationData/Goo/entry-assembly-name/startup-graphics.log, with the same relative path under the temp directory as a fallback.
    /// Only failures and automatic fallback or explicit driver attempts write a report. A normal successful startup writes nothing.
    /// The report replaces the previous report and includes loader stderr, payload hashes, exception chains and local platform details.
    /// GOO_VK_DIAGNOSTICS=1 keeps its existing behavior and does not enable report files.
    public prop StartupReportPath string? {
      get { lock gate { return VulkanDiagnostics.StartupReportPath } }
      set {
        lock gate {
          if frozen { throw InvalidOperationException("Startup graphics reports must be configured before Vulkan is loaded.") }
          VulkanDiagnostics.StartupReportPath = value
          VulkanDiagnostics.StartupReportEnabled = value != nil
        }
      }
    }

    internal func SetStartupReportPath(path string) {
      lock gate { VulkanDiagnostics.StartupReportPath = path }
    }

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
    internal prop ExplicitlyConfigured bool { get { lock gate { return configured } } }

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
            let library = if VulkanDiagnostics.StartupReportEnabled { VulkanStartupReport.Load(path) } else { NativeLibrary.Load(path) }
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
