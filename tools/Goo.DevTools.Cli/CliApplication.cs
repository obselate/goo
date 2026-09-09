using System.ComponentModel;
using System.Diagnostics;
using System.Net.Sockets;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Goo.DevTools.Cli;

internal static class CliApplication
{
    private const string Version = "0.6.0";

    internal static DiscoveryDescriptor? SelectInspectorDescriptor(
        IReadOnlyList<DiscoveryDescriptor> descriptors,
        int processId,
        bool watch,
        string runtimeDirectory,
        IReadOnlySet<string>? existingDescriptorPaths = null,
        DateTimeOffset? launchStartedAt = null)
    {
        var directory = Path.GetFullPath(runtimeDirectory);
        var scoped = descriptors
            .Where(item => string.Equals(Path.GetDirectoryName(item.DescriptorPath), directory, StringComparison.OrdinalIgnoreCase))
            .ToArray();
        if (watch && existingDescriptorPaths is not null && launchStartedAt.HasValue)
        {
            scoped = scoped
                .Where(item => !existingDescriptorPaths.Contains(item.DescriptorPath)
                    || item.StartedAt >= launchStartedAt)
                .ToArray();
        }
        return Discovery.Select(scoped, watch ? null : processId, null, null, null, watch);
    }

    public static async Task<int> RunAsync(string[] args)
    {
        try
        {
            var commandLine = CommandLine.Parse(args);
            if (commandLine.Has("version"))
            {
                Console.WriteLine(Version);
                return 0;
            }

            return commandLine.Command switch
            {
                "help" => PrintHelp(),
                "dev" => await RunDevAsync(commandLine),
                "attach" => await RunAttachAsync(commandLine),
                "doctor" => await RunDoctorAsync(commandLine),
                "capture" => await RunCaptureAsync(commandLine),
                _ => Fail($"Unknown command '{commandLine.Command}'. Run `goo help` for usage.")
            };
        }
        catch (CliException exception)
        {
            Console.Error.WriteLine($"goo: {exception.Message}");
            return 2;
        }
        catch (OperationCanceledException)
        {
            Console.Error.WriteLine("goo: operation cancelled.");
            return 130;
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or SocketException)
        {
            Console.Error.WriteLine($"goo: {exception.Message}");
            return 1;
        }
    }

    private static async Task<int> RunDevAsync(CommandLine commandLine)
    {
        var project = ResolveProject(commandLine.Get("project"));
        var projectDirectory = project is null ? Environment.CurrentDirectory : Path.GetDirectoryName(project)!;
        var watch = !commandLine.Has("no-watch");
        if (commandLine.Has("watch"))
            watch = true;
        var launch = BuildLaunch(commandLine, project, watch);
        var runtimeDirectory = ResolveRuntimeDirectory(projectDirectory);
        Directory.CreateDirectory(runtimeDirectory);
        var launchStartedAt = DateTimeOffset.UtcNow;
        var existingDescriptorPaths = watch
            ? Discovery.Scan(projectDirectory, includeStale: true)
                .Where(item => string.Equals(Path.GetDirectoryName(item.DescriptorPath), runtimeDirectory, StringComparison.OrdinalIgnoreCase))
                .Select(item => item.DescriptorPath)
                .ToHashSet(StringComparer.OrdinalIgnoreCase)
            : new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        var startInfo = new ProcessStartInfo
        {
            FileName = launch.FileName,
            UseShellExecute = false,
            WorkingDirectory = projectDirectory,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
        };
        foreach (var argument in launch.Arguments)
            startInfo.ArgumentList.Add(argument);
        startInfo.Environment["GOO_DEVTOOLS"] = "1";
        startInfo.Environment["GOO_DEVTOOLS_DIR"] = runtimeDirectory;
        if (commandLine.Has("inspector") || commandLine.Has("focus"))
            startInfo.Environment["GOO_DEVTOOLS_AUTOSTART"] = "1";
        ApplyEnvironmentOverrides(startInfo, commandLine);

        using var process = Process.Start(startInfo) ?? throw new CliException($"Could not start '{startInfo.FileName}'.");
        Console.WriteLine($"[goo] started {startInfo.FileName} (pid {process.Id})");
        Console.WriteLine($"[goo] descriptors: {runtimeDirectory}");

        using var monitorCancellation = new CancellationTokenSource();
        var outputTask = Task.WhenAll(
            ForwardOutputAsync(process.StandardOutput, false, monitorCancellation.Token),
            ForwardOutputAsync(process.StandardError, true, monitorCancellation.Token));
        var inspectorTask = commandLine.Has("inspector") || commandLine.Has("focus")
            ? LaunchInspectorWhenReadyAsync(projectDirectory, process.Id, watch, runtimeDirectory, existingDescriptorPaths, launchStartedAt, commandLine.Has("focus"), ParseWait(commandLine.Get("wait")), monitorCancellation.Token)
            : Task.CompletedTask;

        await process.WaitForExitAsync();
        monitorCancellation.Cancel();
        try
        {
            await Task.WhenAll(outputTask, inspectorTask);
        }
        catch (OperationCanceledException)
        {
        }

        Console.WriteLine($"[goo] process exited with code {process.ExitCode}");
        return process.ExitCode;
    }

