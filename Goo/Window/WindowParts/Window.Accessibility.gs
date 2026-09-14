package Goo

import System

/// Hosts platform-neutral accessibility semantics for a Goo window.
public partial class Window {
  /// Gets or sets the adapter that receives this window's retained semantic tree.
  public prop AccessibilityAdapter AccessibilityAdapter? {
    get {
      requireUiThread("Window.AccessibilityAdapter")
      return accessibility?.Adapter
    }
    set(v) {
      requireUiThread("Window.AccessibilityAdapter")
      if accessibility?.Adapter == v { return }
      if let next = v as NativeAccessibilityAdapter? {
        if IsOpen { throw InvalidOperationException("Assign native accessibility before Window.Open") }
        next.CheckOwner(this)
      }
      if let previous = accessibility?.Adapter as NativeAccessibilityAdapter? { previous.Detach() }
      if let next = v as NativeAccessibilityAdapter? { next.SetOwner(this) }
      if accessibility == nil { accessibility = AccessibilityManager(this) }
      accessibility!!.SetAdapter(v)
      requestRender()
    }
  }

  /// Gets the most recent adapter exception. Failed delivery retries on the next UI-thread update.
  public prop LastAccessibilityError Exception? {
    get {
      requireUiThread("Window.LastAccessibilityError")
      return accessibility?.LastError
    }
  }

  /// Routes one platform-neutral accessibility action to a mounted semantic node.
  /// @param id The retained semantic node identity.
  /// @param request The requested supported operation.
  /// @returns False when the node is unavailable or the action is unsupported.
  public func PerformAccessibilityAction(id AccessibilityId, request AccessibilityActionRequest) bool {
    requireUiThread("Window.PerformAccessibilityAction")
    if request == nil { throw ArgumentNullException("request") }
    if IsInputBlocked { return false }
    guard let manager = accessibility else { return false }
    if !manager.Supports(id, request.Action) { return false }
    guard let target = manager.NodeFor(id) else { return false }
    var result bool
    if let handled = manager.InvokeDeclared(target, request) {
      result = handled
    } else {
      result = switch request.Action {
        case AccessibilityAction.Focus: FocusElement(target)
        case AccessibilityAction.Activate: hitActivate(node, target)
        case AccessibilityAction.SetValue: input.AccessibilitySetValue(node, resolver, target, request.Value)
        case AccessibilityAction.SetSelection: input.AccessibilitySetSelection(resolver, target,
          request.SelectionStart, request.SelectionLength, request.SelectionCaret)
        case AccessibilityAction.Scroll: ScrollElementTo(target, request.ScrollX, request.ScrollY)
        case AccessibilityAction.Increment: false
        case AccessibilityAction.Decrement: false
        case AccessibilityAction.Select: false
        case AccessibilityAction.Deselect: false
        case AccessibilityAction.Expand: false
        case AccessibilityAction.Collapse: false
      }
    }
    if result {
      manager.MarkDirty()
      requestRender()
    }
    return result
  }
}
