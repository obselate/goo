package Goo

import System
import System.Numerics

internal struct LayoutPlacement {
  private var parent Node?
  private var rawTarget bool
  private var main FlexAxis
  private var cross FlexAxis
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
  private var fromAscent float32
  private var toAscent float32

  internal init(n Node, rawTarget bool = false) {
    parent = n
    this.rawTarget = rawTarget
    let engine = FlexLayoutEngine.Shared
    main = engine.MainAxis(n, n.LogicalLayout.Direction)
    cross = engine.CrossAxis(n, main, n.LogicalLayout.Direction)
    let rounded = Target(n, false)
    fromSize = rawTarget ? Target(n, true) : rounded
    toSize = Visible(n, rounded)
    let padding = n.LogicalLayout.Padding
    let border = n.LogicalLayout.Border
    let decorations = Vector2(padding.Sum(true) + border.Sum(true), padding.Sum(false) + border.Sum(false))
    fromInner = Vector2.Max(Vector2.Zero, fromSize - decorations)
    toInner = Vector2.Max(Vector2.Zero, toSize - decorations)
    if n.FlexWrap != FlexWrap.NoWrap { return }
    var count = 0
    var autoMargins = 0
    var fromUsed = 0.0F
    var toUsed = 0.0F
    for i in 0 ... n.Children.Count {
      let child = n.Children[i]
      if !InFlow(child) { continue }
      let from = Box(child, fromInner)
      let to = Box(child, toInner)
      let oldSize = Target(child, rawTarget)
      let newSize = Visible(child, Target(child, false))
      count++
      if main.AutoStart(from.AutoMargins) { autoMargins++ }
      if main.AutoEnd(from.AutoMargins) { autoMargins++ }
      fromUsed += Extent(oldSize, main) + from.Margin.Sum(main.Horizontal)
      toUsed += Extent(newSize, main) + to.Margin.Sum(main.Horizontal)
      if main.Horizontal && Alignment(n, child) == AlignItems.Baseline {
        fromAscent = MathF.Max(fromAscent, child.LogicalLayout.Baseline + from.Margin.Start(cross))
        toAscent = MathF.Max(toAscent, child.LogicalLayout.Baseline + to.Margin.Start(cross))
      }
    }
    fromBetween = engine.Gap(n, main.Horizontal, Extent(fromInner, main))
    toBetween = engine.Gap(n, main.Horizontal, Extent(toInner, main))
    let gaps = Math.Max(0, count - 1)
    let fromFree = Extent(fromInner, main) - fromUsed - fromBetween * gaps
    let toFree = Extent(toInner, main) - toUsed - toBetween * gaps
    fromCursor = padding.Start(main) + border.Start(main)
    toCursor = fromCursor
    if autoMargins != 0 {
      fromAuto = MathF.Max(0.0F, fromFree) / autoMargins
      toAuto = MathF.Max(0.0F, toFree) / autoMargins
    } else {
      fromCursor += engine.Distribute(n.JustifyContent, fromFree, count, out var fromSpacing)
      toCursor += engine.Distribute(n.JustifyContent, toFree, count, out var toSpacing)
      fromBetween += fromSpacing
      toBetween += toSpacing
    }
  }

  internal func Next(child Node) Vector2 {
    guard let n = parent else { return Vector2.Zero }
    if !child.LogicalLayout.Valid || child.IsPortal || child.Display == Display.None { return Vector2.Zero }
    let oldSize = Target(child, rawTarget)
    let newSize = Visible(child, Target(child, false))
    if child.Position == PositionType.Absolute {
      return Vector2(Absolute(n, child, toSize, newSize, true) - Absolute(n, child, fromSize, oldSize, true),
        Absolute(n, child, toSize, newSize, false) - Absolute(n, child, fromSize, oldSize, false))
    }
    if n.FlexWrap != FlexWrap.NoWrap { return Vector2.Zero }
    let from = Box(child, fromInner)
    let to = Box(child, toInner)
    if main.AutoStart(from.AutoMargins) {
      fromCursor += fromAuto
      toCursor += toAuto
    }
    let oldMain = main.Offset(Extent(fromSize, main), fromCursor + from.Margin.Start(main), Extent(oldSize, main))
    let newMain = main.Offset(Extent(toSize, main), toCursor + to.Margin.Start(main), Extent(newSize, main))
    let oldCross = cross.Offset(Extent(fromSize, cross), CrossPosition(n, child, fromInner, oldSize, from, fromAscent), Extent(oldSize, cross))
    let newCross = cross.Offset(Extent(toSize, cross), CrossPosition(n, child, toInner, newSize, to, toAscent), Extent(newSize, cross))
    fromCursor += Extent(oldSize, main) + from.Margin.Sum(main.Horizontal) + fromBetween
    toCursor += Extent(newSize, main) + to.Margin.Sum(main.Horizontal) + toBetween
    if main.AutoEnd(from.AutoMargins) {
      fromCursor += fromAuto
      toCursor += toAuto
    }
    let engine = FlexLayoutEngine.Shared
    let direction = n.LogicalLayout.Direction
    let x = engine.RelativeOffset(child, true, toInner.X, direction) - engine.RelativeOffset(child, true, fromInner.X, direction)
    let y = engine.RelativeOffset(child, false, toInner.Y, direction) - engine.RelativeOffset(child, false, fromInner.Y, direction)
    return main.Horizontal ? Vector2(newMain - oldMain + x, newCross - oldCross + y)
      : Vector2(newCross - oldCross + x, newMain - oldMain + y)
  }

