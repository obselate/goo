package Goo

internal sealed class VectorPathNormalizedOwner {
  private const HashOffset uint64 = 1469598103934665603uL
  private const HashPrime uint64 = 1099511628211uL

  private let viewBoxX float64
  private let viewBoxY float64
  private let storedWidth float64
  private let storedHeight float64
  private let quadratics []PathQuadratic
  private let contours []PathContour
  private var quadraticCount int32
  private var contourCount int32
  private var contentHash uint64
  private var geometryRevision uint64
  private var hasClosedContour bool

  internal prop Quadratics []PathQuadratic{ get -> quadratics }
  internal prop Contours []PathContour{ get -> contours }
  internal prop QuadraticCount int32{ get -> quadraticCount }
  internal prop ContourCount int32{ get -> contourCount }
  internal prop ContentHash uint64{ get -> contentHash }
  internal prop GeometryRevision uint64{ get -> geometryRevision }
  internal prop HasClosedContour bool{ get -> hasClosedContour }

  internal init(quadraticCapacity int32, contourCapacity int32,
    viewBoxX float64, viewBoxY float64, viewBoxWidth float64, viewBoxHeight float64) {
      if quadraticCapacity < 0 || contourCapacity < 0 {
        throw ArgumentOutOfRangeException("capacity")
      }
      if !Finite(viewBoxX) || !Finite(viewBoxY) || !Finite(viewBoxWidth)
        || !Finite(viewBoxHeight) || viewBoxWidth <= 0.0 || viewBoxHeight <= 0.0 {
          throw ArgumentOutOfRangeException("viewBox")
        }
      this.viewBoxX = viewBoxX
      this.viewBoxY = viewBoxY
      storedWidth = viewBoxWidth == 1.0 ? 0.0 : viewBoxWidth
      storedHeight = viewBoxHeight == 1.0 ? 0.0 : viewBoxHeight
      quadratics = [quadraticCapacity]PathQuadratic
      contours = [contourCapacity]PathContour
      geometryRevision = 1uL
      contentHash = ComputeHash()
    }

  internal func Update(values []PathQuadratic, valueCount int32,
    contourValues []PathContour, contourValueCount int32) bool{
      Validate(values, valueCount, contourValues, contourValueCount)
      if Same(values, valueCount, contourValues, contourValueCount) {
        return false
      }
      var index int32 = 0
      while index < valueCount {
        quadratics[index] = values[index]
        index++
      }
      index = 0
      hasClosedContour = false
      while index < contourValueCount {
        contours[index] = contourValues[index]
        if contourValues[index].Closed { hasClosedContour = true }
        index++
      }
      quadraticCount = valueCount
      contourCount = contourValueCount
      contentHash = ComputeHash()
      if geometryRevision == uint64.MaxValue {
        throw OverflowException("Vector path geometry revision overflow")
      }
      geometryRevision = geometryRevision + 1uL
      return true
    }

  internal func ContentEquals(other VectorPathNormalizedOwner) bool {
    if other == nil || contentHash != other.ContentHash
      || quadraticCount != other.QuadraticCount || contourCount != other.ContourCount{
        return false
      }
    var index int32 = 0
    while index < quadraticCount {
      if !SameQuadratic(quadratics[index], other.Quadratics[index]) { return false }
      index++
    }
    index = 0
    while index < contourCount {
      if !SameContour(contours[index], other.Contours[index]) { return false }
      index++
    }
    return true
  }

  private func Same(values []PathQuadratic, valueCount int32,
    contourValues []PathContour, contourValueCount int32) bool{
      if quadraticCount != valueCount || contourCount != contourValueCount {
        return false
      }
      var index int32 = 0
      while index < valueCount {
        if !SameQuadratic(quadratics[index], values[index]) { return false }
        index++
      }
      index = 0
      while index < contourValueCount {
        if !SameContour(contours[index], contourValues[index]) { return false }
        index++
      }
      return true
    }

