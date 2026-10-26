package Goo.DevTools.Cli

import System
import System.IO
import System.IO.Pipes
import System.Net.Sockets
import System.Text
import System.Text.Json
import System.Text.Json.Nodes
import System.Threading
import System.Threading.Tasks

internal class ProtocolConnection : IAsyncDisposable {
    private let _stream Stream
    private let _reader StreamReader
    private let _writer StreamWriter
    private var _disposed bool

    private init(stream Stream) {
        _stream = stream
        _reader = StreamReader(stream, UTF8Encoding(false), false, 16 * 1024, true)
        _writer = StreamWriter(stream, UTF8Encoding(false), 16 * 1024, true){AutoFlush = true, NewLine = "\n"}
    }

    async func HandshakeAsync(cancellationToken CancellationToken) string? {
        let hello = JsonObject(){
            ["type"] = "hello",
            ["protocol"] = Discovery.Protocol,
            ["client"] = "goo-cli",
            ["version"] = "0.20.0",
            ["capabilities"] = JsonArray(
                ReadOnlySpan[JsonNode?](
                    []JsonNode? {
                        "tree",
                        "properties",
                        "layout",
                        "events",
                        "logs",
                        "accessibility",
                        "capture",
                        "source-navigation",
                        "hot-reload"
                    }
                )
            )
        }
        await SendAsync(hello, cancellationToken)
        return await ReadLineAsync(cancellationToken)
    }

    async func SendAsync(message JsonObject, cancellationToken CancellationToken) {
        ThrowIfDisposed()
        await _writer.WriteLineAsync(message.ToJsonString()).WaitAsync(cancellationToken)
    }

    async func SendRawAsync(message string, cancellationToken CancellationToken) {
        ThrowIfDisposed()
        await _writer.WriteLineAsync(message).WaitAsync(cancellationToken)
    }

    async func ReadLineAsync(cancellationToken CancellationToken) string? {
        ThrowIfDisposed()
        return await _reader.ReadLineAsync(cancellationToken)
    }

    async func RequestAsync(command string, payload JsonObject?, cancellationToken CancellationToken) JsonObject? {
        let request = CreateRequest(command, payload)
        let id = StringValue(request["id"])
        await SendAsync(request, cancellationToken)
        while true {
            let line string? = await ReadLineAsync(cancellationToken)
            if line == nil {
                return nil
            }
            if !TryParse(line, out var message) {
                continue
            }
            if !string.Equals(StringValue(message!!["id"]), id, StringComparison.Ordinal) {
                continue
            }
            return message!!
        }
    }

    async func DisposeAsync() ValueTask {
        if _disposed {
            return
        }
        _disposed = true
        try {
            await _writer.DisposeAsync()
        } catch (IOException) { } finally {
            _reader.Dispose()
            await _stream.DisposeAsync()
        }
    }

    private func ThrowIfDisposed() {
        ObjectDisposedException.ThrowIf(_disposed, this)
    }

    shared {
        async func ConnectAsync(
            descriptor DiscoveryDescriptor,
            timeout TimeSpan,
            cancellationToken CancellationToken
        ) ProtocolConnection {
            using let timeoutSource = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken)
            timeoutSource.CancelAfter(timeout)
            let token = timeoutSource.Token
            var stream Stream
            if descriptor.Transport.Equals("unix", StringComparison.OrdinalIgnoreCase) || descriptor.Transport.Equals(
                "unix-domain",
                StringComparison.OrdinalIgnoreCase
            ) ||
                descriptor
                .Pipe
                .StartsWith("/", StringComparison.Ordinal) {
                if OperatingSystem.IsWindows() {
                    throw CliException("Endpoint '${descriptor.Pipe}' is a Unix socket, but this host is Windows.")
                }
                let socket = Socket(AddressFamily.Unix, SocketType.Stream, ProtocolType.Unspecified)
                try {
                    await socket.ConnectAsync(UnixDomainSocketEndPoint(descriptor.Pipe), token)
                    stream = NetworkStream(socket, ownsSocket: true)
                } catch {
                    socket.Dispose()
                    rethrow
                }
            } else if descriptor.Transport.Equals("named-pipe", StringComparison.OrdinalIgnoreCase) ||
                descriptor
                .Transport
                .Equals("namedPipe", StringComparison.OrdinalIgnoreCase) || descriptor.Transport.Equals(
                "pipe",
                StringComparison.OrdinalIgnoreCase
            ) ||
                string
                .IsNullOrWhiteSpace(descriptor.Transport) {
                if !OperatingSystem.IsWindows() && descriptor.Pipe.StartsWith("\\\\", StringComparison.Ordinal) {
                    throw CliException(
                        "Named pipe '${descriptor.Pipe}' uses a Windows endpoint, but this host is not Windows."
                    )
                }
                var pipeName = descriptor.Pipe
                const prefix = "\\\\.\\pipe\\"
                if pipeName.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) {
                    pipeName = pipeName[prefix.Length ..]
                }
                let pipe = NamedPipeClientStream(
                    ".",
                    pipeName,
                    PipeDirection.InOut,
                    PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly
                )
                try {
                    await pipe.ConnectAsync(token)
                    stream = pipe
                } catch {
                    pipe.Dispose()
                    rethrow
                }
            } else {
                throw CliException(
                    "Endpoint '${descriptor.Pipe}' uses unsupported transport '${descriptor.Transport}'. Goo DevTools accepts local named pipes and Unix sockets."
                )
            }
            return ProtocolConnection(stream)
        }

        func CreateRequest(command string, payload JsonObject? = nil) JsonObject -> JsonObject(){
            ["type"] = "request",
            ["id"] = Guid.NewGuid().ToString("N"),
            ["command"] = command,
            ["payload"] = payload?.DeepClone() ?? JsonObject()
        }

        func TryParse(line string, out message JsonObject?) bool {
            message = nil
            try {
                let node = JsonNode.Parse(line)
                if node is not JsonObject objectNode {
                    return false
                }
                message = objectNode
                return true
            } catch (JsonException) {
                return false
            }
        }

        func FormatLine(line string, json bool) string {
            if json || !TryParse(line, out var message) {
                return line
            }
            let type = StringValue(message!!["type"]) ?? StringValue(message!!["event"])
            let text = StringValue(message!!["message"]) ?? StringValue(message!!["error"])
            if !string.IsNullOrWhiteSpace(text) {
                return if string.IsNullOrWhiteSpace(type) {
                    text
                } else {
                    "[$type] $text"
                }
            }
            if !string.IsNullOrWhiteSpace(type) {
                return "[$type] ${message!!.ToJsonString()}"
            }
            return message!!.ToJsonString()
        }

        private func StringValue(node JsonNode?) string? -> if node is JsonValue value &&
            value.TryGetValue[string](out var text) { text } else { nil }
    }
}
