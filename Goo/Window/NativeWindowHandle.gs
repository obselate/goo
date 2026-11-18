package Goo

/// Identifies a borrowed desktop window representation.
public enum NativeWindowKind {
  /// No supported native window is available.
  Unsupported;
  /// A Win32 HWND.
  Win32;
  /// A macOS NSWindow.
  Cocoa;
  /// A Wayland wl_surface and wl_display.
  Wayland;
  /// An X11 Window and Display.
  X11;
}

/// Borrows native window identifiers without owning them or blocking Goo input.
public struct NativeWindowHandle {
  private let kind NativeWindowKind
  private let handle nint
  private let display nint

  internal init(kind NativeWindowKind, handle nint, display nint) {
    this.kind = kind
    this.handle = handle
    this.display = display
  }

  /// Gets the native representation, or Unsupported when unavailable.
  public prop Kind NativeWindowKind{ get -> kind }
  /// Gets the HWND, NSWindow, wl_surface or X11 Window. Zero means unavailable.
  public prop Handle nint{ get -> handle }
  /// Gets the wl_display or X11 Display. Zero on other platforms or when unavailable.
  public prop Display nint{ get -> display }
}

/// Exposes a borrowed desktop window without changing input ownership.
public partial class Window {
  /// Gets the current native desktop window on the UI thread after Open.
  /// Returns Unsupported before Open, during close, and on embedded hosts, including Android.
  /// Reading this property never blocks Goo input or changes focus.
  /// The identifiers expire when close begins or the native window is replaced. Read again after native changes.
  /// Do not destroy the window or display. Apps own child layout, focus, input and child cleanup before close.
  public prop NativeHandle NativeWindowHandle{
    get {
      requireUiThread("Window.NativeHandle")
      if !IsOpen || host?.IsClosing == true { return default(NativeWindowHandle) }
      return (host as SdlHost?)?.GetNativeWindowHandle() ?? default(NativeWindowHandle)
    }
  }
}
