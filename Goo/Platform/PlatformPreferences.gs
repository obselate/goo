package Goo

import System
import System.Collections.Generic
import System.Collections.ObjectModel
import System.Linq

/// Identifies the platform's preferred application color theme.
public enum SystemTheme { Unknown; Light; Dark }

/// Holds platform preferences independently of framebuffer density.
/// Nil values mean the host cannot report that preference.
/// Deconstruct returns Theme, ReducedMotion, HighContrast, TextScaleFactor, EventSoundsEnabled,
/// AccentColor, AccentLight1, AccentLight2, AccentLight3, AccentDark1, AccentDark2, AccentDark3 and PreferredLocales.
public data struct PlatformPreferences {
  private var theme SystemTheme
  private var reducedMotion bool?
  private var highContrast bool?
  private var textScaleFactor float64?
  private var eventSoundsEnabled bool?
  private var accentColor Color?
  private var accentLight1 Color?
  private var accentLight2 Color?
  private var accentLight3 Color?
  private var accentDark1 Color?
  private var accentDark2 Color?
  private var accentDark3 Color?
  private var preferredLocales IReadOnlyList[string]?

  /// Gets the preferred theme, or Unknown when unavailable.
  public prop Theme SystemTheme { get -> theme init -> theme = value }
  /// Gets whether nonessential motion should be reduced, or nil when unavailable.
  public prop ReducedMotion bool? { get -> reducedMotion init -> reducedMotion = value }
  /// Gets whether increased contrast is requested, or nil when unavailable.
  public prop HighContrast bool? { get -> highContrast init -> highContrast = value }
  /// Gets whether UI and event sounds are enabled, or nil when unavailable.
  public prop EventSoundsEnabled bool? { get -> eventSoundsEnabled init -> eventSoundsEnabled = value }
  /// Gets the system accent color, or nil when unavailable. On Windows this is the accent palette base, not the window frame color.
  public prop AccentColor Color? { get -> accentColor init -> accentColor = value }
  /// Gets the lightest accent palette shade (Windows AccentLight3), or nil when the host has no accent palette.
  public prop AccentLight3 Color? { get -> accentLight3 init -> accentLight3 = value }
  /// Gets the second lightest accent palette shade (Windows AccentLight2), or nil when the host has no accent palette.
  public prop AccentLight2 Color? { get -> accentLight2 init -> accentLight2 = value }
  /// Gets the accent palette shade one step lighter than the base (Windows AccentLight1), or nil when the host has no accent palette.
  public prop AccentLight1 Color? { get -> accentLight1 init -> accentLight1 = value }
  /// Gets the accent palette shade one step darker than the base (Windows AccentDark1), or nil when the host has no accent palette.
  public prop AccentDark1 Color? { get -> accentDark1 init -> accentDark1 = value }
  /// Gets the second darkest accent palette shade (Windows AccentDark2), or nil when the host has no accent palette.
  public prop AccentDark2 Color? { get -> accentDark2 init -> accentDark2 = value }
  /// Gets the darkest accent palette shade (Windows AccentDark3), or nil when the host has no accent palette.
  public prop AccentDark3 Color? { get -> accentDark3 init -> accentDark3 = value }
  /// Gets an immutable, ordered list of preferred BCP-47 language tags, or nil when unavailable.
  public prop PreferredLocales IReadOnlyList[string]? {
    get -> preferredLocales
    init -> preferredLocales = if value is PreferredLocaleList { value }
      else if let locales = value { PreferredLocaleList(locales) } else { nil }
  }
  /// Gets the positive user text scale, independently of display density, or nil when unavailable.
  public prop TextScaleFactor float64? {
    get -> textScaleFactor
    init {
      if let scale = value {
        if !Double.IsFinite(scale) || scale <= 0.0 { throw ArgumentOutOfRangeException("value") }
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
