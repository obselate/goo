package Goo

import System
import System.Collections.Generic
import System.Runtime.CompilerServices

/// Configures one mounted focus scope. The root must be focusable for empty-scope fallback.
public class FocusScopeOptions {
  private var frozenOwner Type?
  private var declarationModal bool
  private var declarationRestoreFocus bool
  private var declarationInitialFocus ElementHandle?

  internal func Freeze(owner Type) { frozenOwner ??= owner }

  private func CheckMutable() {
    if let owner = frozenOwner {
      throw InvalidOperationException(owner.Name + " modified after it was returned to Goo")
    }
  }
  /// Blocks input and accessibility outside the top scope while any modal registration is active.
  public prop Modal bool {
    get -> declarationModal
    set {
      CheckMutable()
      declarationModal = value
    }
  }
  /// Restores prior eligible focus on close unless focus has explicitly moved outside. Defaults to true.
  public prop RestoreFocus bool {
    get -> declarationRestoreFocus
    set {
      CheckMutable()
      declarationRestoreFocus = value
    }
  }
  /// Requests initial focus within the scope. Otherwise AutoFocus, the first tab stop, or the root is used.
  public prop InitialFocus ElementHandle? {
    get -> declarationInitialFocus
    set {
      CheckMutable()
      declarationInitialFocus = value
    }
  }

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
  /// Closes this scope, optionally suppressing its configured focus restoration.
  /// Restoration occurs at the next stable input/tree update.
  public func Dispose(restoreFocus bool) { stack?.Remove(this, restoreFocus) }
  internal func Closed() { stack = nil }
  internal func Update(options FocusScopeOptions) { stack?.Update(this, options) }
}

internal class FocusScopeEntry {
  internal var Scope FocusScope
  internal let RootMount NodeMount
  private var previousMount NodeMount
  private let initialMount NodeMount
  internal prop Root Node? { get -> RootMount.Current }
  internal prop Previous Node? {
    get -> previousMount.Current
    set -> previousMount = NodeMount(value)
  }
  internal prop Initial Node? { get -> initialMount.Current }
  internal var Modal bool
  internal var Restore bool
  internal var Entered bool

  internal init(registration FocusScope, root Node, previous Node?, initial Node?, options FocusScopeOptions) {
    Scope = registration
    RootMount = NodeMount(root)
    previousMount = NodeMount(previous)
    initialMount = NodeMount(initial)
    Modal = options.Modal
    Restore = options.RestoreFocus
  }
}

internal class FocusScopeStack {
  private let owner Window
  private let entries List[FocusScopeEntry]
  private var treeMount NodeMount
  private var restoreMount NodeMount
  private var restoreFromMount NodeMount
  private prop restore Node? {
    get -> restoreMount.Current
    set -> restoreMount = NodeMount(value)
  }
  private prop restoreFrom Node? {
    get -> restoreFromMount.Captured
    set -> restoreFromMount = NodeMount(value)
  }
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
  internal func IsBound(root Node) bool -> treeMount.Current == root

  internal func RetainsInteraction(root Node) bool {
    if FocusScopes.Contains(root, restore) || FocusScopes.Contains(root, restoreFromMount.Current) { return true }
    for entry in entries {
      if FocusScopes.Contains(root, entry.Root) || FocusScopes.Contains(root, entry.Initial)
        || FocusScopes.Contains(root, entry.Previous) { return true }
    }
    return false
  }

  internal func Allows(target Node) bool {
    let start = modalStart()
    if start < 0 { return true }
    for i in start ... entries.Count {
      if let root = entries[i].Root && FocusScopes.Contains(root, target) { return true }
    }
    return false
  }

  internal func Visible(target Node) bool {
    let start = modalStart()
    if start < 0 { return true }
    for i in start ... entries.Count {
      guard let active = entries[i].Root else { continue }
      if FocusScopes.Contains(active, target) || FocusScopes.Contains(target, active) { return true }
    }
    return false
  }

