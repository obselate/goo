package Goo

import System
import System.Numerics
import System.Runtime.CompilerServices
import System.Diagnostics

public sealed class ShaderEffect {
  private const MaximumBackdropOutset float32 = 256.0F
  private const ParameterCount int32 = 8
  private const DataInputCount int32 = 4
  private let gate object
  private let program ShaderEffectProgram
  private let parameters []Vector4
  private let dataSources []ShaderEffectData?
  private let dataChanged Action
  private let changedObservers ShaderEffectObservers
  private let programId uint64
  private let samplesBackdrop bool
  private let backdropOutset float32
  private var version uint64
  private var playing bool
  private var elapsedSeconds float64
  private var playbackTimestamp int64

  public init(program ShaderEffectProgram, samplesBackdrop bool = false,
    backdropOutset float32 = 0.0F) {
      if Object.ReferenceEquals(program, nil) { throw ArgumentNullException("program") }
      if !finite(backdropOutset) || backdropOutset < 0.0F
        || backdropOutset > MaximumBackdropOutset{
          throw ArgumentOutOfRangeException("backdropOutset")
        }
      if !samplesBackdrop && backdropOutset != 0.0F {
        throw ArgumentException("Backdrop outset requires backdrop sampling", "backdropOutset")
      }
      gate = Object()
      changedObservers = ShaderEffectObservers()
      this.program = program
      parameters = [ParameterCount]Vector4
      dataSources = [DataInputCount]ShaderEffectData?
      dataChanged = () -> { OnDataChanged() }
      programId = program.ProgramId
      this.samplesBackdrop = samplesBackdrop
      this.backdropOutset = backdropOutset
      version = 1uL
    }

  public func SetParameter(slot int32, value Vector4) bool {
    if slot < 0 || slot >= ParameterCount {
      throw ArgumentOutOfRangeException("slot")
    }
    if !finite(value.X) || !finite(value.Y) || !finite(value.Z) || !finite(value.W) {
      throw ArgumentOutOfRangeException("value")
    }
    var changed bool
    var callbacks([]Action)?
    lock gate {
      if parameters[slot] != value {
        parameters[slot] = value
        AdvanceVersion()
        changed = true
        callbacks = changedObservers.Snapshot()
      }
    }
    changedObservers.Notify(callbacks)
    return changed
  }

  /// Binds one retained data source to a fixed shader input slot.
  /// @param slot The data slot from zero through three.
  /// @param value The retained source, or nil to unbind the slot.
  /// @returns True when the binding changed.
  public func SetData(slot int32, value ShaderEffectData?) bool {
    if slot < 0 || slot >= DataInputCount {
      throw ArgumentOutOfRangeException("slot")
    }
    var callbacks([]Action)?
    lock gate {
      let previous = dataSources[slot]
      if Object.ReferenceEquals(previous, value) { return false }
      let previousUsedElsewhere = ContainsDataSource(previous, slot)
      let valueAlreadyUsed = ContainsDataSource(value, slot)
      dataSources[slot] = value
      if let previousSource = previous {
        if !previousUsedElsewhere { previousSource.RemoveChanged(dataChanged) }
      }
      if let nextSource = value {
        if !valueAlreadyUsed { nextSource.AddChanged(dataChanged) }
      }
      AdvanceVersion()
      callbacks = changedObservers.Snapshot()
    }
    changedObservers.Notify(callbacks)
    return true
  }

  /// Gets or sets whether Goo advances ElapsedSeconds and renders attached effects continuously.
  /// Playback is disabled by default.
  public prop Playing bool{
    get {
      lock gate { return playing }
    }
    set(v) {
      var callbacks([]Action)?
      lock gate {
        if playing == v { return }
        if playing {
          elapsedSeconds = elapsedAt(Stopwatch.GetTimestamp())
        }
        playing = v
        playbackTimestamp = v ? Stopwatch.GetTimestamp() : 0L
        callbacks = changedObservers.Snapshot()
      }
      changedObservers.Notify(callbacks)
    }
  }

  /// Gets or sets the elapsed playback position in seconds.
  public prop ElapsedSeconds float64{
    get {
      lock gate { return elapsedAt(Stopwatch.GetTimestamp()) }
    }
    set(v) {
      if Double.IsNaN(v) || Double.IsInfinity(v) || !finite(float32(v)) || v < 0.0 {
        throw ArgumentOutOfRangeException("value")
      }
      var callbacks([]Action)?
      lock gate {
        if elapsedAt(Stopwatch.GetTimestamp()) == v { return }
        elapsedSeconds = v
        playbackTimestamp = playing ? Stopwatch.GetTimestamp() : 0L
        callbacks = changedObservers.Snapshot()
      }
      changedObservers.Notify(callbacks)
    }
  }

  internal func AddChanged(callback Action) {
    lock gate { changedObservers.Add(callback) }
  }

  internal func RemoveChanged(callback Action) {
    lock gate { changedObservers.Remove(callback) }
  }

