package GooNotificationsWindowsSmoke

import Goo
import System
import System.IO
import System.Runtime.InteropServices
import System.Runtime.Versioning
import Microsoft.Win32

@SupportedOSPlatform("windows")
internal sealed unsafe class InstalledIdentity : IDisposable {
    private let scheme string
    private let shortcut string

    internal init(identifier string, scheme string) {
        this.scheme = scheme
        shortcut = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), scheme + ".lnk")
        unsafe {
            let initialized = CoInitializeEx(nint(0), 0u)
            if initialized < 0 && initialized != -2147417850 { Marshal.ThrowExceptionForHR(initialized) }
            try {
                {
                    using let protocol = Registry.CurrentUser.CreateSubKey("Software\\Classes\\" + scheme)
                    protocol.SetValue("URL Protocol", "")
                    using let command = protocol.CreateSubKey("shell\\open\\command")
                    command.SetValue("", "\"${Environment.ProcessPath}\" --goo-notification \"%1\"")
                }
                var clsid = ToastGuid.Parse("00021401-0000-0000-c000-000000000046")
                var iid = ToastGuid.Parse("000214f9-0000-0000-c000-000000000046")
                Marshal.ThrowExceptionForHR(CoCreateInstance(nint(&clsid), nint(0), 1u, nint(&iid), out var link))
                try {
                    let setPath = (Method(link, 20) as (unmanaged[Stdcall](nint, nint) -> int32)?)!!
                    fixed path *char = Environment.ProcessPath!! {
                        Marshal.ThrowExceptionForHR(setPath(link, nint(path)))
                    }
                    var storeId = Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99")
                    Marshal.ThrowExceptionForHR(Marshal.QueryInterface(link, ref storeId, out var store))
                    try {
                        fixed text *char = identifier { SetProperty(store, 5u, uint16(31), nint(text)) }
                        var activator = Guid.NewGuid()
                        SetProperty(store, 26u, uint16(72), nint(&activator))
                        let commit = (Method(store, 7) as (unmanaged[Stdcall](nint) -> int32)?)!!
                        Marshal.ThrowExceptionForHR(commit(store))
                    } finally { Marshal.Release(store) }
                    var persistId = Guid("0000010b-0000-0000-c000-000000000046")
                    Marshal.ThrowExceptionForHR(Marshal.QueryInterface(link, ref persistId, out var persist))
                    try {
                        let save = (Method(persist, 6) as (unmanaged[Stdcall](nint, nint, int32) -> int32)?)!!
                        fixed path *char = shortcut { Marshal.ThrowExceptionForHR(save(persist, nint(path), 1)) }
                    } finally { Marshal.Release(persist) }
                } finally { Marshal.Release(link) }
            } catch (error Exception) {
                Dispose()
                throw error
            } finally { if initialized >= 0 { CoUninitialize() } }
        }
    }

    public func Dispose() {
        File.Delete(shortcut)
        Registry.CurrentUser.DeleteSubKeyTree("Software\\Classes\\" + scheme, false)
    }

    @StructLayout(LayoutKind.Sequential)
    private struct PropertyKey {
        internal var Format ToastGuid
        internal var Id uint32
    }

    @StructLayout(LayoutKind.Explicit, Size: 24)
    private struct PropertyValue {
        @FieldOffset(0) internal var Kind uint16
        @FieldOffset(8) internal var Data nint
    }

    shared {
        private func SetProperty(store nint, id uint32, kind uint16, data nint) {
            var key = PropertyKey{ Format: ToastGuid.Parse("9f4c2855-9f79-4b39-a8d0-e1d42de1d5f3"), Id: id }
            var value = PropertyValue{ Kind: kind, Data: data }
            let set = (Method(store, 6) as (unmanaged[Stdcall](nint, nint, nint) -> int32)?)!!
            Marshal.ThrowExceptionForHR(set(store, nint(&key), nint(&value)))
        }

        private func Method(value nint, slot int32) nint -> Marshal.ReadIntPtr(Marshal.ReadIntPtr(value), slot * IntPtr.Size)

        @DllImport("ole32.dll")
        private func CoInitializeEx(reserved nint, kind uint32) int32;

        @DllImport("ole32.dll")
        private func CoUninitialize();

        @DllImport("ole32.dll")
        private func CoCreateInstance(clsid nint, outer nint, context uint32, iid nint, out result nint) int32;
    }
}