  private func modalStart() int32 {
    for var i = entries.Count - 1; i >= 0; i-- {
      if entries[i].Root != nil && entries[i].Modal { return i }
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

  internal func Update(registration FocusScope, options FocusScopeOptions) {
    for entry in entries {
      if entry.Scope != registration { continue }
      if entry.Modal == options.Modal && entry.Restore == options.RestoreFocus { return }
      entry.Modal = options.Modal
      entry.Restore = options.RestoreFocus
      owner.FocusScopeChanged()
      return
    }
  }

  internal func Remove(registration FocusScope, restoreFocus bool = true) {
    owner.RequireElementHandleThread("FocusScope.Dispose")
    for i in 0 ... entries.Count {
      if entries[i].Scope == registration {
        entries[i].Restore = entries[i].Restore && restoreFocus
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
        if let root = entry.RootMount.Captured && FocusScopes.Contains(root, previous) { entries[i].Previous = entry.Restore ? entry.Previous : nil }
      }
    }
    entries.RemoveAt(index)
    if let root = entry.RootMount.Captured { root.FocusScopeBoundary = false }
    entry.Scope.Closed()
    if wasTop {
      restore = entry.Restore ? entry.Previous : nil
      restoreFromMount = entry.RootMount
      restorePending = true
    }
    if entries.Count == 0 { bind(nil) }
  }

  internal func Refresh(root Node?, resolver Resolver, focus FocusManager) {
    for var i = entries.Count - 1; i >= 0; i-- {
      let scopeRoot = entries[i].Root
      if scopeRoot == nil || root == nil || !scopeRoot.Focusable || !available(root, scopeRoot, true) {
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
    guard let activeRoot = active.Root else { return }
    let focused = focus.FocusedNode()
    if !active.Entered || focused == nil || !FocusScopes.Contains(activeRoot, focused)
      || !canReceiveInput(focused) {
        let initial = !active.Entered ? active.Initial : nil
        active.Entered = true
        let target = initial != nil && available(activeRoot, initial) && initial.Focusable
        ? initial : focus.FirstScopeFocus(activeRoot)
        focus.SetFocus(resolver, target)
      }
  }

  internal func Dispose() {
    disposed = true
    for entry in entries {
      if let root = entry.RootMount.Captured { root.FocusScopeBoundary = false }
      entry.Scope.Closed()
    }
    entries.Clear()
    restore = nil
    restoreFrom = nil
    restorePending = false
    bind(nil)
  }

  private func bind(root Node?) {
    if treeMount.Captured == root { return }
    if let old = treeMount.Captured { FocusScopes.Unbind(old) }
    treeMount = NodeMount(root)
    if let current = root { FocusScopes.Bind(current, this) }
  }

  private func available(root Node, target Node, preserveClipped bool = false) bool {
    var current Node? = target
    while current != nil {
      let n = current
      if n.Retired || n.Disabled || n.PaintInputState != 0 || n.PortalPlacementHidden
        || n.PortalAnchorClipped && !preserveClipped { return false }
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
      stacks.Remove(root)
      stacks.Add(root, stack)
      root.HasFocusScopes = true
    }

    internal func Unbind(root Node) {
      root.HasFocusScopes = false
      stacks.Remove(root)
    }

    internal func TraversalRoot(root Node) Node -> if root.HasFocusScopes && stacks.TryGetValue(root, out var stack) && stack.IsBound(root) { stack.Top ?? root } else { root }

    internal func ModalRoot(root Node) Node? -> if root.HasFocusScopes && stacks.TryGetValue(root, out var stack) && stack.IsBound(root) && stack.HasModal { stack.Top } else { nil }

    internal func Contains(root Node, target Node?) bool {
      var current Node? = target
      while current != nil {
        if current == root { return true }
        current = current.Parent
      }
      return false
    }

    internal func ModalStack(root Node) FocusScopeStack? -> if root.HasFocusScopes && stacks.TryGetValue(root, out var stack) && stack.IsBound(root) && stack.HasModal { stack } else { nil }

    internal func Allows(root Node, target Node) bool -> if root.HasFocusScopes && stacks.TryGetValue(root, out var stack) && stack.IsBound(root) { stack.Allows(target) } else { true }
  }
}
