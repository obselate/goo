package Goo


internal partial class SceneFrame {
  private const DebugOverlayOwnerId uint64 = 18446744073709551614uL

  internal func AppendDebugOverlay(value DiagnosticOverlay, version uint64) {
    if value == nil || version == 0uL {
      return
    }
    let selected = value.SelectedNode
    let hovered = value.HoveredNode
    if selected == nil && hovered == nil {
      return
    }
    var bounds ConservativeBounds
    var hasBounds = false
    if let node = selected {
      if !node.Retired {
        bounds = DebugBox(node, true, false)
        hasBounds = !bounds.IsEmpty
      }
    }
    if let node = hovered {
      if !node.Retired {
        let next = DebugBox(node, true, false)
        if !next.IsEmpty {
          if !hasBounds {
            bounds = next
            hasBounds = true
          } else {
            bounds = unionVulkanSceneBounds(bounds, next)
          }
        }
      }
    }
    if !hasBounds {
      return
    }
    BeginChunk(DebugOverlayOwnerId, version, bounds.Inflate(4.0F), true)
    if let node = selected {
      if !node.Retired { PaintDebugNode(node, false) }
    }
    if let node = hovered {
      if !node.Retired && node != selected { PaintDebugNode(node, true) }
    }
    EndChunk()
  }

  private func PaintDebugNode(node Node, hovered bool) {
    let border = DebugBox(node, true, false)
    let padding = DebugBox(node, false, false)
    let content = DebugBox(node, false, true)
    let margin = DebugMarginBox(node)
    let marginColor = if hovered { Color.Rgba(244, 189, 102, 42) } else { Color.Rgba(244, 189, 102, 58) }
    let paddingColor = if hovered { Color.Rgba(123, 220, 151, 52) } else { Color.Rgba(123, 220, 151, 72) }
    let contentColor = if hovered { Color.Rgba(180, 151, 255, 62) } else { Color.Rgba(180, 151, 255, 84) }
    let outlineColor = if hovered { Color.Rgba(86, 214, 192, 225) } else { Color.Rgba(255, 189, 102, 240) }
    AddDebugFill(margin, marginColor)
    AddDebugFill(padding, paddingColor)
    AddDebugFill(content, contentColor)
    AddDebugOutline(margin, marginColor)
    AddDebugOutline(border, outlineColor)
    AddDebugOutline(padding, paddingColor)
    AddDebugOutline(content, contentColor)
  }

  private func AddDebugFill(bounds ConservativeBounds, color Color) {
    if bounds.IsEmpty { return }
    AddSolidBox(SolidBoxRecord{
      Bounds: bounds,
      Color: color.ToPackedRgba(),
      Opacity: 1.0F,
      TransformIndex: -1,
    })
  }

  private func AddDebugOutline(bounds ConservativeBounds, color Color) {
    if bounds.IsEmpty { return }
    AddPerEdgeBorder(PerEdgeBorderRecord{
      Bounds: bounds,
      TopWidth: 1.0F,
      RightWidth: 1.0F,
      BottomWidth: 1.0F,
      LeftWidth: 1.0F,
      RadiusTopLeft: 0.0F,
      RadiusTopRight: 0.0F,
      RadiusBottomRight: 0.0F,
      RadiusBottomLeft: 0.0F,
      TopColor: color.ToPackedRgba(),
      RightColor: color.ToPackedRgba(),
      BottomColor: color.ToPackedRgba(),
      LeftColor: color.ToPackedRgba(),
      Style: uint32(int32(BorderStyle.Solid)),
      TransformIndex: -1,
    })
  }

  private func DebugBox(node Node, border bool, content bool) ConservativeBounds {
    let leftBorder = DebugBorder(node, PhysicalEdge.Left)
    let topBorder = DebugBorder(node, PhysicalEdge.Top)
    let rightBorder = DebugBorder(node, PhysicalEdge.Right)
    let bottomBorder = DebugBorder(node, PhysicalEdge.Bottom)
    let leftPadding = DebugPadding(node, PhysicalEdge.Left)
    let topPadding = DebugPadding(node, PhysicalEdge.Top)
    let rightPadding = DebugPadding(node, PhysicalEdge.Right)
    let bottomPadding = DebugPadding(node, PhysicalEdge.Bottom)
    var x = node.Rect.X
    var y = node.Rect.Y
    var width = node.Rect.W
    var height = node.Rect.H
    if !border {
      x = x + leftBorder
      y = y + topBorder
      width = width - leftBorder - rightBorder
      height = height - topBorder - bottomBorder
    }
    if content {
      x = x + leftPadding
      y = y + topPadding
      width = width - leftPadding - rightPadding
      height = height - topPadding - bottomPadding
    }
    if width < 0.0F { width = 0.0F }
    if height < 0.0F { height = 0.0F }
    let mapped = TransformGeometry.BoundsToWindow(node, x, y, width, height)
    return ConservativeBounds{
      X: mapped.X,
      Y: mapped.Y,
      Width: mapped.W,
      Height: mapped.H,
    }
  }

  private func DebugMarginBox(node Node) ConservativeBounds {
    let left = DebugMargin(node, PhysicalEdge.Left)
    let top = DebugMargin(node, PhysicalEdge.Top)
    let right = DebugMargin(node, PhysicalEdge.Right)
    let bottom = DebugMargin(node, PhysicalEdge.Bottom)
    let mapped = TransformGeometry.BoundsToWindow(node,
      node.Rect.X - left, node.Rect.Y - top,
      node.Rect.W + left + right, node.Rect.H + top + bottom)
    return ConservativeBounds{
      X: mapped.X,
      Y: mapped.Y,
      Width: mapped.W,
      Height: mapped.H,
    }
  }

  private func DebugBorder(node Node, edge PhysicalEdge) float32 -> node.LogicalLayout.Valid ? DebugEdge(node.LogicalLayout.Border.Get(edge)) : 0.0F

  private func DebugPadding(node Node, edge PhysicalEdge) float32 -> node.LogicalLayout.Valid ? DebugEdge(node.LogicalLayout.Padding.Get(edge)) : 0.0F

  private func DebugMargin(node Node, edge PhysicalEdge) float32 -> node.LogicalLayout.Valid ? DebugEdge(node.LogicalLayout.Margin.Get(edge)) : 0.0F

  private func DebugEdge(value float32) float32 -> if !finiteVulkanSceneValue(value) { 0.0F } else { value }
}
