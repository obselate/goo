package Goo

import Microsoft.Win32
import System
import System.Collections.Generic
import System.Diagnostics
import System.Runtime.InteropServices

@StructLayout(LayoutKind.Sequential)
internal data struct WindowsRect(Left int32, Top int32, Right int32, Bottom int32) { }

@StructLayout(LayoutKind.Sequential)
internal struct WindowsMonitorInfo {
  internal var Size uint32
  internal var Monitor WindowsRect
  internal var Work WindowsRect
  internal var Flags uint32
}

@StructLayout(LayoutKind.Sequential)
internal struct WindowsAppBarData {
  internal var Size uint32
  internal var Window nint
  internal var CallbackMessage uint32
  internal var Edge uint32
  internal var Rect WindowsRect
  internal var Param nint
}

@StructLayout(LayoutKind.Sequential)
internal struct BackdropWindowsMargins {
  internal var Left int32
  internal var Right int32
  internal var Top int32
  internal var Bottom int32
}

@StructLayout(LayoutKind.Sequential)
internal struct BackdropWindowsContrast {
  internal var Size uint32
  internal var Flags uint32
  internal var Scheme nint
}

private struct WindowsBackdropWindowState {
  internal var Fullscreen bool
  internal var Decorated bool
  internal var Transparent bool
}

internal class WindowsBackdrop : NativeBackdrop {
  private let window nint
  private var frameExtended bool
  private var available bool
  private var disposed bool
  private var nextRefresh int64
  private var options WindowsBackdropOptions
  private var appliedMaterial int32 = -1

  internal init(window nint) {
    this.window = window
    if window == nint(0) { return }
    SetTransparent(window, true)
    var margins = BackdropWindowsMargins{Left: -1, Right: -1, Top: -1, Bottom: -1}
    frameExtended = DwmExtendFrameIntoClientArea(window, ref margins) >= 0
  }

  internal func Configure(value WindowsBackdropOptions) {
    if options == value { return }
    options = value
    nextRefresh = 0
  }

  public func Refresh() bool {
    if disposed || !frameExtended { return false }
    let now = Stopwatch.GetTimestamp()
    if now < nextRefresh { return available }
    nextRefresh = now + Stopwatch.Frequency
    var contrast = BackdropWindowsContrast{Size: uint32(Marshal.SizeOf[BackdropWindowsContrast]())}
    let highContrast = SystemParametersInfo(0x0042u, contrast.Size, ref contrast, 0u) != 0
      && (contrast.Flags & 1u) != 0u
    var transparency = true
    try {
      let setting = Registry.GetValue("HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize", "EnableTransparency", 1)
      transparency = !Object.Equals(setting, 0)
    } catch (error System.Security.SecurityException) { transparency = false }
    catch (error UnauthorizedAccessException) { transparency = false }
    let enabled = transparency && !highContrast
    var material = switch options.Material {
      case WindowsBackdropMaterial.Automatic: 0
      case WindowsBackdropMaterial.Mica: 2
      case WindowsBackdropMaterial.MicaAlt: 4
      default: 3
    }
    if !enabled { material = 1 }
    if material != appliedMaterial {
      let accepted = DwmSetWindowAttribute(window, 38u, ref material, 4u) >= 0
      appliedMaterial = accepted ? material : -1
      available = accepted && enabled
    }
    return available
  }

  public func Dispose() {
    if disposed { return }
    disposed = true
    if !frameExtended { return }
    var material = 1
    DwmSetWindowAttribute(window, 38u, ref material, 4u)
    var margins = BackdropWindowsMargins{}
    DwmExtendFrameIntoClientArea(window, ref margins)
    available = false
  }

