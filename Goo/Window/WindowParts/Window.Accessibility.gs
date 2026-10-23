package Goo

import System

/// Hosts platform-neutral accessibility semantics for a Goo window.
public partial class Window {
  internal func CaptureDiagnosticsAccessibility(root Node?) AccessibilityManager {
    if let manager = accessibility {
      manager.CaptureForDiagnostics(root)
      return manager
    }
    let manager = AccessibilityManager(this)
    accessibility = manager
    manager.CaptureForDiagnostics(root)
    return manager
  }

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

  /// Finds the published semantic node at a point in window logical coordinates.
  /// @param x The finite horizontal window logical coordinate.
  /// @param y The finite vertical window logical coordinate.
  /// @returns The topmost semantic identity, or nil outside visible semantic content.
  public func AccessibilityHitTest(x float64, y float64) AccessibilityId? {
    requireUiThread("Window.AccessibilityHitTest")
    if !Double.IsFinite(x) || Math.Abs(x) > float64(Single.MaxValue) {
      throw ArgumentOutOfRangeException("x")
    }
    if !Double.IsFinite(y) || Math.Abs(y) > float64(Single.MaxValue) {
      throw ArgumentOutOfRangeException("y")
    }
    if IsInputBlocked || x < 0.0 || y < 0.0 || x >= float64(Width) / float64(UiScale)
      || y >= float64(Height) / float64(UiScale) { return nil }
    guard let root = node, let manager = accessibility else { return nil }
    guard let hit = hitTopmost(root, float32(x), float32(y), manager) else { return nil }
    return manager.DiagnosticNodeFor(hit)?.Id
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
    if request.Action != AccessibilityAction.ScrollIntoView && !canReceiveInput(target) {
      return false
    }
    var result bool
    if let handled = manager.InvokeDeclared(target, request) {
      result = handled
    } else {
      result = switch request.Action {
        case AccessibilityAction.Focus: FocusElement(target)
        case AccessibilityAction.Blur: BlurElement(target)
        case AccessibilityAction.ScrollIntoView: ScrollElementIntoView(target)
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
