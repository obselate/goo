package Goo

import Microsoft.Win32
import System
import System.Diagnostics
import System.Runtime.InteropServices

@StructLayout(LayoutKind.Sequential)
internal struct BackdropWindowsMargins {
  internal var Left int32
  internal var Right int32
  internal var Top int32
  internal var Bottom int32
}

@StructLayout(LayoutKind.Sequential)
internal struct BackdropWindowsBlurBehind {
  internal var Flags uint32
  internal var Enable int32
  internal var Region nint
  internal var TransitionOnMaximized int32
}

@StructLayout(LayoutKind.Sequential)
internal struct BackdropWindowsRect {
  internal var Left int32
  internal var Top int32
  internal var Right int32
  internal var Bottom int32
}

@StructLayout(LayoutKind.Sequential)
internal struct BackdropWindowsContrast {
  internal var Size uint32
  internal var Flags uint32
  internal var Scheme nint
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
    var blur = BackdropWindowsBlurBehind{Flags: 1u, Enable: 0}
    DwmEnableBlurBehindWindow(window, ref blur)
    SuppressTransparentErase(window)
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
    internal func SetFrameTheme(window nint, theme SystemTheme) {
      if window == nint(0) { return }
      var dark = theme == SystemTheme.Dark ? 1 : 0
      DwmSetWindowAttribute(window, 20u, ref dark, 4u)
    }

    internal func SetCaption(window nint, decorated bool) {
      if window == nint(0) { return }
      var corner = decorated ? 0 : 2
      DwmSetWindowAttribute(window, 33u, ref corner, 4u)
      if decorated {
        if captionAddress != nint(0) { RemoveWindowSubclass(window, captionAddress, nuint(1)) }
      } else {
        if captionAddress == nint(0) {
          captionCallback = CaptionMessage
          captionAddress = Marshal.GetFunctionPointerForDelegate(captionCallback!!)
        }
        SetWindowSubclass(window, captionAddress, nuint(1), nuint(0))
      }
      let style = GetWindowLongPtr(window, -16)
      SetWindowLongPtr(window, -16, decorated ? style | CaptionStyle(style) : style & ~CaptionStyle(style))
      SetWindowPos(window, nint(0), 0, 0, 0, 0, 0x37u)
    }

    private func CaptionStyle(style nint) nint -> (style & nint(0x40000)) != nint(0) ? nint(0xC80000) : nint(0x80000)

    private func SizingFrame(window nint) bool -> (GetWindowLongPtr(window, -16) & nint(0xC40000)) == nint(0x40000)

    private func HasCaption(window nint) bool -> (GetWindowLongPtr(window, -16) & nint(0xC00000)) == nint(0xC00000)

    private func CaptionMessage(window nint, message uint32, wparam nuint, lparam nint, id nuint, data nuint) nint {
      if message == 0x7Cu && (wparam & nuint(0xffffffffu)) == nuint(0xfffffff0u) {
        let style = nint(Marshal.ReadInt32(lparam, 4))
        Marshal.WriteInt32(lparam, 4, int32(style & ~CaptionStyle(style)))
      } else if message == 0x82u {
        RemoveWindowSubclass(window, captionAddress, nuint(1))
      } else if message == 0x84u && SizingFrame(window) {
        let hit = DefWindowProc(window, message, wparam, lparam)
        if hit >= nint(10) && hit <= nint(17) { return hit }
      } else if message == 0x83u && wparam != nuint(0) && SizingFrame(window) && IsZoomed(window) != 0 {
        let info = []int32{40, 0, 0, 0, 0, 0, 0, 0, 0, 0}
        if GetMonitorInfo(MonitorFromWindow(window, 2u), info) != 0 {
          Marshal.Copy(info, 5, lparam, 4)
          return nint(0)
        }
      }
      return DefSubclassProc(window, message, wparam, lparam)
    }

    private var captionCallback SdlTitlebarSubclass?
    private var captionAddress nint
    private var eraseCallback SdlTitlebarSubclass?
    private var eraseAddress nint

