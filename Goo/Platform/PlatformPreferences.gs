package Goo

import System

/// Identifies the platform's preferred application color theme.
public enum SystemTheme { Unknown; Light; Dark }

/// Holds platform preferences independently of framebuffer density.
/// Nil values mean the host cannot report that preference.
public data struct PlatformPreferences {
  private var theme SystemTheme
  private var reducedMotion bool?
  private var highContrast bool?
  private var textScaleFactor float32?

  /// Gets the preferred theme, or Unknown when unavailable.
  public prop Theme SystemTheme { get -> theme init -> theme = value }
  /// Gets whether nonessential motion should be reduced, or nil when unavailable.
  public prop ReducedMotion bool? { get -> reducedMotion init -> reducedMotion = value }
  /// Gets whether increased contrast is requested, or nil when unavailable.
  public prop HighContrast bool? { get -> highContrast init -> highContrast = value }
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
