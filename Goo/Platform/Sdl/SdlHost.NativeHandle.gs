package Goo

import Hexa.NET.SDL3
import System.Runtime.InteropServices

internal unsafe partial class SdlHost {
  private let waylandWindowProperties uint32

  internal prop ResizeConstraints WindowResizeConstraints{
    get -> if waylandWindowProperties == 0u || disposed { WindowResizeConstraints.None }
      else { WindowResizeConstraints(NativeNumber(waylandWindowProperties, "Goo.Window.ResizeConstraints.1", 0L)) }
  }

  shared {
    @DllImport("SDL3", EntryPoint: "SDL_GetNumberProperty", CallingConvention: CallingConvention.Cdecl)
    private func NativeNumber(properties uint32, name string, fallback int64) int64;
  }

  internal func GetNativeWindowHandle() NativeWindowHandle {
    ThrowIfDisposed()
    let properties = NativeProperties(WindowHandle)
    if properties == 0u { return default(NativeWindowHandle) }
    let driver = SDL.GetCurrentVideoDriverS()
    var kind NativeWindowKind
    var handle nint
    var display nint
    if driver == "windows" {
      kind = NativeWindowKind.Win32
      handle = NativePointer(properties, "SDL.window.win32.hwnd", nint(0))
    } else if driver == "cocoa" {
      kind = NativeWindowKind.Cocoa
      handle = NativePointer(properties, "SDL.window.cocoa.window", nint(0))
    } else if driver == "wayland" {
      kind = NativeWindowKind.Wayland
      handle = NativePointer(properties, "SDL.window.wayland.surface", nint(0))
      display = NativePointer(properties, "SDL.window.wayland.display", nint(0))
    } else if driver == "x11" {
      kind = NativeWindowKind.X11
      handle = nint(NativeNumber(properties, "SDL.window.x11.window", 0L))
      display = NativePointer(properties, "SDL.window.x11.display", nint(0))
    } else { return default(NativeWindowHandle) }
    if handle == nint(0) || ((kind == NativeWindowKind.Wayland || kind == NativeWindowKind.X11) && display == nint(0)) {
      return default(NativeWindowHandle)
    }
    return NativeWindowHandle(kind, handle, display)
  }
}
