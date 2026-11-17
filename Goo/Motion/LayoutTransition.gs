package Goo

import System
import System.Runtime.CompilerServices

/// Describes an opt-in computed-bounds transition using DurationMs and Easing, or a custom SimulationFactory.
public data struct LayoutTransition(DurationMs float64, Easing Easing) {
  /// Creates an optional simulation for each changed position or size axis. Omission uses DurationMs and Easing.
  /// The simulation starts at from with the supplied velocity and settles at to.
  public prop SimulationFactory ((float64, float64, float64) -> Simulation)? { get; init; }
}

internal sealed class LayoutTransitionBlobValue {
  internal var Value LayoutTransition
}

internal class LayoutTransitionBlobs {
  shared {
    private let values ConditionalWeakTable[Blob, LayoutTransitionBlobValue] =
    ConditionalWeakTable[Blob, LayoutTransitionBlobValue]()

    internal func Get(blob Blob) LayoutTransition? -> if values.TryGetValue(blob, out var current) { current.Value } else { nil }

    internal func Set(blob Blob, value LayoutTransition?) {
      values.Remove(blob)
      if let next = value {
        values.Add(blob, LayoutTransitionBlobValue{ Value: next })
      }
    }
  }
}

internal sealed class LayoutTransitionState : MotionParticle {
  private let node Node
  private var invalidated Action[ReconcileEffects]?
  private var lastLocalX float32
  private var lastLocalY float32
  private var lastWidth float32
  private var lastHeight float32
  private var offsetX float32
  private var offsetY float32
  private var offsetWidth float32
  private var offsetHeight float32
  private var simulationX Simulation?
  private var simulationY Simulation?
  private var simulationWidth Simulation?
  private var simulationHeight Simulation?
  private var startTime float64
  private var hasBounds bool
  private var disposed bool
  private var pump MotionPump?
  private var value LayoutTransition

  internal prop Value LayoutTransition{ get -> value }

  internal init(n Node) {
    node = n
  }

  internal func Configure(value LayoutTransition, pump MotionPump?,
    callback Action[ReconcileEffects]?) {
      invalidated = callback
      this.value = value
      if let owner = registrationPump {
        if pump != owner { owner.Deregister(this) }
      }
      if this.pump != pump {
        snap()
      }
      this.pump = pump
    }

  internal func Resolve(baseX float32, baseY float32, localX float32,
    localY float32, width float32 = 0.0F, height float32 = 0.0F) Rect {
      if let owner = pump { sample(owner.Now) }
      if hasBounds && (localX != lastLocalX || localY != lastLocalY
        || width != lastWidth || height != lastHeight) {
        bank(lastLocalX + offsetX - localX, lastLocalY + offsetY - localY,
          lastWidth + offsetWidth - width, lastHeight + offsetHeight - height)
      }
      hasBounds = true
      lastLocalX = localX
      lastLocalY = localY
      lastWidth = width
      lastHeight = height
      return Rect{
        X: baseX + offsetX, Y: baseY + offsetY,
        W: MathF.Max(0.0F, width + offsetWidth), H: MathF.Max(0.0F, height + offsetHeight),
      }
    }

  private func bank(x float32, y float32, width float32, height float32) {
    let elapsed = if let owner = pump { Math.Max(0.0, owner.Now - startTime) * Motion.TimeScale } else { 0.0 }
    let velocityX = if let simulation = simulationX { simulation.Velocity(elapsed) } else { 0.0 }
    let velocityY = if let simulation = simulationY { simulation.Velocity(elapsed) } else { 0.0 }
    let velocityWidth = if let simulation = simulationWidth { simulation.Velocity(elapsed) } else { 0.0 }
    let velocityHeight = if let simulation = simulationHeight { simulation.Velocity(elapsed) } else { 0.0 }
    guard let pump = pump else {
      snap()
      return
    }
    if pump.ReducedMotion || Motion.TimeScale <= 0.0 || (value.SimulationFactory == nil && value.DurationMs <= 0.0) {
      snap()
      pump.Deregister(this)
      return
    }
    let nextX = createSimulation(x, velocityX)
    let nextY = createSimulation(y, velocityY)
    let nextWidth = createSimulation(width, velocityWidth)
    let nextHeight = createSimulation(height, velocityHeight)
    simulationX = nextX
    simulationY = nextY
    simulationWidth = nextWidth
    simulationHeight = nextHeight
    offsetX = x
    offsetY = y
    offsetWidth = width
    offsetHeight = height
    startTime = pump.Now
    if sample(startTime) {
      pump.Register(this)
    } else {
      pump.Deregister(this)
    }
    invalidated?.Invoke(ReconcileEffects.Rect | ReconcileEffects.Paint
      | ReconcileEffects.Input | ReconcileEffects.Accessibility)
  }

