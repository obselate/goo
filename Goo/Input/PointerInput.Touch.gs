package Goo

import System
import System.Collections.Generic

internal class PointerTouchPanSample {
  internal var Target Node
  internal var VelocityX float32
  internal var VelocityY float32
}

internal class PointerTouchPanState {
  internal var Target Node
  internal var StartX float32
  internal var StartY float32
  internal var LastX float32
  internal var LastY float32
  internal var LastTime float64
  internal var SampleDuration float64
  internal var Active bool
  internal let Samples List[PointerTouchPanSample] = List[PointerTouchPanSample]()
}

internal partial class PointerInput {
  private var gestureTime float64

  private func beginTouchPan(x float32, y float32) {
    current.TouchPan = nil
    if current.Device != PointerDevice.Touch || !isSemanticPrimary()
      || current.CaptureTarget != nil || current.DragEntry != nil || current.DragEditor != nil { return }
    for i in current.PressChain.Count ... 0 {
      let n = current.PressChain[i - 1]
      if (n.OverflowX == Overflow.Scroll && maxScrollX(n) > 0.0F)
        || (n.OverflowY == Overflow.Scroll && maxScrollY(n) > 0.0F) {
          current.TouchPan = PointerTouchPanState{
            Target: n, StartX: x, StartY: y, LastX: x, LastY: y, LastTime: gestureTime,
          }
          var ancestor Node? = n
          while let target = ancestor {
            ScrollState.To(target, target.ScrollX, target.ScrollY, true, false)
            ancestor = target.IsPortal || target.FocusScopeBoundary ? nil : target.Parent
          }
          return
        }
      if n.IsPortal || n.FocusScopeBoundary { break }
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
        } catch (error Exception) {
          clearTouchPan()
          throw error
        } finally {
          clearPressChain(resolver)
          current.ClickTarget = nil
          clearDragCandidate()
          clearActiveRoute()
        }
      }
      var remainingX = state.LastX - x
      var remainingY = state.LastY - y
      let elapsed = gestureTime - state.LastTime
      if remainingX == 0.0F && remainingY == 0.0F { return true }
      state.LastX = x
      state.LastY = y
      state.LastTime = gestureTime
      if elapsed > 0.0 {
        state.SampleDuration = elapsed <= 0.1 ? elapsed : 0.0
        for sample in state.Samples {
          sample.VelocityX = 0.0F
          sample.VelocityY = 0.0F
        }
      }
      var target Node? = state.Target
      while let n = target {
        let point = TransformGeometry.WindowToNode(n, x, y)
        let previous = TransformGeometry.WindowToNode(n, x + remainingX, y + remainingY)
        if !point.Valid || !previous.Valid { break }
        let dx = n.OverflowX == Overflow.Scroll ? previous.X - point.X : 0.0F
        let dy = n.OverflowY == Overflow.Scroll ? previous.Y - point.Y : 0.0F
        if dx != 0.0F || dy != 0.0F {
          let moved = ScrollState.By(n, dx, dy, true)
          if moved.X != 0.0 || moved.Y != 0.0 {
            PointerScrollStates.MarkDirty(this)
            recordTouchVelocity(state, n, moved, state.SampleDuration)
          }
          let origin = TransformGeometry.NodeToWindow(n, point.X, point.Y)
          let consumed = TransformGeometry.NodeToWindow(n,
            point.X + float32(moved.X), point.Y + float32(moved.Y))
          if !origin.Valid || !consumed.Valid { break }
          remainingX = remainingX - consumed.X + origin.X
          remainingY = remainingY - consumed.Y + origin.Y
        }
        target = n.IsPortal || n.FocusScopeBoundary ? nil : n.Parent
      }
      return true
    }

  private func recordTouchVelocity(state PointerTouchPanState, n Node, moved Point,
    elapsed float64) {
      if elapsed <= 0.0 || elapsed > 0.1 { return }
      var sample PointerTouchPanSample?
      for candidate in state.Samples {
        if candidate.Target == n {
          sample = candidate
          break
        }
      }
      if sample == nil {
        sample = PointerTouchPanSample{ Target: n }
        state.Samples.Add(sample)
      }
      sample.VelocityX = float32(Math.Clamp(float64(sample.VelocityX) + moved.X / elapsed, -4000.0, 4000.0))
      sample.VelocityY = float32(Math.Clamp(float64(sample.VelocityY) + moved.Y / elapsed, -4000.0, 4000.0))
    }

  private func finishTouchPan(root Node?, resolver Resolver, x float32, y float32) bool {
    let changed = updateTouchPan(root, resolver, x, y, false)
    if let state = current.TouchPan {
      if state.Active && gestureTime - state.LastTime <= 0.1 {
        for sample in state.Samples {
          ScrollState.StartMomentum(sample.Target, sample.VelocityX, sample.VelocityY)
        }
      }
    }
    return changed
  }
}
