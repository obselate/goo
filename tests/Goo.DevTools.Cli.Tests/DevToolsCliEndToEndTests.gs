package Goo.DevTools.Cli.Tests

import Goo.DevTools.Cli
import System
import System.Buffers.Binary
import System.Collections.Generic
import System.Collections.ObjectModel
import System.Diagnostics
import System.IO
import System.IO.Compression
import System.IO.Pipes
import System.Linq
import System.Text
import System.Text.Json
import System.Threading.Tasks
import Xunit

class DevToolsCliEndToEndTests {
    @Fact
    async func PackageRejectsUnsupportedTargetsWithStructuredError() {
        using let directory = TemporaryDirectory.Create()
        let result = await RunCliAsync(
            directory.Path,
            "package",
            "--target",
            "unsupported",
            "--project",
            Path.Combine(RepositoryRoot, "tools/Goo.DevTools.Cli/Goo.DevTools.Cli.gsproj"),
            "--json"
        )
        Assert.Equal(2, result.ExitCode)
        Assert.Empty(result.StandardOutput)
        using let error = JsonDocument.Parse(result.StandardError)
        Assert.Equal("unsupported-target", error.RootElement.GetProperty("error").GetProperty("code").GetString())
    }

    @Fact
    async func ConsumerStagingPreservesNestedXmlAndSeparatesSymbols() {
        if !OperatingSystem.IsLinux() {
            return
        }
        using let directory = TemporaryDirectory.Create()
        let publish = Path.Combine(directory.Path, "publish with spaces")
        Directory.CreateDirectory(Path.Combine(publish, "Assets"))
        await File.WriteAllTextAsync(Path.Combine(publish, "Consumer"), `#!/bin/sh
exit 0
`)
        await File.WriteAllTextAsync(Path.Combine(publish, "Assets", "data.xml"), "<data />")
        await File.WriteAllTextAsync(Path.Combine(publish, "Consumer.dbg"), "symbols")
        let bundle = Path.Combine(directory.Path, "bundle")
        let symbols = Path.Combine(directory.Path, "symbols")
        let result = await RunProcessAsync(
            "bash",
            Path.Combine(RepositoryRoot, ".github/scripts/stage-linux-x64.sh"),
            publish,
            bundle,
            symbols,
            "Consumer"
        )
        Assert.Equal(0, result.ExitCode)
        Assert.Equal("<data />", await File.ReadAllTextAsync(Path.Combine(bundle, "Assets", "data.xml")))
        Assert.False(File.Exists(Path.Combine(bundle, "Consumer.dbg")))
        Assert.Equal("symbols", await File.ReadAllTextAsync(Path.Combine(symbols, "Consumer.dbg")))
        Assert.Equal(0, (await RunProcessAsync(Path.Combine(bundle, "Consumer"))).ExitCode)
    }

    @Theory
    @InlineData(true, true, int32(0))
    @InlineData(true, false, int32(1))
    @InlineData(false, false, int32(2))
    async func InputRequiresCapabilityPreservesPayloadAndWaitsForAcknowledgement(
        enabled bool,
        accepted bool,
        exitCode int32
    ) {
        using let directory = TemporaryDirectory.Create()
        let pipeName = "goo-input-${Guid.NewGuid():N}"
        await WriteDescriptorAsync(directory.Path, pipeName, "goo.devtools/1")
        using let server = NamedPipeServerStream(
            pipeName,
            PipeDirection.InOut,
            1,
            PipeTransmissionMode.Byte,
            PipeOptions.Asynchronous
        )
        let cliTask = RunCliAsync(
            directory.Path,
            "input",
            "pointer.down",
            "--latest",
            "--node",
            "42",
            "--offset-x",
            "3.5",
            "--button",
            "Secondary",
            "--ctrl",
            "--json",
            "--wait",
            "5"
        )
        await server.WaitForConnectionAsync().WaitAsync(TimeSpan.FromSeconds(5))
        using let reader = StreamReader(server, leaveOpen: true)
        using let writer = StreamWriter(server, leaveOpen: true){AutoFlush = true, NewLine = "\n"}
        await ReadLineAsync(reader)
        await writer.WriteLineAsync(
            ServerHello(
                if enabled {
                    []string{"input", "input.gesture-lease"}
                } else {
                    System.Array.Empty[string]()
                }
            )
        )
        if enabled {
            using let request = JsonDocument.Parse(await ReadLineAsync(reader))
            Assert.Equal("input", request.RootElement.GetProperty("command").GetString())
            let payload = request.RootElement.GetProperty("payload")
            Assert.Equal("pointer.down", payload.GetProperty("event").GetString())
            Assert.Equal(int64(42), payload.GetProperty("nodeId").GetInt64())
            Assert.Equal(3.5, payload.GetProperty("offsetX").GetDouble())
            Assert.Equal("Secondary", payload.GetProperty("button").GetString())
            Assert.True(payload.GetProperty("modifiers").GetProperty("ctrl").GetBoolean())
            Assert.Equal(32, payload.GetProperty("gestureId").GetString()?.Length)
            Assert.False(cliTask.IsCompleted)
            await writer.WriteLineAsync(
                JsonSerializer.Serialize(
                    AnonymousType5_1DC372FD085A9802(
                        "response",
                        request.RootElement.GetProperty("id").GetString(),
                        accepted,
                        AnonymousType2_3AC728B68B618789(accepted, 12),
                        AnonymousType2_593C5D2EA4BD85D8("stale-target", "Target removed")
                    )
                )
            )
        }
        let result = await cliTask
        Assert.Equal(exitCode, result.ExitCode)
        Assert.Contains(
            if enabled {
                "\"sequence\":12"
            } else {
                "does not permit input"
            },
            if enabled {
                result.StandardOutput
            } else {
                result.StandardError
            },
            StringComparison.Ordinal
        )
        if enabled {
            Assert.Contains("[goo] gesture ", result.StandardError, StringComparison.Ordinal)
        }
    }

