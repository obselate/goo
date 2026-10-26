package Goo

import Hexa.NET.SDL3
import System
import System.Runtime.InteropServices

internal interface NativeBackdrop : IDisposable {
  func Refresh() bool;
}

internal unsafe partial class SdlHost {
  private var nativeBackdrop NativeBackdrop?
  internal prop BackdropAvailable bool { get; private set }
  private var frameTheme SystemTheme
  private var contentUnderTitlebar bool
  private var macWindow nint
  internal prop TitlebarControlsRect ElementRect? { get; private set }
  internal event TitlebarControlsChanged Action

  internal func SetFrameTheme(value SystemTheme) {
    ThrowIfDisposed()
    frameTheme = value
    RefreshPreferences(false)
    ApplyFrameTheme()
  }

  private func ApplyFrameTheme() {
    let properties = BackdropProperties(WindowHandle)
    if OperatingSystem.IsWindows() {
      WindowsBackdrop.SetFrameTheme(BackdropPointer(properties, "SDL.window.win32.hwnd", nint(0)),
        frameTheme == SystemTheme.Unknown ? preferences.Theme : frameTheme)
    } else if OperatingSystem.IsMacOS() {
      MacBackdrop.SetFrameTheme(BackdropPointer(properties, "SDL.window.cocoa.window", nint(0)), frameTheme)
    }
  }

  internal func SetContentUnderTitlebar(value bool) {
    ThrowIfDisposed()
    if !OperatingSystem.IsMacOS() { return }
    contentUnderTitlebar = value
    macWindow = BackdropPointer(BackdropProperties(WindowHandle), "SDL.window.cocoa.window", nint(0))
    MacBackdrop.SetContentUnderTitlebar(macWindow, value)
    if value { EnableHitTest() }
    else if (SDL.GetWindowFlags(window) & uint64(SDLWindowFlags.Borderless)) == 0uL { DisableHitTest() }
    RefreshMetrics()
    RaiseMetrics()
  }

  private func RefreshTitlebarControls() {
    let rect = contentUnderTitlebar ? MacBackdrop.ControlsRect(macWindow) : nil
    if TitlebarControlsRect == rect { return }
    TitlebarControlsRect = rect
    TitlebarControlsChanged?.Invoke()
  }

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
    if let waylandNative = nativeBackdrop as WaylandBackdrop? { waylandNative.Configure(wayland, LogicalWidth, LogicalHeight) }
    RefreshBackdrop()
  }

  private func RefreshBackdrop() {
    if let waylandNative = nativeBackdrop as WaylandBackdrop? { waylandNative.Resize(LogicalWidth, LogicalHeight) }
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
