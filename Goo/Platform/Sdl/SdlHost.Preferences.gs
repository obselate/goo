package Goo

import System
import System.Diagnostics
import System.Collections.Generic
import System.Runtime.InteropServices
import Hexa.NET.SDL3

internal unsafe partial class SdlHost {
  private var preferences PlatformPreferences
  private var nextPreferencesTicks int64
  private var preferredLocales IReadOnlyList[string]?
  private var preferredLocalesRead bool

  public prop Preferences PlatformPreferences {
    get {
      RefreshPreferences(false)
      return preferences
    }
  }

  private func RefreshPreferences(force bool) {
    if disposed { return }
    PollPreferenceSignals()
    let now = Stopwatch.GetTimestamp()
    if !force && now < nextPreferencesTicks { return }
    nextPreferencesTicks = now + Stopwatch.Frequency
    if !preferredLocalesRead {
      preferredLocales = ReadPreferredLocales()
      preferredLocalesRead = true
    }
    let theme = switch SDL.GetSystemTheme() {
      case SDLSystemTheme.Light: SystemTheme.Light
      case SDLSystemTheme.Dark: SystemTheme.Dark
      case _: SystemTheme.Unknown
    }
    let value = (if OperatingSystem.IsWindows() { ReadWindowsPreferences(theme) }
      else if OperatingSystem.IsMacOS() { ReadMacPreferences(theme) }
      else if OperatingSystem.IsLinux() { ReadLinuxPreferences(theme) }
      else { PlatformPreferences{Theme: theme} }) with{PreferredLocales = preferredLocales}
    if preferences == value { return }
    preferences = value
    PreferencesChanged?.Invoke(value)
  }

  private func ReadPreferredLocales() IReadOnlyList[string]? {
    if OperatingSystem.IsLinux() {
      var environment = Environment.GetEnvironmentVariable("LANGUAGE")
      if String.IsNullOrEmpty(environment) { environment = Environment.GetEnvironmentVariable("LC_ALL") }
      if String.IsNullOrEmpty(environment) { environment = Environment.GetEnvironmentVariable("LANG") }
      if !String.IsNullOrEmpty(environment) {
        let locales = List[string]()
        for entry in environment.Split(':') {
          let tag = entry.Split('.')[0].Split('@')[0].Replace('_', '-')
          if tag.Length > 0 && tag != "C" && tag != "POSIX" && !locales.Contains(tag) { locales.Add(tag) }
        }
        return locales.Count == 0 ? nil : PreferredLocaleList(locales)
      }
    }
    var count = 0
    let native = SDL.GetPreferredLocales(ref count)
    if native.IsNull { return nil }
    try {
      let locales = List[string](count)
      for index in 0 ... count {
        let locale = native[index][0]
        let language = Marshal.PtrToStringUTF8(nint(locale.Language)) ?? ""
        let country = Marshal.PtrToStringUTF8(nint(locale.Country))
        if language.Length > 0 {
          locales.Add((language + (String.IsNullOrEmpty(country) ? "" : "-" + country)).Replace('_', '-'))
        }
      }
      return locales.Count == 0 ? nil : PreferredLocaleList(locales)
    } finally { SDL.Free(native.Handle) }
  }
}
