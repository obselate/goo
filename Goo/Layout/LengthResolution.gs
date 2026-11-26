package Goo

import System
import System.Collections.Generic
import System.Runtime.CompilerServices

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
}

internal class LengthNode {
  internal var Node Node
  internal var Resolver Resolver
  internal var IntrinsicLevel int32
  internal var Layout Layout?
  internal let Values List[ResolvedLength] = List[ResolvedLength]()
}

internal class LengthRevision {
  internal var Value int64
}

internal class LengthDeclarations {
  shared {
    private var values ConditionalWeakTable[Node, LengthNode]?
    private let revisions ConditionalWeakTable[Node, LengthRevision] = ConditionalWeakTable[Node, LengthRevision]()
    internal prop Active bool { get -> values != nil }

    internal func Get(node Node) LengthNode? {
      if !node.HasRelativeLengths { return nil }
      if let table = values {
        if table.TryGetValue(node, out var result) { return result }
      }
      return nil
    }
    private func Root(node Node) Node {
      var root = node
      while let parent = root.Parent { root = parent }
      return root
    }

    internal func Revision(root Node) int64 ->
      revisions.TryGetValue(root, out var revision) ? revision.Value : 0L

    private func Invalidate(node Node) {
      let revision = revisions.GetOrCreateValue(Root(node))
      revision.Value++
      FlexLayoutEngine.Invalidate(node)
    }

    internal func Remove(node Node) {
      if !node.HasRelativeLengths { return }
      guard let state = Get(node) else {
        node.HasRelativeLengths = false
        return
      }
      state.Layout?.RemoveLengths(state)
      values?.Remove(node)
      node.HasRelativeLengths = false
      Invalidate(node)
    }

    internal func Set(node Node, entry StyleEntry, resolver Resolver) bool {
      let source = entry.Payload as LengthDeclaration
      var state = Get(node)
      if state == nil && source == nil { return false }
      if state == nil {
        state = LengthNode{Node: node, Resolver: resolver}
        values ??= ConditionalWeakTable[Node, LengthNode]()
        values!!.Add(node, state)
        node.HasRelativeLengths = true
      }
      let list = state.Values
      for i in 0 ... list.Count {
        if list[i].Field != entry.Field { continue }
        if let declaration = source {
          if sameLength(list[i].Value, declaration.Value) { return false }
          list[i].Value = declaration.Value
          list[i].Pixels = Single.NaN
        } else {
          list.RemoveAt(i)
          if list.Count == 0 {
            state.Layout?.RemoveLengths(state)
            values?.Remove(node)
            node.HasRelativeLengths = false
          }
        }
        Invalidate(node)
        return true
      }
      if let declaration = source {
        list.Add(ResolvedLength{Field: entry.Field, Value: declaration.Value})
        Invalidate(node)
        return true
      }
      return false
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
  internal func RemoveLengths(state LengthNode) {
    lengthNodes?.Remove(state)
    state.Layout = nil
  }

  private func collectLengths(node Node, level int32 = 0) {
    var nextLevel = level
    if let state = LengthDeclarations.Get(node) {
      state.Layout = this
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

  internal func resolveLengths(root Node, width float32, height float32) {
    let revision = LengthDeclarations.Revision(root)
    let declarationsChanged = lengthRevision != revision || lengthRoot != root
    if declarationsChanged {
      lengthNodes?.Clear()
      maximumIntrinsicLevel = -1
      if LengthDeclarations.Active { collectLengths(root) }
      lengthRevision = revision
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
    if maximumIntrinsicLevel < 0 {
      intrinsicPending = false
      return
    }
    intrinsicPending = declarationsChanged || !laidOut || root != lastRoot || width != lastWidth
      || height != lastHeight || !root.FlexMeasures.HasCommitted
    if !intrinsicPending {
      for state in nodes {
        if state.Node.Display == Display.None || state.Node.FlexMeasures.HasCommitted { continue }
        for entry in state.Values {
          if entry.Value.IsIntrinsic {
            intrinsicPending = true
            break
          }
        }
        if intrinsicPending { break }
      }
    }
    if !intrinsicPending { return }
    for var i = nodes.Count - 1; i >= 0; i-- {
      let state = nodes[i]
      for entry in state.Values {
        if entry.Value.IsIntrinsic { resolveIntrinsic(state, entry, width, height, true) }
      }
    }
  }

  private func resolveFinalIntrinsic(root Node, request FlexRequest) {
    if !intrinsicPending { return }
    guard let nodes = lengthNodes else { return }
    for level in 0 ... maximumIntrinsicLevel + 1 {
      for state in nodes {
        if state.IntrinsicLevel != level { continue }
        if !belongsToLayout(state.Node, root) { continue }
        for entry in state.Values {
          if entry.Value.IsIntrinsic { resolveIntrinsic(state, entry, request.OwnerWidth, request.OwnerHeight, false) }
        }
      }
      if !root.FlexMeasures.HasCommitted { Engine.ArrangeSubtree(root, request) }
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

    let packed = StyleEntry{Field: entry.Field, A: pixels,
      B: float32(int32(percent == 0.0F ? LengthUnit.Px : LengthUnit.Relative))}
    if percent != 0.0F {
      let resolved = Length{Unit: LengthUnit.Relative, Value: pixels, PercentPart: percent}
      switch entry.Field {
        case StyleField.TransformTranslateX { Transforming.SetTranslateX(node, resolved)
          return
        }
        case StyleField.TransformTranslateY { Transforming.SetTranslateY(node, resolved)
          return
        }
        case StyleField.TransformOriginX { Transforming.SetOriginX(node, resolved)
          return
        }
        case StyleField.TransformOriginY { Transforming.SetOriginY(node, resolved)
          return
        }
        case _ { FlexLayoutEngine.Invalidate(node) }
      }
    }
    if writeDirectWithInvalidation(node, packed, nil, state.Resolver.Owner) && entry.Field == StyleField.FontSize {
      state.Resolver.propagateInherited(node, StyleField.FontSize)
    }
  }
  private func resolveIntrinsic(state LengthNode, entry ResolvedLength, width float32, height float32, provisional bool) {
    let node = state.Node
    var ownerWidth = width
    var ownerHeight = height
    if !provisional {
      if let parent = node.Parent && parent.LogicalLayout.Valid {
        ownerWidth = MathF.Max(0.0F, parent.LogicalLayout.Raw.W - parent.LogicalLayout.Padding.Sum(true) - parent.LogicalLayout.Border.Sum(true))
        ownerHeight = MathF.Max(0.0F, parent.LogicalLayout.Raw.H - parent.LogicalLayout.Padding.Sum(false) - parent.LogicalLayout.Border.Sum(false))
      }
    }
    let horizontal = entry.Field == StyleField.Width || entry.Field == StyleField.MinWidth
      || entry.Field == StyleField.MaxWidth || entry.Field == StyleField.FlexBasis
      && (node.Parent?.FlexDirection == FlexDirection.Row || node.Parent?.FlexDirection == FlexDirection.RowReverse)
    let request = FlexRequest{OwnerWidth: ownerWidth, OwnerHeight: ownerHeight, Direction: node.Direction, Density: Density}
    let minimum = entry.Value.Unit == LengthUnit.MaxContent ? 0.0F : Engine.MeasureIntrinsic(node, horizontal, true, request)
    var result = minimum
    if entry.Value.Unit != LengthUnit.MinContent {
      let maximum = Engine.MeasureIntrinsic(node, horizontal, false, request)
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
