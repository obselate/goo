package Goo

import System
import System.Runtime.InteropServices
import System.Text

internal unsafe partial class SdlHost {
  internal func AccessibilityWindowHandle() nint {
    let name = if OperatingSystem.IsWindows() { "SDL.window.win32.hwnd" } else { "SDL.window.cocoa.window" }
    let key = Marshal.StringToCoTaskMemUTF8(name)
    try { return AccessKitWindowPointer(AccessKitWindowProperties(windowHandle), key, nint(0)) }
    finally { Marshal.FreeCoTaskMem(key) }
  }
  internal func InstallAccessibilityFocusForwarder(handle nint) {
    let name = AccessKitObjcClassName(AccessKitObjcClass(handle))
    let text = Marshal.PtrToStringUTF8(name) ?? ""
    if text.Length == 0 { throw PlatformNotSupportedException("The Cocoa window has no Objective-C class") }
    AccessKitNative.MacFocusForwarder(name, uint64(Encoding.UTF8.GetByteCount(text)))
  }
}
@DllImport("SDL3", EntryPoint: "SDL_GetWindowProperties", CallingConvention: CallingConvention.Cdecl)
internal func AccessKitWindowProperties(window nint) uint32;
@DllImport("SDL3", EntryPoint: "SDL_GetPointerProperty", CallingConvention: CallingConvention.Cdecl)
internal func AccessKitWindowPointer(properties uint32, name nint, fallback nint) nint;
@DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "object_getClass", CallingConvention: CallingConvention.Cdecl)
internal func AccessKitObjcClass(value nint) nint;
@DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "class_getName", CallingConvention: CallingConvention.Cdecl)
internal func AccessKitObjcClassName(value nint) nint;

/// Hosts the optional native accessibility bridge on the window owner thread.
public partial class Window {
  internal prop IsNativeAccessibilityThread bool{ get -> Environment.CurrentManagedThreadId == ownerThreadId }
  internal func RequireNativeAccessibilityThread() -> requireUiThread("NativeAccessibilityAdapter")
  internal func RequestNativeAccessibilityDelivery(adapter NativeAccessibilityAdapter) {
    if accessibility?.Adapter != adapter || !IsOpen { return }
    accessibility!!.RequestDelivery()
    requestRender()
  }
  internal func ReportNativeAccessibilityError(error Exception) -> accessibility?.ReportError(error)
  internal func NativeAccessibilityNodeFor(id AccessibilityId) Node ? -> accessibility?.NodeFor(id)
}
