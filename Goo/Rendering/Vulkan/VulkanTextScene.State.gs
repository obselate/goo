package Goo

import System
import System.Collections.Generic
import System.Runtime.CompilerServices

internal struct VulkanTextAtlasGlyphKey : IEquatable[VulkanTextAtlasGlyphKey] {
  internal prop Family string{ get; init; }
  internal prop Provider VulkanTextProvider{ get; init; }
  internal prop GlyphId uint32{ get; init; }

  internal init(family string, provider VulkanTextProvider, glyphId uint32) {
    Family = family
    Provider = provider
    GlyphId = glyphId
  }

  public func Equals(other VulkanTextAtlasGlyphKey) bool -> String.Equals(Family, other.Family, StringComparison.Ordinal)
    && Object.ReferenceEquals(Provider, other.Provider)
    && GlyphId == other.GlyphId

  public override func Equals(value object?) bool -> switch value {
    case other is VulkanTextAtlasGlyphKey: Equals(other)
    case _: false
  }

  public override func GetHashCode() int32 {
    let familyHash = Family == nil ? 0 : StringComparer.Ordinal.GetHashCode(Family)
    return HashCode.Combine(familyHash,
      RuntimeHelpers.GetHashCode(Provider), int32(GlyphId))
  }
}

internal sealed class VulkanTextSceneAtlasState {
  private const InitialByteCapacity int32 = 4096
  private const InitialKeyCapacity int32 = 64
  internal var Atlas VulkanTextAtlas
  internal var Identity ResourceId
  internal var Bytes []uint8
  internal var Keys []VulkanTextAtlasGlyphKey
  internal var NextByteOffset uint32
  internal var PublishedBytePrefix uint32
  internal var QueuedBytePrefix uint32
  internal var QueuedUploadSequence uint64
  internal var UploadQueued bool
  internal var KeyCount int32

  internal init(nativeAtlas VulkanTextAtlas, identity ResourceId) {
    Atlas = nativeAtlas
    Identity = identity
    if nativeAtlas.ByteSize > uint64(Int32.MaxValue) {
      throw ArgumentOutOfRangeException("nativeAtlas")
    }
    var byteCapacity = InitialByteCapacity
    if nativeAtlas.ByteSize < uint64(byteCapacity) {
      byteCapacity = int32(nativeAtlas.ByteSize)
    }
    Bytes = [byteCapacity]uint8
    var keyCapacity = InitialKeyCapacity
    let maxKeyCapacity = int32(nativeAtlas.ByteSize / 8uL)
    if maxKeyCapacity < keyCapacity {
      keyCapacity = maxKeyCapacity
    }
    Keys = [keyCapacity]VulkanTextAtlasGlyphKey
  }

  internal func Reset(nativeAtlas VulkanTextAtlas, identity ResourceId) {
    Atlas = nativeAtlas
    Identity = identity
    NextByteOffset = 0u
    PublishedBytePrefix = 0u
    QueuedBytePrefix = 0u
    QueuedUploadSequence = 0uL
    UploadQueued = false
    KeyCount = 0
  }

  internal func EnsureByteCapacity(required uint32) {
    if required <= uint32(Bytes.Length) {
      return
    }
    if uint64(required) > Atlas.ByteSize || required > uint32(Int32.MaxValue) {
      throw InvalidOperationException("Vulkan text atlas byte range exceeds managed array limits")
    }
    var capacity = Bytes.Length
    if capacity == 0 {
      capacity = InitialByteCapacity
    }
    while uint64(capacity) < uint64(required) {
      if capacity > Int32.MaxValue / 2 {
        capacity = int32(required)
      } else {
        capacity = capacity * 2
      }
    }
    if uint64(capacity) > Atlas.ByteSize {
      capacity = int32(Atlas.ByteSize)
    }
    let next = [capacity]uint8
    Array.Copy(Bytes, next, int32(NextByteOffset))
    Bytes = next
  }

  internal func EnsureKeyCapacity(required int32) {
    if required <= Keys.Length {
      return
    }
    let maxCapacity = int32(Atlas.ByteSize / 8uL)
    if required > maxCapacity {
      throw InvalidOperationException("Vulkan text atlas glyph key capacity is exhausted")
    }
    var capacity = Keys.Length
    if capacity == 0 {
      capacity = InitialKeyCapacity
    }
    while capacity < required {
      if capacity > Int32.MaxValue / 2 {
        capacity = required
      } else {
        capacity = capacity * 2
      }
    }
    if capacity > maxCapacity {
      capacity = maxCapacity
    }
    let next = [capacity]VulkanTextAtlasGlyphKey
    Array.Copy(Keys, next, KeyCount)
    Keys = next
  }

  internal func AddKey(key VulkanTextAtlasGlyphKey) {
    EnsureKeyCapacity(KeyCount + 1)
    Keys[KeyCount] = key
    KeyCount = KeyCount + 1
  }
}

internal sealed class VulkanTextAtlasGlyph {
  internal prop AtlasId ResourceId{ get; init; }
  internal prop ByteOffset uint32{ get; init; }
  internal prop ByteLength uint32{ get; init; }
  internal prop EffectByteOffset uint32{ get; init; }
  internal prop EffectByteLength uint32{ get; init; }
  internal prop Scale int32{ get; init; }
  internal prop Extents VulkanTextGlyphExtents{ get; init; }
  internal prop EffectExtents VulkanTextGlyphExtents{ get; init; }
  internal prop RenderMode uint32{ get; init; }

  internal init() {
  }
}

internal sealed class VulkanTextNodeSegmentCache {
  internal var Segments []VulkanRetainedTextSegment?
  internal var Cursor int32

  internal init() {
    Segments = [4]VulkanRetainedTextSegment?
  }

  internal func BeginBuild() {
    Cursor = 0
  }

  internal func EnsureCapacity(required int32) {
    Segments = GrowArray(Segments, Segments.Length, required, 1)
  }
}

