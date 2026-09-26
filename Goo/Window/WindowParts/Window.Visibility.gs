package Goo

import System

/// Reports whether a window operation was submitted to the host.
/// Accepted does not guarantee that desktop policy grants activation or stacking.
public enum WindowOperationResult { Accepted; Closed; Unsupported; Failed }

/// Reports native lifecycle operations supported by the current host.
@Flags
public enum WindowCapabilities {
  None = 0;
  Visibility = 1;
  ShowWithoutActivation = 2;
  Focusability = 4;
  Topmost = 8;
}

/// Controls visibility and desktop activation policy without destroying the tree.
public partial class Window {
  private var initiallyVisible bool = true
  private var focusable bool = true
  private var topmost bool
  private var observedVisible bool

  /// Gets or sets whether Open shows the desktop window. Configure before Open.
  public prop InitiallyVisible bool {
    get -> initiallyVisible
    set(value) {
      requireUiThread("Window.InitiallyVisible")
      if IsOpen { throw InvalidOperationException("Initial visibility must be configured before Open") }
      initiallyVisible = value
    }
  }

  /// Gets whether the host currently reports a visible viewport. This does not imply focus or lack of occlusion.
  public prop IsVisible bool { get -> IsOpen && host?.IsVisible == true }

  /// Gets supported native lifecycle operations, or None before Open or Attach.
  public prop Capabilities WindowCapabilities { get -> host?.Capabilities ?? WindowCapabilities.None }

  /// Gets or sets whether the desktop window may receive keyboard focus.
  /// Unsupported hosts throw before changing the requested value. Modal windows must remain focusable.
  public prop Focusable bool {
    get -> focusable
    set(value) {
      requireUiThread("Window.Focusable")
      if focusable == value { return }
      if !value && (Modal || IsInputBlocked) { throw InvalidOperationException("A modal window or its blocked owner must remain focusable") }
      host?.SetFocusable(value)
      focusable = value
      if !value && IsOpen { handleFocusChanged(false) }
    }
  }

  /// Gets or sets requested desktop topmost stacking. Desktop policy controls the final stacking order.
  /// Unsupported hosts throw before changing the requested value.
  public prop Topmost bool {
    get -> topmost
    set(value) {
      requireUiThread("Window.Topmost")
      if topmost == value { return }
      host?.SetTopmost(value)
      topmost = value
    }
  }

  /// Reports observed viewport visibility changes on the owner thread.
  public event VisibilityChanged Action[bool] {
    add {
      requireUiThread("Window.VisibilityChanged")
      notifications.AddVisibilityChanged(value)
    }
    remove {
      requireUiThread("Window.VisibilityChanged")
      notifications.RemoveVisibilityChanged(value)
    }
  }

  /// Shows an open desktop window, optionally requesting activation. The mounted tree survives Hide.
  /// Nonfocusable windows never request activation. Embedded hosts return Unsupported.
  public func Show(activate bool = true) WindowOperationResult {
    requireUiThread("Window.Show")
    guard let native = host else { return WindowOperationResult.Closed }
    if !IsOpen || native.IsClosing { return WindowOperationResult.Closed }
    let result = native.Show(activate && focusable && !IsInputBlocked)
    observeVisibility()
    if result == WindowOperationResult.Accepted && activate && IsInputBlocked {
      family?.BlockingChild?.RequestActivation()
    }
    return result
  }

  /// Hides an open desktop window and cancels transient input without destroying its tree.
  /// Modal windows and owners blocked by a modal child or chooser cannot be hidden.
  public func Hide() WindowOperationResult {
    requireUiThread("Window.Hide")
    guard let native = host else { return WindowOperationResult.Closed }
    if !IsOpen || native.IsClosing { return WindowOperationResult.Closed }
    if Modal || IsInputBlocked { return WindowOperationResult.Unsupported }
    let result = native.Hide()
    observeVisibility()
    return result
  }

  private func observeVisibility() {
    let visible = IsVisible
    if observedVisible == visible { return }
    observedVisible = visible
    if visible { requestRender() } else { handleFocusChanged(false) }
    notifications.RaiseVisibilityChanged(visible)
  }
}
