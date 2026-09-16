package Goo

import System
import System.Runtime.CompilerServices

/// Describes an opt-in transition for computed layout position changes using DurationMs and Easing.
public data struct LayoutTransition(DurationMs float64, Easing Easing) { }

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
  private var duration float64
  private var easing Easing
  private var lastLocalX float32
  private var lastLocalY float32
  private var lastBaseX float32
  private var lastBaseY float32
  private var offsetX float32
  private var offsetY float32
  private var startOffsetX float32
  private var startOffsetY float32
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
      duration = value.DurationMs / 1000.0
      easing = value.Easing
      if let owner = registrationPump {
        if pump != owner { owner.Deregister(this) }
      }
      this.pump = pump
      if pump == nil {
        if let owner = registrationPump {
          owner.Deregister(this)
        }
      }
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
    offsetX = x
    offsetY = y
    startOffsetX = x
    startOffsetY = y
    guard let pump = pump else {
      offsetX = 0.0F
      offsetY = 0.0F
      return
    }
    if duration <= 0.0 || (x == 0.0F && y == 0.0F) {
      offsetX = 0.0F
      offsetY = 0.0F
      pump.Deregister(this)
      return
    }
    startTime = pump.Now
    pump.Register(this)
    invalidated?.Invoke(ReconcileEffects.Rect | ReconcileEffects.Paint
      | ReconcileEffects.Input | ReconcileEffects.Accessibility)
  }

  internal override func Tick(now float64) bool {
    if disposed || node.Retired {
      return false
    }
    let t = Math.Min(1.0, (now - startTime) / duration)
    let remaining = float32(1.0 - ease(easing, t))
    offsetX = startOffsetX * remaining
    offsetY = startOffsetY * remaining
    invalidated?.Invoke(ReconcileEffects.Rect | ReconcileEffects.Paint
      | ReconcileEffects.Input | ReconcileEffects.Accessibility)
    return t < 1.0
  }

  internal override func Bind(pump MotionPump) {
  }

  internal override func Dispose() {
    if disposed { return }
    disposed = true
    registrationPump?.Deregister(this)
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
}
