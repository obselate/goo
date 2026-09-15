package Goo

import System.Collections.Generic

internal enum HitResult { Miss; Unhandled; Handled; Blocked }

private func hitWithinMapped(n Node, x float32, y float32) bool -> !n.PaintInputHidden && n.Rect.Contains(x, y)

private func hitCanTraverseMapped(n Node, x float32, y float32) bool {
  if n.PaintInputHidden { return false }
  if n.HasClipPath && !ClipPathGeometry.Contains(n, x, y) { return false }
  if n.OverflowX != Overflow.Visible && (x < n.Rect.X || x >= n.Rect.X + n.Rect.W) {
    return false
  }
  if n.OverflowY != Overflow.Visible && (y < n.Rect.Y || y >= n.Rect.Y + n.Rect.H) {
    return false
  }
  return true
}

private func hitCanTraverseChildrenMapped(n Node, x float32, y float32) bool {
  if n.Kind != NodeKind.Editor { return true }
  let left = BoxGeometry.ContentLeft(n)
  let top = BoxGeometry.ContentTop(n)
  return x >= left && x < left + BoxGeometry.ContentWidth(n)
    && y >= top && y < top + BoxGeometry.ContentHeight(n)
}

private func hitsMapped(n Node, x float32, y float32) bool {
  if !hitWithinMapped(n, x, y) || !n.HitTestSelf {
    return false
  }
  if n.Kind == NodeKind.Shape {
    return ShapeGeometry.HitTest(n, x, y)
  }
  return true
}

// Reverse order agrees with Painter's paint order: later children win.
// A child that hits at the point is committed to, not skipped.
internal func hitTopmost(root Node, x float32, y float32) Node? {
  let point = TransformGeometry.Unmap(root, x, y)
  if !point.Valid || !hitCanTraverseMapped(root, point.X, point.Y) {
    return nil
  }
  if hitCanTraverseChildrenMapped(root, point.X, point.Y) {
    let children = Stacking.Children(root)
    for var i = children.Count; i > 0; i-- {
      let child = children[i - 1]
      if let hit = hitTopmost(child, point.X, point.Y) {
        return hit
      }
    }
  }
  return hitsMapped(root, point.X, point.Y) ? root : nil
}

internal func hitDispatchClick(root Node, x float32, y float32) bool {
  if root.HasFocusScopes {
    if let target = hitTopmost(root, x, y) {
      if !FocusScopes.Allows(root, target) {
        return false
      }
    }
  }
  return hitDispatch(root, x, y, nil) == HitResult.Handled
}

internal func hitActivate(root Node?, target Node) bool {
  guard let tree = root else { return false }
  if !canReceiveInput(target) {
    return false
  }
  return hitFire(target, CellOwnership.Within(tree, target))
}

// Append the committed path from the root to the topmost node.
internal func hitChainInto(n Node, x float32, y float32, sink List[Node]) {
  appendHitChain(n, x, y, sink)
}

private func appendHitChain(n Node, x float32, y float32, sink List[Node]) bool {
  let point = TransformGeometry.Unmap(n, x, y)
  if !point.Valid || !hitCanTraverseMapped(n, point.X, point.Y) { return false }
  let start = sink.Count
  sink.Add(n)
  if hitCanTraverseChildrenMapped(n, point.X, point.Y) {
    let children = Stacking.Children(n)
    for var i = children.Count; i > 0; i-- {
      let child = children[i - 1]
      if appendHitChain(child, point.X, point.Y, sink) { return true }
    }
  }
  if hitsMapped(n, point.X, point.Y) { return true }
  sink.RemoveAt(start)
  return false
}

// Commit to the topmost child. Do not pass through an occluding sibling.
private func hitDispatch(n Node, x float32, y float32, inherited Cell?) HitResult {
  let point = TransformGeometry.Unmap(n, x, y)
  if !point.Valid || !hitCanTraverseMapped(n, point.X, point.Y) { return HitResult.Miss }
  if n.Disabled { return HitResult.Blocked }
  let owner = CellOwnership.Inherit(n, inherited)
  if hitCanTraverseChildrenMapped(n, point.X, point.Y) {
    let children = Stacking.Children(n)
    for var i = children.Count; i > 0; i-- {
      let child = children[i - 1]
      let result = hitDispatch(child, point.X, point.Y, owner)
      if result == HitResult.Handled || result == HitResult.Blocked {
        return result
      }
      if result == HitResult.Unhandled {
        return hitFire(n, owner) ? HitResult.Handled : (
          n.FocusScopeBoundary ? HitResult.Blocked : HitResult.Unhandled)
      }
    }
  }
  if !hitsMapped(n, point.X, point.Y) { return HitResult.Miss }
  return hitFire(n, owner) ? HitResult.Handled : (n.FocusScopeBoundary ? HitResult.Blocked : HitResult.Unhandled)
}

// A handler presumably mutated its own cell's state; mark it dirty so
// plain fields rebuild without Track or manual Rebuild calls.
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
