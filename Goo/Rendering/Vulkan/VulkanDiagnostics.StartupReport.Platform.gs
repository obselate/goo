package Goo

import Microsoft.Win32
import System
import System.IO
import System.Runtime.InteropServices

internal unsafe partial class VulkanStartupReport {
    private func Platform() {
        Line("")
        Line("Platform and adapters:")
        try {
            if OperatingSystem.IsWindows() {
                WindowsPlatform()
            } else if OperatingSystem.IsLinux() {
                Line("OS release: " + Read("/etc/os-release"))
                Line(
                    "Remote session: SSH=" +
                        (!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("SSH_CONNECTION"))).ToString()
                    + " XRDP_SESSION=" + (Environment.GetEnvironmentVariable("XRDP_SESSION") ?? "<unset>")
                )
                let machine = Read("/sys/class/dmi/id/sys_vendor") + " / " + Read("/sys/class/dmi/id/product_name")
                Machine(machine)
                if Directory.Exists("/sys/class/drm") {
                    for card in Directory.EnumerateDirectories("/sys/class/drm", "card*") {
                        let device = Path.Combine(card, "device")
                        if !File.Exists(Path.Combine(device, "vendor")) {
                            continue
                        }
                        let driver = Directory.ResolveLinkTarget(Path.Combine(device, "driver"), true)
                            ?.Name ??
                            "unknown"
                        Line(
                            "Adapter: " + Path.GetFileName(card) + " vendor=" + Read(Path.Combine(device, "vendor"))
                            + " device=" + Read(Path.Combine(device, "device")) + " driver=" + driver
                            + " version=" + Read("/sys/module/" + driver + "/version")
                            + " driver date=<not exposed by sysfs>"
                        )
                    }
                }
                Line("Kernel driver build: " + Read("/proc/version"))
            } else {
                Line(
                    "Remote session: SSH=" +
                        (!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("SSH_CONNECTION"))).ToString()
                )
                Line("VM and OS adapter inventory: not exposed by this platform. See Vulkan device records.")
            }
        } catch (error Exception) {
            Line("Platform inventory unavailable: " + error.Message)
        }
    }

    private func WindowsPlatform() {
        using let os = Registry.LocalMachine.OpenSubKey("SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion")
        Line(
            "Windows caption: " + (os?.GetValue("ProductName")?.ToString() ?? "unknown")
            + " version=" + (os?.GetValue("DisplayVersion")?.ToString() ?? "unknown")
            + " build=" + (os?.GetValue("CurrentBuildNumber")?.ToString() ?? "unknown")
            + "." + (os?.GetValue("UBR")?.ToString() ?? "unknown")
        )
        Line("Remote session: SM_REMOTESESSION=" + GetSystemMetrics(0x1000).ToString())
        using let bios = Registry.LocalMachine.OpenSubKey("HARDWARE\\DESCRIPTION\\System\\BIOS")
        Machine(
            (bios?.GetValue("SystemManufacturer")?.ToString() ?? "unknown")
            + " / " + (bios?.GetValue("SystemProductName")?.ToString() ?? "unknown")
        )
        var factory nint
        var identifier = Guid("770aae78-f26f-4dba-a829-253c83d1b387")
        let created = CreateDxgiFactory(&identifier, &factory)
        if created < 0 {
            Line("DXGI enumeration failed: HRESULT=" + created.ToString("x8"))
            return
        }
        try {
            let enumerate = cast[unmanaged[Stdcall](nint, uint32, *nint) -> int32](
                Marshal.ReadIntPtr(Marshal.ReadIntPtr(factory), 12 * nint.Size)
            )
            for index in 0 ... 64 {
                var adapter nint
                let result = enumerate(factory, uint32(index), &adapter)
                if result == -2005270526 {
                    break
                }
                if result < 0 {
                    Line("DXGI adapter enumeration failed: HRESULT=" + result.ToString("x8"))
                    break
                }
                try {
                    let describe = cast[unmanaged[Stdcall](nint, *uint8) -> int32](
                        Marshal.ReadIntPtr(Marshal.ReadIntPtr(adapter), 10 * nint.Size)
                    )
                    let description *uint8 = stackalloc[320]uint8
                    if describe(adapter, description) < 0 {
                        continue
                    }
                    let vendor = Marshal.ReadInt32(nint(description), 256).ToString("x4")
                    let device = Marshal.ReadInt32(nint(description), 260).ToString("x4")
                    Line(
                        "DXGI adapter: " + (Marshal.PtrToStringUni(nint(description)) ?? "unknown")
                        + " vendor=0x" + vendor + " device=0x" + device
                    )
                    WindowsDriver(vendor, device)
                } finally {
                    ReleaseCom(adapter)
                }
            }
        } finally {
            ReleaseCom(factory)
        }
    }

    private func WindowsDriver(vendor string, device string) {
        using let adapters = Registry.LocalMachine.OpenSubKey(
            "SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}"
        )
        if let keys = adapters?.GetSubKeyNames() {
            for name in keys {
                using let driver = adapters?.OpenSubKey(name)
                let match = driver?.GetValue("MatchingDeviceId")?.ToString() ?? ""
                if !match.Contains("ven_" + vendor, StringComparison.OrdinalIgnoreCase)
                || !match.Contains("dev_" + device, StringComparison.OrdinalIgnoreCase) {
                    continue
                }
                Line(
                    "  Driver: " + (driver?.GetValue("ProviderName")?.ToString() ?? "unknown")
                    + " version=" + (driver?.GetValue("DriverVersion")?.ToString() ?? "unknown")
                    + " date=" + (driver?.GetValue("DriverDate")?.ToString() ?? "unknown")
                )
                return
            }
        }
        Line("  Driver version/date: unavailable in display adapter registry")
    }

    private func Machine(name string) {
        Line("System manufacturer/model: " + name)
        for marker in[]string{"virtual", "vmware", "kvm", "qemu", "xen", "parallels", "bhyve"} {
            if name.Contains(marker, StringComparison.OrdinalIgnoreCase) {
                Line("VM detection: detected from system manufacturer/model")
                return
            }
        }
        Line("VM detection: not detected from system manufacturer/model")
    }

    shared {
        private func Read(path string) string {
            try {
                using let reader = File.OpenText(path)
                let buffer = [2048]char
                let count = reader.ReadBlock(buffer, 0, buffer.Length)
                return String(buffer, 0, count).Trim()
            } catch (error Exception) {
                return "<unavailable: " + error.Message + ">"
            }
        }

        private func ReleaseCom(value nint) {
            let release = cast[unmanaged[Stdcall](nint) -> uint32](
                Marshal.ReadIntPtr(Marshal.ReadIntPtr(value), 2 * nint.Size)
            )
            release(value)
        }

        @DllImport("dxgi.dll", EntryPoint: "CreateDXGIFactory1")
        private func CreateDxgiFactory(identifier *Guid, factory *nint) int32;

        @DllImport("user32.dll") private func GetSystemMetrics(index int32) int32;
    }
}
