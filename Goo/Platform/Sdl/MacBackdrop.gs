package Goo

import System
import System.Diagnostics
import System.Runtime.InteropServices

@StructLayout(LayoutKind.Sequential)
internal struct BackdropMacRect {
  internal var X float64
  internal var Y float64
  internal var Width float64
  internal var Height float64
}

@StructLayout(LayoutKind.Sequential)
internal struct BackdropMacSize {
  internal var Width float64
  internal var Height float64
}

internal class MacBackdrop : NativeBackdrop {
  private var view nint
  private var workspace nint
  private var available bool
  private var nextRefresh int64
  private var options MacOSBackdropOptions
  private var configured bool

  internal init(window nint, width int32, height int32) {
    if window == nint(0) { return }
    let content = Send(window, sel_registerName("contentView"))
    let viewClass = objc_getClass("NSVisualEffectView")
    if content == nint(0) || viewClass == nint(0) { return }
    view = Send(Send(viewClass, sel_registerName("alloc")), sel_registerName("init"))
    if view == nint(0) { return }
    SetFrame(view, sel_registerName("setFrame:"), BackdropMacRect{Width: float64(width), Height: float64(height)})
    SetValue(view, sel_registerName("setAutoresizingMask:"), nint(18))
    SetValue(view, sel_registerName("setBlendingMode:"), nint(0))
    AddSubview(content, sel_registerName("addSubview:positioned:relativeTo:"), view, nint(-1), nint(0))
    workspace = Send(objc_getClass("NSWorkspace"), sel_registerName("sharedWorkspace"))
  }

  internal func Configure(value MacOSBackdropOptions) {
    if view == nint(0) || (configured && options == value) { return }
    if !configured || !Object.ReferenceEquals(options.Mask, value.Mask) {
      let mask = if let source = value.Mask { CreateMask(source) } else { nint(0) }
      try { SetValue(view, sel_registerName("setMaskImage:"), mask) }
      finally { if mask != nint(0) { Send(mask, sel_registerName("release")) } }
    }
    let material = value.Material == MacOSBackdropMaterial.UnderWindowBackground ? 21 : int32(value.Material)
    SetValue(view, sel_registerName("setMaterial:"), nint(material))
    SetValue(view, sel_registerName("setState:"), nint(value.State))
    SetBool(view, sel_registerName("setEmphasized:"), value.Emphasized ? uint8(1) : uint8(0))
    options = value
    configured = true
  }

  public func Refresh() bool {
    if view == nint(0) { return false }
    let now = Stopwatch.GetTimestamp()
    if now < nextRefresh { return available }
    nextRefresh = now + Stopwatch.Frequency
    available = workspace != nint(0)
      && GetBool(workspace, sel_registerName("accessibilityDisplayShouldReduceTransparency")) == uint8(0)
      && GetBool(workspace, sel_registerName("accessibilityDisplayShouldIncreaseContrast")) == uint8(0)
    SetValue(view, sel_registerName("setHidden:"), available ? nint(0) : nint(1))
    return available
  }

  public func Dispose() {
    if view == nint(0) { return }
    Send(view, sel_registerName("removeFromSuperview"))
    Send(view, sel_registerName("release"))
    view = nint(0)
    available = false
  }

