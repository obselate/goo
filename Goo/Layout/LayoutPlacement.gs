package Goo

import System
import System.Numerics
import Facebook.Yoga

internal enum PlacementSizes { Target; Visible }

internal struct LayoutPlacement {
  private var parent Node?
  private var from PlacementSizes
  private var to PlacementSizes
  private var direction Facebook.Yoga.Direction
  private var main Facebook.Yoga.FlexDirection
  private var cross Facebook.Yoga.FlexDirection
  private var fromSize Vector2
  private var toSize Vector2
  private var fromInner Vector2
  private var toInner Vector2
  private var fromCursor float32
  private var toCursor float32
  private var fromBetween float32
  private var toBetween float32
  private var fromAuto float32
  private var toAuto float32

  internal init(n Node, from PlacementSizes, to PlacementSizes) {
    parent = n
    this.from = from
    this.to = to
    guard let yoga = n.Yoga else { return }
    direction = yoga.Layout.GetDirection()
    main = FlexDirectionAlgorithms.ResolveDirection(yoga.Style.FlexDirection, direction)
    cross = FlexDirectionAlgorithms.ResolveCrossDirection(main, direction)
    fromSize = from == PlacementSizes.Visible ? Vector2(n.Rect.W, n.Rect.H) : size(n, from)
    toSize = to == PlacementSizes.Visible ? Vector2(n.Rect.W, n.Rect.H) : size(n, to)
    let horizontal = inset(yoga, Facebook.Yoga.FlexDirection.Row, false) + inset(yoga, Facebook.Yoga.FlexDirection.Row, true)
    let vertical = inset(yoga, Facebook.Yoga.FlexDirection.Column, false) + inset(yoga, Facebook.Yoga.FlexDirection.Column, true)
    fromInner = Vector2(MathF.Max(0.0F, fromSize.X - horizontal), MathF.Max(0.0F, fromSize.Y - vertical))
    toInner = Vector2(MathF.Max(0.0F, toSize.X - horizontal), MathF.Max(0.0F, toSize.Y - vertical))
    if n.FlexWrap != FlexWrap.NoWrap { return }
    var count = 0
    var autoMargins = 0
    var fromUsed = 0.0F
    var toUsed = 0.0F
    for child in n.Children {
      if child.IsPortal || child.Display == Display.None || child.Position == PositionType.Absolute { continue }
      guard let yg = child.Yoga else { continue }
      count++
      if yg.Style.FlexStartMarginIsAuto(main, direction) { autoMargins++ }
      if yg.Style.FlexEndMarginIsAuto(main, direction) { autoMargins++ }
      fromUsed += extent(size(child, from), main) + yg.Style.ComputeMarginForAxis(main, fromInner.X)
      toUsed += extent(size(child, to), main) + yg.Style.ComputeMarginForAxis(main, toInner.X)
    }
    let fromGap = yoga.Style.ComputeGapForAxis(main, extent(fromInner, main))
    let toGap = yoga.Style.ComputeGapForAxis(main, extent(toInner, main))
    let fromFree = extent(fromInner, main) - fromUsed - fromGap * float32(Math.Max(0, count - 1))
    let toFree = extent(toInner, main) - toUsed - toGap * float32(Math.Max(0, count - 1))
    fromBetween = fromGap
    toBetween = toGap
    fromCursor = inset(yoga, main, false)
    toCursor = fromCursor
    if autoMargins != 0 {
      fromAuto = MathF.Max(0.0F, fromFree) / float32(autoMargins)
      toAuto = MathF.Max(0.0F, toFree) / float32(autoMargins)
    } else {
      fromCursor += justify(n.JustifyContent, fromFree, count, ref fromBetween)
      toCursor += justify(n.JustifyContent, toFree, count, ref toBetween)
    }
  }

