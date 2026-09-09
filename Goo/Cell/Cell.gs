package Goo

import System
import System.Collections.Generic

/// Defines a stateful Goo component.
public open class Cell {
  private let rebuildGate object
  internal var rebuildSubmission Action[Cell]?
  internal var dirty bool
  internal var directChild Cell?
  internal var mountKey string?
  internal var mountType Type?
  internal var outputKey string?
  internal var building bool
  internal var disposed bool
  internal var anims List[MotionParticle]?
  internal var motionPump MotionPump?
  internal var retainedMotionInvalidation Action[ReconcileEffects]?
  internal var mountedNode Node?
  internal var mountedOwner Cell?
  internal var mountGeneration int64
  private var queuedBy object?

  /// Creates a component.
  public init() {
    rebuildGate = Object()
  }

  /// Builds the component tree.
  /// @returns the root blob for this component
  public open func Build() Blob -> Container {}

  /// Requests a rebuild of this component.
  public func Rebuild() {
    if building {
      throw InvalidOperationException("Cell.Rebuild cannot run during Build")
    }
    var submit Action[Cell]?
    lock rebuildGate {
      if dirty {
        return
      }
      dirty = true
      submit = rebuildSubmission
    }
    if let hook = submit {
      hook(this)
    }
  }

  internal func SetRebuildSubmission(h Action[Cell]?) {
    lock rebuildGate {
      rebuildSubmission = h
    }
  }

  internal func MarkDirtyFromInput() {
    lock rebuildGate {
      dirty = true
    }
  }

  internal func ClearDirty() {
    lock rebuildGate {
      dirty = false
    }
  }

  internal func RestoreDirtyAndSubmit() {
    var submit Action[Cell]?
    lock rebuildGate {
      if disposed {
        return
      }
      dirty = true
      submit = rebuildSubmission
    }
    if let hook = submit {
      hook(this)
    }
  }

  internal func IsDirty() bool {
    lock rebuildGate {
      return dirty
    }
  }

  internal func TryQueue(owner object) int64 {
    lock rebuildGate {
      if disposed || mountedNode == nil || queuedBy == owner {
        return 0
      }
      queuedBy = owner
      return mountGeneration
    }
  }

  internal func TryQueueCanonical(owner object, out queued Cell) int64 {
    lock rebuildGate {
      guard let mounted = disposed ? nil : mountedNode else {
        queued = this
        return 0
      }
      queued = mounted.Fiber ?? this
      if queued == this {
        if queuedBy == owner {
          return 0
        }
        queuedBy = owner
        return mountGeneration
      }
    }
    return queued.TryQueue(owner)
  }

  internal func ClearQueue(owner object) {
    lock rebuildGate {
      if queuedBy == owner {
        queuedBy = nil
      }
    }
  }

  internal func MountedNodeFor(generation int64) Node? {
    lock rebuildGate {
      if disposed || mountGeneration != generation {
        return nil
      }
      return mountedNode
    }
  }

  internal func MountedNode() Node? {
    lock rebuildGate {
      return disposed ? nil : mountedNode
    }
  }

  internal func AttachMount(n Node, owner Cell?) {
    lock rebuildGate {
      if mountedNode == n && mountedOwner == owner {
        return
      }
      mountedNode = n
      mountedOwner = owner
      mountGeneration++
    }
  }

  internal func ClaimMount(declaredType Type) {
    lock rebuildGate {
      if disposed {
        throw InvalidOperationException("Cannot mount a disposed Cell")
      }
      if mountType != nil || mountedNode != nil {
        throw InvalidOperationException("Cell instance is already mounted or being mounted")
      }
      mountType = declaredType
    }
  }

  internal func ReleaseMountClaim() {
    lock rebuildGate {
      if mountedNode == nil {
        mountType = nil
      }
    }
  }

  internal func RefreshDirectMounts(n Node) {
    lock rebuildGate {
      if mountedNode != n {
        mountedNode = n
        mountGeneration++
      }
    }
    if let child = directChild {
      child.RefreshDirectMounts(n)
    }
  }

  internal func Render() Blob {
    building = true
    try {
      return BuildOutput()
    } finally {
      building = false
    }
  }

  internal open func BuildOutput() Blob -> Build()

  internal func HasDirty() bool {
    var selfDirty bool
    lock rebuildGate {
      selfDirty = dirty
    }
    if selfDirty {
      return true
    }
    if let child = directChild {
      return child.HasDirty()
    }
    return false
  }

