package Goo

import System
import System.Runtime.InteropServices
import System.Threading

/// Owns one retained byte sequence for ShaderEffect data inputs.
public sealed class ShaderEffectData : IDisposable {
  private const MaximumBytes int32 = 16777216
  private let gate object
  private let identity uint64
  private var current ShaderEffectDataGeneration?
  private let changedObservers ShaderEffectObservers
  private var version uint64
  private var disposed bool

  shared {
    private var nextIdentity int64

    /// Creates a source that takes ownership of bytes without copying them.
    /// @param bytes The non-empty byte sequence transferred to Goo.
    /// @param released Called once Goo no longer reads the transferred array.
    /// @returns The retained data source.
    public func Transfer(bytes []uint8, released Action) ShaderEffectData {
      if Object.ReferenceEquals(released, nil) { throw ArgumentNullException("released") }
      validate(bytes)
      return ShaderEffectData(bytes, released)
    }

    private func allocateIdentity() uint64 {
      let value = Interlocked.Increment(ref nextIdentity)
      if value <= 0L { throw OverflowException("Shader effect data identity overflow") }
      return uint64(value)
    }

    private func validate(bytes []uint8) {
      if Object.ReferenceEquals(bytes, nil) { throw ArgumentNullException("bytes") }
      if bytes.Length <= 0 || bytes.Length > MaximumBytes {
        throw ArgumentOutOfRangeException("bytes")
      }
    }
  }

  /// Copies bytes into the initial retained publication.
  /// @param bytes The non-empty byte sequence to copy.
  public init(bytes []uint8) {
    validate(bytes)
    gate = Object()
    identity = allocateIdentity()
    changedObservers = ShaderEffectObservers()
    current = ShaderEffectDataGeneration(bytes, true, nil)
    version = 1uL
  }

  private init(bytes []uint8, released Action) {
    gate = Object()
    identity = allocateIdentity()
    changedObservers = ShaderEffectObservers()
    current = ShaderEffectDataGeneration(bytes, false, released)
    version = 1uL
  }

  /// Gets the current publication byte length, or zero after disposal.
  public prop ByteLength int32{
    get {
      lock gate { return current?.ByteLength ?? 0 }
    }
  }

  /// Gets the monotonically increasing publication version.
  public prop ContentVersion uint64{
    get {
      lock gate { return version }
    }
  }

  /// Gets whether this source has released its current publication.
  public prop IsDisposed bool{
    get {
      lock gate { return disposed }
    }
  }

  /// Copies and publishes a complete replacement byte sequence.
  /// @param bytes The non-empty replacement byte sequence.
  public func Publish(bytes []uint8) {
    replace(bytes, true, nil)
  }

  /// Copies unmanaged values into a complete replacement publication using their native memory layout.
  /// The caller must match the shader's element layout and alignment.
  /// @typeparam T The unmanaged element type copied into the publication.
  /// @param values The non-empty replacement values.
  public func Publish[T unmanaged](values ReadOnlySpan[T]) {
    let bytes = MemoryMarshal.AsBytes[T](values)
    if bytes.Length <= 0 || bytes.Length > MaximumBytes {
      throw ArgumentOutOfRangeException("values")
    }
    replace(bytes.ToArray(), false, nil)
  }

  /// Publishes a complete replacement by taking ownership of its array.
  /// @param bytes The non-empty replacement byte sequence transferred to Goo.
  /// @param released Called once Goo no longer reads the transferred array.
  public func PublishTransferred(bytes []uint8, released Action) {
    if Object.ReferenceEquals(released, nil) { throw ArgumentNullException("released") }
    replace(bytes, false, released)
  }

  /// Releases the current owner reference. Captured publications remain valid until released.
  public func Dispose() {
    var previous ShaderEffectDataGeneration?
    var callbacks([]Action)?
    lock gate {
      if disposed { return }
      disposed = true
      previous = current
      current = nil
      callbacks = changedObservers.Clear()
    }
    previous?.Release()
    changedObservers.Notify(callbacks)
  }

  internal prop Identity uint64{ get -> identity }

