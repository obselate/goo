package Goo

import System
import System.Collections.Generic
import System.Collections.ObjectModel
import System.Linq

/// Identifies the platform's preferred application color theme.
public enum SystemTheme { Unknown; Light; Dark }

/// Holds platform preferences independently of framebuffer density.
/// Nil values mean the host cannot report that preference.
public data struct PlatformPreferences {
  private var theme SystemTheme
  private var reducedMotion bool?
  private var highContrast bool?
  private var textScaleFactor float32?
  private var eventSoundsEnabled bool?
  private var accentColor Color?
  private var preferredLocales IReadOnlyList[string]?

  /// Gets the preferred theme, or Unknown when unavailable.
  public prop Theme SystemTheme { get -> theme init -> theme = value }
  /// Gets whether nonessential motion should be reduced, or nil when unavailable.
  public prop ReducedMotion bool? { get -> reducedMotion init -> reducedMotion = value }
  /// Gets whether increased contrast is requested, or nil when unavailable.
  public prop HighContrast bool? { get -> highContrast init -> highContrast = value }
  /// Gets whether UI and event sounds are enabled, or nil when unavailable.
  public prop EventSoundsEnabled bool? { get -> eventSoundsEnabled init -> eventSoundsEnabled = value }
  /// Gets the system accent color, or nil when unavailable.
  public prop AccentColor Color? { get -> accentColor init -> accentColor = value }
  /// Gets an immutable, ordered list of preferred BCP-47 language tags, or nil when unavailable.
  public prop PreferredLocales IReadOnlyList[string]? {
    get -> preferredLocales
    init -> preferredLocales = if value is PreferredLocaleList { value }
      else if let locales = value { PreferredLocaleList(locales) } else { nil }
  }
  /// Gets the positive user text scale, independently of display density, or nil when unavailable.
  public prop TextScaleFactor float32? {
    get -> textScaleFactor
    init {
      if let scale = value {
        if !Single.IsFinite(scale) || scale <= 0.0F { throw ArgumentOutOfRangeException("value") }
      }
      textScaleFactor = value
    }
  }
}

internal sealed class PreferredLocaleList : ReadOnlyCollection[string] {
  internal init(values IReadOnlyList[string]) : base(values.ToArray()) { }

  public override func Equals(other object?) bool ->
    other is PreferredLocaleList locales && Enumerable.SequenceEqual(this, locales, StringComparer.Ordinal)

  public override func GetHashCode() int32 {
    var hash HashCode
    for value in Items { hash.Add(value, StringComparer.Ordinal) }
    return hash.ToHashCode()
  }
}