    @Fact
    async func InputCarriesOpaqueTargetWhenRuntimeAdvertisesHandles() {
        using let directory = TemporaryDirectory.Create()
        let pipeName = "goo-target-${Guid.NewGuid():N}"
        await WriteDescriptorAsync(directory.Path, pipeName, "goo.devtools/1")
        using let server = NamedPipeServerStream(
            pipeName,
            PipeDirection.InOut,
            1,
            PipeTransmissionMode.Byte,
            PipeOptions.Asynchronous
        )
        let cliTask = RunCliAsync(
            directory.Path,
            "input",
            "click",
            "--latest",
            "--target",
            "opaque-target",
            "--json",
            "--wait",
            "5"
        )
        await server.WaitForConnectionAsync().WaitAsync(TimeSpan.FromSeconds(5))
        using let reader = StreamReader(server, leaveOpen: true)
        using let writer = StreamWriter(server, leaveOpen: true){AutoFlush = true, NewLine = "\n"}
        await ReadLineAsync(reader)
        await writer.WriteLineAsync(ServerHello([]string{"input", "target.handles"}))
        using let request = JsonDocument.Parse(await ReadLineAsync(reader))
        Assert.Equal("opaque-target", request.RootElement.GetProperty("payload").GetProperty("target").GetString())
        await writer.WriteLineAsync(
            JsonSerializer.Serialize(
                AnonymousType4_5629F7C0266B588A(
                    "response",
                    request.RootElement.GetProperty("id").GetString(),
                    true,
                    AnonymousType2_3AC728B68B618789(true, 4)
                )
            )
        )
        Assert.Equal(0, (await cliTask).ExitCode)
    }

    @Fact
    async func AttachRejectsHandshakeForAnotherWindow() {
        using let directory = TemporaryDirectory.Create()
        let pipeName = "goo-identity-${Guid.NewGuid():N}"
        await WriteDescriptorAsync(directory.Path, pipeName, "goo.devtools/1")
        using let server = NamedPipeServerStream(
            pipeName,
            PipeDirection.InOut,
            1,
            PipeTransmissionMode.Byte,
            PipeOptions.Asynchronous
        )
        let cliTask = RunCliAsync(directory.Path, "attach", "--latest", "--once", "--json", "--wait", "5")
        await server.WaitForConnectionAsync().WaitAsync(TimeSpan.FromSeconds(5))
        using let reader = StreamReader(server, leaveOpen: true)
        using let writer = StreamWriter(server, leaveOpen: true){AutoFlush = true, NewLine = "\n"}
        await ReadLineAsync(reader)
        await writer.WriteLineAsync(ServerHello(windowId: "window-other"))
        let result = await cliTask
        Assert.Equal(2, result.ExitCode)
        Assert.Contains("descriptor PID/window identity", result.StandardError, StringComparison.Ordinal)
    }

