package Goo

import System

internal open class MotionParticle {
  internal var registrationPump MotionPump?
  internal var registrationGeneration int64

  internal open func Tick(now float64) bool;
  internal open func Dispose();
  internal open func Bind(pump MotionPump);
}

internal class AnimHandle : MotionParticle {
  private let tick(float64) -> bool
  private let dispose() -> void
  private let bind(MotionPump) -> void

  internal init(tick(float64) -> bool, dispose() -> void, bind(MotionPump) -> void) {
    this.tick = tick
    this.dispose = dispose
    this.bind = bind
  }

  internal override func Tick(now float64) bool -> tick(now)

  internal override func Dispose() {
    dispose()
  }

  internal override func Bind(pump MotionPump) {
    bind(pump)
  }
}

/// Bridges scalar simulations to a Cell-owned animated value.
/// @typeparam T animated value type
public class Anim[T] {
  private let converter MotionConverter[T]
  private let sims []Simulation?
  private let nextSims []Simulation?
  private let work []float64
  private let toDims []float64
  private let velDims []float64
  private let velRead []float64
  private let invalidate Action?
  private let onChange Action[T]?
  private let handle AnimHandle
  private var currentT T
  private var toT T
  private var startTime float64
  private var running bool
  private var disposed bool
  private var mutating bool
  private var boundPump MotionPump?
  private var memoTime float64
  private var memoScale float64
  private var memoValue T
  private var memoValid bool

  internal init(initial T, converter MotionConverter[T], invalidate Action?, onChange Action[T]?) {
    if converter == nil {
      throw ArgumentNullException("converter")
    }
    let dimensions = converter.Dimensions()
    if dimensions < 1 {
      throw ArgumentOutOfRangeException("converter")
    }
    this.converter = converter
    sims = [dimensions]Simulation?
    nextSims = [dimensions]Simulation?
    work = [dimensions]float64
    toDims = [dimensions]float64
    velDims = [dimensions]float64
    velRead = [dimensions]float64
    converter.Read(initial, work)
    currentT = initial
    toT = initial
    memoValue = initial
    this.invalidate = invalidate
    this.onChange = onChange
    handle = AnimHandle(tickInternal, disposeInternal, bindInternal)
  }

  /// Gets the current value at the current motion clock time.
  public prop Value T{
    get {
      if !running {
        return currentT
      }
      guard let pump = boundPump else {
        return currentT
      }
      let now = pump.Now
      return if memoValid && memoTime == now && memoScale == Motion.TimeScale { memoValue } else { memoize(now) }
    }
  }

  /// Gets the target value for the current or last animation.
  public prop Target T{ get -> toT }

  /// Gets the current velocity in converter-coordinate units per second.
  /// A resting animation reports zero velocity in every dimension.
  public prop Velocity MotionVelocity{
    get {
      if !running || disposed {
        return zeroVelocity()
      }
      guard let pump = boundPump else {
        return zeroVelocity()
      }
      let elapsed = (pump.Now - startTime) * Motion.TimeScale
      for var i = 0; i < sims.Length; i++ {
        velRead[i] = simAt(i).Velocity(elapsed)
      }
      return if velRead.Length == 1 { MotionVelocity.Uniform(velRead[0]) } else { MotionVelocity.Components(velRead) }
    }
  }

  /// Gets whether any scalar simulation is still running.
  public prop Running bool{ get -> running }

  internal prop Handle MotionParticle{ get -> handle }

  /// Animates toward target with Motion.Default.
  /// @param target value to animate toward
  public func To(target T) {
    retargetDefault(target, MotionVelocity{}, false)
  }

  /// Animates toward target with one shared or one-per-dimension specification.
  /// @param target value to animate toward
  /// @param spec first specification
  /// @param specs remaining specifications, empty for shared behavior
  public func To(
    target T,
    spec(float64, float64, float64) -> Simulation,
    specs ... ((float64, float64, float64) -> Simulation)) {
      retargetRequired(target, MotionVelocity{}, false, spec, specs)
    }

