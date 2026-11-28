package Goo

import System
import System.Collections.Generic
import System.Diagnostics
import System.IO
import System.Reflection
import System.Runtime.InteropServices
import System.Security.Cryptography
import System.Text
import System.Threading

internal unsafe partial class VulkanStartupReport {
    private const MaxCharacters int32 = 20000
    private let text StringBuilder = StringBuilder()
    private let payloads HashSet[string] = HashSet[string](StringComparer.Ordinal)
    private var fallback bool
    private var explicitDrivers bool
    private var selected string = "none"
    private var truncated bool

    shared {
        internal var Current VulkanStartupReport?
        private var lastPath string?
        private var writeError string?
        private var reportGate object?

        private prop Gate object {
            get {
                if let ready = reportGate {
                    return ready
                }
                let created = Object()
                return Interlocked.CompareExchange(ref reportGate, created, nil) ?? created
            }
        }

        private func VulkanVersion(value uint32) string ->
        (value >> 22).ToString() + "." + ((value >> 12) & 1023u).ToString() + "." + (value & 4095u).ToString()

        internal func Begin() bool {
            let sync = Gate
            Monitor.Enter(sync)
            if Current != nil {
                Monitor.Exit(sync)
                return false
            }
            try {
                let report = VulkanStartupReport()
                Current = report
                report.Header()
                report.Attempt("initial")
                return true
            } catch (error Exception) {
                writeError = error.GetType().Name + ": " + error.Message
                try {
                    Current?.StopCapture()
                } catch (cleanup Exception) { }
                Current = nil
                Monitor.Exit(sync)
                return false
            }
        }

        internal func Finish(error Exception? = nil) {
            if !Monitor.IsEntered(Gate) {
                return
            }
            guard let report = Current else {
                return
            }
            try {
                report.StopCapture()
                if let failure = error {
                    report.Exception(failure)
                }
                report.Line("Selected device: " + report.selected)
                report.Line(
                    "Outcome: " + if error != nil {
                        "failed"
                    } else if report.fallback {
                        "software fallback succeeded (info)"
                    } else if report.explicitDrivers {
                        "explicit driver startup succeeded (info)"
                    } else {
                        "succeeded"
                    }
                )
                if error != nil || report.fallback || report.explicitDrivers {
                    report.LoadedPayloads()
                    report.Save()
                }
            } catch (failure Exception) {
                writeError = failure.Message
            } finally {
                Current = nil
                Monitor.Exit(Gate)
            }
        }

        internal func FailureMessage(message string) string {
            if let path = lastPath {
                return message + "\nStartup graphics report: " + path
            }
            return if writeError != nil {
                message + "\nStartup graphics report could not be written: " + writeError
            } else {
                message
            }
        }
    }

    private func Line(value string) {
        let remaining = MaxCharacters - text.Length
        if remaining <= 0 {
            truncated = true
            return
        }
        text.AppendLine(
            if value.Length < remaining - 1 {
                value
            } else {
                truncated = true
                value.Substring(0, Math.Max(0, remaining - 1))
            }
        )
    }

    private func Header() {
        lastPath = nil
        writeError = nil
        Line("Goo startup graphics report")
        Line("UTC: " + DateTimeOffset.UtcNow.ToString("O"))
        Line("Application: " + (Assembly.GetEntryAssembly()?.GetName().Name ?? "application"))
        Line("Application version: " + (Assembly.GetEntryAssembly()?.GetName().Version?.ToString() ?? "unknown"))
        Line("Executable: " + (Environment.ProcessPath ?? "unknown"))
        Line("Application directory: " + AppContext.BaseDirectory)
        Line("Goo version: " + (typeof(VulkanDrivers).Assembly.GetName().Version?.ToString() ?? "unknown"))
        Line("OS: " + RuntimeInformation.OSDescription)
        Line("OS version/build: " + Environment.OSVersion.Version.ToString())
        Line(
            "Architecture: OS=" + RuntimeInformation.OSArchitecture.ToString()
            + " process=" + RuntimeInformation.ProcessArchitecture.ToString()
        )
        Line("Preflight: https://github.com/obselate/goo/blob/main/docs/platform-preflight.md")
        Line("Environment (before diagnostics overrides):")
        for name in[]string{
            "VK_DRIVER_FILES",
            "VK_ICD_FILENAMES",
            "VK_ADD_DRIVER_FILES",
            "VK_LOADER_DRIVERS_SELECT",
            "VK_LOADER_DRIVERS_DISABLE",
            "VK_INSTANCE_LAYERS",
            "VK_LAYER_PATH",
            "VK_LOADER_LAYERS_ENABLE",
            "VK_LOADER_LAYERS_DISABLE",
            "VK_LOADER_DEBUG",
            "VK_LOADER_DEVICE_SELECT",
            "SDL_VULKAN_LIBRARY",
            "SDL_VIDEODRIVER",
            "GOO_VK_DIAGNOSTICS",
            "GOO_VK_STARTUP_REPORT",
            "LD_LIBRARY_PATH",
            "LD_PRELOAD",
            "XDG_SESSION_TYPE",
            "WAYLAND_DISPLAY",
            "XDG_RUNTIME_DIR",
            "DRI_PRIME",
            "MESA_VK_DEVICE_SELECT",
            "MESA_VK_DEVICE_SELECT_FORCE_DEFAULT_DEVICE",
            "__NV_PRIME_RENDER_OFFLOAD",
            "__VK_LAYER_NV_optimus"
        } {
            Line("  " + name + "=" + (Environment.GetEnvironmentVariable(name) ?? "<unset>"))
        }
        Platform()
    }

