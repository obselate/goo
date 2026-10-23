package Goo

import Microsoft.Win32.SafeHandles
import System
import System.ComponentModel
import System.Diagnostics
import System.IO
import System.Runtime.InteropServices
import System.Security.Cryptography
import System.Security.Principal
import System.Text

internal data struct InstanceScope {
    internal var LeasePath string
    internal var PipeName string

    shared {
        private const DarwinUserTemporaryDirectory int32 = 65537

        internal func Create(applicationId string) InstanceScope {
            var root string
            var identity = ""
            if OperatingSystem.IsWindows() {
                root = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)
                using let user = WindowsIdentity.GetCurrent()
                guard let sid = user.User else { throw PlatformNotSupportedException("A user identity is required") }
                using let process = Process.GetCurrentProcess()
                identity = sid.Value + ":" + process.SessionId.ToString()
            } else if OperatingSystem.IsMacOS() {
                root = MacTemporaryDirectory()
                var session uint32 = 0u
                var attributes uint32 = 0u
                let status = SessionGetInfo(uint32.MaxValue, out session, out attributes)
                if status != 0 { throw PlatformNotSupportedException("The login session is unavailable: " + status.ToString()) }
                identity = session.ToString()
            } else {
                root = Environment.GetEnvironmentVariable("XDG_RUNTIME_DIR") ?? ""
            }
            if !Path.IsPathFullyQualified(root) {
                throw PlatformNotSupportedException("A private user runtime directory is required")
            }
            if !OperatingSystem.IsWindows() {
                let publicMode = UnixFileMode.GroupRead | UnixFileMode.GroupWrite | UnixFileMode.GroupExecute
                    | UnixFileMode.OtherRead | UnixFileMode.OtherWrite | UnixFileMode.OtherExecute
                if (File.GetUnixFileMode(root) & publicMode) != UnixFileMode.None {
                    throw PlatformNotSupportedException("The user runtime directory must have mode 0700")
                }
            }
            let directory = Path.Combine(root, "goo")
            if OperatingSystem.IsWindows() { Directory.CreateDirectory(directory) }
            else { Directory.CreateDirectory(directory, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute) }
            let digest = SHA256.HashData(Encoding.UTF8.GetBytes(applicationId + "\n" + identity))
            let key = Convert.ToHexString(digest.AsSpan(0, 16))
            return InstanceScope{
                LeasePath: Path.Combine(directory, key + ".lock"),
                PipeName: if OperatingSystem.IsWindows() { "Goo-" + key } else { Path.Combine(directory, key + ".pipe") },
            }
        }

        private func MacTemporaryDirectory() string {
            let length = Confstr(DarwinUserTemporaryDirectory, nint(0), nuint(0))
            if length == nuint(0) || length > nuint(4096) {
                throw PlatformNotSupportedException("The user temporary directory is unavailable")
            }
            let buffer = Marshal.AllocHGlobal(int32(length))
            try {
                if Confstr(DarwinUserTemporaryDirectory, buffer, length) != length {
                    throw PlatformNotSupportedException("The user temporary directory changed")
                }
                return Marshal.PtrToStringUTF8(buffer) ?? ""
            } finally { Marshal.FreeHGlobal(buffer) }
        }

        @DllImport("/usr/lib/libSystem.B.dylib", EntryPoint: "confstr", SetLastError: true)
        private func Confstr(name int32, buffer nint, length nuint) nuint;

        @DllImport("/System/Library/Frameworks/Security.framework/Security", EntryPoint: "SessionGetInfo")
        private func SessionGetInfo(request uint32, out session uint32, out attributes uint32) int32;
    }
}

internal class InstanceLock : IDisposable {
    private let handle SafeFileHandle
    private let mac bool
    private var disposed bool

    private init(handle SafeFileHandle, mac bool) {
        this.handle = handle
        this.mac = mac
    }

    public func Dispose() {
        if disposed { return }
        disposed = true
        Flock(handle.DangerousGetHandle(), Unlock, mac)
        handle.Dispose()
    }

    shared {
        private const LinuxOpenFlags int32 = 2 | 64 | 524288
        private const MacOpenFlags int32 = 2 | 512 | 16777216
        private const ExclusiveNonBlocking int32 = 2 | 4
        private const Unlock int32 = 8
        private const LinuxWouldBlock int32 = 11
        private const MacWouldBlock int32 = 35

        internal func Acquire(path string) IDisposable? {
            if OperatingSystem.IsWindows() {
                try { return File.Open(path, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None) }
                catch (error IOException) {
                    if (error.HResult & 65535) == 32 { return nil }
                    rethrow
                }
            }
            let mac = OperatingSystem.IsMacOS()
            let mode = int32(UnixFileMode.UserRead | UnixFileMode.UserWrite)
            let descriptor = if mac { MacOpen(path, MacOpenFlags, mode) } else { LinuxOpen(path, LinuxOpenFlags, mode) }
            if descriptor < 0 { throw Win32Exception(Marshal.GetLastPInvokeError()) }
            let handle = SafeFileHandle(nint(descriptor), true)
            if Flock(nint(descriptor), ExclusiveNonBlocking, mac) == 0 { return InstanceLock(handle, mac) }
            let error = Marshal.GetLastPInvokeError()
            handle.Dispose()
            if error == (if mac { MacWouldBlock } else { LinuxWouldBlock }) { return nil }
            throw Win32Exception(error)
        }

        private func Flock(descriptor nint, operation int32, mac bool) int32 ->
            if mac { MacFlock(int32(descriptor), operation) } else { LinuxFlock(int32(descriptor), operation) }

        @DllImport("libc.so.6", EntryPoint: "open", SetLastError: true)
        private func LinuxOpen(path string, flags int32, mode int32) int32;
        @DllImport("libc.so.6", EntryPoint: "flock", SetLastError: true)
        private func LinuxFlock(descriptor int32, operation int32) int32;
        @DllImport("/usr/lib/libSystem.B.dylib", EntryPoint: "open", SetLastError: true)
        private func MacOpen(path string, flags int32, mode int32) int32;
        @DllImport("/usr/lib/libSystem.B.dylib", EntryPoint: "flock", SetLastError: true)
        private func MacFlock(descriptor int32, operation int32) int32;
    }
}
