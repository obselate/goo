package Goo

import System

internal class ScrollMomentum : Simulation {
  internal var X float32
  internal var Y float32
  internal var VelocityX float32
  internal var VelocityY float32

  internal init(x float32, y float32, velocityX float32, velocityY float32) {
    X = x
    Y = y
    VelocityX = velocityX
    VelocityY = velocityY
  }

  public override func Position(elapsed float64) float64 ->
  (1.0 - Math.Exp(-Math.Max(0.0, elapsed) * 8.0)) / 8.0

  public override func Velocity(elapsed float64) float64 ->
  Math.Exp(-Math.Max(0.0, elapsed) * 8.0)

  public override func Done(elapsed float64) bool ->
  float64(Math.Max(Math.Abs(VelocityX), Math.Abs(VelocityY))) * Velocity(elapsed) < 5.0
}

internal partial class ScrollState {
  shared {
    internal func StartMomentum(n Node, velocityX float32, velocityY float32) {
      let state = ScrollActivityStates.For(n)
      let motion = ScrollMomentum(n.ScrollX, n.ScrollY, velocityX, velocityY)
      state.Momentum = motion.Done(0.0) ? nil : motion
      state.MomentumElapsed = 0.0
    }

    internal func StopMomentum(n Node) {
      if let state = ScrollActivityStates.TryGet(n) { state.Momentum = nil }
    }

    internal func StopMomentumTree(root Node?) {
      guard let n = root else { return }
      StopMomentum(n)
      for child in n.Children { StopMomentumTree(child) }
      for child in ScrollbarParts.Children(n) { StopMomentumTree(child) }
    }

    private func stepMomentum(n Node, dt float32, reducedMotion bool) bool {
      guard let state = ScrollActivityStates.TryGet(n), let motion = state.Momentum else {
        return false
      }
      if reducedMotion || n.Retired || !canReceiveInput(n) {
        state.Momentum = nil
        return false
      }
      state.MomentumElapsed = state.MomentumElapsed + float64(dt)
      let distance = float32(motion.Position(state.MomentumElapsed))
      let x = motion.X + motion.VelocityX * distance
      let y = motion.Y + motion.VelocityY * distance
      let changed = setTarget(n, x, y, true, true)
      if n.ScrollX != x {
        motion.X = n.ScrollX
        motion.VelocityX = 0.0F
      }
      if n.ScrollY != y {
        motion.Y = n.ScrollY
        motion.VelocityY = 0.0F
      }
      if motion.Done(state.MomentumElapsed) { state.Momentum = nil }
      return changed
    }

  }
}