  internal func DisposeMounted() {
    lock rebuildGate {
      if disposed {
        return
      }
      disposed = true
      motionPump = nil
      retainedMotionInvalidation = nil
      rebuildSubmission = nil
      mountedNode = nil
      mountedOwner = nil
      mountGeneration++
      queuedBy = nil
    }
    var firstError Exception?
    if let list = anims {
      for i in 0 ... list.Count {
        try {
          list[i].Dispose()
        } catch (error Exception) {
          if firstError == nil {
            firstError = error
          }
        }
      }
    }
    if let child = directChild {
      directChild = nil
      try {
        child.DisposeMounted()
      } catch (error Exception) {
        if firstError == nil {
          firstError = error
        }
      }
    }
    if let disposable = this as IDisposable? {
      try {
        disposable.Dispose()
      } catch (error Exception) {
        if firstError == nil {
          firstError = error
        }
      }
    }
    if let error = firstError {
      throw error
    }
  }

  /// Creates a number animated by this component.
  /// @param initial initial value
  /// @returns an animation bridge owned by this component
  public func Animate(initial float64) Anim[float64] ->
  registerAnim[float64](Anim[float64](initial, MotionConverters.Float64, Rebuild, nil))

  /// Creates a number animation that reports values without rebuilding this component.
  /// @param initial initial value
  /// @param onChange receives values from Set and each motion tick
  /// @returns an animation bridge owned by this component
  public func Animate(initial float64, onChange Action[float64]) Anim[float64] ->
  registerCallbackAnim[float64](initial, MotionConverters.Float64, onChange)

  /// Creates a point animated by this component.
  /// @param initial initial value
  /// @returns an animation bridge owned by this component
  public func Animate(initial Point) Anim[Point] ->
  registerAnim[Point](Anim[Point](initial, MotionConverters.Point, Rebuild, nil))

  /// Creates a point animation that reports values without rebuilding this component.
  /// @param initial initial value
  /// @param onChange receives values from Set and each motion tick
  /// @returns an animation bridge owned by this component
  public func Animate(initial Point, onChange Action[Point]) Anim[Point] ->
  registerCallbackAnim[Point](initial, MotionConverters.Point, onChange)

  /// Creates a color animated by this component.
  /// @param initial initial value
  /// @returns an animation bridge owned by this component
  public func Animate(initial Color) Anim[Color] ->
  registerAnim[Color](Anim[Color](initial, MotionConverters.Color, Rebuild, nil))

  /// Creates a color animation that reports values without rebuilding this component.
  /// @param initial initial value
  /// @param onChange receives values from Set and each motion tick
  /// @returns an animation bridge owned by this component
  public func Animate(initial Color, onChange Action[Color]) Anim[Color] ->
  registerCallbackAnim[Color](initial, MotionConverters.Color, onChange)

  /// Creates a fixed-unit length animated by this component.
  /// @param initial pixel or percentage initial value
  /// @returns an animation bridge owned by this component
  public func Animate(initial Length) Anim[Length] ->
  registerAnim[Length](Anim[Length](initial, MotionConverters.ForLength(initial), Rebuild, nil))

  /// Creates a fixed-unit length animation that reports values without rebuilding this component.
  /// @param initial pixel or percentage initial value
  /// @param onChange receives values from Set and each motion tick
  /// @returns an animation bridge owned by this component
  public func Animate(initial Length, onChange Action[Length]) Anim[Length] ->
  registerCallbackAnim[Length](initial, MotionConverters.ForLength(initial), onChange)

  /// Creates a value animated by this component with custom coordinates.
  /// @typeparam T animated value type
  /// @param initial initial value
  /// @param converter maps values to scalar simulation coordinates
  /// @returns an animation bridge owned by this component
  public func Animate[T](initial T, converter MotionConverter[T]) Anim[T] ->
  registerAnim[T](Anim[T](initial, converter, Rebuild, nil))

  /// Creates a custom-coordinate animation that reports values without rebuilding this component.
  /// @typeparam T animated value type
  /// @param initial initial value
  /// @param converter maps values to scalar simulation coordinates
  /// @param onChange receives values from Set and each motion tick
  /// @returns an animation bridge owned by this component
  public func Animate[T](initial T, converter MotionConverter[T], onChange Action[T]) Anim[T] ->
  registerCallbackAnim[T](initial, converter, onChange)