  private func CrossPosition(n Node, child Node, inner Vector2, childSize Vector2, in box FlexBox, ascent float32) float32 {
    let leading = n.LogicalLayout.Padding.Start(cross) + n.LogicalLayout.Border.Start(cross)
    let free = Extent(inner, cross) - Extent(childSize, cross) - box.Margin.Sum(cross.Horizontal)
    var offset = leading + box.Margin.Start(cross)
    let startAuto = cross.AutoStart(box.AutoMargins)
    let endAuto = cross.AutoEnd(box.AutoMargins)
    if startAuto { return offset + MathF.Max(0.0F, free) / (endAuto ? 2.0F : 1.0F) }
    if endAuto { return offset }
    let align = Alignment(n, child)
    if align == AlignItems.Center { offset += free * 0.5F }
    else if align == AlignItems.FlexEnd { offset += free }
    else if main.Horizontal && align == AlignItems.Baseline { offset = leading + ascent - child.LogicalLayout.Baseline }
    return offset
  }

  private func Absolute(n Node, child Node, parentSize Vector2, childSize Vector2, horizontal bool) float32 {
    let engine = FlexLayoutEngine.Shared
    let border = n.LogicalLayout.Border
    let paddingBox = parentSize - Vector2(border.Sum(true), border.Sum(false))
    let available = horizontal ? paddingBox.X : paddingBox.Y
    let size = horizontal ? childSize.X : childSize.Y
    let entries = LengthDeclarations.Get(child)
    let start = engine.ProjectedValue(horizontal ? child.Left : child.Top,
      horizontal ? StyleField.Left : StyleField.Top, entries, available)
    let end = engine.ProjectedValue(horizontal ? child.Right : child.Bottom,
      horizontal ? StyleField.Right : StyleField.Bottom, entries, available)
    let box = Box(child, paddingBox)
    if Single.IsFinite(start) || Single.IsFinite(end) {
      let axis = FlexAxis{Horizontal: horizontal}
      let trailing = FlexAxis{Horizontal: horizontal, Reversed: true}
      return border.Start(axis) + engine.AbsoluteOffset(start, end, available, size,
        box.Margin.Start(axis), box.Margin.Start(trailing), axis.AutoStart(box.AutoMargins), axis.AutoEnd(box.AutoMargins),
        horizontal && n.LogicalLayout.Direction == Direction.RightToLeft)
    }
    return engine.StaticOffset(n, child, box.Margin, main, cross, horizontal, horizontal ? parentSize.X : parentSize.Y, size)
  }

  shared {
    internal func NeedsProjection(n Node, ref ideal bool) bool {
      if n.RetainedVirtualState != nil { return false }
      let count = n.Children.Count
      if count == 0 || !n.LogicalLayout.Valid { return false }
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
        ideal = Target(n, false) != Target(n, true)
        var i = 0
        while !ideal && i < count {
          let child = n.Children[i]
          i++
          if child.LogicalLayout.Valid && !child.IsPortal && child.Display != Display.None {
            ideal = Target(child, false) != Target(child, true)
          }
        }
      }
      return active
    }

    private func InFlow(node Node) bool -> node.LogicalLayout.Valid && !node.IsPortal
      && node.Display != Display.None && node.Position != PositionType.Absolute

    private func Box(node Node, basis Vector2) FlexBox {
      let request = FlexRequest{OwnerWidth: basis.X, OwnerHeight: basis.Y, Density: node.LogicalLayout.Density}
      return FlexLayoutEngine.Shared.ResolveBox(node, in request)
    }

    private func Target(node Node, raw bool) Vector2 -> raw
      ? Vector2(node.LogicalLayout.Raw.W, node.LogicalLayout.Raw.H)
      : Vector2(node.LogicalLayout.Snapped.W, node.LogicalLayout.Snapped.H)

    private func Visible(n Node, target Vector2) Vector2 {
      guard let state = n.RetainedLayoutTransition else { return target }
      return Vector2.Max(Vector2.Zero, target + state.SizeOffset)
    }

    private func Alignment(parent Node, child Node) AlignItems ->
      child.AlignSelf == AlignSelf.Auto ? parent.AlignItems : AlignItems(int32(child.AlignSelf) - 1)

    private func Extent(value Vector2, axis FlexAxis) float32 -> axis.Select(value.X, value.Y)
  }
}