    private static async Task<int> RunAttachAsync(CommandLine commandLine)
    {
        var project = ResolveProject(commandLine.Get("project"));
        var projectDirectory = project is null ? Environment.CurrentDirectory : Path.GetDirectoryName(project)!;
        var processId = ParseOptionalInt(commandLine.Get("pid"), "pid");
        var descriptors = Discovery.Scan(projectDirectory);
        var descriptor = Discovery.Select(
            descriptors,
            processId,
            commandLine.Get("pipe"),
            commandLine.Get("app"),
            commandLine.Get("window"),
            commandLine.Has("latest"));
        if (descriptor is null)
            descriptor = await WaitForDescriptorAsync(projectDirectory, processId, commandLine, ParseWait(commandLine.Get("wait")));

        Console.Error.WriteLine($"[goo] attaching to {descriptor.DisplayName} (pid {descriptor.ProcessId}, {descriptor.Transport}:{descriptor.Pipe})");
        if (commandLine.Has("inspector") || commandLine.Has("focus"))
            LaunchInspector(descriptor, commandLine.Has("focus"), projectDirectory);

        using var cancellation = new CancellationTokenSource();
        await using var connection = await ConnectAsync(descriptor, cancellation.Token);
        var handshake = await connection.HandshakeAsync(cancellation.Token);
        ValidateHandshake(handshake, descriptor);
        WriteProtocolLine(handshake!, commandLine.Has("json"));

        if (commandLine.Has("once"))
        {
            var request = await connection.RequestAsync(commandLine.Get("command") ?? "snapshot", ParsePayload(commandLine.Get("payload")), cancellation.Token);
            if (request is not null)
                WriteProtocolLine(request.ToJsonString(), commandLine.Has("json"));
            return request is null ? 1 : 0;
        }

        await RunInteractiveAsync(connection, commandLine.Has("json"), cancellation.Token);
        return 0;
    }