  private func registerCallbackAnim[T](initial T, converter MotionConverter[T], onChange Action[T]) Anim[T] {
    if onChange == nil {
      throw ArgumentNullException("onChange")
    }
    return registerAnim[T](Anim[T](initial, converter, nil, onChange))
  }

  private func registerAnim[T](a Anim[T]) Anim[T] {
    if let list = anims {
      list.Add(a.Handle)
    } else {
      let list = List[MotionParticle]()
      list.Add(a.Handle)
      anims = list
    }
    if !disposed {
      if let pump = motionPump {
        a.Handle.Bind(pump)
      }
    }
    return a
  }
  internal func BindPump(pump MotionPump) {
    if disposed {
      return
    }
    motionPump = pump
    if let list = anims {
      for var i = 0; i < list.Count; i++ {
        list[i].Bind(pump)
      }
    }
    if let child = directChild {
      child.BindPump(pump)
    }
  }

  internal func OwnMotionParticle(p MotionParticle) {
    if let list = anims {
      list.Add(p)
    } else {
      let list = List[MotionParticle]()
      list.Add(p)
      anims = list
    }
    if !disposed {
      if let pump = motionPump {
        p.Bind(pump)
      }
    }
  }

  internal func ReleaseMotionParticle(p MotionParticle) {
    guard let list = anims else { return }
    var index int32 = 0
    while index < list.Count {
      if list[index] == p {
        list.RemoveAt(index)
        return
      }
      index++
    }
  }

  internal func SetRetainedMotionInvalidation(h Action[ReconcileEffects]?) {
    retainedMotionInvalidation = h
  }

  internal func InvalidateRetainedMotion(e ReconcileEffects) {
    if disposed {
      return
    }
    if let hook = retainedMotionInvalidation {
      hook(e)
    }
  }

  shared {
    /// Describes a child component mount created by a factory.
    /// @typeparam TCell declared child component type
    /// @param factory creates a fresh child component when the mount has no retained instance
    /// @param key stable sibling key, or nil for positional identity
    /// @returns a blob that mounts the child component
    public func Mount[TCell Cell](factory Func[TCell], key string?) Blob {
      if factory == nil { throw ArgumentNullException("factory") }
      return CellElement{
        Key: key,
        CellType: typeof(TCell),
        Factory: factory as Func[Cell]?,
      }
    }

    /// Describes a child component mount.
    /// @typeparam TCell child component type
    /// @param key stable sibling key, or nil for positional identity
    /// @returns a blob that mounts the child component
    public func Mount[TCell Cell init()](key string?) Blob ->
    CellElement{
      Key: key,
      CellType: typeof(TCell),
      Factory: () -> TCell(),
    }

    /// Describes a child component mount with an immutable input snapshot.
    /// @typeparam TInput component input type
    /// @typeparam TCell child component type
    /// @param key stable sibling key, or nil for positional identity
    /// @param input immutable input snapshot
    /// @returns a blob that mounts the child component
    public func Mount[TInput any, TCell Cell[TInput]init()](key string?, input TInput) Blob ->
    CellInputElement[TInput, TCell]{
      Key: key,
      CellType: typeof(TCell),
      Input: input,
    }

    /// Describes a child component mount.
    /// @typeparam TCell child component type
    /// @param key stable sibling key, or nil for positional identity
    /// @param configure configuration applied during each parent diff; prefer stable named or cached delegates
    /// @returns a blob that mounts the child component
    public func Mount[TCell Cell init()](key string?, configure Action[TCell]?) Blob ->
    MountSeeded[TCell](key, nil, configure)

    /// Describes a child component mount with one-time initialization.
    /// @typeparam TCell child component type
    /// @param key stable sibling key, or nil for positional identity
    /// @param seed initialization applied only when the component mounts
    /// @param configure configuration applied during each parent diff; prefer stable named or cached delegates
    /// @returns a blob that mounts the child component
    public func MountSeeded[TCell Cell init()](key string?, seed Action[TCell]?,
      configure Action[TCell]?) Blob ->
    CellElement{
      Key: key,
      CellType: typeof(TCell),
      Factory: () -> TCell(),
      Seed: wrapAction[TCell](seed),
      Configure: wrapAction[TCell](configure),
    }

    internal func wrapAction[TCell Cell](action Action[TCell]?) Action[Cell]? {
      guard let typed = action else { return nil }
      return (c Cell) -> {
        if c is TCell {
          typed(c)
        }
      }
    }
  }

}
