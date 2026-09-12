package Goo

internal class PointerTouchPanState {
  internal var Target Node
  internal var StartX float32
  internal var StartY float32
  internal var LastX float32
  internal var LastY float32
  internal var Active bool
}

internal partial class PointerInput {
  private func beginTouchPan(x float32, y float32) {
    current.TouchPan = nil
    if current.Device != PointerDevice.Touch || !isSemanticPrimary()
      || current.CaptureTarget != nil || current.DragEntry != nil || current.DragEditor != nil { return }
    for i in current.PressChain.Count ... 0 {
      let n = current.PressChain[i - 1]
      if (n.OverflowX == Overflow.Scroll && maxScrollX(n) > 0.0F)
        || (n.OverflowY == Overflow.Scroll && maxScrollY(n) > 0.0F) {
          current.TouchPan = PointerTouchPanState{
            Target: n, StartX: x, StartY: y, LastX: x, LastY: y,
          }
          return
        }
    }
  }

  private func clearTouchPan() { current.TouchPan = nil }

  private func touchPanActive() bool -> current.TouchPan?.Active == true

  private func updateTouchPan(root Node?, resolver Resolver, x float32, y float32,
    prevented bool) bool{
      guard let state = current.TouchPan, let tree = root else { return false }
      if prevented || current.CaptureTarget != nil || activeDragMatches() || current.DragEntry != nil
        || current.DragEditor != nil || !nodeVisibleInTree(tree, state.Target, false)
        || !canReceiveInput(state.Target) {
          clearTouchPan()
          return false
        }
      if !state.Active {
        let dx = x - state.StartX
        let dy = y - state.StartY
        if dx * dx + dy * dy < 64.0F { return false }
        state.Active = true
        try {
          dispatchCancel()
        } finally {
          clearPressChain(resolver)
          current.ClickTarget = nil
          clearDragCandidate()
          clearActiveRoute()
        }
      }
      var remainingX = state.LastX - x
      var remainingY = state.LastY - y
      state.LastX = x
      state.LastY = y
      var target Node? = state.Target
      while let n = target {
        var moved bool
        if n.OverflowX == Overflow.Scroll && remainingX != 0.0F {
          let previous = n.ScrollTargetX
          let next = clampOffset(previous + remainingX, maxScrollX(n))
          n.ScrollTargetX = next
          remainingX = remainingX - (next - previous)
          moved = next != previous
        }
        if n.OverflowY == Overflow.Scroll && remainingY != 0.0F {
          let previous = n.ScrollTargetY
          let next = clampOffset(previous + remainingY, maxScrollY(n))
          n.ScrollTargetY = next
          remainingY = remainingY - (next - previous)
          moved = moved || next != previous
          if n.PinToBottom { n.UserScrolled = next < maxScrollY(n) - 0.5F }
        }
        if moved { markScrolled(n) }
        target = n.Parent
      }
      return true
    }
}
