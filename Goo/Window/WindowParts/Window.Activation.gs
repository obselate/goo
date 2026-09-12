package Goo

/// Reports whether a native window activation request could be submitted.
/// Accepted does not confirm focus; desktop policy may deny or ignore the request.
public enum WindowActivationResult { Accepted; Closed; Unsupported; Failed }

/// Hosts a Goo tree in a native window.
public partial class Window {
  /// Requests restoration of a minimized window, raising, and keyboard activation.
  /// Call on the owning UI thread in response to a user action. Desktop policy
  /// controls the outcome; observe IsFocused and FocusChanged for actual focus.
  /// Maximized/fullscreen state and the focused Goo element are preserved.
  /// Returns Closed before Open or after close, Unsupported for embedded hosts,
  /// or Failed if the native request reports an immediate error. Asynchronous
  /// policy denials are not reported by the desktop backend.
  /// Wayland requests use SDL's xdg-activation token and recent input serial.
  public func RequestActivation() WindowActivationResult {
    requireUiThread("Window.RequestActivation")
    if !IsOpen { return WindowActivationResult.Closed }
    guard let native = host else { return WindowActivationResult.Closed }
    if native.IsClosing { return WindowActivationResult.Closed }
    return native.RequestActivation()
  }
}
