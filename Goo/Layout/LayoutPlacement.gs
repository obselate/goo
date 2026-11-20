package Goo

import System
import System.Numerics
import Facebook.Yoga

internal struct LayoutPlacement {
  private var parent Node?
  private var rawTarget bool
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
  private var baselineLine bool
  private var fromLine Vector2
  private var toLine Vector2

  internal init(n Node, rawTarget bool = false) {
    parent = n
    this.rawTarget = rawTarget
    let yoga = n.Yoga!!
    direction = yoga.Layout.GetDirection()
    main = FlexDirectionAlgorithms.ResolveDirection(yoga.Style.FlexDirection, direction)
    cross = FlexDirectionAlgorithms.ResolveCrossDirection(main, direction)
    let rounded = targetSize(yoga, false)
    fromSize = rawTarget ? targetSize(yoga, true) : rounded
    toSize = visibleSize(n, rounded)
    let horizontal = inset(yoga, Facebook.Yoga.FlexDirection.Row, false) + inset(yoga, Facebook.Yoga.FlexDirection.Row, true)
    let vertical = inset(yoga, Facebook.Yoga.FlexDirection.Column, false) + inset(yoga, Facebook.Yoga.FlexDirection.Column, true)
    fromInner = Vector2(MathF.Max(0.0F, fromSize.X - horizontal), MathF.Max(0.0F, fromSize.Y - vertical))
    toInner = Vector2(MathF.Max(0.0F, toSize.X - horizontal), MathF.Max(0.0F, toSize.Y - vertical))
    if n.FlexWrap != FlexWrap.NoWrap { return }
    baselineLine = isRow(main) && n.AlignItems == AlignItems.Baseline
    var count = 0
    var autoMargins = 0
    var fromUsed = 0.0F
    var toUsed = 0.0F
    for i in 0 ... n.Children.Count {
      let child = n.Children[i]
      if child.IsPortal || child.Display == Display.None || child.Position == PositionType.Absolute { continue }
      guard let yg = child.Yoga else { continue }
      count++
      baselineLine = baselineLine || isRow(main) && child.AlignSelf == AlignSelf.Baseline
      if yg.Style.FlexStartMarginIsAuto(main, direction) { autoMargins++ }
      if yg.Style.FlexEndMarginIsAuto(main, direction) { autoMargins++ }
      let rounded = targetSize(yg, false)
      let target = rawTarget ? targetSize(yg, true) : rounded
      fromUsed += extent(target, main) + yg.Style.ComputeMarginForAxis(main, fromInner.X)
      toUsed += extent(visibleSize(child, rounded), main) + yg.Style.ComputeMarginForAxis(main, toInner.X)
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
    if baselineLine {
      fromLine = lineMetrics(n, fromInner.X, false)
      toLine = lineMetrics(n, toInner.X, true)
    }
  }

  internal func Next(child Node) Vector2 {
    guard let n = parent else { return Vector2.Zero }
    guard let yg = child.Yoga else { return Vector2.Zero }
    if child.IsPortal || child.Display == Display.None { return Vector2.Zero }
    let rounded = targetSize(yg, false)
    let oldSize = rawTarget ? targetSize(yg, true) : rounded
    let newSize = visibleSize(child, rounded)
    if child.Position == PositionType.Absolute {
      return Vector2(absolute(n, child, toSize, newSize, true) - absolute(n, child, fromSize, oldSize, true),
        absolute(n, child, toSize, newSize, false) - absolute(n, child, fromSize, oldSize, false))
    }
    if n.FlexWrap != FlexWrap.NoWrap { return Vector2.Zero }
    if yg.Style.FlexStartMarginIsAuto(main, direction) {
      fromCursor += fromAuto
      toCursor += toAuto
    }
    let childDirection = yg.Layout.GetDirection()
    let oldMain = fromCursor + yg.Style.ComputeFlexStartMargin(main, childDirection, fromInner.X)
      + relative(yg, main, extent(fromInner, main))
    let newMain = toCursor + yg.Style.ComputeFlexStartMargin(main, childDirection, toInner.X)
      + relative(yg, main, extent(toInner, main))
    let oldCross = crossPosition(n, child, fromInner, oldSize, fromLine)
    let newCross = crossPosition(n, child, toInner, newSize, toLine)
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

  private func crossPosition(n Node, child Node, inner Vector2, childSize Vector2, line Vector2) float32 {
    let yoga = n.Yoga!!
    let yg = child.Yoga!!
    let leading = inset(yoga, cross, false)
    let align = alignment(n, child)
    if baselineLine {
      if align == AlignItems.Baseline {
        return leading + line.Y - retainedBaseline(yg) + yg.Style.ComputeFlexStartPosition(cross, direction, inner.Y)
      }
      if align == AlignItems.Center { return leading + (line.X - childSize.Y) * 0.5F }
      if align == AlignItems.FlexEnd {
        return leading + line.X - childSize.Y - yg.Style.ComputeFlexEndMargin(cross, direction, inner.X)
      }
      if align == AlignItems.Stretch { return leading + yg.Style.ComputeFlexStartMargin(cross, direction, inner.X) }
      return leading + yg.Style.ComputeFlexStartPosition(cross, direction, inner.X)
    }
    let free = extent(inner, cross) - extent(childSize, cross) - yg.Style.ComputeMarginForAxis(cross, inner.X)
    var offset = leading + yg.Style.ComputeFlexStartMargin(cross, yg.Layout.GetDirection(), inner.X)
    let startAuto = yg.Style.FlexStartMarginIsAuto(cross, direction)
    let endAuto = yg.Style.FlexEndMarginIsAuto(cross, direction)
    if startAuto { offset += MathF.Max(0.0F, free) / (endAuto ? 2.0F : 1.0F) }
    else if !endAuto {
      if align == AlignItems.Center { offset += free * 0.5F }
      else if align == AlignItems.FlexEnd { offset += free }
    }
    return offset + relative(yg, cross, extent(inner, cross))
  }

  private func lineMetrics(n Node, width float32, visible bool) Vector2 {
    var height = 0.0F
    var ascent = 0.0F
    var descent = 0.0F
    for i in 0 ... n.Children.Count {
      let child = n.Children[i]
      if child.IsPortal || child.Display == Display.None || child.Position == PositionType.Absolute { continue }
      guard let yoga = child.Yoga else { continue }
      let rounded = targetSize(yoga, false)
      let size = visible ? visibleSize(child, rounded) : rawTarget ? targetSize(yoga, true) : rounded
      let outer = size.Y + yoga.Style.ComputeMarginForAxis(cross, width)
      height = MathF.Max(height, outer)
      if alignment(n, child) == AlignItems.Baseline {
        let baseline = retainedBaseline(yoga) + yoga.Style.ComputeFlexStartMargin(cross, direction, width)
        ascent = MathF.Max(ascent, baseline)
        descent = MathF.Max(descent, outer - baseline)
      }
    }
    return Vector2(MathF.Max(height, ascent + descent), ascent)
  }

  private func absolute(n Node, child Node, parentSize Vector2, childSize Vector2, horizontal bool) float32 {
    let yoga = n.Yoga!!
    let yg = child.Yoga!!
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
      let align = alignment(n, child)
      if align == AlignItems.Center { fraction = 0.5F }
      else if (align == AlignItems.FlexEnd) != (n.FlexWrap == FlexWrap.WrapReverse) { fraction = 1.0F }
    }
    let containingWidth = parentSize.X - yoga.Style.ComputeBorderForAxis(Facebook.Yoga.FlexDirection.Row)
    return physical(leading + free * fraction + yg.Style.ComputeFlexStartMargin(resolved, direction, containingWidth), parentSize, childSize, resolved)
  }

  shared {
    internal func NeedsProjection(n Node, ref ideal bool) bool {
      let count = n.Children.Count
      if count == 0 { return false }
      var active = n.RetainedLayoutTransition?.HasSizeOffset == true
      var retainedChild = false
      for i in 0 ... count {
        let child = n.Children[i]
        if child.IsPortal || child.Display == Display.None { continue }
        if let state = child.RetainedLayoutTransition {
          retainedChild = true
          active = active || state.HasSizeOffset
        }
      }
      if retainedChild {
        let yoga = n.Yoga!!
        ideal = targetSize(yoga, false) != targetSize(yoga, true)
        var i = 0
        while !ideal && i < count {
          let child = n.Children[i]
          i++
          if child.IsPortal || child.Display == Display.None { continue }
          if let yg = child.Yoga { ideal = targetSize(yg, false) != targetSize(yg, true) }
        }
      }
      return active
    }

    private func targetSize(yoga Facebook.Yoga.Node, raw bool) Vector2 -> raw
      ? Vector2(YGNodeLayoutAPI.YGNodeLayoutGetRawWidth(yoga), YGNodeLayoutAPI.YGNodeLayoutGetRawHeight(yoga))
      : Vector2(YGNodeLayoutAPI.YGNodeLayoutGetWidth(yoga), YGNodeLayoutAPI.YGNodeLayoutGetHeight(yoga))

    private func visibleSize(n Node, target Vector2) Vector2 {
      guard let state = n.RetainedLayoutTransition else { return target }
      return Vector2.Max(Vector2.Zero, target + state.SizeOffset)
    }

    private func alignment(parent Node, child Node) AlignItems ->
      child.AlignSelf == AlignSelf.Auto ? parent.AlignItems : AlignItems(int32(child.AlignSelf) - 1)

    private func retainedBaseline(yoga Facebook.Yoga.Node) float32 {
      var first Facebook.Yoga.Node?
      for i in 0 ... int32(yoga.GetChildCount()) {
        guard let child = yoga.GetChild(nuint(i)) else { continue }
        if child.Style.Display == Facebook.Yoga.Display.None || child.Style.PositionType == Facebook.Yoga.PositionType.Absolute { continue }
        if child.GetLineIndex() > 0 { break }
        let align = child.Style.AlignSelf == Facebook.Yoga.Align.Auto ? yoga.Style.AlignItems : child.Style.AlignSelf
        if child.IsReferenceBaseline() || align == Facebook.Yoga.Align.Baseline && isRow(yoga.Style.FlexDirection) {
          return child.Layout.RawTop + retainedBaseline(child)
        }
        first ??= child
      }
      if let child = first { return child.Layout.RawTop + retainedBaseline(child) }
      return yoga.Layout.MeasuredDimension(Facebook.Yoga.Dimension.Height)
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
      if value == JustifyContent.Center { return free * 0.5F }
      if value == JustifyContent.FlexEnd { return free }
      if value == JustifyContent.SpaceBetween && count > 1 {
        between += free / float32(count - 1)
      } else if value == JustifyContent.SpaceAround {
        let extra = free / float32(count)
        between += extra
        return extra * 0.5F
      } else if value == JustifyContent.SpaceEvenly {
        let extra = free / float32(count + 1)
        between += extra
        return extra
      }
      return 0.0F
    }
  }
}