    internal func SuppressTransparentErase(window nint) {
      if window == nint(0) { return }
      if eraseAddress == nint(0) {
        eraseCallback = EraseMessage
        eraseAddress = Marshal.GetFunctionPointerForDelegate(eraseCallback!!)
      }
      SetWindowSubclass(window, eraseAddress, nuint(2), nuint(0))
      ClearRedirectionSurface(window)
    }

    private func ClearRedirectionSurface(window nint) {
      var rect BackdropWindowsRect
      var dc nint
      if !HasCaption(window) {
        if GetWindowRect(window, out var windowRect) == 0 { return }
        rect = BackdropWindowsRect{
          Left: 0,
          Top: 0,
          Right: windowRect.Right - windowRect.Left,
          Bottom: windowRect.Bottom - windowRect.Top,
        }
        if rect.Right <= 0 || rect.Bottom <= 0 { return }
        dc = GetWindowDC(window)
      } else {
        if GetClientRect(window, out rect) == 0 { return }
        dc = GetDC(window)
      }
      if dc == nint(0) { return }
      try {
        let brush = GetStockObject(4)
        if brush != nint(0) { FillRect(dc, ref rect, brush) }
      } finally { ReleaseDC(window, dc) }
    }

    private func EraseMessage(window nint, message uint32, wparam nuint, lparam nint, id nuint, data nuint) nint {
      if message == 0x0046u && lparam != nint(0) {
        let flagsOffset = nint.Size * 2 + 16
        let flags = Marshal.ReadInt32(lparam, flagsOffset)
        if (flags & 0x0001) == 0 || (flags & 0x0020) != 0 {
          Marshal.WriteInt32(lparam, flagsOffset, flags | 0x0100)
        }
      } else if message == 0x0083u && wparam != nuint(0) && SizingFrame(window) && IsZoomed(window) == 0 {
        DefSubclassProc(window, message, wparam, lparam)
        return nint(0x0300)
      } else if message == 0x0085u && SizingFrame(window) {
        return nint(0)
      } else if message == 0x0086u && SizingFrame(window) {
        return DefSubclassProc(window, message, wparam, nint(-1))
      } else if message == 0x0014u {
        let dc = nint(wparam)
        if dc != nint(0) && GetClientRect(window, out var rect) != 0 {
          let brush = GetStockObject(4)
          if brush != nint(0) { FillRect(dc, ref rect, brush) }
        }
        return nint(1)
      }
      if message == 0x000Fu {
        ClearRedirectionSurface(window)
      } else if message == 0x0005u {
        let result = DefSubclassProc(window, message, wparam, lparam)
        ClearRedirectionSurface(window)
        return result
      } else if message == 0x0082u {
        RemoveWindowSubclass(window, eraseAddress, nuint(2))
      }
      return DefSubclassProc(window, message, wparam, lparam)
    }

    @DllImport("gdi32.dll") private func GetStockObject(index int32) nint;
    @DllImport("user32.dll") private func GetDC(window nint) nint;
    @DllImport("user32.dll") private func GetWindowDC(window nint) nint;
    @DllImport("user32.dll") private func ReleaseDC(window nint, dc nint) int32;
    @DllImport("user32.dll") private func GetClientRect(window nint, out rect BackdropWindowsRect) int32;
    @DllImport("user32.dll") private func GetWindowRect(window nint, out rect BackdropWindowsRect) int32;
    @DllImport("user32.dll") private func FillRect(dc nint, ref rect BackdropWindowsRect, brush nint) int32;
    @DllImport("dwmapi.dll") private func DwmEnableBlurBehindWindow(window nint, ref blurBehind BackdropWindowsBlurBehind) int32;
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
    @DllImport("user32.dll", EntryPoint: "GetMonitorInfoW") private func GetMonitorInfo(monitor nint, info []int32) int32;
    @DllImport("user32.dll", EntryPoint: "SystemParametersInfoW")
    private func SystemParametersInfo(action uint32, parameter uint32, ref value BackdropWindowsContrast, flags uint32) int32;
  }
}
