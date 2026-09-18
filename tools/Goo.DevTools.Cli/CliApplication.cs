using System.ComponentModel;
using System.Diagnostics;
using System.Net.Sockets;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Goo.DevTools.Cli;

internal static class CliApplication
{
    private const string Version = "0.6.2";

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
            if (commandLine.Has("help"))
                return PrintHelp();
            if (commandLine.Has("version"))
            {
                if (commandLine.Has("json"))
                {
                    Console.WriteLine(JsonSerializer.Serialize(new
                    {
                        version = Version,
                        features = new[] { "list", "input", "dev.input", "errors.structured", "process-tree-cleanup", "attach.require-capabilities" }
                    }));
                }
                else
                {
                    Console.WriteLine(Version);
                }
                return 0;
            }

            return commandLine.Command switch
            {
                "help" => PrintHelp(),
                "dev" => await RunDevAsync(commandLine),
                "attach" => await RunAttachAsync(commandLine),
                "doctor" => await RunDoctorAsync(commandLine),
                "list" => RunList(commandLine),
                "capture" => await RunCaptureAsync(commandLine),
                "input" => await RunInputAsync(commandLine),
                _ => throw new CliException($"Unknown command '{commandLine.Command}'. Run `goo help` for usage.")
            };
        }
        catch (CliException exception)
        {
            WriteError(args, exception.Message, exception.Code, exception.Phase, exception.MayHaveApplied, exception.RuntimeHello);
            return 2;
        }
        catch (OperationCanceledException)
        {
            WriteError(args, "Operation cancelled.", "cancelled", "operation", false);
            return 130;
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or SocketException or Win32Exception)
        {
            WriteError(args, exception.Message, "io-error", "operation", false);
            return 1;
        }
    }

    private static int RunList(CommandLine commandLine)
    {
        var project = ResolveProject(commandLine.Get("project"));
        var directory = ResolveProjectDirectory(commandLine.Get("project"), project);
        var targets = Discovery.Matching(Discovery.Scan(directory), ParseOptionalInt(commandLine.Get("pid"), "pid"),
            commandLine.Get("pipe"), commandLine.Get("app"), commandLine.Get("window"))
            .Select(item => new { pid = item.ProcessId, process = item.DisplayName, window = item.WindowId,
                title = item.WindowTitle, protocol = item.Protocol, transport = item.Transport, pipe = item.Pipe }).ToArray();
        if (commandLine.Has("json"))
            Console.WriteLine(JsonSerializer.Serialize(new { targets }));
        else
            foreach (var target in targets)
                Console.WriteLine($"{target.process} pid={target.pid} window={target.window} title={target.title}");
        return 0;
    }

    private static async Task<int> RunDevAsync(CommandLine commandLine)
    {
        var inspectorWait = ParseWait(commandLine.Get("wait"));
        if (commandLine.Has("watch") && commandLine.Has("no-watch"))
            throw new CliException("Use --watch or --no-watch, not both.");
        var project = ResolveProject(commandLine.Get("project"));
        var projectDirectory = ResolveProjectDirectory(commandLine.Get("project"), project);
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
        if (commandLine.Has("input"))
            startInfo.Environment["GOO_DEVTOOLS_INPUT"] = "1";
        if (commandLine.Has("inspector") || commandLine.Has("focus"))
            startInfo.Environment["GOO_DEVTOOLS_AUTOSTART"] = "1";
        ApplyEnvironmentOverrides(startInfo, commandLine);

        using var shutdown = new CancellationTokenSource();
        using var terminateRegistration = RegisterShutdownSignal(PosixSignal.SIGTERM, shutdown);
        using var interruptRegistration = RegisterShutdownSignal(PosixSignal.SIGINT, shutdown);
        ConsoleCancelEventHandler cancelHandler = (_, eventArgs) =>
        {
            eventArgs.Cancel = true;
            shutdown.Cancel();
        };
        Console.CancelKeyPress += cancelHandler;
        Process? process = null;
        try
        {
            process = Process.Start(startInfo) ?? throw new CliException($"Could not start '{startInfo.FileName}'.", "launch-failed", "launch");
            Console.WriteLine($"[goo] started {startInfo.FileName} (pid {process.Id})");
            Console.WriteLine($"[goo] descriptors: {runtimeDirectory}");

            using var monitorCancellation = new CancellationTokenSource();
            var outputTask = Task.WhenAll(
                ForwardOutputAsync(process.StandardOutput, false, monitorCancellation.Token),
                ForwardOutputAsync(process.StandardError, true, monitorCancellation.Token));
            var inspectorTask = commandLine.Has("inspector") || commandLine.Has("focus")
                ? LaunchInspectorWhenReadyAsync(projectDirectory, process.Id, watch, runtimeDirectory, existingDescriptorPaths, launchStartedAt, commandLine.Has("focus"), inspectorWait, monitorCancellation.Token)
                : Task.CompletedTask;

            var cancelled = false;
            try
            {
                await process.WaitForExitAsync(shutdown.Token);
            }
            catch (OperationCanceledException) when (shutdown.IsCancellationRequested)
            {
                cancelled = true;
                await StopOwnedProcessTreeAsync(process);
            }
            monitorCancellation.Cancel();
            try
            {
                await Task.WhenAll(outputTask, inspectorTask);
            }
            catch (OperationCanceledException)
            {
            }

            if (cancelled)
            {
                Console.Error.WriteLine("[goo] stopped owned process tree after cancellation");
                return 130;
            }
            Console.WriteLine($"[goo] process exited with code {process.ExitCode}");
            return process.ExitCode;
        }
        finally
        {
            Console.CancelKeyPress -= cancelHandler;
            if (process is not null)
            {
                if (!process.HasExited)
                    await StopOwnedProcessTreeAsync(process);
                process.Dispose();
            }
        }
    }

    private static async Task<int> RunAttachAsync(CommandLine commandLine)
    {
        if (!commandLine.Has("once") && (commandLine.Has("require-capabilities") || commandLine.Has("require-override-property")))
            throw new CliException("--require-capabilities and --require-override-property require --once.");
        if (commandLine.Has("require-capabilities") && string.IsNullOrWhiteSpace(commandLine.Get("require-capabilities")))
            throw new CliException("--require-capabilities needs a comma-separated list of capability names.");
        if (commandLine.Has("require-override-property") && string.IsNullOrWhiteSpace(commandLine.Get("require-override-property")))
            throw new CliException("--require-override-property needs a property name.");
        var project = ResolveProject(commandLine.Get("project"));
        var projectDirectory = ResolveProjectDirectory(commandLine.Get("project"), project);
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
        if (commandLine.Has("once"))
            cancellation.CancelAfter(ParseWait(commandLine.Get("wait")));
        await using var connection = await ConnectAsync(descriptor, cancellation.Token);
        string? handshake;
        try
        {
            handshake = await connection.HandshakeAsync(cancellation.Token);
        }
        catch (OperationCanceledException)
        {
            throw new CliException("Timed out waiting for the Goo endpoint handshake.", "timeout", "handshake");
        }
        ValidateHandshake(handshake, descriptor);
        ValidateRequestRequirements(handshake!, commandLine.Get("require-capabilities"), commandLine.Get("require-override-property"));
        WriteProtocolLine(handshake!, commandLine.Has("json"));

        if (commandLine.Has("once"))
        {
            var requestCommand = commandLine.Get("command") ?? "snapshot";
            var mayHaveApplied = requestCommand is not ("snapshot" or "capture");
            JsonObject? request;
            try
            {
                request = await connection.RequestAsync(requestCommand, ParsePayload(commandLine.Get("payload")), cancellation.Token);
            }
            catch (Exception exception) when (exception is OperationCanceledException or IOException or SocketException or JsonException)
            {
                var consequence = mayHaveApplied ? " It may already have applied. Inspect state before another action." : "";
                throw new CliException($"The endpoint did not acknowledge the {requestCommand} request.{consequence}", "request-unconfirmed", requestCommand, mayHaveApplied, handshake);
            }
            if (request is null)
            {
                var consequence = mayHaveApplied ? " It may already have applied. Inspect state before another action." : "";
                throw new CliException($"The endpoint closed without acknowledging the {requestCommand} request.{consequence}", "request-unconfirmed", requestCommand, mayHaveApplied, handshake);
            }
            if (IsError(request))
                DecorateError(request, requestCommand, mayHaveApplied, handshake);
            else if (BoolValue(request["ok"]) != true)
            {
                var consequence = mayHaveApplied ? " It may already have applied. Inspect state before another action." : "";
                throw new CliException($"The endpoint returned an invalid acknowledgement for {requestCommand}.{consequence}", "request-unconfirmed", requestCommand, mayHaveApplied, handshake);
            }
            WriteProtocolLine(request.ToJsonString(), commandLine.Has("json"));
            return BoolValue(request["ok"]) == false
                || StringValue(request["type"]) == "error" || request["error"] is not null ? 1 : 0;
        }

        await RunInteractiveAsync(connection, commandLine.Has("json"), ParseWait(commandLine.Get("wait")), cancellation.Token);
        return 0;
    }

    private static void ValidateRequestRequirements(string handshake, string? requiredCapabilities, string? requiredProperty)
    {
        if (string.IsNullOrWhiteSpace(requiredCapabilities) && string.IsNullOrWhiteSpace(requiredProperty))
            return;
        using var hello = JsonDocument.Parse(handshake);
        var root = hello.RootElement;
        if (!root.TryGetProperty("capabilities", out var capabilities) || capabilities.ValueKind != JsonValueKind.Array
            || capabilities.EnumerateArray().Any(value => value.ValueKind != JsonValueKind.String))
            throw new CliException("The endpoint did not provide a valid capability list. No request was sent.", "unsupported-capability", "handshake", false, handshake);
        var available = capabilities.EnumerateArray().Select(value => value.GetString()!).ToHashSet(StringComparer.Ordinal);
        if (!string.IsNullOrWhiteSpace(requiredCapabilities))
        {
            var required = requiredCapabilities.Split(',', StringSplitOptions.TrimEntries);
            if (required.Any(string.IsNullOrEmpty))
                throw new CliException("--require-capabilities needs a comma-separated list of capability names.");
            var missing = required.Where(capability => !available.Contains(capability)).Distinct(StringComparer.Ordinal).ToArray();
            if (missing.Length != 0)
                throw new CliException($"The endpoint does not advertise required capability: {string.Join(", ", missing)}. No request was sent.", "unsupported-capability", "handshake", false, handshake);
        }
        if (string.IsNullOrWhiteSpace(requiredProperty))
            return;
        if (!available.Contains("runtime-overrides.describe"))
            throw new CliException("The endpoint does not advertise required capability: runtime-overrides.describe. No request was sent.", "unsupported-capability", "handshake", false, handshake);
        if (!root.TryGetProperty("runtimeOverrideProperties", out var properties) || properties.ValueKind != JsonValueKind.Array
            || properties.EnumerateArray().Any(value => value.ValueKind != JsonValueKind.String))
            throw new CliException("The endpoint did not provide a valid runtime override property list. No request was sent.", "unsupported-property", "handshake", false, handshake);
        if (!properties.EnumerateArray().Any(value => string.Equals(value.GetString(), requiredProperty, StringComparison.OrdinalIgnoreCase)))
            throw new CliException($"The endpoint does not advertise runtime override property '{requiredProperty}'. No request was sent.", "unsupported-property", "handshake", false, handshake);
    }

    private static async Task<int> RunInputAsync(CommandLine commandLine)
    {
        if (commandLine.Positionals.Count != 1)
            throw new CliException("Usage: goo input <click|pointer.move|pointer.down|pointer.up|pointer.cancel|wheel|key.down|key.up|text|reset> [options]");
        var project = ResolveProject(commandLine.Get("project"));
        var projectDirectory = ResolveProjectDirectory(commandLine.Get("project"), project);
        var processId = ParseOptionalInt(commandLine.Get("pid"), "pid");
        var descriptor = Discovery.Select(Discovery.Scan(projectDirectory), processId,
            commandLine.Get("pipe"), commandLine.Get("app"), commandLine.Get("window"), commandLine.Has("latest"))
            ?? await WaitForDescriptorAsync(projectDirectory, processId, commandLine, ParseWait(commandLine.Get("wait")));
        var eventName = commandLine.Positionals[0];
        if (eventName is not ("click" or "pointer.move" or "pointer.down" or "pointer.up" or "wheel")
            && (commandLine.Has("target") || commandLine.Has("node")))
            throw new CliException("--target and --node apply only to pointer and wheel events.");
        var gesture = commandLine.Get("gesture");
        if (commandLine.Has("gesture") && string.IsNullOrWhiteSpace(gesture))
            throw new CliException("--gesture needs the token returned by pointer.down or key.down.");
        if (gesture is { Length: > 128 })
            throw new CliException("--gesture is limited to 128 characters.");
        if (gesture is null && eventName is "pointer.down" or "key.down")
            gesture = Guid.NewGuid().ToString("N");
        var payload = new JsonObject { ["event"] = eventName };
        foreach (var name in new[] { "key", "text", "button" })
            if (commandLine.Has(name))
                payload[name] = commandLine.Get(name) ?? throw new CliException($"--{name} needs a value.");
        if (commandLine.Has("node") && commandLine.Has("target"))
            throw new CliException("Use --target or --node, not both.");
        if (commandLine.Has("target"))
        {
            var targetHandle = commandLine.Get("target");
            if (string.IsNullOrWhiteSpace(targetHandle) || targetHandle.Length > 128)
                throw new CliException("--target needs an opaque target handle from the selected window snapshot.");
            payload["target"] = targetHandle;
        }
        if (commandLine.Has("node"))
        {
            if (!long.TryParse(commandLine.Get("node"), NumberStyles.None, CultureInfo.InvariantCulture, out var node) || node <= 0)
                throw new CliException("--node needs a positive node ID from the selected window snapshot.");
            payload["nodeId"] = node;
        }
        foreach (var (option, property) in new[] { ("x", "x"), ("y", "y"), ("offset-x", "offsetX"), ("offset-y", "offsetY"), ("delta-x", "deltaX"), ("delta-y", "deltaY") })
        {
            if (!commandLine.Has(option)) continue;
            if (!double.TryParse(commandLine.Get(option), NumberStyles.Float, CultureInfo.InvariantCulture, out var value) || !double.IsFinite(value))
                throw new CliException($"--{option} needs a finite number.");
            payload[property] = value;
        }
        payload["modifiers"] = new JsonObject
        {
            ["alt"] = commandLine.Has("alt"), ["ctrl"] = commandLine.Has("ctrl"),
            ["shift"] = commandLine.Has("shift"), ["super"] = commandLine.Has("super")
        };
        if (payload.ToJsonString().Length > 65536)
            throw new CliException("Input request exceeds the endpoint request limit.");
        using var timeout = new CancellationTokenSource(ParseWait(commandLine.Get("wait")));
        await using var connection = await ConnectAsync(descriptor, timeout.Token);
        string? handshake;
        try
        {
            handshake = await connection.HandshakeAsync(timeout.Token);
        }
        catch (OperationCanceledException)
        {
            throw new CliException("Timed out waiting for the Goo endpoint handshake.", "timeout", "handshake");
        }
        ValidateHandshake(handshake, descriptor);
        var gestureLease = false;
        var targetHandles = false;
        using (var hello = JsonDocument.Parse(handshake!))
        {
            if (!hello.RootElement.TryGetProperty("capabilities", out var capabilities)
                || capabilities.ValueKind != JsonValueKind.Array
                || !capabilities.EnumerateArray().Any(value => value.ValueKind == JsonValueKind.String && value.GetString() == "input"))
                throw new CliException("This endpoint does not permit input. Enable GOO_DEVTOOLS=1 and GOO_DEVTOOLS_INPUT=1 in the target application.", "input-disabled", "handshake", false, handshake);
            gestureLease = capabilities.EnumerateArray().Any(value => value.ValueKind == JsonValueKind.String && value.GetString() == "input.gesture-lease");
            targetHandles = capabilities.EnumerateArray().Any(value => value.ValueKind == JsonValueKind.String && value.GetString() == "target.handles");
        }
        if (commandLine.Has("target") && !targetHandles)
            throw new CliException("This endpoint does not support opaque target handles. Update the target application's Goo runtime.", "unsupported-capability", "handshake", false, handshake);
        if (gestureLease && gesture is not null)
        {
            payload["gestureId"] = gesture;
            if (eventName is "pointer.down" or "key.down")
                Console.Error.WriteLine($"[goo] gesture {gesture}");
        }
        else if (!gestureLease && gesture is not null)
        {
            Console.Error.WriteLine("[goo] endpoint does not advertise gesture leases; ownership and abandoned-input cleanup are unavailable.");
        }
        if (payload.ToJsonString().Length > 65536)
            throw new CliException("Input request exceeds the endpoint request limit.");
        JsonObject? response;
        try
        {
            response = await connection.RequestAsync("input", payload, timeout.Token);
        }
        catch (OperationCanceledException)
        {
            throw new CliException("Timed out waiting for the input acknowledgement. Inspect state before another action and do not automatically retry input.", "timeout", "input", true, handshake);
        }
        catch (Exception exception) when (exception is IOException or SocketException)
        {
            throw new CliException($"The input acknowledgement was lost: {exception.Message} Inspect state before another action and do not automatically retry input.", "input-unconfirmed", "input", true, handshake);
        }
        if (response is null)
            throw new CliException("The window closed before acknowledging input. Inspect state before another action and do not automatically retry input.", "input-unconfirmed", "input", true, handshake);
        if (IsError(response))
            DecorateError(response, "input", true, handshake);
        response["runtime"] ??= RuntimeStatus(handshake);
        WriteProtocolLine(response.ToJsonString(), commandLine.Has("json"));
        return response["ok"]?.GetValue<bool>() == true ? 0 : 1;
    }

    private static async Task<int> RunCaptureAsync(CommandLine commandLine)
    {
        var project = ResolveProject(commandLine.Get("project"));
        var projectDirectory = ResolveProjectDirectory(commandLine.Get("project"), project);
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
            throw new CliException("Timed out waiting for the Goo endpoint handshake.", "timeout", "handshake");
        }
        if (handshake is null)
            throw new CliException("The Goo endpoint closed before completing its protocol handshake.", "handshake-closed", "handshake");
        ValidateHandshake(handshake, descriptor);
        var payload = new JsonObject
        {
            ["window"] = commandLine.Get("window"),
            ["format"] = commandLine.Get("format") ?? "png"
        };
        JsonObject response;
        try
        {
            response = await RequestCaptureAsync(connection, payload, captureTimeout.Token);
        }
        catch (CliException exception)
        {
            throw new CliException(exception.Message, exception.Code, exception.Phase, exception.MayHaveApplied, handshake);
        }
        if (IsError(response))
        {
            DecorateError(response, "capture", false, handshake);
            var error = response["error"] as JsonObject;
            throw new CliException(StringValue(error?["message"]) ?? "The endpoint rejected the capture request.", StringValue(error?["code"]) ?? "capture-rejected", "capture", false, handshake);
        }
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
                throw new CliException("The capture did not complete before the Goo endpoint wait expired.", "timeout", "capture");
            }

            if (response is null)
                throw new CliException("The Goo endpoint closed without returning a capture.", "capture-unconfirmed", "capture");
            if (!IsCapturePending(response))
                return response;

            try
            {
                await Task.Delay(TimeSpan.FromMilliseconds(50), cancellationToken);
            }
            catch (OperationCanceledException)
            {
                throw new CliException("The capture did not complete before the Goo endpoint wait expired.", "timeout", "capture");
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
        var projectDirectory = ResolveProjectDirectory(commandLine.Get("project"), project);
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

    private static PosixSignalRegistration? RegisterShutdownSignal(PosixSignal signal, CancellationTokenSource cancellation)
    {
        if (OperatingSystem.IsWindows())
            return null;
        return PosixSignalRegistration.Create(signal, context =>
        {
            context.Cancel = true;
            cancellation.Cancel();
        });
    }

    private static async Task StopOwnedProcessTreeAsync(Process process)
    {
        if (!process.HasExited)
        {
            try
            {
                process.Kill(true);
            }
            catch (InvalidOperationException)
            {
            }
        }
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        try
        {
            await process.WaitForExitAsync(timeout.Token);
        }
        catch (OperationCanceledException)
        {
            throw new CliException("The owned process tree did not stop within five seconds.", "cleanup-timeout", "shutdown");
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
        if (IntegerValue(message["pid"]) != descriptor.ProcessId
            || !string.Equals(StringValue(message["windowId"]), descriptor.WindowId, StringComparison.Ordinal))
            throw new CliException($"The Goo endpoint at {descriptor.Pipe} did not confirm descriptor PID/window identity.");
    }

    private static async Task RunInteractiveAsync(ProtocolConnection connection, bool json, TimeSpan drainTimeout, CancellationToken cancellationToken)
    {
        using var stop = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        var requests = new InteractiveRequestTracker();
        var remote = ReadRemoteAsync(connection, json, requests, stop.Token);
        var local = WriteLocalAsync(connection, requests, stop.Token);
        var completed = await Task.WhenAny(remote, local);
        if (ReferenceEquals(completed, local))
        {
            await local;
            await Task.WhenAny(requests.Drained, remote, Task.Delay(drainTimeout, cancellationToken));
        }
        stop.Cancel();
        try
        {
            await Task.WhenAll(remote, local);
        }
        catch (OperationCanceledException)
        {
        }
    }

    private static async Task ReadRemoteAsync(ProtocolConnection connection, bool json, InteractiveRequestTracker requests, CancellationToken cancellationToken)
    {
        try
        {
            while (true)
            {
                var line = await connection.ReadLineAsync(cancellationToken);
                if (line is null)
                    return;
                if (ProtocolConnection.TryParse(line, out var message)
                    && StringValue(message["id"]) is { } id)
                    requests.Complete(id);
                WriteProtocolLine(line, json);
            }
        }
        catch (OperationCanceledException)
        {
        }
    }

    private static async Task WriteLocalAsync(ProtocolConnection connection, InteractiveRequestTracker requests, CancellationToken cancellationToken)
    {
        try
        {
            while (true)
            {
                var line = await Console.In.ReadLineAsync(cancellationToken);
                if (line is null)
                {
                    requests.Finish();
                    return;
                }
                if (line.TrimStart().StartsWith('{'))
                {
                    if (ProtocolConnection.TryParse(line, out var raw)
                        && StringValue(raw["type"]) == "request"
                        && StringValue(raw["id"]) is { } rawId)
                        requests.Add(rawId);
                    await connection.SendRawAsync(line, cancellationToken);
                    continue;
                }

                var request = ProtocolConnection.CreateRequest(line);
                requests.Add(request["id"]!.GetValue<string>());
                await connection.SendAsync(request, cancellationToken);
            }
        }
        catch (OperationCanceledException)
        {
        }
    }

    private sealed class InteractiveRequestTracker
    {
        private readonly object _gate = new();
        private readonly HashSet<string> _pending = new(StringComparer.Ordinal);
        private readonly TaskCompletionSource<bool> _drained = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private bool _finished;

        public Task Drained => _drained.Task;

        public void Add(string id)
        {
            lock (_gate)
                _pending.Add(id);
        }

        public void Complete(string id)
        {
            lock (_gate)
            {
                _pending.Remove(id);
                CompleteIfDrained();
            }
        }

        public void Finish()
        {
            lock (_gate)
            {
                _finished = true;
                CompleteIfDrained();
            }
        }

        private void CompleteIfDrained()
        {
            if (_finished && _pending.Count == 0)
                _drained.TrySetResult(true);
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
            var code = "capture-rejected";
            if (error is null && payload["error"] is JsonObject errorObject)
            {
                code = StringValue(errorObject["code"]) ?? code;
                error = StringValue(errorObject["message"]) ?? StringValue(errorObject["code"]);
            }
            if (response["error"] is JsonObject responseError)
            {
                code = StringValue(responseError["code"]) ?? code;
                error ??= StringValue(responseError["message"]);
            }
            error ??= "The endpoint rejected the capture request.";
            throw new CliException(error, code, "capture");
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

    private static bool IsError(JsonObject response)
    {
        return BoolValue(response["ok"]) == false
            || StringValue(response["type"]) == "error"
            || response["error"] is not null;
    }

    private static void DecorateError(JsonObject response, string phase, bool defaultMayHaveApplied, string? runtimeHello)
    {
        var error = response["error"] as JsonObject
            ?? (response["payload"] as JsonObject)?["error"] as JsonObject
            ?? new JsonObject
            {
                ["code"] = "request-rejected",
                ["message"] = StringValue((response["payload"] as JsonObject)?["message"])
                    ?? StringValue(response["message"])
                    ?? "The endpoint rejected the request."
            };
        var code = StringValue(error["code"]);
        var rejectedBeforeDispatch = code is "stale-target" or "input-disabled" or "gesture-owned" or "gesture-expired"
            or "target-not-actionable" or "permission-denied" or "unsupported" or "invalid-request";
        error["phase"] ??= phase;
        error["mayHaveApplied"] ??= defaultMayHaveApplied && !rejectedBeforeDispatch;
        error["cliVersion"] ??= Version;
        error["runtime"] ??= RuntimeStatus(runtimeHello);
        if (response["error"] is null)
            response["error"] = error.DeepClone();
    }

    private static JsonObject RuntimeStatus(string? handshake)
    {
        var hello = string.IsNullOrWhiteSpace(handshake) ? null : JsonNode.Parse(handshake) as JsonObject;
        var rawCapabilities = hello?["capabilities"] as JsonArray;
        var validCapabilities = rawCapabilities is not null && rawCapabilities.All(item => StringValue(item) is not null);
        var capabilities = validCapabilities
            ? (JsonArray)rawCapabilities!.DeepClone()
            : new JsonArray();
        var identity = new JsonObject
        {
            ["pid"] = hello?["pid"]?.DeepClone(),
            ["windowId"] = hello?["windowId"]?.DeepClone(),
            ["sessionId"] = hello?["sessionId"]?.DeepClone()
        };
        return new JsonObject
        {
            ["runtimeVersion"] = hello?["runtimeVersion"]?.DeepClone() ?? "unavailable",
            ["protocol"] = hello?["protocol"]?.DeepClone() ?? "unavailable",
            ["protocolVersion"] = hello?["version"]?.DeepClone() ?? "unavailable",
            ["capabilities"] = capabilities,
            ["runtimeOverrideProperties"] = hello?["runtimeOverrideProperties"]?.DeepClone() ?? "unavailable",
            ["identity"] = identity,
            ["inputPermission"] = !validCapabilities ? "unavailable" : capabilities.Any(item => StringValue(item) == "input") ? "enabled" : "disabled",
            ["inspectMode"] = hello?["inspectMode"]?.DeepClone() ?? "unavailable"
        };
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

    private static string ResolveProjectDirectory(string? value, string? project)
    {
        if (project is not null)
            return Path.GetDirectoryName(project)!;
        if (!string.IsNullOrWhiteSpace(value))
        {
            var path = Path.GetFullPath(value);
            if (Directory.Exists(path))
                return path;
        }
        return Environment.CurrentDirectory;
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
        if (double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var seconds) && double.IsFinite(seconds) && seconds > 0)
            return TimeSpan.FromSeconds(Math.Min(seconds, 300));
        throw new CliException("--wait must be a positive number of seconds.");
    }

    private static void WriteError(string[] args, string message, string code, string phase, bool mayHaveApplied, string? runtimeHello = null)
    {
        if (WantsJson(args))
        {
            Console.Error.WriteLine(JsonSerializer.Serialize(new
            {
                type = "error",
                error = new { code, message, phase, mayHaveApplied, cliVersion = Version, runtime = RuntimeStatus(runtimeHello) }
            }));
            return;
        }
        Console.Error.WriteLine($"goo: {message}");
    }

    private static bool WantsJson(string[] args)
    {
        foreach (var argument in args)
        {
            if (argument == "--")
                return false;
            if (argument == "--json")
                return true;
        }
        return false;
    }

    private static void WriteProtocolLine(string line, bool json)
    {
        Console.WriteLine(ProtocolConnection.FormatLine(line, json));
    }

    private static int PrintHelp()
    {
        Console.WriteLine("Goo DevTools CLI 0.6.2");
        Console.WriteLine();
        Console.WriteLine("Usage:");
        Console.WriteLine("  goo dev [options] -- <command> [args]");
        Console.WriteLine("  goo attach [options]");
        Console.WriteLine("  goo doctor [--json]");
        Console.WriteLine("  goo list [--pid PID] [--project PATH] [--json]");
        Console.WriteLine("  goo capture [options]");
        Console.WriteLine("  goo input <event> [--pid PID --window NAME] [--target HANDLE | --node ID | --x X --y Y] [options]");
        Console.WriteLine();
        Console.WriteLine("Commands:");
        Console.WriteLine("  dev       Start a Goo project with diagnostics enabled and dotnet watch by default.");
        Console.WriteLine("  attach    Attach to a live Goo endpoint and stream protocol events.");
        Console.WriteLine("  doctor    Check the SDK, project, endpoint directory, and inspector installation.");
        Console.WriteLine("  list      List live endpoints without connecting or selecting a window.");
        Console.WriteLine("  capture   Request a screenshot from an attached endpoint.");
        Console.WriteLine("  input     Send an opted-in pointer, wheel, key, text, click, or reset event.");
        Console.WriteLine();
        Console.WriteLine("Common options:");
        Console.WriteLine("  --project PATH       Project file or directory.");
        Console.WriteLine("  --pid PID            Select one process ID.");
        Console.WriteLine("  --pipe NAME          Select one pipe or socket endpoint.");
        Console.WriteLine("  --app NAME           Select by application name.");
        Console.WriteLine("  --window NAME        Select by stable window ID or window title.");
        Console.WriteLine("  --latest             Select the newest endpoint.");
        Console.WriteLine("  --wait SECONDS       Wait for a descriptor, up to 300 seconds.");
        Console.WriteLine("  --inspector          Launch the standalone inspector when ready.");
        Console.WriteLine("  --input              Permit agent input in the app launched by dev.");
        Console.WriteLine("  --gesture TOKEN      Continue or release a held pointer/key gesture.");
        Console.WriteLine("  --focus              Launch or focus the standalone inspector.");
        Console.WriteLine("  --json               Keep protocol output as JSON lines.");
        Console.WriteLine("  JSON errors include code, phase, and mayHaveApplied fields.");
        Console.WriteLine();
        Console.WriteLine("Environment:");
        Console.WriteLine("  GOO_DEVTOOLS_DIR         Runtime descriptor directory override.");
        Console.WriteLine("  GOO_DEVTOOLS_INSPECTOR   Standalone inspector executable or DLL.");
        Console.WriteLine("  GOO_DEVTOOLS_INPUT=1     Permit application input when GOO_DEVTOOLS=1 enables diagnostics.");
        return 0;
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
