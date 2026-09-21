package Goo

import System
import System.Diagnostics
import System.Runtime.CompilerServices

internal class ScrollAxisActivity {
  internal var Alpha float32
  internal var Idle float32
  internal var Hovered bool
  internal var Captured bool
  internal var HideDeadlineTicks float64
  internal var Descriptor Scrollbar?
  internal var Visibility ScrollbarVisibility
}

internal class ScrollNodeActivity {
  internal let Horizontal ScrollAxisActivity = ScrollAxisActivity{}
  internal let Vertical ScrollAxisActivity = ScrollAxisActivity{}
}

internal class ScrollActivityStates {
  shared {
    private let values ConditionalWeakTable[Node, ScrollNodeActivity] =
    ConditionalWeakTable[Node, ScrollNodeActivity]()

    internal func For(n Node) ScrollNodeActivity -> values.GetOrCreateValue(n)

    internal func TryGet(n Node) ScrollNodeActivity? ->
    if values.TryGetValue(n, out var state) { state } else { nil }
  }
}

internal class ScrollState {
  shared {
    private func axis(n Node, vertical bool) ScrollAxisActivity {
      let state = ScrollActivityStates.For(n)
      return vertical ? state.Vertical : state.Horizontal
    }

    private func scheduleHide(state ScrollAxisActivity, descriptor Scrollbar) {
      state.HideDeadlineTicks = float64(Stopwatch.GetTimestamp())
        + descriptor.HideDelayMs * float64(Stopwatch.Frequency) * 0.001
    }

    private func descriptor(n Node, vertical bool) Scrollbar? ->
    vertical ? n.ScrollbarY : n.ScrollbarX

    private func visibility(n Node, vertical bool) ScrollbarVisibility ->
    vertical ? n.ScrollbarVisibilityY : n.ScrollbarVisibilityX

    private func overflowing(n Node, vertical bool) bool ->
    (vertical ? maxScrollY(n) : maxScrollX(n)) > 0.0F

    private func syncAxis(n Node, vertical bool) bool {
      let nextDescriptor = descriptor(n, vertical)
      if nextDescriptor == nil && ScrollActivityStates.TryGet(n) == nil {
        return false
      }
      let state = axis(n, vertical)
      let nextVisibility = visibility(n, vertical)
      var changed bool
      if !Object.ReferenceEquals(state.Descriptor, nextDescriptor)
        || state.Visibility != nextVisibility {
          state.Descriptor = nextDescriptor
          state.Visibility = nextVisibility
          state.Alpha = 0.0F
          state.Idle = 0.0F
          state.Hovered = false
          state.Captured = false
          changed = true
          state.HideDeadlineTicks = 0.0
        }
      if nextDescriptor == nil || nextVisibility == ScrollbarVisibility.Hidden
        || n.Disabled || n.PaintInputHidden || !overflowing(n, vertical) {
          if state.Alpha != 0.0F || state.Idle != 0.0F
            || state.Hovered || state.Captured {
              state.Alpha = 0.0F
              state.Idle = 0.0F
              state.Hovered = false
              state.Captured = false
              changed = true
              state.HideDeadlineTicks = 0.0
            }
        } else if nextVisibility == ScrollbarVisibility.Always && state.Alpha != 1.0F {
          state.Alpha = 1.0F
          state.Idle = 0.0F
          changed = true
          state.HideDeadlineTicks = 0.0
        }
      return changed
    }

    private func sync(n Node) {
      syncAxis(n, false)
      syncAxis(n, true)
    }

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

    private func setTarget(n Node, x float32, y float32, immediate bool, activity bool,
      trackPin bool = true) bool {
        let nextX = clampOffset(x, maxScrollX(n))
        let nextY = clampOffset(y, maxScrollY(n))
        let jump = immediate || n.Kind == NodeKind.Editor
        let changedX = n.ScrollTargetX != nextX || (jump && n.ScrollX != nextX)
        let changedY = n.ScrollTargetY != nextY || (jump && n.ScrollY != nextY)
        let changed = changedX || changedY
        n.ScrollTargetX = nextX
        n.ScrollTargetY = nextY
        if jump {
          n.ScrollX = nextX
          n.ScrollY = nextY
        }
        if activity && changed {
          touchAxes(n, changedX, changedY)
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
        sync(n)
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
      sync(n)
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
      sync(n)
    }

    internal func Touch(n Node) {
      touchAxes(n, true, true)
    }

    internal func TouchAxis(n Node, vertical bool) {
      syncAxis(n, vertical)
      guard let nodeState = ScrollActivityStates.TryGet(n) else { return }
      let state = vertical ? nodeState.Vertical : nodeState.Horizontal
      guard let current = state.Descriptor else { return }
      if state.Visibility == ScrollbarVisibility.Hidden || !overflowing(n, vertical) {
        return
      }
      state.Alpha = 1.0F
      state.Idle = 0.0F
      scheduleHide(state, current)
    }

    private func touchAxes(n Node, horizontal bool, vertical bool) {
      if horizontal { TouchAxis(n, false) }
      if vertical { TouchAxis(n, true) }
    }

    internal func Hover(n Node, vertical bool, value bool) bool {
      syncAxis(n, vertical)
      guard let nodeState = ScrollActivityStates.TryGet(n) else { return false }
      let state = vertical ? nodeState.Vertical : nodeState.Horizontal
      if state.Descriptor == nil || state.Visibility == ScrollbarVisibility.Hidden
        || !overflowing(n, vertical) {
          return false
        }
      if state.Hovered == value {
        return false
      }
      state.Hovered = value
      if value {
        state.Alpha = 1.0F
        state.Idle = 0.0F
        state.HideDeadlineTicks = 0.0
      } else {
        state.Idle = 0.0F
        scheduleHide(state, state.Descriptor!!)
      }
      return true
    }

    internal func Capture(n Node, vertical bool, value bool) bool {
      syncAxis(n, vertical)
      guard let nodeState = ScrollActivityStates.TryGet(n) else { return false }
      let state = vertical ? nodeState.Vertical : nodeState.Horizontal
      if state.Descriptor == nil || state.Visibility == ScrollbarVisibility.Hidden
        || !overflowing(n, vertical) {
          return false
        }
      if state.Captured == value {
        return false
      }
      state.Captured = value
      if value {
        state.Alpha = 1.0F
        state.Idle = 0.0F
        state.HideDeadlineTicks = 0.0
      } else {
        state.Idle = 0.0F
        scheduleHide(state, state.Descriptor!!)
      }
      return true
    }

    internal func ResetActivity(n Node) {
      guard let state = ScrollActivityStates.TryGet(n) else { return }
      state.Horizontal.Alpha = 0.0F
      state.Horizontal.Idle = 0.0F
      state.Horizontal.Hovered = false
      state.Horizontal.Captured = false
      state.Horizontal.HideDeadlineTicks = 0.0
      state.Vertical.Alpha = 0.0F
      state.Vertical.Idle = 0.0F
      state.Vertical.Hovered = false
      state.Vertical.Captured = false
      state.Vertical.HideDeadlineTicks = 0.0
    }

    internal func Alpha(n Node, vertical bool) float32 {
      sync(n)
      if let state = ScrollActivityStates.TryGet(n) {
        return vertical ? state.Vertical.Alpha : state.Horizontal.Alpha
      }
      return 0.0F
    }

    internal func HasDemand(n Node) bool {
      sync(n)
      guard let state = ScrollActivityStates.TryGet(n) else {
        return n.ScrollX != n.ScrollTargetX || n.ScrollY != n.ScrollTargetY
      }
      return n.ScrollX != n.ScrollTargetX || n.ScrollY != n.ScrollTargetY
        || fadeDemand(state.Horizontal) || fadeDemand(state.Vertical)
    }

    internal func DeadlineSeconds(n Node) float64 {
      sync(n)
      guard let state = ScrollActivityStates.TryGet(n) else { return Double.PositiveInfinity }
      return Math.Min(deadlineSeconds(state.Horizontal), deadlineSeconds(state.Vertical))
    }

    private func fadeDemand(state ScrollAxisActivity) bool {
      guard let descriptor = state.Descriptor else { return false }
      return state.Visibility == ScrollbarVisibility.Auto && state.Alpha > 0.0F
        && !state.Hovered && !state.Captured
        && state.Idle >= float32(descriptor.HideDelayMs) * 0.001F
    }

    private func deadlineSeconds(state ScrollAxisActivity) float64 {
      guard let descriptor = state.Descriptor else { return Double.PositiveInfinity }
      if state.Visibility != ScrollbarVisibility.Auto || state.Alpha <= 0.0F
        || state.Hovered || state.Captured {
          return Double.PositiveInfinity
        }
      if state.Idle >= float32(descriptor.HideDelayMs) * 0.001F {
        return 0.0
      }
      if state.HideDeadlineTicks <= 0.0 {
        scheduleHide(state, descriptor)
      }
      let remaining = (state.HideDeadlineTicks - float64(Stopwatch.GetTimestamp()))
        / float64(Stopwatch.Frequency)
      return remaining > 0.0 ? remaining : 0.0
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
      var changed = syncAxis(n, false)
      changed = fadeAxis(n, false, dt) || changed
      changed = syncAxis(n, true) || changed
      changed = fadeAxis(n, true, dt) || changed
      return changed
    }

    private func fadeAxis(n Node, vertical bool, dt float32) bool {
      guard let nodeState = ScrollActivityStates.TryGet(n) else { return false }
      let state = vertical ? nodeState.Vertical : nodeState.Horizontal
      guard let descriptor = state.Descriptor else {
        return false
      }
      if state.Visibility != ScrollbarVisibility.Auto || state.Alpha <= 0.0F
        || state.Hovered || state.Captured {
          return false
        }
      let previousIdle = state.Idle
      state.Idle = state.Idle + dt
      let hideDelay = float32(descriptor.HideDelayMs) * 0.001F
      if state.Idle <= hideDelay {
        return false
      }
      let fadeMs = float32(descriptor.FadeMs)
      if fadeMs <= 0.0F {
        if state.Alpha == 0.0F { return false }
        state.Alpha = 0.0F
        return true
      }
      let elapsed = previousIdle < hideDelay ? state.Idle - hideDelay : dt
      let next = MathF.Max(0.0F, state.Alpha - elapsed * 1000.0F / fadeMs)
      if next == state.Alpha {
        return false
      }
      state.Alpha = next
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
