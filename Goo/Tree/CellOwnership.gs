package Goo

import System.Collections.Generic

internal class CellOwnership {
  shared {
    internal func Inherit(node Node, inherited Cell?) Cell ? -> node.Fiber ?? inherited

    internal func Nearest(node Node) Cell? {
      var current Node? = node
      while let value = current {
        if let owner = value.Fiber {
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
        owner ??= current.Fiber
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
    internal func InRoute(route List[Node], index int32) Cell? {
      for var i = index;
      i >= 0;
      i-- {
        if let owner = route[i].Fiber {
          return owner
        }
      }
      return nil
    }
  }
}
