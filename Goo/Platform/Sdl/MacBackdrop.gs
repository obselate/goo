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
    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func SetValue(receiver nint, selector nint, value nint);
    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func SetBool(receiver nint, selector nint, value uint8);
    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func InitImage(receiver nint, selector nint, image nint, size BackdropMacSize) nint;
    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func SetFrame(receiver nint, selector nint, frame BackdropMacRect);
    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func AddSubview(receiver nint, selector nint, view nint, ordering nint, relative nint);
  }
}
