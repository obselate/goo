package Goo.DevTools.Cli

import System
import System.Collections.Generic
import System.ComponentModel
import System.Diagnostics
import System.Globalization
import System.IO
import System.Linq
import System.Net.Sockets
import System.Runtime.InteropServices
import System.Text.Json
import System.Text.Json.Nodes
import System.Threading
import System.Threading.Tasks
import SystemObject = System.Object

internal shared class CliApplication {
    private class InteractiveRequestTracker {
        private let _gate object = SystemObject()
        private let _pending HashSet[string] = HashSet[string](StringComparer.Ordinal)
        private let _drained TaskCompletionSource[bool] = TaskCompletionSource[bool](
            TaskCreationOptions.RunContinuationsAsynchronously
        )
        private var _finished bool
        prop Drained Task -> _drained.Task

        func Add(id string) {
            lock _gate {
                _pending.Add(id)
            }
        }

        func Complete(id string) {
            lock _gate {
                _pending.Remove(id)
                CompleteIfDrained()
            }
        }

        func Finish() {
            lock _gate {
                _finished = true
                CompleteIfDrained()
            }
        }

        private func CompleteIfDrained() {
            if _finished && _pending.Count == 0 {
                _drained.TrySetResult(true)
            }
        }
    }

    private data class LaunchSpec(FileName string, Arguments IReadOnlyList[string]) : IEquatable[LaunchSpec] { }

    private data class DoctorCheck(Name string, Detail string, Ok bool) : IEquatable[DoctorCheck] { }

    private const Version string = "0.23.1"

    internal func SelectInspectorDescriptor(
        descriptors IReadOnlyList[DiscoveryDescriptor],
        processId int32,
        watch bool,
        runtimeDirectory string,
        existingDescriptorPaths IReadOnlySet[string]? = nil,
        launchStartedAt DateTimeOffset? = nil
    ) DiscoveryDescriptor? {
        let directory = Path.GetFullPath(runtimeDirectory)
        var scoped_ = descriptors.Where(
            (item DiscoveryDescriptor) -> string.Equals(
                Path.GetDirectoryName(item.DescriptorPath),
                directory,
                StringComparison.OrdinalIgnoreCase
            )
        )
            .ToArray()
        if watch && existingDescriptorPaths != nil && (launchStartedAt != nil) {
            scoped_ = scoped_.Where(
                (item DiscoveryDescriptor) -> !existingDescriptorPaths.Contains(item.DescriptorPath) ||
                    item.StartedAt >= launchStartedAt
            )
                .ToArray()
        }
        return Discovery.Select(
            scoped_,
            if watch {
                nil
            } else {
                processId
            },
            nil,
            nil,
            nil,
            watch
        )
    }

    async func RunAsync(args[]string) int32 {
        try {
            let commandLine = CommandLine.Parse(args)
            if commandLine.Has("help") {
                return PrintHelp()
            }
            if commandLine.Has("version") {
                if commandLine.Has("json") {
                    Console.WriteLine(
                        JsonSerializer.Serialize(
                            AnonymousType2_DBAF339DC932974B(
                                CliApplication.Version,
                                []string{
                                    "list",
                                    "input",
                                    "dev.input",
                                    "errors.structured",
                                    "process-tree-cleanup",
                                    "attach.require-capabilities"
                                }
                            )
                        )
                    )
                } else {
                    Console.WriteLine(CliApplication.Version)
                }
                return 0
            }
            return switch commandLine.Command {
                case "help": PrintHelp()
                case "mcp": await Goo.PluginMcp.McpHost.RunAsync(
                    commandLine.Get("plugin-root") ?? throw CliException("Select the plugin directory with --plugin-root."),
                    commandLine.Has("verify")
                )
                case "dev": await RunDevAsync(commandLine)
                case "attach": await RunAttachAsync(commandLine)
                case "doctor": await RunDoctorAsync(commandLine)
                case "package": await PackageApplication.RunAsync(
                    commandLine,
                    ResolveProject(commandLine.Get("project")) ??
                        throw CliException("Select an application project with --project.")
                )
                case "list": RunList(commandLine)
                case "capture": await RunCaptureAsync(commandLine)
                case "input": await RunInputAsync(commandLine)
                default: throw CliException("Unknown command '${commandLine.Command}'. Run `goo help` for usage.")
            }
        } catch (exception CliException) {
            WriteError(
                args,
                exception.Message,
                exception.Code,
                exception.Phase,
                exception.MayHaveApplied,
                exception.RuntimeHello
            )
            return 2
        } catch (OperationCanceledException) {
            WriteError(args, "Operation cancelled.", "cancelled", "operation", false)
            return 130
        } catch (exception Exception) when exception is IOException ||
            exception is UnauthorizedAccessException ||
            exception is SocketException ||
            exception is Win32Exception {
            WriteError(args, exception.Message, "io-error", "operation", false)
            return 1
        }
    }

    private func RunList(commandLine CommandLine) int32 {
        let project = ResolveProject(commandLine.Get("project"))
        let directory = ResolveProjectDirectory(commandLine.Get("project"), project)
        let targets = Discovery
            .Matching(
            Discovery.Scan(directory),
            ParseOptionalInt(commandLine.Get("pid"), "pid"),
            commandLine.Get("pipe"),
            commandLine.Get("app"),
            commandLine.Get("window")
        )
            .Select(
            (item DiscoveryDescriptor) -> AnonymousType7_F72729B4BAF7F0FB(
                item.ProcessId,
                item.DisplayName,
                item.WindowId,
                item.WindowTitle,
                item.Protocol,
                item.Transport,
                item.Pipe
            )
        )
            .ToArray()
        if commandLine.Has("json") {
            Console.WriteLine(JsonSerializer.Serialize(AnonymousType1_FB3AF7D67DFD6DD2(targets)))
        } else {
            for target in targets {
                Console.WriteLine("${target.process} pid=${target.pid} window=${target.window} title=${target.title}")
            }
        }
        return 0
    }

    private async func RunDevAsync(commandLine CommandLine) int32 {
        let inspectorWait = ParseWait(commandLine.Get("wait"))
        if commandLine.Has("watch") && commandLine.Has("no-watch") {
            throw CliException("Use --watch or --no-watch, not both.")
        }
        let project = ResolveProject(commandLine.Get("project"))
        let projectDirectory = ResolveProjectDirectory(commandLine.Get("project"), project)
        var watch = !commandLine.Has("no-watch")
        if commandLine.Has("watch") {
            watch = true
        }
        let launch = BuildLaunch(commandLine, project, watch)
        let runtimeDirectory = ResolveRuntimeDirectory(projectDirectory)
        Directory.CreateDirectory(runtimeDirectory)
        let launchStartedAt = DateTimeOffset.UtcNow
        let existingDescriptorPaths = if watch {
            Discovery
                .Scan(projectDirectory, includeStale: true)
                .Where(
                (item DiscoveryDescriptor) -> string.Equals(
                    Path.GetDirectoryName(item.DescriptorPath),
                    runtimeDirectory,
                    StringComparison.OrdinalIgnoreCase
                )
            )
                .Select((item DiscoveryDescriptor) -> item.DescriptorPath)
                .ToHashSet(StringComparer.OrdinalIgnoreCase)
        } else {
            HashSet[string](StringComparer.OrdinalIgnoreCase)
        }
        let startInfo = ProcessStartInfo{
            FileName: launch.FileName,
            UseShellExecute: false,
            WorkingDirectory: projectDirectory,
            RedirectStandardOutput: true,
            RedirectStandardError: true,
            CreateNoWindow: true
        }
        for argument in launch.Arguments {
            startInfo.ArgumentList.Add(argument)
        }
        startInfo.Environment["GOO_DEVTOOLS"] = "1"
        startInfo.Environment["GOO_DEVTOOLS_DIR"] = runtimeDirectory
        if commandLine.Has("input") {
            startInfo.Environment["GOO_DEVTOOLS_INPUT"] = "1"
        }
        if commandLine.Has("inspector") || commandLine.Has("focus") {
            startInfo.Environment["GOO_DEVTOOLS_AUTOSTART"] = "1"
        }
        ApplyEnvironmentOverrides(startInfo, commandLine)
        using let shutdown = CancellationTokenSource()
        using let terminateRegistration = RegisterShutdownSignal(PosixSignal.SIGTERM, shutdown)
        using let interruptRegistration = RegisterShutdownSignal(PosixSignal.SIGINT, shutdown)
        let cancelHandler ConsoleCancelEventHandler = (_ object?, eventArgs ConsoleCancelEventArgs) -> {
            eventArgs.Cancel = true
            shutdown.Cancel()
        }
        Console.CancelKeyPress += cancelHandler
        var process Process? = nil
        try {
            process = Process.Start(startInfo) ??
                throw CliException("Could not start '${startInfo.FileName}'.", "launch-failed", "launch")
            Console.WriteLine("[goo] started ${startInfo.FileName} (pid ${process.Id})")
            Console.WriteLine("[goo] descriptors: $runtimeDirectory")
            using let monitorCancellation = CancellationTokenSource()
            let outputTask = Task.WhenAll(
                ForwardOutputAsync(process.StandardOutput, false, monitorCancellation.Token),
                ForwardOutputAsync(process.StandardError, true, monitorCancellation.Token)
            )
            let inspectorTask = if commandLine.Has("inspector") || commandLine.Has("focus") {
                LaunchInspectorWhenReadyAsync(
                    projectDirectory,
                    process.Id,
                    watch,
                    runtimeDirectory,
                    existingDescriptorPaths,
                    launchStartedAt,
                    commandLine.Has("focus"),
                    inspectorWait,
                    monitorCancellation.Token
                )
            } else {
                Task.CompletedTask
            }
            var cancelled = false
            try {
                await process.WaitForExitAsync(shutdown.Token)
            } catch (OperationCanceledException) when shutdown.IsCancellationRequested {
                cancelled = true
                await StopOwnedProcessTreeAsync(process)
            }
            monitorCancellation.Cancel()
            try {
                await Task.WhenAll(outputTask, inspectorTask)
            } catch (OperationCanceledException) { }
            if cancelled {
                Console.Error.WriteLine("[goo] stopped owned process tree after cancellation")
                return 130
            }
            Console.WriteLine("[goo] process exited with code ${process.ExitCode}")
            return process.ExitCode
        } finally {
            Console.CancelKeyPress -= cancelHandler
            if process != nil {
                if !process.HasExited {
                    await StopOwnedProcessTreeAsync(process)
                }
                process.Dispose()
            }
        }
    }

    private async func RunAttachAsync(commandLine CommandLine) int32 {
        if !commandLine.Has("once") &&
            (commandLine.Has("require-capabilities") || commandLine.Has("require-override-property")) {
            throw CliException("--require-capabilities and --require-override-property require --once.")
        }
        if commandLine.Has("require-capabilities") && string.IsNullOrWhiteSpace(
            commandLine.Get("require-capabilities")
        ) {
            throw CliException("--require-capabilities needs a comma-separated list of capability names.")
        }
        if commandLine.Has("require-override-property") && string.IsNullOrWhiteSpace(
            commandLine.Get("require-override-property")
        ) {
            throw CliException("--require-override-property needs a property name.")
        }
        let project = ResolveProject(commandLine.Get("project"))
        let projectDirectory = ResolveProjectDirectory(commandLine.Get("project"), project)
        let processId = ParseOptionalInt(commandLine.Get("pid"), "pid")
        let descriptors = Discovery.Scan(projectDirectory)
        var descriptor DiscoveryDescriptor? = Discovery.Select(
            descriptors,
            processId,
            commandLine.Get("pipe"),
            commandLine.Get("app"),
            commandLine.Get("window"),
            commandLine.Has("latest")
        )
        if descriptor == nil {
            descriptor = await WaitForDescriptorAsync(
                projectDirectory,
                processId,
                commandLine,
                ParseWait(commandLine.Get("wait"))
            )
        }
        Console.Error.WriteLine(
            "[goo] attaching to ${descriptor.DisplayName} (pid ${descriptor.ProcessId}, ${descriptor.Transport}:${descriptor.Pipe})"
        )
        if commandLine.Has("inspector") || commandLine.Has("focus") {
            LaunchInspector(descriptor, commandLine.Has("focus"), projectDirectory)
        }
        using let cancellation = CancellationTokenSource()
        if commandLine.Has("once") {
            cancellation.CancelAfter(ParseWait(commandLine.Get("wait")))
        }
        let connection = await ConnectAsync(descriptor, cancellation.Token)
        try {
            var handshake string?
            try {
                handshake = await connection.HandshakeAsync(cancellation.Token)
            } catch (OperationCanceledException) {
                throw CliException("Timed out waiting for the Goo endpoint handshake.", "timeout", "handshake")
            }
            ValidateHandshake(handshake, descriptor)
            ValidateRequestRequirements(
                handshake!!,
                commandLine.Get("require-capabilities"),
                commandLine.Get("require-override-property")
            )
            WriteProtocolLine(handshake!!, commandLine.Has("json"))
            if commandLine.Has("once") {
                let requestCommand = commandLine.Get("command") ?? "snapshot"
                let mayHaveApplied = !((requestCommand == "snapshot" || requestCommand == "capture"))
                var request JsonObject?
                try {
                    request = await connection.RequestAsync(
                        requestCommand,
                        ParsePayload(commandLine.Get("payload")),
                        cancellation.Token
                    )
                } catch (exception Exception) when exception is OperationCanceledException ||
                    exception is IOException ||
                    exception is SocketException ||
                    exception is JsonException {
                    let consequence = if mayHaveApplied {
                        " It may already have applied. Inspect state before another action."
                    } else {
                        ""
                    }
                    throw CliException(
                        "The endpoint did not acknowledge the $requestCommand request.$consequence",
                        "request-unconfirmed",
                        requestCommand,
                        mayHaveApplied,
                        handshake
                    )
                }
                if request == nil {
                    let consequence = if mayHaveApplied {
                        " It may already have applied. Inspect state before another action."
                    } else {
                        ""
                    }
                    throw CliException(
                        "The endpoint closed without acknowledging the $requestCommand request.$consequence",
                        "request-unconfirmed",
                        requestCommand,
                        mayHaveApplied,
                        handshake
                    )
                }
                if IsError(request) {
                    DecorateError(request, requestCommand, mayHaveApplied, handshake)
                } else if BoolValue(request["ok"]) != true {
                    let consequence = if mayHaveApplied {
                        " It may already have applied. Inspect state before another action."
                    } else {
                        ""
                    }
                    throw CliException(
                        "The endpoint returned an invalid acknowledgement for $requestCommand.$consequence",
                        "request-unconfirmed",
                        requestCommand,
                        mayHaveApplied,
                        handshake
                    )
                }
                WriteProtocolLine(request.ToJsonString(), commandLine.Has("json"))
                return if BoolValue(request["ok"]) == false ||
                    StringValue(request["type"]) == "error" ||
                    request["error"] != nil {
                    1
                } else {
                    0
                }
            }
            await RunInteractiveAsync(
                connection,
                commandLine.Has("json"),
                ParseWait(commandLine.Get("wait")),
                cancellation.Token
            )
            return 0
        } finally {
            await connection.DisposeAsync()
        }
    }

    private func ValidateRequestRequirements(handshake string, requiredCapabilities string?, requiredProperty string?) {
        if string.IsNullOrWhiteSpace(requiredCapabilities) && string.IsNullOrWhiteSpace(requiredProperty) {
            return
        }
        using let hello = JsonDocument.Parse(handshake)
        let root = hello.RootElement
        if !root.TryGetProperty("capabilities", out var capabilities) ||
            capabilities.ValueKind != JsonValueKind.Array ||
            capabilities
            .EnumerateArray().Any((value JsonElement) -> value.ValueKind != JsonValueKind.String) {
            throw CliException(
                "The endpoint did not provide a valid capability list. No request was sent.",
                "unsupported-capability",
                "handshake",
                false,
                handshake
            )
        }
        let available = capabilities
            .EnumerateArray()
            .Select((value JsonElement) -> value.GetString()!!)
            .ToHashSet(StringComparer.Ordinal)
        if !string.IsNullOrWhiteSpace(requiredCapabilities) {
            let required = requiredCapabilities.Split(',', StringSplitOptions.TrimEntries)
            if required.Any(string.IsNullOrEmpty) {
                throw CliException("--require-capabilities needs a comma-separated list of capability names.")
            }
            let missing = required
                .Where((capability string) -> !available.Contains(capability))
                .Distinct(StringComparer.Ordinal)
                .ToArray()
            if missing.Length != 0 {
                throw CliException(
                    "The endpoint does not advertise required capability: ${string.Join(", ", missing)}. No request was sent.",
                    "unsupported-capability",
                    "handshake",
                    false,
                    handshake
                )
            }
        }
        if string.IsNullOrWhiteSpace(requiredProperty) {
            return
        }
        if !available.Contains("runtime-overrides.describe") {
            throw CliException(
                "The endpoint does not advertise required capability: runtime-overrides.describe. No request was sent.",
                "unsupported-capability",
                "handshake",
                false,
                handshake
            )
        }
        if !root.TryGetProperty("runtimeOverrideProperties", out var properties) ||
            properties.ValueKind != JsonValueKind.Array ||
            properties
            .EnumerateArray().Any((value JsonElement) -> value.ValueKind != JsonValueKind.String) {
            throw CliException(
                "The endpoint did not provide a valid runtime override property list. No request was sent.",
                "unsupported-property",
                "handshake",
                false,
                handshake
            )
        }
        if !properties.EnumerateArray().Any(
            (value JsonElement) -> string.Equals(
                value.GetString(),
                requiredProperty,
                StringComparison.OrdinalIgnoreCase
            )
        ) {
            throw CliException(
                "The endpoint does not advertise runtime override property '$requiredProperty'. No request was sent.",
                "unsupported-property",
                "handshake",
                false,
                handshake
            )
        }
    }

    private async func RunInputAsync(commandLine CommandLine) int32 {
        if commandLine.Positionals.Count != 1 {
            throw CliException(
                "Usage: goo input <click|pointer.move|pointer.down|pointer.up|pointer.cancel|wheel|key.down|key.up|text|reset> [options]"
            )
        }
        let project = ResolveProject(commandLine.Get("project"))
        let projectDirectory = ResolveProjectDirectory(commandLine.Get("project"), project)
        let processId = ParseOptionalInt(commandLine.Get("pid"), "pid")
        let descriptor = Discovery.Select(
            Discovery.Scan(projectDirectory),
            processId,
            commandLine.Get("pipe"),
            commandLine.Get("app"),
            commandLine.Get("window"),
            commandLine.Has("latest")
        ) ??
            await WaitForDescriptorAsync(projectDirectory, processId, commandLine, ParseWait(commandLine.Get("wait")))
        let eventName = commandLine.Positionals[0]
        if !(
            (
                eventName == "click" ||
                    eventName == "pointer.move" ||
                    eventName == "pointer.down" ||
                    eventName == "pointer.up" ||
                    eventName == "wheel"
            )
        ) &&
            (commandLine.Has("target") || commandLine.Has("node")) {
            throw CliException("--target and --node apply only to pointer and wheel events.")
        }
        var gesture string? = commandLine.Get("gesture")
        if commandLine.Has("gesture") && string.IsNullOrWhiteSpace(gesture) {
            throw CliException("--gesture needs the token returned by pointer.down or key.down.")
        }
        if gesture != nil && gesture.Length > 128 {
            throw CliException("--gesture is limited to 128 characters.")
        }
        if gesture == nil && (eventName is "pointer.down" or "key.down") {
            gesture = Guid.NewGuid().ToString("N")
        }
        let payload = JsonObject(){["event"] = eventName}
        for name in[]string{"key", "text", "button"} {
            if commandLine.Has(name) {
                payload[name] = commandLine.Get(name) ?? throw CliException("--$name needs a value.")
            }
        }
        if commandLine.Has("node") && commandLine.Has("target") {
            throw CliException("Use --target or --node, not both.")
        }
        if commandLine.Has("target") {
            let targetHandle = commandLine.Get("target")
            if string.IsNullOrWhiteSpace(targetHandle) || targetHandle!!.Length > 128 {
                throw CliException("--target needs an opaque target handle from the selected window snapshot.")
            }
            payload["target"] = targetHandle
        }
        if commandLine.Has("node") {
            if !int64.TryParse(
                commandLine.Get("node"),
                NumberStyles.None,
                CultureInfo.InvariantCulture,
                out var node
            ) ||
                node <= int64(0) {
                throw CliException("--node needs a positive node ID from the selected window snapshot.")
            }
            payload["nodeId"] = node
        }
        for (option, property) in[](string, string){
            ("x", "x"),
            ("y", "y"),
            ("offset-x", "offsetX"),
            ("offset-y", "offsetY"),
            ("delta-x", "deltaX"),
            ("delta-y", "deltaY")
        } {
            if !commandLine.Has(option) {
                continue
            }
            if !float64.TryParse(
                commandLine.Get(option),
                NumberStyles.Float,
                CultureInfo.InvariantCulture,
                out var value
            ) ||
                !float64.IsFinite(value) {
                throw CliException("--$option needs a finite number.")
            }
            payload[property] = value
        }
        payload["modifiers"] = JsonObject(){
            ["alt"] = commandLine.Has("alt"),
            ["ctrl"] = commandLine.Has("ctrl"),
            ["shift"] = commandLine.Has("shift"),
            ["super"] = commandLine.Has("super")
        }
        if payload.ToJsonString().Length > 65536 {
            throw CliException("Input request exceeds the endpoint request limit.")
        }
        using let timeout = CancellationTokenSource(ParseWait(commandLine.Get("wait")))
        let connection = await ConnectAsync(descriptor, timeout.Token)
        try {
            var handshake string?
            try {
                handshake = await connection.HandshakeAsync(timeout.Token)
            } catch (OperationCanceledException) {
                throw CliException("Timed out waiting for the Goo endpoint handshake.", "timeout", "handshake")
            }
            ValidateHandshake(handshake, descriptor)
            var gestureLease = false
            var targetHandles = false
            {
                using let hello = JsonDocument.Parse(handshake!!)
                if !hello.RootElement.TryGetProperty("capabilities", out var capabilities) ||
                    capabilities.ValueKind != JsonValueKind.Array ||
                    !capabilities
                    .EnumerateArray().Any(
                    (value JsonElement) -> value.ValueKind == JsonValueKind.String && value.GetString() == "input"
                ) {
                    throw CliException(
                        "This endpoint does not permit input. Enable GOO_DEVTOOLS=1 and GOO_DEVTOOLS_INPUT=1 in the target application.",
                        "input-disabled",
                        "handshake",
                        false,
                        handshake
                    )
                }
                gestureLease = capabilities.EnumerateArray().Any(
                    (value JsonElement) -> value.ValueKind == JsonValueKind.String &&
                        value.GetString() == "input.gesture-lease"
                )
                targetHandles = capabilities.EnumerateArray().Any(
                    (value JsonElement) -> value.ValueKind == JsonValueKind.String &&
                        value.GetString() == "target.handles"
                )
            }
            if commandLine.Has("target") && !targetHandles {
                throw CliException(
                    "This endpoint does not support opaque target handles. Update the target application's Goo runtime.",
                    "unsupported-capability",
                    "handshake",
                    false,
                    handshake
                )
            }
            if gestureLease && gesture != nil {
                payload["gestureId"] = gesture
                if (eventName is "pointer.down" or "key.down") {
                    Console.Error.WriteLine("[goo] gesture $gesture")
                }
            } else if !gestureLease && gesture != nil {
                Console.Error.WriteLine(
                    "[goo] endpoint does not advertise gesture leases; ownership and abandoned-input cleanup are unavailable."
                )
            }
            if payload.ToJsonString().Length > 65536 {
                throw CliException("Input request exceeds the endpoint request limit.")
            }
            var response JsonObject?
            try {
                response = await connection.RequestAsync("input", payload, timeout.Token)
            } catch (OperationCanceledException) {
                throw CliException(
                    "Timed out waiting for the input acknowledgement. Inspect state before another action and do not automatically retry input.",
                    "timeout",
                    "input",
                    true,
                    handshake
                )
            } catch (exception Exception) when exception is IOException || exception is SocketException {
                throw CliException(
                    "The input acknowledgement was lost: ${exception.Message} Inspect state before another action and do not automatically retry input.",
                    "input-unconfirmed",
                    "input",
                    true,
                    handshake
                )
            }
            if response == nil {
                throw CliException(
                    "The window closed before acknowledging input. Inspect state before another action and do not automatically retry input.",
                    "input-unconfirmed",
                    "input",
                    true,
                    handshake
                )
            }
            if IsError(response) {
                DecorateError(response, "input", true, handshake)
            }
            response["runtime"] ??= RuntimeStatus(handshake)
            WriteProtocolLine(response.ToJsonString(), commandLine.Has("json"))
            return if response["ok"]?.GetValue[bool]() == true {
                0
            } else {
                1
            }
        } finally {
            await connection.DisposeAsync()
        }
    }

    private async func RunCaptureAsync(commandLine CommandLine) int32 {
        let project = ResolveProject(commandLine.Get("project"))
        let projectDirectory = ResolveProjectDirectory(commandLine.Get("project"), project)
        let processId = ParseOptionalInt(commandLine.Get("pid"), "pid")
        let descriptors = Discovery.Scan(projectDirectory)
        var descriptor DiscoveryDescriptor? = Discovery.Select(
            descriptors,
            processId,
            commandLine.Get("pipe"),
            commandLine.Get("app"),
            commandLine.Get("window"),
            commandLine.Has("latest")
        )
        if descriptor == nil {
            descriptor = await WaitForDescriptorAsync(
                projectDirectory,
                processId,
                commandLine,
                ParseWait(commandLine.Get("wait"))
            )
        }
        using let captureTimeout = CancellationTokenSource(ParseWait(commandLine.Get("wait")))
        let connection = await ConnectAsync(descriptor, captureTimeout.Token)
        try {
            var handshake string?
            try {
                handshake = await connection.HandshakeAsync(captureTimeout.Token)
            } catch (OperationCanceledException) {
                throw CliException("Timed out waiting for the Goo endpoint handshake.", "timeout", "handshake")
            }
            if handshake == nil {
                throw CliException(
                    "The Goo endpoint closed before completing its protocol handshake.",
                    "handshake-closed",
                    "handshake"
                )
            }
            ValidateHandshake(handshake, descriptor)
            let payload = JsonObject(){
                ["window"] = commandLine.Get("window"),
                ["format"] = commandLine.Get("format") ?? "png"
            }
            var response JsonObject
            try {
                response = await RequestCaptureAsync(connection, payload, captureTimeout.Token)
            } catch (exception CliException) {
                throw CliException(
                    exception.Message,
                    exception.Code,
                    exception.Phase,
                    exception.MayHaveApplied,
                    handshake
                )
            }
            if IsError(response) {
                DecorateError(response, "capture", false, handshake)
                let error = response["error"] as JsonObject
                throw CliException(
                    StringValue(error?["message"]) ?? "The endpoint rejected the capture request.",
                    StringValue(error?["code"]) ?? "capture-rejected",
                    "capture",
                    false,
                    handshake
                )
            }
            return WriteCapture(response, commandLine.Get("output"))
        } finally {
            await connection.DisposeAsync()
        }
    }

    private async func RequestCaptureAsync(
        connection ProtocolConnection,
        payload JsonObject,
        cancellationToken CancellationToken
    ) JsonObject {
        while true {
            var response JsonObject?
            try {
                response = await connection.RequestAsync("capture", payload, cancellationToken)
            } catch (OperationCanceledException) {
                throw CliException(
                    "The capture did not complete before the Goo endpoint wait expired.",
                    "timeout",
                    "capture"
                )
            }
            if response == nil {
                throw CliException(
                    "The Goo endpoint closed without returning a capture.",
                    "capture-unconfirmed",
                    "capture"
                )
            }
            if !IsCapturePending(response) {
                return response
            }
            try {
                await Task.Delay(TimeSpan.FromMilliseconds(50), cancellationToken)
            } catch (OperationCanceledException) {
                throw CliException(
                    "The capture did not complete before the Goo endpoint wait expired.",
                    "timeout",
                    "capture"
                )
            }
        }
    }

    private func IsCapturePending(response JsonObject) bool {
        let payload = CapturePayload(response)
        return payload["pending"] is JsonValue value && value.TryGetValue[bool](out var pending) && pending
    }

    private async func RunDoctorAsync(commandLine CommandLine) int32 {
        let project string? = ResolveProject(commandLine.Get("project"))
        let projectDirectory = ResolveProjectDirectory(commandLine.Get("project"), project)
        let descriptors = Discovery.Scan(projectDirectory, includeStale: true)
        let checks = List[DoctorCheck]()
        let dotnet = await CheckDotnetAsync()
        checks.Add(dotnet)
        checks.Add(
            DoctorCheck(
                "project",
                if project == nil {
                    "No Goo project was found in the current directory."
                } else {
                    project
                },
                project != nil
            )
        )
        let runtimeDirectories = Discovery.RuntimeDirectories(projectDirectory)
        let existingDirectories = runtimeDirectories.Where(Directory.Exists).ToArray()
        checks.Add(
            DoctorCheck(
                "runtime-directory",
                if existingDirectories.Length == 0 {
                    runtimeDirectories[0]
                } else {
                    string.Join(Path.PathSeparator, existingDirectories)
                },
                existingDirectories.Length != 0
            )
        )
        checks.Add(
            DoctorCheck(
                "endpoint",
                if descriptors.Count == 0 {
                    "No live or stale descriptors found."
                } else {
                    "${descriptors.Count} descriptor(s) found."
                },
                descriptors.Any((item DiscoveryDescriptor) -> item.IsProcessAlive)
            )
        )
        let inspector string? = InspectorLauncher.Find(projectDirectory)
        checks.Add(
            DoctorCheck(
                "inspector",
                inspector ?? "Not installed. Set GOO_DEVTOOLS_INSPECTOR to the standalone DevTools executable or DLL.",
                inspector != nil
            )
        )
        if commandLine.Has("json") {
            Console.WriteLine(
                JsonSerializer.Serialize(
                    AnonymousType2_38E0A6F42AE9FA0A(checks, descriptors),
                    JsonSerializerOptions{PropertyNamingPolicy: JsonNamingPolicy.CamelCase}
                )
            )
        } else {
            for check in checks {
                Console.WriteLine("${(if check.Ok { "ok" } else { "warn" }),-4} ${check.Name}: ${check.Detail}")
            }
            for descriptor in descriptors {
                Console.WriteLine(
                    "  ${descriptor.DisplayName} pid=${descriptor.ProcessId} alive=${descriptor.IsProcessAlive} pipe=${descriptor.Pipe}"
                )
            }
        }
        return if checks.Any((check DoctorCheck) -> !check.Ok && (check.Name == "dotnet" || check.Name == "project")) {
            1
        } else {
            0
        }
    }

    private async func CheckDotnetAsync() DoctorCheck {
        try {
            let startInfo = ProcessStartInfo{
                FileName: "dotnet",
                UseShellExecute: false,
                RedirectStandardOutput: true,
                RedirectStandardError: true,
                CreateNoWindow: true
            }
            startInfo.ArgumentList.Add("--version")
            using let process Process? = Process.Start(startInfo)
            if process == nil {
                return DoctorCheck("dotnet", "Could not start dotnet.", false)
            }
            let output = await process.StandardOutput.ReadToEndAsync()
            await process.WaitForExitAsync()
            return DoctorCheck("dotnet", output.Trim(), process.ExitCode == 0)
        } catch (exception Exception) when exception is Win32Exception || exception is IOException {
            return DoctorCheck("dotnet", exception.Message, false)
        }
    }

    private async func ForwardOutputAsync(reader StreamReader, error bool, cancellationToken CancellationToken) {
        try {
            while true {
                let line string? = await reader.ReadLineAsync(cancellationToken)
                if line == nil {
                    return
                }
                if HotReloadReporter.IsRestartRequired(line) {
                    Console.Error.WriteLine("[goo] hot reload requires restart: $line")
                }
                if error {
                    Console.Error.WriteLine(line)
                } else {
                    Console.WriteLine(line)
                }
            }
        } catch (OperationCanceledException) { }
    }

    private func RegisterShutdownSignal(
        signal PosixSignal,
        cancellation CancellationTokenSource
    ) PosixSignalRegistration? {
        if OperatingSystem.IsWindows() {
            return nil
        }
        return PosixSignalRegistration.Create(
            signal,
            (context PosixSignalContext) -> {
                context.Cancel = true
                cancellation.Cancel()
            }
        )
    }

    private async func StopOwnedProcessTreeAsync(process Process) {
        if !process.HasExited {
            try {
                process.Kill(true)
            } catch (InvalidOperationException) { }
        }
        using let timeout = CancellationTokenSource(TimeSpan.FromSeconds(5))
        try {
            await process.WaitForExitAsync(timeout.Token)
        } catch (OperationCanceledException) {
            throw CliException(
                "The owned process tree did not stop within five seconds.",
                "cleanup-timeout",
                "shutdown"
            )
        }
    }

    private async func LaunchInspectorWhenReadyAsync(
        projectDirectory string,
        processId int32,
        watch bool,
        runtimeDirectory string,
        existingDescriptorPaths IReadOnlySet[string],
        launchStartedAt DateTimeOffset,
        focus bool,
        timeout TimeSpan,
        cancellationToken CancellationToken
    ) {
        try {
            let descriptor = await WaitForDescriptorAsync(
                projectDirectory,
                if watch {
                    nil
                } else {
                    processId
                },
                nil,
                timeout,
                cancellationToken,
                runtimeDirectory,
                watch,
                existingDescriptorPaths,
                launchStartedAt
            )
            LaunchInspector(descriptor, focus, projectDirectory)
        } catch (exception CliException) {
            Console.Error.WriteLine("[goo] ${exception.Message}")
        } catch (OperationCanceledException) { }
    }

    private async func WaitForDescriptorAsync(
        projectDirectory string,
        processId int32?,
        commandLine CommandLine?,
        timeout TimeSpan,
        cancellationToken CancellationToken = default(CancellationToken),
        runtimeDirectory string? = nil,
        latest bool = false,
        existingDescriptorPaths IReadOnlySet[string]? = nil,
        launchStartedAt DateTimeOffset? = nil
    ) DiscoveryDescriptor {
        let started = Stopwatch.GetTimestamp()
        while Stopwatch.GetElapsedTime(started) < timeout {
            let descriptors = Discovery
                .Scan(projectDirectory)
                .Where(
                (item DiscoveryDescriptor) -> runtimeDirectory == nil || string.Equals(
                    Path.GetDirectoryName(item.DescriptorPath),
                    Path.GetFullPath(runtimeDirectory),
                    StringComparison.OrdinalIgnoreCase
                )
            )
                .ToArray()
            let latestSelection = latest || commandLine?.Has("latest") == true
            let matches = Discovery.Matching(
                descriptors,
                processId,
                commandLine?.Get("pipe"),
                commandLine?.Get("app"),
                commandLine?.Get("window")
            )
            if matches.Count > 1 && !latestSelection {
                throw CliException(
                    "More than one live Goo endpoint matches the selection. Pass --window, --pipe, or --latest."
                )
            }
            let descriptor DiscoveryDescriptor? = if commandLine == nil && runtimeDirectory != nil {
                SelectInspectorDescriptor(
                    descriptors,
                    processId ?? 0,
                    latestSelection,
                    runtimeDirectory,
                    existingDescriptorPaths,
                    launchStartedAt
                )
            } else {
                Discovery.Select(
                    descriptors,
                    processId,
                    commandLine?.Get("pipe"),
                    commandLine?.Get("app"),
                    commandLine?.Get("window"),
                    latestSelection
                )
            }
            if descriptor != nil {
                return descriptor
            }
            await Task.Delay(TimeSpan.FromMilliseconds(100), cancellationToken)
        }
        let all = Discovery.Scan(projectDirectory, includeStale: true)
        throw CliException(
            Discovery.DescribeNoMatch(
                all,
                projectDirectory,
                processId,
                commandLine?.Get("pipe"),
                commandLine?.Get("app"),
                commandLine?.Get("window")
            )
        )
    }

    private async func ConnectAsync(
        descriptor DiscoveryDescriptor,
        cancellationToken CancellationToken
    ) ProtocolConnection {
        try {
            return await ProtocolConnection.ConnectAsync(descriptor, TimeSpan.FromSeconds(5), cancellationToken)
        } catch (OperationCanceledException) {
            throw CliException("Timed out connecting to ${descriptor.DisplayName} at ${descriptor.Pipe}.")
        } catch (exception SocketException) {
            throw CliException(
                "Could not connect to ${descriptor.DisplayName} at ${descriptor.Pipe}: ${exception.Message}"
            )
        } catch (exception IOException) {
            throw CliException(
                "Could not connect to ${descriptor.DisplayName} at ${descriptor.Pipe}: ${exception.Message}"
            )
        }
    }

    private func ValidateHandshake(handshake string?, descriptor DiscoveryDescriptor) {
        if handshake == nil {
            throw CliException(
                "The Goo endpoint at ${descriptor.Pipe} closed before completing its protocol handshake."
            )
        }
        if !ProtocolConnection.TryParse(handshake, out var message) || !string.Equals(
            StringValue(message!!["protocol"]),
            Discovery.Protocol,
            StringComparison.OrdinalIgnoreCase
        ) {
            throw CliException("The Goo endpoint at ${descriptor.Pipe} did not confirm protocol ${Discovery.Protocol}.")
        }
        if IntegerValue(message!!["pid"]) != descriptor.ProcessId || !string.Equals(
            StringValue(message!!["windowId"]),
            descriptor.WindowId,
            StringComparison.Ordinal
        ) {
            throw CliException("The Goo endpoint at ${descriptor.Pipe} did not confirm descriptor PID/window identity.")
        }
    }

    private async func RunInteractiveAsync(
        connection ProtocolConnection,
        json bool,
        drainTimeout TimeSpan,
        cancellationToken CancellationToken
    ) {
        using let stop = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken)
        let requests = InteractiveRequestTracker()
        let remote = ReadRemoteAsync(connection, json, requests, stop.Token)
        let local = WriteLocalAsync(connection, requests, stop.Token)
        let completed = await Task.WhenAny(remote, local)
        if object.ReferenceEquals(completed, local) {
            await local
            await Task.WhenAny(requests.Drained, remote, Task.Delay(drainTimeout, cancellationToken))
        }
        stop.Cancel()
        try {
            await Task.WhenAll(remote, local)
        } catch (OperationCanceledException) { }
    }

    private async func ReadRemoteAsync(
        connection ProtocolConnection,
        json bool,
        requests InteractiveRequestTracker,
        cancellationToken CancellationToken
    ) {
        try {
            while true {
                let line string? = await connection.ReadLineAsync(cancellationToken)
                if line == nil {
                    return
                }
                if ProtocolConnection.TryParse(line, out var message) && StringValue(message!!["id"]) is {} id {
                    requests.Complete(id)
                }
                WriteProtocolLine(line, json)
            }
        } catch (OperationCanceledException) { }
    }

    private async func WriteLocalAsync(
        connection ProtocolConnection,
        requests InteractiveRequestTracker,
        cancellationToken CancellationToken
    ) {
        try {
            while true {
                let line string? = await Console.In.ReadLineAsync(cancellationToken)
                if line == nil {
                    requests.Finish()
                    return
                }
                if line.TrimStart().StartsWith('{') {
                    if ProtocolConnection.TryParse(line, out var raw) &&
                        StringValue(raw!!["type"]) == "request" &&
                        StringValue(raw!!["id"]) is {} rawId {
                        requests.Add(rawId)
                    }
                    await connection.SendRawAsync(line, cancellationToken)
                    continue
                }
                let request = ProtocolConnection.CreateRequest(line)
                requests.Add(request["id"]!!.GetValue[string]())
                await connection.SendAsync(request, cancellationToken)
            }
        } catch (OperationCanceledException) { }
    }

    private func WriteCapture(response JsonObject, outputPath string?) int32 {
        let payload = CapturePayload(response)
        let responseType = StringValue(payload["type"]) ?? StringValue(response["type"])
        let ok = BoolValue(response["ok"])
        if string.Equals(responseType, "error", StringComparison.OrdinalIgnoreCase) || ok == false {
            var error string? = StringValue(payload["message"]) ??
                StringValue(payload["error"]) ??
                StringValue(response["message"]) ??
                StringValue(response["error"])
            var code = "capture-rejected"
            if error == nil && payload["error"] is JsonObject errorObject {
                code = StringValue(errorObject["code"]) ?? code
                error = StringValue(errorObject["message"]) ?? StringValue(errorObject["code"])
            }
            if response["error"] is JsonObject responseError {
                code = StringValue(responseError["code"]) ?? code
                error ??= StringValue(responseError["message"])
            }
            error ??= "The endpoint rejected the capture request."
            throw CliException(error!!, code, "capture")
        }
        let format = StringValue(payload["format"])
        let rgbaData string? = StringValue(payload["rgbaBase64"])
        if rgbaData != nil || IsRgbaFormat(format) {
            let encoded = rgbaData ??
                StringValue(payload["data"]) ??
                StringValue(payload["contentBase64"]) ??
                throw CliException("The endpoint returned an RGBA capture without pixel data.")
            let rgba = DecodeCaptureData(encoded)
            let width = IntegerValue(payload["width"]) ??
                throw CliException("The endpoint returned an RGBA capture without a width.")
            let height = IntegerValue(payload["height"]) ??
                throw CliException("The endpoint returned an RGBA capture without a height.")
            let stride = IntegerValue(payload["stride"]) ?? checked(width * 4)
            return WriteCaptureBytes(PngEncoder.Encode(rgba, width, height, stride), outputPath)
        }
        let data string? = StringValue(payload["contentBase64"]) ??
            StringValue(payload["base64"]) ??
            StringValue(payload["data"])
        if data == nil {
            Console.WriteLine(response.ToJsonString(JsonSerializerOptions{WriteIndented: true}))
            return 0
        }
        return WriteCaptureBytes(DecodeCaptureData(data), outputPath)
    }

    private func DecodeCaptureData(data string)[]uint8 {
        try {
            return Convert.FromBase64String(data)
        } catch (exception FormatException) {
            throw CliException("The endpoint returned invalid capture data: ${exception.Message}")
        }
    }

    private func WriteCaptureBytes(bytes[]uint8, outputPath string?) int32 {
        if string.IsNullOrWhiteSpace(outputPath) || outputPath == "-" {
            Console.OpenStandardOutput().Write(bytes)
            return 0
        }
        if IsPngPath(outputPath!!) && !PngEncoder.IsPng(bytes) {
            throw CliException(
                "The endpoint returned bytes that are not a PNG; refusing to write raw data to a .png path."
            )
        }
        let fullPath = Path.GetFullPath(outputPath!!)
        let parent = Path.GetDirectoryName(fullPath)
        if !string.IsNullOrWhiteSpace(parent) {
            Directory.CreateDirectory(parent)
        }
        File.WriteAllBytes(fullPath, bytes)
        Console.WriteLine(fullPath)
        return 0
    }

    private func CapturePayload(response JsonObject) JsonObject -> response["payload"] as JsonObject ?? response

    private func IsError(response JsonObject) bool -> BoolValue(response["ok"]) == false ||
        StringValue(response["type"]) == "error" || response["error"] != nil

    private func DecorateError(response JsonObject, phase string, defaultMayHaveApplied bool, runtimeHello string?) {
        let error = response["error"] as JsonObject ??
            (response["payload"] as JsonObject)?["error"] as JsonObject ??
            JsonObject(){
            ["code"] = "request-rejected",
            ["message"] = StringValue((response["payload"] as JsonObject)?["message"]) ??
                StringValue(response["message"]) ??
                "The endpoint rejected the request."
        }
        let code = StringValue(error["code"])
        let rejectedBeforeDispatch = (
            code is "stale-target" or
                "input-disabled" or
                "gesture-owned" or
                "gesture-expired" or
                "target-not-actionable" or
                "permission-denied" or
                "unsupported" or
                "invalid-request"
        )
        error["phase"] ??= phase
        error["mayHaveApplied"] ??= defaultMayHaveApplied && !rejectedBeforeDispatch
        error["cliVersion"] ??= CliApplication.Version
        error["runtime"] ??= RuntimeStatus(runtimeHello)
        if response["error"] == nil {
            response["error"] = error.DeepClone()
        }
    }

    private func RuntimeStatus(handshake string?) JsonObject {
        let hello = if string.IsNullOrWhiteSpace(handshake) {
            default(JsonObject?)
        } else {
            JsonNode.Parse(handshake!!) as JsonObject
        }
        let rawCapabilities JsonArray? = hello?["capabilities"] as JsonArray
        let validCapabilities = rawCapabilities != nil && rawCapabilities.All(
            (item JsonNode?) -> StringValue(item) != nil
        )
        let capabilities = if validCapabilities {
            cast[JsonArray](rawCapabilities!!.DeepClone())
        } else {
            JsonArray()
        }
        let identity = JsonObject(){
            ["pid"] = hello?["pid"]?.DeepClone(),
            ["windowId"] = hello?["windowId"]?.DeepClone(),
            ["sessionId"] = hello?["sessionId"]?.DeepClone()
        }
        return JsonObject(){
            ["runtimeVersion"] = hello?["runtimeVersion"]?.DeepClone() ?? JsonValue.Create("unavailable"),
            ["protocol"] = hello?["protocol"]?.DeepClone() ?? JsonValue.Create("unavailable"),
            ["protocolVersion"] = hello?["version"]?.DeepClone() ?? JsonValue.Create("unavailable"),
            ["capabilities"] = capabilities,
            ["runtimeOverrideProperties"] = hello?["runtimeOverrideProperties"]?.DeepClone() ?? JsonValue.Create(
                "unavailable"
            ),
            ["identity"] = identity,
            ["inputPermission"] = if !validCapabilities {
                "unavailable"
            } else {
                (
                    if capabilities.Any((item JsonNode?) -> StringValue(item) == "input") {
                        "enabled"
                    } else {
                        "disabled"
                    }
                )
            },
            ["inspectMode"] = hello?["inspectMode"]?.DeepClone() ?? JsonValue.Create("unavailable")
        }
    }

    private func IsRgbaFormat(format string?) bool -> format != nil &&
        format.StartsWith("rgba8", StringComparison.OrdinalIgnoreCase)

    private func IsPngPath(path string) bool -> string.Equals(Path.GetExtension(path), ".png", StringComparison.OrdinalIgnoreCase)

    private func StringValue(node JsonNode?) string? -> if node is JsonValue value &&
        value.TryGetValue[string](out var text) { text } else { nil }

    private func BoolValue(node JsonNode?) bool? -> if node is JsonValue value &&
        value.TryGetValue[bool](out var result) { result } else { nil }

    private func IntegerValue(node JsonNode?) int32? {
        if node is not JsonValue value {
            return nil
        }
        if value.TryGetValue[int32](out var result) {
            return result
        }
        return if value.TryGetValue[int64](out var longResult) &&
            (longResult >= int64(int32.MinValue) && longResult <= int64(int32.MaxValue)) {
            int32(longResult)
        } else {
            nil
        }
    }

    private func LaunchInspector(descriptor DiscoveryDescriptor, focus bool, projectDirectory string) {
        let executable string? = InspectorLauncher.Find(projectDirectory)
        if executable == nil {
            throw CliException(
                "The standalone Goo DevTools app was not found. Build it or set GOO_DEVTOOLS_INSPECTOR to its executable or DLL."
            )
        }
        try {
            let process Process? = InspectorLauncher.Launch(executable, descriptor, focus)
            if process == nil {
                throw InvalidOperationException("Process.Start returned no process.")
            }
            process.Dispose()
            Console.Error.WriteLine("[goo] launched inspector $executable")
        } catch (exception Exception) when exception is Win32Exception ||
            exception is InvalidOperationException ||
            exception is IOException {
            throw CliException("Could not launch inspector '$executable': ${exception.Message}")
        }
    }

    private func BuildLaunch(commandLine CommandLine, project string?, watch bool) LaunchSpec {
        if commandLine.Trailing.Count != 0 {
            let fileName = commandLine.Trailing[0]
            let arguments = commandLine.Trailing.Skip(1).ToList()
            if watch && Path.GetFileNameWithoutExtension(fileName).Equals(
                "dotnet",
                StringComparison.OrdinalIgnoreCase
            ) &&
                arguments.Count != 0 &&
                arguments[0].Equals("run", StringComparison.OrdinalIgnoreCase) {
                arguments.Insert(0, "watch")
            }
            return LaunchSpec(fileName, arguments)
        }
        if project == nil {
            throw CliException("No Goo project was found. Pass --project path/to/App.gsproj or add a command after --.")
        }
        let projectArguments = List[string]()
        if watch {
            projectArguments.Add("watch")
        }
        projectArguments.Add("run")
        projectArguments.Add("--project")
        projectArguments.Add(project)
        let configuration = commandLine.Get("configuration")
        if !string.IsNullOrWhiteSpace(configuration) {
            projectArguments.Add("--configuration")
            projectArguments.Add(configuration)
        }
        return LaunchSpec("dotnet", projectArguments)
    }

    private func ResolveProject(value string?) string? {
        if !string.IsNullOrWhiteSpace(value) {
            let path = Path.GetFullPath(value)
            if Directory.Exists(path) {
                return FindProjectInDirectory(path)
            }
            if !File.Exists(path) {
                throw CliException("Project path does not exist: $path")
            }
            return path
        }
        return FindProjectInDirectory(Environment.CurrentDirectory, false)
    }

    private func ResolveProjectDirectory(value string?, project string?) string {
        if project != nil {
            return Path.GetDirectoryName(project)!!
        }
        if !string.IsNullOrWhiteSpace(value) {
            let path = Path.GetFullPath(value)
            if Directory.Exists(path) {
                return path
            }
        }
        return Environment.CurrentDirectory
    }

    private func FindProjectInDirectory(directory string, failOnMultiple bool = true) string? {
        let projects = Directory
            .EnumerateFiles(directory, "*.*proj", SearchOption.TopDirectoryOnly)
            .Where(
            (path string) -> path.EndsWith(".gsproj", StringComparison.OrdinalIgnoreCase) || path.EndsWith(
                ".csproj",
                StringComparison.OrdinalIgnoreCase
            )
        )
            .OrderBy(
            (path string) -> if path.EndsWith(".gsproj", StringComparison.OrdinalIgnoreCase) {
                0
            } else {
                1
            }
        )
            .ThenBy((path string) -> path, StringComparer.OrdinalIgnoreCase)
            .ToArray()
        if projects.Length > 1 && failOnMultiple {
            throw CliException("More than one project exists in $directory. Pass --project explicitly.")
        }
        return projects.FirstOrDefault()
    }

    private func ResolveRuntimeDirectory(projectDirectory string) string {
        let configured = Environment.GetEnvironmentVariable("GOO_DEVTOOLS_DIR")
        if !string.IsNullOrWhiteSpace(configured) {
            return Path.GetFullPath(configured)
        }
        return Path.Combine(projectDirectory, ".goo", "devtools")
    }

    private func ApplyEnvironmentOverrides(startInfo ProcessStartInfo, commandLine CommandLine) {
        let value = commandLine.Get("env")
        if string.IsNullOrWhiteSpace(value) {
            return
        }
        let separator = value.IndexOf('=')
        if separator <= 0 {
            throw CliException("--env expects NAME=VALUE.")
        }
        startInfo.Environment[value[.. separator]] = value[(separator + 1) ..]
    }

    private func ParsePayload(value string?) JsonObject? {
        if string.IsNullOrWhiteSpace(value) {
            return nil
        }
        try {
            return JsonNode.Parse(value) as JsonObject ?? throw CliException("--payload must be a JSON object.")
        } catch (exception JsonException) {
            throw CliException("Invalid --payload JSON: ${exception.Message}")
        }
    }

    private func ParseOptionalInt(value string?, name string) int32? {
        if string.IsNullOrWhiteSpace(value) {
            return nil
        }
        if int32.TryParse(value, out var parsed) && parsed > 0 {
            return parsed
        }
        throw CliException("--$name must be a positive integer.")
    }

    private func ParseWait(value string?) TimeSpan {
        if string.IsNullOrWhiteSpace(value) {
            return TimeSpan.FromSeconds(15)
        }
        if float64.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var seconds) &&
            float64.IsFinite(seconds) && seconds > float64(0.0) {
            return TimeSpan.FromSeconds(Math.Min(seconds, 300.0))
        }
        throw CliException("--wait must be a positive number of seconds.")
    }

    private func WriteError(
        args[]string,
        message string,
        code string,
        phase string,
        mayHaveApplied bool,
        runtimeHello string? = nil
    ) {
        if WantsJson(args) {
            Console.Error.WriteLine(
                JsonSerializer.Serialize(
                    AnonymousType2_51AC67F57FE22AA3(
                        "error",
                        AnonymousType6_BBEA7366A338EF9D(
                            code,
                            message,
                            phase,
                            mayHaveApplied,
                            CliApplication.Version,
                            RuntimeStatus(runtimeHello)
                        )
                    )
                )
            )
            return
        }
        Console.Error.WriteLine("goo: $message")
    }

    private func WantsJson(args[]string) bool {
        for argument in args {
            if argument == "--" {
                return false
            }
            if argument == "--json" {
                return true
            }
        }
        return false
    }

    private func WriteProtocolLine(line string, json bool) {
        Console.WriteLine(ProtocolConnection.FormatLine(line, json))
    }

    private func PrintHelp() int32 {
        Console.WriteLine("Goo DevTools CLI 0.23.1")
        Console.WriteLine()
        Console.WriteLine("Usage:")
        Console.WriteLine("  goo dev [options] -- <command> [args]")
        Console.WriteLine("  goo attach [options]")
        Console.WriteLine("  goo doctor [--json]")
        Console.WriteLine("  goo list [--pid PID] [--project PATH] [--json]")
        Console.WriteLine("  goo capture [options]")
        Console.WriteLine("  goo mcp --plugin-root PATH [--verify]")
        Console.WriteLine(
            "  goo package --target linux|windows|macos|android [--project PATH] [--output PATH] [--json]"
        )
        Console.WriteLine(
            "  goo input <event> [--pid PID --window NAME] [--target HANDLE | --node ID | --x X --y Y] [options]"
        )
        Console.WriteLine()
        Console.WriteLine("Commands:")
        Console.WriteLine("  dev       Start a Goo project with diagnostics enabled and dotnet watch by default.")
        Console.WriteLine("  attach    Attach to a live Goo endpoint and stream protocol events.")
        Console.WriteLine("  doctor    Check the SDK, project, endpoint directory, and inspector installation.")
        Console.WriteLine("  list      List live endpoints without connecting or selecting a window.")
        Console.WriteLine("  capture   Request a screenshot from an attached endpoint.")
        Console.WriteLine("  package   Publish a desktop package or signed Android app bundle.")
        Console.WriteLine("  input     Send an opted-in pointer, wheel, key, text, click, or reset event.")
        Console.WriteLine("  mcp       Serve the plugin's stdio MCP tools or verify them against a live starter.")
        Console.WriteLine()
        Console.WriteLine("Common options:")
        Console.WriteLine("  --project PATH       Project file or directory.")
        Console.WriteLine("  --pid PID            Select one process ID.")
        Console.WriteLine("  --pipe NAME          Select one pipe or socket endpoint.")
        Console.WriteLine("  --app NAME           Select by application name.")
        Console.WriteLine("  --window NAME        Select by stable window ID or window title.")
        Console.WriteLine("  --latest             Select the newest endpoint.")
        Console.WriteLine("  --wait SECONDS       Wait for a descriptor, up to 300 seconds.")
        Console.WriteLine("  --inspector          Launch the standalone inspector when ready.")
        Console.WriteLine("  --input              Permit agent input in the app launched by dev.")
        Console.WriteLine("  --gesture TOKEN      Continue or release a held pointer/key gesture.")
        Console.WriteLine("  --focus              Launch or focus the standalone inspector.")
        Console.WriteLine("  --json               Keep protocol output as JSON lines.")
        Console.WriteLine("  JSON errors include code, phase, and mayHaveApplied fields.")
        Console.WriteLine()
        Console.WriteLine("Environment:")
        Console.WriteLine("  GOO_DEVTOOLS_DIR         Runtime descriptor directory override.")
        Console.WriteLine("  GOO_DEVTOOLS_INSPECTOR   Standalone inspector executable or DLL.")
        Console.WriteLine(
            "  GOO_DEVTOOLS_INPUT=1     Permit application input when GOO_DEVTOOLS=1 enables diagnostics."
        )
        return 0
    }
}

