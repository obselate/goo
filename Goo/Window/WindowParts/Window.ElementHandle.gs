package Goo

import System

/// Hosts supported element-handle operations on the UI thread.
public partial class Window {
  internal func SyncControlledEntry(n Node, value string) bool -> input.SyncControlledEntry(n, value)

  internal func RequireElementHandleThread(operation string) {
    requireUiThread(operation)
  }

  internal func WakeMetricSubscribers() {
    host?.Wake()
  }

  internal func CurrentWindowMetrics() WindowMetrics {
    if let reported = MetricSubscriptions.ReportedWindowMetrics(this) {
      return reported
    }
    var logicalWidth = Width
    var logicalHeight = Height
    var nativeWidth = framebufferWidth
    var nativeHeight = framebufferHeight
    if let native = host {
      logicalWidth = native.LogicalWidth
      logicalHeight = native.LogicalHeight
      nativeWidth = native.FramebufferWidth
      nativeHeight = native.FramebufferHeight
    }
    let scaleX = logicalWidth > 0 && nativeWidth > 0
    ? float64(nativeWidth) / float64(logicalWidth) : 0.0
    let scaleY = logicalHeight > 0 && nativeHeight > 0
    ? float64(nativeHeight) / float64(logicalHeight) : 0.0
    return WindowMetrics{
      LogicalWidth: logicalWidth,
      LogicalHeight: logicalHeight,
      FramebufferWidth: nativeWidth,
      FramebufferHeight: nativeHeight,
      DisplayScaleX: scaleX,
      DisplayScaleY: scaleY,
    }
  }

  internal func FocusElement(n Node) bool {
    requireUiThread("ElementHandle.Focus")
    if IsInputBlocked { return false }
    let result = input.FocusElement(resolver, n)
    if result {
      markDirtyAndRender()
      RefreshPlatformInput()
    }
    return result
  }

  internal func ActivateElement(n Node) bool {
    requireUiThread("ElementHandle.Activate")
    if IsInputBlocked || n.Kind != NodeKind.Button { return false }
    let result = hitActivate(node, n)
    if result { markDirtyAndRender() }
    return result
  }

  internal func BeginElementPress(n Node) bool {
    requireUiThread("ElementHandle.BeginPress")
    if IsInputBlocked { return false }
    let result = input.BeginPress(resolver, n)
    if result { markDirtyAndRender() }
    return result
  }

  internal func EndElementPress(n Node, activate bool) bool {
    requireUiThread("ElementHandle.EndPress")
    let result = input.EndPress(node, resolver, n, activate && !IsInputBlocked)
    if result { markDirtyAndRender() }
    return result
  }

  internal func BeginFocusScope(n Node, options FocusScopeOptions) FocusScope {
    requireUiThread("ElementHandle.BeginFocusScope")
    guard let tree = node else {
      throw InvalidOperationException("The window has no mounted tree")
    }
    return input.BeginFocusScope(this, tree, n, options)
  }

  internal func FocusScopeChanged() {
    pendingReconcileEffects = combineEffects(
      pendingReconcileEffects,
      ReconcileEffects.Input | ReconcileEffects.Accessibility)
    markDirtyAndRender()
  }

  internal func BlurElement(n Node) bool {
    requireUiThread("ElementHandle.Blur")
    let result = input.BlurElement(resolver, n)
    if result {
      markDirtyAndRender()
      RefreshPlatformInput()
    }
    return result
  }

  internal func SetTextInputArea(n Node, area ElementRect) bool {
    requireUiThread("ElementHandle.SetTextInputArea")
    if !IsOpen || n.Retired || input.FocusedNode() != n
      || n.Kind == NodeKind.Entry || n.Kind == NodeKind.Editor
      || !TextInputCallbacks.HasNodeCallbacks(n) {
        return false
      }
    guard let native = host else { return false }
    let left = Math.Floor(area.X)
    let top = Math.Floor(area.Y)
    let right = Math.Ceiling(area.X + area.Width)
    let bottom = Math.Ceiling(area.Y + area.Height)
    let width = right > left ? int32(right - left) : 1
    let height = bottom > top ? int32(bottom - top) : 1
    return native.SetImeArea(int32(left), int32(top), width, height, 0)
  }

  internal func ScrollElementTo(n Node, x float64, y float64) bool {
    requireUiThread("ElementHandle.ScrollTo")
    if n.Retired { return false }
    let scrollable = n.Kind == NodeKind.Editor
      || n.OverflowX == Overflow.Scroll || n.OverflowY == Overflow.Scroll
    if !scrollable { return false }
    setElementScrollTarget(n, float32(x), float32(y))
    accessibility?.MarkDirty()
    return true
  }
  internal func JumpElementTo(n Node, x float64, y float64) bool {
    requireUiThread("ElementHandle.JumpTo")
    if n.Retired { return false }
    let scrollable = n.Kind == NodeKind.Editor
      || n.OverflowX == Overflow.Scroll || n.OverflowY == Overflow.Scroll
    if !scrollable { return false }
    ScrollState.To(n, float32(x), float32(y), true)
    pendingReconcileEffects = combineEffects(pendingReconcileEffects,
      ReconcileEffects.Paint | ReconcileEffects.Input | ReconcileEffects.Rect
      | ReconcileEffects.Accessibility)
    accessibility?.MarkDirty()
    markDirtyAndRender()
    return true
  }

  internal func ScrollElementIntoView(n Node) bool {
    requireUiThread("ElementHandle.ScrollIntoView")
    if n.Retired { return false }
    var subject = n
    var parent = n.IsPortal ? nil : n.Parent
    while parent != nil {
      let ancestor = parent
      if ancestor.Kind == NodeKind.Editor || ancestor.OverflowX == Overflow.Scroll
        || ancestor.OverflowY == Overflow.Scroll{
          scrollSubjectIntoAncestor(subject, ancestor)
          subject = ancestor
      }
      parent = ancestor.IsPortal ? nil : ancestor.Parent
    }
    accessibility?.MarkDirty()
    return true
  }

  private func scrollSubjectIntoAncestor(subject Node, ancestor Node) {
    if ancestor.Kind == NodeKind.Editor {
      ScrollState.SyncEditor(ancestor)
    }
    let left = BoxGeometry.ContentLeft(ancestor)
    let top = BoxGeometry.ContentTop(ancestor)
    let right = left + BoxGeometry.ContentWidth(ancestor)
    let bottom = top + BoxGeometry.ContentHeight(ancestor)
    var targetX = ancestor.ScrollX
    var targetY = ancestor.ScrollY
    if ancestor.OverflowX == Overflow.Scroll || ancestor.Kind == NodeKind.Editor {
      if subject.Rect.X < left { targetX = targetX + subject.Rect.X - left }
      else if subject.Rect.X + subject.Rect.W > right {
        targetX = targetX + subject.Rect.X + subject.Rect.W - right
      }
    }
    if ancestor.OverflowY == Overflow.Scroll || ancestor.Kind == NodeKind.Editor {
      if subject.Rect.Y < top { targetY = targetY + subject.Rect.Y - top }
      else if subject.Rect.Y + subject.Rect.H > bottom {
        targetY = targetY + subject.Rect.Y + subject.Rect.H - bottom
      }
    }
    setElementScrollTarget(ancestor, targetX, targetY)
  }

  private func setElementScrollTarget(n Node, x float32, y float32) {
    if ScrollState.To(n, x, y) {
      markDirtyAndRender()
    }
  }

  private func markDirtyAndRender() {
    accessibility?.MarkDirty()
    requestRender()
  }
}
