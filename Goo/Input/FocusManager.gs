package Goo

import System
import System.Collections.Generic
import System.Runtime.ExceptionServices

internal class FocusManager {
  private var focusedMount NodeMount
  private var projectedMount NodeMount
  private prop focused Node? {
    get -> focusedMount.Current
    set -> focusedMount = NodeMount(value)
  }
  private prop projected Node? {
    get -> projectedMount.Current
    set -> projectedMount = NodeMount(value)
  }
  private let control InputDispatchControl = InputDispatchControl()
  private var dispatchGeneration int64
  private var changeGeneration int64
  private var nativeFocusAllowed bool = true
  private var keyboardModality bool

  internal var BeforeBlur Action[Node]?
  internal var AfterFocus Action[Node]?
  internal var Changed Action?

  internal func FocusedNode() Node ? -> focused
  internal func RetainsInteraction(root Node) bool ->
    FocusScopes.Contains(root, focused) || FocusScopes.Contains(root, projected)

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
    if let current = focusedMount.Captured {
      if !CanFocus(current) || !containsPath(tree, current) {
        SetFocus(resolver, nil)
      }
    }
    if focused == nil && nativeFocusAllowed {
      if let target = findAutoFocus(FocusScopes.TraversalRoot(tree)) {
        SetFocus(resolver, target)
      }
    }
    RefreshProjection(resolver)
  }

  internal func SetFocus(resolver Resolver, target Node?) {
    let nextTarget Node? = if let requested = target && CanFocus(requested) {
      requested
    } else {
      nil
    }
    let previousMount = focusedMount
    let previous = previousMount.Captured
    let nextMount = NodeMount(nextTarget)
    if nextTarget == previous {
      return
    }
    changeGeneration++
    let generation = changeGeneration
    focused = nextTarget
    if nextTarget != nil {
      nativeFocusAllowed = true
    }
    var failure Exception?
    if let old = previous {
      old.Focused = false
      old.FocusVisible = false
      resolver.Invalidate(old, false)
    }
    if let next = nextTarget {
      next.Focused = true
      next.FocusVisible = keyboardModality || next.Kind == NodeKind.Entry || next.Kind == NodeKind.Editor
      resolver.Invalidate(next, false)
    }
    RefreshProjection(resolver)
    if let old = previousMount.Captured {
      try { BeforeBlur?.Invoke(old) }
      catch (error Exception) { failure ??= error }
    }
    if changeGeneration == generation {
      if let next = nextMount.Current {
        try { AfterFocus?.Invoke(next) }
        catch (error Exception) { failure ??= error }
      }
    }
    try { Changed?.Invoke() }
    catch (error Exception) { failure ??= error }
    if let old = previousMount.Captured {
      if changeGeneration == generation {
        try { dispatchFocus(old, false) }
        catch (error Exception) { failure ??= error }
      }
    }
    if changeGeneration == generation {
      if let next = nextMount.Current {
        try { dispatchFocus(next, true) }
        catch (error Exception) { failure ??= error }
      }
    }
    if let error = failure { ExceptionDispatchInfo.Capture(error).Throw() }
  }

  internal func SetKeyboardModality(resolver Resolver, value bool) {
    if keyboardModality == value { return }
    keyboardModality = value
    if let node = focused {
      let visible = value || node.Kind == NodeKind.Entry || node.Kind == NodeKind.Editor
      if node.FocusVisible != visible {
        node.FocusVisible = visible
        resolver.Invalidate(node, false)
      }
    }
    RefreshProjection(resolver)
  }

  private func projectionTarget() Node? {
    guard let owner = focused else { return nil }
    if !owner.FocusVisible || owner.Retired { return nil }
    guard let handle = InputCallbacks.FocusTarget(owner) else { return nil }
    guard let node = handle.AttachedNode() else { return nil }
    if node.Retired || !ElementHandles.Owns(node, handle) || !canReceiveInput(node) { return nil }
    var ancestor = node.Parent
    while let current = ancestor {
      if current == owner { return node }
      ancestor = current.Parent
    }
    return nil
  }

  internal func RefreshProjection(resolver Resolver) bool {
    let target = projectionTarget()
    if target == projected { return false }
    if let old = projectedMount.Captured {
      if !old.Focused { old.FocusVisible = false }
      if !old.Retired { resolver.Invalidate(old, false) }
    }
    projected = target
    if let next = target {
      next.FocusVisible = true
      resolver.Invalidate(next, false)
    }
    return true
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
      let target = NodeMount(scopeRoot)
      SetFocus(resolver, scopeRoot)
      if let node = target.Current && focused == node { ScrollState.IntoView(node) }
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
    let target = NodeMount(order[next])
    SetFocus(resolver, order[next])
    if let node = target.Current && focused == node { ScrollState.IntoView(node) }
    return changeGeneration != before
  }

  internal func Dispose() {
    let previous = focusedMount
    if let current = focusedMount.Captured {
      BeforeBlur?.Invoke(current)
      if let node = previous.Captured {
        node.Focused = false
        node.FocusVisible = false
      }
    }
    if let current = projectedMount.Captured { current.FocusVisible = false }
    projected = nil
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
    for i in 0 ... n.Children.Count {
      if let found = findAutoFocus(n.Children[i]) {
        return found
      }
    }
    for child in ScrollbarParts.ActiveChildren(n) {
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
    for child in ScrollbarParts.ActiveChildren(n) {
      collectFocusables(child, sink)
    }
  }

  private func dispatchFocus(target Node, received bool) {
    dispatchGeneration++
    let generation = dispatchGeneration
    control.Begin(generation)
    try {
      var current = NodeMount(target)
      while true {
        guard let node = received ? current.Current : current.Captured else { break }
        let parent = NodeMount(node.Parent)
        let callback = received ? InputCallbacks.Focus(node) : InputCallbacks.Blur(node)
        if let handler = callback {
          let owner = CellOwnership.Nearest(node)
          try { handler(FocusEvent{Control: control, Generation: generation}) }
          finally { owner?.Rebuild() }
        }
        if current.Captured == nil { break }
        if control.PropagationStopped || node.FocusScopeBoundary {
          break
        }
        current = parent
      }
    } finally {
      control.Finish(generation)
    }
  }
}
