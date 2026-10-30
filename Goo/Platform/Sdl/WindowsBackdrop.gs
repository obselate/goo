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
      SetWindowLongPtr(window, -16, decorated ? style | nint(0x80000) : style & ~nint(0x80000))
      SetWindowPos(window, nint(0), 0, 0, 0, 0, 0x37u)
    }

    private func CaptionMessage(window nint, message uint32, wparam nuint, lparam nint, id nuint, data nuint) nint {
      if message == 0x7Cu && (wparam & nuint(0xffffffffu)) == nuint(0xfffffff0u) {
        Marshal.WriteInt32(lparam, 4, Marshal.ReadInt32(lparam, 4) & ~0x80000)
      } else if message == 0x82u {
        RemoveWindowSubclass(window, captionAddress, nuint(1))
      }
      return DefSubclassProc(window, message, wparam, lparam)
    }

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
    @DllImport("user32.dll", EntryPoint: "SystemParametersInfoW")
    private func SystemParametersInfo(action uint32, parameter uint32, ref value BackdropWindowsContrast, flags uint32) int32;
  }
}
