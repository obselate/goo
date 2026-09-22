package Goo

internal enum LengthUnit { Unset; Px; Percent; Auto }

/// Specifies a layout length.
public struct Length {
  internal var Unit LengthUnit
  internal var Value float32

  /// Gets whether this length is a percentage of the available size, as
  /// opposed to an absolute pixel value.
  public prop IsPercent bool{ get -> Unit == LengthUnit.Percent }

  /// Gets whether this length has a concrete magnitude (pixels or percent),
  /// as opposed to `Auto` or an unset default. `Magnitude` is only defined
  /// when this is true.
  public prop HasMagnitude bool{ get -> Unit == LengthUnit.Px || Unit == LengthUnit.Percent }

  /// Gets the raw numeric magnitude: pixels when `IsPercent` is false,
  /// percentage points (0-100) when true. Undefined for `Auto`/unset lengths;
  /// check `HasMagnitude` first.
  public prop Magnitude float64{ get -> float64(Value) }

  internal prop Px float32{ get -> Unit == LengthUnit.Px ? Value : 0.0F }

  shared {
    /// Gets an automatic layout length.
    public prop Auto Length{
      get -> Length { Unit: LengthUnit.Auto }
    }
  }
}

/// Creates a percentage of the available size.
/// @param value percentage of the available size
/// @returns a percentage length
public func Percent(value float64) Length -> Length { Unit: LengthUnit.Percent, Value: float32(value) }

/// Converts a pixel value to a length.
/// @param value length in pixels
/// @returns a pixel length
public func operator implicit (value float64) Length -> Length { Unit: LengthUnit.Px, Value: float32(value) }

/// Converts an integer pixel value to a length.
/// @param value length in pixels
/// @returns a pixel length
public func operator implicit (value int32) Length -> Length { Unit: LengthUnit.Px, Value: float32(value) }
