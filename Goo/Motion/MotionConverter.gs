package Goo

import System

/// Converts an animated value to fixed scalar simulation coordinates.
/// @typeparam T animated value type
public class MotionConverter[T] {
  private let dimensions int32
  private let readValue(T, []float64) -> void
  private let writeValue([]float64) -> T

  /// Creates a converter with a fixed coordinate count and conversion callbacks.
  /// @param dimensions positive coordinate count
  /// @param read writes a value into an Anim-owned coordinate buffer
  /// @param write creates a value from an Anim-owned coordinate buffer
  public init(dimensions int32, read(T, []float64) -> void, write([]float64) -> T) {
    if dimensions < 1 {
      throw ArgumentOutOfRangeException("dimensions")
    }
    if read == nil {
      throw ArgumentNullException("read")
    }
    if write == nil {
      throw ArgumentNullException("write")
    }
    this.dimensions = dimensions
    readValue = read
    writeValue = write
  }

  internal func Dimensions() int32 -> dimensions

  internal func Read(value T, into []float64) {
    readValue(value, into)
  }

  internal func Write(dims []float64) T -> writeValue(dims)
}

internal func motionFinite(value float64) bool -> !Double.IsNaN(value) && !Double.IsInfinity(value)

internal func motionFiniteFloat32(value float64) bool -> motionFinite(value) && !Single.IsInfinity(float32(value))

internal func readFloat64Motion(value float64, into []float64) {
  if !motionFinite(value) {
    throw ArgumentOutOfRangeException("value")
  }
  into[0] = value
}

internal func writeFloat64Motion(dims []float64) float64 {
  if !motionFinite(dims[0]) {
    throw ArgumentOutOfRangeException("dims")
  }
  return dims[0]
}

internal func readPointMotion(value Point, into []float64) {
  if !motionFinite(value.X) || !motionFinite(value.Y) {
    throw ArgumentOutOfRangeException("value")
  }
  into[0] = value.X
  into[1] = value.Y
}

internal func writePointMotion(dims []float64) Point {
  if !motionFinite(dims[0]) || !motionFinite(dims[1]) {
    throw ArgumentOutOfRangeException("dims")
  }
  return Point{ X: dims[0], Y: dims[1] }
}

internal func readColorMotion(value Color, into []float64) {
  into[0] = float64(value.R)
  into[1] = float64(value.G)
  into[2] = float64(value.B)
  into[3] = float64(value.A)
}

internal func writeColorMotion(dims []float64) Color -> Color.FromNormalized(float32(dims[0]), float32(dims[1]), float32(dims[2]), float32(dims[3]))

internal func readPixelLengthMotion(value Length, into []float64) {
  into[0] = readLength(value, LengthUnit.Px)
}

internal func writePixelLengthMotion(dims []float64) Length -> writeLength(dims[0], LengthUnit.Px)

internal func readPercentLengthMotion(value Length, into []float64) {
  into[0] = readLength(value, LengthUnit.Percent)
}

internal func writePercentLengthMotion(dims []float64) Length -> writeLength(dims[0], LengthUnit.Percent)

internal func readLength(value Length, expected LengthUnit) float64 {
  let magnitude = float64(value.Value)
  if value.Unit != expected || !motionFinite(magnitude) {
    throw ArgumentException("length unit or magnitude is invalid", "value")
  }
  return magnitude
}

internal func writeLength(value float64, unit LengthUnit) Length {
  if !motionFiniteFloat32(value) {
    throw ArgumentOutOfRangeException("value")
  }
  return Length{ Unit: unit, Value: float32(value) }
}

internal class MotionConverters {
  shared {
    internal let Float64 MotionConverter[float64] = MotionConverter[float64](1, readFloat64Motion, writeFloat64Motion)
    internal let Point MotionConverter[Point] = MotionConverter[Point](2, readPointMotion, writePointMotion)
    internal let Color MotionConverter[Color] = MotionConverter[Color](4, readColorMotion, writeColorMotion)
    private let pixelLength MotionConverter[Length] = MotionConverter[Length](1, readPixelLengthMotion, writePixelLengthMotion)
    private let percentLength MotionConverter[Length] = MotionConverter[Length](1, readPercentLengthMotion, writePercentLengthMotion)
    private let emLength MotionConverter[Length] = relativeLength(LengthUnit.Em)
    private let remLength MotionConverter[Length] = relativeLength(LengthUnit.Rem)
    private let vwLength MotionConverter[Length] = relativeLength(LengthUnit.Vw)
    private let vhLength MotionConverter[Length] = relativeLength(LengthUnit.Vh)

    private func relativeLength(unit LengthUnit) MotionConverter[Length] {
      let read (Length, []float64) -> void = (value, into) -> {
        if value.Unit != unit || !value.IsFinite { throw ArgumentException("Length animation requires one matching unit", "value") }
        into[0] = float64(switch unit {
          case LengthUnit.Em: value.EmPart
          case LengthUnit.Rem: value.RemPart
          case LengthUnit.Vw: value.VwPart
          case _: value.VhPart
        })
      }
      let write ([]float64) -> Length = dims -> {
        if !motionFiniteFloat32(dims[0]) { throw ArgumentOutOfRangeException("dims") }
        return switch unit {
          case LengthUnit.Em: Em(dims[0])
          case LengthUnit.Rem: Rem(dims[0])
          case LengthUnit.Vw: Vw(dims[0])
          case _: Vh(dims[0])
        }
      }
      return MotionConverter[Length](1, read, write)
    }

    internal func ForLength(initial Length) MotionConverter[Length] {
      if initial.Unit == LengthUnit.Px {
        return pixelLength
      }
      if initial.Unit == LengthUnit.Percent {
        return percentLength
      }
      return switch initial.Unit {
        case LengthUnit.Em: emLength
        case LengthUnit.Rem: remLength
        case LengthUnit.Vw: vwLength
        case LengthUnit.Vh: vhLength
        case _: throw ArgumentException("Length animation requires a single unit", "initial")
      }
    }
  }
}
