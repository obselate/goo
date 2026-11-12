package Goo

import System
import System.Collections.Generic
import System.Runtime.CompilerServices
import Facebook.Yoga

internal struct NodeLength {
  internal var Unit LengthUnit
  internal var Value float32
  internal prop Px float32 { get -> Unit == LengthUnit.Px ? Value : 0.0F }
  internal prop HasMagnitude bool { get -> Unit == LengthUnit.Px || Unit == LengthUnit.Percent }
  internal prop IsPercent bool { get -> Unit == LengthUnit.Percent }
  internal prop Magnitude float64 { get -> float64(Value) }
}

internal func operator implicit(value Length) NodeLength -> NodeLength{Unit: value.Unit, Value: value.Value}
public func operator implicit(value int32) NodeLength -> NodeLength{Unit: LengthUnit.Px, Value: float32(value)}
public func operator implicit(value float32) NodeLength -> NodeLength{Unit: LengthUnit.Px, Value: value}
public func operator implicit(value float64) NodeLength -> NodeLength{Unit: LengthUnit.Px, Value: float32(value)}
internal func operator implicit(value NodeLength) Length -> Length{Unit: value.Unit, Value: value.Value}

internal class LengthDeclaration {
  internal var Value Length
}

internal class ResolvedLength {
  internal var Field StyleField
  internal var Value Length
  internal var Pixels float32 = Single.NaN
  internal var Percent float32 = Single.NaN
  internal var EdgeValue StyleLength?
  internal var IntrinsicCache IntrinsicLengthCache?
}

internal class LengthNode {
  internal var Node Node
  internal var Resolver Resolver
  internal var IntrinsicLevel int32
  internal let Values List[ResolvedLength] = List[ResolvedLength]()
}

internal data struct IntrinsicMeasure {
  internal var Width float32
  internal var Height float32
  internal var Minimum float32
  internal var Maximum float32
  internal var Valid bool
}

internal class IntrinsicLengthCache {
  internal var First IntrinsicMeasure
  internal var Second IntrinsicMeasure

  internal func Clear() {
    First.Valid = false
    Second.Valid = false
  }

  internal func Measure(yoga Facebook.Yoga.Node, axis Dimension, width float32, height float32, kind LengthUnit) IntrinsicMeasure {
    if First.Valid && First.Width == width && First.Height == height { return First }
    if Second.Valid && Second.Width == width && Second.Height == height { return Second }
    let minimum = kind == LengthUnit.MaxContent ? 0.0F
      : Facebook.Yoga.LayoutAlgorithm.MeasureIntrinsicSize(yoga, axis, true, width, height)
    let maximum = kind == LengthUnit.MinContent ? minimum
      : Facebook.Yoga.LayoutAlgorithm.MeasureIntrinsicSize(yoga, axis, false, width, height)
    let result = IntrinsicMeasure{Width: width, Height: height, Minimum: minimum, Maximum: maximum, Valid: true}
    Second = First
    First = result
    return result
  }
}

internal class LengthDeclarations {
  shared {
    private var values ConditionalWeakTable[Node, LengthNode]?
    internal var Revision int64
    internal prop Active bool { get -> values != nil }

    internal func Get(node Node) LengthNode? {
      if let table = values {
        if table.TryGetValue(node, out var result) { return result }
      }
      return nil
    }

    internal func StoredPixels(node Node, field StyleField, basis float32) float32 {
      if let state = Get(node) {
        for entry in state.Values {
          if entry.Field == field { return entry.Pixels + entry.Value.PercentPart * basis / 100.0F }
        }
      }
      return Single.NaN
    }

    internal func RestoreSizes(node Node) {
      if let state = Get(node) {
        for entry in state.Values {
          if entry.Field <= StyleField.MaxHeight && entry.Value.PercentPart != 0.0F {
            applyMixedLength(node, entry.Field, entry.Pixels, entry.Percent, entry.EdgeValue!!)
          }
        }
      }
    }

    internal func Set(node Node, entry StyleEntry, resolver Resolver) {
      let source = entry.Payload as LengthDeclaration
      var state = Get(node)
      if state == nil && source == nil { return }
      if state == nil {
        state = LengthNode{Node: node, Resolver: resolver}
        values ??= ConditionalWeakTable[Node, LengthNode]()
        values!!.Add(node, state)
        Revision++
      }
      let list = state.Values
      for i in 0 ... list.Count {
        if list[i].Field != entry.Field { continue }
        if let declaration = source {
          if sameLength(list[i].Value, declaration.Value) { return }
          list[i].IntrinsicCache?.Clear()
          list[i].Value = declaration.Value
          list[i].Pixels = Single.NaN
        } else { list.RemoveAt(i) }
        Revision++
        return
      }
      if let declaration = source {
        list.Add(ResolvedLength{Field: entry.Field, Value: declaration.Value})
        Revision++
      }
    }

    internal func Pixels(value Length, node Node, width float32, height float32, fontSize bool) float32 {
      let font = (fontSize ? node.Parent?.FontSize.Px ?? 16.0F : node.FontSize.Px) *
        (fontSize ? 1.0F : node.TextScaleFactor)
      var root = node
      while let parent = root.Parent { root = parent }
      let rootFont = (fontSize && root == node ? 16.0F : root.FontSize.Px) *
        (fontSize ? 1.0F : node.TextScaleFactor)
      return value.Value + value.EmPart * font + value.RemPart * rootFont +
        value.VwPart * width / 100.0F + value.VhPart * height / 100.0F
    }
  }
}

