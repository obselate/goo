package Goo

import System
import System.Diagnostics
import Hexa.NET.SDL3

internal unsafe partial class SdlHost {
  private var preferences PlatformPreferences
  private var nextPreferencesTicks int64

  public prop Preferences PlatformPreferences {
    get {
      RefreshPreferences(false)
      return preferences
    }
  }

  private func RefreshPreferences(force bool) {
    if disposed { return }
    let now = Stopwatch.GetTimestamp()
    if !force && now < nextPreferencesTicks { return }
    nextPreferencesTicks = now + Stopwatch.Frequency
    let theme = switch SDL.GetSystemTheme() {
      case SDLSystemTheme.Light: SystemTheme.Light
      case SDLSystemTheme.Dark: SystemTheme.Dark
      case _: SystemTheme.Unknown
    }
    let value = if OperatingSystem.IsWindows() { ReadWindowsPreferences(theme) }
      else if OperatingSystem.IsMacOS() { ReadMacPreferences(theme) }
      else { PlatformPreferences{Theme: theme} }
    if preferences == value { return }
    preferences = value
    PreferencesChanged?.Invoke(value)
  }
}