  private func createSimulation(offset float32, velocity float64) Simulation? {
    if offset == 0.0F && velocity == 0.0 { return nil }
    guard let create = value.SimulationFactory else {
      return LinearTimed(value.DurationMs / 1000.0, float64(offset), 0.0, value.Easing)
    }
    let simulation = create(float64(offset), 0.0, velocity)
    if simulation == nil { throw InvalidOperationException("LayoutTransition simulation factory returned null") }
    return simulation
  }

  internal override func Tick(now float64) bool {
    if disposed || node.Retired {
      return false
    }
    let running = if pump?.ReducedMotion == true || Motion.TimeScale <= 0.0 {
      snap()
      false
    } else {
      sample(now)
    }
    invalidated?.Invoke(ReconcileEffects.Rect | ReconcileEffects.Paint
      | ReconcileEffects.Input | ReconcileEffects.Accessibility)
    return running
  }

  private func sample(now float64) bool {
    let elapsed = Math.Max(0.0, now - startTime) * Motion.TimeScale
    if let simulation = simulationX {
      if simulation.Done(elapsed) {
        offsetX = 0.0F
        simulationX = nil
      } else {
        offsetX = float32(simulation.Position(elapsed))
      }
    }
    if let simulation = simulationY {
      if simulation.Done(elapsed) {
        offsetY = 0.0F
        simulationY = nil
      } else {
        offsetY = float32(simulation.Position(elapsed))
      }
    }
    if let simulation = simulationWidth {
      if simulation.Done(elapsed) {
        offsetWidth = 0.0F
        simulationWidth = nil
      } else {
        offsetWidth = float32(simulation.Position(elapsed))
      }
    }
    if let simulation = simulationHeight {
      if simulation.Done(elapsed) {
        offsetHeight = 0.0F
        simulationHeight = nil
      } else {
        offsetHeight = float32(simulation.Position(elapsed))
      }
    }
    return simulationX != nil || simulationY != nil || simulationWidth != nil || simulationHeight != nil
  }

  private func snap() {
    simulationX = nil
    simulationY = nil
    offsetX = 0.0F
    offsetY = 0.0F
    simulationWidth = nil
    simulationHeight = nil
    offsetWidth = 0.0F
    offsetHeight = 0.0F
  }

  internal override func Bind(pump MotionPump) {
  }

  internal override func Dispose() {
    if disposed { return }
    disposed = true
    registrationPump?.Deregister(this)
    snap()
    pump = nil
    invalidated = nil
  }
}

internal class LayoutTransitions {
  shared {
    internal func Value(n Node) LayoutTransition? -> n.RetainedLayoutTransition?.Value

    internal func Configure(n Node, value LayoutTransition?, pump MotionPump?,
      invalidated Action[ReconcileEffects]?) {
        guard let next = value else {
          Dispose(n)
          return
        }
        let state = if let current = n.RetainedLayoutTransition {
          current
        } else {
          let created = LayoutTransitionState(n)
          n.RetainedLayoutTransition = created
          created
        }
        state.Configure(next, pump, invalidated)
      }

    internal func Resolve(n Node, baseX float32, baseY float32, localX float32,
      localY float32, width float32, height float32) Rect {
        guard let state = n.RetainedLayoutTransition else {
          return Rect{ X: baseX, Y: baseY, W: width, H: height }
        }
        return state.Resolve(baseX, baseY, localX, localY, width, height)
      }

    internal func Dispose(n Node) {
      guard let state = n.RetainedLayoutTransition else { return }
      n.RetainedLayoutTransition = nil
      state.Dispose()
    }
  }
}

internal func validLayoutTransition(value LayoutTransition) bool {
  let duration = value.DurationMs
  let ordinal = int32(value.Easing)
  return !Double.IsNaN(duration) && !Double.IsInfinity(duration) && duration >= 0.0
    && ordinal >= 0 && ordinal <= 3
}

internal func sameLayoutTransition(left LayoutTransition?, right LayoutTransition?) bool {
  if left == nil { return right == nil }
  let l = left
  guard let r = right else { return false }
  return l.DurationMs == r.DurationMs && l.Easing == r.Easing
    && Object.Equals(l.SimulationFactory, r.SimulationFactory)
}