  internal func Next(child Node) Vector2 {
    guard let n = parent else { return Vector2.Zero }
    guard let yoga = n.Yoga else { return Vector2.Zero }
    guard let yg = child.Yoga else { return Vector2.Zero }
    if child.IsPortal || child.Display == Display.None { return Vector2.Zero }
    let oldSize = size(child, from)
    let newSize = size(child, to)
    if child.Position == PositionType.Absolute {
      return Vector2(absolute(n, child, fromSize, oldSize, true) - absolute(n, child, toSize, newSize, true),
        absolute(n, child, fromSize, oldSize, false) - absolute(n, child, toSize, newSize, false)) * -1.0F
    }
    if n.FlexWrap != FlexWrap.NoWrap { return Vector2.Zero }
    if yg.Style.FlexStartMarginIsAuto(main, direction) {
      fromCursor += fromAuto
      toCursor += toAuto
    }
    let oldMain = fromCursor + yg.Style.ComputeFlexStartMargin(main, direction, fromInner.X)
      + relative(yg, main, extent(fromInner, main))
    let newMain = toCursor + yg.Style.ComputeFlexStartMargin(main, direction, toInner.X)
      + relative(yg, main, extent(toInner, main))
    let oldCross = crossPosition(n, child, fromInner, oldSize)
    let newCross = crossPosition(n, child, toInner, newSize)
    fromCursor += extent(oldSize, main) + yg.Style.ComputeMarginForAxis(main, fromInner.X) + fromBetween
    toCursor += extent(newSize, main) + yg.Style.ComputeMarginForAxis(main, toInner.X) + toBetween
    if yg.Style.FlexEndMarginIsAuto(main, direction) {
      fromCursor += fromAuto
      toCursor += toAuto
    }
    let deltaMain = physical(newMain, toSize, newSize, main) - physical(oldMain, fromSize, oldSize, main)
    let deltaCross = physical(newCross, toSize, newSize, cross) - physical(oldCross, fromSize, oldSize, cross)
    return isRow(main) ? Vector2(deltaMain, deltaCross) : Vector2(deltaCross, deltaMain)
  }

  private func crossPosition(n Node, child Node, inner Vector2, childSize Vector2) float32 {
    let yoga = n.Yoga!
    let yg = child.Yoga!
    let free = extent(inner, cross) - extent(childSize, cross) - yg.Style.ComputeMarginForAxis(cross, inner.X)
    var offset = inset(yoga, cross, false) + yg.Style.ComputeFlexStartMargin(cross, direction, inner.X)
    let startAuto = yg.Style.FlexStartMarginIsAuto(cross, direction)
    let endAuto = yg.Style.FlexEndMarginIsAuto(cross, direction)
    if startAuto { offset += MathF.Max(0.0F, free) / (endAuto ? 2.0F : 1.0F) }
    else if !endAuto {
      let align = child.AlignSelf == AlignSelf.Auto ? n.AlignItems : switch child.AlignSelf {
        case AlignSelf.Center: AlignItems.Center
        case AlignSelf.FlexEnd: AlignItems.FlexEnd
        case AlignSelf.Baseline: AlignItems.Baseline
        case _: AlignItems.FlexStart
      }
      if align == AlignItems.Center { offset += free * 0.5F }
      else if align == AlignItems.FlexEnd { offset += free }
    }
    return offset + relative(yg, cross, extent(inner, cross))
  }

  private func absolute(n Node, child Node, parentSize Vector2, childSize Vector2, horizontal bool) float32 {
    let yoga = n.Yoga!
    let yg = child.Yoga!
    let axis = horizontal ? Facebook.Yoga.FlexDirection.Row : Facebook.Yoga.FlexDirection.Column
    let available = extent(parentSize, axis) - yoga.Style.ComputeBorderForAxis(axis)
    if yg.Style.IsInlineStartPositionDefined(axis, direction) && !yg.Style.IsInlineStartPositionAuto(axis, direction) {
      let position = yg.Style.ComputeInlineStartPosition(axis, direction, available)
        + yoga.Style.ComputeInlineStartBorder(axis, direction)
        + yg.Style.ComputeInlineStartMargin(axis, direction, available)
      return horizontal && direction == Facebook.Yoga.Direction.RTL ? parentSize.X - childSize.X - position : position
    }
    if yg.Style.IsInlineEndPositionDefined(axis, direction) && !yg.Style.IsInlineEndPositionAuto(axis, direction) {
      let position = extent(parentSize, axis) - extent(childSize, axis)
        - yoga.Style.ComputeInlineEndBorder(axis, direction)
        - yg.Style.ComputeInlineEndMargin(axis, direction, available)
        - yg.Style.ComputeInlineEndPosition(axis, direction, available)
      return horizontal && direction == Facebook.Yoga.Direction.RTL ? parentSize.X - childSize.X - position : position
    }
    let resolved = horizontal == isRow(main) ? main : cross
    let leading = inset(yoga, resolved, false)
    let trailing = inset(yoga, resolved, true)
    let free = extent(parentSize, resolved) - leading - trailing - extent(childSize, resolved)
      - yg.Style.ComputeMarginForAxis(resolved, parentSize.X - yoga.Style.ComputeBorderForAxis(Facebook.Yoga.FlexDirection.Row))
    var fraction = 0.0F
    if horizontal == isRow(main) {
      if n.JustifyContent == JustifyContent.FlexEnd { fraction = 1.0F }
      else if n.JustifyContent != JustifyContent.FlexStart && n.JustifyContent != JustifyContent.SpaceBetween { fraction = 0.5F }
    } else {
      let align = child.AlignSelf == AlignSelf.Auto ? int32(n.AlignItems) + 1 : int32(child.AlignSelf)
      if align == int32(AlignSelf.Center) { fraction = 0.5F }
      else if align == int32(AlignSelf.FlexEnd) { fraction = 1.0F }
    }
    return physical(leading + free * fraction + yg.Style.ComputeFlexStartMargin(resolved, direction, parentSize.X), parentSize, childSize, resolved)
  }

