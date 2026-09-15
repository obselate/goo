package Goo

import Facebook.Yoga

internal class BoxGeometry {
  shared {
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
