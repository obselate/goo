package Goo

import System
import System.Collections.Generic

internal enum VectorPathCommandKind {
  MoveTo; LineTo; QuadraticTo; CubicTo; ArcTo; Close
}

internal data struct VectorPathCommand {
  internal let Kind VectorPathCommandKind
  internal let X1 float64
  internal let Y1 float64
  internal let X2 float64
  internal let Y2 float64
  internal let X3 float64
  internal let Y3 float64
  internal let RadiusX float64
  internal let RadiusY float64
  internal let RotationDegrees float64
  internal let LargeArc bool
  internal let SweepClockwise bool
}

internal class VectorPathData {
  private var commandBuffer([]VectorPathCommand)?
  private let immutableHash uint64
  private let immutableHasClosedContour bool
  internal let ViewBoxX float64
  internal let ViewBoxY float64
  internal let StoredWidth float64
  internal let StoredHeight float64
  private let immutableNormalizedQuadratics([]PathQuadratic)?
  private let immutableNormalizedContours([]PathContour)?
  private let normalizedOwner VectorPathNormalizedOwner?

  internal prop Hash uint64{
    get {
      guard let owner = normalizedOwner else { return immutableHash }
      return owner.ContentHash
    }
  }

  internal prop HasClosedContour bool{
    get {
      guard let owner = normalizedOwner else { return immutableHasClosedContour }
      return owner.HasClosedContour
    }
  }

  internal prop GeometryRevision uint64{
    get {
      guard let owner = normalizedOwner else { return 1uL }
      return owner.GeometryRevision
    }
  }

  internal prop NormalizedOwner VectorPathNormalizedOwner? {
    get -> normalizedOwner
  }

  internal prop NormalizedQuadratics([]PathQuadratic)? {
    get {
      guard let owner = normalizedOwner else { return immutableNormalizedQuadratics }
      return owner.Quadratics
    }
  }

  internal prop NormalizedContours([]PathContour)? {
    get {
      guard let owner = normalizedOwner else { return immutableNormalizedContours }
      return owner.Contours
    }
  }

  internal prop NormalizedQuadraticCount int32{
    get {
      guard let owner = normalizedOwner else {
        guard let values = immutableNormalizedQuadratics else { return 0 }
        return values.Length
      }
      return owner.QuadraticCount
    }
  }

  internal prop NormalizedContourCount int32{
    get {
      guard let owner = normalizedOwner else {
        guard let values = immutableNormalizedContours else { return 0 }
        return values.Length
      }
      return owner.ContourCount
    }
  }

  internal prop Commands []VectorPathCommand{
    get {
      if normalizedOwner != nil { return []VectorPathCommand{} }
      guard let existing = commandBuffer else {
        guard let quadratics = NormalizedQuadratics else { return []VectorPathCommand{} }
        guard let contours = NormalizedContours else { return []VectorPathCommand{} }
        let generated = List[VectorPathCommand]()
        var contourIndex int32 = 0
        while contourIndex < contours.Length {
          let contour = contours[contourIndex]
          if contour.End > contour.Start {
            let first = quadratics[contour.Start]
            generated.Add(VectorPathCommand{
              Kind: VectorPathCommandKind.MoveTo,
              X1: float64(first.X0),
              Y1: float64(first.Y0),
            })
            var curveIndex = contour.Start
            while curveIndex < contour.End {
              let curve = quadratics[curveIndex]
              generated.Add(VectorPathCommand{
                Kind: VectorPathCommandKind.QuadraticTo,
                X1: float64(curve.CX),
                Y1: float64(curve.CY),
                X2: float64(curve.X1),
                Y2: float64(curve.Y1),
              })
              curveIndex++
            }
            if contour.Closed {
              generated.Add(VectorPathCommand{ Kind: VectorPathCommandKind.Close })
            }
          }
          contourIndex++
        }
        commandBuffer = generated.ToArray()
        return commandBuffer!!
      }
      return existing
    }
  }

