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

internal class MacBackdrop : NativeBackdrop {
  private var view nint
  private var workspace nint
  private var available bool
  private var nextRefresh int64

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
    SetValue(view, sel_registerName("setMaterial:"), nint(21))
    SetValue(view, sel_registerName("setState:"), nint(0))
    AddSubview(content, sel_registerName("addSubview:positioned:relativeTo:"), view, nint(-1), nint(0))
    workspace = Send(objc_getClass("NSWorkspace"), sel_registerName("sharedWorkspace"))
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
    @DllImport("/usr/lib/libobjc.A.dylib") private func objc_getClass(name string) nint;
    @DllImport("/usr/lib/libobjc.A.dylib") private func sel_registerName(name string) nint;
    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func Send(receiver nint, selector nint) nint;
    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func GetBool(receiver nint, selector nint) uint8;
    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func SetValue(receiver nint, selector nint, value nint);
    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func SetFrame(receiver nint, selector nint, frame BackdropMacRect);
    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func AddSubview(receiver nint, selector nint, view nint, ordering nint, relative nint);
  }
}
