using System.Diagnostics;
using System.Buffers.Binary;
using System.IO.Pipes;
using System.IO.Compression;
using System.Text.Json;
using System.Text;
using Goo.DevTools.Cli;
using Xunit;

namespace Goo.DevTools.Cli.Tests;

public sealed class DevToolsCliEndToEndTests
{
    [Fact]
    public async Task RuntimeDescriptorShapeIsAcceptedOnlyForProtocolOne()
    {
        using var directory = TemporaryDirectory.Create();
        var descriptorPath = Path.Combine(directory.Path, "goo-test.json");
        var descriptor = new
        {
            pid = Environment.ProcessId,
            process = "goo-runtime-test",
            protocol = "goo.devtools/2",
            version = 2,
            transport = "named-pipe",
            pipe = "goo-test-protocol",
            createdUtc = DateTimeOffset.UtcNow.ToString("O"),
            windows = new[] { new { id = "window-1", title = "Runtime window" } }
        };
        await File.WriteAllTextAsync(descriptorPath, JsonSerializer.Serialize(descriptor));

        var rejected = await RunCliAsync(directory.Path, "doctor", "--json", "--project", "tools/Goo.DevTools.Cli/Goo.DevTools.Cli.csproj");
        var rejectedEndpoint = EndpointCheck(rejected.StandardOutput);
        Assert.False(rejectedEndpoint);

        var accepted = new
        {
            pid = Environment.ProcessId,
            process = "goo-runtime-test",
            protocol = "goo.devtools/1",
            version = 1,
            transport = "named-pipe",
            pipe = "goo-test-protocol",
            createdUtc = DateTimeOffset.UtcNow.ToString("O"),
            windows = new[] { new { id = "window-1", title = "Runtime window" } }
        };
        await File.WriteAllTextAsync(descriptorPath, JsonSerializer.Serialize(new
        {
            pid = accepted.pid,
            process = accepted.process,
            protocol = accepted.protocol,
            version = 2,
            transport = accepted.transport,
            pipe = accepted.pipe,
            createdUtc = accepted.createdUtc,
            windows = accepted.windows
        }));
        var rejectedVersion = await RunCliAsync(directory.Path, "doctor", "--json", "--project", "tools/Goo.DevTools.Cli/Goo.DevTools.Cli.csproj");
        Assert.False(EndpointCheck(rejectedVersion.StandardOutput));
        await File.WriteAllTextAsync(descriptorPath, JsonSerializer.Serialize(accepted));
        var result = await RunCliAsync(directory.Path, "doctor", "--json", "--project", "tools/Goo.DevTools.Cli/Goo.DevTools.Cli.csproj");
        Assert.True(EndpointCheck(result.StandardOutput));
        Assert.Contains("Runtime window", result.StandardOutput, StringComparison.Ordinal);
    }

    [Fact]
    public async Task AttachUsesRuntimeNamedPipeAndPreservesJsonLines()
    {
        using var directory = TemporaryDirectory.Create();
        var pipeName = $"goo-test-{Guid.NewGuid():N}";
        await WriteDescriptorAsync(directory.Path, pipeName, "goo.devtools/1");
        using var server = new NamedPipeServerStream(pipeName, PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous);
        var cliTask = RunCliAsync(directory.Path, "attach", "--latest", "--once", "--json", "--wait", "5");
        await server.WaitForConnectionAsync().WaitAsync(TimeSpan.FromSeconds(5));
        using var reader = new StreamReader(server, leaveOpen: true);
        using var writer = new StreamWriter(server, leaveOpen: true) { AutoFlush = true, NewLine = "\n" };
        var hello = await ReadLineAsync(reader);
        using var helloDocument = JsonDocument.Parse(hello);
        Assert.Equal("hello", helloDocument.RootElement.GetProperty("type").GetString());
        Assert.Equal("goo.devtools/1", helloDocument.RootElement.GetProperty("protocol").GetString());
        await writer.WriteLineAsync("{\"type\":\"hello\",\"protocol\":\"goo.devtools/1\",\"capabilities\":[\"tree\"]}");
        var request = await ReadLineAsync(reader);
        using var requestDocument = JsonDocument.Parse(request);
        var id = requestDocument.RootElement.GetProperty("id").GetString();
        await writer.WriteLineAsync(JsonSerializer.Serialize(new
        {
            type = "response",
            id,
            payload = new { command = "snapshot", ok = true }
        }));
        var result = await cliTask;
        Assert.Equal(0, result.ExitCode);
        Assert.Contains("\"command\":\"snapshot\"", result.StandardOutput, StringComparison.Ordinal);
    }

