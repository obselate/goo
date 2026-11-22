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

/// Identifies the window edge or corner that Window.BeginResize moves.
public enum WindowEdge { TopLeft; Top; TopRight; Right; BottomRight; Bottom; BottomLeft; Left }

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

  /// Starts a system move of the window. Call from a pointer, touch or key press handler.
  /// With the primary button held, the window follows the pointer.
  /// From a key press, Windows starts its keyboard move and Wayland sends xdg_toplevel.move with the key serial.
  /// Accepted means the request was sent. A Wayland compositor can still ignore it.
  /// Returns Unsupported unless the window is in the normal state on Windows or Wayland.
  public func BeginMove() WindowOperationResult -> beginInteraction("Window.BeginMove", WindowHitResult.Draggable)

  /// Starts a system resize from an edge or corner. Call from a pointer, touch or key press handler.
  /// With the primary button held, the edge follows the pointer.
  /// From a key press, Windows starts its keyboard sizing and Wayland sends xdg_toplevel.resize with the key serial.
  /// Accepted means the request was sent. A Wayland compositor can still ignore it.
  /// Returns Unsupported unless the window is resizable and in the normal state on Windows or Wayland.
  /// On Wayland, returns Unsupported if the compositor constrains any requested edge.
  /// @param edge edge or corner to move
  public func BeginResize(edge WindowEdge) WindowOperationResult {
    let target = switch edge {
      case WindowEdge.TopLeft: WindowHitResult.TopLeft
      case WindowEdge.Top: WindowHitResult.Top
      case WindowEdge.TopRight: WindowHitResult.TopRight
      case WindowEdge.Right: WindowHitResult.Right
      case WindowEdge.BottomRight: WindowHitResult.BottomRight
      case WindowEdge.Bottom: WindowHitResult.Bottom
      case WindowEdge.BottomLeft: WindowHitResult.BottomLeft
      case WindowEdge.Left: WindowHitResult.Left
      case _: throw ArgumentOutOfRangeException("edge")
    }
    return resizable ? beginInteraction("Window.BeginResize", target) : WindowOperationResult.Unsupported
  }

  /// Shows the platform window menu at a point in layout units. Wayland compositors define its items.
  /// Returns Unsupported for undecorated Windows windows, which have no system menu.
  /// @param point menu position in layout units
  public func ShowSystemMenu(point Point) WindowOperationResult {
    requireUiThread("Window.ShowSystemMenu")
    guard let native = host as SdlHost? else { return IsOpen ? WindowOperationResult.Unsupported : WindowOperationResult.Closed }
    if native.IsClosing { return WindowOperationResult.Closed }
    if OperatingSystem.IsWindows() && !decorated { return WindowOperationResult.Unsupported }
    return native.ShowSystemMenu(int32(Math.Round(point.X * UiScale)), int32(Math.Round(point.Y * UiScale)))
  }

  private func beginInteraction(name string, edge WindowHitResult) WindowOperationResult {
    requireUiThread(name)
    guard let native = host as SdlHost? else { return IsOpen ? WindowOperationResult.Unsupported : WindowOperationResult.Closed }
    if native.IsClosing { return WindowOperationResult.Closed }
    return state == WindowState.Normal ? native.BeginInteraction(edge) : WindowOperationResult.Unsupported
  }

  internal func NativeTitlebarDoubleClick(px float64, py float64) bool {
    if !Double.IsFinite(px) || !Double.IsFinite(py) || px < 0.0 || py < 0.0
      || px >= float64(NativeWidth) || py >= float64(NativeHeight)
      || hitTest(int32(px), int32(py)) != WindowHitResult.Draggable{ return false }
    guard let callback = WindowTitlebarCallbacks.Get(this)?.Callback else { return false }
    let event = WindowTitlebarEvent{Position: Point{X: px, Y: py}}
    try { callback(event) }
    catch (error Exception) {
      // Surface user callback failures from managed dispatch, never through a native ABI.
      Post(() -> { System.Runtime.ExceptionServices.ExceptionDispatchInfo.Capture(error).Throw() })
      return true
    }
    return event.Handled
  }
}
