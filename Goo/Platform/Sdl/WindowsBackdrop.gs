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
    @DllImport("dwmapi.dll") private func DwmSetWindowAttribute(window nint, attribute uint32, ref value int32, size uint32) int32;
    @DllImport("dwmapi.dll") private func DwmExtendFrameIntoClientArea(window nint, ref margins BackdropWindowsMargins) int32;
    @DllImport("user32.dll", EntryPoint: "SystemParametersInfoW")
    private func SystemParametersInfo(action uint32, parameter uint32, ref value BackdropWindowsContrast, flags uint32) int32;
  }
}
