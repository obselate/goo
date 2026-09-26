package Goo

/// Hosts a Goo tree in a native window.
public partial class Window {
  /// Requests restoration of a minimized window, raising, and keyboard activation.
  /// Call on the owning UI thread in response to a user action. Desktop policy
  /// controls the outcome; observe IsFocused and FocusChanged for actual focus.
  /// Maximized/fullscreen state and the focused Goo element are preserved.
  /// Redirects to the active modal child. Returns Closed before Open or after close,
  /// Unsupported for embedded hosts, nonfocusable windows, or an active native chooser,
  /// or Failed if the native request reports an immediate error. Asynchronous
  /// policy denials are not reported by the desktop backend.
  /// Wayland requests use SDL's xdg-activation token and recent input serial.
  public func RequestActivation() WindowOperationResult {
    requireUiThread("Window.RequestActivation")
    if !IsOpen { return WindowOperationResult.Closed }
    if !focusable || family?.Dialog != nil { return WindowOperationResult.Unsupported }
    if let child = family?.BlockingChild { return child.RequestActivation() }
    guard let native = host else { return WindowOperationResult.Closed }
    let result = if native.IsClosing { WindowOperationResult.Closed } else { native.RequestActivation() }
    observeVisibility()
    return result
  }
}