internal partial class Layout {
  private var lengthRevision int64 = -1L
  private var lengthRoot Node?
  private var lengthNodes List[LengthNode]?
  private var maximumIntrinsicLevel int32 = -1
  private var intrinsicPending bool

  private func collectLengths(node Node, level int32 = 0) {
    var nextLevel = level
    if let state = LengthDeclarations.Get(node) {
      state.IntrinsicLevel = level
      var intrinsic = false
      for entry in state.Values { if entry.Value.IsIntrinsic { intrinsic = true } }
      if intrinsic {
        maximumIntrinsicLevel = Math.Max(maximumIntrinsicLevel, level)
        nextLevel++
      }
      lengthNodes ??= List[LengthNode]()
      if state.Values.Count > 0 { lengthNodes!!.Add(state) }
    }
    for child in node.Children { collectLengths(child, nextLevel) }
  }

  private func resolveLengths(root Node, width float32, height float32) {
    if lengthRevision != LengthDeclarations.Revision || lengthRoot != root {
      lengthNodes?.Clear()
      maximumIntrinsicLevel = -1
      if LengthDeclarations.Revision != 0L { collectLengths(root) }
      lengthRevision = LengthDeclarations.Revision
      lengthRoot = root
    }
    guard let nodes = lengthNodes else { return }
    for state in nodes {
      for entry in state.Values {
        if entry.Field == StyleField.FontSize { resolveLength(state, entry, width, height) }
      }
    }
    for state in nodes {
      for entry in state.Values {
        if entry.Field != StyleField.FontSize && !entry.Value.IsIntrinsic {
          resolveLength(state, entry, width, height)
        }
      }
    }
    for state in nodes {
      for entry in state.Values {
        if !entry.Value.IsIntrinsic && entry.Percent != 0.0F {
          applyMixedLength(state.Node, entry.Field, entry.Pixels, entry.Percent, entry.EdgeValue!!)
        }
      }
    }
    intrinsicPending = maximumIntrinsicLevel >= 0 && (!laidOut || root != lastRoot || width != lastWidth
      || height != lastHeight || root.Yoga?.IsDirty() == true)
    if maximumIntrinsicLevel >= 0 && !intrinsicPending {
      for state in nodes {
        if state.Node.Yoga?.IsDirty() == true { intrinsicPending = true }
      }
    }
    if !intrinsicPending { return }
    for state in nodes {
      if state.Node.Yoga?.IsDirty() == true {
        for entry in state.Values { entry.IntrinsicCache?.Clear() }
      }
    }
    for var i = nodes.Count - 1; i >= 0; i-- {
      let state = nodes[i]
      for entry in state.Values {
        if entry.Value.IsIntrinsic { resolveIntrinsic(state, entry, width, height, true) }
      }
    }
  }

  private func resolveFinalIntrinsic(root Node, width float32, height float32) {
    if !intrinsicPending { return }
    guard let nodes = lengthNodes, let yoga = root.Yoga else { return }
    for level in 0 ... maximumIntrinsicLevel + 1 {
      for state in nodes {
        if state.IntrinsicLevel != level { continue }
        if !belongsToLayout(state.Node, root) { continue }
        for entry in state.Values {
          if entry.Value.IsIntrinsic { resolveIntrinsic(state, entry, width, height, false) }
        }
      }
      if YGNodeAPI.YGNodeIsDirty(yoga) {
        YGNodeAPI.YGNodeCalculateLayout(yoga, width, height, yogaDirection(root.Direction))
      }
    }
  }

