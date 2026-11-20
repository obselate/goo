package GooAsyncReadbackSmoke

import Goo
import System
import System.IO

internal class StartupReportSmokeCell : Cell {
    internal var Built bool

    override func Build() Blob {
        Require(VulkanStartupReport.Current == nil, "Root Cell built during startup graphics capture")
        Built = true
        return Container{Width: 160, Height: 90}
    }
}

func RunStartupGraphicsReportSmoke() {
    let mode = Environment.GetEnvironmentVariable("GOO_STARTUP_GRAPHICS_SMOKE") ?? "normal"
    if let path = Environment.GetEnvironmentVariable("GOO_STARTUP_REPORT_PATH_OPTION") {
        VulkanDrivers.StartupReportPath = path
    }
    let flagStart = GC.GetAllocatedBytesForCurrentThread()
    let enabled = VulkanDiagnostics.StartupReportEnabled
    let flagAllocated = GC.GetAllocatedBytesForCurrentThread() - flagStart
    let requested = VulkanDrivers.StartupReportPath
    let originalDebug = Environment.GetEnvironmentVariable("VK_LOADER_DEBUG")
    if mode == "failure" {
        VulkanDrivers.Exclusive = false
    }
    if mode == "direct" {
        VulkanDrivers.Direct = []string{VulkanDrivers.BundledPath}
        VulkanDrivers.Exclusive = true
    }
    if mode == "direct-failure" {
        VulkanDrivers.Direct = []string{Path.Combine(AppContext.BaseDirectory, "missing-vulkan-driver")}
        VulkanDrivers.Exclusive = true
    }
    if !enabled {
        Require(flagAllocated == 0L, "Disabled startup report flag allocated " + flagAllocated.ToString() + " bytes")
        let before = GC.GetAllocatedBytesForCurrentThread()
        for index in 0 ... 1000 {
            if VulkanDiagnostics.StartupReportEnabled {
                VulkanStartupReport.Begin()
            }
            if VulkanDiagnostics.StartupReportEnabled {
                VulkanStartupReport.Current?.Device(VulkanSharedDeviceFacts{})
            }
            if VulkanDiagnostics.StartupReportEnabled {
                VulkanStartupReport.Finish()
            }
        }
        let allocated = GC.GetAllocatedBytesForCurrentThread() - before
        Require(allocated == 0L, "Disabled startup report hooks allocated " + allocated.ToString() + " bytes")
        Console.WriteLine(
            "disabled-report-hooks: flagAllocatedBytes=" + flagAllocated.ToString()
            + " allocatedBytes=" + allocated.ToString()
        )
    }
    var failed = false
    let root = StartupReportSmokeCell()
    let window = Window{Title: "Goo startup graphics report smoke", SizeToContent: SizeToContent.Both, Root: root}
    try {
        window.Open()
        Require(root.Built, "Window.Open did not measure the root Cell")
        window.Pump(0.0)
        if enabled && (mode == "fallback" || mode == "direct") {
            let path = VulkanDrivers.StartupReportPath!!
            let before = File.ReadAllText(path)
            let second = Window{Title: "Goo shared graphics startup", Size: LayoutSize(160, 90), Root: Cell{}}
            try {
                second.Open()
            } finally {
                second.Close()
            }
            Require(before == File.ReadAllText(path), "Shared runtime startup replaced the original fallback report")
        }
    } catch (error GraphicsUnavailableException) {
        failed = true
        Console.WriteLine("graphics-error: " + error.Message)
        Require(enabled == error.Message.Contains("Startup graphics report:"), "Exception report path opt-in mismatch")
    } finally {
        window.Close()
    }
    Require(failed == (mode == "failure" || mode == "direct-failure"), "Unexpected graphics startup outcome")
    Require(
        originalDebug == Environment.GetEnvironmentVariable("VK_LOADER_DEBUG"),
        "Loader debug environment was not restored"
    )
    if !enabled {
        Require(VulkanDrivers.StartupReportPath == requested, "Disabled startup changed report settings")
        Require(VulkanStartupReport.Current == nil, "Disabled startup created a report")
    } else if mode == "normal" {
        Require(requested != nil && !File.Exists(requested), "Normal startup wrote a report")
    } else {
        let path = VulkanDrivers.StartupReportPath!!
        Require(File.Exists(path), "Startup report is missing")
        Require(FileInfo(path).Length <= 65536L, "Startup report exceeds 64 KiB")
        let report = File.ReadAllText(path)
        for field in[]string{
            "UTC:",
            "Application version:",
            "Executable:",
            "OS:",
            "Architecture:",
            "Remote session:",
            "Platform and adapters:",
            "VK_DRIVER_FILES=",
            "VK_ICD_FILENAMES=",
            "SDL_VULKAN_LIBRARY=",
            "VulkanDrivers.Direct=",
            "VulkanDrivers.Exclusive=",
            "Native payload:",
            "SHA-256=",
            "Vulkan loader stderr",
            "Selected device:",
            "Outcome:"
        } {
            Require(report.Contains(field), "Startup report is missing " + field)
        }
        if failed {
            Require(report.Contains("Exception:"), "Failed attempt omitted its exception chain")
        }
        if mode == "fallback" {
            Require(
                report.Contains("Attempt: initial") && report.Contains("Attempt: software fallback"),
                "Fallback attempt history is missing"
            )
            Require(report.Contains("software fallback succeeded (info)"), "Fallback outcome is missing")
        }
        Console.WriteLine("startup-report: " + path + " bytes=" + FileInfo(path).Length.ToString())
    }
    Console.WriteLine(
        "startup-graphics: mode=" + mode + " reportEnabled=" + enabled.ToString() + " failed=" + failed.ToString()
    )
}
