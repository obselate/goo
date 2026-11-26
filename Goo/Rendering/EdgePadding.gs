package Goo


internal func resolveEdgePadding(n Node, edge PhysicalEdge, percentBasis float32) float32 {
  if n.LogicalLayout.Valid { return n.LogicalLayout.Padding.Get(edge) }
  let explicit = switch edge {
    case PhysicalEdge.Left: n.PaddingLeft
    case PhysicalEdge.Top: n.PaddingTop
    case PhysicalEdge.Right: n.PaddingRight
    case PhysicalEdge.Bottom: n.PaddingBottom
    default: NodeLength {}
  }
  let value = explicit.Unit == LengthUnit.Unset ? n.Padding : explicit
  if value.Unit == LengthUnit.Px { return value.Value }
  if value.Unit == LengthUnit.Unset { return 0.0F }
  return switch value.Unit {
    case LengthUnit.Percent: percentBasis * value.Value / 100.0F
    default: 0.0F
  }
}
