package Goo

import System

/// Hosts supported element-handle operations on the UI thread.
public partial class Window {
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
    let result = input.FocusElement(resolver, n)
    if result {
      markDirtyAndRender()
      RefreshPlatformInput()
    }
    return result
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
    if n.Kind == NodeKind.Editor {
      TextEditorLayouts.SyncScroll(n)
    }
    let targetX = n.OverflowX == Overflow.Scroll || n.Kind == NodeKind.Editor
    ? clampOffset(float32(x), maxScrollX(n)) : 0.0F
    let targetY = n.OverflowY == Overflow.Scroll || n.Kind == NodeKind.Editor
    ? clampOffset(float32(y), maxScrollY(n)) : 0.0F
    setElementScrollTarget(n, targetX, targetY)
    accessibility?.MarkDirty()
    return true
  }
  internal func JumpElementTo(n Node, x float64, y float64) bool {
    requireUiThread("ElementHandle.JumpTo")
    if n.Retired { return false }
    let scrollable = n.Kind == NodeKind.Editor
      || n.OverflowX == Overflow.Scroll || n.OverflowY == Overflow.Scroll
    if !scrollable { return false }
    setImmediateScroll(n, float32(x), float32(y))
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
    var parent = n.Parent
    while parent != nil {
      let ancestor = parent
      if ancestor.Kind == NodeKind.Editor || ancestor.OverflowX == Overflow.Scroll
        || ancestor.OverflowY == Overflow.Scroll{
          scrollSubjectIntoAncestor(subject, ancestor)
          subject = ancestor
        }
      parent = ancestor.Parent
    }
    accessibility?.MarkDirty()
    return true
  }

  private func scrollSubjectIntoAncestor(subject Node, ancestor Node) {
    if ancestor.Kind == NodeKind.Editor {
      TextEditorLayouts.SyncScroll(ancestor)
    }
    let left = TextLayouts.ContentLeft(ancestor)
    let top = TextLayouts.ContentTop(ancestor)
    let right = left + TextLayouts.ContentWidth(ancestor)
    let bottom = top + TextLayouts.ContentHeight(ancestor)
    var targetX = ancestor.ScrollX
    var targetY = ancestor.ScrollY
    if ancestor.OverflowX == Overflow.Scroll || ancestor.Kind == NodeKind.Editor {
      if subject.Rect.X < left { targetX = targetX + subject.Rect.X - left }
      else if subject.Rect.X + subject.Rect.W > right {
        targetX = targetX + subject.Rect.X + subject.Rect.W - right
      }
      targetX = clampOffset(targetX, maxScrollX(ancestor))
    }
    if ancestor.OverflowY == Overflow.Scroll || ancestor.Kind == NodeKind.Editor {
      if subject.Rect.Y < top { targetY = targetY + subject.Rect.Y - top }
      else if subject.Rect.Y + subject.Rect.H > bottom {
        targetY = targetY + subject.Rect.Y + subject.Rect.H - bottom
      }
      targetY = clampOffset(targetY, maxScrollY(ancestor))
    }
    setElementScrollTarget(ancestor, targetX, targetY)
  }

  private func setElementScrollTarget(n Node, x float32, y float32) {
    if n.Kind == NodeKind.Editor {
      if let state = n.EditorState {
        state.Controller.ScrollTo(float64(x), float64(y))
      }
      n.ScrollX = x
      n.ScrollY = y
    }
    if n.ScrollTargetX == x && n.ScrollTargetY == y {
      return
    }
    n.ScrollTargetX = x
    n.ScrollTargetY = y
    n.ScrollIdle = 0.0F
    n.ScrollBarAlpha = 1.0F
    if n.PinToBottom {
      n.UserScrolled = y < maxScrollY(n) - 0.5F
    }
    markDirtyAndRender()
  }

  private func markDirtyAndRender() {
    accessibility?.MarkDirty()
    requestRender()
  }
}
