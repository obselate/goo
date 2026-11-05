package Goo

import System

internal sealed class TypefaceResource : IDisposable {
  private let font VulkanTextFont
  private let family string
  private let sourceId uint64
  private let sourceGeneration uint64
  private var references int32 = 1
  private var disposed bool

  internal prop Provider VulkanTextProvider{ get -> font }
  internal prop Family string{ get -> family }
  internal prop HeapByteSize int64{ get -> font.HeapByteSize }
  internal prop IsDisposed bool{ get { lock (this) { return disposed } } }
  internal prop IsRegistered bool{ get -> sourceId != 0uL }

  internal init(family string, bytes FontData, faceIndex uint32,
    variations([]VulkanTextVariation)?, sourceId uint64, sourceGeneration uint64, systemWeight int32? = nil) {
      if family == nil { throw ArgumentNullException("family") }
      if bytes.Length == 0 { throw ArgumentException("Font bytes are empty", "bytes") }
      this.family = family
      this.sourceId = sourceId
      this.sourceGeneration = sourceGeneration
      font = VulkanTextFont(bytes, 1u, faceIndex, variations, family, systemWeight)
    }

  internal func Profile(recorder FrameRecorder) {
    lock (this) { if !disposed { font.Profile(recorder, true) } }
  }

  internal func Lease() TypefaceLease {
    guard let lease = TryLease() else { throw ObjectDisposedException("TypefaceResource") }
    return lease
  }

  internal func TryLease() TypefaceLease? {
    lock (this) {
      if disposed { return nil }
      references++
    }
    return TypefaceLease(this)
  }

  internal func Release() {
    var last = false
    lock (this) {
      if disposed { return }
      references--
      if references == 0 {
        disposed = true
        last = true
      }
    }
    if last { font.Dispose() }
  }

  public func Dispose() {
    Release()
  }
}