  shared {
    internal func size(n Node, mode PlacementSizes) Vector2 {
      let yoga = n.Yoga!
      var result = Vector2(yoga.Layout.RawDimension(Facebook.Yoga.Dimension.Width), yoga.Layout.RawDimension(Facebook.Yoga.Dimension.Height))
      if mode == PlacementSizes.Visible {
        if let state = n.RetainedLayoutTransition { result += state.SizeOffset }
        result.X = MathF.Max(0.0F, result.X)
        result.Y = MathF.Max(0.0F, result.Y)
      }
      return result
    }
    private func isRow(axis Facebook.Yoga.FlexDirection) bool ->
      axis == Facebook.Yoga.FlexDirection.Row || axis == Facebook.Yoga.FlexDirection.RowReverse
    private func extent(value Vector2, axis Facebook.Yoga.FlexDirection) float32 -> isRow(axis) ? value.X : value.Y
    private func physical(position float32, parentSize Vector2, childSize Vector2, axis Facebook.Yoga.FlexDirection) float32 ->
      axis == Facebook.Yoga.FlexDirection.RowReverse || axis == Facebook.Yoga.FlexDirection.ColumnReverse
        ? extent(parentSize, axis) - extent(childSize, axis) - position : position
    private func inset(yoga Facebook.Yoga.Node, axis Facebook.Yoga.FlexDirection, end bool) float32 {
      let edge = end ? FlexDirectionAlgorithms.FlexEndEdge(axis) : FlexDirectionAlgorithms.FlexStartEdge(axis)
      return yoga.Layout.Padding(edge) + yoga.Layout.Border(edge)
    }
    private func relative(yoga Facebook.Yoga.Node, axis Facebook.Yoga.FlexDirection, size float32) float32 {
      if yoga.Style.PositionType == Facebook.Yoga.PositionType.Static { return 0.0F }
      return yoga.Style.IsInlineStartPositionDefined(axis, yoga.Layout.GetDirection()) && !yoga.Style.IsInlineStartPositionAuto(axis, yoga.Layout.GetDirection())
        ? yoga.Style.ComputeInlineStartPosition(axis, yoga.Layout.GetDirection(), size)
        : -yoga.Style.ComputeInlineEndPosition(axis, yoga.Layout.GetDirection(), size)
    }
    private func justify(value JustifyContent, free float32, count int32, ref between float32) float32 {
      if count == 0 { return 0.0F }
      if free < 0.0F && (value == JustifyContent.SpaceBetween || value == JustifyContent.SpaceAround || value == JustifyContent.SpaceEvenly) { return 0.0F }
      switch value {
        case JustifyContent.Center: return free * 0.5F
        case JustifyContent.FlexEnd: return free
        case JustifyContent.SpaceBetween {
          if count > 1 { between += free / float32(count - 1) }
        }
        case JustifyContent.SpaceAround {
          let extra = free / float32(count)
          between += extra
          return extra * 0.5F
        }
        case JustifyContent.SpaceEvenly {
          let extra = free / float32(count + 1)
          between += extra
          return extra
        }
      }
      return 0.0F
    }
  }
}
