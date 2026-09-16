package Goo

import System
import System.Collections.Generic
import System.Runtime.CompilerServices

internal unsafe sealed partial class VulkanTextScene {
  private func GetGlyph(run ShapedRun, glyphId uint32) VulkanTextAtlasGlyph? {
    let key = VulkanTextAtlasGlyphKey(run.Family, run.Provider, glyphId)
    var existingFound = false
    if glyphs.TryGetValue(key, out var existing) {
      let existingIndex = atlasSet.FindIndex(existing.AtlasId)
      if existingIndex >= 0 {
        return existing
      }
      existingFound = true
    }
    if capacityExhausted {
      throw InvalidOperationException("Vulkan text atlas capacity is exhausted")
    }
    var renderMode uint32 = 2u
    var providerResult VulkanTextProviderResult
    var effectResult VulkanTextProviderResult
    var effectExtents VulkanTextGlyphExtents
    let hasColorGlyph = (run.Provider.HasColorPaint() && run.Provider.GlyphHasColorPaint(glyphId))
      || (run.Provider.HasColorLayers() && run.Provider.GlyphHasColorLayers(glyphId))
    if hasColorGlyph {
      providerResult = run.Provider.EncodePaintGlyphInto(glyphId, 0u, glyphWorkspace)
      if providerResult.Status == VulkanTextProviderAbi.Success {
        renderMode = 3u
        effectResult = run.Provider.EncodeGlyphInto(glyphId, effectGlyphWorkspace)
        if effectResult.AbiVersion != VulkanTextProviderAbi.Version {
          throw InvalidOperationException("Vulkan text provider ABI version is invalid")
        }
        if effectResult.Status == VulkanTextProviderAbi.CapacityExceeded {
          throw InvalidOperationException("Vulkan text color effect glyph exceeds workspace capacity")
        }
        if effectResult.Status == VulkanTextProviderAbi.Success {
          if effectResult.Count < 0 || (effectResult.Count & 7) != 0 {
            throw InvalidOperationException("Vulkan text color effect encoding is not texel aligned")
          }
          effectExtents = effectGlyphWorkspace.GlyphExtents
        }
      } else if providerResult.Status == VulkanTextProviderAbi.CapacityExceeded {
        throw InvalidOperationException("Vulkan text color glyph exceeds workspace capacity")
      } else {
        colorGlyphFallback = true
        providerResult = run.Provider.EncodeGlyphInto(glyphId, glyphWorkspace)
      }
    } else {
      providerResult = run.Provider.EncodeGlyphInto(glyphId, glyphWorkspace)
    }
    if providerResult.AbiVersion != VulkanTextProviderAbi.Version {
      throw InvalidOperationException("Vulkan text provider ABI version is invalid")
    }
    if providerResult.Status == VulkanTextProviderAbi.CapacityExceeded {
      throw InvalidOperationException("Vulkan text glyph exceeds workspace capacity")
    }
    if providerResult.Status != VulkanTextProviderAbi.Success {
      throw InvalidOperationException("Vulkan text glyph encoding failed")
    }
    if providerResult.Count < 0 || (providerResult.Count & 7) != 0 {
      throw InvalidOperationException("Vulkan text glyph encoding is not texel aligned")
    }
    var effectByteCount uint32 = 0u
    if renderMode == 3u && effectResult.Status == VulkanTextProviderAbi.Success {
      effectByteCount = uint32(effectResult.Count)
    }
    let totalByteCount = uint64(providerResult.Count) + uint64(effectByteCount)
    var state = CurrentState()
    if uint64(state.NextByteOffset) + totalByteCount > state.Atlas.ByteSize
      || state.KeyCount >= int32(state.Atlas.ByteSize / 8uL) {
        var createdIndex int32 = -1
        if atlasSet.CanCreateAtlas {
          createdIndex = atlasSet.CreateAtlas()
        }
        if createdIndex < 0 {
          if !RecycleAtlas() {
            capacityExhausted = true
            throw InvalidOperationException("Vulkan text atlas capacity is exhausted")
          }
          state = CurrentState()
        } else {
          EnsureAtlasStates()
          state = states[createdIndex]!!
        }
        if totalByteCount > state.Atlas.ByteSize {
          capacityExhausted = true
          throw InvalidOperationException("Vulkan text glyph exceeds atlas capacity")
        }
      }
    let byteOffset = state.NextByteOffset
    if byteOffset > uint32(Int32.MaxValue) {
      throw InvalidOperationException("Vulkan text atlas byte offset exceeds managed array limits")
    }
    let effectByteOffset = byteOffset + uint32(providerResult.Count)
    let requiredByteCount = effectByteOffset + effectByteCount
    state.EnsureByteCapacity(requiredByteCount)
    Array.Copy(glyphWorkspace.ByteBuffer, 0, state.Bytes, int32(byteOffset), providerResult.Count)
    if effectByteCount != 0u {
      Array.Copy(effectGlyphWorkspace.ByteBuffer, 0, state.Bytes,
        int32(effectByteOffset), int32(effectByteCount))
    }
    let result = VulkanTextAtlasGlyph{
      AtlasId: state.Identity,
      ByteOffset: byteOffset,
      ByteLength: uint32(providerResult.Count),
      EffectByteOffset: if renderMode == 3u {
        if effectByteCount == 0u { 0u } else { effectByteOffset }
      } else { byteOffset },
      EffectByteLength: if renderMode == 3u {
        effectByteCount
      } else { uint32(providerResult.Count) },
      Scale: glyphWorkspace.GlyphScale,
      Extents: glyphWorkspace.GlyphExtents,
      EffectExtents: if renderMode != 3u || effectByteCount == 0u {
        glyphWorkspace.GlyphExtents
      } else { effectExtents },
      RenderMode: renderMode,
    }
    if existingFound {
      glyphs[key] = result
    } else {
      glyphs.Add(key, result)
    }
    state.AddKey(key)
    state.NextByteOffset = requiredByteCount
    return result
  }

