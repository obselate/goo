package Goo

import System
import System.Collections.Generic
import System.Numerics

internal class DiagnosticHitIndex {
  private let nodes List[Node] = List[Node]()
  private let bounds []Vector4

  internal init(root Node) {
    if let overlay = Portals.Overlay(root) {
      let portals = Stacking.Children(overlay)
      for var i = portals.Count; i > 0; i-- {
        if Portals.Presented(portals[i - 1]) { collect(portals[i - 1]) }
      }
    }
    collect(root)
    bounds = [nodes.Count * 4]Vector4
    if nodes.Count > 0 { build(0, nodes.Count, 1) }
  }

  private func collect(n Node) {
    if n.PaintInputHidden { return }
    let parts = ScrollbarParts.ActiveChildren(n)
    for var i = parts.Count; i > 0; i-- { collect(parts[i - 1]) }
    let children = Stacking.Children(n)
    for var i = children.Count; i > 0; i-- {
      if !children[i - 1].IsPortal { collect(children[i - 1]) }
    }
    if n.HitTestSelf { nodes.Add(n) }
  }

  private func build(start int32, end int32, index int32) Vector4 {
    if end - start == 1 {
      let n = nodes[start]
      var current Node? = n
      var transformed = false
      while let ancestor = current {
        transformed = transformed || ancestor.HasVisualTransform
        if ancestor.IsPortal { break }
        current = ancestor.Parent
      }
      bounds[index] = if transformed || (n.Kind == NodeKind.Shape && n.ShapeVectorEffect == VectorEffect.NonScalingStroke) {
        Vector4(Single.NegativeInfinity, Single.NegativeInfinity, Single.PositiveInfinity, Single.PositiveInfinity)
      } else { Vector4(n.Rect.X, n.Rect.Y, n.Rect.X + n.Rect.W, n.Rect.Y + n.Rect.H) }
    } else {
      let middle = start + (end - start) / 2
      let left = build(start, middle, index * 2)
      let right = build(middle, end, index * 2 + 1)
      bounds[index] = Vector4(MathF.Min(left.X, right.X), MathF.Min(left.Y, right.Y),
        MathF.Max(left.Z, right.Z), MathF.Max(left.W, right.W))
    }
    return bounds[index]
  }

  internal func Hit(x float32, y float32) Node? -> if nodes.Count == 0 { nil } else { find(0, nodes.Count, 1, x, y) }

  private func find(start int32, end int32, index int32, x float32, y float32) Node? {
    let box = bounds[index]
    if !(x >= box.X && y >= box.Y && x < box.Z && y < box.W) { return nil }
    if end - start == 1 {
      let n = nodes[start]
      let point = TransformGeometry.WindowToNode(n, x, y)
      if !point.Valid || !hitsMapped(n, point.X, point.Y) { return nil }
      var current Node? = n
      var child Node? = nil
      while let ancestor = current {
        let mapped = TransformGeometry.WindowToNode(ancestor, x, y)
        if !mapped.Valid || !hitCanTraverseMapped(ancestor, mapped.X, mapped.Y) { return nil }
        if let descendant = child {
          if !ScrollbarParts.ActiveChildren(ancestor).Contains(descendant)
            && !hitCanTraverseChildrenMapped(ancestor, mapped.X, mapped.Y) { return nil }
        }
        if ancestor.IsPortal { break }
        child = ancestor
        current = ancestor.Parent
      }
      return n
    }
    let middle = start + (end - start) / 2
    if let hit = find(start, middle, index * 2, x, y) { return hit }
    return find(middle, end, index * 2 + 1, x, y)
  }
}

private func hitWithinMapped(n Node, x float32, y float32) bool {
  if n.PaintInputHidden { return false }
  if n.Kind == NodeKind.Shape && n.ShapeVectorEffect == VectorEffect.NonScalingStroke {
    let extent = ShapeGeometry.StrokeExtent(n, n.BorderLeftWidth.Px)
    return x >= n.Rect.X - extent && y >= n.Rect.Y - extent
      && x < n.Rect.X + n.Rect.W + extent && y < n.Rect.Y + n.Rect.H + extent
  }
  return n.Rect.Contains(x, y)
}

private func hitCanTraverseMapped(n Node, x float32, y float32) bool {
  if n.PaintInputHidden { return false }
  if n.HasClipPath && !ClipPathGeometry.Contains(n, x, y) { return false }
  if n.OverflowX != Overflow.Visible && (x < n.Rect.X || x >= n.Rect.X + n.Rect.W) {
    return false
  }
  return !(n.OverflowY != Overflow.Visible && (y < n.Rect.Y || y >= n.Rect.Y + n.Rect.H))
}

