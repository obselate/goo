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
    private var count int32
    internal prop Active bool { get -> count > 0 }

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
      if values?.Remove(node) == true && count > 0 { count-- }
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
        count++
        node.HasRelativeLengths = true
      }
      let list = state.Values
      for i in 0 ... list.Count {
        if list[i].Field != entry.Field { continue }
        if let declaration = source {
          if sameLength(list[i].Value, declaration.Value) { return false }
          list[i].Value = declaration.Value
          list[i].Pixels = Single.NaN
          if declaration.Value.IsIntrinsic {
            writeDirectWithInvalidation(
              node,
              StyleEntry{Field: entry.Field, A: declaration.Value.Value, B: float32(int32(declaration.Value.Unit))},
              nil,
              resolver.Owner
            )
          }
        } else {
          list.RemoveAt(i)
          if list.Count == 0 {
            state.Layout?.RemoveLengths(state)
            if values?.Remove(node) == true && count > 0 { count-- }
            node.HasRelativeLengths = false
          }
        }
        Invalidate(node)
        return true
      }
      if let declaration = source {
        list.Add(ResolvedLength{Field: entry.Field, Value: declaration.Value})
        if declaration.Value.IsIntrinsic {
          writeDirectWithInvalidation(
            node,
            StyleEntry{Field: entry.Field, A: declaration.Value.Value, B: float32(int32(declaration.Value.Unit))},
            nil,
            resolver.Owner
          )
        }
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
  internal func RemoveLengths(state LengthNode) {
    lengthNodes?.Remove(state)
    state.Layout = nil
  }

  private func collectLengths(node Node) {
    if let state = LengthDeclarations.Get(node) {
      state.Layout = this
      lengthNodes ??= List[LengthNode]()
      if state.Values.Count > 0 { lengthNodes!!.Add(state) }
    }
    for child in node.Children { collectLengths(child) }
  }

  internal func resolveSubtreeLengths(node Node, width float32, height float32) {
    if !LengthDeclarations.Active { return }
    resolveSubtreeLengthsWalk(node, width, height)
  }

  private func resolveSubtreeLengthsWalk(node Node, width float32, height float32) {
    if let state = LengthDeclarations.Get(node) {
      for entry in state.Values {
        if entry.Field == StyleField.FontSize { resolveLength(state, entry, width, height) }
      }
      for entry in state.Values {
        if entry.Field != StyleField.FontSize
          && entry.Value.Unit != LengthUnit.MinContent
          && entry.Value.Unit != LengthUnit.MaxContent {
          resolveLength(state, entry, width, height)
        }
      }
    }
    for child in node.Children { resolveSubtreeLengthsWalk(child, width, height) }
  }

  internal func resolveLengths(root Node, width float32, height float32) {
    if !LengthDeclarations.Active {
      lengthNodes?.Clear()
      lengthRoot = root
      return
    }
    let revision = LengthDeclarations.Revision(root)
    let declarationsChanged = lengthRevision != revision || lengthRoot != root
    if declarationsChanged {
      lengthNodes?.Clear()
      collectLengths(root)
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
        if entry.Field != StyleField.FontSize
          && entry.Value.Unit != LengthUnit.MinContent
          && entry.Value.Unit != LengthUnit.MaxContent {
          resolveLength(state, entry, width, height)
        }
      }
    }
  }

  private func resolveLength(state LengthNode, entry ResolvedLength, width float32, height float32) {
    let node = state.Node
    if entry.Value.Unit == LengthUnit.FitContent {
      let pixels = LengthDeclarations.Pixels(entry.Value, node, width, height, false)
      let percent = entry.Value.PercentPart
      if pixels == entry.Pixels && percent == entry.Percent { return }
      entry.Pixels = pixels
      entry.Percent = percent
      writeDirectWithInvalidation(
        node,
        StyleEntry{Field: entry.Field, A: pixels, B: float32(int32(LengthUnit.FitContent))},
        nil,
        state.Resolver.Owner
      )
      FlexLayoutEngine.Invalidate(node)
      return
    }
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
}
