package Goo

import System
import System.Collections.Generic

internal class FocusManager {
  private var focused Node?
  private let control InputDispatchControl = InputDispatchControl()
  private var dispatchGeneration int64
  private var changeGeneration int64
  private var nativeFocusAllowed bool = true

  internal var BeforeBlur Action[Node]?
  internal var AfterFocus Action[Node]?
  internal var Changed Action?

  internal func FocusedNode() Node ? -> focused
  internal prop Generation int64{
    get -> changeGeneration
  }
  internal prop NativeFocusAllowed bool{
    get -> nativeFocusAllowed
  }

  internal func CanFocus(n Node) bool -> !n.Retired && n.Focusable && canReceiveInput(n)

  internal func SetNativeFocus(value bool) {
    nativeFocusAllowed = value
    Changed?.Invoke()
  }

  internal func AfterTreeUpdated(root Node?, resolver Resolver) {
    guard let tree = root else {
      SetFocus(resolver, nil)
      return
    }
    if let current = focused {
      if !CanFocus(current) || !containsPath(tree, current) {
        SetFocus(resolver, nil)
      }
    }
    if focused == nil && nativeFocusAllowed {
      if let target = findAutoFocus(FocusScopes.TraversalRoot(tree)) {
        SetFocus(resolver, target)
      }
    }
  }

  internal func SetFocus(resolver Resolver, target Node?) {
    let nextTarget Node? = if let requested = target && CanFocus(requested) {
      requested
    } else {
      nil
    }
    let previous = focused
    if nextTarget == previous {
      return
    }
    changeGeneration++
    let generation = changeGeneration
    focused = nextTarget
    if nextTarget != nil {
      nativeFocusAllowed = true
    }
    if let old = previous {
      BeforeBlur?.Invoke(old)
      old.Focused = false
      resolver.Invalidate(old, false)
    }
    if let next = nextTarget {
      next.Focused = true
      resolver.Invalidate(next, false)
      AfterFocus?.Invoke(next)
    }
    Changed?.Invoke()
    if let old = previous {
      dispatchFocus(old, false)
      if changeGeneration != generation {
        return
      }
    }
    if let next = nextTarget {
      dispatchFocus(next, true)
    }
  }

  internal func MoveFocus(root Node?, resolver Resolver, forward bool) bool {
    guard let tree = root else {
      return false
    }
    let order = List[Node]()
    let scopeRoot = FocusScopes.TraversalRoot(tree)
    collectFocusables(scopeRoot, order)
    if order.Count == 0 && scopeRoot.FocusScopeBoundary && CanFocus(scopeRoot) {
      let before = changeGeneration
      SetFocus(resolver, scopeRoot)
      return changeGeneration != before
    }
    if order.Count == 0 {
      return false
    }
    let current = if let node = focused {
      order.IndexOf(node)
    } else {
      -1
    }
    let direction = forward ? 1 : -1
    let next = current < 0 ? (forward ? 0 : order.Count - 1) : (
      (current + direction) % order.Count + order.Count) % order.Count
    let before = changeGeneration
    SetFocus(resolver, order[next])
    return changeGeneration != before
  }

  internal func Dispose() {
    if let current = focused {
      BeforeBlur?.Invoke(current)
      current.Focused = false
    }
    focused = nil
    nativeFocusAllowed = false
    Changed?.Invoke()
    BeforeBlur = nil
    AfterFocus = nil
    Changed = nil
  }

  private func findAutoFocus(n Node) Node? {
    if n.Retired || n.PaintInputHidden || n.Disabled {
      return nil
    }
    if n.AutoFocus && n.Focusable {
      return n
    }
    for child in n.Children {
      if let found = findAutoFocus(child) {
        return found
      }
    }
    return nil
  }

  internal func FirstScopeFocus(root Node) Node {
    if let automatic = findAutoFocus(root) {
      return automatic
    }
    let order = List[Node]()
    collectFocusables(root, order)
    return order.Count == 0 ? root : order[0]
  }

  private func collectFocusables(n Node, sink List[Node]) {
    if n.Retired || n.PaintInputHidden || n.Disabled {
      return
    }
    if n.Focusable && n.TabStop && !n.FocusScopeBoundary {
      sink.Add(n)
    }
    for child in n.Children {
      collectFocusables(child, sink)
    }
  }

  private func dispatchFocus(target Node, received bool) {
    dispatchGeneration++
    let generation = dispatchGeneration
    control.Begin(generation)
    try {
      var current Node? = target
      while current != nil {
        let node = current
        let callback = received ? InputCallbacks.Focus(node) : InputCallbacks.Blur(node)
        if let handler = callback {
          handler(FocusEvent{Control: control, Generation: generation})
          CellOwnership.Nearest(node)?.Rebuild()
        }
        if control.PropagationStopped || node.FocusScopeBoundary {
          break
        }
        current = node.Parent
      }
    } finally {
      control.Finish(generation)
    }
  }
}
