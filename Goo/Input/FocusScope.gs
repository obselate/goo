package Goo

import System
import System.Collections.Generic
import System.Runtime.CompilerServices

/// Configures one mounted focus scope. The root must be focusable for empty-scope fallback.
public class FocusScopeOptions {
  /// Blocks input and accessibility outside the top scope while any modal registration is active.
  public prop Modal bool{ get; init; }
  /// Restores prior eligible focus on close unless focus has explicitly moved outside. Defaults to true.
  public prop RestoreFocus bool{ get; init; }
  /// Requests initial focus within the scope. Otherwise AutoFocus, the first tab stop, or the root is used.
  public prop InitialFocus ElementHandle? { get; init; }

  /// Initializes a nonmodal scope that restores focus on close.
  public init() { RestoreFocus = true }
}

/// Contains sequential keyboard focus until disposed or its root becomes unavailable.
/// Nested scopes activate in opening order; dispose on the owning window's UI thread.
public class FocusScope : IDisposable {
  private var stack FocusScopeStack?
  private let order int32

  internal init(stack FocusScopeStack, order int32) { this.stack = stack
    this.order = order }
  /// Gets this scope's opening order among overlapping scopes in this window.
  public prop Order int32{ get -> order }
  /// Reports whether the scope remains registered, including an inactive underlying layer.
  public prop IsActive bool{ get -> stack != nil }
  /// Closes this scope. Focus restoration occurs at the next stable input/tree update.
  public func Dispose() { stack?.Remove(this) }
  internal func Closed() { stack = nil }
}

internal class FocusScopeEntry {
  internal var Scope FocusScope
  internal var Root Node
  internal var Previous Node?
  internal var Initial Node?
  internal var Modal bool
  internal var Restore bool
  internal var Entered bool

  internal init(registration FocusScope, root Node, previous Node?, initial Node?, options FocusScopeOptions) {
    Scope = registration
    Root = root
    Previous = previous
    Initial = initial
    Modal = options.Modal
    Restore = options.RestoreFocus
  }
}

internal class FocusScopeStack {
  private let owner Window
  private let entries List[FocusScopeEntry]
  private var tree Node?
  private var restore Node?
  private var restoreFrom Node?
  private var restorePending bool
  private var disposed bool
  private var nextOrder int32

  internal init(owner Window) {
    this.owner = owner
    entries = List[FocusScopeEntry]()
  }

  internal prop IsEmpty bool{ get -> entries.Count == 0 && !restorePending }
  internal prop Top Node? { get -> entries.Count == 0 ? nil : entries[entries.Count - 1].Root }
  internal prop HasModal bool{ get -> modalStart() >= 0 }

  internal func Allows(target Node) bool {
    let start = modalStart()
    if start < 0 { return true }
    for i in start ... entries.Count {
      if FocusScopes.Contains(entries[i].Root, target) { return true }
    }
    return false
  }

  internal func Visible(target Node) bool {
    let start = modalStart()
    if start < 0 { return true }
    for i in start ... entries.Count {
      let active = entries[i].Root
      if FocusScopes.Contains(active, target) || FocusScopes.Contains(target, active) { return true }
    }
    return false
  }

  private func modalStart() int32 {
    for var i = entries.Count - 1; i >= 0; i-- {
      if entries[i].Modal { return i }
    }
    return -1
  }

  internal func Add(root Node, scopeRoot Node, previous Node?, options FocusScopeOptions) FocusScope {
    if disposed { throw ObjectDisposedException("FocusScopeStack") }
    if !scopeRoot.Focusable || !available(root, scopeRoot) {
      throw InvalidOperationException("A focus scope requires a visible, enabled, focusable mounted root")
    }
    for entry in entries {
      if entry.Root == scopeRoot { throw InvalidOperationException("This element already owns a focus scope") }
    }
    var initial Node?
    if let handle = options.InitialFocus {
      initial = handle.AttachedNodeFor(owner)
      if initial == nil || !FocusScopes.Contains(scopeRoot, initial) || !initial.Focusable
        || !available(root, initial) {
          throw ArgumentException("InitialFocus must be an eligible mounted element within the scope", "options")
        }
    }
    if nextOrder == Int32.MaxValue { throw InvalidOperationException("Focus scope order exhausted") }
    nextOrder++
    let registration = FocusScope(this, nextOrder)
    entries.Add(FocusScopeEntry(registration, scopeRoot, previous, initial, options))
    scopeRoot.FocusScopeBoundary = true
    bind(root)
    owner.FocusScopeChanged()
    return registration
  }

