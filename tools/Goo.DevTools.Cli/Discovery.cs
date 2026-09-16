using System.Diagnostics;
using System.Text.Json;

namespace Goo.DevTools.Cli;

internal sealed record DiscoveryDescriptor(
    string DescriptorPath,
    string Protocol,
    int ProcessId,
    string ProcessName,
    string Pipe,
    string Transport,
    string? ApplicationName,
    string? WindowTitle,
    DateTimeOffset? StartedAt,
    JsonElement Metadata)
{
    public string? WindowId
    {
        get
        {
            if (Metadata.TryGetProperty("windows", out var windows) && windows.ValueKind == JsonValueKind.Array)
                foreach (var window in windows.EnumerateArray())
                    if (window.ValueKind == JsonValueKind.Object
                        && window.TryGetProperty("id", out var id) && id.ValueKind == JsonValueKind.String)
                        return id.GetString();
            return null;
        }
    }

    public bool IsProcessAlive
    {
        get
        {
            if (ProcessId <= 0)
                return true;

            try
            {
                using var process = Process.GetProcessById(ProcessId);
                return !process.HasExited;
            }
            catch (ArgumentException)
            {
                return false;
            }
            catch (InvalidOperationException)
            {
                return false;
            }
        }
    }

    public string DisplayName
    {
        get
        {
            var name = string.IsNullOrWhiteSpace(ApplicationName) ? ProcessName : ApplicationName;
            return string.IsNullOrWhiteSpace(name) ? $"process {ProcessId}" : name;
        }
    }
}

internal static class Discovery
{
    public const string Protocol = "goo.devtools/1";

    public static IReadOnlyList<string> RuntimeDirectories(string? projectDirectory = null)
    {
        var directories = new List<string>();
        Add(Environment.GetEnvironmentVariable("GOO_DEVTOOLS_DIR"));
        Add(projectDirectory is null ? null : Path.Combine(projectDirectory, ".goo", "devtools"));

        var runtime = Environment.GetEnvironmentVariable("XDG_RUNTIME_DIR");
        if (!string.IsNullOrWhiteSpace(runtime))
        {
            Add(Path.Combine(runtime, "goo"));
            Add(Path.Combine(runtime, "goo-devtools"));
        }

        if (OperatingSystem.IsWindows())
        {
            var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            if (!string.IsNullOrWhiteSpace(local))
            {
                Add(Path.Combine(local, "Goo"));
                Add(Path.Combine(local, "Goo", "DevTools"));
            }
        }

        Add(Path.Combine(Path.GetTempPath(), "goo-devtools"));
        Add(Path.Combine(Path.GetTempPath(), "goo"));
        return directories;

        void Add(string? path)
        {
            if (string.IsNullOrWhiteSpace(path))
                return;

            var full = Path.GetFullPath(path);
            if (!directories.Contains(full, StringComparer.Ordinal))
                directories.Add(full);
        }
    }