  shared {
    internal func SetFrameTheme(window nint, theme SystemTheme) {
      if window == nint(0) { return }
      var appearance nint
      if theme != SystemTheme.Unknown {
        let name = theme == SystemTheme.Dark ? "NSAppearanceNameDarkAqua" : "NSAppearanceNameAqua"
        let text = SendText(objc_getClass("NSString"), sel_registerName("stringWithUTF8String:"), name)
        appearance = SendValue(objc_getClass("NSAppearance"), sel_registerName("appearanceNamed:"), text)
      }
      SetValue(window, sel_registerName("setAppearance:"), appearance)
    }

    internal func SetContentUnderTitlebar(window nint, enabled bool) {
      if window == nint(0) { return }
      let style = Send(window, sel_registerName("styleMask"))
      SetValue(window, sel_registerName("setStyleMask:"), enabled ? style | nint(32768) : style & ~nint(32768))
      SetBool(window, sel_registerName("setTitlebarAppearsTransparent:"), enabled ? uint8(1) : uint8(0))
      SetValue(window, sel_registerName("setTitleVisibility:"), enabled ? nint(1) : nint(0))
    }

    internal func ContentBounds(window nint, pixels bool = false) BackdropMacRect {
      var bounds = ReadRect(Send(window, sel_registerName("contentView")), "bounds")
      if pixels {
        let scale = GetDouble(window, sel_registerName("backingScaleFactor"))
        bounds.Width *= scale
        bounds.Height *= scale
      }
      return bounds
    }

    internal func ControlsRect(window nint) ElementRect? {
      if window == nint(0) || (Send(window, sel_registerName("styleMask")) & nint(16384)) != nint(0) { return nil }
      let content = Send(window, sel_registerName("contentView"))
      if content == nint(0) { return nil }
      let bounds = ReadRect(content, "bounds")
      let layout = ReadRect(window, "contentLayoutRect")
      var left = Double.PositiveInfinity
      var right = 0.0
      var height = bounds.Height - layout.Y - layout.Height
      for index in 0 ... 3 {
        let button = SendValue(window, sel_registerName("standardWindowButton:"), nint(index))
        if button == nint(0) || GetBool(button, sel_registerName("isHiddenOrHasHiddenAncestor")) != uint8(0) { continue }
        let rect = ReadRect(button, "frame")
        let parent = Send(button, sel_registerName("superview"))
        let point = ConvertPoint(parent, sel_registerName("convertPoint:toView:"),
          SdlTitlebarMacPoint{X: rect.X, Y: rect.Y}, content)
        let opposite = ConvertPoint(parent, sel_registerName("convertPoint:toView:"),
          SdlTitlebarMacPoint{X: rect.X + rect.Width, Y: rect.Y + rect.Height}, content)
        left = Math.Min(left, Math.Min(point.X, opposite.X))
        right = Math.Max(right, Math.Max(point.X, opposite.X))
        let top = GetBool(content, sel_registerName("isFlipped")) != uint8(0)
          ? Math.Max(point.Y, opposite.Y) : bounds.Height - Math.Min(point.Y, opposite.Y)
        height = Math.Max(height, top)
      }
      return Double.IsPositiveInfinity(left) ? nil : ElementRect{X: left, Width: right - left, Height: height}
    }

    private func ReadRect(receiver nint, name string) BackdropMacRect {
      let selector = sel_registerName(name)
      if RuntimeInformation.ProcessArchitecture == Architecture.X64 {
        GetRectX64(out var rect, receiver, selector)
        return rect
      }
      return GetRect(receiver, selector)
    }

    private func CreateMask(mask WindowBackdropMask) nint {
      let colorSpace = CGColorSpaceCreateDeviceRGB()
      if colorSpace == nint(0) { throw InvalidOperationException("Unable to create backdrop mask color space") }
      var context nint
      var image nint
      try {
        context = CGBitmapContextCreate(nint(0), nuint(mask.Width), nuint(mask.Height), nuint(8),
          nuint(mask.Width * 4), colorSpace, 0x4001u)
        if context == nint(0) { throw InvalidOperationException("Unable to create backdrop mask bitmap") }
        Marshal.Copy(mask.Pixels, 0, CGBitmapContextGetData(context), mask.Pixels.Length)
        image = CGBitmapContextCreateImage(context)
        if image == nint(0) { throw InvalidOperationException("Unable to create backdrop mask image") }
        let result = InitImage(Send(objc_getClass("NSImage"), sel_registerName("alloc")),
          sel_registerName("initWithCGImage:size:"), image,
          BackdropMacSize{Width: float64(mask.Width), Height: float64(mask.Height)})
        if result == nint(0) { throw InvalidOperationException("Unable to create native backdrop mask") }
        return result
      } finally {
        if image != nint(0) { CGImageRelease(image) }
        if context != nint(0) { CGContextRelease(context) }
        CGColorSpaceRelease(colorSpace)
      }
    }

    @DllImport("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics") private func CGColorSpaceCreateDeviceRGB() nint;
    @DllImport("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics") private func CGColorSpaceRelease(space nint);
    @DllImport("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics") private func CGBitmapContextCreate(data nint, width nuint, height nuint,
      bitsPerComponent nuint, bytesPerRow nuint, colorSpace nint, bitmapInfo uint32) nint;
    @DllImport("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics") private func CGBitmapContextGetData(context nint) nint;
    @DllImport("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics") private func CGBitmapContextCreateImage(context nint) nint;
    @DllImport("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics") private func CGContextRelease(context nint);
    @DllImport("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics") private func CGImageRelease(image nint);
    @DllImport("/usr/lib/libobjc.A.dylib") private func objc_getClass(name string) nint;
    @DllImport("/usr/lib/libobjc.A.dylib") private func sel_registerName(name string) nint;
    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func Send(receiver nint, selector nint) nint;
    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func GetBool(receiver nint, selector nint) uint8;
    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func GetDouble(receiver nint, selector nint) float64;
    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func SendValue(receiver nint, selector nint, value nint) nint;
    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func SendText(receiver nint, selector nint, value string) nint;
    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func GetRect(receiver nint, selector nint) BackdropMacRect;
    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend_stret") private func GetRectX64(out rect BackdropMacRect, receiver nint, selector nint);
    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func ConvertPoint(receiver nint, selector nint,
      point SdlTitlebarMacPoint, view nint) SdlTitlebarMacPoint;
    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func SetValue(receiver nint, selector nint, value nint);
    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func SetBool(receiver nint, selector nint, value uint8);
    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func InitImage(receiver nint, selector nint, image nint, size BackdropMacSize) nint;
    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func SetFrame(receiver nint, selector nint, frame BackdropMacRect);
    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func AddSubview(receiver nint, selector nint, view nint, ordering nint, relative nint);
  }
}
