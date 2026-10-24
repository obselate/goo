package Goo.DevTools.Cli

import System
import System.Collections.Generic
import System.Diagnostics
import System.IO
import System.Linq
import System.Text.Json

internal data class DiscoveryDescriptor(
    DescriptorPath string,
    Protocol string,
    ProcessId int32,
    ProcessName string,
    Pipe string,
    Transport string,
    ApplicationName string?,
    WindowTitle string?,
    StartedAt DateTimeOffset?,
    Metadata JsonElement
) : IEquatable[DiscoveryDescriptor] {
    prop WindowId string? {
        get {
            if Metadata.TryGetProperty("windows", out var windows) && windows.ValueKind == JsonValueKind.Array {
                for window in windows.EnumerateArray() {
                    if window.ValueKind == JsonValueKind.Object && window.TryGetProperty("id", out var id) &&
                        id.ValueKind == JsonValueKind.String {
                        return id.GetString()
                    }
                }
            }
            return nil
        }
    }

    prop IsProcessAlive bool {
        get {
            if ProcessId <= 0 {
                return true
            }
            try {
                using let process = Process.GetProcessById(ProcessId)
                return !process.HasExited
            } catch (ArgumentException) {
                return false
            } catch (InvalidOperationException) {
                return false
            }
        }
    }

    prop DisplayName string {
        get {
            let name = if string.IsNullOrWhiteSpace(ApplicationName) {
                ProcessName
            } else {
                ApplicationName!!
            }
            return if string.IsNullOrWhiteSpace(name) {
                "process $ProcessId"
            } else {
                name
            }
        }
    }
}

