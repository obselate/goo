package Goo

import System
import System.Collections.Generic
import System.Runtime.InteropServices

@StructLayout(LayoutKind.Sequential)
internal struct SdlTitlebarPoint {
  internal var X int32
  internal var Y int32
}
@UnmanagedFunctionPointer(CallingConvention.Winapi)
internal delegate SdlTitlebarSubclass(window nint, message uint32, wparam nuint, lparam nint, id nuint, data nuint) nint;

internal unsafe partial class SdlTitlebarHooks {
  shared {
    private var windows Dictionary[nint, SdlTitlebarBinding]?
    private var windowsCallback SdlTitlebarSubclass?
    private var windowsCallbackAddress nint
    @DllImport("comctl32.dll")
    private func SetWindowSubclass(window nint, callback nint, id nuint, data nuint) int32;
    @DllImport("comctl32.dll")
    private func RemoveWindowSubclass(window nint, callback nint, id nuint) int32;
    @DllImport("comctl32.dll")
    private func DefSubclassProc(window nint, message uint32, wparam nuint, lparam nint) nint;
    @DllImport("user32.dll")
    private func ScreenToClient(window nint, ref point SdlTitlebarPoint) int32;

    private func BindWindows(binding SdlTitlebarBinding) {
      let handle = PointerProperty(binding.Properties, "SDL.window.win32.hwnd", nint(0))
      if handle == nint(0) { throw InvalidOperationException("Native titlebar HWND is unavailable") }
      if windowsCallbackAddress == nint(0) {
        windowsCallback ??= WindowsMessage
        windowsCallbackAddress = Marshal.GetFunctionPointerForDelegate(windowsCallback!!)
      }
      windows ??= Dictionary[nint, SdlTitlebarBinding]()
      windows!! [handle] = binding
      binding.NativeHandle = handle
      if SetWindowSubclass(handle, windowsCallbackAddress, nuint(windowsCallbackAddress), nuint(0)) == 0 {
        throw InvalidOperationException("Unable to install the native titlebar subclass")
      }
    }
    private func UnbindWindows(binding SdlTitlebarBinding) {
      let handle = binding.NativeHandle
      if handle == nint(0) { return }
      RemoveWindowSubclass(handle, windowsCallbackAddress, nuint(windowsCallbackAddress))
      windows?.Remove(handle)
      binding.NativeHandle = nint(0)
    }
    private func WindowsMessage(window nint, message uint32, wparam nuint, lparam nint, id nuint, data nuint) nint {
      // WM_NCLBUTTONDBLCLK / HTCAPTION. Keep other subclasses and default routing intact.
      if message == 0xA3u && wparam == nuint(2) {
        if let values = windows {
          if values.TryGetValue(window, out var binding) {
            let packed = int64(lparam)
            var point = SdlTitlebarPoint{X: int32(int16(packed & 0xffffL)), Y: int32(int16((packed >> 16) & 0xffffL))}
            if ScreenToClient(window, ref point) != 0 && binding.Owner.NativeTitlebarDoubleClick(float64(point.X), float64(point.Y)) {
              return nint(0)
            }
          }
        }
      }
      return DefSubclassProc(window, message, wparam, lparam)
    }
  }
}