  /// Animates toward target with an explicit initial converter-coordinate velocity.
  /// @param target value to animate toward
  /// @param velocity uniform or dimension-ordered initial velocity
  public func To(target T, velocity MotionVelocity) {
    retargetDefault(target, velocity, true)
  }

  /// Animates toward target with explicit velocity and shared or per-dimension specifications.
  /// @param target value to animate toward
  /// @param velocity uniform or dimension-ordered initial velocity
  /// @param spec first specification
  /// @param specs remaining specifications, empty for shared behavior
  public func To(
    target T,
    velocity MotionVelocity,
    spec(float64, float64, float64) -> Simulation,
    specs ... ((float64, float64, float64) -> Simulation)) {
      retargetRequired(target, velocity, true, spec, specs)
    }

  /// Snaps to value, stops all scalar simulations, and notifies the owner.
  /// @param value value to set
  public func Set(value T) {
    applySnap(value, true)
  }

  /// Snaps to value and stops all scalar simulations without invalidating the
  /// owner. Safe during Build; the build in progress reads the new value.
  /// @param value value to set
  public func Snap(value T) {
    applySnap(value, false)
  }

  private func applySnap(value T, notify bool) {
    if disposed {
      return
    }
    beginMutation()
    try {
      converter.Read(value, toDims)
      if notify {
        if let rebuild = invalidate {
          rebuild()
        }
      }
      for var i = 0; i < work.Length; i++ {
        work[i] = toDims[i]
        sims[i] = nil
        nextSims[i] = nil
      }
      currentT = value
      toT = value
      memoValid = false
      running = false
      if let owner = handle.registrationPump {
        owner.Deregister(handle)
      }
      if notify {
        notifyChange(value)
      }
    } finally {
      mutating = false
    }
  }

  private func zeroVelocity() MotionVelocity -> MotionVelocity.Uniform(0.0)

  private func retargetDefault(target T, velocity MotionVelocity, explicitVelocity bool) {
    if disposed {
      return
    }
    beginMutation()
    var committed = false
    try {
      let spec = Motion.Default
      if spec == nil {
        throw InvalidOperationException("Motion.Default is nil")
      }
      committed = buildSims(target, velocity, explicitVelocity, (i int32) -> spec)
    } finally {
      if !committed {
        clearNextSims()
      }
      mutating = false
    }
  }

  private func retargetRequired(
    target T,
    velocity MotionVelocity,
    explicitVelocity bool,
    spec(float64, float64, float64) -> Simulation,
    specs ... ((float64, float64, float64) -> Simulation)) {
      if disposed {
        return
      }
      beginMutation()
      var committed = false
      try {
        validateRequiredSpecs(spec, specs)
        committed = buildSims(target, velocity, explicitVelocity,
          (i int32) -> specs.Length == 0 || i == 0 ? spec : specs[i - 1])
      } finally {
        if !committed {
          clearNextSims()
        }
        mutating = false
      }
    }

  private func buildSims(target T, velocity MotionVelocity, explicitVelocity bool,
    selectSpec(int32) -> (float64, float64, float64) -> Simulation) bool{
      let now = prepareRetarget(target, velocity, explicitVelocity)
      for var i = 0; i < sims.Length; i++ {
        let built = selectSpec(i)(work[i], toDims[i], velDims[i])
        if built == nil {
          throw InvalidOperationException("motion specification returned nil")
        }
        nextSims[i] = built
      }
      commitRetarget(target, now)
      return true
    }

  private func prepareRetarget(target T, velocity MotionVelocity, explicitVelocity bool) float64 {
    converter.Read(target, toDims)
    let now = currentNow()
    if running && boundPump != nil {
      let elapsed = elapsedAt(now)
      for var i = 0; i < sims.Length; i++ {
        let sim = simAt(i)
        work[i] = sim.Position(elapsed)
        velDims[i] = sim.Velocity(elapsed)
      }
    } else {
      for var i = 0; i < velDims.Length; i++ {
        velDims[i] = 0.0
      }
    }
    if explicitVelocity {
      velocity.CopyInto(velDims)
    }
    return now
  }

