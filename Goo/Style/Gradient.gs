package Goo

import System
import System.Collections.Generic

/// Specifies one immutable gradient color stop.
public data struct GradientStop {
  private var offset float64
  private var color Color

  /// Gets the stop position from 0 through 1.
  public prop Offset float64{
    get -> offset
    init{
      if Double.IsNaN(value) || Double.IsInfinity(value) || value < 0.0 || value > 1.0 {
        throw ArgumentOutOfRangeException("Offset")
      }
      offset = value
    }
  }

  /// Gets the stop color.
  public prop Color Color{
    get -> color
    init -> color = value
  }
}

/// Paints a background with interpolated color stops.
public sealed interface Gradient {
  /// Gets the ordered color stops.
  prop Stops IReadOnlyList[GradientStop] { get; }
}

/// Paints a straight-line gradient at an angle.
public class LinearGradient : Gradient {
  private let stops List[GradientStop]
  private let stopView IReadOnlyList[GradientStop]
  private var angle float64
  private var contentHash int32

  /// Gets the ordered color stops.
  public prop Stops IReadOnlyList[GradientStop]{ get -> stopView }
  /// Gets the direction in degrees. Zero points up and positive angles turn clockwise.
  public prop Angle float64{ get -> angle }
  internal prop ContentHashForCache int32{ get -> contentHash }

  /// Creates a top-to-bottom linear gradient from evenly spread colors.
  /// @param colors At least two colors, spread evenly from 0 through 1.
  public init(colors ... Color) {
    angle = 180.0
    stops = spreadGradientColors(colors)
    stopView = stops.AsReadOnly()
    contentHash = computeGradientContentHash(1, angle, 0.0, 0.0, stops)
  }

  /// Creates an angled linear gradient from evenly spread colors.
  /// @param angle The finite direction in degrees. Zero points up and positive angles turn clockwise.
  /// @param colors At least two colors, spread evenly from 0 through 1.
  public init(angle float64, colors ... Color) {
    this.angle = validateGradientAngle(angle)
    stops = spreadGradientColors(colors)
    stopView = stops.AsReadOnly()
    contentHash = computeGradientContentHash(1, this.angle, 0.0, 0.0, stops)
  }

  /// Creates an angled linear gradient from explicit stops.
  /// @param angle The finite direction in degrees. Zero points up and positive angles turn clockwise.
  /// @param stops At least two stops with non-decreasing offsets.
  public init(angle float64, stops []GradientStop) {
    this.angle = validateGradientAngle(angle)
    this.stops = validateGradientStops(stops)
    stopView = this.stops.AsReadOnly()
    contentHash = computeGradientContentHash(1, this.angle, 0.0, 0.0, this.stops)
  }

  internal init(source LinearGradient) {
    angle = source.angle
    stops = List[GradientStop](source.stops)
    stopView = stops.AsReadOnly()
    contentHash = source.contentHash
  }

  internal func Sample(from LinearGradient, to LinearGradient, t float32) {
    angle = from.angle + (to.angle - from.angle) * float64(t)
    interpolateGradientStops(from.Stops, to.Stops, stops, t)
    contentHash = computeGradientContentHash(1, angle, 0.0, 0.0, stops)
  }
}

/// Paints a circular gradient from a normalized center.
public class RadialGradient : Gradient {
  private let stops List[GradientStop]
  private let stopView IReadOnlyList[GradientStop]
  private var centerX float64
  private var centerY float64
  private var radius float64
  private var contentHash int32

  /// Gets the ordered color stops.
  public prop Stops IReadOnlyList[GradientStop]{ get -> stopView }
  /// Gets the normalized horizontal center from 0 through 1.
  public prop CenterX float64{ get -> centerX }
  /// Gets the normalized vertical center from 0 through 1.
  public prop CenterY float64{ get -> centerY }
  /// Gets the normalized radius above 0 and at most 1.
  public prop Radius float64{ get -> radius }
  internal prop ContentHashForCache int32{ get -> contentHash }