  private func SameQuadratic(left PathQuadratic, right PathQuadratic) bool -> left.X0 == right.X0 && left.Y0 == right.Y0 && left.CX == right.CX
    && left.CY == right.CY && left.X1 == right.X1 && left.Y1 == right.Y1

  private func SameContour(left PathContour, right PathContour) bool -> left.Start == right.Start && left.End == right.End && left.Closed == right.Closed

  private func Validate(values []PathQuadratic, valueCount int32,
    contourValues []PathContour, contourValueCount int32) {
      if valueCount < 0 || contourValueCount < 0 || valueCount > values.Length
        || contourValueCount > contourValues.Length
        || valueCount > quadratics.Length || contourValueCount > contours.Length{
          throw ArgumentOutOfRangeException("normalized path")
        }
      var index int32 = 0
      while index < valueCount {
        let value = values[index]
        if !Finite(value.X0) || !Finite(value.Y0) || !Finite(value.CX)
          || !Finite(value.CY) || !Finite(value.X1) || !Finite(value.Y1) {
            throw ArgumentOutOfRangeException("quadratics")
          }
        index++
      }
      index = 0
      while index < contourValueCount {
        let contour = contourValues[index]
        if contour.Start < 0 || contour.End < contour.Start || contour.End > valueCount
          || (contour.Closed && contour.End == contour.Start) {
            throw ArgumentOutOfRangeException("contours")
          }
        if contour.End > contour.Start {
          let first = values[contour.Start]
          var curveIndex = contour.Start + 1
          while curveIndex < contour.End {
            let previous = values[curveIndex - 1]
            let current = values[curveIndex]
            if current.X0 != previous.X1 || current.Y0 != previous.Y1 {
              throw ArgumentException("quadratic contour is not connected", "contours")
            }
            curveIndex++
          }
          if contour.Closed {
            let last = values[contour.End - 1]
            if last.X1 != first.X0 || last.Y1 != first.Y0 {
              throw ArgumentException("closed quadratic contour is not closed", "contours")
            }
          }
        }
        index++
      }
    }

  private func ComputeHash() uint64 {
    var hash = HashOffset
    hash = HashDouble(hash, viewBoxX)
    hash = HashDouble(hash, viewBoxY)
    hash = HashDouble(hash, storedWidth)
    hash = HashDouble(hash, storedHeight)
    hash = Mix(hash, uint64(quadraticCount))
    hash = Mix(hash, uint64(contourCount))
    var index int32 = 0
    while index < quadraticCount {
      let value = quadratics[index]
      hash = HashFloat(hash, value.X0)
      hash = HashFloat(hash, value.Y0)
      hash = HashFloat(hash, value.CX)
      hash = HashFloat(hash, value.CY)
      hash = HashFloat(hash, value.X1)
      hash = HashFloat(hash, value.Y1)
      index++
    }
    index = 0
    while index < contourCount {
      let value = contours[index]
      hash = Mix(hash, uint64(uint32(value.Start)))
      hash = Mix(hash, uint64(uint32(value.End)))
      hash = Mix(hash, value.Closed ? 1uL : 0uL)
      index++
    }
    return hash
  }

  private func HashDouble(hash uint64, value float64) uint64 -> Mix(hash, uint64(BitConverter.DoubleToInt64Bits(value == 0.0 ? 0.0 : value)))

  private func HashFloat(hash uint64, value float32) uint64 {
    let normalized = value == 0.0F ? 0.0F : value
    return Mix(hash, uint64(BitConverter.SingleToUInt32Bits(normalized)))
  }

  private func Mix(hash uint64, value uint64) uint64 -> (hash ^ value) * HashPrime

  private func Finite(value float64) bool -> !Double.IsNaN(value) && !Double.IsInfinity(value)

  private func Finite(value float32) bool -> !Single.IsNaN(value) && !Single.IsInfinity(value)
}
