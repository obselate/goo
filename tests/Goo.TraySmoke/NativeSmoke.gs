package GooTraySmoke

import Goo
import System
import System.Reflection
import System.Runtime.InteropServices
import System.Threading

internal class MacSmoke {
    shared {
        internal func Invoke(backend object) {
            let menu = nint(backend.GetType().GetField("menu", BindingFlags.Instance | BindingFlags.NonPublic)!!.GetValue(backend)!!)
            if menu == nint(0) || Send(menu, Sel("numberOfItems")) != nint(2) {
                throw InvalidOperationException("Native status menu not installed")
            }
            Arg(menu, Sel("performActionForItemAtIndex:"), nint(0))
        }
        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "sel_registerName")
        private func Sel(name string) nint;
        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend")
        private func Send(value nint, selector nint) nint;
        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend")
        private func Arg(value nint, selector nint, argument nint) nint;
    }
}

@UnmanagedFunctionPointer(CallingConvention.Winapi)
internal delegate Subclass(window nint, message uint32, wparam nuint, lparam nint, id nuint, data nuint) nint;

internal class WindowsSmoke {
    shared {
        private let callback Subclass = Dispatch

        internal func Invoke(owner Window, backend object) {
            let flags = BindingFlags.NonPublic | BindingFlags.Instance
            let window = nint(backend.GetType().GetField("window", flags)!!.GetValue(backend)!!)
            let id = uint32(backend.GetType().GetField("id", flags)!!.GetValue(backend)!!)
            let message = RegisterWindowMessageW("Goo.Tray.Callback.1")
            SendMessageW(window, message, nuint(0), nint((id << 16) | 0x400u))
            if SetWindowSubclass(window, callback, nuint(0x4754), nuint(0)) == 0 {
                throw InvalidOperationException("Install menu tracking observer")
            }
            try {
                SendMessageW(window, message, nuint(0), nint((id << 16) | 0x7Bu))
                using let timeout = Timer((_ object?) -> { PostMessageW(window, 0x1Fu, nuint(0), nint(0)) },
                    nil, TimeSpan.FromSeconds(10), Timeout.InfiniteTimeSpan)
                owner.Pump(0)
            } finally { RemoveWindowSubclass(window, callback, nuint(0x4754)) }
        }

        private func Dispatch(window nint, message uint32, wparam nuint, lparam nint, id nuint, data nuint) nint {
            if message == 0x211u {
                PostMessageW(window, 0x100u, nuint(0x28), nint(0))
                PostMessageW(window, 0x100u, nuint(0x0D), nint(0))
            }
            return DefSubclassProc(window, message, wparam, lparam)
        }


        @DllImport("user32.dll", CharSet: CharSet.Unicode)
        private func RegisterWindowMessageW(name string) uint32;
        @DllImport("user32.dll")
        private func SendMessageW(window nint, message uint32, wparam nuint, lparam nint) nint;
        @DllImport("user32.dll")
        private func PostMessageW(window nint, message uint32, wparam nuint, lparam nint) int32;
        @DllImport("comctl32.dll")
        private func SetWindowSubclass(window nint, proc Subclass, id nuint, data nuint) int32;
        @DllImport("comctl32.dll")
        private func RemoveWindowSubclass(window nint, proc Subclass, id nuint) int32;
        @DllImport("comctl32.dll")
        private func DefSubclassProc(window nint, message uint32, wparam nuint, lparam nint) nint;
    }
}