    [Fact]
    public async Task AttachReportsAmbiguousWindowsForPidImmediately()
    {
        using var directory = TemporaryDirectory.Create();
        var processId = Environment.ProcessId;
        await WriteDescriptorAsync(directory.Path, $"goo-test-{Guid.NewGuid():N}-one", "goo.devtools/1", fileName: "one.json", processId: processId);
        await WriteDescriptorAsync(directory.Path, $"goo-test-{Guid.NewGuid():N}-two", "goo.devtools/1", fileName: "two.json", processId: processId);

        var result = await RunCliAsync(directory.Path, "attach", "--pid", processId.ToString(), "--wait", "30");
        Assert.Equal(2, result.ExitCode);
        Assert.Contains("More than one live Goo endpoint matches", result.StandardError, StringComparison.Ordinal);
    }

    [Fact]
    public async Task CaptureEndpointErrorReturnsFailureAndMessage()
    {
        using var directory = TemporaryDirectory.Create();
        var pipeName = $"goo-test-{Guid.NewGuid():N}";
        await WriteDescriptorAsync(directory.Path, pipeName, "goo.devtools/1");
        using var server = new NamedPipeServerStream(pipeName, PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous);
        var cliTask = RunCliAsync(directory.Path, "capture", "--latest", "--wait", "5");
        await server.WaitForConnectionAsync().WaitAsync(TimeSpan.FromSeconds(5));
        using var reader = new StreamReader(server, leaveOpen: true);
        using var writer = new StreamWriter(server, leaveOpen: true) { AutoFlush = true, NewLine = "\n" };
        await ReadLineAsync(reader);
        await writer.WriteLineAsync("{\"type\":\"hello\",\"protocol\":\"goo.devtools/1\"}");
        var request = await ReadLineAsync(reader);
        using var requestDocument = JsonDocument.Parse(request);
        var id = requestDocument.RootElement.GetProperty("id").GetString();
        await writer.WriteLineAsync(JsonSerializer.Serialize(new
        {
            type = "error",
            id,
            payload = new { message = "capture unavailable" }
        }));
        var result = await cliTask;
        Assert.Equal(2, result.ExitCode);
        Assert.Contains("capture unavailable", result.StandardError, StringComparison.Ordinal);
    }

