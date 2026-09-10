package Goo

import System

/// Hosts supported platform input operations on the UI thread.
public partial class Window {
  private var platformInput PlatformInput?

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
