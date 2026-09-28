package Goo

import System
import System.Collections.Generic

/// Identifies one SDL display in the current process. The value can become stale after display changes.
public data struct WindowDisplayId {
  private var nativeValue uint32
  internal prop NativeValue uint32{ get -> nativeValue init -> nativeValue = value }
}

/// Describes one display from an immutable SDL inventory snapshot.
public sealed class WindowDisplay {
  private let id WindowDisplayId
  private let name string
  private let bounds ElementRect
  private let usableBounds ElementRect?
  private let contentScale float32

  /// Gets the opaque process-local display ID.
  public prop Id WindowDisplayId{ get -> id }
  /// Gets the SDL display name.
  public prop Name string{ get -> name }
  /// Gets the display bounds in SDL screen coordinates.
  public prop Bounds ElementRect{ get -> bounds }
  /// Gets usable non-fullscreen bounds, or nil if SDL could not provide them.
  public prop UsableBounds ElementRect?{ get -> usableBounds }
  /// Gets SDL's expected content scale for the display, or zero if SDL cannot provide it. A window scale can differ.
  public prop ContentScale float32{ get -> contentScale }

  internal init(id WindowDisplayId, name string, bounds ElementRect,
    usableBounds ElementRect?, contentScale float32) {
    this.id = id
    this.name = name
    this.bounds = bounds
    this.usableBounds = usableBounds
    this.contentScale = contentScale
  }
}

/// Provides current desktop display information and selects a native fullscreen output.
public partial class Window {
  /// Gets an immutable snapshot of the current host's displays. Open the window first and call on its UI thread.
  /// IDs can become stale after hotplug or SDL restart. Embedded hosts return an empty list.
  public func GetDisplays() IReadOnlyList[WindowDisplay] {
    requireUiThread("Window.GetDisplays")
    guard let native = host else {
      throw InvalidOperationException("Open the window before querying displays")
    }
    if !IsOpen || native.IsClosing {
      throw InvalidOperationException("Open the window before querying displays")
    }
    return native.GetDisplays()
  }

  /// Requests borderless fullscreen on the selected display, including retargeting an already-fullscreen window.
  /// This must run on the window's UI thread. Returns Closed before Open or after close, Unsupported for embedded
  /// hosts, Failed for a stale ID or native failure, and Accepted when SDL accepts the request. Acceptance does not
  /// guarantee compositor placement. The compositor may keep the current display when retargeting fullscreen.
  public func TrySetFullscreenDisplay(display WindowDisplayId) WindowOperationResult {
    requireUiThread("Window.TrySetFullscreenDisplay")
    guard let native = host else { return WindowOperationResult.Closed }
    if !IsOpen || native.IsClosing { return WindowOperationResult.Closed }
    let result = native.TrySetFullscreenDisplay(display)
    if result == WindowOperationResult.Accepted {
      state = WindowState.Fullscreen
    }
    return result
  }
}