  internal prop CommandCount int32{
    get {
      guard let existing = commandBuffer else {
        guard let contours = NormalizedContours else { return 0 }
        guard let quadratics = NormalizedQuadratics else { return 0 }
        var count int32 = 0
        var contourIndex int32 = 0
        while contourIndex < contours.Length {
          let contour = contours[contourIndex]
          if contour.End > contour.Start {
            count = count + 1 + (contour.End - contour.Start)
            if contour.Closed { count++ }
          }
          contourIndex++
        }
        return count
      }
      return existing.Length
    }
  }

  internal init(commands []VectorPathCommand, hash uint64, hasClosedContour bool,
    viewBoxX float64, viewBoxY float64, storedWidth float64, storedHeight float64) {
      commandBuffer = commands
      immutableHash = hash
      immutableHasClosedContour = hasClosedContour
      ViewBoxX = viewBoxX
      ViewBoxY = viewBoxY
      StoredWidth = storedWidth
      StoredHeight = storedHeight
      immutableNormalizedQuadratics = nil
      immutableNormalizedContours = nil
      normalizedOwner = nil
    }

  internal init(commands []VectorPathCommand, hash uint64, hasClosedContour bool,
    viewBoxX float64, viewBoxY float64, storedWidth float64, storedHeight float64,
    normalizedQuadratics []PathQuadratic, normalizedContours []PathContour) {
      commandBuffer = nil
      immutableHash = hash
      immutableHasClosedContour = hasClosedContour
      ViewBoxX = viewBoxX
      ViewBoxY = viewBoxY
      StoredWidth = storedWidth
      StoredHeight = storedHeight
      immutableNormalizedQuadratics = normalizedQuadratics
      immutableNormalizedContours = normalizedContours
      normalizedOwner = nil
    }

  internal init(owner VectorPathNormalizedOwner,
    viewBoxX float64, viewBoxY float64, storedWidth float64, storedHeight float64) {
      commandBuffer = nil
      immutableHash = 0uL
      immutableHasClosedContour = false
      ViewBoxX = viewBoxX
      ViewBoxY = viewBoxY
      StoredWidth = storedWidth
      StoredHeight = storedHeight
      immutableNormalizedQuadratics = nil
      immutableNormalizedContours = nil
      normalizedOwner = owner
    }

  public override func Equals(obj object?) bool -> switch obj {
    case other is VectorPathData: equalsData(other)
    case _: false
  }

  public override func GetHashCode() int32 -> int32((Hash ^ (Hash >> 32)) & uint64(2147483647))

  private func equalsData(other VectorPathData) bool {
    if Object.ReferenceEquals(this, other) { return true }
    if Hash != other.Hash || ViewBoxX != other.ViewBoxX || ViewBoxY != other.ViewBoxY
      || StoredWidth != other.StoredWidth || StoredHeight != other.StoredHeight{
        return false
      }
    guard let owner = normalizedOwner else {
      guard let otherOwner = other.normalizedOwner else {
        guard let quadratics = NormalizedQuadratics else { return equalsCommands(other) }
        guard let contours = NormalizedContours else { return false }
        guard let otherQuadratics = other.NormalizedQuadratics else { return false }
        guard let otherContours = other.NormalizedContours else { return false }
        if NormalizedQuadraticCount != other.NormalizedQuadraticCount
          || NormalizedContourCount != other.NormalizedContourCount{ return false }
        var i int32 = 0
        while i < NormalizedQuadraticCount {
          if quadratics[i] != otherQuadratics[i] { return false }
          i++
        }
        i = 0
        while i < NormalizedContourCount {
          if contours[i] != otherContours[i] { return false }
          i++
        }
        return true
      }
      guard let quadratics = NormalizedQuadratics else { return false }
      guard let contours = NormalizedContours else { return false }
      if NormalizedQuadraticCount != otherOwner.QuadraticCount
        || NormalizedContourCount != otherOwner.ContourCount{ return false }
      var i int32 = 0
      while i < NormalizedQuadraticCount {
        if quadratics[i] != otherOwner.Quadratics[i] { return false }
        i++
      }
      i = 0
      while i < NormalizedContourCount {
        if contours[i] != otherOwner.Contours[i] { return false }
        i++
      }
      return true
    }
    guard let otherOwner = other.normalizedOwner else {
      guard let quadratics = other.NormalizedQuadratics else { return false }
      guard let contours = other.NormalizedContours else { return false }
      if owner.QuadraticCount != other.NormalizedQuadraticCount
        || owner.ContourCount != other.NormalizedContourCount{ return false }
      var i int32 = 0
      while i < owner.QuadraticCount {
        if owner.Quadratics[i] != quadratics[i] { return false }
        i++
      }
      i = 0
      while i < owner.ContourCount {
        if owner.Contours[i] != contours[i] { return false }
        i++
      }
      return true
    }
    return owner.ContentEquals(otherOwner)
  }

