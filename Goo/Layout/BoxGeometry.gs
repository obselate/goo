package Goo

import Facebook.Yoga
import System

internal class BoxGeometry {
  shared {
    internal func Radius(value Length, fallback Length, width float32, height float32) float32 {
      let source = value.HasMagnitude ? value : fallback
      if !source.HasMagnitude || !Single.IsFinite(source.Value) { return 0.0F }
      let basis = MathF.Min(width, height)
      let radius = source.Unit == LengthUnit.Percent ? basis * source.Value / 100.0F : source.Value
      return !Single.IsFinite(radius) || radius <= 0.0F ? 0.0F : MathF.Min(radius, basis * 0.5F)
    }

    internal func ContainsRounded(n Node, x float32, y float32) bool {
      let localX = x - n.Rect.X
      let localY = y - n.Rect.Y
      let corner = if localY < n.Rect.H * 0.5F {
        localX < n.Rect.W * 0.5F ? n.BorderTopLeftRadius : n.BorderTopRightRadius
      } else {
        localX < n.Rect.W * 0.5F ? n.BorderBottomLeftRadius : n.BorderBottomRightRadius
      }
      let radius = Radius(corner, n.BorderRadius, n.Rect.W, n.Rect.H)
      if radius <= 0.0F { return true }
      let dx = MathF.Max(radius - MathF.Min(localX, n.Rect.W - localX), 0.0F)
      let dy = MathF.Max(radius - MathF.Min(localY, n.Rect.H - localY), 0.0F)
      return dx * dx + dy * dy <= radius * radius
    }

    internal func ContentLeft(n Node) float32 -> n.Rect.X + borderPx(n, YGEdge.Left) + padding(n, YGEdge.Left)

    internal func ContentTop(n Node) float32 -> n.Rect.Y + borderPx(n, YGEdge.Top) + padding(n, YGEdge.Top)

    internal func ContentWidth(n Node) float32 {
      let width = n.Rect.W - borderPx(n, YGEdge.Left) - borderPx(n, YGEdge.Right)
      -padding(n, YGEdge.Left) - padding(n, YGEdge.Right)
      return width > 0.0F ? width : 0.0F
    }

    internal func ContentHeight(n Node) float32 {
      let height = n.Rect.H - borderPx(n, YGEdge.Top) - borderPx(n, YGEdge.Bottom)
      -padding(n, YGEdge.Top) - padding(n, YGEdge.Bottom)
      return height > 0.0F ? height : 0.0F
    }

    internal func PaddingEdgeLeft(n Node) float32 -> n.Rect.X + borderPx(n, YGEdge.Left)

    internal func PaddingEdgeTop(n Node) float32 -> n.Rect.Y + borderPx(n, YGEdge.Top)

    internal func PaddingEdgeWidth(n Node) float32 {
      let width = n.Rect.W - borderPx(n, YGEdge.Left) - borderPx(n, YGEdge.Right)
      return width > 0.0F ? width : 0.0F
    }

    internal func PaddingEdgeHeight(n Node) float32 {
      let height = n.Rect.H - borderPx(n, YGEdge.Top) - borderPx(n, YGEdge.Bottom)
      return height > 0.0F ? height : 0.0F
    }

    internal func PaddingRight(n Node) float32 -> padding(n, YGEdge.Right)

    internal func PaddingBottom(n Node) float32 -> padding(n, YGEdge.Bottom)

    internal func ViewportLeft(n Node) float32 -> ContentLeft(n)

    internal func ViewportTop(n Node) float32 -> ContentTop(n)

    internal func ViewportWidth(n Node) float32 -> scrollViewportWidth(n)

    internal func ViewportHeight(n Node) float32 -> scrollViewportHeight(n)

    private func padding(n Node, edge YGEdge) float32 -> resolveEdgePadding(n, edge, 0.0F)

    private func borderPx(n Node, edge YGEdge) float32 {
      let width = switch edge {
        case YGEdge.Left: n.BorderLeftWidth
        case YGEdge.Top: n.BorderTopWidth
        case YGEdge.Right: n.BorderRightWidth
        case YGEdge.Bottom: n.BorderBottomWidth
        default: Length {}
      }
      return width.Px
    }
  }
}
