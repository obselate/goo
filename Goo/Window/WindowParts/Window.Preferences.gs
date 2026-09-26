package Goo

import System

/// Exposes the host's observable accessibility and appearance preferences.
public partial class Window {
  private var preferences PlatformPreferences

  /// Gets the current host snapshot. Unsupported preferences remain unknown.
  public prop Preferences PlatformPreferences { get -> preferences }

  /// Reports preference changes after layout and motion policy are invalidated on the owner thread.
  public event PreferencesChanged Action[PlatformPreferences] {
    add {
      requireUiThread("Window.PreferencesChanged")
      notifications.AddPreferencesChanged(value)
    }
    remove {
      requireUiThread("Window.PreferencesChanged")
      notifications.RemovePreferencesChanged(value)
    }
  }

  private func applyPreferences(value PlatformPreferences) {
    if preferences == value { return }
    preferences = value
    PreferenceLayoutChanged()
    notifications.RaisePreferencesChanged(value)
  }
}
