package Goo

import System
import System.IO
import System.Runtime.InteropServices
import Microsoft.Win32

@StructLayout(LayoutKind.Sequential)
internal struct ToastPropertyKey {
    internal var Format ToastGuid
    internal var Id uint32
}

@StructLayout(LayoutKind.Explicit, Size: 24)
internal struct ToastPropertyValue {
    @FieldOffset(0)
    internal var Kind uint16
    @FieldOffset(8)
    internal var Data nint
}

@UnmanagedFunctionPointer(CallingConvention.Winapi)
internal delegate ToastPropertyGet(self nint, ref key ToastPropertyKey, out value ToastPropertyValue) int32;

internal class WindowsNotificationIdentity {
    shared {
        @DllImport("shell32.dll", CharSet: CharSet.Unicode)
        private func SHGetPropertyStoreFromParsingName(path string, context nint, flags uint32,
            ref iid ToastGuid, out store nint) int32;

        @DllImport("ole32.dll")
        private func PropVariantClear(ref value ToastPropertyValue) int32;

        @DllImport("shell32.dll", CharSet: CharSet.Unicode)
        internal func SetCurrentProcessExplicitAppUserModelID(identifier string) int32;

        internal func Installed(identifier string, scheme string) bool {
            if !Uri.CheckSchemeName(scheme) || scheme.Equals("http", StringComparison.OrdinalIgnoreCase)
                || scheme.Equals("https", StringComparison.OrdinalIgnoreCase)
                || scheme.Equals("file", StringComparison.OrdinalIgnoreCase) { return false }
            using let protocol = Registry.ClassesRoot.OpenSubKey(scheme)
            using let command = protocol?.OpenSubKey(`shell\open\command`)
            let executable = Environment.ProcessPath
            if executable == nil || protocol?.GetValue("URL Protocol") == nil { return false }
            let registered = command?.GetValue("") as string?
            if registered == nil || !registered.Equals(`"` + executable + `" --goo-notification "%1"`,
                StringComparison.OrdinalIgnoreCase) { return false }

            for folder in []Environment.SpecialFolder{Environment.SpecialFolder.StartMenu,
                Environment.SpecialFolder.CommonStartMenu} {
                let root = Environment.GetFolderPath(folder)
                if !Directory.Exists(root) { continue }
                for shortcut in Directory.EnumerateFiles(root, "*.lnk", SearchOption.AllDirectories) {
                    if Matches(shortcut, identifier) { return true }
                }
            }
            return false
        }

        private func Matches(path string, identifier string) bool {
            var iid = ToastGuid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99")
            if SHGetPropertyStoreFromParsingName(path, nint(0), 0u, ref iid, out var store) < 0 { return false }
            try {
                var key = ToastPropertyKey{ Format: ToastGuid("9f4c2855-9f79-4b39-a8d0-e1d42de1d5f3"), Id: 5u }
                let get = WindowsToastNative.Method[ToastPropertyGet](store, 5)
                if get(store, ref key, out var value) < 0 { return false }
                try {
                    if value.Kind != uint16(31) || Marshal.PtrToStringUni(value.Data) != identifier { return false }
                } finally { PropVariantClear(ref value) }
                key.Id = 26u
                if get(store, ref key, out value) < 0 { return false }
                try {
                    return value.Kind == uint16(72) && value.Data != nint(0)
                        && Marshal.PtrToStructure[Guid](value.Data) != Guid.Empty
                } finally { PropVariantClear(ref value) }
            } finally { WindowsToastNative.Release(store) }
        }
    }
}
