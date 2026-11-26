package Goo

import System

internal enum PhysicalEdge { Left; Top; Right; Bottom }

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

    internal func ContentLeft(n Node) float32 -> n.Rect.X + BorderWidth(n, PhysicalEdge.Left) + padding(n, PhysicalEdge.Left)

    internal func ContentTop(n Node) float32 -> n.Rect.Y + BorderWidth(n, PhysicalEdge.Top) + padding(n, PhysicalEdge.Top)

    internal func LayoutWidth(n Node) float32 ->
      n.RetainedLayoutTransition != nil && n.LogicalLayout.Valid ? n.LogicalLayout.Snapped.W : n.Rect.W

    internal func LayoutHeight(n Node) float32 ->
      n.RetainedLayoutTransition != nil && n.LogicalLayout.Valid ? n.LogicalLayout.Snapped.H : n.Rect.H

    internal func ContentWidth(n Node, layout bool = false) float32 {
      let width = (layout ? LayoutWidth(n) : n.Rect.W) - BorderWidth(n, PhysicalEdge.Left) - BorderWidth(n, PhysicalEdge.Right)
      -padding(n, PhysicalEdge.Left) - padding(n, PhysicalEdge.Right)
      return width > 0.0F ? width : 0.0F
    }

    internal func ContentHeight(n Node, layout bool = false) float32 {
      let height = (layout ? LayoutHeight(n) : n.Rect.H) - BorderWidth(n, PhysicalEdge.Top) - BorderWidth(n, PhysicalEdge.Bottom)
      -padding(n, PhysicalEdge.Top) - padding(n, PhysicalEdge.Bottom)
      return height > 0.0F ? height : 0.0F
    }

    internal func PaddingEdgeLeft(n Node) float32 -> n.Rect.X + BorderWidth(n, PhysicalEdge.Left)

    internal func PaddingEdgeTop(n Node) float32 -> n.Rect.Y + BorderWidth(n, PhysicalEdge.Top)

    internal func PaddingEdgeWidth(n Node) float32 {
      let width = n.Rect.W - BorderWidth(n, PhysicalEdge.Left) - BorderWidth(n, PhysicalEdge.Right)
      return width > 0.0F ? width : 0.0F
    }

    internal func PaddingEdgeHeight(n Node) float32 {
      let height = n.Rect.H - BorderWidth(n, PhysicalEdge.Top) - BorderWidth(n, PhysicalEdge.Bottom)
      return height > 0.0F ? height : 0.0F
    }

    internal func Inset(n Node, edge PhysicalEdge) float32 -> BorderWidth(n, edge) + padding(n, edge)

    internal func PaddingRight(n Node) float32 -> padding(n, PhysicalEdge.Right)

    internal func PaddingBottom(n Node) float32 -> padding(n, PhysicalEdge.Bottom)

    internal func ViewportWidth(n Node) float32 -> scrollViewportWidth(n)

    internal func ViewportHeight(n Node) float32 -> scrollViewportHeight(n)

    private func padding(n Node, edge PhysicalEdge) float32 -> resolveEdgePadding(n, edge, 0.0F)

    internal func BorderWidth(n Node, edge PhysicalEdge) float32 {
      if n.LogicalLayout.Valid { return n.LogicalLayout.Border.Get(edge) }
      let width = switch edge {
        case PhysicalEdge.Left: n.BorderLeftWidth
        case PhysicalEdge.Top: n.BorderTopWidth
        case PhysicalEdge.Right: n.BorderRightWidth
        case PhysicalEdge.Bottom: n.BorderBottomWidth
        default: NodeLength {}
      }
      return width.Px
    }
  }
}
