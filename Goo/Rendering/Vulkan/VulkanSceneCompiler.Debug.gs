package Goo

internal partial class VulkanSceneCompiler {
  private const DebugTooltipOwnerId uint64 = 18446744073709551613uL

  internal func AppendDebugOverlay(value DiagnosticOverlay, version uint64,
    viewportWidth float32, viewportHeight float32) {
      frame.AppendDebugOverlay(value, version)
      if value == nil || value.TooltipText == "" || version == 0uL {
        return
      }
      var source Node? = nil
      if let selected = value.SelectedNode {
        source = selected
      } else if let hovered = value.HoveredNode {
        source = hovered
      }
      guard let node = source else { return }
      let anchor = TransformGeometry.BoundsToWindow(node)
      let tooltipWidth float32 = 220.0F
      let tooltipHeight float32 = 26.0F
      var x = anchor.X + anchor.W + 8.0F
      var y = anchor.Y - tooltipHeight - 8.0F
      if x + tooltipWidth > viewportWidth {
        x = anchor.X - tooltipWidth - 8.0F
      }
      if x < 0.0F { x = 0.0F }
      if y < 0.0F {
        y = anchor.Y + anchor.H + 8.0F
      }
      if y + tooltipHeight > viewportHeight {
        y = viewportHeight - tooltipHeight
      }
      if y < 0.0F { y = 0.0F }
      let tooltipBounds = ConservativeBounds{
        X: x,
        Y: y,
        Width: tooltipWidth,
        Height: tooltipHeight,
      }
      frame.BeginChunk(DebugTooltipOwnerId, version, tooltipBounds, true)
      frame.AddRoundedBox(RoundedBoxRecord{
        Bounds: tooltipBounds,
        RadiusTopLeft: 3.0F,
        RadiusTopRight: 3.0F,
        RadiusBottomRight: 3.0F,
        RadiusBottomLeft: 3.0F,
        Color: Color.Rgba(13, 17, 23, 235).ToPackedRgba(),
        Opacity: 1.0F,
        TransformIndex: -1,
      })
      frame.AddPerEdgeBorder(PerEdgeBorderRecord{
        Bounds: tooltipBounds,
        TopWidth: 1.0F,
        RightWidth: 1.0F,
        BottomWidth: 1.0F,
        LeftWidth: 1.0F,
        RadiusTopLeft: 3.0F,
        RadiusTopRight: 3.0F,
        RadiusBottomRight: 3.0F,
        RadiusBottomLeft: 3.0F,
        TopColor: Color.Rgba(86, 214, 192, 230).ToPackedRgba(),
        RightColor: Color.Rgba(86, 214, 192, 230).ToPackedRgba(),
        BottomColor: Color.Rgba(86, 214, 192, 230).ToPackedRgba(),
        LeftColor: Color.Rgba(86, 214, 192, 230).ToPackedRgba(),
        Style: uint32(int32(BorderStyle.Solid)),
        TransformIndex: -1,
      })
      let label = Node()
      label.Kind = NodeKind.Text
      label.Content = value.TooltipText
      label.Rect = Rect{ X: x, Y: y, W: tooltipWidth, H: tooltipHeight }
      label.Width = Length{ Unit: LengthUnit.Px, Value: tooltipWidth }
      label.Height = Length{ Unit: LengthUnit.Px, Value: tooltipHeight }
      label.FontSize = Length{ Unit: LengthUnit.Px, Value: 11.0F }
      label.Color = Color.White
      label.FontWeight = 600.0
      label.FontFamily = node.FontFamily
      label.PaddingLeft = Length{ Unit: LengthUnit.Px, Value: 7.0F }
      label.PaddingRight = Length{ Unit: LengthUnit.Px, Value: 7.0F }
      label.PaddingTop = Length{ Unit: LengthUnit.Px, Value: 5.0F }
      label.PaddingBottom = Length{ Unit: LengthUnit.Px, Value: 4.0F }
      label.TextWrap = TextWrap.NoWrap
      label.TextTrimming = TextTrimming.Ellipsis
      if let scene = textScene {
        Owner(label)
        scene.Emit(frame, label, 1.0F, -1)
      }
      frame.EndChunk()
    }
}
