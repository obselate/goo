package Goo

/// Describes the modifier keys for one key press.
public data struct KeyModifiers {
  /// Reports whether Alt is pressed.
  public prop Alt bool{ get; init; }
  /// Reports whether Shift is pressed.
  public prop Shift bool{ get; init; }
  /// Reports whether Ctrl is pressed.
  public prop Ctrl bool{ get; init; }
  /// Reports whether Super is pressed.
  public prop Super bool{ get; init; }

  shared {
    /// Gets a value with no modifier keys pressed.
    public prop None KeyModifiers { get -> KeyModifiers{} }
    /// Gets Super on macOS or Ctrl on other systems, evaluated when read.
    public prop Primary KeyModifiers {
      get -> InputPolicy.Mac ? KeyModifiers{ Super: true } : KeyModifiers{ Ctrl: true }
    }
    /// Gets the primary modifier together with Shift, evaluated when read.
    public prop PrimaryShift KeyModifiers {
      get -> InputPolicy.Mac ? KeyModifiers{ Super: true, Shift: true } : KeyModifiers{ Ctrl: true, Shift: true }
    }
  }
}