internal shared class HotReloadReporter {
    private let RestartPhrases[]string = []string{
        "requires restart",
        "restart required",
        "restart is required",
        "cannot be applied",
        "could not apply",
        "hot reload was not applied",
        "rude edit"
    }

    func IsRestartRequired(line string) bool -> RestartPhrases.Any(
        (phrase string) -> line.Contains(phrase, StringComparison.OrdinalIgnoreCase)
    )
}

internal data class AnonymousType2_DBAF339DC932974B(version string, features[]string?) { }

internal data class AnonymousType7_F72729B4BAF7F0FB(
    pid int32,
    process string,
    window string?,
    title string?,
    protocol string,
    transport string,
    pipe string
) { }

internal data class AnonymousType1_FB3AF7D67DFD6DD2(targets[]AnonymousType7_F72729B4BAF7F0FB?) { }

internal data class AnonymousType2_38E0A6F42AE9FA0A(
    checks List[DoctorCheck?],
    descriptors IReadOnlyList[DiscoveryDescriptor?]
) { }

internal data class AnonymousType6_BBEA7366A338EF9D(
    code string,
    message string,
    phase string,
    mayHaveApplied bool,
    cliVersion string,
    runtime JsonObject
) { }

internal data class AnonymousType2_51AC67F57FE22AA3(type string, error AnonymousType6_BBEA7366A338EF9D) { }