  /// Creates a centered radial gradient from evenly spread colors.
  /// @param colors At least two colors, spread evenly from 0 through 1.
  public init(colors ... Color) {
    centerX = 0.5
    centerY = 0.5
    radius = 0.5
    stops = spreadGradientColors(colors)
    stopView = stops.AsReadOnly()
    contentHash = computeGradientContentHash(2, centerX, centerY, radius, stops)
  }

  /// Creates a radial gradient from explicit geometry and stops.
  /// @param centerX The normalized horizontal center from 0 through 1.
  /// @param centerY The normalized vertical center from 0 through 1.
  /// @param radius The normalized radius above 0 and at most 1.
  /// @param stops At least two stops with non-decreasing offsets.
  public init(centerX float64, centerY float64, radius float64, stops []GradientStop) {
    this.centerX = validateGradientCenter(centerX, "centerX")
    this.centerY = validateGradientCenter(centerY, "centerY")
    this.radius = validateGradientRadius(radius)
    this.stops = validateGradientStops(stops)
    stopView = this.stops.AsReadOnly()
    contentHash = computeGradientContentHash(2, this.centerX, this.centerY, this.radius, this.stops)
  }

  internal init(source RadialGradient) {
    centerX = source.centerX
    centerY = source.centerY
    radius = source.radius
    stops = List[GradientStop](source.stops)
    stopView = stops.AsReadOnly()
    contentHash = source.contentHash
  }

  internal func Sample(from RadialGradient, to RadialGradient, t float32) {
    centerX = from.centerX + (to.centerX - from.centerX) * float64(t)
    centerY = from.centerY + (to.centerY - from.centerY) * float64(t)
    radius = from.radius + (to.radius - from.radius) * float64(t)
    interpolateGradientStops(from.Stops, to.Stops, stops, t)
    contentHash = computeGradientContentHash(2, centerX, centerY, radius, stops)
  }
}

internal func spreadGradientColors(colors []Color) List[GradientStop] {
  if colors.Length < 2 {
    throw ArgumentException("colors must contain at least two colors", "colors")
  }
  let list = List[GradientStop](colors.Length)
  for i in 0 ... colors.Length {
    list.Add(GradientStop{ Offset: float64(i) / float64(colors.Length - 1), Color: colors[i] })
  }
  return list
}

internal func validateGradientStops(stops []GradientStop) List[GradientStop] {
  if stops.Length < 2 {
    throw ArgumentException("stops must contain at least two stops", "stops")
  }
  let list = List[GradientStop](stops.Length)
  for i in 0 ... stops.Length {
    if i > 0 && stops[i].Offset < stops[i - 1].Offset {
      throw ArgumentException("stops must have non-decreasing offsets", "stops")
    }
    list.Add(stops[i])
  }
  return list
}

internal func validateGradientAngle(value float64) float64 {
  if Double.IsNaN(value) || Double.IsInfinity(value) || Single.IsInfinity(float32(value)) {
    throw ArgumentOutOfRangeException("angle")
  }
  return value
}

internal func validateGradientCenter(value float64, name string) float64 {
  if Double.IsNaN(value) || Double.IsInfinity(value) || value < 0.0 || value > 1.0 {
    throw ArgumentOutOfRangeException(name)
  }
  return value
}

internal func validateGradientRadius(value float64) float64 {
  if Double.IsNaN(value) || Double.IsInfinity(value) || value <= 0.0 || value > 1.0 {
    throw ArgumentOutOfRangeException("radius")
  }
  return value
}

