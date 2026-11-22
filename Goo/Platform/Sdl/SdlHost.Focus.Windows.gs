package Goo

import Hexa.NET.SDL3
import System
import System.Runtime.InteropServices

@UnmanagedFunctionPointer(CallingConvention.Winapi)
internal delegate SdlFocusSubclass(window nint, message uint32, wparam nuint, lparam nint, id nuint, data nuint) nint;

internal unsafe partial class SdlHost {
  private var focusSubclass SdlFocusSubclass?
  private var focusWindow nint
  private var keyboardFocused bool

  shared {
    @DllImport("comctl32.dll")
    private func SetWindowSubclass(window nint, callback SdlFocusSubclass, id nuint, data nuint) int32;
    @DllImport("comctl32.dll")
    private func RemoveWindowSubclass(window nint, callback SdlFocusSubclass, id nuint) int32;
    @DllImport("comctl32.dll")
    private func DefSubclassProc(window nint, message uint32, wparam nuint, lparam nint) nint;
    @DllImport("user32.dll")
    private func GetFocus() nint;
    @DllImport("user32.dll")
    private func SetFocus(window nint) nint;
    @DllImport("user32.dll")
    private func IsChild(parent nint, child nint) int32;
  }

  private func BindNativeFocus() {
    if !OperatingSystem.IsWindows() { return }
    let handle = NativePointer(NativeProperties(WindowHandle), "SDL.window.win32.hwnd", nint(0))
    if handle == nint(0) { return }
    let callback SdlFocusSubclass = DispatchNativeFocus
    if SetWindowSubclass(handle, callback, nuint(0x4746), nuint(0)) == 0 { return }
    focusWindow = handle
    focusSubclass = callback
  }

  private func UnbindNativeFocus() {
    guard let callback = focusSubclass else { return }
    RemoveWindowSubclass(focusWindow, callback, nuint(0x4746))
    focusSubclass = nil
    focusWindow = nint(0)
  }

  private func DispatchNativeFocus(handle nint, message uint32, wparam nuint, lparam nint, id nuint, data nuint) nint {
    if message == 0x84u || message == 0x2A2u || message == 0x2A3u || (message >= 0xA0u && message <= 0xA3u) {
      return DispatchMaximizeButton(handle, message, wparam, lparam)
    }
    if message == 0x7u || message == 0x8u {
      var nativeEvent SDLEvent
      nativeEvent.Window.Type = message == 0x7u ? SDLEventType.WindowFocusGained : SDLEventType.WindowFocusLost
      nativeEvent.Window.WindowID = windowId
      SDL.PeepEvents(&nativeEvent, 1, SDLEventAction.Addevent, 0u, 0u)
    } else if message == 0x201u || message == 0x204u || message == 0x207u || message == 0x20Bu || message == 0x246u {
      if IsChild(handle, GetFocus()) != 0 { SetFocus(handle) }
    }
    return DefSubclassProc(handle, message, wparam, lparam)
  }

  private func RaiseFocusChanged(value bool) {
    if focusSubclass != nil && keyboardFocused == value { return }
    keyboardFocused = value
    FocusChanged?.Invoke(value)
  }
}