  private func belongsToLayout(node Node, root Node) bool {
    var current = node
    while current != root {
      if current.IsPortal { return false }
      guard let parent = current.Parent else { return false }
      current = parent
    }
    return true
  }

  private func resolveLength(state LengthNode, entry ResolvedLength, width float32, height float32) {
    let node = state.Node
    let pixels = LengthDeclarations.Pixels(entry.Value, node, width, height, entry.Field == StyleField.FontSize)
    let percent = entry.Value.PercentPart
    if pixels == entry.Pixels && percent == entry.Percent { return }
    entry.Pixels = pixels
    entry.Percent = percent
    entry.EdgeValue = percent != 0.0F ? StyleLength.Mixed(pixels, percent) : nil

    let packed = StyleEntry{Field: entry.Field, A: pixels,
      B: float32(int32(percent == 0.0F ? LengthUnit.Px : LengthUnit.Relative))}
    if writeDirectWithInvalidation(node, packed, nil, state.Resolver.Owner) && entry.Field == StyleField.FontSize {
      state.Resolver.propagateInherited(node, StyleField.FontSize)
    }
  }
  private func resolveIntrinsic(state LengthNode, entry ResolvedLength, width float32, height float32, provisional bool) {
    let node = state.Node
    guard let yoga = node.Yoga else { return }
    let ownerWidth = !provisional && node.Parent?.Yoga != nil
      ? MathF.Max(0.0F, node.Parent!!.Yoga!!.Layout.Dimension(Dimension.Width) - CustomLayouts.Inset(node.Parent!!.Yoga!!, YGEdge.Left)
        - CustomLayouts.Inset(node.Parent!!.Yoga!!, YGEdge.Right)) : width
    let ownerHeight = !provisional && node.Parent?.Yoga != nil
      ? MathF.Max(0.0F, node.Parent!!.Yoga!!.Layout.Dimension(Dimension.Height) - CustomLayouts.Inset(node.Parent!!.Yoga!!, YGEdge.Top)
        - CustomLayouts.Inset(node.Parent!!.Yoga!!, YGEdge.Bottom)) : height
    let horizontal = entry.Field == StyleField.Width || entry.Field == StyleField.MinWidth
      || entry.Field == StyleField.MaxWidth || entry.Field == StyleField.FlexBasis
      && (node.Parent?.FlexDirection == FlexDirection.Row || node.Parent?.FlexDirection == FlexDirection.RowReverse)
    let axis = horizontal ? Dimension.Width : Dimension.Height
    entry.IntrinsicCache ??= IntrinsicLengthCache()
    let measure = entry.IntrinsicCache!!.Measure(yoga, axis, ownerWidth, ownerHeight, entry.Value.Unit)
    let minimum = measure.Minimum
    var result = minimum
    if entry.Value.Unit != LengthUnit.MinContent {
      let maximum = measure.Maximum
      result = maximum
      if entry.Value.Unit == LengthUnit.FitContent {
        let pixels = LengthDeclarations.Pixels(entry.Value, node, width, height, false)
        let limit = pixels + (provisional ? 0.0F : entry.Value.PercentPart * (horizontal ? ownerWidth : ownerHeight) / 100.0F)
        result = provisional && entry.Value.PercentPart != 0.0F && pixels == 0.0F
          ? maximum : MathF.Min(maximum, MathF.Max(minimum, limit))
      }
    }
    entry.Pixels = result
    writeDirectWithInvalidation(node,
      StyleEntry{Field: entry.Field, A: result, B: float32(int32(LengthUnit.Px))}, nil, state.Resolver.Owner)
  }
}

