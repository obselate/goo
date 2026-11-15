package Goo

import Facebook.Yoga

internal func resolveEdgePadding(n Node, edge YGEdge, percentBasis float32) float32 {
  let explicit = switch edge {
    case YGEdge.Left: n.PaddingLeft
    case YGEdge.Top: n.PaddingTop
    case YGEdge.Right: n.PaddingRight
    case YGEdge.Bottom: n.PaddingBottom
    default: NodeLength {}
  }
  let value = explicit.Unit == LengthUnit.Unset ? n.Padding : explicit
  if value.Unit == LengthUnit.Px { return value.Value }
  if value.Unit == LengthUnit.Unset { return 0.0F }
  if let yoga = n.Yoga {
    return YGNodeLayoutAPI.YGNodeLayoutGetPadding(yoga, edge)
  }
  return switch value.Unit {
    case LengthUnit.Percent: percentBasis * value.Value / 100.0F
    default: 0.0F
  }
}