    [Fact]
    public async Task CapturePollsPendingAndWritesPng()
    {
        using var directory = TemporaryDirectory.Create();
        var pipeName = $"goo-test-{Guid.NewGuid():N}";
        await WriteDescriptorAsync(directory.Path, pipeName, "goo.devtools/1");
        var outputPath = Path.Combine(directory.Path, "frame.png");
        using var server = new NamedPipeServerStream(pipeName, PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous);
        var cliTask = RunCliAsync(directory.Path, "capture", "--latest", "--output", outputPath, "--wait", "5");
        await server.WaitForConnectionAsync().WaitAsync(TimeSpan.FromSeconds(5));
        using var reader = new StreamReader(server, leaveOpen: true);
        using var writer = new StreamWriter(server, leaveOpen: true) { AutoFlush = true, NewLine = "\n" };
        await ReadLineAsync(reader);
        await writer.WriteLineAsync("{\"type\":\"hello\",\"protocol\":\"goo.devtools/1\"}");

        var firstRequest = await ReadLineAsync(reader);
        using var firstDocument = JsonDocument.Parse(firstRequest);
        var firstId = firstDocument.RootElement.GetProperty("id").GetString();
        await writer.WriteLineAsync(JsonSerializer.Serialize(new
        {
            type = "response",
            id = firstId,
            payload = new { command = "capture", pending = true }
        }));

        var secondRequest = await ReadLineAsync(reader);
        using var secondDocument = JsonDocument.Parse(secondRequest);
        var secondId = secondDocument.RootElement.GetProperty("id").GetString();
        Assert.NotEqual(firstId, secondId);
        Assert.Equal("capture", secondDocument.RootElement.GetProperty("command").GetString());
        var rgba = Convert.ToBase64String([255, 0, 0, 255, 32, 16, 8, 128]);
        await writer.WriteLineAsync(JsonSerializer.Serialize(new
        {
            type = "response",
            id = secondId,
            payload = new
            {
                command = "capture",
                pending = false,
                format = "rgba8-srgb-premultiplied",
                width = 2,
                height = 1,
                stride = 8,
                rgbaBase64 = rgba
            }
        }));

        var result = await cliTask;
        Assert.Equal(0, result.ExitCode);
        var png = await File.ReadAllBytesAsync(outputPath);
        Assert.Equal([137, 80, 78, 71, 13, 10, 26, 10], png[..8]);
        Assert.Equal(2, BinaryPrimitives.ReadInt32BigEndian(png.AsSpan(16, 4)));
        Assert.Equal(1, BinaryPrimitives.ReadInt32BigEndian(png.AsSpan(20, 4)));
        var scanline = ReadPngImageData(png);
        Assert.Equal(0, scanline[0]);
        Assert.Equal([255, 0, 0, 255, 64, 32, 16, 128], scanline[1..]);
    }

    [Fact]
    public async Task CapturePendingHonorsWaitBudgetWithoutWritingImage()
    {
        using var directory = TemporaryDirectory.Create();
        var pipeName = $"goo-test-{Guid.NewGuid():N}";
        await WriteDescriptorAsync(directory.Path, pipeName, "goo.devtools/1");
        var outputPath = Path.Combine(directory.Path, "frame.png");
        using var server = new NamedPipeServerStream(pipeName, PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous);
        var cliTask = RunCliAsync(directory.Path, "capture", "--latest", "--output", outputPath, "--wait", "1");
        await server.WaitForConnectionAsync().WaitAsync(TimeSpan.FromSeconds(5));
        using var reader = new StreamReader(server, leaveOpen: true);
        using var writer = new StreamWriter(server, leaveOpen: true) { AutoFlush = true, NewLine = "\n" };
        await ReadLineAsync(reader);
        await writer.WriteLineAsync("{\"type\":\"hello\",\"protocol\":\"goo.devtools/1\"}");
        var requests = 0;
        while (await reader.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(5)) is { } request)
        {
            using var document = JsonDocument.Parse(request);
            await writer.WriteLineAsync(JsonSerializer.Serialize(new
            {
                type = "response",
                id = document.RootElement.GetProperty("id").GetString(),
                payload = new { command = "capture", pending = true }
            }));
            requests++;
        }

