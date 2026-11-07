package Goo

import System

/// Assigns callbacks to one exact physical key and modifier combination.
public struct KeyBinding {
  /// Gets the physical key to match.
  public prop Key Key{ get; init; }
  /// Gets the exact modifiers to match. Omitted modifiers mean no modifiers.
  public prop Modifiers KeyModifiers{ get; init; }
  /// Gets the callback invoked on key down.
  public prop Action Action? { get; init; }
  /// Gets the callback invoked on key up.
  public prop OnRelease Action? { get; init; }
  /// Enables repeated key downs while this key stays held and its target keeps focus.
  public prop Repeat bool{ get; init; }
}
