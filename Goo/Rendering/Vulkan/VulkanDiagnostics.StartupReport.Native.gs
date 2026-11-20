package Goo

import System
import System.IO
import System.Runtime.CompilerServices
import System.Runtime.InteropServices
import System.Text
import System.Threading

@StructLayout(LayoutKind.Sequential)
internal struct StartupGraphicsDlInfo {
    internal var FileName nint
    internal var BaseAddress nint
    internal var SymbolName nint
    internal var SymbolAddress nint
}

internal class StartupStderrDrain {
    internal let Bytes []uint8 = [4096]uint8
    internal let Done ManualResetEventSlim = ManualResetEventSlim(false)
    internal var Length int32
    internal var Owners int32 = 2
}

internal unsafe partial class VulkanStartupReport {
    private const LinuxCloseOnExec int32 = 0x80000
    private const LinuxDuplicateCloseOnExec int32 = 1030
    private const WinHandleInherit uint32 = 1u
    private const WinPipeBinaryNoInherit int32 = 0x8080
    private var capture StartupStderrDrain?
    private var savedDescriptor int32 = -1
    private var savedHandle nint
    private var originalDebug string?
    private var debugOverridden bool
    private var savedHandleFlags uint32
    private var protectedHandle bool

    private func StartCapture() {
        originalDebug = Environment.GetEnvironmentVariable("VK_LOADER_DEBUG")
        SetLoaderDebug("error,warn,driver")
        debugOverridden = true
        var readerDescriptor = -1
        var redirected = false
        try {
            Console.Error.Flush()
            let descriptors *int32 = stackalloc[2]int32
            savedHandle = if OperatingSystem.IsWindows() {
                GetStdHandle(-12)
            } else {
                nint(0)
            }
            savedDescriptor = Duplicate(2)
            if OperatingSystem.IsWindows() && savedDescriptor >= 0 && GetOsHandle(2) == savedHandle {
                var flags uint32
                if GetHandleInformation(savedHandle, &flags) == 0
                || SetHandleInformation(savedHandle, 2u, 2u) == 0 {
                    throw IOException(
                        "Cannot preserve the original stderr handle: " + Marshal.GetLastPInvokeError().ToString()
                    )
                }
                savedHandleFlags = flags
                protectedHandle = true
            }
            let result = if OperatingSystem.IsWindows() {
                WinPipe(descriptors, 4096u, WinPipeBinaryNoInherit)
            } else if OperatingSystem.IsLinux() {
                LinuxPipe(descriptors, LinuxCloseOnExec)
            } else {
                UnixPipe(descriptors)
            }
            if result != 0 {
                throw IOException("stderr pipe failed: " + Marshal.GetLastPInvokeError().ToString())
            }
            readerDescriptor = descriptors[0]
            if readerDescriptor == 2 {
                readerDescriptor = Duplicate(descriptors[0])
                Close(descriptors[0])
            }
            if readerDescriptor < 0 || (descriptors[1] != 2 && (
                if OperatingSystem.IsLinux() {
                    LinuxDuplicateTo(descriptors[1], 2, LinuxCloseOnExec)
                } else {
                    DuplicateTo(descriptors[1], 2)
                }
            ) < 0) {
                let error = Marshal.GetLastPInvokeError()
                Close(descriptors[1])
                throw IOException("stderr redirection failed: " + error.ToString())
            }
            redirected = true
            if descriptors[1] != 2 {
                Close(descriptors[1])
            }
            if OperatingSystem.IsWindows() {
                let handle = GetOsHandle(2)
                if SetHandleInformation(handle, WinHandleInherit, 0u) == 0 {
                    throw IOException("Cannot protect redirected stderr: " + Marshal.GetLastPInvokeError().ToString())
                }
                SetStdHandle(-12, handle)
            }
            let state = StartupStderrDrain()
            capture = state
            let reader = readerDescriptor
            let saved = savedDescriptor
            let handle = savedHandle
            let thread = Thread(() -> { Drain(state, reader, saved, handle) })
            thread.IsBackground = true
            thread.Start()
        } catch (error Exception) {
            if redirected {
                if savedDescriptor >= 0 {
                    DuplicateTo(savedDescriptor, 2)
                } else {
                    Close(2)
                }
                if OperatingSystem.IsWindows() {
                    SetStdHandle(-12, savedHandle)
                }
            }
            if readerDescriptor >= 0 {
                Close(readerDescriptor)
            }
            capture?.Done.Dispose()
            capture = nil
            RestoreHandleFlags()
            Line("Vulkan loader stderr capture unavailable: " + error.Message)
            if savedDescriptor >= 0 {
                Close(savedDescriptor)
            }
            savedDescriptor = -1
        }
    }