  private func commitRetarget(target T, now float64) {
    for var i = 0; i < sims.Length; i++ {
      sims[i] = nextSims[i]
      nextSims[i] = nil
    }
    toT = target
    startTime = now
    memoValid = false
    running = true
    if let pump = boundPump {
      if handle.registrationPump != pump {
        pump.Register(handle)
      }
    }
  }

  private func validateRequiredSpecs(
    spec(float64, float64, float64) -> Simulation,
    specs []((float64, float64, float64) -> Simulation)) {
      let count = specs.Length + 1
      if count != 1 && count != sims.Length {
        throw ArgumentException("spec count must be one or match converter dimensions", "specs")
      }
      if spec == nil {
        throw ArgumentNullException("spec")
      }
      for var i = 0; i < specs.Length; i++ {
        if specs[i] == nil {
          throw ArgumentNullException("specs")
        }
      }
    }

  private func beginMutation() {
    if mutating {
      throw InvalidOperationException("Anim cannot be mutated while a motion callback is running")
    }
    mutating = true
  }

  private func clearNextSims() {
    for var i = 0; i < nextSims.Length; i++ {
      nextSims[i] = nil
    }
  }

  private func memoize(now float64) T {
    let scale = Motion.TimeScale
    let elapsed = (now - startTime) * scale
    for var i = 0; i < sims.Length; i++ {
      work[i] = simAt(i).Position(elapsed)
    }
    let value = converter.Write(work)
    memoTime = now
    memoScale = scale
    memoValue = value
    memoValid = true
    return value
  }

  private func disposeInternal() {
    if disposed {
      return
    }
    disposed = true
    try {
      if running {
        currentT = Value
      }
    } finally {
      running = false
      if let owner = handle.registrationPump {
        owner.Deregister(handle)
      }
      boundPump = nil
      memoValid = false
      for var i = 0; i < sims.Length; i++ {
        sims[i] = nil
        nextSims[i] = nil
      }
    }
  }

  private func tickInternal(now float64) bool {
    if !running {
      return false
    }
    if Motion.TimeScale <= 0.0 {
      converter.Read(toT, work)
      currentT = toT
      running = false
      clearSims()
      notifyOwner(currentT)
      return false
    }
    let elapsed = elapsedAt(now)
    var done = true
    for var i = 0; i < sims.Length; i++ {
      if !simAt(i).Done(elapsed) {
        done = false
      }
    }
    if done {
      currentT = memoize(now)
      running = false
      clearSims()
      memoValid = false
      notifyOwner(currentT)
      return false
    }
    let value = memoize(now)
    notifyOwner(value)
    return true
  }

  private func notifyOwner(value T) {
    if let rebuild = invalidate {
      rebuild()
    }
    notifyChange(value)
  }

  private func notifyChange(value T) {
    guard let changed = onChange else {
      return
    }
    let wasMutating = mutating
    mutating = true
    try {
      changed(value)
    } finally {
      mutating = wasMutating
    }
  }
  private func currentNow() float64 {
    guard let pump = boundPump else {
      return 0.0
    }
    return pump.Now
  }

  private func bindInternal(pump MotionPump) {
    if disposed || boundPump == pump {
      return
    }
    if let owner = handle.registrationPump {
      owner.Deregister(handle)
    }
    boundPump = pump
    if running {
      startTime = pump.Now
      memoValid = false
      pump.Register(handle)
    }
  }

  private func clearSims() {
    for var i = 0; i < sims.Length; i++ {
      sims[i] = nil
    }
  }

  private func elapsedAt(now float64) float64 -> (now - startTime) * Motion.TimeScale

  private func simAt(i int32) Simulation {
    guard let sim = sims[i] else {
      throw InvalidOperationException("running animation is missing a simulation")
    }
    return sim
  }
}