  private func equalsCommands(other VectorPathData) bool {
    if CommandCount != other.CommandCount { return false }
    var i int32 = 0
    let left = Commands
    let right = other.Commands
    while i < left.Length {
      if left[i] != right[i] { return false }
      i++
    }
    return true
  }
}

/// Represents an immutable vector path in a top-left coordinate system.
/// Coordinates increase rightward on x and downward on y.
public struct VectorPath {
  internal let payload VectorPathData?

  /// Gets the view-box left coordinate.
  public prop ViewBoxX float64{
    get {
      guard let d = payload else { return 0.0 }
      return d.ViewBoxX
    }
  }
  /// Gets the view-box top coordinate.
  public prop ViewBoxY float64{
    get {
      guard let d = payload else { return 0.0 }
      return d.ViewBoxY
    }
  }
  /// Gets the view-box width.
  public prop ViewBoxWidth float64{
    get {
      guard let d = payload else { return 1.0 }
      return d.StoredWidth == 0.0 ? 1.0 : d.StoredWidth
    }
  }
  /// Gets the view-box height.
  public prop ViewBoxHeight float64{
    get {
      guard let d = payload else { return 1.0 }
      return d.StoredHeight == 0.0 ? 1.0 : d.StoredHeight
    }
  }

  internal prop CommandCount int32{
    get {
      guard let d = payload else { return 0 }
      return d.CommandCount
    }
  }

  internal prop Hash uint64{
    get {
      guard let d = payload else { return uint64(0) }
      return d.Hash
    }
  }

  internal prop GeometryRevision uint64{
    get {
      guard let d = payload else { return 1uL }
      return d.GeometryRevision
    }
  }

  internal prop NormalizedOwner VectorPathNormalizedOwner? {
    get {
      guard let d = payload else { return nil }
      return d.NormalizedOwner
    }
  }

  internal prop HasClosedContour bool{
    get {
      guard let d = payload else { return false }
      return d.HasClosedContour
    }
  }

  internal func UpdateNormalized(quadratics []PathQuadratic, quadraticCount int32,
    contours []PathContour, contourCount int32) bool{
      guard let d = payload else { return false }
      guard let owner = d.NormalizedOwner else { return false }
      return owner.Update(quadratics, quadraticCount, contours, contourCount)
    }