    private func Drain(state StartupStderrDrain, reader int32, saved int32, handle nint) {
        try {
            let bytes = [4096]uint8
            fixed buffer *uint8 = bytes {
                while true {
                    let count = if OperatingSystem.IsWindows() {
                        WinRead(reader, buffer, 4096u)
                    } else {
                        int32(UnixRead(reader, buffer, nuint(4096)))
                    }
                    if count == 0 {
                        break
                    }
                    if count < 0 {
                        if Marshal.GetLastPInvokeError() == 4 {
                            continue
                        }
                        break
                    }
                    let keep = Math.Min(count, state.Bytes.Length - state.Length)
                    if keep > 0 {
                        Array.Copy(bytes, 0, state.Bytes, state.Length, keep)
                        Volatile.Write(ref state.Length, state.Length + keep)
                    }
                    var offset int32
                    while offset < count {
                        var written int32
                        if saved >= 0 {
                            written = if OperatingSystem.IsWindows() {
                                WinWrite(saved, buffer + offset, uint32(count - offset))
                            } else {
                                int32(UnixWrite(saved, buffer + offset, nuint(count - offset)))
                            }
                        } else if OperatingSystem.IsWindows() && handle != nint(0) && handle != nint(-1) {
                            var copied uint32
                            if WriteFile(handle, buffer + offset, uint32(count - offset), &copied, nint(0)) != 0 {
                                written = int32(copied)
                            }
                        }
                        if written <= 0 {
                            break
                        }
                        offset += written
                    }
                }
            }
        } catch (error Exception) { } finally {
            Close(reader)
            state.Done.Set()
            ReleaseDrain(state, saved)
        }
    }

    private func ReleaseDrain(state StartupStderrDrain, saved int32) {
        if Interlocked.Decrement(ref state.Owners) == 0 {
            if saved >= 0 { Close(saved) }
            state.Done.Dispose()
        }
    }

    internal func StopCapture() {
        if let state = capture {
            if OperatingSystem.IsWindows() {
                WinFlush(nint(0))
            } else {
                UnixFlush(nint(0))
            }
            if savedDescriptor >= 0 {
                DuplicateTo(savedDescriptor, 2)
            } else {
                Close(2)
            }
            if OperatingSystem.IsWindows() {
                SetStdHandle(-12, savedHandle)
            }
            RestoreHandleFlags()
            state.Done.Wait(250)
            ReleaseDrain(state, savedDescriptor)
            savedDescriptor = -1
            capture = nil
            let length = Volatile.Read(in state.Length)
            Line("Vulkan loader stderr (first 4 KiB):")
            Line(
                if length == 0 {
                    "  <no messages>"
                } else {
                    Encoding.UTF8.GetString(state.Bytes, 0, length)
                }
            )
        }
        if debugOverridden {
            SetLoaderDebug(originalDebug)
            debugOverridden = false
        }
    }

    private func RestoreHandleFlags() {
        if protectedHandle {
            SetHandleInformation(savedHandle, 2u, savedHandleFlags & 2u)
            protectedHandle = false
        }
    }

