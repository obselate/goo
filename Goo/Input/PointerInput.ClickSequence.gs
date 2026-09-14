package Goo

import System
import System.Collections.Generic

internal partial class PointerInput {
  private func clickSequenceTarget(route List[Node]) Node? {
    for var i = route.Count; i > 0; i-- {
      let n = route[i - 1]
      if n.Focusable || n.OnClick != nil || n.OnPointerDown != nil || n.OnPointerUp != nil { return n }
    }
    return route.Count == 0 ? nil : route[route.Count - 1]
  }

  private func beginClickSequence(route List[Node], timeS float64, x float32, y float32, button PointerButton) {
    let target = clickSequenceTarget(route)
    let elapsed = timeS - current.LastPressT
    let repeated = target != nil && target == current.LastPressNode && button == current.LastPressButton
      && elapsed >= 0.0 && elapsed < 0.4
      && MathF.Abs(x - current.LastPressX) < 4.0F && MathF.Abs(y - current.LastPressY) < 4.0F
    current.LastPressCount = repeated ? Math.Min(3, current.LastPressCount + 1) : 1
    current.LastPressNode = target
    current.LastPressButton = button
    current.LastPressT = timeS
    current.LastPressX = x
    current.LastPressY = y
  }

  private func invalidateMovedClickSequence(x float32, y float32) {
    if MathF.Abs(x - current.LastPressX) >= 4.0F || MathF.Abs(y - current.LastPressY) >= 4.0F {
      current.LastPressNode = nil
    }
  }

  private func resetClickSequence() {
    current.LastPressT = -10.0
    current.LastPressNode = nil
    current.LastPressButton = PointerButton.None
    current.LastPressCount = 0
  }
}
