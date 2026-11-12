package Goo

import System

/// Assigns OnPress to one exact physical Key and Modifiers combination.
public data struct KeyBinding(Key Key, Modifiers KeyModifiers, OnPress Action?) {
  /// Gets the callback invoked on key up.
  public prop OnRelease Action? { get; init; }
  /// Enables repeated key downs while this key stays held and its target keeps focus.
  public prop Repeat bool{ get; init; }
}