    public static IReadOnlyList<DiscoveryDescriptor> Scan(string? projectDirectory = null, bool includeStale = false)
    {
        var descriptors = new List<DiscoveryDescriptor>();
        foreach (var directory in RuntimeDirectories(projectDirectory))
        {
            if (!Directory.Exists(directory))
                continue;

            IEnumerable<string> paths;
            try
            {
                paths = Directory.EnumerateFiles(directory, "*.json", SearchOption.TopDirectoryOnly);
            }
            catch (UnauthorizedAccessException)
            {
                continue;
            }
            catch (IOException)
            {
                continue;
            }

            foreach (var path in paths.OrderBy(item => item, StringComparer.Ordinal))
            {
                if (!TryRead(path, out var descriptor))
                    continue;
                if (!includeStale && !descriptor.IsProcessAlive)
                    continue;
                if (descriptors.Any(item => string.Equals(item.DescriptorPath, descriptor.DescriptorPath, StringComparison.Ordinal)))
                    continue;
                descriptors.Add(descriptor);
            }
        }

        return descriptors
            .OrderByDescending(item => item.StartedAt ?? DateTimeOffset.MinValue)
            .ThenBy(item => item.DisplayName, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    public static DiscoveryDescriptor? Select(
        IReadOnlyList<DiscoveryDescriptor> descriptors,
        int? processId,
        string? pipe,
        string? application,
        string? window,
        bool latest)
    {
        var matches = Matching(descriptors, processId, pipe, application, window);
        return matches.Count == 0 ? null : latest || matches.Count == 1 ? matches[0] : null;
    }

    public static IReadOnlyList<DiscoveryDescriptor> Matching(
        IReadOnlyList<DiscoveryDescriptor> descriptors,
        int? processId,
        string? pipe,
        string? application,
        string? window)
    {
        var filtered = descriptors.AsEnumerable();
        if (processId.HasValue)
            filtered = filtered.Where(item => item.ProcessId == processId.Value);
        if (!string.IsNullOrWhiteSpace(pipe))
            filtered = filtered.Where(item => string.Equals(item.Pipe, pipe, StringComparison.Ordinal));
        if (!string.IsNullOrWhiteSpace(application))
            filtered = filtered.Where(item => item.DisplayName.Contains(application, StringComparison.OrdinalIgnoreCase));
        if (!string.IsNullOrWhiteSpace(window))
            filtered = filtered.Where(item => string.Equals(item.WindowId, window, StringComparison.Ordinal)
                || (item.WindowTitle ?? string.Empty).Contains(window, StringComparison.OrdinalIgnoreCase));

        var matches = filtered.ToArray();
        return matches;
    }

    public static string DescribeNoMatch(
        IReadOnlyList<DiscoveryDescriptor> allDescriptors,
        string? projectDirectory,
        int? processId,
        string? pipe,
        string? application,
        string? window)
    {
        var criteria = new List<string>();
        if (processId.HasValue)
            criteria.Add($"pid {processId.Value}");
        if (!string.IsNullOrWhiteSpace(pipe))
            criteria.Add($"pipe '{pipe}'");
        if (!string.IsNullOrWhiteSpace(application))
            criteria.Add($"app '{application}'");
        if (!string.IsNullOrWhiteSpace(window))
            criteria.Add($"window '{window}'");

        var scope = criteria.Count == 0 ? "a Goo process" : string.Join(", ", criteria);
        var message = $"No live Goo DevTools endpoint matched {scope}.";
        if (allDescriptors.Count != 0)
        {
            message += Environment.NewLine + "Live endpoints:" + Environment.NewLine;
            foreach (var descriptor in allDescriptors)
                message += $"  {descriptor.DisplayName} (pid {descriptor.ProcessId}, pipe {descriptor.Pipe}){Environment.NewLine}";
        }
        else
        {
            message += Environment.NewLine + "Checked:" + Environment.NewLine;
            foreach (var directory in RuntimeDirectories(projectDirectory))
                message += $"  {directory}{Environment.NewLine}";
            message += "Start the app with `goo dev --watch -- <command>` or set GOO_DEVTOOLS_DIR to the runtime descriptor directory." + Environment.NewLine;
        }

        return message.TrimEnd();
    }

    private static bool TryRead(string path, out DiscoveryDescriptor descriptor)
    {
        descriptor = null!;
        try
        {
            using var document = JsonDocument.Parse(File.ReadAllText(path));
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
                return false;

            var protocol = String(root, "protocol", "protocolVersion");
            if (string.IsNullOrWhiteSpace(protocol))
                return false;
            if (protocol.All(char.IsDigit))
                protocol = $"goo.devtools/{protocol}";
            if (!string.Equals(protocol, Protocol, StringComparison.OrdinalIgnoreCase))
                return false;
            if (root.TryGetProperty("version", out var version)
                && version.ValueKind == JsonValueKind.Number
                && (!version.TryGetInt32(out var value) || value != 1))
                return false;

            var pipe = String(root, "pipe", "pipeName", "endpoint", "socket", "address");
            if (string.IsNullOrWhiteSpace(pipe))
                return false;

            var processId = Integer(root, "pid", "processId");
            var processName = String(root, "process", "processName", "name") ?? string.Empty;
            var application = String(root, "app", "application", "applicationName");
            var window = String(root, "window", "windowTitle", "title");
            if (string.IsNullOrWhiteSpace(window)
                && root.TryGetProperty("windows", out var windows)
                && windows.ValueKind == JsonValueKind.Array)
            {
                foreach (var candidate in windows.EnumerateArray())
                {
                    if (candidate.ValueKind != JsonValueKind.Object)
                        continue;
                    window = String(candidate, "title", "windowTitle", "name");
                    if (!string.IsNullOrWhiteSpace(window))
                        break;
                }
            }
            var transport = String(root, "transport", "pipeTransport") ?? InferTransport(pipe);
            DateTimeOffset? startedAt = null;
            var started = String(root, "startedAt", "startTime", "createdUtc");
            if (DateTimeOffset.TryParse(started, out var parsed))
                startedAt = parsed;

            descriptor = new DiscoveryDescriptor(
                Path.GetFullPath(path),
                protocol,
                processId,
                processName,
                pipe,
                transport,
                application,
                window,
                startedAt,
                root.Clone());
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
        catch (IOException)
        {
            return false;
        }
        catch (UnauthorizedAccessException)
        {
            return false;
        }
    }

    private static string InferTransport(string pipe)
    {
        if (pipe.StartsWith("/", StringComparison.Ordinal))
            return "unix";
        if (pipe.StartsWith("\\\\", StringComparison.Ordinal))
            return "named-pipe";
        return OperatingSystem.IsWindows() ? "named-pipe" : "named-pipe";
    }

    private static string? String(JsonElement root, params string[] names)
    {
        foreach (var name in names)
        {
            if (!root.TryGetProperty(name, out var value))
                continue;
            if (value.ValueKind == JsonValueKind.String)
                return value.GetString();
            if (value.ValueKind == JsonValueKind.Number)
                return value.ToString();
        }

        return null;
    }

    private static int Integer(JsonElement root, params string[] names)
    {
        foreach (var name in names)
        {
            if (!root.TryGetProperty(name, out var value))
                continue;
            if (value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number))
                return number;
            if (value.ValueKind == JsonValueKind.String && int.TryParse(value.GetString(), out number))
                return number;
        }

        return 0;
    }
}
