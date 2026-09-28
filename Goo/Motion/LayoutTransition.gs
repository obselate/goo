package Goo

import System
import System.Runtime.CompilerServices

/// Describes an opt-in position transition using DurationMs and Easing, or a custom SimulationFactory.
public data struct LayoutTransition(DurationMs float64, Easing Easing) {
  /// Creates an optional simulation for each position axis. Omission uses DurationMs and Easing.
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
  private var lastBaseX float32
  private var lastBaseY float32
  private var offsetX float32
  private var offsetY float32
  private var simulationX Simulation?
  private var simulationY Simulation?
  private var startTime float64
  private var hasPosition bool
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
        simulationX = nil
        simulationY = nil
        offsetX = 0.0F
        offsetY = 0.0F
      }
      this.pump = pump
    }

  internal func Resolve(baseX float32, baseY float32, localX float32,
    localY float32) Rect{
      if !hasPosition {
        hasPosition = true
        lastLocalX = localX
        lastLocalY = localY
        lastBaseX = baseX
        lastBaseY = baseY
        return Rect{ X: baseX, Y: baseY }
      }
      if let owner = pump {
        sample(owner.Now)
      }
      if localX != lastLocalX || localY != lastLocalY {
        let visualX = lastBaseX + offsetX
        let visualY = lastBaseY + offsetY
        bank(visualX - baseX, visualY - baseY)
      }
      lastLocalX = localX
      lastLocalY = localY
      lastBaseX = baseX
      lastBaseY = baseY
      return Rect{ X: baseX + offsetX, Y: baseY + offsetY }
    }

  private func bank(x float32, y float32) {
    let elapsed = if let owner = pump { Math.Max(0.0, owner.Now - startTime) } else { 0.0 }
    let velocityX = if let simulation = simulationX { simulation.Velocity(elapsed) } else { 0.0 }
    let velocityY = if let simulation = simulationY { simulation.Velocity(elapsed) } else { 0.0 }
    guard let pump = pump else {
      snap()
      return
    }
    if pump.ReducedMotion || (value.SimulationFactory == nil && value.DurationMs <= 0.0)
      || (x == 0.0F && y == 0.0F && velocityX == 0.0 && velocityY == 0.0) {
      snap()
      pump.Deregister(this)
      return
    }
    let factory = value.SimulationFactory
    let nextX = if let create = factory {
      create(float64(x), 0.0, velocityX)
    } else {
      LinearTimed(value.DurationMs / 1000.0, float64(x), 0.0, value.Easing)
    }
    let nextY = if let create = factory {
      create(float64(y), 0.0, velocityY)
    } else {
      LinearTimed(value.DurationMs / 1000.0, float64(y), 0.0, value.Easing)
    }
    if nextX == nil || nextY == nil {
      throw InvalidOperationException("LayoutTransition simulation factory returned null")
    }
    simulationX = nextX
    simulationY = nextY
    startTime = pump.Now
    if sample(startTime) {
      pump.Register(this)
    } else {
      pump.Deregister(this)
    }
    invalidated?.Invoke(ReconcileEffects.Rect | ReconcileEffects.Paint
      | ReconcileEffects.Input | ReconcileEffects.Accessibility)
  }

  internal override func Tick(now float64) bool {
    if disposed || node.Retired {
      return false
    }
    let running = if pump?.ReducedMotion == true {
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
    let elapsed = Math.Max(0.0, now - startTime)
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
    return simulationX != nil || simulationY != nil
  }

  private func snap() {
    simulationX = nil
    simulationY = nil
    offsetX = 0.0F
    offsetY = 0.0F
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
    private let values ConditionalWeakTable[Node, LayoutTransitionState] =
    ConditionalWeakTable[Node, LayoutTransitionState]()

    internal func Value(n Node) LayoutTransition? -> if values.TryGetValue(n, out var state) { state.Value } else { nil }

    internal func Configure(n Node, value LayoutTransition?, pump MotionPump?,
      invalidated Action[ReconcileEffects]?) {
        guard let next = value else {
          Dispose(n)
          return
        }
        let state = if values.TryGetValue(n, out var current) {
          current
        } else {
          let created = LayoutTransitionState(n)
          values.Add(n, created)
          created
        }
        state.Configure(next, pump, invalidated)
      }

    internal func Resolve(n Node, baseX float32, baseY float32, localX float32,
      localY float32) Rect{
        if !values.TryGetValue(n, out var state) {
          return Rect{ X: baseX, Y: baseY }
        }
        return state.Resolve(baseX, baseY, localX, localY)
      }

    internal func Dispose(n Node) {
      if !values.TryGetValue(n, out var state) { return }
      values.Remove(n)
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