    @Fact
    async func InteractiveAttachUsesRequestEnvelopeAndDrainsResponseAfterStdinEof() {
        using let directory = TemporaryDirectory.Create()
        let pipeName = "goo-interactive-${Guid.NewGuid():N}"
        await WriteDescriptorAsync(directory.Path, pipeName, "goo.devtools/1")
        using let server = NamedPipeServerStream(
            pipeName,
            PipeDirection.InOut,
            1,
            PipeTransmissionMode.Byte,
            PipeOptions.Asynchronous
        )
        let startInfo = ProcessStartInfo{
            FileName: "dotnet",
            WorkingDirectory: RepositoryRoot,
            UseShellExecute: false,
            RedirectStandardInput: true,
            RedirectStandardOutput: true,
            RedirectStandardError: true,
            CreateNoWindow: true
        }
        startInfo.ArgumentList.Add(Path.Combine(AppContext.BaseDirectory, "Goo.DevTools.Cli.dll"))
        for argument in[]string{"attach", "--latest", "--json"} {
            startInfo.ArgumentList.Add(argument)
        }
        startInfo.Environment["GOO_DEVTOOLS_DIR"] = directory.Path
        using let process = Process.Start(startInfo) ?? throw InvalidOperationException("Could not start Goo CLI.")
        let output = process.StandardOutput.ReadToEndAsync()
        let error = process.StandardError.ReadToEndAsync()
        await server.WaitForConnectionAsync().WaitAsync(TimeSpan.FromSeconds(5))
        using let reader = StreamReader(server, leaveOpen: true)
        using let writer = StreamWriter(server, leaveOpen: true){AutoFlush = true, NewLine = "\n"}
        await ReadLineAsync(reader)
        await writer.WriteLineAsync(ServerHello())
        await process.StandardInput.WriteLineAsync("snapshot")
        process.StandardInput.Close()
        using let request = JsonDocument.Parse(await ReadLineAsync(reader))
        Assert.Equal("request", request.RootElement.GetProperty("type").GetString())
        Assert.Equal("snapshot", request.RootElement.GetProperty("command").GetString())
        Assert.Equal(JsonValueKind.Object, request.RootElement.GetProperty("payload").ValueKind)
        let id = request.RootElement.GetProperty("id").GetString()
        await writer.WriteLineAsync(
            JsonSerializer.Serialize(
                AnonymousType4_B0D7325909AA1EF4("response", id, true, AnonymousType1_22B968AC90BF8ED6("snapshot"))
            )
        )
        await process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(5))
        Assert.Equal(0, process.ExitCode)
        Assert.Contains("\"id\":\"$id\"", await output, StringComparison.Ordinal)
        await error
    }

    @Fact
    async func RuntimeDescriptorShapeIsAcceptedOnlyForProtocolOne() {
        using let directory = TemporaryDirectory.Create()
        let descriptorPath = Path.Combine(directory.Path, "goo-test.json")
        let descriptor = AnonymousType8_25D3C919E47C198D(
            Environment.ProcessId,
            "goo-runtime-test",
            "goo.devtools/2",
            2,
            "named-pipe",
            "goo-test-protocol",
            DateTimeOffset.UtcNow.ToString("O"),
            []AnonymousType2_201BC1CDBC70C3E1{AnonymousType2_201BC1CDBC70C3E1("window-1", "Runtime window")}
        )
        await File.WriteAllTextAsync(descriptorPath, JsonSerializer.Serialize(descriptor))
        let rejected = await RunCliAsync(
            directory.Path,
            "doctor",
            "--json",
            "--project",
            "tools/Goo.DevTools.Cli/Goo.DevTools.Cli.gsproj"
        )
        let rejectedEndpoint = EndpointCheck(rejected.StandardOutput)
        Assert.False(rejectedEndpoint)
        let accepted = AnonymousType8_25D3C919E47C198D(
            Environment.ProcessId,
            "goo-runtime-test",
            "goo.devtools/1",
            1,
            "named-pipe",
            "goo-test-protocol",
            DateTimeOffset.UtcNow.ToString("O"),
            []AnonymousType2_201BC1CDBC70C3E1{AnonymousType2_201BC1CDBC70C3E1("window-1", "Runtime window")}
        )
        await File.WriteAllTextAsync(
            descriptorPath,
            JsonSerializer.Serialize(
                AnonymousType8_25D3C919E47C198D(
                    accepted.pid,
                    accepted.process,
                    accepted.protocol,
                    2,
                    accepted.transport,
                    accepted.pipe,
                    accepted.createdUtc,
                    accepted.windows
                )
            )
        )
        let rejectedVersion = await RunCliAsync(
            directory.Path,
            "doctor",
            "--json",
            "--project",
            "tools/Goo.DevTools.Cli/Goo.DevTools.Cli.gsproj"
        )
        Assert.False(EndpointCheck(rejectedVersion.StandardOutput))
        await File.WriteAllTextAsync(descriptorPath, JsonSerializer.Serialize(accepted))
        let result = await RunCliAsync(
            directory.Path,
            "doctor",
            "--json",
            "--project",
            "tools/Goo.DevTools.Cli/Goo.DevTools.Cli.gsproj"
        )
        Assert.True(EndpointCheck(result.StandardOutput))
        Assert.Contains("Runtime window", result.StandardOutput, StringComparison.Ordinal)
    }

    @Theory
    @InlineData(true)
    @InlineData(false)
    async func AttachUsesRuntimeNamedPipeAndReportsRequestStatus(accepted bool) {
        using let directory = TemporaryDirectory.Create()
        let pipeName = "goo-test-${Guid.NewGuid():N}"
        await WriteDescriptorAsync(directory.Path, pipeName, "goo.devtools/1")
        using let server = NamedPipeServerStream(
            pipeName,
            PipeDirection.InOut,
            1,
            PipeTransmissionMode.Byte,
            PipeOptions.Asynchronous
        )
        let cliTask = RunCliAsync(
            directory.Path,
            "attach",
            "--latest",
            "--once",
            "--json",
            "--payload",
            "{\"full\":true}",
            "--wait",
            "5"
        )
        await server.WaitForConnectionAsync().WaitAsync(TimeSpan.FromSeconds(5))
        using let reader = StreamReader(server, leaveOpen: true)
        using let writer = StreamWriter(server, leaveOpen: true){AutoFlush = true, NewLine = "\n"}
        let hello = await ReadLineAsync(reader)
        using let helloDocument = JsonDocument.Parse(hello)
        Assert.Equal("hello", helloDocument.RootElement.GetProperty("type").GetString())
        Assert.Equal("goo.devtools/1", helloDocument.RootElement.GetProperty("protocol").GetString())
        await writer.WriteLineAsync(ServerHello([]string{"tree"}))
        let request = await ReadLineAsync(reader)
        using let requestDocument = JsonDocument.Parse(request)
        let id = requestDocument.RootElement.GetProperty("id").GetString()
        Assert.True(requestDocument.RootElement.GetProperty("payload").GetProperty("full").GetBoolean())
        await writer.WriteLineAsync(
            JsonSerializer.Serialize(
                AnonymousType4_51F108B6C3A8A17C(
                    "response",
                    id,
                    accepted,
                    AnonymousType2_E22102B556A9BF55("snapshot", true)
                )
            )
        )
        let result = await cliTask
        Assert.Equal(
            if accepted {
                0
            } else {
                1
            },
            result.ExitCode
        )
        Assert.Contains("\"command\":\"snapshot\"", result.StandardOutput, StringComparison.Ordinal)
    }

    @Theory
    @InlineData(true, int32(0))
    @InlineData(false, int32(2))
    async func AttachGuardsTypedMutationOnSameConnectionBeforeDispatch(supported bool, exitCode int32) {
        using let directory = TemporaryDirectory.Create()
        let pipeName = "goo-guard-${Guid.NewGuid():N}"
        await WriteDescriptorAsync(directory.Path, pipeName, "goo.devtools/1")
        using let server = NamedPipeServerStream(
            pipeName,
            PipeDirection.InOut,
            1,
            PipeTransmissionMode.Byte,
            PipeOptions.Asynchronous
        )
        let cliTask = RunCliAsync(
            directory.Path,
            "attach",
            "--latest",
            "--once",
            "--json",
            "--command",
            "property.override",
            "--payload",
            "{\"target\":\"opaque\",\"property\":\"BackgroundColor\",\"value\":\"#fff\"}",
            "--require-capabilities",
            "runtime-overrides,runtime-overrides.describe,target.handles",
            "--require-override-property",
            "BackgroundColor",
            "--wait",
            "5"
        )
        await server.WaitForConnectionAsync().WaitAsync(TimeSpan.FromSeconds(5))
        using let reader = StreamReader(server, leaveOpen: true)
        using let writer = StreamWriter(server, leaveOpen: true){AutoFlush = true, NewLine = "\n"}
        await ReadLineAsync(reader)
        await writer.WriteLineAsync(
            ServerHello(
                if supported {
                    []string{"runtime-overrides", "runtime-overrides.describe", "target.handles"}
                } else {
                    []string{"runtime-overrides"}
                },
                overrideProperties: if supported {
                    []string{"BackgroundColor"}
                } else {
                    default([]?string)
                }
            )
        )
        if supported {
            using let request = JsonDocument.Parse(await ReadLineAsync(reader))
            Assert.Equal("property.override", request.RootElement.GetProperty("command").GetString())
            await writer.WriteLineAsync(
                JsonSerializer.Serialize(
                    AnonymousType4_677036C12B72860F(
                        "response",
                        request.RootElement.GetProperty("id").GetString(),
                        true,
                        AnonymousType1_AFA5B483187AD27A("BackgroundColor")
                    )
                )
            )
        }
        let result = await cliTask
        Assert.Equal(exitCode, result.ExitCode)
        if !supported {
            Assert.Contains("No request was sent", result.StandardError, StringComparison.Ordinal)
            Assert.Null(await reader.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(5)))
        }
    }

    @Fact
    async func ListedWindowIdsSelectSameTitleWindowsInOneProcess() {
        using let directory = TemporaryDirectory.Create()
        let pipeName = "goo-list-${Guid.NewGuid():N}"
        await WriteDescriptorAsync(
            directory.Path,
            pipeName + "-one",
            "goo.devtools/1",
            fileName: "one.json",
            windowId: "window-one"
        )
        await WriteDescriptorAsync(
            directory.Path,
            pipeName,
            "goo.devtools/1",
            fileName: "two.json",
            windowId: "window-two"
        )
        await File.WriteAllTextAsync(Path.Combine(directory.Path, "malformed.json"), "{")
        let listed = await RunCliAsync(directory.Path, "list", "--pid", Environment.ProcessId.ToString(), "--json")
        Assert.Equal(0, listed.ExitCode)
        using let listing = JsonDocument.Parse(listed.StandardOutput)
        let targets = listing.RootElement.GetProperty("targets")
        Assert.Equal(2, targets.GetArrayLength())
        Assert.Contains(
            targets.EnumerateArray(),
            (target JsonElement) -> target.GetProperty("window").GetString() == "window-two"
        )
        using let server = NamedPipeServerStream(
            pipeName,
            PipeDirection.InOut,
            1,
            PipeTransmissionMode.Byte,
            PipeOptions.Asynchronous
        )
        let attached = RunCliAsync(
            directory.Path,
            "attach",
            "--pid",
            Environment.ProcessId.ToString(),
            "--window",
            "window-two",
            "--once",
            "--json",
            "--wait",
            "5"
        )
        await server.WaitForConnectionAsync().WaitAsync(TimeSpan.FromSeconds(5))
        using let reader = StreamReader(server, leaveOpen: true)
        using let writer = StreamWriter(server, leaveOpen: true){AutoFlush = true, NewLine = "\n"}
        await ReadLineAsync(reader)
        await writer.WriteLineAsync(ServerHello(windowId: "window-two"))
        using let request = JsonDocument.Parse(await ReadLineAsync(reader))
        await writer.WriteLineAsync(
            JsonSerializer.Serialize(
                AnonymousType3_EC6A7E929433E771("response", request.RootElement.GetProperty("id").GetString(), true)
            )
        )
        Assert.Equal(0, (await attached).ExitCode)
    }

    @Fact
    async func OneShotAttachTimesOutWhenEndpointDoesNotSendHello() {
        using let directory = TemporaryDirectory.Create()
        let pipeName = "goo-timeout-${Guid.NewGuid():N}"
        await WriteDescriptorAsync(directory.Path, pipeName, "goo.devtools/1")
        using let server = NamedPipeServerStream(
            pipeName,
            PipeDirection.InOut,
            1,
            PipeTransmissionMode.Byte,
            PipeOptions.Asynchronous
        )
        let attached = RunCliAsync(directory.Path, "attach", "--latest", "--once", "--wait", "1")
        await server.WaitForConnectionAsync().WaitAsync(TimeSpan.FromSeconds(5))
        let result = await attached.WaitAsync(TimeSpan.FromSeconds(5))
        Assert.NotEqual(0, result.ExitCode)
        Assert.Contains("handshake", result.StandardError)
    }

    @Fact
    async func AttachReportsAmbiguousWindowsForPidImmediately() {
        using let directory = TemporaryDirectory.Create()
        let processId = Environment.ProcessId
        await WriteDescriptorAsync(
            directory.Path,
            "goo-test-${Guid.NewGuid():N}-one",
            "goo.devtools/1",
            fileName: "one.json",
            processId: processId
        )
        await WriteDescriptorAsync(
            directory.Path,
            "goo-test-${Guid.NewGuid():N}-two",
            "goo.devtools/1",
            fileName: "two.json",
            processId: processId
        )
        let result = await RunCliAsync(directory.Path, "attach", "--pid", processId.ToString(), "--wait", "30")
        Assert.Equal(2, result.ExitCode)
        Assert.Contains("More than one live Goo endpoint matches", result.StandardError, StringComparison.Ordinal)
    }

    @Fact
    async func CaptureEndpointErrorReturnsFailureAndMessage() {
        using let directory = TemporaryDirectory.Create()
        let pipeName = "goo-test-${Guid.NewGuid():N}"
        await WriteDescriptorAsync(directory.Path, pipeName, "goo.devtools/1")
        using let server = NamedPipeServerStream(
            pipeName,
            PipeDirection.InOut,
            1,
            PipeTransmissionMode.Byte,
            PipeOptions.Asynchronous
        )
        let cliTask = RunCliAsync(directory.Path, "capture", "--latest", "--wait", "5")
        await server.WaitForConnectionAsync().WaitAsync(TimeSpan.FromSeconds(5))
        using let reader = StreamReader(server, leaveOpen: true)
        using let writer = StreamWriter(server, leaveOpen: true){AutoFlush = true, NewLine = "\n"}
        await ReadLineAsync(reader)
        await writer.WriteLineAsync(ServerHello())
        let request = await ReadLineAsync(reader)
        using let requestDocument = JsonDocument.Parse(request)
        let id = requestDocument.RootElement.GetProperty("id").GetString()
        await writer.WriteLineAsync(
            JsonSerializer.Serialize(
                AnonymousType3_988218B2584CB020("error", id, AnonymousType1_1E660638B0A8D72D("capture unavailable"))
            )
        )
        let result = await cliTask
        Assert.Equal(2, result.ExitCode)
        Assert.Contains("capture unavailable", result.StandardError, StringComparison.Ordinal)
    }

    @Fact
    async func CapturePollsPendingAndWritesPng() {
        using let directory = TemporaryDirectory.Create()
        let pipeName = "goo-test-${Guid.NewGuid():N}"
        await WriteDescriptorAsync(directory.Path, pipeName, "goo.devtools/1")
        let outputPath = Path.Combine(directory.Path, "frame.png")
        using let server = NamedPipeServerStream(
            pipeName,
            PipeDirection.InOut,
            1,
            PipeTransmissionMode.Byte,
            PipeOptions.Asynchronous
        )
        let cliTask = RunCliAsync(directory.Path, "capture", "--latest", "--output", outputPath, "--wait", "5")
        await server.WaitForConnectionAsync().WaitAsync(TimeSpan.FromSeconds(5))
        using let reader = StreamReader(server, leaveOpen: true)
        using let writer = StreamWriter(server, leaveOpen: true){AutoFlush = true, NewLine = "\n"}
        await ReadLineAsync(reader)
        await writer.WriteLineAsync(ServerHello())
        let firstRequest = await ReadLineAsync(reader)
        using let firstDocument = JsonDocument.Parse(firstRequest)
        let firstId = firstDocument.RootElement.GetProperty("id").GetString()
        await writer.WriteLineAsync(
            JsonSerializer.Serialize(
                AnonymousType3_ACA5E70364E84275("response", firstId, AnonymousType2_E043A355B1773A9A("capture", true))
            )
        )
        let secondRequest = await ReadLineAsync(reader)
        using let secondDocument = JsonDocument.Parse(secondRequest)
        let secondId = secondDocument.RootElement.GetProperty("id").GetString()
        Assert.NotEqual(firstId, secondId)
        Assert.Equal("capture", secondDocument.RootElement.GetProperty("command").GetString())
        let rgba = Convert.ToBase64String(
            []uint8{uint8(255), uint8(0), uint8(0), uint8(255), uint8(32), uint8(16), uint8(8), uint8(128)}
        )
        await writer.WriteLineAsync(
            JsonSerializer.Serialize(
                AnonymousType3_7B4ADF8637F8B346(
                    "response",
                    secondId,
                    AnonymousType7_4179EE9C6B001B59("capture", false, "rgba8-srgb-premultiplied", 2, 1, 8, rgba)
                )
            )
        )
        let result = await cliTask
        Assert.Equal(0, result.ExitCode)
        let png = await File.ReadAllBytesAsync(outputPath)
        Assert.Equal(
            []uint8{uint8(137), uint8(80), uint8(78), uint8(71), uint8(13), uint8(10), uint8(26), uint8(10)},
            png[.. 8]
        )
        Assert.Equal(2, BinaryPrimitives.ReadInt32BigEndian(png.AsSpan(16, 4)))
        Assert.Equal(1, BinaryPrimitives.ReadInt32BigEndian(png.AsSpan(20, 4)))
        let scanline = ReadPngImageData(png)
        Assert.Equal(0, int32(scanline[0]))
        Assert.Equal(
            []uint8{uint8(255), uint8(0), uint8(0), uint8(255), uint8(64), uint8(32), uint8(16), uint8(128)},
            scanline[1 ..]
        )
    }

    @Fact
    async func CapturePendingHonorsWaitBudgetWithoutWritingImage() {
        using let directory = TemporaryDirectory.Create()
        let pipeName = "goo-test-${Guid.NewGuid():N}"
        await WriteDescriptorAsync(directory.Path, pipeName, "goo.devtools/1")
        let outputPath = Path.Combine(directory.Path, "frame.png")
        using let server = NamedPipeServerStream(
            pipeName,
            PipeDirection.InOut,
            1,
            PipeTransmissionMode.Byte,
            PipeOptions.Asynchronous
        )
        let cliTask = RunCliAsync(directory.Path, "capture", "--latest", "--output", outputPath, "--wait", "1")
        await server.WaitForConnectionAsync().WaitAsync(TimeSpan.FromSeconds(5))
        using let reader = StreamReader(server, leaveOpen: true)
        let writer = StreamWriter(server, leaveOpen: true){AutoFlush = true, NewLine = "\n"}
        var requests = 0
        try {
            await ReadLineAsync(reader)
            await writer.WriteLineAsync(ServerHello())
            while await reader.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(5)) is {} request {
                using let document = JsonDocument.Parse(request)
                await writer.WriteLineAsync(
                    JsonSerializer.Serialize(
                        AnonymousType3_ACA5E70364E84275(
                            "response",
                            document.RootElement.GetProperty("id").GetString(),
                            AnonymousType2_E043A355B1773A9A("capture", true)
                        )
                    )
                )
                requests++
            }
        } catch (IOException) { } finally {
            try {
                writer.Dispose()
            } catch (IOException) { }
        }
        let result = await cliTask
        Assert.True(requests > 1)
        Assert.Equal(2, result.ExitCode)
        Assert.Contains("wait expired", result.StandardError, StringComparison.Ordinal)
        Assert.False(File.Exists(outputPath))
    }

    @Fact
    func InspectorUsesStandaloneAppOutputAndExpectedAttachArguments() {
        let candidates = InspectorLauncher.Candidates(RepositoryRoot)
        let releaseExecutable = Path.Combine(
            RepositoryRoot,
            "apps",
            "Goo.DevTools",
            "bin",
            "Release",
            "net10.0",
            "Goo.DevTools"
        )
        Assert.Contains(releaseExecutable, candidates)
        Assert.DoesNotContain(
            candidates,
            (item string) -> item.Contains(Path.Combine("tools", "Goo.DevTools.App"), StringComparison.Ordinal)
        )
        using let metadata = JsonDocument.Parse("{}")
        let descriptor = DiscoveryDescriptor(
            "descriptor.json",
            "goo.devtools/1",
            1234,
            "Goo",
            "goo-1234-1",
            "named-pipe",
            nil,
            nil,
            nil,
            metadata.RootElement.Clone()
        )
        let start = InspectorLauncher.CreateStartInfo("goo-devtools", descriptor, true)
        Assert.Equal(
            Collection[string]{"--attach", "--pipe", "goo-1234-1", "--pid", "1234", "--focus"},
            start.ArgumentList
        )
    }

    @Fact
    func WatchInspectorSelectionUsesLatestNewDescriptorInRuntimeDirectory() {
        using let directory = TemporaryDirectory.Create()
        using let metadata = JsonDocument.Parse("{}")
        let launchStartedAt = DateTimeOffset.UtcNow
        let oldPath = Path.Combine(directory.Path, "old.json")
        let newPath = Path.Combine(directory.Path, "new.json")
        let unrelatedPath = Path.Combine(directory.Path, "nested", "unrelated.json")
        let old = DiscoveryDescriptor(
            oldPath,
            "goo.devtools/1",
            1111,
            "old",
            "goo-old",
            "named-pipe",
            nil,
            "Old",
            launchStartedAt.AddMinutes(-1),
            metadata.RootElement.Clone()
        )
        let current = DiscoveryDescriptor(
            newPath,
            "goo.devtools/1",
            2222,
            "current",
            "goo-current",
            "named-pipe",
            nil,
            "Current",
            launchStartedAt.AddMilliseconds(1.0),
            metadata.RootElement.Clone()
        )
        let unrelated = DiscoveryDescriptor(
            unrelatedPath,
            "goo.devtools/1",
            3333,
            "unrelated",
            "goo-unrelated",
            "named-pipe",
            nil,
            "Unrelated",
            launchStartedAt.AddMinutes(1.0),
            metadata.RootElement.Clone()
        )
        let selected = CliApplication.SelectInspectorDescriptor(
            []DiscoveryDescriptor{old, current, unrelated},
            9999,
            true,
            directory.Path,
            HashSet[string]([]string{oldPath}, StringComparer.OrdinalIgnoreCase),
            launchStartedAt
        )
        Assert.NotNull(selected)
        Assert.Equal("goo-current", selected!!.Pipe)
        Assert.NotEqual(9999, selected!!.ProcessId)
    }

    @Fact
    async func NetworkTransportIsRejectedByLocalOnlyClient() {
        using let directory = TemporaryDirectory.Create()
        let descriptor = AnonymousType8_25D3C919E47C198D(
            Environment.ProcessId,
            "goo-runtime-test",
            "goo.devtools/1",
            1,
            "network",
            "127.0.0.1:43999",
            DateTimeOffset.UtcNow.ToString("O"),
            []AnonymousType2_201BC1CDBC70C3E1{AnonymousType2_201BC1CDBC70C3E1("window-1", "Runtime window")}
        )
        await File.WriteAllTextAsync(
            Path.Combine(directory.Path, "goo-test.json"),
            JsonSerializer.Serialize(descriptor)
        )
        let result = await RunCliAsync(directory.Path, "attach", "--latest", "--once", "--wait", "0.1")
        Assert.Equal(2, result.ExitCode)
        Assert.Contains("unsupported transport", result.StandardError, StringComparison.OrdinalIgnoreCase)
    }

    @Fact
    async func DotnetWatchOutputReportsRestartRequiredEdits() {
        if OperatingSystem.IsWindows() {
            return
        }
        using let directory = TemporaryDirectory.Create()
        let result = await RunCliAsync(
            directory.Path,
            "dev",
            "--no-watch",
            "--",
            "/bin/sh",
            "-c",
            "printf 'hot reload requires restart\\n'"
        )
        Assert.Equal(0, result.ExitCode)
        Assert.Contains("hot reload requires restart", result.StandardError, StringComparison.OrdinalIgnoreCase)
    }

    @Fact
    async func DevRejectsLauncherOptionsBeforeSpawnAndPreservesTrailingArguments() {
        if !OperatingSystem.IsLinux() {
            return
        }
        using let directory = TemporaryDirectory.Create()
        let marker = Path.Combine(directory.Path, "started")
        let child = Path.Combine(directory.Path, "child.sh")
        await File.WriteAllTextAsync(child, (`#!/bin/sh
printf 'input=%s\n' "$GOO_DEVTOOLS_INPUT"
printf 'arg=%s\n' "$@"
touch ` + "$marker" + `
`))
        File.SetUnixFileMode(child, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute)
        let environment = Dictionary[string, string]{
            ["GOO_DEVTOOLS_DIR"] = directory.Path,
            ["GOO_DEVTOOLS_INPUT"] = "1"
        }
        for invalid in[]string{"--input=false", "--unknown", "--wait=NaN", "--wait=Infinity", "--watch --no-watch"} {
            let options = invalid.Split(' ')
            let rejected = await RunProcessAsync(
                "dotnet",
                []string{
                    Path.Combine(AppContext.BaseDirectory, "Goo.DevTools.Cli.dll"),
                    "dev",
                    ...options,
                    "--",
                    child
                },
                environment
            )
            Assert.NotEqual(0, rejected.ExitCode)
            Assert.False(File.Exists(marker))
        }
        let forwarded = await RunProcessAsync(
            "dotnet",
            []string{
                Path.Combine(AppContext.BaseDirectory, "Goo.DevTools.Cli.dll"),
                "dev",
                "--no-watch",
                "--",
                child,
                "--input=false",
                "--unknown=child"
            },
            environment
        )
        Assert.Equal(0, forwarded.ExitCode)
        Assert.Contains("arg=--input=false", forwarded.StandardOutput, StringComparison.Ordinal)
        Assert.Contains("arg=--unknown=child", forwarded.StandardOutput, StringComparison.Ordinal)
    }

    @Fact
    async func DevSignalCancellationStopsOnlyItsOwnedProcessTree() {
        if !OperatingSystem.IsLinux() {
            return
        }
        using let directory = TemporaryDirectory.Create()
        let identities = Path.Combine(directory.Path, "owned")
        let script = Path.Combine(directory.Path, "owned.sh")
        await File.WriteAllTextAsync(script, (`#!/bin/sh
trap '' TERM INT
sleep 120 &
echo "$$ $!" > ` + "$identities" + `
wait
`))
        File.SetUnixFileMode(script, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute)
        using let sentinel = Process.Start("sleep", "120") ??
            throw InvalidOperationException("Could not start sentinel.")
        let startInfo = ProcessStartInfo{
            FileName: "dotnet",
            WorkingDirectory: RepositoryRoot,
            UseShellExecute: false,
            RedirectStandardOutput: true,
            RedirectStandardError: true,
            CreateNoWindow: true
        }
        for argument in[]string{
            Path.Combine(AppContext.BaseDirectory, "Goo.DevTools.Cli.dll"),
            "dev",
            "--no-watch",
            "--project",
            directory.Path,
            "--",
            script
        } {
            startInfo.ArgumentList.Add(argument)
        }
        using let launcher = Process.Start(startInfo) ?? throw InvalidOperationException("Could not start Goo CLI.")
        let output = launcher.StandardOutput.ReadToEndAsync()
        let error = launcher.StandardError.ReadToEndAsync()
        try {
            await WaitForAsync(() -> File.Exists(identities), TimeSpan.FromSeconds(10))
            let owned = (await File.ReadAllTextAsync(identities))
                .Split(' ', StringSplitOptions.RemoveEmptyEntries)
                .Select(int32.Parse)
                .ToArray()
            Assert.All(owned, (processId int32) -> Assert.True(IsRunning(processId)))
            let signal = Process.Start("/bin/kill", "-TERM ${launcher.Id}") ??
                throw InvalidOperationException("Could not signal Goo CLI.")
            await signal.WaitForExitAsync()
            await launcher.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(10))
            await WaitForAsync(() -> owned.All((processId int32) -> !IsRunning(processId)), TimeSpan.FromSeconds(3))
            Assert.False(sentinel.HasExited)
            Assert.Equal(130, launcher.ExitCode)
        } finally {
            if !launcher.HasExited {
                launcher.Kill(true)
            }
            if !sentinel.HasExited {
                sentinel.Kill()
            }
            await Task.WhenAll(output, error)
        }
    }

    private data class ProcessResult(ExitCode int32, StandardOutput string, StandardError string) : IEquatable[
        ProcessResult
    ] { }

    private class TemporaryDirectory : IDisposable {
        private init(path string) {
            Path = path
        }

        prop Path string {
            get;
        }

        func Dispose() {
            if Directory.Exists(Path) {
                Directory.Delete(Path, true)
            }
        }

        shared {
            func Create() TemporaryDirectory {
                let path = Path.Combine(Path.GetTempPath(), "goo-devtools-tests-${Guid.NewGuid():N}")
                Directory.CreateDirectory(path)
                return TemporaryDirectory(path)
            }
        }
    }

    shared {
        private prop RepositoryRoot string {
            get {
                var directory DirectoryInfo? = DirectoryInfo(AppContext.BaseDirectory)
                while directory != nil {
                    if File.Exists(Path.Combine(directory.FullName, "LICENSE")) && Path.Exists(
                        Path.Combine(directory.FullName, ".git")
                    ) {
                        return directory.FullName
                    }
                    directory = directory.Parent
                }
                throw InvalidOperationException("Could not locate the repository root.")
            }
        }

        private async func WriteDescriptorAsync(
            directory string,
            pipeName string,
            protocol string,
            transport string = "named-pipe",
            fileName string? = nil,
            processId int32? = nil,
            windowId string = "window-1"
        ) {
            let descriptor = AnonymousType8_25D3C919E47C198D(
                processId ?? Environment.ProcessId,
                "goo-runtime-test",
                protocol,
                1,
                transport,
                pipeName,
                DateTimeOffset.UtcNow.ToString("O"),
                []AnonymousType2_201BC1CDBC70C3E1{AnonymousType2_201BC1CDBC70C3E1(windowId, "Runtime window")}
            )
            await File.WriteAllTextAsync(
                Path.Combine(directory, fileName ?? "goo-test.json"),
                JsonSerializer.Serialize(descriptor)
            )
        }

        private func ServerHello(
            capabilities[]?string = nil,
            processId int32? = nil,
            windowId string = "window-1",
            overrideProperties[]?string = nil
        ) string -> JsonSerializer
            .Serialize(
            AnonymousType7_588889BB631FE381(
                "hello",
                "goo.devtools/1",
                processId ?? Environment.ProcessId,
                windowId,
                "test-session",
                capabilities ?? System.Array.Empty[string](),
                overrideProperties
            )
        )

        private func EndpointCheck(output string) bool {
            using let document = JsonDocument.Parse(output)
            for check in document.RootElement.GetProperty("checks").EnumerateArray() {
                if check.GetProperty("name").GetString() == "endpoint" {
                    return check.GetProperty("ok").GetBoolean()
                }
            }
            throw InvalidOperationException("The doctor response did not contain an endpoint check.")
        }

        private async func ReadLineAsync(reader StreamReader) string ->
            await reader.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(5)) ??
                throw InvalidOperationException("The protocol server closed before returning a line.")

        private func IsRunning(processId int32) bool {
            let path = "/proc/$processId/stat"
            if !File.Exists(path) {
                return false
            }
            let value = File.ReadAllText(path)
            let separator = value.IndexOf(") ", StringComparison.Ordinal)
            return separator >= 0 && value[separator + 2] != 'Z'
        }

        private async func WaitForAsync(condition() -> bool, timeout TimeSpan) {
            let started = Stopwatch.GetTimestamp()
            while !condition() {
                if Stopwatch.GetElapsedTime(started) >= timeout {
                    throw TimeoutException("The expected process state did not arrive.")
                }
                await Task.Delay(25)
            }
        }

        private func ReadPngImageData(png[]uint8)[]uint8 {
            using let compressed = MemoryStream()
            var offset = 8
            while offset < png.Length {
                let length = checked(int32(BinaryPrimitives.ReadUInt32BigEndian(png.AsSpan(offset, 4))))
                let type = Encoding.ASCII.GetString(png, offset + 4, 4)
                if type == "IDAT" {
                    compressed.Write(png, offset + 8, length)
                }
                offset = checked(offset + 12 + length)
                if type == "IEND" {
                    break
                }
            }
            compressed.Position = 0
            using let zlib = ZLibStream(compressed, CompressionMode.Decompress)
            using let pixels = MemoryStream()
            zlib.CopyTo(pixels)
            return pixels.ToArray()
        }

        private async func RunCliAsync(descriptorDirectory string, arguments ...string) ProcessResult ->
            await RunProcessAsync(
                "dotnet",
                []string{Path.Combine(AppContext.BaseDirectory, "Goo.DevTools.Cli.dll"), ...arguments},
                Dictionary[string, string]{["GOO_DEVTOOLS_DIR"] = descriptorDirectory}
            )

        private async func RunProcessAsync(fileName string, arguments ...string) ProcessResult ->
            await RunProcessAsync(fileName, arguments, nil)

        private async func RunProcessAsync(
            fileName string,
            arguments IReadOnlyList[string],
            environment IReadOnlyDictionary[string, string]?
        ) ProcessResult {
            let startInfo = ProcessStartInfo{
                FileName: fileName,
                WorkingDirectory: RepositoryRoot,
                UseShellExecute: false,
                RedirectStandardOutput: true,
                RedirectStandardError: true,
                CreateNoWindow: true
            }
            for argument in arguments {
                startInfo.ArgumentList.Add(argument)
            }
            if environment != nil {
                for pair in environment {
                    startInfo.Environment[pair.Key] = pair.Value
                }
            }
            using let process = Process.Start(startInfo) ??
                throw InvalidOperationException("Could not start $fileName.")
            let outputTask = process.StandardOutput.ReadToEndAsync()
            let errorTask = process.StandardError.ReadToEndAsync()
            await process.WaitForExitAsync().WaitAsync(TimeSpan.FromMinutes(2))
            return ProcessResult(process.ExitCode, await outputTask, await errorTask)
        }
    }
}

