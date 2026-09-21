package Goo

import System.Collections.Generic

private func hitWithinMapped(n Node, x float32, y float32) bool -> !n.PaintInputHidden && n.Rect.Contains(x, y)

private func hitCanTraverseMapped(n Node, x float32, y float32) bool {
  if n.PaintInputHidden { return false }
  if n.HasClipPath && !ClipPathGeometry.Contains(n, x, y) { return false }
  if n.OverflowX != Overflow.Visible && (x < n.Rect.X || x >= n.Rect.X + n.Rect.W) {
    return false
  }
  return !(n.OverflowY != Overflow.Visible && (y < n.Rect.Y || y >= n.Rect.Y + n.Rect.H))
}

private func hitCanTraverseChildrenMapped(n Node, x float32, y float32) bool {
  if n.Kind != NodeKind.Editor { return true }
  let left = BoxGeometry.ContentLeft(n)
  let top = BoxGeometry.ContentTop(n)
  if x >= left && x < left + BoxGeometry.ContentWidth(n)
    && y >= top && y < top + BoxGeometry.ContentHeight(n) {
      return true
    }
  for part in ScrollbarParts.ActiveChildren(n) {
    if part.Rect.Contains(x, y) { return true }
  }
  return false
}

private func hitsMapped(n Node, x float32, y float32) bool {
  if !hitWithinMapped(n, x, y) || !n.HitTestSelf {
    return false
  }
  return if n.Kind == NodeKind.Shape { ShapeGeometry.HitTest(n, x, y) } else { true }
}

internal func hitTopmost(root Node, x float32, y float32) Node? {
  if let overlay = Portals.Overlay(root) {
    let portals = Stacking.Children(overlay)
    for var i = portals.Count; i > 0; i-- {
      let portal = portals[i - 1]
      if Portals.Presented(portal) {
        if let hit = hitTreeTopmost(portal, x, y) { return hit }
      }
    }
  }
  return hitTreeTopmost(root, x, y)
}

private func hitTreeTopmost(root Node, x float32, y float32) Node? {
  let point = TransformGeometry.Unmap(root, x, y)
  if !point.Valid || !hitCanTraverseMapped(root, point.X, point.Y) {
    return nil
  }
  if hitCanTraverseChildrenMapped(root, point.X, point.Y) {
    let parts = ScrollbarParts.ActiveChildren(root)
    for var i = parts.Count; i > 0; i-- {
      let child = parts[i - 1]
      if let hit = hitTreeTopmost(child, point.X, point.Y) { return hit }
    }
    let children = Stacking.Children(root)
    for var i = children.Count; i > 0; i-- {
      let child = children[i - 1]
      if !child.IsPortal {
        if let hit = hitTreeTopmost(child, point.X, point.Y) { return hit }
      }
    }
  }
  return hitsMapped(root, point.X, point.Y) ? root : nil
}

internal func hitDispatchClick(root Node, x float32, y float32) bool {
  let chain = List[Node]()
  hitChainInto(root, x, y, chain)
  if chain.Count == 0 || !canReceiveInput(chain[chain.Count - 1]) { return false }
  for var i = chain.Count; i > 0; i-- {
    let n = chain[i - 1]
    if n.OnClick != nil && hitFire(n, CellOwnership.InRoute(chain, i - 1)) { return true }
    if n.FocusScopeBoundary { return false }
  }
  return false
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
  if hitCanTraverseChildrenMapped(n, point.X, point.Y) {
    let parts = ScrollbarParts.ActiveChildren(n)
    for var i = parts.Count; i > 0; i-- {
      let child = parts[i - 1]
      if appendHitChain(child, point.X, point.Y, sink) { return true }
    }
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

private func hitFire(n Node, owner Cell?) bool {
  if let handler = n.OnClick {
    handler()
    if let c = owner {
      c.Rebuild()
    }
    return true
  }
  return false
}