internal shared class Discovery {
    const Protocol string = "goo.devtools/1"

    func RuntimeDirectories(projectDirectory string? = nil) IReadOnlyList[string] {
        let directories = List[string]()
        let Add = func (path string?) {
            if string.IsNullOrWhiteSpace(path) {
                return
            }
            let full = Path.GetFullPath(path)
            if !directories.Contains(full, StringComparer.Ordinal) {
                directories.Add(full)
            }
        }
        Add(Environment.GetEnvironmentVariable("GOO_DEVTOOLS_DIR"))
        Add(
            if projectDirectory == nil {
                default(string?)
            } else {
                Path.Combine(projectDirectory, ".goo", "devtools")
            }
        )
        let runtime = Environment.GetEnvironmentVariable("XDG_RUNTIME_DIR")
        if !string.IsNullOrWhiteSpace(runtime) {
            Add(Path.Combine(runtime, "goo"))
            Add(Path.Combine(runtime, "goo-devtools"))
        }
        let local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)
        if !string.IsNullOrWhiteSpace(local) {
            Add(Path.Combine(local, "Goo"))
            Add(Path.Combine(local, "Goo", "DevTools"))
        }
        return directories
    }

    func Scan(projectDirectory string? = nil, includeStale bool = false) IReadOnlyList[DiscoveryDescriptor] {
        let descriptors = List[DiscoveryDescriptor]()
        for directory in RuntimeDirectories(projectDirectory) {
            if !Directory.Exists(directory) {
                continue
            }
            var paths IEnumerable[string]
            try {
                paths = Directory.EnumerateFiles(directory, "*.json", SearchOption.TopDirectoryOnly)
            } catch (UnauthorizedAccessException) {
                continue
            } catch (IOException) {
                continue
            }
            for path in paths.OrderBy((item string) -> item, StringComparer.Ordinal) {
                if !TryRead(path, out var descriptor) {
                    continue
                }
                if !includeStale && !descriptor!!.IsProcessAlive {
                    continue
                }
                if descriptors.Any(
                    (item DiscoveryDescriptor) -> string.Equals(
                        item.DescriptorPath,
                        descriptor!!.DescriptorPath,
                        StringComparison.Ordinal
                    )
                ) {
                    continue
                }
                descriptors.Add(descriptor!!)
            }
        }
        return descriptors
            .OrderByDescending((item DiscoveryDescriptor) -> item.StartedAt ?? DateTimeOffset.MinValue)
            .ThenBy((item DiscoveryDescriptor) -> item.DisplayName, StringComparer.OrdinalIgnoreCase)
            .ToArray()
    }

    func Select(
        descriptors IReadOnlyList[DiscoveryDescriptor],
        processId int32?,
        pipe string?,
        application string?,
        window string?,
        latest bool
    ) DiscoveryDescriptor? {
        let matches = Matching(descriptors, processId, pipe, application, window)
        return if matches.Count == 0 {
            default(DiscoveryDescriptor?)
        } else {
            (
                if latest || matches.Count == 1 {
                    matches[0]
                } else {
                    default(DiscoveryDescriptor?)
                }
            )
        }
    }

    func Matching(
        descriptors IReadOnlyList[DiscoveryDescriptor],
        processId int32?,
        pipe string?,
        application string?,
        window string?
    ) IReadOnlyList[DiscoveryDescriptor] {
        var filtered = descriptors.AsEnumerable()
        if (processId != nil) {
            filtered = filtered.Where((item DiscoveryDescriptor) -> item.ProcessId == processId)
        }
        if !string.IsNullOrWhiteSpace(pipe) {
            filtered = filtered.Where(
                (item DiscoveryDescriptor) -> string.Equals(item.Pipe, pipe, StringComparison.Ordinal)
            )
        }
        if !string.IsNullOrWhiteSpace(application) {
            filtered = filtered.Where(
                (item DiscoveryDescriptor) -> item.DisplayName.Contains(
                    application,
                    StringComparison.OrdinalIgnoreCase
                )
            )
        }
        if !string.IsNullOrWhiteSpace(window) {
            filtered = filtered.Where(
                (item DiscoveryDescriptor) -> string.Equals(item.WindowId, window, StringComparison.Ordinal) ||
                    (item.WindowTitle ?? string.Empty).Contains(window, StringComparison.OrdinalIgnoreCase)
            )
        }
        let matches = filtered.ToArray()
        return matches
    }

    func DescribeNoMatch(
        allDescriptors IReadOnlyList[DiscoveryDescriptor],
        projectDirectory string?,
        processId int32?,
        pipe string?,
        application string?,
        window string?
    ) string {
        let criteria = List[string]()
        if (processId != nil) {
            criteria.Add("pid ${processId}")
        }
        if !string.IsNullOrWhiteSpace(pipe) {
            criteria.Add("pipe '$pipe'")
        }
        if !string.IsNullOrWhiteSpace(application) {
            criteria.Add("app '$application'")
        }
        if !string.IsNullOrWhiteSpace(window) {
            criteria.Add("window '$window'")
        }
        let scope_ = if criteria.Count == 0 {
            "a Goo process"
        } else {
            string.Join(", ", criteria)
        }
        var message = "No live Goo DevTools endpoint matched $scope_."
        if allDescriptors.Count != 0 {
            message += Environment.NewLine + "Live endpoints:" + Environment.NewLine
            for descriptor in allDescriptors {
                message += "  ${descriptor.DisplayName} (pid ${descriptor.ProcessId}, pipe ${descriptor.Pipe})${Environment.NewLine}"
            }
        } else {
            message += Environment.NewLine + "Checked:" + Environment.NewLine
            for directory in RuntimeDirectories(projectDirectory) {
                message += "  $directory${Environment.NewLine}"
            }
            message += "Start the app with `goo dev --watch --inspector -- <command>` or set GOO_DEVTOOLS_DIR to the runtime descriptor directory." +
                Environment.NewLine
        }
        return message.TrimEnd()
    }

    private func TryRead(path string, out descriptor DiscoveryDescriptor?) bool {
        descriptor = nil
        try {
            using let document = JsonDocument.Parse(File.ReadAllText(path))
            let root = document.RootElement
            if root.ValueKind != JsonValueKind.Object {
                return false
            }
            var protocol = Discovery.String(root, "protocol", "protocolVersion")
            if string.IsNullOrWhiteSpace(protocol) {
                return false
            }
            if protocol.All(char.IsDigit) {
                protocol = "goo.devtools/$protocol"
            }
            if !string.Equals(protocol, Protocol, StringComparison.OrdinalIgnoreCase) {
                return false
            }
            if root.TryGetProperty("version", out var version) &&
                version.ValueKind == JsonValueKind.Number &&
                (!version.TryGetInt32(out var value) || value != 1) {
                return false
            }
            let pipe = Discovery.String(root, "pipe", "pipeName", "endpoint", "socket", "address")
            if string.IsNullOrWhiteSpace(pipe) {
                return false
            }
            let processId = Integer(root, "pid", "processId")
            let processName = Discovery.String(root, "process", "processName", "name") ?? string.Empty
            let application = Discovery.String(root, "app", "application", "applicationName")
            var window = Discovery.String(root, "window", "windowTitle", "title")
            if string.IsNullOrWhiteSpace(window) && root.TryGetProperty("windows", out var windows) &&
                windows.ValueKind == JsonValueKind
                .Array {
                for candidate in windows.EnumerateArray() {
                    if candidate.ValueKind != JsonValueKind.Object {
                        continue
                    }
                    window = Discovery.String(candidate, "title", "windowTitle", "name")
                    if !string.IsNullOrWhiteSpace(window) {
                        break
                    }
                }
            }
            let transport = Discovery.String(root, "transport", "pipeTransport") ?? InferTransport(pipe)
            var startedAt DateTimeOffset? = nil
            let started = Discovery.String(root, "startedAt", "startTime", "createdUtc")
            if DateTimeOffset.TryParse(started, out var parsed) {
                startedAt = parsed
            }
            descriptor = DiscoveryDescriptor(
                Path.GetFullPath(path),
                protocol!!,
                processId,
                processName,
                pipe,
                transport,
                application,
                window,
                startedAt,
                root.Clone()
            )
            return true
        } catch (JsonException) {
            return false
        } catch (IOException) {
            return false
        } catch (UnauthorizedAccessException) {
            return false
        }
    }

    private func InferTransport(pipe string) string {
        if pipe.StartsWith("/", StringComparison.Ordinal) {
            return "unix"
        }
        if pipe.StartsWith("\\\\", StringComparison.Ordinal) {
            return "named-pipe"
        }
        return if OperatingSystem.IsWindows() {
            "named-pipe"
        } else {
            "named-pipe"
        }
    }

    private func String(root JsonElement, names ...string) string? {
        for name in names {
            if !root.TryGetProperty(name, out var value) {
                continue
            }
            if value.ValueKind == JsonValueKind.String {
                return value.GetString()
            }
            if value.ValueKind == JsonValueKind.Number {
                return value.ToString()
            }
        }
        return nil
    }

    private func Integer(root JsonElement, names ...string) int32 {
        for name in names {
            if !root.TryGetProperty(name, out var value) {
                continue
            }
            if value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number) {
                return number
            }
            if value.ValueKind == JsonValueKind.String && int32.TryParse(value.GetString(), out number) {
                return number
            }
        }
        return 0
    }
}