    private static async Task<int> RunCaptureAsync(CommandLine commandLine)
    {
        var project = ResolveProject(commandLine.Get("project"));
        var projectDirectory = project is null ? Environment.CurrentDirectory : Path.GetDirectoryName(project)!;
        var processId = ParseOptionalInt(commandLine.Get("pid"), "pid");
        var descriptors = Discovery.Scan(projectDirectory);
        var descriptor = Discovery.Select(
            descriptors,
            processId,
            commandLine.Get("pipe"),
            commandLine.Get("app"),
            commandLine.Get("window"),
            commandLine.Has("latest"));
        if (descriptor is null)
            descriptor = await WaitForDescriptorAsync(projectDirectory, processId, commandLine, ParseWait(commandLine.Get("wait")));

        using var captureTimeout = new CancellationTokenSource(ParseWait(commandLine.Get("wait")));
        await using var connection = await ConnectAsync(descriptor, captureTimeout.Token);
        string? handshake;
        try
        {
            handshake = await connection.HandshakeAsync(captureTimeout.Token);
        }
        catch (OperationCanceledException)
        {
            throw new CliException("Timed out waiting for the Goo endpoint handshake.");
        }
        if (handshake is null)
            throw new CliException("The Goo endpoint closed before completing its protocol handshake.");
        ValidateHandshake(handshake, descriptor);
        var payload = new JsonObject
        {
            ["window"] = commandLine.Get("window"),
            ["format"] = commandLine.Get("format") ?? "png"
        };
        var response = await RequestCaptureAsync(connection, payload, captureTimeout.Token);
        return WriteCapture(response, commandLine.Get("output"));
    }

    private static async Task<JsonObject> RequestCaptureAsync(
        ProtocolConnection connection,
        JsonObject payload,
        CancellationToken cancellationToken)
    {
        while (true)
        {
            JsonObject? response;
            try
            {
                response = await connection.RequestAsync("capture", payload, cancellationToken);
            }
            catch (OperationCanceledException)
            {
                throw new CliException("The capture did not complete before the Goo endpoint wait expired.");
            }

            if (response is null)
                throw new CliException("The Goo endpoint closed without returning a capture.");
            if (!IsCapturePending(response))
                return response;

            try
            {
                await Task.Delay(TimeSpan.FromMilliseconds(50), cancellationToken);
            }
            catch (OperationCanceledException)
            {
                throw new CliException("The capture did not complete before the Goo endpoint wait expired.");
            }
        }
    }

    private static bool IsCapturePending(JsonObject response)
    {
        var payload = CapturePayload(response);
        return payload["pending"] is JsonValue value
            && value.TryGetValue<bool>(out var pending)
            && pending;
    }

    private static async Task<int> RunDoctorAsync(CommandLine commandLine)
    {
        var project = ResolveProject(commandLine.Get("project"));
        var projectDirectory = project is null ? Environment.CurrentDirectory : Path.GetDirectoryName(project)!;
        var descriptors = Discovery.Scan(projectDirectory, includeStale: true);
        var checks = new List<DoctorCheck>();
        var dotnet = await CheckDotnetAsync();
        checks.Add(dotnet);
        checks.Add(new DoctorCheck(
            "project",
            project is null ? "No Goo project was found in the current directory." : project,
            project is not null));
        var runtimeDirectories = Discovery.RuntimeDirectories(projectDirectory);
        var existingDirectories = runtimeDirectories.Where(Directory.Exists).ToArray();
        checks.Add(new DoctorCheck(
            "runtime-directory",
            existingDirectories.Length == 0 ? runtimeDirectories[0] : string.Join(Path.PathSeparator, existingDirectories),
            existingDirectories.Length != 0));
        checks.Add(new DoctorCheck(
            "endpoint",
            descriptors.Count == 0 ? "No live or stale descriptors found." : $"{descriptors.Count} descriptor(s) found.",
            descriptors.Any(item => item.IsProcessAlive)));
        var inspector = InspectorLauncher.Find(projectDirectory);
        checks.Add(new DoctorCheck(
            "inspector",
            inspector ?? "Not installed. Set GOO_DEVTOOLS_INSPECTOR to the standalone DevTools executable or DLL.",
            inspector is not null));

        if (commandLine.Has("json"))
        {
            Console.WriteLine(JsonSerializer.Serialize(new { checks, descriptors }, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }));
        }
        else
        {
            foreach (var check in checks)
                Console.WriteLine($"{(check.Ok ? "ok" : "warn"),-4} {check.Name}: {check.Detail}");
            foreach (var descriptor in descriptors)
                Console.WriteLine($"  {descriptor.DisplayName} pid={descriptor.ProcessId} alive={descriptor.IsProcessAlive} pipe={descriptor.Pipe}");
        }