internal data class AnonymousType2_3AC728B68B618789(applied bool, $sequence int32) { }

internal data class AnonymousType2_593C5D2EA4BD85D8(code string, message string) { }

internal data class AnonymousType5_1DC372FD085A9802(
    type string,
    id string?,
    ok bool,
    payload AnonymousType2_3AC728B68B618789,
    error AnonymousType2_593C5D2EA4BD85D8
) { }

internal data class AnonymousType4_5629F7C0266B588A(
    type string,
    id string?,
    ok bool,
    payload AnonymousType2_3AC728B68B618789
) { }

internal data class AnonymousType1_22B968AC90BF8ED6(command string) { }

internal data class AnonymousType4_B0D7325909AA1EF4(
    type string,
    id string?,
    ok bool,
    payload AnonymousType1_22B968AC90BF8ED6
) { }

internal data class AnonymousType2_201BC1CDBC70C3E1(id string, title string) { }

internal data class AnonymousType8_25D3C919E47C198D(
    pid int32,
    process string,
    protocol string,
    version int32,
    transport string,
    pipe string,
    createdUtc string,
    windows[]AnonymousType2_201BC1CDBC70C3E1?
) { }

internal data class AnonymousType2_E22102B556A9BF55(command string, ok bool) { }

internal data class AnonymousType4_51F108B6C3A8A17C(
    type string,
    id string?,
    ok bool,
    payload AnonymousType2_E22102B556A9BF55
) { }

