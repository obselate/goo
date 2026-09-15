package Goo

import System
import System.Runtime.CompilerServices

/// A native double-click on eligible blank space in an undecorated drag region.
public class WindowTitlebarEvent {
  internal init() { }
  /// Gets the pointer position in logical client coordinates.
  public prop Position Point{get; init;}
  /// Set true after handling the command to suppress the platform's default action.
  public prop Handled bool{get; set;}
}

internal class WindowTitlebarCallbacks {
  internal var Callback Action[WindowTitlebarEvent]?
  shared {
    private var windows ConditionalWeakTable[Window, WindowTitlebarCallbacks]?
    internal func Get(window Window) WindowTitlebarCallbacks? {
      if let values = windows {
        if values.TryGetValue(window, out var value) { return value }
      }
      return nil
    }
    internal func Add(window Window, callback Action[WindowTitlebarEvent]) {
      var value = Get(window)
      if value == nil {
        value = WindowTitlebarCallbacks()
        windows ??= ConditionalWeakTable[Window, WindowTitlebarCallbacks]()
        windows!!.Add(window, value)
      }
      value.Callback += callback
    }
    internal func Remove(window Window, callback Action[WindowTitlebarEvent]) {
      guard let value = Get(window) else { return }
      value.Callback -= callback
      if value.Callback == nil { windows?.Remove(window) }
    }
  }
}

/// Hosts a Goo tree in a native window.
public partial class Window {
  /// Occurs before a native titlebar double-click performs its default action.
  /// Uses platform click-sequence recognition; clickable/focusable content is excluded.
  /// Set Handled to replace the action. Subscribe and handle on the window UI thread.
  public event TitlebarDoubleClicked Action[WindowTitlebarEvent]{
    add{
      requireUiThread("Window.TitlebarDoubleClicked")
      WindowTitlebarCallbacks.Add(this, value)
      SyncTitlebarHook()
    }
    remove{
      requireUiThread("Window.TitlebarDoubleClicked")
      WindowTitlebarCallbacks.Remove(this, value)
      SyncTitlebarHook()
    }
  }

  private func SyncTitlebarHook() {
    if let native = host as SdlHost {
      SdlTitlebarHooks.Bind(native, WindowTitlebarCallbacks.Get(this) != nil ? this : nil)
    }
  }

  internal func NativeTitlebarDoubleClick(px float64, py float64) bool {
    if !Double.IsFinite(px) || !Double.IsFinite(py) || px < 0.0 || py < 0.0
      || px >= float64(Width) || py >= float64(Height)
      || hitTest(int32(px), int32(py)) != WindowHitResult.Draggable{ return false }
    guard let callback = WindowTitlebarCallbacks.Get(this)?.Callback else { return false }
    let event = WindowTitlebarEvent{Position: Point{X: px, Y: py}}
    try { callback(event) }
    catch (error Exception) {
      // Surface user callback failures from managed dispatch, never through a native ABI.
      Post(() -> { throw error })
      return true
    }
    return event.Handled
  }
}