internal func sameGradient(a Gradient?, b Gradient?) bool {
  if a == b {
    return true
  }
  guard let left = a else {
    return b == nil
  }
  guard let right = b else {
    return false
  }
  let geometryMatches = switch left {
    case linear is LinearGradient: switch right {
      case other is LinearGradient: linear.Angle == other.Angle
      case _: false
    }
    case radial is RadialGradient: switch right {
      case other is RadialGradient: radial.CenterX == other.CenterX
        && radial.CenterY == other.CenterY && radial.Radius == other.Radius
      case _: false
    }
    case compiled is VectorLinearGradient: switch right {
      case other is VectorLinearGradient: compiled.X0 == other.X0
        && compiled.Y0 == other.Y0 && compiled.X1 == other.X1 && compiled.Y1 == other.Y1
      case _: false
    }
    case compiled is VectorRadialGradient: switch right {
      case other is VectorRadialGradient: compiled.CenterX == other.CenterX
        && compiled.CenterY == other.CenterY && compiled.RadiusX == other.RadiusX
        && compiled.RadiusY == other.RadiusY
      case _: false
    }
    case _: false
  }
  if !geometryMatches || left.Stops.Count != right.Stops.Count {
    return false
  }
  for i in 0 ... left.Stops.Count {
    let leftStop = left.Stops[i]
    let rightStop = right.Stops[i]
    if leftStop.Offset != rightStop.Offset
      || leftStop.Color.R != rightStop.Color.R
      || leftStop.Color.G != rightStop.Color.G
      || leftStop.Color.B != rightStop.Color.B
      || leftStop.Color.A != rightStop.Color.A{
        return false
      }
  }
  return true
}

internal func computeGradientContentHash(kind int32, a float64, b float64, c float64,
  stops IReadOnlyList[GradientStop]) int32{
    var result = HashCode.Combine(kind, a, b, c)
    result = HashCode.Combine(result, stops.Count)
    for i in 0 ... stops.Count {
      let stop = stops[i]
      result = HashCode.Combine(result, stop.Offset, stop.Color.R, stop.Color.G, stop.Color.B, stop.Color.A)
    }
    return result
  }

internal func computeGradientContentHash4(kind int32, a float64, b float64, c float64,
  d float64, stops IReadOnlyList[GradientStop]) int32{
    var result = HashCode.Combine(kind, a, b, c, d)
    result = HashCode.Combine(result, stops.Count)
    for i in 0 ... stops.Count {
      let stop = stops[i]
      result = HashCode.Combine(result, stop.Offset, stop.Color.R, stop.Color.G, stop.Color.B, stop.Color.A)
    }
    return result
  }

internal sealed class GradientTransitionValues {
  internal let From Gradient
  internal let To Gradient
  internal let Work Gradient

  internal init(from Gradient, to Gradient) {
    From = from
    To = to
    Work = switch from {
      case value is LinearGradient: LinearGradient(value)
      case value is RadialGradient: RadialGradient(value)
      case value is VectorLinearGradient: VectorLinearGradient(value)
      case value is VectorRadialGradient: VectorRadialGradient(value)
      case _: throw InvalidOperationException("Unsupported gradient transition")
    }
  }

  internal func Sample(t float32) {
    switch Work {
      case value is LinearGradient { value.Sample(cast[LinearGradient](From), cast[LinearGradient](To), t) }
      case value is RadialGradient { value.Sample(cast[RadialGradient](From), cast[RadialGradient](To), t) }
      case value is VectorLinearGradient { value.Sample(cast[VectorLinearGradient](From), cast[VectorLinearGradient](To), t) }
      case value is VectorRadialGradient { value.Sample(cast[VectorRadialGradient](From), cast[VectorRadialGradient](To), t) }
    }
  }
}

internal func compatibleGradients(left Gradient?, right Gradient?) bool ->
  left != nil && right != nil && left.GetType() == right.GetType() && left.Stops.Count == right.Stops.Count

internal func interpolateGradientStops(from IReadOnlyList[GradientStop], to IReadOnlyList[GradientStop],
  work List[GradientStop], t float32) {
  for i in 0 ... work.Count {
    let a = from[i]
    let b = to[i]
    work[i] = GradientStop{
      Offset: a.Offset + (b.Offset - a.Offset) * float64(t),
      Color: interpolateStyleColor(a.Color, b.Color, t),
    }
  }
}
