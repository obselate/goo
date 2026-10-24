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
      return WindowMetrics{...reported, UiScale: UiScale}
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
    let metrics = ResolveWindowMetrics(logicalWidth, logicalHeight, nativeWidth, nativeHeight,
      host?.DisplayScale ?? 0.0F)
    return WindowMetrics{...metrics, UiScale: UiScale}
  }

  internal func FocusElement(n Node) bool {
    requireUiThread("ElementHandle.Focus")
    FlushDeferredVirtualization()
    if IsInputBlocked { return false }
    let result = input.FocusElement(resolver, n)
    if result {
      markDirtyAndRender()
      RefreshPlatformInput()
    }
    return result
  }

  internal func CancelElementGestures(n Node) bool {
    requireUiThread("ElementHandle.CancelGestures")
    let result = input.CancelGestures(node, resolver, n)
    if result { markDirtyAndRender() }
    return result
  }

  internal func ActivateElement(n Node) bool {
    requireUiThread("ElementHandle.Activate")
    FlushDeferredVirtualization()
    if IsInputBlocked || n.Kind != NodeKind.Button { return false }
    let result = hitActivate(node, n)
    if result { markDirtyAndRender() }
    return result
  }

  internal func BeginElementPress(n Node) bool {
    requireUiThread("ElementHandle.BeginPress")
    FlushDeferredVirtualization()
    if IsInputBlocked { return false }
    let result = input.BeginPress(resolver, n)
    if result { markDirtyAndRender() }
    return result
  }

  internal func EndElementPress(n Node, activate bool) bool {
    requireUiThread("ElementHandle.EndPress")
    FlushDeferredVirtualization()
    let result = input.EndPress(node, resolver, n, activate && !IsInputBlocked)
    if result { markDirtyAndRender() }
    return result
  }

  internal func BeginFocusScope(n Node, options FocusScopeOptions) FocusScope {
    requireUiThread("ElementHandle.BeginFocusScope")
    FlushDeferredVirtualization()
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
    FlushDeferredVirtualization()
    let result = input.BlurElement(resolver, n)
    if result {
      markDirtyAndRender()
      RefreshPlatformInput()
    }
    return result
  }

  internal func SetTextInputArea(n Node, area ElementRect) bool {
    requireUiThread("ElementHandle.SetTextInputArea")
    FlushDeferredVirtualization()
    if !IsOpen || n.Retired || input.FocusedNode() != n
      || n.Kind == NodeKind.Entry || n.Kind == NodeKind.Editor
      || !TextInputCallbacks.HasNodeCallbacks(n) {
        return false
      }
    guard let native = host else { return false }
    let left = Math.Floor(area.X * float64(UiScale))
    let top = Math.Floor(area.Y * float64(UiScale))
    let right = Math.Ceiling((area.X + area.Width) * float64(UiScale))
    let bottom = Math.Ceiling((area.Y + area.Height) * float64(UiScale))
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
    FlushDeferredVirtualization()
    if n.Retired { return false }
    ScrollState.IntoView(n)
    markDirtyAndRender()
    return true
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
