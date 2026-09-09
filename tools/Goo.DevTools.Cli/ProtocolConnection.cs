using System.IO.Pipes;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Goo.DevTools.Cli;

internal sealed class ProtocolConnection : IAsyncDisposable
{
    private readonly Stream _stream;
    private readonly StreamReader _reader;
    private readonly StreamWriter _writer;
    private bool _disposed;

    private ProtocolConnection(Stream stream)
    {
        _stream = stream;
        _reader = new StreamReader(stream, new UTF8Encoding(false), false, 16 * 1024, true);
        _writer = new StreamWriter(stream, new UTF8Encoding(false), 16 * 1024, true) { AutoFlush = true, NewLine = "\n" };
    }

    public static async Task<ProtocolConnection> ConnectAsync(DiscoveryDescriptor descriptor, TimeSpan timeout, CancellationToken cancellationToken)
    {
        using var timeoutSource = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutSource.CancelAfter(timeout);
        var token = timeoutSource.Token;
        Stream stream;
        if (descriptor.Transport.Equals("unix", StringComparison.OrdinalIgnoreCase)
            || descriptor.Transport.Equals("unix-domain", StringComparison.OrdinalIgnoreCase)
            || descriptor.Pipe.StartsWith("/", StringComparison.Ordinal))
        {
            if (OperatingSystem.IsWindows())
                throw new CliException($"Endpoint '{descriptor.Pipe}' is a Unix socket, but this host is Windows.");
            var socket = new Socket(AddressFamily.Unix, SocketType.Stream, ProtocolType.Unspecified);
            try
            {
                await socket.ConnectAsync(new UnixDomainSocketEndPoint(descriptor.Pipe), token);
                stream = new NetworkStream(socket, ownsSocket: true);
            }
            catch
            {
                socket.Dispose();
                throw;
            }
        }
        else if (descriptor.Transport.Equals("named-pipe", StringComparison.OrdinalIgnoreCase)
            || descriptor.Transport.Equals("namedPipe", StringComparison.OrdinalIgnoreCase)
            || descriptor.Transport.Equals("pipe", StringComparison.OrdinalIgnoreCase)
            || string.IsNullOrWhiteSpace(descriptor.Transport))
        {
            if (!OperatingSystem.IsWindows() && descriptor.Pipe.StartsWith("\\\\", StringComparison.Ordinal))
                throw new CliException($"Named pipe '{descriptor.Pipe}' uses a Windows endpoint, but this host is not Windows.");
            var pipeName = descriptor.Pipe;
            const string prefix = "\\\\.\\pipe\\";
            if (pipeName.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                pipeName = pipeName[prefix.Length..];
            var pipe = new NamedPipeClientStream(".", pipeName, PipeDirection.InOut, PipeOptions.Asynchronous);
            try
            {
                await pipe.ConnectAsync(token);
                stream = pipe;
            }
            catch
            {
                pipe.Dispose();
                throw;
            }
        }
        else
        {
            throw new CliException($"Endpoint '{descriptor.Pipe}' uses unsupported transport '{descriptor.Transport}'. Goo DevTools accepts local named pipes and Unix sockets.");
        }

        return new ProtocolConnection(stream);
    }

    public async Task<string?> HandshakeAsync(CancellationToken cancellationToken)
    {
        var hello = new JsonObject
        {
            ["type"] = "hello",
            ["protocol"] = Discovery.Protocol,
            ["client"] = "goo-cli",
            ["version"] = "0.5.1",
            ["capabilities"] = new JsonArray(
                "tree",
                "properties",
                "layout",
                "events",
                "logs",
                "accessibility",
                "capture",
                "source-navigation",
                "hot-reload")
        };
        await SendAsync(hello, cancellationToken);
        return await ReadLineAsync(cancellationToken);
    }

    public async Task SendAsync(JsonObject message, CancellationToken cancellationToken)
    {
        ThrowIfDisposed();
        await _writer.WriteLineAsync(message.ToJsonString()).WaitAsync(cancellationToken);
    }

    public async Task SendRawAsync(string message, CancellationToken cancellationToken)
    {
        ThrowIfDisposed();
        await _writer.WriteLineAsync(message).WaitAsync(cancellationToken);
    }

    public async Task<string?> ReadLineAsync(CancellationToken cancellationToken)
    {
        ThrowIfDisposed();
        return await _reader.ReadLineAsync(cancellationToken);
    }

    public async Task<JsonObject?> RequestAsync(string command, JsonObject? payload, CancellationToken cancellationToken)
    {
        var id = Guid.NewGuid().ToString("N");
        var request = new JsonObject
        {
            ["type"] = "request",
            ["id"] = id,
            ["command"] = command,
            ["payload"] = payload?.DeepClone() ?? new JsonObject()
        };
        await SendAsync(request, cancellationToken);
        while (true)
        {
            var line = await ReadLineAsync(cancellationToken);
            if (line is null)
                return null;
            if (!TryParse(line, out var message))
                continue;
            if (!string.Equals(StringValue(message["id"]), id, StringComparison.Ordinal))
                continue;
            return message;
        }
    }

    public static bool TryParse(string line, out JsonObject message)
    {
        message = null!;
        try
        {
            var node = JsonNode.Parse(line);
            if (node is not JsonObject objectNode)
                return false;
            message = objectNode;
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    public static string FormatLine(string line, bool json)
    {
        if (json || !TryParse(line, out var message))
            return line;
        var type = StringValue(message["type"]) ?? StringValue(message["event"]);
        var text = StringValue(message["message"]) ?? StringValue(message["error"]);
        if (!string.IsNullOrWhiteSpace(text))
            return string.IsNullOrWhiteSpace(type) ? text : $"[{type}] {text}";
        if (!string.IsNullOrWhiteSpace(type))
            return $"[{type}] {message.ToJsonString() }";
        return message.ToJsonString();
    }

    public async ValueTask DisposeAsync()
    {
        if (_disposed)
            return;
        _disposed = true;
        await _writer.DisposeAsync();
        _reader.Dispose();
        await _stream.DisposeAsync();
    }

    private void ThrowIfDisposed()
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
    }

    private static string? StringValue(JsonNode? node)
    {
        return node is JsonValue value && value.TryGetValue<string>(out var text) ? text : null;
    }
}
