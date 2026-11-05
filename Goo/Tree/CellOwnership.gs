package Goo

import System.Collections.Generic

internal class CellOwnership {
  shared {
    internal func Nearest(node Node) Cell? {
      var current Node? = node
      while let value = current {
        if let owner = renderingCell(value) {
          return owner
        }
        current = value.Parent
      }
      return nil
    }

    internal func Within(root Node?, target Node) Cell? {
      if root == nil {
        return nil
      }
      var current = target
      var owner Cell?
      while true {
        owner ??= renderingCell(current)
        if current == root {
          return owner
        }
        guard let parent = current.Parent else {
          return nil
        }
        if !parent.Children.Contains(current) && !ScrollbarParts.Children(parent).Contains(current) {
          return nil
        }
        current = parent
      }
    }

    // Event routes retain their ancestry even if a callback changes the live tree.
    internal func InRoute(route List[NodeMount], index int32) Cell? {
      for var i = index;
      i >= 0;
      i-- {
        guard let node = route[i].Captured else { continue }
        if let owner = renderingCell(node) {
          return owner
        }
      }
      return nil
    }

    internal func CaptureRoute(route List[NodeMount], owners List[Cell?]) {
      owners.Clear()
      var owner Cell?
      for mount in route {
        if let node = mount.Current { owner = renderingCell(node) ?? owner }
        owners.Add(owner)
      }
    }

    private func renderingCell(node Node) Cell? {
      var owner = node.Fiber
      while let child = owner?.directChild {
        owner = child
      }
      return owner
    }
  }
}
