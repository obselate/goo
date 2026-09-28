package Goo

import System
import System.Collections.Generic

/// Builds an immutable vector path from drawing commands.
public class PathBuilder {
  private let commands List[VectorPathCommand]
  private let viewBoxX float64
  private let viewBoxY float64
  private let viewBoxWidth float64
  private let viewBoxHeight float64
  private var hasContour bool
  private var isSealed bool

  /// Creates a builder with a unit view box.
  public convenience init() {
    init(0.0, 0.0, 1.0, 1.0)
  }

  /// Creates a builder with the specified view box.
  /// @param viewBoxX The view-box left coordinate.
  /// @param viewBoxY The view-box top coordinate.
  /// @param viewBoxWidth The positive view-box width.
  /// @param viewBoxHeight The positive view-box height.
  public init(viewBoxX float64, viewBoxY float64, viewBoxWidth float64, viewBoxHeight float64) {
    validateViewBox(viewBoxX, viewBoxY, viewBoxWidth, viewBoxHeight)
    this.viewBoxX = viewBoxX
    this.viewBoxY = viewBoxY
    this.viewBoxWidth = viewBoxWidth
    this.viewBoxHeight = viewBoxHeight
    commands = List[VectorPathCommand]()
  }

  /// Begins a new contour at a point.
  /// @param x The point x coordinate.
  /// @param y The point y coordinate.
  /// @returns This builder.
  public func MoveTo(x float64, y float64) PathBuilder {
    ensureUnsealed()
    validateFinite(x, "x")
    validateFinite(y, "y")
    commands.Add(VectorPathCommand{ Kind: VectorPathCommandKind.MoveTo, X1: x, Y1: y })
    hasContour = true
    return this
  }

  /// Adds a straight line to a point.
  /// @param x The point x coordinate.
  /// @param y The point y coordinate.
  /// @returns This builder.
  public func LineTo(x float64, y float64) PathBuilder {
    ensureContour()
    validateFinite(x, "x")
    validateFinite(y, "y")
    commands.Add(VectorPathCommand{ Kind: VectorPathCommandKind.LineTo, X1: x, Y1: y })
    return this
  }

  /// Adds a quadratic Bézier curve to a point.
  /// @param controlX The control-point x coordinate.
  /// @param controlY The control-point y coordinate.
  /// @param x The endpoint x coordinate.
  /// @param y The endpoint y coordinate.
  /// @returns This builder.
  public func QuadraticTo(controlX float64, controlY float64, x float64, y float64) PathBuilder {
    ensureContour()
    validateFinite(controlX, "controlX")
    validateFinite(controlY, "controlY")
    validateFinite(x, "x")
    validateFinite(y, "y")
    commands.Add(VectorPathCommand{
      Kind: VectorPathCommandKind.QuadraticTo,
      X1: controlX,
      Y1: controlY,
      X2: x,
      Y2: y,
    })
    return this
  }

  /// Adds a cubic Bézier curve to a point.
  /// @param controlX1 The first control-point x coordinate.
  /// @param controlY1 The first control-point y coordinate.
  /// @param controlX2 The second control-point x coordinate.
  /// @param controlY2 The second control-point y coordinate.
  /// @param x The endpoint x coordinate.
  /// @param y The endpoint y coordinate.
  /// @returns This builder.
  public func CubicTo(controlX1 float64, controlY1 float64,
    controlX2 float64, controlY2 float64, x float64, y float64) PathBuilder{
      ensureContour()
      validateFinite(controlX1, "controlX1")
      validateFinite(controlY1, "controlY1")
      validateFinite(controlX2, "controlX2")
      validateFinite(controlY2, "controlY2")
      validateFinite(x, "x")
      validateFinite(y, "y")
      commands.Add(VectorPathCommand{
        Kind: VectorPathCommandKind.CubicTo,
        X1: controlX1,
        Y1: controlY1,
        X2: controlX2,
        Y2: controlY2,
        X3: x,
        Y3: y,
      })
      return this
    }

  /// Adds an elliptical arc to a point.
  /// @param radiusX The non-negative horizontal radius.
  /// @param radiusY The non-negative vertical radius.
  /// @param rotationDegrees The ellipse rotation in degrees.
  /// @param largeArc Whether to use the larger arc.
  /// @param sweepClockwise Whether the arc sweeps clockwise.
  /// @param x The endpoint x coordinate.
  /// @param y The endpoint y coordinate.
  /// @returns This builder.
  public func ArcTo(radiusX float64, radiusY float64, rotationDegrees float64,
    largeArc bool, sweepClockwise bool, x float64, y float64) PathBuilder{
      ensureContour()
      validateRadius(radiusX, "radiusX")
      validateRadius(radiusY, "radiusY")
      validateFinite(rotationDegrees, "rotationDegrees")
      validateFinite(x, "x")
      validateFinite(y, "y")
      commands.Add(VectorPathCommand{
        Kind: VectorPathCommandKind.ArcTo,
        X1: x,
        Y1: y,
        RadiusX: radiusX,
        RadiusY: radiusY,
        RotationDegrees: rotationDegrees,
        LargeArc: largeArc,
        SweepClockwise: sweepClockwise,
      })
      return this
    }

  /// Adds a polyline contour through the specified points.
  /// @param points The two or more contour points.
  /// @param close Whether to close the contour.
  /// @returns This builder.
  public func Polyline(points []Point, close bool) PathBuilder {
    ensureUnsealed()
    if points.Length < 2 {
      throw ArgumentException("points must contain at least two points", "points")
    }
    MoveTo(points[0].X, points[0].Y)
    for i in 1 ... points.Length {
      LineTo(points[i].X, points[i].Y)
    }
    if close {
      Close()
    }
    return this
  }

  /// Closes the current contour.
  /// @returns This builder.
  public func Close() PathBuilder {
    ensureContour()
    commands.Add(VectorPathCommand{ Kind: VectorPathCommandKind.Close })
    hasContour = false
    return this
  }

  /// Builds the immutable path and seals this builder.
  /// @returns The completed vector path.
  public func Build() VectorPath {
    ensureUnsealed()
    isSealed = true
    return VectorPath.Create(commands.ToArray(), viewBoxX, viewBoxY, viewBoxWidth, viewBoxHeight)
  }

  /// Clears the commands and reopens this builder while retaining its view box and storage.
  /// Previously built paths remain immutable. Each Build still copies the commands.
  /// @returns This builder.
  public func Reset() PathBuilder {
    commands.Clear()
    hasContour = false
    isSealed = false
    return this
  }

  private func ensureUnsealed() {
    if isSealed {
      throw InvalidOperationException("PathBuilder is sealed")
    }
  }

  private func ensureContour() {
    ensureUnsealed()
    if !hasContour {
      throw InvalidOperationException("A contour must begin with MoveTo")
    }
  }

  private func validateViewBox(x float64, y float64, width float64, height float64) {
    validateFinite(x, "viewBoxX")
    validateFinite(y, "viewBoxY")
    validateFinite(width, "viewBoxWidth")
    validateFinite(height, "viewBoxHeight")
    if width <= 0.0 {
      throw ArgumentOutOfRangeException("viewBoxWidth")
    }
    if height <= 0.0 {
      throw ArgumentOutOfRangeException("viewBoxHeight")
    }
  }

  private func validateRadius(value float64, name string) {
    validateFinite(value, name)
    if value < 0.0 {
      throw ArgumentOutOfRangeException(name)
    }
  }

  private func validateFinite(value float64, name string) {
    if !motionFiniteFloat32(value) {
      throw ArgumentOutOfRangeException(name)
    }
  }
}
