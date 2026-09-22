package Goo

import System

/// Specifies one normalized 2D panel transform.
/// Scale runs first, then skew, then rotation, then translation.
public struct PanelTransform : IEquatable[PanelTransform] {
  private var translateX Length
  private var translateY Length
  private var rotate float32
  private var scaleOffset float32
  private var scaleXOffset float32
  private var scaleYOffset float32
  private var skewX float32
  private var skewY float32

  /// Gets or sets the horizontal pixel or percentage translation.
  /// An explicit percentage unit is retained at zero for transitions.
  public prop TranslateX Length{
    get {
      let value = normalizeTransformTranslation(translateX, "TranslateX")
      return value.Unit == LengthUnit.Unset ? Length{ Unit: LengthUnit.Px } : value
    }
    init -> translateX = normalizeTransformTranslation(value, "TranslateX")
  }

  /// Gets or sets the vertical pixel or percentage translation.
  /// An explicit percentage unit is retained at zero for transitions.
  public prop TranslateY Length{
    get {
      let value = normalizeTransformTranslation(translateY, "TranslateY")
      return value.Unit == LengthUnit.Unset ? Length{ Unit: LengthUnit.Px } : value
    }
    init -> translateY = normalizeTransformTranslation(value, "TranslateY")
  }

  /// Gets or sets clockwise rotation in degrees.
  /// Authored turns are preserved for interpolation.
  public prop Rotate float64{
    get -> float64(rotate)
    init -> rotate = normalizeTransformRotation(value)
  }

  /// Gets or sets uniform scale. The default is 1.
  public prop Scale float64{
    get -> float64(scaleOffset + 1.0F)
    init -> scaleOffset = checkedTransformScalar(value, "Scale") - 1.0F
  }

  /// Gets or sets horizontal scale. It multiplies with Scale. The default is 1.
  public prop ScaleX float64{
    get -> float64(scaleXOffset + 1.0F)
    init -> scaleXOffset = checkedTransformScalar(value, "ScaleX") - 1.0F
  }

  /// Gets or sets vertical scale. It multiplies with Scale. The default is 1.
  public prop ScaleY float64{
    get -> float64(scaleYOffset + 1.0F)
    init -> scaleYOffset = checkedTransformScalar(value, "ScaleY") - 1.0F
  }

  /// Gets or sets the horizontal skew angle in degrees.
  public prop SkewX float64{
    get -> float64(skewX)
    init -> skewX = checkedTransformScalar(value, "SkewX")
  }

  /// Gets or sets the vertical skew angle in degrees.
  public prop SkewY float64{
    get -> float64(skewY)
    init -> skewY = checkedTransformScalar(value, "SkewY")
  }

  /// Tests whether another transform has the same normalized components.
  public func Equals(other PanelTransform) bool {
    let leftX = TranslateX
    let rightX = other.TranslateX
    let leftY = TranslateY
    let rightY = other.TranslateY
    return leftX.Unit == rightX.Unit && leftX.Value == rightX.Value
      && leftY.Unit == rightY.Unit && leftY.Value == rightY.Value
      && rotate == other.rotate && scaleOffset == other.scaleOffset
      && scaleXOffset == other.scaleXOffset && scaleYOffset == other.scaleYOffset
      && skewX == other.skewX && skewY == other.skewY
  }
}

/// Tests two panel transforms for normalized component equality.
public func(left PanelTransform) operator == (right PanelTransform) bool -> left.Equals (right)

/// Tests two panel transforms for normalized component inequality.
public func(left PanelTransform) operator != (right PanelTransform) bool -> !left.Equals (right)

internal func normalizeTransformTranslation(value Length, name string) Length {
  if value.Unit == LengthUnit.Unset {
    return Length{}
  }
  if value.Unit == LengthUnit.Auto {
    throw ArgumentException("PanelTransform." + name + " does not support auto", name)
  }
  if Double.IsNaN(float64(value.Value)) || Double.IsInfinity(float64(value.Value)) {
    throw ArgumentOutOfRangeException(name)
  }
  if value.Value == 0.0F && value.Unit != LengthUnit.Percent {
    return Length{}
  }
  return value
}

internal func normalizeTransformRotation(value float64) float32 -> checkedTransformScalar(value, "Rotate")

internal func checkedTransformScalar(value float64, name string) float32 {
  let packed = float32(value)
  if Double.IsNaN(value) || Double.IsInfinity(value)
    || Single.IsNaN(packed) || Single.IsInfinity(packed) {
      throw ArgumentOutOfRangeException(name)
    }
  return packed
}

internal func normalizeTransformOrigin(value Length, name string) Length {
  if value.Unit == LengthUnit.Unset {
    return Percent(50.0)
  }
  if value.Unit == LengthUnit.Auto {
    throw ArgumentException(name + " does not support auto", name)
  }
  if Double.IsNaN(float64(value.Value)) || Double.IsInfinity(float64(value.Value)) {
    throw ArgumentOutOfRangeException(name)
  }
  return value
}