  private func CachedGlyph(run ShapedRun, glyphId uint32) VulkanTextAtlasGlyph? {
    let key = VulkanTextAtlasGlyphKey(run.Family, run.Provider, glyphId)
    if glyphs.TryGetValue(key, out var value)
      && atlasSet.FindIndex(value.AtlasId) >= 0 {
        return value
      }
    return nil
  }

  private func CanRender(glyph VulkanTextAtlasGlyph) bool {
    let glyphEnd = uint64(glyph.ByteOffset) + uint64(glyph.ByteLength)
    return IsAtlasRangeResident(glyph.AtlasId, glyphEnd)
  }
  private func ProtectSegmentAtlases(segment VulkanRetainedTextSegment) bool {
    if segment.GlyphCount <= 0
      || segment.GlyphCount != segment.RecordCount
      || segment.GlyphResourceCount != segment.GlyphCount
      || segment.RunCount <= 0
      || segment.RunCount > segment.Runs.Length
      || segment.GlyphCount > segment.GlyphResources.Length
      || segment.GlyphCount > segment.GlyphAtlasTexelOffsets.Length
      || segment.GlyphCount > segment.GlyphAtlasTexelCounts.Length
      || segment.GlyphCount > segment.GlyphEffectAtlasTexelOffsets.Length
      || segment.GlyphCount > segment.GlyphEffectAtlasTexelCounts.Length{
        return false
      }
    var glyphBase int32 = 0
    var runIndex int32 = 0
    while runIndex < segment.RunCount {
      let run = segment.Runs[runIndex]
      if run.FirstInstance != glyphBase
        || run.InstanceCount <= 0
        || run.InstanceCount > segment.GlyphCount - glyphBase
        || !TryMarkAtlasActive(run.AtlasId) {
          return false
        }
      let runEnd = glyphBase + run.InstanceCount
      if run.ByteRangeEnd == 0uL
        || !IsAtlasRangeResident(run.AtlasId, run.ByteRangeEnd) {
          return false
        }
      glyphBase = runEnd
      runIndex = runIndex + 1
    }
    return glyphBase == segment.GlyphCount
  }

  private func CurrentState() VulkanTextSceneAtlasState {
    EnsureAtlasStates()
    let index = atlasSet.CurrentAtlasIndex
    guard let state = states[index] else {
      throw InvalidOperationException("Vulkan current text atlas state is unavailable")
    }
    return state
  }

  private func EnsureAtlasStates() {
    var index int32 = 0
    while index < states.Length {
      if atlasSet.IsActive(index) {
        let identity = atlasSet.IdentityAt(index)
        if let state = states[index] {
          if !SameIdentity(state.Identity, identity) {
            RemoveStateGlyphs(state)
            states[index] = nil
            stateCount = stateCount - 1
          }
        }
        if states[index] == nil {
          states[index] = VulkanTextSceneAtlasState(
            atlasSet.AtlasAt(index), identity)
          stateCount = stateCount + 1
        }
      } else if let state = states[index] {
        RemoveStateGlyphs(state)
        states[index] = nil
        stateCount = stateCount - 1
      }
      index = index + 1
    }
  }

  private func RecycleAtlas() bool {
    EnsureAtlasStates()
    let index = atlasSet.FindReclaimable(
      completedGlobalSubmissionSerial, activeAtlasUse)
    if index < 0 {
      return false
    }
    guard let state = states[index] else {
      throw InvalidOperationException("Vulkan reclaimable text atlas state is unavailable")
    }
    var identity ResourceId
    try {
      identity = atlasSet.RecycleAtlas(index, completedGlobalSubmissionSerial)
    } catch (error Exception) {
      RemoveStateGlyphs(state)
      states[index] = nil
      stateCount = stateCount - 1
      throw error
    }
    RemoveStateGlyphs(state)
    state.Reset(atlasSet.AtlasAt(index), identity)
    capacityExhausted = false
    return true
  }

  private func RemoveStateGlyphs(state VulkanTextSceneAtlasState) {
    var keyIndex int32 = 0
    while keyIndex < state.KeyCount {
      glyphs.Remove(state.Keys[keyIndex])
      state.Keys[keyIndex] = VulkanTextAtlasGlyphKey{}
      keyIndex = keyIndex + 1
    }
    state.KeyCount = 0
  }

  private func SameIdentity(left ResourceId, right ResourceId) bool -> left.Kind == right.Kind && left.LogicalId == right.LogicalId
    && left.Version == right.Version

  private func MarkActiveAtlas(glyph VulkanTextAtlasGlyph) {
    TryMarkAtlasActive(glyph.AtlasId)
  }
}