  internal prop ProgramId uint64{ get -> programId }
  internal prop Program ShaderEffectProgram{ get -> program }
  internal prop SamplesBackdrop bool{ get -> samplesBackdrop }
  internal prop BackdropOutset float32{ get -> backdropOutset }

  internal prop PlaybackActive bool{
    get { lock gate { return playing } }
  }

  internal func CopySnapshot(out snapshot ShaderEffectSnapshot) {
    lock gate {
      snapshot = ShaderEffectSnapshot{
        Program: this,
        ProgramId: programId,
        Version: version,
        SamplesBackdrop: SamplesBackdrop,
        BackdropOutset: BackdropOutset,
        ElapsedSeconds: float32(elapsedAt(Stopwatch.GetTimestamp())),
        Parameter0: parameters[0],
        Parameter1: parameters[1],
        Parameter2: parameters[2],
        Parameter3: parameters[3],
        Parameter4: parameters[4],
        Parameter5: parameters[5],
        Parameter6: parameters[6],
        Parameter7: parameters[7],
        Data0: CaptureData(0),
        Data1: CaptureData(1),
        Data2: CaptureData(2),
        Data3: CaptureData(3),
      }
    }
  }

  private func OnDataChanged() {
    var callbacks([]Action)?
    lock gate {
      AdvanceVersion()
      callbacks = changedObservers.Snapshot()
    }
    changedObservers.Notify(callbacks)
  }

  private func ContainsDataSource(value ShaderEffectData?, exceptSlot int32) bool {
    if value == nil { return false }
    var index int32
    while index < dataSources.Length {
      if index != exceptSlot && Object.ReferenceEquals(dataSources[index], value) {
        return true
      }
      index++
    }
    return false
  }

  private func CaptureData(slot int32) ShaderEffectDataCapture {
    if let source = dataSources[slot] { return source.Capture() }
    return ShaderEffectDataCapture{}
  }

  private func AdvanceVersion() {
    if version == UInt64.MaxValue {
      version = 1uL
    } else {
      version++
    }
  }

  private func elapsedAt(timestamp int64) float64 {
    if !playing { return elapsedSeconds }
    return elapsedSeconds + float64(timestamp - playbackTimestamp) / float64(Stopwatch.Frequency)
  }

  private func finite(value float32) bool -> !Single.IsNaN(value) && !Single.IsInfinity(value)

}

internal data struct ShaderEffectSnapshot {
  internal var Program ShaderEffect?
  internal var ProgramId uint64
  internal var Version uint64
  internal var SamplesBackdrop bool
  internal var BackdropOutset float32
  internal var ElapsedSeconds float32
  internal var Parameter0 Vector4
  internal var Parameter1 Vector4
  internal var Parameter2 Vector4
  internal var Parameter3 Vector4
  internal var Parameter4 Vector4
  internal var Parameter5 Vector4
  internal var Parameter6 Vector4
  internal var Parameter7 Vector4
  internal var Data0 ShaderEffectDataCapture
  internal var Data1 ShaderEffectDataCapture
  internal var Data2 ShaderEffectDataCapture
  internal var Data3 ShaderEffectDataCapture
}

internal class ShaderEffectStyles {
  shared {
    private var values ConditionalWeakTable[Node, ShaderEffectBinding]?

    internal func Get(n Node) ShaderEffect? {
      if let table = values {
        if table.TryGetValue(n, out var value) { return value.Effect }
      }
      return nil
    }

    internal func Set(n Node, effect ShaderEffect?, invalidated Action?) {
      let current = state(n)
      if let value = current {
        if Object.ReferenceEquals(value.Effect, effect) {
          value.Invalidated = invalidated
          return
        }
        values?.Remove(n)
        value.Dispose()
      }
      if effect == nil { return }
      if values == nil { values = ConditionalWeakTable[Node, ShaderEffectBinding]() }
      let binding = ShaderEffectBinding(n, effect, invalidated)
      values?.Add(n, binding)
    }

    internal func Dispose(n Node) {
      guard let value = state(n) else { return }
      values?.Remove(n)
      value.Dispose()
    }

    internal func TreeHasPlaying(n Node) bool {
      if let value = state(n) {
        if value.Effect.PlaybackActive { return true }
      }
      var index int32
      while index < n.Children.Count {
        if TreeHasPlaying(n.Children[index]) { return true }
        index++
      }
      return false
    }

    private func state(n Node) ShaderEffectBinding? {
      if let table = values {
        if table.TryGetValue(n, out var value) { return value }
      }
      return nil
    }
  }
}

internal sealed class ShaderEffectBinding : IDisposable {
  internal let Effect ShaderEffect
  internal var Invalidated Action?
  private let node Node
  private let changed Action
  private var disposed bool

  internal init(n Node, effect ShaderEffect, invalidated Action?) {
    node = n
    Effect = effect
    Invalidated = invalidated
    changed = () -> {
      if !disposed && !node.Retired { Invalidated?.Invoke() }
    }
    effect.AddChanged(changed)
  }

  public func Dispose() {
    if disposed { return }
    disposed = true
    try { Effect.RemoveChanged(changed) } catch (error Exception) { }
    Invalidated = nil
  }
}