  shared {
    internal func Create(commands []VectorPathCommand,
      viewBoxX float64, viewBoxY float64, viewBoxWidth float64, viewBoxHeight float64) VectorPath{
        let storedWidth = viewBoxWidth == 1.0 ? 0.0 : viewBoxWidth
        let storedHeight = viewBoxHeight == 1.0 ? 0.0 : viewBoxHeight
        // Empty unit-view-box content collapses to the default Empty value.
        if commands.Length == 0 && viewBoxX == 0.0 && viewBoxY == 0.0
          && storedWidth == 0.0 && storedHeight == 0.0 {
            return VectorPath{}
          }
        var closed = false
        for i in 0 ... commands.Length {
          if commands[i].Kind == VectorPathCommandKind.Close {
            closed = true
          }
        }
        let hash = contentHash(commands, viewBoxX, viewBoxY, storedWidth, storedHeight)
        return VectorPath{
          payload: VectorPathData(commands, hash, closed, viewBoxX, viewBoxY, storedWidth, storedHeight),
        }
      }

    internal func CreateNormalized(quadratics []PathQuadratic, contours []PathContour,
      viewBoxX float64, viewBoxY float64, viewBoxWidth float64, viewBoxHeight float64) VectorPath{
        validateNormalized(quadratics, contours, viewBoxX, viewBoxY, viewBoxWidth, viewBoxHeight)
        let storedWidth = viewBoxWidth == 1.0 ? 0.0 : viewBoxWidth
        let storedHeight = viewBoxHeight == 1.0 ? 0.0 : viewBoxHeight
        if quadratics.Length == 0 && contours.Length == 0 && viewBoxX == 0.0 && viewBoxY == 0.0
          && storedWidth == 0.0 && storedHeight == 0.0 {
            return VectorPath{}
          }
        let hash = normalizedHash(quadratics, contours, viewBoxX, viewBoxY,
          storedWidth, storedHeight)
        var closed = false
        var contourIndex int32 = 0
        while contourIndex < contours.Length {
          if contours[contourIndex].Closed { closed = true }
          contourIndex++
        }
        return VectorPath{
          payload: VectorPathData([]VectorPathCommand{}, hash, closed, viewBoxX, viewBoxY,
            storedWidth, storedHeight, quadratics, contours),
        }
      }

    internal func CreateMutableNormalized(owner VectorPathNormalizedOwner,
      viewBoxX float64, viewBoxY float64, viewBoxWidth float64, viewBoxHeight float64) VectorPath{
        if owner == nil {
          throw ArgumentNullException("owner")
        }
        validateNormalizedViewBox(viewBoxX, viewBoxY, viewBoxWidth, viewBoxHeight)
        let storedWidth = viewBoxWidth == 1.0 ? 0.0 : viewBoxWidth
        let storedHeight = viewBoxHeight == 1.0 ? 0.0 : viewBoxHeight
        return VectorPath{
          payload: VectorPathData(owner, viewBoxX, viewBoxY, storedWidth, storedHeight),
        }
      }

    private func validateNormalized(quadratics []PathQuadratic, contours []PathContour,
      viewBoxX float64, viewBoxY float64, viewBoxWidth float64, viewBoxHeight float64) {
        validateNormalizedViewBox(viewBoxX, viewBoxY, viewBoxWidth, viewBoxHeight)
        var curveIndex int32 = 0
        while curveIndex < quadratics.Length {
          let curve = quadratics[curveIndex]
          if !finite(curve.X0) || !finite(curve.Y0) || !finite(curve.CX)
            || !finite(curve.CY) || !finite(curve.X1) || !finite(curve.Y1) {
              throw ArgumentOutOfRangeException("quadratics")
            }
          curveIndex++
        }
        var contourIndex int32 = 0
        while contourIndex < contours.Length {
          let contour = contours[contourIndex]
          if contour.Start < 0 || contour.End < contour.Start || contour.End > quadratics.Length
            || (contour.Closed && contour.End == contour.Start) {
              throw ArgumentOutOfRangeException("contours")
            }
          if contour.End > contour.Start {
            let first = quadratics[contour.Start]
            var currentIndex = contour.Start + 1
            while currentIndex < contour.End {
              let previous = quadratics[currentIndex - 1]
              let current = quadratics[currentIndex]
              if current.X0 != previous.X1 || current.Y0 != previous.Y1 {
                throw ArgumentException("quadratic contour is not connected", "contours")
              }
              currentIndex++
            }
            if contour.Closed {
              let last = quadratics[contour.End - 1]
              if last.X1 != first.X0 || last.Y1 != first.Y0 {
                throw ArgumentException("closed quadratic contour is not closed", "contours")
              }
            }
          }
          contourIndex++
        }
      }

    private func validateNormalizedViewBox(viewBoxX float64, viewBoxY float64,
      viewBoxWidth float64, viewBoxHeight float64) {
        if !finite(viewBoxX) || !finite(viewBoxY) || !finite(viewBoxWidth)
          || !finite(viewBoxHeight) || viewBoxWidth <= 0.0 || viewBoxHeight <= 0.0 {
            throw ArgumentOutOfRangeException("viewBox")
          }
      }

    private func finite(value float64) bool -> !Double.IsNaN(value) && !Double.IsInfinity(value)

    private func finite(value float32) bool -> !Single.IsNaN(value) && !Single.IsInfinity(value)

    private func contentHash(commands []VectorPathCommand,
      viewBoxX float64, viewBoxY float64, storedWidth float64, storedHeight float64) uint64{
        var h = uint64(1469598103934665603)
        h = hashDouble(h, viewBoxX)
        h = hashDouble(h, viewBoxY)
        h = hashDouble(h, storedWidth)
        h = hashDouble(h, storedHeight)
        for i in 0 ... commands.Length {
          let c = commands[i]
          h = mix(h, uint64(int32(c.Kind)))
          h = hashDouble(h, c.X1)
          h = hashDouble(h, c.Y1)
          h = hashDouble(h, c.X2)
          h = hashDouble(h, c.Y2)
          h = hashDouble(h, c.X3)
          h = hashDouble(h, c.Y3)
          h = hashDouble(h, c.RadiusX)
          h = hashDouble(h, c.RadiusY)
          h = hashDouble(h, c.RotationDegrees)
          h = mix(h, c.LargeArc ? uint64(1) : uint64(0))
          h = mix(h, c.SweepClockwise ? uint64(1) : uint64(0))
        }
        return h
      }

    private func normalizedHash(quadratics []PathQuadratic, contours []PathContour,
      viewBoxX float64, viewBoxY float64, storedWidth float64, storedHeight float64) uint64{
        var h = uint64(1469598103934665603)
        h = hashDouble(h, viewBoxX)
        h = hashDouble(h, viewBoxY)
        h = hashDouble(h, storedWidth)
        h = hashDouble(h, storedHeight)
        var contourIndex int32 = 0
        while contourIndex < contours.Length {
          let contour = contours[contourIndex]
          if contour.End > contour.Start {
            let first = quadratics[contour.Start]
            h = hashCommand(h, VectorPathCommandKind.MoveTo,
              float64(first.X0), float64(first.Y0), 0.0, 0.0, 0.0, 0.0,
              0.0, 0.0, 0.0, false, false)
            var curveIndex = contour.Start
            while curveIndex < contour.End {
              let curve = quadratics[curveIndex]
              h = hashCommand(h, VectorPathCommandKind.QuadraticTo,
                float64(curve.CX), float64(curve.CY), float64(curve.X1), float64(curve.Y1),
                0.0, 0.0, 0.0, 0.0, 0.0, false, false)
              curveIndex++
            }
            if contour.Closed {
              h = hashCommand(h, VectorPathCommandKind.Close,
                0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, false, false)
            }
          }
          contourIndex++
        }
        return h
      }

    private func hashCommand(h uint64, kind VectorPathCommandKind,
      x1 float64, y1 float64, x2 float64, y2 float64, x3 float64, y3 float64,
      radiusX float64, radiusY float64, rotation float64,
      largeArc bool, sweep bool) uint64{
        var result = mix(h, uint64(int32(kind)))
        result = hashDouble(result, x1)
        result = hashDouble(result, y1)
        result = hashDouble(result, x2)
        result = hashDouble(result, y2)
        result = hashDouble(result, x3)
        result = hashDouble(result, y3)
        result = hashDouble(result, radiusX)
        result = hashDouble(result, radiusY)
        result = hashDouble(result, rotation)
        result = mix(result, largeArc ? uint64(1) : uint64(0))
        return mix(result, sweep ? uint64(1) : uint64(0))
      }

    private func hashDouble(h uint64, value float64) uint64 {
      let normalized = value == 0.0 ? 0.0 : value
      return mix(h, uint64(BitConverter.DoubleToInt64Bits(normalized)))
    }

    private func mix(h uint64, value uint64) uint64 -> (h ^ value) * uint64(1099511628211)

    /// Gets an empty path with a unit view box.
    public prop Empty VectorPath{
      get -> VectorPath {}
    }
  }
}
