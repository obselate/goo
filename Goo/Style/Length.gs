package Goo

import System

internal enum LengthUnit { Unset; Px; Percent; Auto; Relative; Em; Rem; Vw; Vh; MinContent; MaxContent; FitContent }

/// Specifies pixels, relative units, a mixed length, or an intrinsic size.
public struct Length {
  internal var Unit LengthUnit
  internal var Value float32
  internal var PercentPart float32
  internal var EmPart float32
  internal var RemPart float32
  internal var VwPart float32
  internal var VhPart float32

  /// Gets whether this value is a single percentage.
  public prop IsPercent bool { get -> Unit == LengthUnit.Percent }
  /// Gets whether Magnitude describes a single pixel or percentage value.
  public prop HasMagnitude bool { get -> Unit == LengthUnit.Px || Unit == LengthUnit.Percent }
  /// Gets pixels or percentage points for a value with HasMagnitude.
  public prop Magnitude float64 { get -> float64(Value) }
  internal prop Px float32 { get -> Unit == LengthUnit.Px ? Value : 0.0F }
  internal prop IsIntrinsic bool { get -> Unit >= LengthUnit.MinContent }
  internal prop DependsOnContainer bool { get -> Unit == LengthUnit.Percent || Unit == LengthUnit.Vw
    || Unit == LengthUnit.Vh || PercentPart != 0.0F || VwPart != 0.0F || VhPart != 0.0F }
  internal prop IsFinite bool { get -> Single.IsFinite(Value) && Single.IsFinite(PercentPart)
    && Single.IsFinite(EmPart) && Single.IsFinite(RemPart) && Single.IsFinite(VwPart) && Single.IsFinite(VhPart) }

  shared {
    /// Gets an automatic layout length.
    public prop Auto Length { get -> Length{Unit: LengthUnit.Auto} }
    /// Gets the smallest size without avoidable content overflow.
    public prop MinContent Length { get -> Length{Unit: LengthUnit.MinContent} }
    /// Gets the content size without soft wrapping.
    public prop MaxContent Length { get -> Length{Unit: LengthUnit.MaxContent} }
    /// Limits the preferred content size without shrinking below its minimum content size.
    /// A percentage limit uses the owner's content constraint. In a content-sized owner,
    /// its percent part is absent during owner measurement and resolves once after that owner is fixed.
    /// @param limit The pixel or relative size limit.
    /// @returns An intrinsic fit-content size.
    public func FitContent(limit Length) Length {
      var result = lengthParts(limit)
      result.Unit = LengthUnit.FitContent
      return result
    }
  }
}

/// Creates a percentage of the available size.
/// @param value Percentage points.
/// @returns A percentage length.
public func Percent(value float64) Length -> Length{Unit: LengthUnit.Percent, Value: float32(value)}

/// Creates a multiple of the computed element font size, or the parent font size for FontSize.
/// @param value Font size multiple.
/// @returns An element-relative length.
public func Em(value float64) Length -> Length{Unit: LengthUnit.Em, EmPart: float32(value)}

/// Creates a multiple of the root font size.
/// @param value Root font size multiple.
/// @returns A root-relative length.
public func Rem(value float64) Length -> Length{Unit: LengthUnit.Rem, RemPart: float32(value)}

/// Creates a percentage of the window layout viewport width.
/// @param value Percentage points.
/// @returns A viewport-relative length.
public func Vw(value float64) Length -> Length{Unit: LengthUnit.Vw, VwPart: float32(value)}

/// Creates a percentage of the window layout viewport height.
/// @param value Percentage points.
/// @returns A viewport-relative length.
public func Vh(value float64) Length -> Length{Unit: LengthUnit.Vh, VhPart: float32(value)}

/// Converts layout pixels to a length.
/// @param value Layout pixels.
/// @returns A pixel length.
public func operator implicit(value float64) Length -> Length{Unit: LengthUnit.Px, Value: float32(value)}

/// Converts integer layout pixels to a length.
/// @param value Layout pixels.
/// @returns A pixel length.
public func operator implicit(value int32) Length -> Length{Unit: LengthUnit.Px, Value: float32(value)}