  internal func Capture() ShaderEffectDataCapture {
    lock gate {
      if let generation = current {
        if generation.Retain() {
          return ShaderEffectDataCapture{
            Generation: generation,
            Identity: identity,
            Version: version,
            ByteLength: generation.ByteLength,
          }
        }
      }
      return ShaderEffectDataCapture{ Identity: identity, Version: version }
    }
  }

  internal func AddChanged(callback Action) {
    lock gate { changedObservers.Add(callback) }
  }

  internal func RemoveChanged(callback Action) {
    lock gate { changedObservers.Remove(callback) }
  }

  private func replace(bytes []uint8, copy bool, released Action?) {
    validate(bytes)
    var previous ShaderEffectDataGeneration?
    var callbacks([]Action)?
    lock gate {
      if disposed { throw ObjectDisposedException("ShaderEffectData") }
      if version == UInt64.MaxValue {
        throw OverflowException("Shader effect data version overflow")
      }
      let replacement = ShaderEffectDataGeneration(bytes, copy, released)
      previous = current
      current = replacement
      version++
      callbacks = changedObservers.Snapshot()
    }
    previous?.Release()
    changedObservers.Notify(callbacks)
  }
}

internal sealed class ShaderEffectObservers {
  private let gate object
  private var callbacks([]Action)?

  internal init() {
    gate = Object()
  }

  internal func Add(callback Action) {
    lock gate {
      if let current = callbacks {
        let expanded = [current.Length + 1]Action
        Array.Copy(current, expanded, current.Length)
        expanded[current.Length] = callback
        callbacks = expanded
      } else {
        callbacks = []Action{ callback }
      }
    }
  }

  internal func Remove(callback Action) {
    lock gate {
      guard let current = callbacks else { return }
      var removeIndex = -1
      var index int32
      while index < current.Length {
        if Object.ReferenceEquals(current[index], callback) { removeIndex = index }
        index++
      }
      if removeIndex < 0 { return }
      if current.Length == 1 {
        callbacks = nil
        return
      }
      let reduced = [current.Length - 1]Action
      index = 0
      var output int32
      while index < current.Length {
        if index != removeIndex {
          reduced[output] = current[index]
          output++
        }
        index++
      }
      callbacks = reduced
    }
  }

  internal func Snapshot()([]Action)? {
    lock gate { return callbacks }
  }

  internal func Clear()([]Action)? {
    lock gate {
      let current = callbacks
      callbacks = nil
      return current
    }
  }

  internal func Notify(callbacks([]Action)?) {
    if let current = callbacks {
      for callback in current { callback.Invoke() }
    }
  }
}

internal sealed class ShaderEffectDataGeneration {
  private let gate object
  private let released Action?
  private var bytes([]uint8)?
  private var references int32

  internal init(source []uint8, copy bool, released Action?) {
    gate = Object()
    if copy {
      let owned = [source.Length]uint8
      Array.Copy(source, owned, source.Length)
      bytes = owned
    } else {
      bytes = source
    }
    this.released = released
    references = 1
  }

  internal prop ByteLength int32{
    get {
      lock gate { return bytes?.Length ?? 0 }
    }
  }

  internal func Retain() bool {
    lock gate {
      if bytes == nil || references <= 0 { return false }
      references++
      return true
    }
  }

  internal func CopyTo(destination []uint8, offset int32) {
    lock gate {
      guard let source = bytes else {
        throw ObjectDisposedException("ShaderEffectDataGeneration")
      }
      Array.Copy(source, 0, destination, offset, source.Length)
    }
  }

  internal func Release() {
    var callback Action?
    lock gate {
      if references <= 0 { return }
      references--
      if references == 0 {
        bytes = nil
        callback = released
      }
    }
    if let currentCallback = callback {
      try { currentCallback.Invoke() } catch (error Exception) { }
    }
  }
}

internal data struct ShaderEffectDataCapture {
  internal var Generation ShaderEffectDataGeneration?
  internal var Identity uint64
  internal var Version uint64
  internal var ByteLength int32

  internal func CopyTo(destination []uint8, offset int32) {
    Generation?.CopyTo(destination, offset)
  }

  internal func Release() {
    Generation?.Release()
  }
}