  internal func Remove(registration FocusScope) {
    owner.RequireElementHandleThread("FocusScope.Dispose")
    for i in 0 ... entries.Count {
      if entries[i].Scope == registration {
        removeAt(i)
        owner.FocusScopeChanged()
        return
      }
    }
  }

  private func removeAt(index int32) {
    let entry = entries[index]
    let wasTop = index == entries.Count - 1
    for i in index + 1 ... entries.Count {
      if let previous = entries[i].Previous {
        if FocusScopes.Contains(entry.Root, previous) { entries[i].Previous = entry.Previous }
      }
    }
    entries.RemoveAt(index)
    entry.Root.FocusScopeBoundary = false
    entry.Scope.Closed()
    if wasTop {
      restore = entry.Restore ? entry.Previous : nil
      restoreFrom = entry.Root
      restorePending = true
    }
    if entries.Count == 0 { bind(nil) }
  }

  internal func Refresh(root Node?, resolver Resolver, focus FocusManager) {
    for var i = entries.Count - 1; i >= 0; i-- {
      if root == nil || !entries[i].Root.Focusable || !available(root, entries[i].Root) {
        removeAt(i)
        owner.FocusScopeChanged()
      }
    }
    bind(entries.Count == 0 ? nil : root)
    if !focus.NativeFocusAllowed || owner.IsInputBlocked { return }
    if restorePending {
      let target = restore
      let previousRoot = restoreFrom
      let focused = focus.FocusedNode()
      let movedOutside = root != nil && focused != nil && focused.Focusable
        && available(root, focused) && canReceiveInput(focused)
        && previousRoot != nil && !FocusScopes.Contains(previousRoot, focused)
      restore = nil
      restoreFrom = nil
      restorePending = false
      if !movedOutside && root != nil && target != nil && target.Focusable
        && available(root, target) && canReceiveInput(target) {
          focus.SetFocus(resolver, target)
        }
    }
    if entries.Count == 0 { return }
    let active = entries[entries.Count - 1]
    let focused = focus.FocusedNode()
    if !active.Entered || focused == nil || !FocusScopes.Contains(active.Root, focused)
      || !canReceiveInput(focused) {
        let initial = !active.Entered ? active.Initial : nil
        active.Entered = true
        let target = initial != nil && available(active.Root, initial) && initial.Focusable
        ? initial : focus.FirstScopeFocus(active.Root)
        focus.SetFocus(resolver, target)
      }
  }

  internal func Dispose() {
    disposed = true
    for entry in entries {
      entry.Root.FocusScopeBoundary = false
      entry.Scope.Closed()
    }
    entries.Clear()
    restore = nil
    restoreFrom = nil
    restorePending = false
    bind(nil)
  }

  private func bind(root Node?) {
    if tree == root { return }
    if let old = tree { FocusScopes.Unbind(old) }
    tree = root
    if let current = root { FocusScopes.Bind(current, this) }
  }

  private func available(root Node, target Node) bool {
    var current Node? = target
    while current != nil {
      let n = current
      if n.Retired || n.PaintInputHidden || n.Disabled { return false }
      if n == root { return true }
      current = n.Parent
    }
    return false
  }
}

internal class FocusScopes {
  shared {
    private let stacks ConditionalWeakTable[Node, FocusScopeStack] = ConditionalWeakTable[Node, FocusScopeStack]()

    internal func Bind(root Node, stack FocusScopeStack) {
      stacks.Add(root, stack)
      root.HasFocusScopes = true
    }

    internal func Unbind(root Node) {
      root.HasFocusScopes = false
      stacks.Remove(root)
    }

    internal func TraversalRoot(root Node) Node {
      if root.HasFocusScopes && stacks.TryGetValue(root, out var stack) { return stack.Top ?? root }
      return root
    }

    internal func ModalRoot(root Node) Node? {
      if root.HasFocusScopes && stacks.TryGetValue(root, out var stack) && stack.HasModal { return stack.Top }
      return nil
    }

    internal func Contains(root Node, target Node) bool {
      var current Node? = target
      while current != nil {
        if current == root { return true }
        current = current.Parent
      }
      return false
    }

    internal func ModalStack(root Node) FocusScopeStack? {
      if root.HasFocusScopes && stacks.TryGetValue(root, out var stack) && stack.HasModal { return stack }
      return nil
    }

    internal func Allows(root Node, target Node) bool {
      if root.HasFocusScopes && stacks.TryGetValue(root, out var stack) { return stack.Allows(target) }
      return true
    }
  }
}
