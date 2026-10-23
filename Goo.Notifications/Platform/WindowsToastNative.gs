package Goo

import System
import System.Runtime.CompilerServices
import System.Runtime.InteropServices

@StructLayout(LayoutKind.Sequential)
internal struct ToastGuid {
    internal var A uint32
    internal var B uint32
    internal var C uint32
    internal var D uint32

    shared {
        internal func Parse(value string) ToastGuid -> Unsafe.BitCast[Guid, ToastGuid](Guid(value))
    }
}

@UnmanagedFunctionPointer(CallingConvention.Winapi)
internal delegate ToastGet(self nint, out value nint) int32;
@UnmanagedFunctionPointer(CallingConvention.Winapi)
internal delegate ToastCreate(self nint, argument nint, out value nint) int32;
@UnmanagedFunctionPointer(CallingConvention.Winapi)
internal delegate ToastCall(self nint, argument nint) int32;
@UnmanagedFunctionPointer(CallingConvention.Winapi)
internal delegate ToastRemove(self nint, tag nint, group nint, application nint) int32;
@UnmanagedFunctionPointer(CallingConvention.Winapi)
internal delegate ToastSize(self nint, out value uint32) int32;
@UnmanagedFunctionPointer(CallingConvention.Winapi)
internal delegate ToastAt(self nint, index uint32, out value nint) int32;

internal class WindowsToastNative {
    shared {
        internal const Manager string = "Windows.UI.Notifications.ToastNotificationManager"
        internal const ManagerId string = "50ac103f-d235-4598-bbef-98fe4d1a3ad4"
        internal const ManagerHistoryId string = "7ab93c52-0e48-4750-ba9d-1a4113981847"
        internal const HistoryId string = "3bc3d253-2f31-4092-9129-8ad5abf067da"
        internal const ToastIdentityId string = "9dfb9fd1-143a-490e-90bf-b9fba7132de7"

        @DllImport("combase.dll")
        internal func RoInitialize(kind uint32) int32;

        @DllImport("combase.dll")
        internal func RoUninitialize();

        @DllImport("combase.dll", CharSet: CharSet.Unicode)
        private func WindowsCreateString(value string, length uint32, out result nint) int32;

        @DllImport("combase.dll")
        internal func WindowsDeleteString(value nint) int32;

        @DllImport("combase.dll")
        private func WindowsGetStringRawBuffer(value nint, out length uint32) nint;

        @DllImport("combase.dll")
        private func RoGetActivationFactory(name nint, ref iid ToastGuid, out result nint) int32;

        @DllImport("combase.dll")
        private func RoActivateInstance(name nint, out result nint) int32;

        internal func String(value string) nint {
            Check(WindowsCreateString(value, uint32(value.Length), out var result))
            return result
        }

        internal func Text(value nint) string {
            let data = WindowsGetStringRawBuffer(value, out var length)
            return Marshal.PtrToStringUni(data, int32(length)) ?? ""
        }

        internal func Check(result int32) {
            if result < 0 { throw COMException("Windows toast operation failed", result) }
        }

        internal func Method[T any](value nint, slot int32) T ->
            Marshal.GetDelegateForFunctionPointer[T](Marshal.ReadIntPtr(Marshal.ReadIntPtr(value), slot * IntPtr.Size))

        internal func Query(value nint, identity string) nint {
            var iid = Guid(identity)
            Check(Marshal.QueryInterface(value, ref iid, out var result))
            return result
        }

        internal func Factory(name string, identity string) nint {
            let text = String(name)
            try {
                var iid = ToastGuid.Parse(identity)
                Check(RoGetActivationFactory(text, ref iid, out var result))
                return result
            } finally { WindowsDeleteString(text) }
        }

        internal func Activate(name string, identity string) nint {
            let text = String(name)
            try {
                Check(RoActivateInstance(text, out var result))
                try { return Query(result, identity) }
                finally { Release(result) }
            } finally { WindowsDeleteString(text) }
        }

        internal func Release(value nint) {
            if value != nint(0) { Marshal.Release(value) }
        }
    }
}
