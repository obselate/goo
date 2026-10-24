package Goo

import System
import System.Buffers
import System.Buffers.Binary
import System.ComponentModel
import System.IO
import System.IO.Pipes
import System.Net.Sockets
import System.Text
import System.Threading
import System.Threading.Tasks

internal class InstancePipe : IDisposable {
    private let pipe NamedPipeServerStream
    private let election IDisposable
    private let lifetime CancellationTokenSource = CancellationTokenSource()
    private let service Task
    private var disposed int32

    private init(pipe NamedPipeServerStream, election IDisposable) {
        this.pipe = pipe
        this.election = election
        service = ServeAsync()
    }

    public func Dispose() {
        if Interlocked.Exchange(ref disposed, 1) != 0 { return }
        lifetime.Cancel()
        pipe.Dispose()
        try { service.GetAwaiter().GetResult() }
        finally {
            election.Dispose()
            lifetime.Dispose()
        }
    }

    private async func ServeAsync() {
        let token = lifetime.Token
        try {
            while !token.IsCancellationRequested {
                await pipe.WaitForConnectionAsync(token).ConfigureAwait(false)
                try { await ServeClientAsync(token).ConfigureAwait(false) }
                catch (error Exception) {
                    if error is not IOException && error is not ArgumentException
                        && error is not OperationCanceledException { rethrow }
                } finally {
                    if !token.IsCancellationRequested { pipe.Disconnect() }
                }
            }
        } catch (_ OperationCanceledException) {
        } catch (_ ObjectDisposedException) {
        } catch (_ IOException) {
        } catch (_ SocketException) {
        }
    }

    private async func ServeClientAsync(token CancellationToken) {
        using let deadline = CancellationTokenSource.CreateLinkedTokenSource(token)
        deadline.CancelAfter(3000)
        let header = [4]uint8
        await pipe.ReadExactlyAsync(header.AsMemory(), deadline.Token).ConfigureAwait(false)
        let length = BinaryPrimitives.ReadInt32LittleEndian(header.AsSpan())
        if length <= 0 || length > ActivationWire.MaxBytes {
            header[0] = 255
            await pipe.WriteAsync(header.AsMemory(0, 1), deadline.Token).ConfigureAwait(false)
            return
        }
        let buffer = ArrayPool[uint8].Shared.Rent(length)
        try {
            await pipe.ReadExactlyAsync(buffer.AsMemory(0, length), deadline.Token).ConfigureAwait(false)
            try { header[0] = uint8(Window.PostApplicationActivation(ActivationWire.Decode(buffer, length))) }
            catch (error Exception) {
                if error is not ArgumentException && error is not InvalidDataException { rethrow }
                header[0] = 255
            }
            await pipe.WriteAsync(header.AsMemory(0, 1), deadline.Token).ConfigureAwait(false)
        } finally { ArrayPool[uint8].Shared.Return(buffer) }
    }

    shared {
        private let identityEncoding UTF8Encoding = UTF8Encoding(false, true)

        internal async func AcquireAsync(applicationId string, activation ApplicationActivation,
            timeoutMilliseconds int32) SingleInstanceResult {
            if String.IsNullOrWhiteSpace(applicationId) || identityEncoding.GetByteCount(applicationId) > 255 {
                throw ArgumentException("An application identity of at most 255 UTF-8 bytes is required", "applicationId")
            }
            if activation == nil { throw ArgumentNullException("activation") }
            if timeoutMilliseconds <= 0 { throw ArgumentOutOfRangeException("timeoutMilliseconds") }
            if OperatingSystem.IsAndroid() || (!OperatingSystem.IsWindows() && !OperatingSystem.IsMacOS()
                && !OperatingSystem.IsLinux()) {
                return SingleInstanceResult(SingleInstanceStatus.Unsupported)
            }
            var election IDisposable? = nil
            try {
                var native []ApplicationActivation = Array.Empty[ApplicationActivation]()
                if OperatingSystem.IsMacOS() {
                    if Window.PrepareNativeApplicationActivation(out native) != WindowOperationResult.Accepted {
                        return SingleInstanceResult(SingleInstanceStatus.Failed, error: "Native application activation could not initialize")
                    }
                }
                let address = InstanceScope.Create(applicationId)
                election = InstanceLock.Acquire(address.LeasePath)
                if let owned = election {
                    let server = NamedPipeServerStream(address.PipeName, PipeDirection.InOut, 1,
                        PipeTransmissionMode.Byte, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly)
                    let lease = InstancePipe(server, owned)
                    election = nil
                    return SingleInstanceResult(SingleInstanceStatus.Primary, lease)
                }
                using let deadline = CancellationTokenSource(timeoutMilliseconds)
                let nativeToken = if OperatingSystem.IsLinux() { Environment.GetEnvironmentVariable("XDG_ACTIVATION_TOKEN") }
                    else { nil }
                let count = if native.Length == 0 { 1 } else { native.Length }
                for i in 0 ... count {
                    var encoded MemoryStream
                    try {
                        encoded = ActivationWire.Encode(if native.Length == 0 { activation } else { native[i] }, nativeToken)
                    } catch (_ ArgumentException) {
                        return SingleInstanceResult(SingleInstanceStatus.Rejected, error: "Activation data is invalid or exceeds its limits")
                    }
                    using let data = encoded
                    using let client = NamedPipeClientStream(".", address.PipeName, PipeDirection.InOut,
                        PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly)
                    await client.ConnectAsync(timeoutMilliseconds, deadline.Token).ConfigureAwait(false)
                    let header = [4]uint8
                    BinaryPrimitives.WriteInt32LittleEndian(header.AsSpan(), int32(data.Length))
                    await client.WriteAsync(header.AsMemory(), deadline.Token).ConfigureAwait(false)
                    await client.WriteAsync(data.GetBuffer().AsMemory(0, int32(data.Length)), deadline.Token).ConfigureAwait(false)
                    await client.ReadExactlyAsync(header.AsMemory(0, 1), deadline.Token).ConfigureAwait(false)
                    if header[0] != uint8(ActivationPostStatus.Accepted) {
                        return SingleInstanceResult(SingleInstanceStatus.Rejected, error: "The primary rejected activation data or its queue is unavailable")
                    }
                }
                return SingleInstanceResult(SingleInstanceStatus.Forwarded)
            } catch (_ OperationCanceledException) {
                return SingleInstanceResult(SingleInstanceStatus.TimedOut)
            } catch (_ TimeoutException) {
                return SingleInstanceResult(SingleInstanceStatus.TimedOut)
            } catch (error PlatformNotSupportedException) {
                return SingleInstanceResult(SingleInstanceStatus.Unsupported, error: error.Message)
            } catch (error Exception) {
                if error is not IOException && error is not UnauthorizedAccessException
                    && error is not Win32Exception && error is not DllNotFoundException
                    && error is not EntryPointNotFoundException && error is not ArgumentException { rethrow }
                return SingleInstanceResult(SingleInstanceStatus.Failed, error: error.Message)
            } finally { election?.Dispose() }
        }
    }
}
