package Goo

import System
import System.Collections.Generic
import System.Runtime.CompilerServices

internal func PackVulkanTextGlyphKey(glyphId uint32, ppem int32, renderMode uint32) uint64 {
  let clampedPpem = if ppem <= 0 { 0uL } else if ppem > 0xFFFFFF { 0xFFFFFFuL } else { uint64(uint32(ppem)) }
  return uint64(glyphId) | (clampedPpem << 32) | (uint64(renderMode & 0xFFu) << 56)
}

internal struct VulkanTextAtlasGlyphEntryRef {
  internal var ProviderIndex int32
  internal var PackedKey uint64
}

internal sealed class VulkanTextProviderGlyphTable {
  internal let ProviderIndex int32
  internal let Glyphs Dictionary[uint64, VulkanTextAtlasGlyph]

  internal init(providerIndex int32) {
    ProviderIndex = providerIndex
    Glyphs = Dictionary[uint64, VulkanTextAtlasGlyph]()
  }
}

internal sealed class VulkanTextSceneAtlasState {
  private const InitialByteCapacity int32 = 4096
  private const InitialKeyCapacity int32 = 64
  internal var Atlas VulkanTextAtlas
  internal var Identity ResourceId
  internal var Bytes []uint8
  internal var Keys []VulkanTextAtlasGlyphEntryRef
  internal var NextByteOffset uint32
  internal var PublishedBytePrefix uint32
  internal var QueuedBytePrefix uint32
  internal var QueuedUploadSequence uint64
  internal var UploadQueued bool
  internal var KeyCount int32
  internal var UnusedCompiles int32

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
    Keys = [keyCapacity]VulkanTextAtlasGlyphEntryRef
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
    UnusedCompiles = 0
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
    let next = [capacity]VulkanTextAtlasGlyphEntryRef
    Array.Copy(Keys, next, KeyCount)
    Keys = next
  }

  internal func AddKey(providerIndex int32, packedKey uint64) {
    EnsureKeyCapacity(KeyCount + 1)
    Keys[KeyCount] = VulkanTextAtlasGlyphEntryRef{
      ProviderIndex: providerIndex,
      PackedKey: packedKey,
    }
    KeyCount = KeyCount + 1
  }
}

internal sealed class VulkanTextAtlasGlyph {
  internal prop AtlasId ResourceId{ get; init; }
  internal prop AtlasSlotIndex int32{ get; init; }
  internal prop AtlasGeneration uint64{ get; init; }
  internal prop ByteOffset uint32{ get; init; }
  internal prop ByteLength uint32{ get; init; }
  internal prop EffectByteOffset uint32{ get; init; }
  internal prop EffectByteLength uint32{ get; init; }
  internal prop Scale int32{ get; init; }
  internal prop Extents VulkanTextGlyphExtents{ get; init; }
  internal prop EffectExtents VulkanTextGlyphExtents{ get; init; }
  internal prop RenderMode uint32{ get; init; }
  internal prop ColorPlacement VulkanColorGlyphPlacement{ get; init; }

  internal init() {
    AtlasSlotIndex = -1
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