  shared {
    internal func ComputeMaximizedWorkRect(monitor WindowsRect, work WindowsRect, autoHideEdges uint32) WindowsRect {
      var left = work.Left
      var top = work.Top
      var right = work.Right
      var bottom = work.Bottom
      if (autoHideEdges & 1u) != 0u && work.Left == monitor.Left && left < right { left = left + 1 }
      if (autoHideEdges & 2u) != 0u && work.Top == monitor.Top && top < bottom { top = top + 1 }
      if (autoHideEdges & 4u) != 0u && work.Right == monitor.Right && right > left { right = right - 1 }
      if (autoHideEdges & 8u) != 0u && work.Bottom == monitor.Bottom && bottom > top { bottom = bottom - 1 }
      return WindowsRect(left, top, right, bottom)
    }

    internal func SetFrameTheme(window nint, theme SystemTheme) {
      if window == nint(0) { return }
      var dark = theme == SystemTheme.Dark ? 1 : 0
      DwmSetWindowAttribute(window, 20u, ref dark, 4u)
    }

    internal func SetTransparent(window nint, transparent bool) {
      if window == nint(0) { return }
      lock (stateGate) {
        var state = ReadStateLocked(window)
        state.Transparent = transparent
        windowStates[window] = state
      }
    }

    internal func IsFullscreen(window nint) bool {
      if window == nint(0) { return false }
      lock (stateGate) {
        return windowStates.TryGetValue(window, out var state) && state.Fullscreen
      }
    }

    internal func ClearWindow(window nint) {
      if window == nint(0) { return }
      lock (stateGate) {
        windowStates.Remove(window)
      }
    }

    internal func SetFullscreen(window nint, fullscreen bool) {
      if window == nint(0) { return }
      var decorated = true
      lock (stateGate) {
        decorated = ReadStateLocked(window).Decorated
      }
      SetFullscreen(window, fullscreen, decorated)
    }

    internal func SetFullscreen(window nint, fullscreen bool, decorated bool) {
      if window == nint(0) { return }
      var wasFullscreen = false
      lock (stateGate) {
        var state = ReadStateLocked(window)
        wasFullscreen = state.Fullscreen
        state.Fullscreen = fullscreen
        state.Decorated = decorated
        windowStates[window] = state
      }
      if fullscreen {
        var corner = 1
        DwmSetWindowAttribute(window, 33u, ref corner, 4u)
      } else if wasFullscreen {
        ApplyCaption(window, decorated)
      } else {
        var corner = CornerPreference(window, decorated)
        DwmSetWindowAttribute(window, 33u, ref corner, 4u)
        if !decorated {
          EnsureCaptionSubclass(window)
          let style = GetWindowLongPtr(window, -16)
          let stripped = style & ~CaptionStyle(style)
          if stripped != style {
            SetWindowLongPtr(window, -16, stripped)
            SetWindowPos(window, nint(0), 0, 0, 0, 0, 0x37u)
          }
        }
      }
    }

    internal func EnsureFullscreenBounds(window nint) {
      if window == nint(0) || !IsFullscreen(window) || IsZoomed(window) == 0 { return }
      let style = GetWindowLongPtr(window, -16)
      if (style & nint(0x01000000)) != nint(0) {
        SetWindowLongPtr(window, -16, style & ~nint(0x01000000))
      }
      let monitorHandle = MonitorFromWindow(window, 2u)
      if monitorHandle != nint(0) {
        var info = WindowsMonitorInfo{Size: uint32(Marshal.SizeOf[WindowsMonitorInfo]())}
        if GetMonitorInfo(monitorHandle, ref info) != 0 {
          SetWindowPos(
            window,
            nint(0),
            info.Monitor.Left,
            info.Monitor.Top,
            info.Monitor.Right - info.Monitor.Left,
            info.Monitor.Bottom - info.Monitor.Top,
            0x34u
          )
          return
        }
      }
      SetWindowPos(window, nint(0), 0, 0, 0, 0, 0x37u)
    }

    internal func SetMaximizedCorner(window nint, maximized bool, decorated bool) {
      if window == nint(0) || IsFullscreen(window) { return }
      var corner = if decorated { 0 } else if maximized { 1 } else { 2 }
      DwmSetWindowAttribute(window, 33u, ref corner, 4u)
    }

    internal func SetCaption(window nint, decorated bool) {
      if window == nint(0) { return }
      var fullscreen = false
      lock (stateGate) {
        var state = ReadStateLocked(window)
        state.Decorated = decorated
        fullscreen = state.Fullscreen
        windowStates[window] = state
      }
      if fullscreen { return }
      ApplyCaption(window, decorated)
    }

    private func ApplyCaption(window nint, decorated bool) {
      var corner = CornerPreference(window, decorated)
      DwmSetWindowAttribute(window, 33u, ref corner, 4u)
      if decorated {
        if captionAddress != nint(0) { RemoveWindowSubclass(window, captionAddress, nuint(1)) }
      } else {
        EnsureCaptionSubclass(window)
      }
      let style = GetWindowLongPtr(window, -16)
      SetWindowLongPtr(window, -16, decorated ? style | CaptionStyle(style) : style & ~CaptionStyle(style))
      SetWindowPos(window, nint(0), 0, 0, 0, 0, 0x37u)
    }

    private func EnsureCaptionSubclass(window nint) {
      if captionAddress == nint(0) {
        captionCallback = CaptionMessage
        captionAddress = Marshal.GetFunctionPointerForDelegate(captionCallback!!)
      }
      SetWindowSubclass(window, captionAddress, nuint(1), nuint(0))
    }

    private func ReadStateLocked(window nint) WindowsBackdropWindowState ->
      if windowStates.TryGetValue(window, out var existing) { existing } else { WindowsBackdropWindowState{Decorated: true} }

    private func CornerPreference(window nint, decorated bool) int32 ->
      if decorated { 0 } else if IsZoomed(window) != 0 { 1 } else { 2 }

    private func IsTransparent(window nint) bool {
      if window == nint(0) { return false }
      lock (stateGate) {
        return windowStates.TryGetValue(window, out var state) && state.Transparent
      }
    }

    private func CaptionStyle(style nint) nint -> (style & nint(0x40000)) != nint(0) ? nint(0xC80000) : nint(0x80000)

    private func SizingFrame(window nint) bool -> (GetWindowLongPtr(window, -16) & nint(0xC40000)) == nint(0x40000)

    private func ProbeAutoHideEdges(monitor WindowsRect) uint32 {
      var stateData = WindowsAppBarData{Size: uint32(Marshal.SizeOf[WindowsAppBarData]())}
      if (SHAppBarMessage(4u, ref stateData) & nuint(1u)) == nuint(0u) { return 0u }
      var edges = 0u
      for edge in 0 ... 4 {
        var barData = WindowsAppBarData{
          Size: uint32(Marshal.SizeOf[WindowsAppBarData]()),
          Edge: uint32(edge),
          Rect: monitor,
        }
        if SHAppBarMessage(0x0Bu, ref barData) != nuint(0u) {
          edges = edges | (1u << edge)
        }
      }
      return edges
    }

    private func TryGetMaximizedWorkRect(window nint, out monitor WindowsRect, out adjusted WindowsRect) bool {
      let handle = MonitorFromWindow(window, 2u)
      if handle == nint(0) {
        monitor = default(WindowsRect)
        adjusted = default(WindowsRect)
        return false
      }
      var info = WindowsMonitorInfo{Size: uint32(Marshal.SizeOf[WindowsMonitorInfo]())}
      if GetMonitorInfo(handle, ref info) == 0 {
        monitor = default(WindowsRect)
        adjusted = default(WindowsRect)
        return false
      }
      monitor = info.Monitor
      adjusted = ComputeMaximizedWorkRect(info.Monitor, info.Work, ProbeAutoHideEdges(info.Monitor))
      return true
    }

    private func CaptionMessage(window nint, message uint32, wparam nuint, lparam nint, id nuint, data nuint) nint {
      if message == 0x82u {
        ClearWindow(window)
        RemoveWindowSubclass(window, captionAddress, nuint(1))
        return DefSubclassProc(window, message, wparam, lparam)
      }
      if IsFullscreen(window) {
        return DefSubclassProc(window, message, wparam, lparam)
      }
      if message == 0x7Cu && (wparam & nuint(0xffffffffu)) == nuint(0xfffffff0u) {
        let style = nint(Marshal.ReadInt32(lparam, 4))
        Marshal.WriteInt32(lparam, 4, int32(style & ~CaptionStyle(style)))
      } else if message == 0x84u && SizingFrame(window) {
        let hit = DefWindowProc(window, message, wparam, lparam)
        if hit >= nint(10) && hit <= nint(17) { return hit }
      } else if message == 0x24u && lparam != nint(0) && SizingFrame(window) {
        let result = DefSubclassProc(window, message, wparam, lparam)
        if TryGetMaximizedWorkRect(window, out var monitor, out var adjusted) {
          let maxWidth = adjusted.Right - adjusted.Left
          let maxHeight = adjusted.Bottom - adjusted.Top
          Marshal.WriteInt32(lparam, 8, maxWidth)
          Marshal.WriteInt32(lparam, 12, maxHeight)
          Marshal.WriteInt32(lparam, 16, adjusted.Left - monitor.Left)
          Marshal.WriteInt32(lparam, 20, adjusted.Top - monitor.Top)
          let maxTrackWidth = Marshal.ReadInt32(lparam, 32)
          let maxTrackHeight = Marshal.ReadInt32(lparam, 36)
          if maxTrackWidth < maxWidth { Marshal.WriteInt32(lparam, 32, maxWidth) }
          if maxTrackHeight < maxHeight { Marshal.WriteInt32(lparam, 36, maxHeight) }
          return nint(0)
        }
        return result
      } else if message == 0x83u && wparam != nuint(0) && SizingFrame(window) && IsZoomed(window) != 0 {
        if TryGetMaximizedWorkRect(window, out var _, out var adjusted) {
          Marshal.WriteInt32(lparam, 0, adjusted.Left)
          Marshal.WriteInt32(lparam, 4, adjusted.Top)
          Marshal.WriteInt32(lparam, 8, adjusted.Right)
          Marshal.WriteInt32(lparam, 12, adjusted.Bottom)
          return nint(0)
        }
      } else if message == 0x46u && lparam != nint(0) && IsTransparent(window) {
        let flagsOffset = nint.Size * 2 + 16
        let flags = uint32(Marshal.ReadInt32(lparam, flagsOffset))
        if (flags & 0x0001u) == 0u {
          Marshal.WriteInt32(lparam, flagsOffset, int32(flags | 0x0100u))
        }
      }
      return DefSubclassProc(window, message, wparam, lparam)
    }

    private let stateGate Object = Object()
    private let windowStates Dictionary[nint, WindowsBackdropWindowState] = Dictionary[nint, WindowsBackdropWindowState]()
    private var captionCallback SdlTitlebarSubclass?
    private var captionAddress nint

    @DllImport("dwmapi.dll") private func DwmSetWindowAttribute(window nint, attribute uint32, ref value int32, size uint32) int32;
    @DllImport("dwmapi.dll") private func DwmExtendFrameIntoClientArea(window nint, ref margins BackdropWindowsMargins) int32;
    @DllImport("comctl32.dll") private func SetWindowSubclass(window nint, callback nint, id nuint, data nuint) int32;
    @DllImport("comctl32.dll") private func RemoveWindowSubclass(window nint, callback nint, id nuint) int32;
    @DllImport("comctl32.dll") private func DefSubclassProc(window nint, message uint32, wparam nuint, lparam nint) nint;
    @DllImport("user32.dll", EntryPoint: "GetWindowLongPtrW") private func GetWindowLongPtr(window nint, index int32) nint;
    @DllImport("user32.dll", EntryPoint: "SetWindowLongPtrW") private func SetWindowLongPtr(window nint, index int32, value nint) nint;
    @DllImport("user32.dll") private func SetWindowPos(window nint, after nint, x int32, y int32, width int32, height int32, flags uint32) int32;
    @DllImport("user32.dll", EntryPoint: "DefWindowProcW") private func DefWindowProc(window nint, message uint32, wparam nuint, lparam nint) nint;
    @DllImport("user32.dll") private func IsZoomed(window nint) int32;
    @DllImport("user32.dll") private func MonitorFromWindow(window nint, flags uint32) nint;
    @DllImport("user32.dll", EntryPoint: "GetMonitorInfoW") private func GetMonitorInfo(monitor nint, ref info WindowsMonitorInfo) int32;
    @DllImport("shell32.dll") private func SHAppBarMessage(message uint32, ref data WindowsAppBarData) nuint;
    @DllImport("user32.dll", EntryPoint: "SystemParametersInfoW")
    private func SystemParametersInfo(action uint32, parameter uint32, ref value BackdropWindowsContrast, flags uint32) int32;
  }
}
