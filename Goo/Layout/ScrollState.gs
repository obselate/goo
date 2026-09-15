package Goo

import System

internal class ScrollState {
  shared {
    internal func To(n Node, x float32, y float32, immediate bool = false, activity bool = true) bool {
      SyncEditor(n)
      return setTarget(n, x, y, immediate, activity)
    }

    internal func By(n Node, dx float32, dy float32) Point {
      SyncEditor(n)
      let previousX = n.ScrollTargetX
      let previousY = n.ScrollTargetY
      setTarget(n, previousX + dx, previousY + dy, false, true, dy != 0.0F)
      return Point{X: float64(n.ScrollTargetX - previousX), Y: float64(n.ScrollTargetY - previousY)}
    }

    private func setTarget(n Node, x float32, y float32, immediate bool, activity bool, trackPin bool = true) bool {
      let nextX = clampOffset(x, maxScrollX(n))
      let nextY = clampOffset(y, maxScrollY(n))
      let jump = immediate || n.Kind == NodeKind.Editor
      let changed = n.ScrollTargetX != nextX || n.ScrollTargetY != nextY
        || (jump && (n.ScrollX != nextX || n.ScrollY != nextY))
      n.ScrollTargetX = nextX
      n.ScrollTargetY = nextY
      if jump {
        n.ScrollX = nextX
        n.ScrollY = nextY
      }
      if activity && (changed || immediate) {
        Touch(n)
        if trackPin && n.PinToBottom {
          n.UserScrolled = nextY < maxScrollY(n) - 0.5F
        }
      }
      if let controller = n.EditorController {
        controller.ScrollTo(float64(nextX), float64(nextY))
      }
      return changed
    }

    internal func SyncEditor(n Node) {
      guard let controller = n.EditorController else {
        return
      }
      let extent = TextEditorLayouts.ScrollExtent(n)
      n.ContentW = float32(extent.X)
      n.ContentH = float32(extent.Y)
      setTarget(n, float32(controller.ScrollTargetX), float32(controller.ScrollTargetY), true, false)
    }

    internal func RefreshAxes(n Node) {
      if n.Kind == NodeKind.Editor {
        return
      }
      if n.OverflowX != Overflow.Scroll {
        n.ScrollX = 0.0F
        n.ScrollTargetX = 0.0F
      }
      if n.OverflowY != Overflow.Scroll {
        n.ScrollY = 0.0F
        n.ScrollTargetY = 0.0F
        n.UserScrolled = false
      }
      if n.OverflowX != Overflow.Scroll && n.OverflowY != Overflow.Scroll {
        n.ScrollBarAlpha = 0.0F
      }
    }

    internal func SetExtent(n Node, width float32, height float32) {
      let grewY = height > n.ContentH
      n.ContentW = width
      n.ContentH = height
      if n.OverflowY == Overflow.Scroll && n.PinToBottom && !n.UserScrolled {
        n.ScrollTargetY = maxScrollY(n)
        if grewY {
          n.ScrollY = n.ScrollTargetY
        }
      }
      n.ScrollTargetX = clampOffset(n.ScrollTargetX, maxScrollX(n))
      n.ScrollTargetY = clampOffset(n.ScrollTargetY, maxScrollY(n))
      n.ScrollX = clampOffset(n.ScrollX, maxScrollX(n))
      n.ScrollY = clampOffset(n.ScrollY, maxScrollY(n))
    }

    internal func Touch(n Node) {
      n.ScrollIdle = 0.0F
      n.ScrollBarAlpha = 1.0F
    }

    internal func ResetActivity(n Node) {
      n.ScrollIdle = 0.0F
      n.ScrollBarAlpha = 0.0F
    }

    internal func Step(n Node, k float32) bool {
      let x = approach(n.ScrollX, n.ScrollTargetX, k)
      let y = approach(n.ScrollY, n.ScrollTargetY, k)
      let changed = x != n.ScrollX || y != n.ScrollY
      n.ScrollX = x
      n.ScrollY = y
      return changed
    }

    internal func Fade(n Node, dt float32) bool {
      if n.ScrollbarVisibility != ScrollbarVisibility.Auto {
        return false
      }
      if n.ScrollBarAlpha > 0.0F {
        n.ScrollIdle = n.ScrollIdle + dt
      }
      if n.ScrollIdle <= 1.0F || n.ScrollBarAlpha <= 0.0F {
        return false
      }
      let next = MathF.Max(0.0F, n.ScrollBarAlpha - dt * 4.0F)
      if next == n.ScrollBarAlpha {
        return false
      }
      n.ScrollBarAlpha = next
      return true
    }

    private func approach(value float32, target float32, k float32) float32 {
      if value == target {
        return value
      }
      let next = value + (target - value) * k
      return MathF.Abs(target - next) < 0.5F ? target : next
    }
  }
}
