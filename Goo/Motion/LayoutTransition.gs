package Goo

import System
import System.Runtime.CompilerServices

internal enum LayoutCause { None; Application; Environment }

internal class LayoutOrigin {
  shared {
    @ThreadStatic
    private var current LayoutCause
    @ThreadStatic
    internal var Baseline bool
    @ThreadStatic
    internal var TrackPresentation bool

    internal prop Current LayoutCause {
      get -> current == LayoutCause.None ? LayoutCause.Application : current
      set(v) -> current = v
    }

    internal func Combine(left LayoutCause, right LayoutCause) LayoutCause ->
      LayoutCause(int32(left) | int32(right))

    internal func IsApplication(cause LayoutCause) bool ->
      (int32(cause) & int32(LayoutCause.Application)) != 0
  }
}

internal enum LayoutTransitionPhase { Application; Immediate; Staged }

/// Describes an opt-in transition for application changes to computed bounds using DurationMs and Easing, or a custom SimulationFactory.
/// Environment changes apply at once and preserve the current application offset and velocity.
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
  private var startX float64
  private var startY float64
  private var startWidth float64
  private var startHeight float64
  private var hasBounds bool
  private var disposed bool
  private var pump MotionPump?
  private var value LayoutTransition
  private var baseline Rect
  private var baselinePlacement System.Numerics.Vector2
  private var baselineValid bool
  private var stagedFresh bool
  internal var Previous LayoutTransitionState?
  internal var Next LayoutTransitionState?
  private var window Window?

  internal prop Value LayoutTransition{ get -> value }
  internal prop SizeOffset System.Numerics.Vector2 { get -> System.Numerics.Vector2(offsetWidth, offsetHeight) }
  internal prop IsPortal bool { get -> node.IsPortal }

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
        window?.RemoveLayoutTransition(this)
        window = pump?.Owner
        window?.AddLayoutTransition(this)
        snap()
      }
      this.pump = pump
    }

  internal func Resolve(baseX float32, baseY float32, localX float32,
    localY float32, width float32, height float32, phase LayoutTransitionPhase) Rect {
      if let owner = pump { sample(owner.Now) }
      if phase == LayoutTransitionPhase.Staged && !hasBounds { stagedFresh = true }
      if phase == LayoutTransitionPhase.Application && hasBounds && (localX != lastLocalX || localY != lastLocalY
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

  internal func BeginApplication() {
    baseline = Rect{X: lastLocalX, Y: lastLocalY, W: lastWidth, H: lastHeight}
    baselineValid = hasBounds && !node.Retired
    stagedFresh = !hasBounds
    baselinePlacement = node.PlacementOffset
  }

  internal func CommitSize() {
    if !baselineValid || !hasBounds || node.Retired { return }
    if !canAnimate() { return }
    if baseline.W != lastWidth {
      retarget(ref simulationWidth, ref offsetWidth, ref startWidth, offsetWidth - (lastWidth - baseline.W))
    }
    if baseline.H != lastHeight {
      retarget(ref simulationHeight, ref offsetHeight, ref startHeight, offsetHeight - (lastHeight - baseline.H))
    }
    updateRegistration()
  }

  internal func CommitApplication() {
    stagedFresh = false
    let valid = baselineValid
    baselineValid = false
    if !valid || !hasBounds || node.Retired || !canAnimate() { return }
    retarget(ref simulationX, ref offsetX, ref startX,
      offsetX - (lastLocalX - baseline.X) + baselinePlacement.X - node.PlacementOffset.X)
    retarget(ref simulationY, ref offsetY, ref startY,
      offsetY - (lastLocalY - baseline.Y) + baselinePlacement.Y - node.PlacementOffset.Y)
    updateRegistration()
  }

  internal func AbortApplication() {
    if stagedFresh {
      hasBounds = false
      stagedFresh = false
    }
    if !baselineValid { return }
    baselineValid = false
    lastLocalX = baseline.X
    lastLocalY = baseline.Y
    lastWidth = baseline.W
    lastHeight = baseline.H
  }

  private func bank(x float32, y float32, width float32, height float32) {
    if !canAnimate() { return }
    retarget(ref simulationX, ref offsetX, ref startX, x)
    retarget(ref simulationY, ref offsetY, ref startY, y)
    retarget(ref simulationWidth, ref offsetWidth, ref startWidth, width)
    retarget(ref simulationHeight, ref offsetHeight, ref startHeight, height)
    updateRegistration()
  }

  private func canAnimate() bool {
    if pump == nil || pump?.ReducedMotion == true || Motion.TimeScale <= 0.0
      || (value.SimulationFactory == nil && value.DurationMs <= 0.0) {
      snap()
      pump?.Deregister(this)
      return false
    }
    return true
  }

  private func retarget(ref simulation Simulation?, ref offset float32, ref start float64, next float32) {
    if next == offset { return }
    let now = pump?.Now ?? 0.0
    let elapsed = Math.Max(0.0, now - start) * Motion.TimeScale
    let velocity = simulation?.Velocity(elapsed) ?? 0.0
    simulation = createSimulation(next, velocity)
    offset = next
    start = now
  }

  private func updateRegistration() {
    guard let owner = pump else { return }
    if sample(owner.Now) { owner.Register(this) }
    else { owner.Deregister(this) }
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
    let elapsedX = Math.Max(0.0, now - startX) * Motion.TimeScale
    let elapsedY = Math.Max(0.0, now - startY) * Motion.TimeScale
    let elapsedWidth = Math.Max(0.0, now - startWidth) * Motion.TimeScale
    let elapsedHeight = Math.Max(0.0, now - startHeight) * Motion.TimeScale
    if let simulation = simulationX {
      if simulation.Done(elapsedX) {
        offsetX = 0.0F
        simulationX = nil
      } else {
        offsetX = float32(simulation.Position(elapsedX))
      }
    }
    if let simulation = simulationY {
      if simulation.Done(elapsedY) {
        offsetY = 0.0F
        simulationY = nil
      } else {
        offsetY = float32(simulation.Position(elapsedY))
      }
    }
    if let simulation = simulationWidth {
      if simulation.Done(elapsedWidth) {
        offsetWidth = 0.0F
        simulationWidth = nil
      } else {
        offsetWidth = float32(simulation.Position(elapsedWidth))
      }
    }
    if let simulation = simulationHeight {
      if simulation.Done(elapsedHeight) {
        offsetHeight = 0.0F
        simulationHeight = nil
      } else {
        offsetHeight = float32(simulation.Position(elapsedHeight))
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
    window?.RemoveLayoutTransition(this)
    window = nil
    baselineValid = false
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
      localY float32, width float32, height float32, phase LayoutTransitionPhase) Rect {
        guard let state = n.RetainedLayoutTransition else {
          return Rect{ X: baseX, Y: baseY, W: width, H: height }
        }
        return state.Resolve(baseX, baseY, localX, localY, width, height, phase)
      }

    internal func Dispose(n Node) {
      guard let state = n.RetainedLayoutTransition else { return }
      n.RetainedLayoutTransition = nil
      state.Dispose()
    }
  }
}

/// Hosts a Goo tree in a native window.
public partial class Window {
  private var layoutTransitions LayoutTransitionState?
  internal prop DeferLayoutTargets bool {
    get -> layoutTransitions != nil && !cellTransactionActive
      && layout.TransitionPhase == LayoutTransitionPhase.Immediate
  }

  internal func AddLayoutTransition(state LayoutTransitionState) {
    state.Next = layoutTransitions
    state.Previous = nil
    if let first = layoutTransitions { first.Previous = state }
    layoutTransitions = state
  }

  internal func RemoveLayoutTransition(state LayoutTransitionState) {
    if let previous = state.Previous { previous.Next = state.Next }
    else if layoutTransitions == state { layoutTransitions = state.Next }
    if let next = state.Next { next.Previous = state.Previous }
    state.Previous = nil
    state.Next = nil
  }

  private func beginLayoutApplication() {
    var current = layoutTransitions
    while let state = current {
      state.BeginApplication()
      current = state.Next
    }
    layout.TransitionPhase = LayoutTransitionPhase.Staged
  }

  private func abortLayoutApplication() {
    var current = layoutTransitions
    while let state = current {
      state.AbortApplication()
      current = state.Next
    }
  }

  private func commitLayoutApplication() {
    var current = layoutTransitions
    while let state = current {
      state.CommitSize()
      current = state.Next
    }
    if let root = node { layout.RefreshRects(root, portalRoot) }
    current = layoutTransitions
    var portals = false
    while let state = current {
      if state.IsPortal { portals = true }
      else { state.CommitApplication() }
      current = state.Next
    }
    layout.TransitionPhase = LayoutTransitionPhase.Immediate
    if !portals { return }
    let previous = LayoutOrigin.Current
    LayoutOrigin.Current = LayoutCause.Environment
    try {
      if let root = node { layout.RefreshRects(root, portalRoot) }
    } finally { LayoutOrigin.Current = previous }
    current = layoutTransitions
    while let state = current {
      if state.IsPortal { state.CommitApplication() }
      current = state.Next
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
