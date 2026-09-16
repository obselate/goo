package Goo

import Facebook.Yoga
import System
import System.Runtime.CompilerServices

private sealed class VulkanRoundedOverflowPathCacheEntry {
  private const QuadraticCapacity int32 = 12
  private const Diagonal float32 = 0.7071067811865475F
  private const Control float32 = 0.41421356237309503F
  private let owner VectorPathNormalizedOwner
  private let path VectorPath
  private let quadratics []PathQuadratic
  private let contours []PathContour
  private var topLeftX float32
  private var topLeftY float32
  private var topRightX float32
  private var topRightY float32
  private var bottomRightX float32
  private var bottomRightY float32
  private var bottomLeftX float32
  private var bottomLeftY float32
  private var ready bool

  internal init() {
    owner = VectorPathNormalizedOwner(QuadraticCapacity, 1, 0.0, 0.0, 1.0, 1.0)
    path = VectorPath.CreateMutableNormalized(owner, 0.0, 0.0, 1.0, 1.0)
    quadratics = [QuadraticCapacity]PathQuadratic
    contours = [1]PathContour
  }

  internal func Resolve(
    nextTopLeftX float32,
    nextTopLeftY float32,
    nextTopRightX float32,
    nextTopRightY float32,
    nextBottomRightX float32,
    nextBottomRightY float32,
    nextBottomLeftX float32,
    nextBottomLeftY float32) VectorPath{
      if ready && topLeftX == nextTopLeftX && topLeftY == nextTopLeftY
        && topRightX == nextTopRightX && topRightY == nextTopRightY
        && bottomRightX == nextBottomRightX && bottomRightY == nextBottomRightY
        && bottomLeftX == nextBottomLeftX && bottomLeftY == nextBottomLeftY{
          return path
        }
      let topRightCenterX = 1.0F - nextTopRightX
      let topRightCenterY = nextTopRightY
      let bottomRightCenterX = 1.0F - nextBottomRightX
      let bottomRightCenterY = 1.0F - nextBottomRightY
      let bottomLeftCenterX = nextBottomLeftX
      let bottomLeftCenterY = 1.0F - nextBottomLeftY
      let topLeftCenterX = nextTopLeftX
      let topLeftCenterY = nextTopLeftY

      SetQuadratic(0,
        nextTopLeftX, 0.0F,
        (nextTopLeftX + 1.0F - nextTopRightX) * 0.5F, 0.0F,
        1.0F - nextTopRightX, 0.0F)
      SetQuadratic(1,
        1.0F - nextTopRightX, 0.0F,
        topRightCenterX + nextTopRightX * Control, topRightCenterY - nextTopRightY,
        topRightCenterX + nextTopRightX * Diagonal,
        topRightCenterY - nextTopRightY * Diagonal)
      SetQuadratic(2,
        topRightCenterX + nextTopRightX * Diagonal,
        topRightCenterY - nextTopRightY * Diagonal,
        topRightCenterX + nextTopRightX, topRightCenterY - nextTopRightY * Control,
        1.0F, nextTopRightY)
      SetQuadratic(3,
        1.0F, nextTopRightY,
        1.0F, (nextTopRightY + 1.0F - nextBottomRightY) * 0.5F,
        1.0F, 1.0F - nextBottomRightY)
      SetQuadratic(4,
        1.0F, 1.0F - nextBottomRightY,
        bottomRightCenterX + nextBottomRightX,
        bottomRightCenterY + nextBottomRightY * Control,
        bottomRightCenterX + nextBottomRightX * Diagonal,
        bottomRightCenterY + nextBottomRightY * Diagonal)
      SetQuadratic(5,
        bottomRightCenterX + nextBottomRightX * Diagonal,
        bottomRightCenterY + nextBottomRightY * Diagonal,
        bottomRightCenterX + nextBottomRightX * Control, bottomRightCenterY + nextBottomRightY,
        1.0F - nextBottomRightX, 1.0F)
      SetQuadratic(6,
        1.0F - nextBottomRightX, 1.0F,
        (1.0F - nextBottomRightX + nextBottomLeftX) * 0.5F, 1.0F,
        nextBottomLeftX, 1.0F)
      SetQuadratic(7,
        nextBottomLeftX, 1.0F,
        bottomLeftCenterX - nextBottomLeftX * Control, bottomLeftCenterY + nextBottomLeftY,
        bottomLeftCenterX - nextBottomLeftX * Diagonal,
        bottomLeftCenterY + nextBottomLeftY * Diagonal)
      SetQuadratic(8,
        bottomLeftCenterX - nextBottomLeftX * Diagonal,
        bottomLeftCenterY + nextBottomLeftY * Diagonal,
        bottomLeftCenterX - nextBottomLeftX, bottomLeftCenterY + nextBottomLeftY * Control,
        0.0F, 1.0F - nextBottomLeftY)
      SetQuadratic(9,
        0.0F, 1.0F - nextBottomLeftY,
        0.0F, (1.0F - nextBottomLeftY + nextTopLeftY) * 0.5F,
        0.0F, nextTopLeftY)
      SetQuadratic(10,
        0.0F, nextTopLeftY,
        topLeftCenterX - nextTopLeftX, topLeftCenterY - nextTopLeftY * Control,
        topLeftCenterX - nextTopLeftX * Diagonal,
        topLeftCenterY - nextTopLeftY * Diagonal)
      SetQuadratic(11,
        topLeftCenterX - nextTopLeftX * Diagonal,
        topLeftCenterY - nextTopLeftY * Diagonal,
        topLeftCenterX - nextTopLeftX * Control, topLeftCenterY - nextTopLeftY,
        nextTopLeftX, 0.0F)
      contours[0] = PathContour{ Start: 0, End: QuadraticCapacity, Closed: true }
      owner.Update(quadratics, QuadraticCapacity, contours, 1)
      topLeftX = nextTopLeftX
      topLeftY = nextTopLeftY
      topRightX = nextTopRightX
      topRightY = nextTopRightY
      bottomRightX = nextBottomRightX
      bottomRightY = nextBottomRightY
      bottomLeftX = nextBottomLeftX
      bottomLeftY = nextBottomLeftY
      ready = true
      return path
    }

  private func SetQuadratic(index int32, x0 float32, y0 float32, cx float32, cy float32,
    x1 float32, y1 float32) {
      quadratics[index] = PathQuadratic{ X0: x0, Y0: y0, CX: cx, CY: cy, X1: x1, Y1: y1 }
    }
}

internal struct VulkanSceneTraversalContext {
  internal var ParentTransformIndex int32
  internal var ParentRectClipIndex int32
  internal var ParentOpacity float32
  internal var ParentAxisAligned bool
  internal var ParentRectClipDepth int32
  internal var ParentPathClipChainId int32
  internal var ParentIsolation bool
  internal var ExactCullContextSafe bool
  internal var ActiveClipBounds ConservativeBounds
}
