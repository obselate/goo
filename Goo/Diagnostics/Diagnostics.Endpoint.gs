package Goo

import System
import System.Diagnostics
import System.Globalization
import System.IO
import System.Threading

internal class DiagnosticEndpointDiscovery {
  shared {
    private let gate object = Object()
    private var nextWindowId int64

    internal func Create(window Window) DiagnosticEndpoint {
      let processId = Environment.ProcessId
      let processName = Process.GetCurrentProcess().ProcessName
      let protocol = "goo.devtools/1"
      let root = runtimeRoot()
      let created = DateTime.UtcNow.ToString("O", CultureInfo.InvariantCulture)
      let ordinal = Interlocked.Increment(&nextWindowId)
      let suffix = processId.ToString(CultureInfo.InvariantCulture) + "-"
      +ordinal.ToString(CultureInfo.InvariantCulture)
      let descriptorPath = Path.Combine(root, "goo-" + suffix + ".json")
      let pipeName = "goo-" + suffix
      let windowId = "window-" + suffix
      let endpoint = DiagnosticEndpoint(processId, processName, protocol, 1, "named-pipe",
        pipeName, descriptorPath, created, windowId)
      lock gate {
        Directory.CreateDirectory(root)
        secureDirectory(root)
        writeDescriptor(endpoint, window.Title)
      }
      return endpoint
    }

    internal func Release(endpoint DiagnosticEndpoint) {
      lock gate {
        try {
          if File.Exists(endpoint.DescriptorPath) { File.Delete(endpoint.DescriptorPath) }
        } catch (_ Exception) {
        }
      }
    }

    private func runtimeRoot() string {
      let directoryOverride = Environment.GetEnvironmentVariable("GOO_DEVTOOLS_DIR")
      if directoryOverride != nil && directoryOverride != "" {
        return directoryOverride
      }
      if OperatingSystem.IsWindows() {
        let local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)
        return Path.Combine(local, "Goo", "DevTools")
      }
      let runtime = Environment.GetEnvironmentVariable("XDG_RUNTIME_DIR")
      if runtime != nil && runtime != "" {
        return Path.Combine(runtime, "goo")
      }
      return Path.Combine(Path.GetTempPath(), "goo-devtools")
    }

    private func writeDescriptor(endpoint DiagnosticEndpoint, title string) {
      let json = "{\"pid\":" + endpoint.ProcessId.ToString(CultureInfo.InvariantCulture)
      +",\"process\":" + DiagnosticJson.Quote(endpoint.ProcessName)
      +",\"protocol\":" + DiagnosticJson.Quote(endpoint.Protocol)
      +",\"version\":" + endpoint.Version.ToString(CultureInfo.InvariantCulture)
      +",\"transport\":" + DiagnosticJson.Quote(endpoint.Transport)
      +",\"pipe\":" + DiagnosticJson.Quote(endpoint.PipeName)
      +",\"createdUtc\":" + DiagnosticJson.Quote(endpoint.CreatedUtc)
      +",\"startedAt\":" + DiagnosticJson.Quote(endpoint.CreatedUtc)
      +",\"windows\":[{\"id\":" + DiagnosticJson.Quote(endpoint.WindowId)
      +",\"title\":" + DiagnosticJson.Quote(title) + "}]}"
      File.WriteAllText(endpoint.DescriptorPath, json, System.Text.Encoding.UTF8)
      try {
        if !OperatingSystem.IsWindows() {
          File.SetUnixFileMode(endpoint.DescriptorPath,
            UnixFileMode.UserRead | UnixFileMode.UserWrite)
        }
      } catch (_ Exception) {
      }
    }

    private func secureDirectory(path string) {
      try {
        if !OperatingSystem.IsWindows() {
          File.SetUnixFileMode(path,
            UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute)
        }
      } catch (_ Exception) {
      }
    }

  }
}