internal data class AnonymousType1_AFA5B483187AD27A(property string) { }

internal data class AnonymousType4_677036C12B72860F(
    type string,
    id string?,
    ok bool,
    payload AnonymousType1_AFA5B483187AD27A
) { }

internal data class AnonymousType3_EC6A7E929433E771(type string, id string?, ok bool) { }

internal data class AnonymousType1_1E660638B0A8D72D(message string) { }

internal data class AnonymousType3_988218B2584CB020(
    type string,
    id string?,
    payload AnonymousType1_1E660638B0A8D72D
) { }

internal data class AnonymousType2_E043A355B1773A9A(command string, pending bool) { }

internal data class AnonymousType3_ACA5E70364E84275(
    type string,
    id string?,
    payload AnonymousType2_E043A355B1773A9A
) { }

internal data class AnonymousType7_4179EE9C6B001B59(
    command string,
    pending bool,
    format string,
    width int32,
    height int32,
    stride int32,
    rgbaBase64 string
) { }

internal data class AnonymousType3_7B4ADF8637F8B346(
    type string,
    id string?,
    payload AnonymousType7_4179EE9C6B001B59
) { }

internal data class AnonymousType7_588889BB631FE381(
    type string,
    protocol string,
    pid int32,
    windowId string,
    sessionId string,
    capabilities[]string?,
    runtimeOverrideProperties[]?string?
) { }