internal func lengthParts(value Length) Length {
  if value.Unit == LengthUnit.Auto || value.IsIntrinsic {
    throw ArgumentException("Automatic and intrinsic lengths cannot be operands", "value")
  }
  if value.Unit == LengthUnit.Percent { return Length{Unit: LengthUnit.Relative, PercentPart: value.Value} }
  var result = value
  result.Unit = LengthUnit.Relative
  return result
}

internal func normalizeLength(value Length) Length {
  if value.EmPart == 0.0F && value.RemPart == 0.0F && value.VwPart == 0.0F && value.VhPart == 0.0F {
    if value.PercentPart == 0.0F { return Length{Unit: LengthUnit.Px, Value: value.Value} }
    if value.Value == 0.0F { return Percent(float64(value.PercentPart)) }
  }
  if value.Value == 0.0F && value.PercentPart == 0.0F {
    if value.RemPart == 0.0F && value.VwPart == 0.0F && value.VhPart == 0.0F { return Em(float64(value.EmPart)) }
    if value.EmPart == 0.0F && value.VwPart == 0.0F && value.VhPart == 0.0F { return Rem(float64(value.RemPart)) }
    if value.EmPart == 0.0F && value.RemPart == 0.0F && value.VhPart == 0.0F { return Vw(float64(value.VwPart)) }
    if value.EmPart == 0.0F && value.RemPart == 0.0F && value.VwPart == 0.0F { return Vh(float64(value.VhPart)) }
  }
  return value
}

/// Adds the pixel and relative parts. Automatic and intrinsic values throw ArgumentException.
/// @param left The first length.
/// @param right The second length.
/// @returns Their mixed-unit sum.
public func(left Length) operator + (right Length) Length {
  if left.Unit == LengthUnit.Px && right.Unit == LengthUnit.Px { return float64(left.Value + right.Value) }
  if left.Unit == LengthUnit.Percent && right.Unit == LengthUnit.Percent { return Percent(float64(left.Value + right.Value)) }
  let a = lengthParts(left)
  let b = lengthParts(right)
  return normalizeLength(Length{Unit: LengthUnit.Relative, Value: a.Value + b.Value,
    PercentPart: a.PercentPart + b.PercentPart, EmPart: a.EmPart + b.EmPart,
    RemPart: a.RemPart + b.RemPart, VwPart: a.VwPart + b.VwPart, VhPart: a.VhPart + b.VhPart})
}

/// Subtracts the pixel and relative parts. Automatic and intrinsic values throw ArgumentException.
/// @param left The first length.
/// @param right The length to subtract.
/// @returns Their mixed-unit difference.
public func(left Length) operator - (right Length) Length -> left + right * -1.0

/// Scales every part. Automatic and intrinsic values throw ArgumentException.
/// @param value The length to scale.
/// @param scale The multiplier.
/// @returns The scaled length.
public func(value Length) operator * (scale float64) Length {
  if value.Unit == LengthUnit.Px { return float64(value.Value) * scale }
  if value.Unit == LengthUnit.Percent { return Percent(float64(value.Value) * scale) }
  let source = lengthParts(value)
  let factor = float32(scale)
  if value.Unit == LengthUnit.Em { return Em(float64(value.EmPart) * scale) }
  if value.Unit == LengthUnit.Rem { return Rem(float64(value.RemPart) * scale) }
  if value.Unit == LengthUnit.Vw { return Vw(float64(value.VwPart) * scale) }
  if value.Unit == LengthUnit.Vh { return Vh(float64(value.VhPart) * scale) }
  return normalizeLength(Length{Unit: LengthUnit.Relative, Value: source.Value * factor,
    PercentPart: source.PercentPart * factor, EmPart: source.EmPart * factor,
    RemPart: source.RemPart * factor, VwPart: source.VwPart * factor, VhPart: source.VhPart * factor})
}

/// Divides every part. Automatic and intrinsic values throw ArgumentException.
/// @param value The length to scale.
/// @param scale The divisor.
/// @returns The scaled length.
public func(value Length) operator / (scale float64) Length -> value * (1.0 / scale)

internal func sameLength(left Length, right Length) bool -> left.Unit == right.Unit && left.Value == right.Value
  && left.PercentPart == right.PercentPart && left.EmPart == right.EmPart && left.RemPart == right.RemPart
  && left.VwPart == right.VwPart && left.VhPart == right.VhPart