internal func applyMixedLength(node Node, field StyleField, pixels float32, percent float32, edge StyleLength) {
  let transform = Length{Unit: LengthUnit.Relative, Value: pixels, PercentPart: percent}
  switch field {
    case StyleField.TransformTranslateX {
      Transforming.SetTranslateX(node, transform)
      return
    }
    case StyleField.TransformTranslateY {
      Transforming.SetTranslateY(node, transform)
      return
    }
    case StyleField.TransformOriginX {
      Transforming.SetOriginX(node, transform)
      return
    }
    case StyleField.TransformOriginY {
      Transforming.SetOriginY(node, transform)
      return
    }
    case _ { }
  }
  guard let yoga = node.Yoga else { return }
  let size = StyleSizeLength.Mixed(pixels, percent)
  let same = switch field {
    case StyleField.Width: yoga.Style.Dimension(Dimension.Width) == size
    case StyleField.Height: yoga.Style.Dimension(Dimension.Height) == size
    case StyleField.MinWidth: yoga.Style.MinDimension(Dimension.Width) == size
    case StyleField.MinHeight: yoga.Style.MinDimension(Dimension.Height) == size
    case StyleField.MaxWidth: yoga.Style.MaxDimension(Dimension.Width) == size
    case StyleField.MaxHeight: yoga.Style.MaxDimension(Dimension.Height) == size
    case StyleField.FlexBasis: yoga.Style.FlexBasis == size
    case StyleField.PaddingLeft: yoga.Style.Padding(Edge.Left) == edge
    case StyleField.PaddingTop: yoga.Style.Padding(Edge.Top) == edge
    case StyleField.PaddingRight: yoga.Style.Padding(Edge.Right) == edge
    case StyleField.PaddingBottom: yoga.Style.Padding(Edge.Bottom) == edge
    case StyleField.MarginLeft: yoga.Style.Margin(Edge.Left) == edge
    case StyleField.MarginTop: yoga.Style.Margin(Edge.Top) == edge
    case StyleField.MarginRight: yoga.Style.Margin(Edge.Right) == edge
    case StyleField.MarginBottom: yoga.Style.Margin(Edge.Bottom) == edge
    case StyleField.Gap: yoga.Style.Gap(Gutter.All) == edge
    case StyleField.RowGap: yoga.Style.Gap(Gutter.Row) == edge
    case StyleField.ColumnGap: yoga.Style.Gap(Gutter.Column) == edge
    case StyleField.Left: yoga.Style.Position(Edge.Left) == edge
    case StyleField.Top: yoga.Style.Position(Edge.Top) == edge
    case StyleField.Right: yoga.Style.Position(Edge.Right) == edge
    case StyleField.Bottom: yoga.Style.Position(Edge.Bottom) == edge
    case _: false
  }
  if same { return }
  switch field {
    case StyleField.Width { yoga.Style.SetDimension(Dimension.Width, size) }
    case StyleField.Height { yoga.Style.SetDimension(Dimension.Height, size) }
    case StyleField.MinWidth { yoga.Style.SetMinDimension(Dimension.Width, size) }
    case StyleField.MinHeight { yoga.Style.SetMinDimension(Dimension.Height, size) }
    case StyleField.MaxWidth { yoga.Style.SetMaxDimension(Dimension.Width, size) }
    case StyleField.MaxHeight { yoga.Style.SetMaxDimension(Dimension.Height, size) }
    case StyleField.FlexBasis { yoga.Style.FlexBasis = size }
    case StyleField.PaddingLeft { yoga.Style.SetPadding(Edge.Left, edge) }
    case StyleField.PaddingTop { yoga.Style.SetPadding(Edge.Top, edge) }
    case StyleField.PaddingRight { yoga.Style.SetPadding(Edge.Right, edge) }
    case StyleField.PaddingBottom { yoga.Style.SetPadding(Edge.Bottom, edge) }
    case StyleField.MarginLeft { yoga.Style.SetMargin(Edge.Left, edge) }
    case StyleField.MarginTop { yoga.Style.SetMargin(Edge.Top, edge) }
    case StyleField.MarginRight { yoga.Style.SetMargin(Edge.Right, edge) }
    case StyleField.MarginBottom { yoga.Style.SetMargin(Edge.Bottom, edge) }
    case StyleField.Gap { yoga.Style.SetGap(Gutter.All, edge) }
    case StyleField.RowGap { yoga.Style.SetGap(Gutter.Row, edge) }
    case StyleField.ColumnGap { yoga.Style.SetGap(Gutter.Column, edge) }
    case StyleField.Left { yoga.Style.SetPosition(Edge.Left, edge) }
    case StyleField.Top { yoga.Style.SetPosition(Edge.Top, edge) }
    case StyleField.Right { yoga.Style.SetPosition(Edge.Right, edge) }
    case StyleField.Bottom { yoga.Style.SetPosition(Edge.Bottom, edge) }
    case _ { throw InvalidOperationException("Unsupported mixed length field: " + field.ToString()) }
  }
  yoga.MarkDirtyAndPropagate()
}