        return checks.Any(check => !check.Ok && (check.Name == "dotnet" || check.Name == "project")) ? 1 : 0;
    }

    private static async Task<DoctorCheck> CheckDotnetAsync()
    {
        try
        {
            var startInfo = new ProcessStartInfo
            {
                FileName = "dotnet",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
            };
            startInfo.ArgumentList.Add("--version");
            using var process = Process.Start(startInfo);
            if (process is null)
                return new DoctorCheck("dotnet", "Could not start dotnet.", false);
            var output = await process.StandardOutput.ReadToEndAsync();
            await process.WaitForExitAsync();
            return new DoctorCheck("dotnet", output.Trim(), process.ExitCode == 0);
        }
        catch (Exception exception) when (exception is Win32Exception or IOException)
        {
            return new DoctorCheck("dotnet", exception.Message, false);
        }
    }

    private static async Task ForwardOutputAsync(StreamReader reader, bool error, CancellationToken cancellationToken)
    {
        try
        {
            while (true)
            {
                var line = await reader.ReadLineAsync(cancellationToken);
                if (line is null)
                    return;
                if (HotReloadReporter.IsRestartRequired(line))
                    Console.Error.WriteLine($"[goo] hot reload requires restart: {line}");
                if (error)
                    Console.Error.WriteLine(line);
                else
                    Console.WriteLine(line);
            }
        }
        catch (OperationCanceledException)
        {
        }
    }

    private static async Task LaunchInspectorWhenReadyAsync(
        string projectDirectory,
        int processId,
        bool watch,
        string runtimeDirectory,
        IReadOnlySet<string> existingDescriptorPaths,
        DateTimeOffset launchStartedAt,
        bool focus,
        TimeSpan timeout,
        CancellationToken cancellationToken)
    {
        try
        {
            var descriptor = await WaitForDescriptorAsync(
                projectDirectory,
                watch ? null : processId,
                null,
                timeout,
                cancellationToken,
                runtimeDirectory,
                watch,
                existingDescriptorPaths,
                launchStartedAt);
            LaunchInspector(descriptor, focus, projectDirectory);
        }
        catch (CliException exception)
        {
            Console.Error.WriteLine($"[goo] {exception.Message}");
        }
        catch (OperationCanceledException)
        {
        }
    }

    private static async Task<DiscoveryDescriptor> WaitForDescriptorAsync(
        string projectDirectory,
        int? processId,
        CommandLine? commandLine,
        TimeSpan timeout,
        CancellationToken cancellationToken = default,
        string? runtimeDirectory = null,
        bool latest = false,
        IReadOnlySet<string>? existingDescriptorPaths = null,
        DateTimeOffset? launchStartedAt = null)
    {
        var started = Stopwatch.GetTimestamp();
        while (Stopwatch.GetElapsedTime(started) < timeout)
        {
            var descriptors = Discovery.Scan(projectDirectory)
                .Where(item => runtimeDirectory is null
                    || string.Equals(Path.GetDirectoryName(item.DescriptorPath), Path.GetFullPath(runtimeDirectory), StringComparison.OrdinalIgnoreCase))
                .ToArray();
            var latestSelection = latest || commandLine?.Has("latest") == true;
            var matches = Discovery.Matching(
                descriptors,
                processId,
                commandLine?.Get("pipe"),
                commandLine?.Get("app"),
                commandLine?.Get("window"));
            if (matches.Count > 1 && !latestSelection)
                throw new CliException("More than one live Goo endpoint matches the selection. Pass --window, --pipe, or --latest.");
            var descriptor = commandLine is null && runtimeDirectory is not null
                ? SelectInspectorDescriptor(descriptors, processId ?? 0, latestSelection, runtimeDirectory, existingDescriptorPaths, launchStartedAt)
                : Discovery.Select(
                    descriptors,
                    processId,
                    commandLine?.Get("pipe"),
                    commandLine?.Get("app"),
                    commandLine?.Get("window"),
                    latestSelection);
            if (descriptor is not null)
                return descriptor;
            await Task.Delay(TimeSpan.FromMilliseconds(100), cancellationToken);
        }

        var all = Discovery.Scan(projectDirectory, includeStale: true);
        throw new CliException(Discovery.DescribeNoMatch(
            all,
            projectDirectory,
            processId,
            commandLine?.Get("pipe"),
            commandLine?.Get("app"),
            commandLine?.Get("window")));
    }

    private static async Task<ProtocolConnection> ConnectAsync(DiscoveryDescriptor descriptor, CancellationToken cancellationToken)
    {
        try
        {
            return await ProtocolConnection.ConnectAsync(descriptor, TimeSpan.FromSeconds(5), cancellationToken);
        }
        catch (OperationCanceledException)
        {
            throw new CliException($"Timed out connecting to {descriptor.DisplayName} at {descriptor.Pipe}.");
        }
        catch (SocketException exception)
        {
            throw new CliException($"Could not connect to {descriptor.DisplayName} at {descriptor.Pipe}: {exception.Message}");
        }
        catch (IOException exception)
        {
            throw new CliException($"Could not connect to {descriptor.DisplayName} at {descriptor.Pipe}: {exception.Message}");
        }
    }

    private static void ValidateHandshake(string? handshake, DiscoveryDescriptor descriptor)
    {
        if (handshake is null)
            throw new CliException($"The Goo endpoint at {descriptor.Pipe} closed before completing its protocol handshake.");
        if (!ProtocolConnection.TryParse(handshake, out var message)
            || !string.Equals(StringValue(message["protocol"]), Discovery.Protocol, StringComparison.OrdinalIgnoreCase))
            throw new CliException($"The Goo endpoint at {descriptor.Pipe} did not confirm protocol {Discovery.Protocol}.");
    }

    private static async Task RunInteractiveAsync(ProtocolConnection connection, bool json, CancellationToken cancellationToken)
    {
        using var stop = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        var remote = ReadRemoteAsync(connection, json, stop.Token);
        var local = WriteLocalAsync(connection, stop.Token);
        await remote;
        stop.Cancel();
        try
        {
            await local;
        }
        catch (OperationCanceledException)
        {
        }
    }

    private static async Task ReadRemoteAsync(ProtocolConnection connection, bool json, CancellationToken cancellationToken)
    {
        try
        {
            while (true)
            {
                var line = await connection.ReadLineAsync(cancellationToken);
                if (line is null)
                    return;
                WriteProtocolLine(line, json);
            }
        }
        catch (OperationCanceledException)
        {
        }
    }

    private static async Task WriteLocalAsync(ProtocolConnection connection, CancellationToken cancellationToken)
    {
        try
        {
            while (true)
            {
                var line = await Console.In.ReadLineAsync(cancellationToken);
                if (line is null)
                    return;
                if (line.TrimStart().StartsWith('{'))
                {
                    await connection.SendRawAsync(line, cancellationToken);
                    continue;
                }

                var command = new JsonObject
                {
                    ["type"] = "command",
                    ["command"] = line
                };
                await connection.SendAsync(command, cancellationToken);
            }
        }
        catch (OperationCanceledException)
        {
        }
    }

    private static int WriteCapture(JsonObject response, string? outputPath)
    {
        var payload = CapturePayload(response);
        var responseType = StringValue(payload["type"]) ?? StringValue(response["type"]);
        var ok = BoolValue(response["ok"]);
        if (string.Equals(responseType, "error", StringComparison.OrdinalIgnoreCase) || ok == false)
        {
            var error = StringValue(payload["message"])
                ?? StringValue(payload["error"])
                ?? StringValue(response["message"])
                ?? StringValue(response["error"]);
            if (error is null && payload["error"] is JsonObject errorObject)
                error = StringValue(errorObject["message"]) ?? StringValue(errorObject["code"]);
            error ??= "The endpoint rejected the capture request.";
            throw new CliException(error);
        }

        var format = StringValue(payload["format"]);
        var rgbaData = StringValue(payload["rgbaBase64"]);
        if (rgbaData is not null || IsRgbaFormat(format))
        {
            var encoded = rgbaData
                ?? StringValue(payload["data"])
                ?? StringValue(payload["contentBase64"])
                ?? throw new CliException("The endpoint returned an RGBA capture without pixel data.");
            var rgba = DecodeCaptureData(encoded);
            var width = IntegerValue(payload["width"])
                ?? throw new CliException("The endpoint returned an RGBA capture without a width.");
            var height = IntegerValue(payload["height"])
                ?? throw new CliException("The endpoint returned an RGBA capture without a height.");
            var stride = IntegerValue(payload["stride"]) ?? checked(width * 4);
            return WriteCaptureBytes(PngEncoder.Encode(rgba, width, height, stride), outputPath);
        }

        var data = StringValue(payload["contentBase64"])
            ?? StringValue(payload["base64"])
            ?? StringValue(payload["data"]);
        if (data is null)
        {
            var remotePath = StringValue(payload["path"]);
            if (remotePath is not null && outputPath is not null)
            {
                return WriteCaptureBytes(File.ReadAllBytes(remotePath), outputPath);
            }

            Console.WriteLine(response.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
            return 0;
        }

        return WriteCaptureBytes(DecodeCaptureData(data), outputPath);
    }

    private static byte[] DecodeCaptureData(string data)
    {
        try
        {
            return Convert.FromBase64String(data);
        }
        catch (FormatException exception)
        {
            throw new CliException($"The endpoint returned invalid capture data: {exception.Message}");
        }
    }

    private static int WriteCaptureBytes(byte[] bytes, string? outputPath)
    {
        if (string.IsNullOrWhiteSpace(outputPath) || outputPath == "-")
        {
            Console.OpenStandardOutput().Write(bytes);
            return 0;
        }

        if (IsPngPath(outputPath) && !PngEncoder.IsPng(bytes))
            throw new CliException("The endpoint returned bytes that are not a PNG; refusing to write raw data to a .png path.");

        var fullPath = Path.GetFullPath(outputPath);
        var parent = Path.GetDirectoryName(fullPath);
        if (!string.IsNullOrWhiteSpace(parent))
            Directory.CreateDirectory(parent);
        File.WriteAllBytes(fullPath, bytes);
        Console.WriteLine(fullPath);
        return 0;
    }

    private static JsonObject CapturePayload(JsonObject response)
    {
        return response["payload"] as JsonObject ?? response;
    }

    private static bool IsRgbaFormat(string? format)
    {
        return format is not null && format.StartsWith("rgba8", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsPngPath(string path)
    {
        return string.Equals(Path.GetExtension(path), ".png", StringComparison.OrdinalIgnoreCase);
    }

    private static string? StringValue(JsonNode? node)
    {
        return node is JsonValue value && value.TryGetValue<string>(out var text) ? text : null;
    }

    private static bool? BoolValue(JsonNode? node)
    {
        return node is JsonValue value && value.TryGetValue<bool>(out var result) ? result : null;
    }

    private static int? IntegerValue(JsonNode? node)
    {
        if (node is not JsonValue value)
            return null;
        if (value.TryGetValue<int>(out var result))
            return result;
        return value.TryGetValue<long>(out var longResult) && longResult is >= int.MinValue and <= int.MaxValue
            ? (int)longResult
            : null;
    }

    private static void LaunchInspector(DiscoveryDescriptor descriptor, bool focus, string projectDirectory)
    {
        var executable = InspectorLauncher.Find(projectDirectory);
        if (executable is null)
        {
            throw new CliException("The standalone Goo DevTools app was not found. Build it or set GOO_DEVTOOLS_INSPECTOR to its executable or DLL.");
        }

        try
        {
            var process = InspectorLauncher.Launch(executable, descriptor, focus);
            if (process is null)
                throw new InvalidOperationException("Process.Start returned no process.");
            process.Dispose();
            Console.Error.WriteLine($"[goo] launched inspector {executable}");
        }
        catch (Exception exception) when (exception is Win32Exception or InvalidOperationException or IOException)
        {
            throw new CliException($"Could not launch inspector '{executable}': {exception.Message}");
        }
    }

    private static LaunchSpec BuildLaunch(CommandLine commandLine, string? project, bool watch)
    {
        if (commandLine.Trailing.Count != 0)
        {
            var fileName = commandLine.Trailing[0];
            var arguments = commandLine.Trailing.Skip(1).ToList();
            if (watch && Path.GetFileNameWithoutExtension(fileName).Equals("dotnet", StringComparison.OrdinalIgnoreCase)
                && arguments.Count != 0 && arguments[0].Equals("run", StringComparison.OrdinalIgnoreCase))
                arguments.Insert(0, "watch");
            return new LaunchSpec(fileName, arguments);
        }

        if (project is null)
            throw new CliException("No Goo project was found. Pass --project path/to/App.gsproj or add a command after --.");

        var projectArguments = new List<string>();
        if (watch)
            projectArguments.Add("watch");
        projectArguments.Add("run");
        projectArguments.Add("--project");
        projectArguments.Add(project);
        var configuration = commandLine.Get("configuration");
        if (!string.IsNullOrWhiteSpace(configuration))
        {
            projectArguments.Add("--configuration");
            projectArguments.Add(configuration);
        }

        return new LaunchSpec("dotnet", projectArguments);
    }

    private static string? ResolveProject(string? value)
    {
        if (!string.IsNullOrWhiteSpace(value))
        {
            var path = Path.GetFullPath(value);
            if (Directory.Exists(path))
                return FindProjectInDirectory(path);
            if (!File.Exists(path))
                throw new CliException($"Project path does not exist: {path}");
            return path;
        }

        return FindProjectInDirectory(Environment.CurrentDirectory, false);
    }

    private static string? FindProjectInDirectory(string directory, bool failOnMultiple = true)
    {
        var projects = Directory.EnumerateFiles(directory, "*.*proj", SearchOption.TopDirectoryOnly)
            .Where(path => path.EndsWith(".gsproj", StringComparison.OrdinalIgnoreCase)
                || path.EndsWith(".csproj", StringComparison.OrdinalIgnoreCase))
            .OrderBy(path => path.EndsWith(".gsproj", StringComparison.OrdinalIgnoreCase) ? 0 : 1)
            .ThenBy(path => path, StringComparer.OrdinalIgnoreCase)
            .ToArray();
        if (projects.Length > 1 && failOnMultiple)
            throw new CliException($"More than one project exists in {directory}. Pass --project explicitly.");
        return projects.FirstOrDefault();
    }

    private static string ResolveRuntimeDirectory(string projectDirectory)
    {
        var configured = Environment.GetEnvironmentVariable("GOO_DEVTOOLS_DIR");
        if (!string.IsNullOrWhiteSpace(configured))
            return Path.GetFullPath(configured);
        return Path.Combine(projectDirectory, ".goo", "devtools");
    }

    private static void ApplyEnvironmentOverrides(ProcessStartInfo startInfo, CommandLine commandLine)
    {
        var value = commandLine.Get("env");
        if (string.IsNullOrWhiteSpace(value))
            return;
        var separator = value.IndexOf('=');
        if (separator <= 0)
            throw new CliException("--env expects NAME=VALUE.");
        startInfo.Environment[value[..separator]] = value[(separator + 1)..];
    }

    private static JsonObject? ParsePayload(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return null;
        try
        {
            return JsonNode.Parse(value) as JsonObject ?? throw new CliException("--payload must be a JSON object.");
        }
        catch (JsonException exception)
        {
            throw new CliException($"Invalid --payload JSON: {exception.Message}");
        }
    }

    private static int? ParseOptionalInt(string? value, string name)
    {
        if (string.IsNullOrWhiteSpace(value))
            return null;
        if (int.TryParse(value, out var parsed) && parsed > 0)
            return parsed;
        throw new CliException($"--{name} must be a positive integer.");
    }

    private static TimeSpan ParseWait(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return TimeSpan.FromSeconds(15);
        if (double.TryParse(value, out var seconds) && seconds > 0)
            return TimeSpan.FromSeconds(Math.Min(seconds, 300));
        throw new CliException("--wait must be a positive number of seconds.");
    }

    private static void WriteProtocolLine(string line, bool json)
    {
        Console.WriteLine(ProtocolConnection.FormatLine(line, json));
    }

    private static int PrintHelp()
    {
        Console.WriteLine("Goo DevTools CLI 0.6.0");
        Console.WriteLine();
        Console.WriteLine("Usage:");
        Console.WriteLine("  goo dev [options] -- <command> [args]");
        Console.WriteLine("  goo attach [options]");
        Console.WriteLine("  goo doctor [--json]");
        Console.WriteLine("  goo capture [options]");
        Console.WriteLine();
        Console.WriteLine("Commands:");
        Console.WriteLine("  dev       Start a Goo project with diagnostics enabled and dotnet watch by default.");
        Console.WriteLine("  attach    Attach to a live Goo endpoint and stream protocol events.");
        Console.WriteLine("  doctor    Check the SDK, project, endpoint directory, and inspector installation.");
        Console.WriteLine("  capture   Request a screenshot from an attached endpoint.");
        Console.WriteLine();
        Console.WriteLine("Common options:");
        Console.WriteLine("  --project PATH       Project file or directory.");
        Console.WriteLine("  --pid PID            Select one process ID.");
        Console.WriteLine("  --pipe NAME          Select one pipe or socket endpoint.");
        Console.WriteLine("  --app NAME           Select by application name.");
        Console.WriteLine("  --window NAME        Select by window title.");
        Console.WriteLine("  --latest             Select the newest endpoint.");
        Console.WriteLine("  --wait SECONDS       Wait for a descriptor, up to 300 seconds.");
        Console.WriteLine("  --inspector          Launch the standalone inspector when ready.");
        Console.WriteLine("  --focus              Launch or focus the standalone inspector.");
        Console.WriteLine("  --json               Keep protocol output as JSON lines.");
        Console.WriteLine();
        Console.WriteLine("Environment:");
        Console.WriteLine("  GOO_DEVTOOLS_DIR         Runtime descriptor directory override.");
        Console.WriteLine("  GOO_DEVTOOLS_INSPECTOR   Standalone inspector executable or DLL.");
        return 0;
    }

    private static int Fail(string message)
    {
        Console.Error.WriteLine($"goo: {message}");
        return 2;
    }

    private sealed record LaunchSpec(string FileName, IReadOnlyList<string> Arguments);

    private sealed record DoctorCheck(string Name, string Detail, bool Ok);
}

internal static class HotReloadReporter
{
    private static readonly string[] RestartPhrases =
    [
        "requires restart",
        "restart required",
        "restart is required",
        "cannot be applied",
        "could not apply",
        "hot reload was not applied",
        "rude edit"
    ];

    public static bool IsRestartRequired(string line)
    {
        return RestartPhrases.Any(phrase => line.Contains(phrase, StringComparison.OrdinalIgnoreCase));
    }
}
