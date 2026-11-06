package Goo

import System.Collections.Generic

internal class Stacking {
  shared {
    internal func Children(n Node) IList[Node] {
      if !n.StackingChildren {
        return n.Children
      }
      if let ordered = n.PortalState?.StackingOrder { return ordered }
      return rebuild(n)
    }

    internal func GetZIndex(n Node) int32 {
      if !n.HasZIndex { return 0 }
      if let value = n.PortalState?.StackingValue { return value.Value }
      n.HasZIndex = false
      return 0
    }

    internal func SetZIndex(n Node, value int32) {
      if GetZIndex(n) == value {
        return
      }
      if value == 0 {
        if let state = n.PortalState { state.StackingValue = nil }
        n.HasZIndex = false
      } else {
        if let stored = n.PortalState?.StackingValue { stored.Value = value }
        else { n.EnsurePortalState().StackingValue = StackingValue{ Value: value } }
        n.HasZIndex = true
      }
      InvalidateChild(n)
    }

    internal func InvalidateChild(n Node) {
      if let parent = n.Parent {
        invalidate(parent)
      }
      if n.IsPortal {
        Portals.InvalidateStacking(n)
      }
    }

    internal func InvalidateStructure(parent Node) {
      invalidate(parent)
    }

    private func invalidate(parent Node) {
      parent.MarkSceneDirty()
      parent.StackingChildren = true
      if let state = parent.PortalState { state.StackingOrder = nil }
    }

    private func rebuild(parent Node) IList[Node] {
      var active = false
      for i in 0 ... parent.Children.Count {
        if parent.Children[i].ZIndex != 0 {
          active = true
          break
        }
      }
      if !active {
        parent.StackingChildren = false
        return parent.Children
      }

      let ordered = List[Node](parent.Children.Count)
      for i in 0 ... parent.Children.Count {
        ordered.Add(parent.Children[i])
      }
      var i int32 = 1
      while i < ordered.Count {
        let child = ordered[i]
        var j = i
        while j > 0 && ordered[j - 1].ZIndex > child.ZIndex {
          ordered[j] = ordered[j - 1]
          j--
        }
        ordered[j] = child
        i++
      }
      parent.EnsurePortalState().StackingOrder = ordered
      return ordered
    }
  }
}

internal class StackingValue {
  internal var Value int32
}
