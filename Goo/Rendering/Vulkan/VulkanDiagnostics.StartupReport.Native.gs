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

internal unsafe partial class VulkanStartupReport {
    private let loaderBytes MemoryStream = MemoryStream(4096)
    private let readerDone ManualResetEventSlim = ManualResetEventSlim(false)
    private var readerDescriptor int32 = -1
    private var savedDescriptor int32 = -1
    private var savedHandle nint
    private var capturing bool
    private var originalDebug string?
    private var debugOverridden bool
    private var savedHandleFlags uint32
    private var protectedHandle bool

    private func StartCapture() {
        originalDebug = Environment.GetEnvironmentVariable("VK_LOADER_DEBUG")
        SetLoaderDebug("error,warn,driver")
        debugOverridden = true
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
                WinPipe(descriptors, 4096u, 0x8000)
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
            if DuplicateTo(descriptors[1], 2) < 0 {
                Close(descriptors[1])
                Close(readerDescriptor)
                throw IOException("stderr redirection failed: " + Marshal.GetLastPInvokeError().ToString())
            }
            if OperatingSystem.IsWindows() {
                SetStdHandle(-12, GetOsHandle(2))
            }
            if descriptors[1] != 2 {
                Close(descriptors[1])
            }
            loaderBytes.SetLength(0L)
            readerDone.Reset()
            capturing = true
            let drain = Thread(() -> { Drain() })
            drain.IsBackground = true
            drain.Start()
        } catch (error Exception) {
            if capturing {
                if savedDescriptor >= 0 {
                    DuplicateTo(savedDescriptor, 2)
                } else {
                    Close(2)
                }
                if OperatingSystem.IsWindows() {
                    SetStdHandle(-12, savedHandle)
                }
                Close(readerDescriptor)
                capturing = false
            }
            RestoreHandleFlags()
            Line("Vulkan loader stderr capture unavailable: " + error.Message)
            if savedDescriptor >= 0 {
                Close(savedDescriptor)
            }
            savedDescriptor = -1
        }
    }

    private func Drain() {
        try {
            let bytes = [4096]uint8
            fixed buffer *uint8 = bytes {
                while true {
                    let count = if OperatingSystem.IsWindows() {
                        WinRead(readerDescriptor, buffer, 4096u)
                    } else {
                        int32(UnixRead(readerDescriptor, buffer, nuint(4096)))
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
                    let keep = Math.Min(count, 4096 - int32(loaderBytes.Length))
                    if keep > 0 {
                        loaderBytes.Write(bytes, 0, keep)
                    }
                    var offset int32
                    while offset < count {
                        var written int32
                        if savedDescriptor >= 0 {
                            written = if OperatingSystem.IsWindows() {
                                WinWrite(savedDescriptor, buffer + offset, uint32(count - offset))
                            } else {
                                int32(UnixWrite(savedDescriptor, buffer + offset, nuint(count - offset)))
                            }
                        } else if OperatingSystem.IsWindows() && savedHandle != nint(0) && savedHandle != nint(-1) {
                            var copied uint32
                            if WriteFile(savedHandle, buffer + offset, uint32(count - offset), &copied, nint(0)) != 0 {
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
            Close(readerDescriptor)
            readerDone.Set()
        }
    }

    private func StopCapture() {
        if capturing {
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
            readerDone.Wait()
            if savedDescriptor >= 0 {
                Close(savedDescriptor)
            }
            savedDescriptor = -1
            capturing = false
            Line("Vulkan loader stderr (first 4 KiB):")
            Line(
                if loaderBytes.Length == 0L {
                    "  <no messages>"
                } else {
                    Encoding.UTF8.GetString(loaderBytes.GetBuffer(), 0, int32(loaderBytes.Length))
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
            if !OperatingSystem.IsWindows() {
                return UnixDuplicate(descriptor)
            }
            let previous = SetInvalidParameterHandler(nint(&HandleClosedStandardError))
            try {
                return WinDuplicate(descriptor)
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
