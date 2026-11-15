package Goo

import System
import System.Threading

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
  private var observedOcclusion WindowOcclusion
  private var nativeHidePending bool
  private var nativeFocused bool

  /// Gets or sets whether Open shows the desktop window. Configure before Open.
  public prop InitiallyVisible bool {
    get -> ReadUntrackedWindowValue(initiallyVisible)
    set(value) {
      requireUiThread("Window.InitiallyVisible")
      if IsOpen { throw InvalidOperationException("Initial visibility must be configured before Open") }
      initiallyVisible = value
    }
  }

  /// Gets whether the host reports a visible viewport and no accepted Hide is pending. This does not imply focus or lack of occlusion.
  public prop IsVisible bool { get -> ReadUntrackedWindowValue(isOpen && !nativeHidePending && host?.IsVisible == true) }
  internal prop NativeInputSuppressed bool { get -> nativeHidePending }

  /// Gets occlusion on macOS, Wayland suspended surfaces and X11 hidden windows. Windows, embedded, Android and unreported states are Unknown.
  public prop Occlusion WindowOcclusion { get -> ReadUntrackedWindowValue(isOpen ? observedOcclusion : WindowOcclusion.Unknown) }

  /// Reports observed occlusion changes on the UI thread.
  public event OcclusionChanged Action[WindowOcclusion] {
    add {
      requireUiThread("Window.OcclusionChanged")
      notifications.AddOcclusionChanged(value)
    }
    remove {
      requireUiThread("Window.OcclusionChanged")
      notifications.RemoveOcclusionChanged(value)
    }
  }

  /// Gets supported native lifecycle operations, or None before Open or Attach.
  public prop Capabilities WindowCapabilities { get -> ReadUntrackedWindowValue(host?.Capabilities ?? WindowCapabilities.None) }

  /// Gets or sets whether the desktop window may receive keyboard focus.
  /// Unsupported hosts throw before changing the requested value. Modal windows must remain focusable.
  public prop Focusable bool {
    get -> ReadUntrackedWindowValue(focusable)
    set(value) {
      requireUiThread("Window.Focusable")
      if focusable == value { return }
      if !value && (Modal || IsInputBlocked) { throw InvalidOperationException("A modal window or its blocked owner must remain focusable") }
      host?.SetFocusable(value)
      focusable = value
      if !value && IsOpen { handleFocusChanged(false) }
    }
  }

  /// Gets or initializes the desktop topmost preference before Open.
  /// Use SetTopmost to change it at runtime. Desktop policy controls the final stacking order.
  public prop Topmost bool {
    get -> ReadUntrackedWindowValue(topmost)
    init -> topmost = value
  }

  /// Attempts to submit a topmost request to the current native host.
  /// Accepted means the host accepted the request; desktop policy still controls observed stacking.
  /// @returns Closed, Unsupported, Accepted, or Failed for the host operation.
  public func SetTopmost(value bool) WindowOperationResult {
    requireUiThread("Window.SetTopmost")
    guard let native = host else { return WindowOperationResult.Closed }
    if !IsOpen || native.IsClosing { return WindowOperationResult.Closed }
    if (native.Capabilities & WindowCapabilities.Topmost) == WindowCapabilities.None {
      topmost = value
      return WindowOperationResult.Unsupported
    }
    try {
      native.SetTopmost(value)
      topmost = value
      return WindowOperationResult.Accepted
    } catch (e Exception) {
      return WindowOperationResult.Failed
    }
  }

  /// Reports changes to IsVisible on the owner thread.
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
  /// Activation follows RequestActivation, including modal child routing. Nonfocusable windows show passively.
  /// Embedded hosts return Unsupported.
  public func Show(activate bool = true) WindowOperationResult {
    requireUiThread("Window.Show")
    if activate && focusable { return RequestActivation() }
    guard let native = host else { return WindowOperationResult.Closed }
    if !IsOpen || native.IsClosing { return WindowOperationResult.Closed }
    let result = native.ShowWithoutActivation()
    if result == WindowOperationResult.Accepted { cancelNativeHide() }
    observeVisibility()
    return result
  }

  /// Hides an open desktop window and cancels transient input without destroying its tree.
  /// Releases the swapchain and clip atlas after pending GPU work completes. Show recreates them.
  /// Modal windows and owners blocked by a modal child or chooser cannot be hidden.
  /// Visibility and input change immediately. Regular desktop unmapping can be deferred until pending queue calls complete.
  public func Hide() WindowOperationResult {
    requireUiThread("Window.Hide")
    guard let native = host else { return WindowOperationResult.Closed }
    if !IsOpen || native.IsClosing { return WindowOperationResult.Closed }
    if Modal || IsInputBlocked { return WindowOperationResult.Unsupported }
    if (native.Capabilities & WindowCapabilities.Visibility) == WindowCapabilities.None { return native.Hide() }
    if let target = windowTarget {
      target.SetHidden(true)
      if LayerShell != nil {
        while target.QueueWorkPending {
          target.PollQueueCompletion()
          if target.QueueWorkPending { Thread.Sleep(1) }
        }
        while target.RetirementWorkPending {
          target.PollQueueCompletion()
          if target.RetirementWorkPending { Thread.Sleep(1) }
        }
      } else if target.QueueWorkPending {
        nativeHidePending = true
        observeVisibility()
        native.Wake()
        return WindowOperationResult.Accepted
      }
    }
    return hideNative(native)
  }

  private func hideNative(native WindowHost) WindowOperationResult {
    let result = native.Hide()
    nativeHidePending = false
    if result != WindowOperationResult.Accepted { windowTarget?.SetHidden(false) }
    observeVisibility()
    return result
  }

  private func cancelNativeHide() {
    if !nativeHidePending { return }
    nativeHidePending = false
    windowTarget?.SetHidden(false)
    handleFocusChanged(nativeFocused)
  }

  private func observeOcclusion(value WindowOcclusion) {
    requireUiThread("Window.OcclusionChanged")
    if observedOcclusion == value { return }
    observedOcclusion = value
    notifications.RaiseOcclusionChanged(value)
  }

  private func observeVisibility() {
    let visible = IsVisible
    if observedVisible == visible { return }
    observedVisible = visible
    if visible {
      host?.RefreshMetricsIfChanged()
      consumeNativeMetrics()
      windowTarget?.SetHidden(false)
      requestRender()
    } else { handleFocusChanged(false) }
    if let manager = accessibility {
      if manager.Adapter is NativeAccessibilityAdapter {
        manager.RequestDelivery()
        manager.Publish(node)
      }
    }
    notifications.RaiseVisibilityChanged(visible)
  }
}