private func hitCanTraverseChildrenMapped(n Node, x float32, y float32) bool {
  let left = BoxGeometry.ContentLeft(n)
  let top = BoxGeometry.ContentTop(n)
  if verticalScrollbarGutter(n) > 0.0F
    && x >= left + scrollViewportWidth(n) {
      return false
    }
  if horizontalScrollbarGutter(n) > 0.0F
    && y >= top + scrollViewportHeight(n) {
      return false
    }
  if n.Kind != NodeKind.Editor { return true }
  return x >= left && x < left + scrollViewportWidth(n)
    && y >= top && y < top + scrollViewportHeight(n)
}

private func hitsMapped(n Node, x float32, y float32) bool {
  if !hitWithinMapped(n, x, y) || !n.HitTestSelf {
    return false
  }
  return if n.Kind == NodeKind.Shape { ShapeGeometry.HitTest(n, x, y) } else { BoxGeometry.ContainsRounded(n, x, y) }
}

internal func hitTopmost(root Node, x float32, y float32, semantics AccessibilityManager? = nil) Node? {
  if let overlay = Portals.Overlay(root) {
    let portals = Stacking.Children(overlay)
    for var i = portals.Count; i > 0; i-- {
      let portal = portals[i - 1]
      if Portals.Presented(portal) {
        if let hit = hitTreeTopmost(portal, x, y, semantics) { return hit }
      }
    }
  }
  return hitTreeTopmost(root, x, y, semantics)
}

private func hitTreeTopmost(root Node, x float32, y float32, semantics AccessibilityManager?) Node? {
  let point = TransformGeometry.Unmap(root, x, y)
  if !point.Valid || !hitCanTraverseMapped(root, point.X, point.Y) {
    return nil
  }
  let parts = ScrollbarParts.ActiveChildren(root)
  for var i = parts.Count; i > 0; i-- {
    let child = parts[i - 1]
    if let hit = hitTreeTopmost(child, point.X, point.Y, semantics) { return hit }
  }
  if hitCanTraverseChildrenMapped(root, point.X, point.Y) {
    let children = Stacking.Children(root)
    for var i = children.Count; i > 0; i-- {
      let child = children[i - 1]
      if !child.IsPortal {
        if let hit = hitTreeTopmost(child, point.X, point.Y, semantics) { return hit }
      }
    }
  }
  if let manager = semantics {
    if manager.DiagnosticNodeFor(root) == nil || !hitWithinMapped(root, point.X, point.Y) { return nil }
    return root.Kind == NodeKind.Shape && !ShapeGeometry.HitTest(root, point.X, point.Y) ? nil : root
  }
  return hitsMapped(root, point.X, point.Y) ? root : nil
}

internal func hitActivate(root Node?, target Node) bool {
  guard let tree = root else { return false }
  return if !canReceiveInput(target) { false } else { hitFire(target, CellOwnership.Within(tree, target)) }
}

// Append the committed path from the root to the topmost node.
internal func hitChainInto(n Node, x float32, y float32, sink List[Node]) {
  if let overlay = Portals.Overlay(n) {
    let portals = Stacking.Children(overlay)
    for var i = portals.Count; i > 0; i-- {
      let portal = portals[i - 1]
      let start = sink.Count
      if Portals.Presented(portal) && appendHitChain(portal, x, y, sink) {
        prependPortalAncestors(portal, start, sink)
        return
      }
      while sink.Count > start { sink.RemoveAt(sink.Count - 1) }
    }
  }
  appendHitChain(n, x, y, sink)
}

private func prependPortalAncestors(portal Node, start int32, sink List[Node]) {
  var current = portal.Parent
  while let ancestor = current {
    sink.Insert(start, ancestor)
    current = ancestor.Parent
  }
}

private func appendHitChain(n Node, x float32, y float32, sink List[Node]) bool {
  let point = TransformGeometry.Unmap(n, x, y)
  if !point.Valid || !hitCanTraverseMapped(n, point.X, point.Y) { return false }
  let start = sink.Count
  sink.Add(n)
  let parts = ScrollbarParts.ActiveChildren(n)
  for var i = parts.Count; i > 0; i-- {
    let child = parts[i - 1]
    if appendHitChain(child, point.X, point.Y, sink) { return true }
  }
  if hitCanTraverseChildrenMapped(n, point.X, point.Y) {
    let children = Stacking.Children(n)
    for var i = children.Count; i > 0; i-- {
      let child = children[i - 1]
      if !child.IsPortal && appendHitChain(child, point.X, point.Y, sink) { return true }
    }
  }
  if hitsMapped(n, point.X, point.Y) { return true }
  sink.RemoveAt(start)
  return false
}

internal func hasActivation(n Node) bool -> n.OnClick != nil || InputCallbacks.Command(n) != nil

private func hitFire(n Node, owner Cell?) bool {
  if let command = InputCallbacks.Command(n) {
    try { return command.Execute() }
    finally { owner?.Rebuild() }
  }
  if let handler = n.OnClick {
    try { handler() }
    finally { owner?.Rebuild() }
    return true
  }
  return false
}