    private func Attempt(name string) {
        Line("")
        Line("Attempt: " + name + " at " + DateTimeOffset.UtcNow.ToString("O"))
        let drivers = VulkanDrivers.Direct
        let exclusive = VulkanDrivers.Exclusive
        explicitDrivers = explicitDrivers || drivers.Length != 0 || exclusive
        Line("VulkanDrivers.Exclusive=" + exclusive.ToString())
        Line(
            "VulkanDrivers.Direct=" + if drivers.Length == 0 {
                "<empty>"
            } else {
                string.Join(", ", drivers)
            }
        )
        Line("Bundled software renderer: " + VulkanDrivers.BundledPath)
        Line(
            "Automatic software fallback: " + if VulkanDrivers.ExplicitlyConfigured {
                "disabled by explicit driver settings"
            } else if !VulkanDrivers.Bundled {
                "unavailable: bundled renderer is absent"
            } else {
                "enabled"
            }
        )
        Line(
            "Fallback reason: " + if VulkanDrivers.FallbackReason == "" {
                "<none>"
            } else {
                VulkanDrivers.FallbackReason
            }
        )
        Line("VK_LOADER_DEBUG=" + (Environment.GetEnvironmentVariable("VK_LOADER_DEBUG") ?? "<unset>"))
        StartCapture()
    }

    internal func Fallback(error Exception) {
        StopCapture()
        Exception(error)
        Line("Selected device: " + selected)
        Line("Outcome: retrying with bundled software renderer (info)")
        fallback = true
        selected = "none"
        Attempt("software fallback")
    }

    internal func ReuseRuntime() {
        explicitDrivers = false
        Line("Using an existing graphics runtime")
    }

    internal func Device(facts VulkanSharedDeviceFacts) {
        selected = facts.DeviceName + " vendor=0x" + facts.VendorId.ToString("x4")
        + " device=0x" + facts.DeviceId.ToString("x4") + " driver=" + facts.DriverVersion.ToString()
        + " Vulkan=" + VulkanVersion(facts.ApiVersion)
    }

    internal func Adapter(properties *VkPhysicalDeviceProperties) {
        Line(
            "Vulkan adapter: " + (Marshal.PtrToStringUTF8(nint(&properties[0].deviceName[0])) ?? "unknown")
            + " vendor=0x" + properties[0].vendorID.ToString("x4") + " device=0x" + properties[0].deviceID.ToString(
                "x4"
            )
            + " driver(raw)=" + properties[0].driverVersion.ToString() +
                " Vulkan=" +
                VulkanVersion(properties[0].apiVersion)
        )
    }

    internal func Exception(error Exception) {
        Line(
            "Exception: " + (error.GetType().FullName ?? error.GetType().Name)
            + " HResult=0x" + error.HResult.ToString("x8") + ": " + error.Message
        )
        if error is AggregateException aggregate {
            for inner in aggregate.InnerExceptions {
                Exception(inner)
            }
        } else if let inner = error.InnerException {
            Exception(inner)
        }
    }

    internal func Payload(path string) {
        if !payloads.Add(path) {
            return
        }
        try {
            using let file = File.OpenRead(path)
            Line(
                "Native payload: " + Path.GetFullPath(path) + " bytes=" + file.Length.ToString()
                + " SHA-256=" + Convert.ToHexString(SHA256.HashData(file))
            )
        } catch (error Exception) {
            Line("Native payload: " + path + " unavailable: " + error.Message)
        }
    }

    private func LoadedPayloads() {
        if let executable = Environment.ProcessPath {
            Payload(executable)
        }
        try {
            using let process = Process.GetCurrentProcess()
            for module ProcessModule in process.Modules {
                let path = module.FileName
                if path.Contains("vulkan", StringComparison.OrdinalIgnoreCase)
                || path.Contains("MoltenVK", StringComparison.OrdinalIgnoreCase)
                || path.Contains("SDL", StringComparison.OrdinalIgnoreCase) {
                    Payload(path)
                }
            }
        } catch (error Exception) {
            Line("Loaded native module inventory unavailable: " + error.Message)
        }
    }

    private func Save() {
        let app = Path.GetFileName(Assembly.GetEntryAssembly()?.GetName().Name ?? "application")
        let configured = VulkanDrivers.StartupReportPath
        let temporary = Path.Combine(Path.GetTempPath(), "Goo", app, "startup-graphics.log")
        let data = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)
        let preferred = if configured == "" || configured == "1" || configured == nil {
            if data == "" {
                temporary
            } else {
                Path.Combine(data, "Goo", app, "startup-graphics.log")
            }
        } else {
            configured
        }
        for path in[]string{preferred, temporary} {
            try {
                let resolved = Path.GetFullPath(path)
                Directory.CreateDirectory(Path.GetDirectoryName(resolved)!!)
                let content = text.ToString() +
                    (
                    if truncated {
                        "\n[Report truncated to fit 64 KiB]\n"
                    } else {
                        ""
                    }
                )
                File.WriteAllText(resolved, content, UTF8Encoding(false))
                lastPath = resolved
                VulkanDrivers.SetStartupReportPath(resolved)
                writeError = nil
                return
            } catch (error Exception) {
                writeError = path + ": " + error.Message
            }
        }
    }
}
