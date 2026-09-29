package Goo

import System

/// Hosts supported platform input operations on the UI thread.
public partial class Window {
  private var platformInput PlatformInput?
  private var wheelScrollScale float32 = 1.0F
  private var smoothScrolling bool = true

  /// Enables animated scrolling and touch momentum. The default is true.
  public prop SmoothScrolling bool {
    get -> smoothScrolling
    set(value) {
      requireUiThread("Window.SmoothScrolling")
      if smoothScrolling == value { return }
      smoothScrolling = value
      requestRender()
    }
  }

  /// Scales the platform wheel distance for this window. The default is 1.
  public prop WheelScrollScale float32 {
    get -> wheelScrollScale
    set(value) {
      requireUiThread("Window.WheelScrollScale")
      if !Single.IsFinite(value) || value <= 0.0F || value > 10.0F { throw ArgumentOutOfRangeException("value") }
      wheelScrollScale = value
      input.SetWheelScrollScale(value)
    }
  }

  /// Gets the owner-thread platform input and focused-editor contract.
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

  internal func RefreshPlatformInput() {
    platformInput?.Refresh()
  }

  internal func InvalidatePlatformInput() {
    markDirtyAndRender()
  }
}
