package Goo

import System
import System.Runtime.InteropServices

internal interface NativeBackdrop : IDisposable {
  func Refresh() bool;
}

internal unsafe partial class SdlHost {
  private var nativeBackdrop NativeBackdrop?
  internal prop BackdropAvailable bool { get; private set }

  internal func SetBackdrop(enabled bool, windows WindowsBackdropOptions,
    macOS MacOSBackdropOptions, wayland WaylandBackdropOptions) {
    ThrowIfDisposed()
    if !enabled {
      nativeBackdrop?.Dispose()
      nativeBackdrop = nil
      BackdropAvailable = false
      return
    }
    if nativeBackdrop == nil && Transparent {
      let properties = BackdropProperties(WindowHandle)
      try {
        if OperatingSystem.IsLinux() && IsWayland() {
          nativeBackdrop = WaylandBackdrop(
            BackdropPointer(properties, "SDL.window.wayland.display", nint(0)),
            BackdropPointer(properties, "SDL.window.wayland.surface", nint(0)))
        } else if OperatingSystem.IsWindowsVersionAtLeast(10, 0, 22621) {
          nativeBackdrop = WindowsBackdrop(BackdropPointer(properties, "SDL.window.win32.hwnd", nint(0)))
        } else if OperatingSystem.IsMacOS() {
          nativeBackdrop = MacBackdrop(BackdropPointer(properties, "SDL.window.cocoa.window", nint(0)), LogicalWidth, LogicalHeight)
        }
      } catch (error DllNotFoundException) { }
      catch (error EntryPointNotFoundException) { }
    }
    if let windowsNative = nativeBackdrop as WindowsBackdrop? { windowsNative.Configure(windows) }
    if let macNative = nativeBackdrop as MacBackdrop? { macNative.Configure(macOS) }
    if let waylandNative = nativeBackdrop as WaylandBackdrop? { waylandNative.Configure(wayland) }
    RefreshBackdrop()
  }

  private func RefreshBackdrop() {
    let available = nativeBackdrop?.Refresh() ?? false
    if BackdropAvailable == available { return }
    BackdropAvailable = available
    Exposed?.Invoke()
  }

  shared {
    @DllImport("SDL3", EntryPoint: "SDL_GetWindowProperties", CallingConvention: CallingConvention.Cdecl)
    private func BackdropProperties(window nint) uint32;
    @DllImport("SDL3", EntryPoint: "SDL_GetPointerProperty", CallingConvention: CallingConvention.Cdecl)
    private func BackdropPointer(properties uint32, name string, fallback nint) nint;
  }
}
