package Goo

import System

/// Hosts supported platform input operations on the UI thread.
public partial class Window {
  private var platformInput PlatformInput?
  private var windowFocus WindowFocus?
  private var modifiers KeyModifiers

  /// Gets the modifiers of the current input event, or the last known state outside dispatch.
  public prop Modifiers KeyModifiers { get -> TrackWindowValue(&trackedModifiers, modifiers) }

  /// Gets the owner-thread focus and text editing operations.
  public prop Focus WindowFocus {
    get {
      requireUiThread("Window.Focus")
      if let existing = windowFocus { return existing }
      let created = WindowFocus(this, input, resolver)
      windowFocus = created
      return created
    }
  }

  internal func SetInputModifiers(value KeyModifiers) {
    modifiers = value
    trackedModifiers?.Sync(value)
  }
  private var wheelScrollScale float64 = 1.0F
  private var dragStartDistance float64 = 8.0F
  private var smoothScrolling bool = true

  /// Enables animated scrolling and touch momentum. The default is true.
  public prop SmoothScrolling bool {
    get -> ReadUntrackedWindowValue(smoothScrolling)
    set(value) {
      requireUiThread("Window.SmoothScrolling")
      if smoothScrolling == value { return }
      smoothScrolling = value
      requestRender()
    }
  }

  /// Scales the platform wheel distance for this window. The default is 1.
  public prop WheelScrollScale float64 {
    get -> ReadUntrackedWindowValue(wheelScrollScale)
    set(value) {
      requireUiThread("Window.WheelScrollScale")
      if !Double.IsFinite(value) || value <= 0.0F || value > 10.0F { throw ArgumentOutOfRangeException("value") }
      wheelScrollScale = value
      input.SetWheelScrollScale(float32(value))
    }
  }

  /// Sets the Euclidean distance in layout units a pressed mouse or pen pointer must move before a drag source starts a drag.
  /// Touch contacts start at 4 layout units. The default is 8.
  public prop DragStartDistance float64 {
    get -> ReadUntrackedWindowValue(dragStartDistance)
    set(value) {
      requireUiThread("Window.DragStartDistance")
      if !Double.IsFinite(value) || value <= 0.0F { throw ArgumentOutOfRangeException("value") }
      dragStartDistance = value
      input.SetDragStartDistance(float32(value))
    }
  }

  /// Gets the owner-thread host input and composition operations.
  public prop PlatformInput PlatformInput{
    get {
      requireUiThread("Window.PlatformInput")
      if let existing = platformInput { return existing }
      let created = Goo.PlatformInput(this, input, resolver)
      platformInput = created
      return created
    }
  }

  internal prop PlatformKeyPressedCallbacks Action[Key, KeyModifiers]? {
    get -> notifications.KeyPressedCallbacks
  }

  internal func PreviewKeyPress(key Key, modifiers KeyModifiers) bool -> notifications.PreviewKeyPress(key, modifiers)

  internal func NotifyInputActivity(kind WindowInputKind) { notifications.RaiseInputActivity(kind) }

  internal func RefreshPlatformInput() {
    platformInput?.Refresh()
  }

  internal func InvalidatePlatformInput() {
    markDirtyAndRender()
  }
}