    shared {
        internal func TryLoad(path string, out library nint) bool {
            library = nint(0)
            guard let report = Current else {
                return NativeLibrary.TryLoad(path, out library)
            }
            if Path.IsPathRooted(path) {
                report.Payload(path)
            }
            if OperatingSystem.IsWindows() {
                library = LoadLibraryEx(path, nint(0), 0u)
                let error = Marshal.GetLastPInvokeError()
                if library == nint(0) {
                    let buffer *char = stackalloc[1024]char
                    let length = FormatMessage(0x1200u, nint(0), uint32(error), 0u, buffer, 1024u, nint(0))
                    report.Line(
                        "Native load failed: " + path + " GetLastError=" + error.ToString()
                        +
                            " FormatMessage=" +
                            (
                            if length == 0u {
                                "unavailable"
                            } else {
                                String(buffer, 0, int32(length)).Trim()
                            }
                        )
                    )
                    return false
                }
                let buffer *char = stackalloc[32768]char
                let length = GetModuleFileName(library, buffer, 32768u)
                report.Payload(
                    if length == 0u {
                        path
                    } else {
                        String(buffer, 0, int32(length))
                    }
                )
            } else {
                try {
                    library = NativeLibrary.Load(path)
                } catch (error Exception) {
                    report.Line("Native load failed: " + path + "\n" + error.ToString())
                    return false
                }
                var address nint
                var info = StartupGraphicsDlInfo{}
                if NativeLibrary.TryGetExport(library, "vkGetInstanceProcAddr", out address)
                &&
                    (
                    if OperatingSystem.IsMacOS() {
                        MacDlAddr(address, &info)
                    } else {
                        LinuxDlAddr(address, &info)
                    }
                ) != 0 {
                    report.Payload(Marshal.PtrToStringUTF8(info.FileName) ?? path)
                } else if Path.IsPathRooted(path) {
                    report.Payload(path)
                } else {
                    report.Line("Native loader resolved: " + path + " (module path unavailable)")
                }
            }
            return true
        }

        internal func Load(path string) nint {
            var library nint
            if TryLoad(path, out library) {
                return library
            }
            throw DllNotFoundException(
                "Cannot load native graphics library '" +
                    path +
                    "'. See native load errors in the startup graphics report."
            )
        }

        private func Duplicate(descriptor int32) int32 {
            if OperatingSystem.IsLinux() {
                return LinuxFileControl(descriptor, LinuxDuplicateCloseOnExec, 0)
            }
            if !OperatingSystem.IsWindows() {
                return UnixDuplicate(descriptor)
            }
            let previous = SetInvalidParameterHandler(nint(&HandleClosedStandardError))
            try {
                let duplicate = WinDuplicate(descriptor)
                if duplicate >= 0 && SetHandleInformation(GetOsHandle(duplicate), WinHandleInherit, 0u) == 0 {
                    let error = Marshal.GetLastPInvokeError()
                    Close(duplicate)
                    throw IOException("Cannot protect saved stderr: " + error.ToString())
                }
                return duplicate
            } finally {
                SetInvalidParameterHandler(previous)
            }
        }

        @UnmanagedCallersOnly(CallConvs: []Type{typeof(CallConvCdecl)})
        private func HandleClosedStandardError(
            expression nint,
            function nint,
            file nint,
            line uint32,
            reserved nuint
        ) { }

        private func DuplicateTo(source int32, destination int32) int32 -> if OperatingSystem.IsWindows() {
            WinDuplicateTo(source, destination)
        } else {
            UnixDuplicateTo(source, destination)
        }

        private func Close(descriptor int32) {
            if OperatingSystem.IsWindows() {
                WinClose(descriptor)
            } else {
                UnixClose(descriptor)
            }
        }

        private func SetLoaderDebug(value string?) {
            Environment.SetEnvironmentVariable("VK_LOADER_DEBUG", value)
            if !OperatingSystem.IsWindows() {
                if let setting = value {
                    UnixSetEnv("VK_LOADER_DEBUG", setting, 1)
                } else {
                    UnixUnsetEnv("VK_LOADER_DEBUG")
                }
            }
        }

        @DllImport("libc", EntryPoint: "setenv", CharSet: CharSet.Ansi) private func UnixSetEnv(
            name string,
            value string,
            overwrite int32
        ) int32;

        @DllImport("libc", EntryPoint: "unsetenv", CharSet: CharSet.Ansi) private func UnixUnsetEnv(name string) int32;

        @DllImport("libdl.so.2", EntryPoint: "dladdr") private func LinuxDlAddr(
            address nint,
            info *StartupGraphicsDlInfo
        ) int32;

        @DllImport("/usr/lib/libSystem.B.dylib", EntryPoint: "dladdr") private func MacDlAddr(
            address nint,
            info *StartupGraphicsDlInfo
        ) int32;

        @DllImport("kernel32.dll", EntryPoint: "LoadLibraryExW", CharSet: CharSet.Unicode, SetLastError: true)
        private func LoadLibraryEx(path string, file nint, flags uint32) nint;

        @DllImport("kernel32.dll", EntryPoint: "FormatMessageW", CharSet: CharSet.Unicode)
        private func FormatMessage(
            flags uint32,
            source nint,
            error uint32,
            language uint32,
            buffer *char,
            size uint32,
            arguments nint
        ) uint32;

        @DllImport("kernel32.dll", EntryPoint: "GetModuleFileNameW", CharSet: CharSet.Unicode)
        private func GetModuleFileName(module nint, buffer *char, size uint32) uint32;

        @DllImport("kernel32.dll") private func GetStdHandle(kind int32) nint;

        @DllImport("kernel32.dll") private func SetStdHandle(kind int32, handle nint) int32;

        @DllImport("kernel32.dll", SetLastError: true)
        private func GetHandleInformation(handle nint, flags *uint32) int32;

        @DllImport("kernel32.dll", SetLastError: true)
        private func SetHandleInformation(handle nint, mask uint32, flags uint32) int32;

        @DllImport("kernel32.dll") private func WriteFile(
            handle nint,
            buffer *uint8,
            length uint32,
            written *uint32,
            overlapped nint
        ) int32;

        @DllImport("ucrtbase.dll", EntryPoint: "_pipe", SetLastError: true) private func WinPipe(
            descriptors *int32,
            size uint32,
            mode int32
        ) int32;

        @DllImport("ucrtbase.dll", EntryPoint: "_dup", SetLastError: true) private func WinDuplicate(
            descriptor int32
        ) int32;

        @DllImport("ucrtbase.dll", EntryPoint: "_set_thread_local_invalid_parameter_handler")
        private func SetInvalidParameterHandler(handler nint) nint;

        @DllImport("ucrtbase.dll", EntryPoint: "_dup2", SetLastError: true) private func WinDuplicateTo(
            source int32,
            destination int32
        ) int32;

        @DllImport("ucrtbase.dll", EntryPoint: "_close") private func WinClose(descriptor int32) int32;

        @DllImport("ucrtbase.dll", EntryPoint: "_read", SetLastError: true) private func WinRead(
            descriptor int32,
            buffer *uint8,
            length uint32
        ) int32;

        @DllImport("ucrtbase.dll", EntryPoint: "_write", SetLastError: true) private func WinWrite(
            descriptor int32,
            buffer *uint8,
            length uint32
        ) int32;

        @DllImport("ucrtbase.dll", EntryPoint: "_get_osfhandle") private func GetOsHandle(descriptor int32) nint;

        @DllImport("ucrtbase.dll", EntryPoint: "fflush") private func WinFlush(file nint) int32;

        @DllImport("libc", EntryPoint: "pipe", SetLastError: true) private func UnixPipe(descriptors *int32) int32;

        @DllImport("libc", EntryPoint: "pipe2", SetLastError: true)
        private func LinuxPipe(descriptors *int32, flags int32) int32;

        @DllImport("libc", EntryPoint: "fcntl", SetLastError: true)
        private func LinuxFileControl(descriptor int32, command int32, argument int32) int32;

        @DllImport("libc", EntryPoint: "dup3", SetLastError: true)
        private func LinuxDuplicateTo(source int32, destination int32, flags int32) int32;

        @DllImport("libc", EntryPoint: "dup", SetLastError: true) private func UnixDuplicate(descriptor int32) int32;

        @DllImport("libc", EntryPoint: "dup2", SetLastError: true) private func UnixDuplicateTo(
            source int32,
            destination int32
        ) int32;

        @DllImport("libc", EntryPoint: "close") private func UnixClose(descriptor int32) int32;

        @DllImport("libc", EntryPoint: "read", SetLastError: true) private func UnixRead(
            descriptor int32,
            buffer *uint8,
            length nuint
        ) nint;

        @DllImport("libc", EntryPoint: "write", SetLastError: true) private func UnixWrite(
            descriptor int32,
            buffer *uint8,
            length nuint
        ) nint;

        @DllImport("libc", EntryPoint: "fflush") private func UnixFlush(file nint) int32;
    }
}