        var result = await cliTask;
        Assert.True(requests > 1);
        Assert.Equal(2, result.ExitCode);
        Assert.Contains("wait expired", result.StandardError, StringComparison.Ordinal);
        Assert.False(File.Exists(outputPath));
    }

    [Fact]
    public void InspectorUsesStandaloneAppOutputAndExpectedAttachArguments()
    {
        var candidates = InspectorLauncher.Candidates(RepositoryRoot);
        var releaseExecutable = Path.Combine(RepositoryRoot, "apps", "Goo.DevTools", "bin", "Release", "net10.0", "Goo.DevTools");
        Assert.Contains(releaseExecutable, candidates);
        Assert.DoesNotContain(candidates, item => item.Contains(Path.Combine("tools", "Goo.DevTools.App"), StringComparison.Ordinal));

        using var metadata = JsonDocument.Parse("{}");
        var descriptor = new DiscoveryDescriptor(
            "descriptor.json",
            "goo.devtools/1",
            1234,
            "Goo",
            "goo-1234-1",
            "named-pipe",
            null,
            null,
            null,
            metadata.RootElement.Clone());
        var start = InspectorLauncher.CreateStartInfo("goo-devtools", descriptor, true);
        Assert.Equal(["--attach", "--pipe", "goo-1234-1", "--pid", "1234", "--focus"], start.ArgumentList);
    }

    [Fact]
    public void WatchInspectorSelectionUsesLatestNewDescriptorInRuntimeDirectory()
    {
        using var directory = TemporaryDirectory.Create();
        using var metadata = JsonDocument.Parse("{}");
        var launchStartedAt = DateTimeOffset.UtcNow;
        var oldPath = Path.Combine(directory.Path, "old.json");
        var newPath = Path.Combine(directory.Path, "new.json");
        var unrelatedPath = Path.Combine(directory.Path, "nested", "unrelated.json");
        var old = new DiscoveryDescriptor(
            oldPath,
            "goo.devtools/1",
            1111,
            "old",
            "goo-old",
            "named-pipe",
            null,
            "Old",
            launchStartedAt.AddMinutes(-1),
            metadata.RootElement.Clone());
        var current = new DiscoveryDescriptor(
            newPath,
            "goo.devtools/1",
            2222,
            "current",
            "goo-current",
            "named-pipe",
            null,
            "Current",
            launchStartedAt.AddMilliseconds(1),
            metadata.RootElement.Clone());
        var unrelated = new DiscoveryDescriptor(
            unrelatedPath,
            "goo.devtools/1",
            3333,
            "unrelated",
            "goo-unrelated",
            "named-pipe",
            null,
            "Unrelated",
            launchStartedAt.AddMinutes(1),
            metadata.RootElement.Clone());

        var selected = CliApplication.SelectInspectorDescriptor(
            [old, current, unrelated],
            9999,
            true,
            directory.Path,
            new HashSet<string>([oldPath], StringComparer.OrdinalIgnoreCase),
            launchStartedAt);

        Assert.NotNull(selected);
        Assert.Equal("goo-current", selected.Pipe);
        Assert.NotEqual(9999, selected.ProcessId);
    }

    [Fact]
    public async Task NetworkTransportIsRejectedByLocalOnlyClient()
    {
        using var directory = TemporaryDirectory.Create();
        var descriptor = new
        {
            pid = Environment.ProcessId,
            process = "goo-runtime-test",
            protocol = "goo.devtools/1",
            version = 1,
            transport = "network",
            pipe = "127.0.0.1:43999",
            createdUtc = DateTimeOffset.UtcNow.ToString("O"),
            windows = new[] { new { id = "window-1", title = "Runtime window" } }
        };
        await File.WriteAllTextAsync(Path.Combine(directory.Path, "goo-test.json"), JsonSerializer.Serialize(descriptor));
        var result = await RunCliAsync(directory.Path, "attach", "--latest", "--once", "--wait", "0.1");
        Assert.Equal(2, result.ExitCode);
        Assert.Contains("unsupported transport", result.StandardError, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task DotnetWatchOutputReportsRestartRequiredEdits()
    {
        if (OperatingSystem.IsWindows())
            return;

        using var directory = TemporaryDirectory.Create();
        var result = await RunCliAsync(directory.Path, "dev", "--no-watch", "--", "/bin/sh", "-c", "printf 'hot reload requires restart\\n'");
        Assert.Equal(0, result.ExitCode);
        Assert.Contains("hot reload requires restart", result.StandardError, StringComparison.OrdinalIgnoreCase);
    }

    private static string RepositoryRoot
    {
        get
        {
            var directory = new DirectoryInfo(AppContext.BaseDirectory);
            while (directory is not null)
            {
                if (File.Exists(Path.Combine(directory.FullName, "LICENSE"))
                    && Directory.Exists(Path.Combine(directory.FullName, ".git")))
                    return directory.FullName;
                directory = directory.Parent;
            }

            throw new InvalidOperationException("Could not locate the repository root.");
        }
    }

    private static async Task WriteDescriptorAsync(
        string directory,
        string pipeName,
        string protocol,
        string transport = "named-pipe",
        string? fileName = null,
        int? processId = null)
    {
        var descriptor = new
        {
            pid = processId ?? Environment.ProcessId,
            process = "goo-runtime-test",
            protocol,
            version = 1,
            transport,
            pipe = pipeName,
            createdUtc = DateTimeOffset.UtcNow.ToString("O"),
            windows = new[] { new { id = "window-1", title = "Runtime window" } }
        };
        await File.WriteAllTextAsync(Path.Combine(directory, fileName ?? "goo-test.json"), JsonSerializer.Serialize(descriptor));
    }

    private static bool EndpointCheck(string output)
    {
        using var document = JsonDocument.Parse(output);
        foreach (var check in document.RootElement.GetProperty("checks").EnumerateArray())
        {
            if (check.GetProperty("name").GetString() == "endpoint")
                return check.GetProperty("ok").GetBoolean();
        }

        throw new InvalidOperationException("The doctor response did not contain an endpoint check.");
    }

    private static async Task<string> ReadLineAsync(StreamReader reader)
    {
        return await reader.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(5))
            ?? throw new InvalidOperationException("The protocol server closed before returning a line.");
    }

    private static byte[] ReadPngImageData(byte[] png)
    {
        using var compressed = new MemoryStream();
        var offset = 8;
        while (offset < png.Length)
        {
            var length = checked((int)BinaryPrimitives.ReadUInt32BigEndian(png.AsSpan(offset, 4)));
            var type = Encoding.ASCII.GetString(png, offset + 4, 4);
            if (type == "IDAT")
                compressed.Write(png, offset + 8, length);
            offset = checked(offset + 12 + length);
            if (type == "IEND")
                break;
        }

        compressed.Position = 0;
        using var zlib = new ZLibStream(compressed, CompressionMode.Decompress);
        using var pixels = new MemoryStream();
        zlib.CopyTo(pixels);
        return pixels.ToArray();
    }

    private static async Task<ProcessResult> RunCliAsync(string descriptorDirectory, params string[] arguments)
    {
        return await RunProcessAsync("dotnet", [Path.Combine(AppContext.BaseDirectory, "Goo.DevTools.Cli.dll"), .. arguments], new Dictionary<string, string>
        {
            ["GOO_DEVTOOLS_DIR"] = descriptorDirectory
        });
    }

    private static async Task<ProcessResult> RunProcessAsync(string fileName, params string[] arguments)
    {
        return await RunProcessAsync(fileName, arguments, null);
    }

    private static async Task<ProcessResult> RunProcessAsync(string fileName, IReadOnlyList<string> arguments, IReadOnlyDictionary<string, string>? environment)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = fileName,
            WorkingDirectory = RepositoryRoot,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true
        };
        foreach (var argument in arguments)
            startInfo.ArgumentList.Add(argument);
        if (environment is not null)
        {
            foreach (var pair in environment)
                startInfo.Environment[pair.Key] = pair.Value;
        }

        using var process = Process.Start(startInfo) ?? throw new InvalidOperationException($"Could not start {fileName}.");
        var outputTask = process.StandardOutput.ReadToEndAsync();
        var errorTask = process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync().WaitAsync(TimeSpan.FromMinutes(2));
        return new ProcessResult(process.ExitCode, await outputTask, await errorTask);
    }

    private sealed record ProcessResult(int ExitCode, string StandardOutput, string StandardError);

    private sealed class TemporaryDirectory : IDisposable
    {
        private TemporaryDirectory(string path)
        {
            Path = path;
        }

        public string Path { get; }

        public static TemporaryDirectory Create()
        {
            var path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"goo-devtools-tests-{Guid.NewGuid():N}");
            Directory.CreateDirectory(path);
            return new TemporaryDirectory(path);
        }

        public void Dispose()
        {
            if (Directory.Exists(Path))
                Directory.Delete(Path, true);
        }
    }
}
