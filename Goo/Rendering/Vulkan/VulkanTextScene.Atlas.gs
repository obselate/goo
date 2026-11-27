package Goo

import System
import System.Collections.Generic
import System.Runtime.CompilerServices

internal unsafe sealed partial class VulkanTextScene {
  private func IsGlyphResident(glyph VulkanTextAtlasGlyph) bool {
    if glyph.RenderMode == GlyphRenderModeColorAtlas {
      return colorGlyphAtlas?.IsPlacementResident(glyph.ColorPlacement) == true
    }
    if glyph.RenderMode == GlyphRenderModeEmptySkip {
      return true
    }
    return atlasSet.FindIndex(glyph.AtlasId) >= 0
  }

  private func TryEncodeDrawWithGrowth(
    provider VulkanTextProvider,
    glyphId uint32,
    workspace VulkanTextProviderWorkspace,
    ppem int32,
    out encodedResult VulkanTextProviderResult) bool {
      encodedResult = provider.EncodeGlyphInto(glyphId, workspace, ppem)
      if encodedResult.AbiVersion != VulkanTextProviderAbi.Version {
        return false
      }
      if encodedResult.Status == VulkanTextProviderAbi.CapacityExceeded {
        if !workspace.EnsureByteCapacity(encodedResult.Required) {
          return false
        }
        encodedResult = provider.EncodeGlyphInto(glyphId, workspace, ppem)
        if encodedResult.AbiVersion != VulkanTextProviderAbi.Version {
          return false
        }
      }
      if encodedResult.Status != VulkanTextProviderAbi.Success {
        return false
      }
      return encodedResult.Count >= 0 && (encodedResult.Count & 7) == 0
    }

  private func TryEncodePaintWithGrowth(
    provider VulkanTextProvider,
    glyphId uint32,
    workspace VulkanTextProviderWorkspace,
    out encodedResult VulkanTextProviderResult) bool {
      encodedResult = provider.EncodePaintGlyphInto(glyphId, 0u, workspace)
      if encodedResult.AbiVersion != VulkanTextProviderAbi.Version {
        return false
      }
      if encodedResult.Status == VulkanTextProviderAbi.CapacityExceeded {
        if !workspace.EnsureByteCapacity(encodedResult.Required) {
          return false
        }
        encodedResult = provider.EncodePaintGlyphInto(glyphId, 0u, workspace)
        if encodedResult.AbiVersion != VulkanTextProviderAbi.Version {
          return false
        }
      }
      if encodedResult.Status != VulkanTextProviderAbi.Success {
        return false
      }
      return encodedResult.Count >= 0 && (encodedResult.Count & 7) == 0
    }

  private func StoreColorBitmapGlyph(
    run ShapedRun,
    glyphId uint32,
    ppem int32,
    key VulkanTextAtlasGlyphKey,
    existingFound bool,
    out result VulkanTextAtlasGlyph?) bool {
      result = nil
      guard let colorAtlas = colorGlyphAtlas else {
        return false
      }
      if !run.Provider.HasColorBitmaps() {
        return false
      }
      var placement VulkanColorGlyphPlacement
      if !colorAtlas.TryGetCachedPlacement(run.Family, run.Provider, glyphId, ppem, out placement) {
        if !run.Provider.TryDecodeColorBitmapGlyph(glyphId, ppem,
          out var width, out var height, out var rgba, out var extents, out var scale) {
            return false
          }
        if rgba == nil || width <= 0 || height <= 0 {
          return false
        }
        if !colorAtlas.TryAcquireGlyph(run.Family, run.Provider, glyphId, ppem,
          width, height, rgba, extents, scale, out placement) {
            return false
          }
      }
      let created = VulkanTextAtlasGlyph{
        AtlasId: ResourceId{},
        ByteOffset: 0u,
        ByteLength: 0u,
        EffectByteOffset: 0u,
        EffectByteLength: 0u,
        Scale: placement.Scale,
        Extents: placement.Extents,
        EffectExtents: placement.Extents,
        RenderMode: GlyphRenderModeColorAtlas,
        ColorPlacement: placement,
      }
      if existingFound {
        glyphs[key] = created
      } else {
        glyphs.Add(key, created)
      }
      result = created
      return true
    }

  private func TryPackIntoAtlas(
    key VulkanTextAtlasGlyphKey,
    existingFound bool,
    byteCount int32,
    extents VulkanTextGlyphExtents,
    scale int32,
    renderMode uint32,
    out glyphResult VulkanTextAtlasGlyph?,
    out memoryPressure bool) bool {
      glyphResult = nil
      memoryPressure = false
      let totalByteCount = uint64(byteCount)
      if totalByteCount > atlasSet.HardwareMaxByteSize || byteCount < 0 {
        return false
      }
      var state = CurrentState()
      if uint64(state.NextByteOffset) + totalByteCount > state.Atlas.ByteSize
        || state.KeyCount >= int32(state.Atlas.ByteSize / 8uL) {
          var createdIndex = -1
          trimAtlasPages = true
          try {
            createdIndex = atlasSet.CreateAtlas(totalByteCount)
          } catch (pressure VulkanMemoryPressureException) {
            if !RecycleAtlas(totalByteCount) {
              atlasSet.RecordPressureFailure()
              memoryPressure = true
              return false
            }
          } catch (error Exception) {
            return false
          }
          if createdIndex >= 0 {
            if states.Length < atlasSet.AtlasSlotCapacity {
              Array.Resize(ref states, atlasSet.AtlasSlotCapacity)
              Array.Resize(ref activeAtlasUse, atlasSet.AtlasSlotCapacity)
            }
            EnsureAtlasStates()
            state = states[createdIndex]!!
          } else {
            state = CurrentState()
          }
          if totalByteCount > state.Atlas.ByteSize {
            return false
          }
        }
      let byteOffset = state.NextByteOffset
      if byteOffset > uint32(Int32.MaxValue) {
        return false
      }
      let requiredByteCount = byteOffset + uint32(byteCount)
      state.EnsureByteCapacity(requiredByteCount)
      if byteCount > 0 {
        Array.Copy(glyphWorkspace.ByteBuffer, 0, state.Bytes, int32(byteOffset), byteCount)
      }
      let isMonochrome = renderMode == GlyphRenderModeMonochrome
      let result = VulkanTextAtlasGlyph{
        AtlasId: state.Identity,
        ByteOffset: byteOffset,
        ByteLength: uint32(byteCount),
        EffectByteOffset: if isMonochrome { byteOffset } else { 0u },
        EffectByteLength: if isMonochrome { uint32(byteCount) } else { 0u },
        Scale: scale,
        Extents: extents,
        EffectExtents: extents,
        RenderMode: renderMode,
      }
      if existingFound {
        glyphs[key] = result
      } else {
        glyphs.Add(key, result)
      }
      state.AddKey(key)
      state.NextByteOffset = requiredByteCount
      glyphResult = result
      return true
    }

  private func CacheFallbackSkipGlyph(
    key VulkanTextAtlasGlyphKey,
    existingFound bool) VulkanTextAtlasGlyph {
      fallbackGlyphSkipCount = fallbackGlyphSkipCount + 1uL
      colorGlyphFallback = true
      let empty = VulkanTextAtlasGlyph{
        RenderMode: GlyphRenderModeEmptySkip,
      }
      if existingFound {
        glyphs[key] = empty
      } else {
        glyphs.Add(key, empty)
      }
      return empty
    }

  private func TryFallbackNotdefOrEmptySkip(
    run ShapedRun,
    originalGlyphId uint32,
    ppem int32,
    key VulkanTextAtlasGlyphKey,
    existingFound bool,
    out memoryPressure bool) VulkanTextAtlasGlyph? {
      memoryPressure = false
      if originalGlyphId != 0u {
        if TryEncodeDrawWithGrowth(run.Provider, 0u, glyphWorkspace, ppem, out var notdefResult) {
          if TryPackIntoAtlas(key, existingFound, notdefResult.Count,
            glyphWorkspace.GlyphExtents, glyphWorkspace.GlyphScale, GlyphRenderModeMonochrome,
            out var packedNotdef, out memoryPressure) && packedNotdef != nil {
              fallbackGlyphSkipCount = fallbackGlyphSkipCount + 1uL
              colorGlyphFallback = true
              return packedNotdef
            }
          if memoryPressure {
            return nil
          }
        }
      }
      return CacheFallbackSkipGlyph(key, existingFound)
    }

  private func GetGlyph(run ShapedRun, glyphId uint32, ppem int32) VulkanTextAtlasGlyph? {
    let key = VulkanTextAtlasGlyphKey(run.Family, run.Provider, glyphId, ppem, 0u)
    var existingFound = false
    if glyphs.TryGetValue(key, out var existing) {
      if IsGlyphResident(existing) {
        if existing.RenderMode == GlyphRenderModeColorAtlas {
          colorGlyphAtlas?.TouchPage(existing.ColorPlacement.ImageId)
        }
        return existing
      }
      existingFound = true
    }

    let hasColorPaint = (run.Provider.HasColorPaint() && run.Provider.GlyphHasColorPaint(glyphId))
      || (run.Provider.HasColorLayers() && run.Provider.GlyphHasColorLayers(glyphId))
    if hasColorPaint {
      if TryEncodePaintWithGrowth(run.Provider, glyphId, glyphWorkspace, out var paintResult) {
        if paintResult.Count > ColorPaintByteThreshold {
          if StoreColorBitmapGlyph(run, glyphId, ppem, key, existingFound, out var bitmapOverride)
            && bitmapOverride != nil {
              return bitmapOverride
            }
        }
        if TryPackIntoAtlas(key, existingFound, paintResult.Count,
          glyphWorkspace.GlyphExtents, glyphWorkspace.GlyphScale, GlyphRenderModeColorPaint,
          out var paintGlyph, out var paintPressure) && paintGlyph != nil {
            return paintGlyph
          }
        if paintPressure {
          return nil
        }
      }
      if StoreColorBitmapGlyph(run, glyphId, ppem, key, existingFound, out var fallbackBitmap)
        && fallbackBitmap != nil {
          return fallbackBitmap
        }
      colorGlyphFallback = true
    } else if run.Provider.HasColorBitmaps() {
      if StoreColorBitmapGlyph(run, glyphId, ppem, key, existingFound, out var bitmapGlyph)
        && bitmapGlyph != nil {
          return bitmapGlyph
        }
    } else if run.Provider.HasColorSvg() {
      if StoreColorBitmapGlyph(run, glyphId, ppem, key, existingFound, out var svgBitmapFallback)
        && svgBitmapFallback != nil {
          return svgBitmapFallback
        }
      if run.Provider.TryGetColorSvgGlyph(glyphId, out var svgBytes, out var svgExtents, out var svgScale) {
        let _ = svgBytes
        let _ = svgExtents
        let _ = svgScale
      }
      colorGlyphFallback = true
    }

    if TryEncodeDrawWithGrowth(run.Provider, glyphId, glyphWorkspace, ppem, out var drawResult) {
      if TryPackIntoAtlas(key, existingFound, drawResult.Count,
        glyphWorkspace.GlyphExtents, glyphWorkspace.GlyphScale, GlyphRenderModeMonochrome,
        out var drawGlyph, out var drawPressure) && drawGlyph != nil {
          return drawGlyph
        }
      if drawPressure {
        return nil
      }
    }
    return TryFallbackNotdefOrEmptySkip(run, glyphId, ppem, key, existingFound, out var notdefPressure)
  }

  private func GetEffectOutlineGlyph(run ShapedRun, glyphId uint32, ppem int32) VulkanTextAtlasGlyph? {
    let fillKey = VulkanTextAtlasGlyphKey(run.Family, run.Provider, glyphId, ppem, 0u)
    if glyphs.TryGetValue(fillKey, out var fillGlyph)
      && fillGlyph.RenderMode == GlyphRenderModeMonochrome
      && IsGlyphResident(fillGlyph) {
        return fillGlyph
      }
    let effectKey = VulkanTextAtlasGlyphKey(run.Family, run.Provider, glyphId, ppem, GlyphRenderModeMonochrome)
    var existingFound = false
    if glyphs.TryGetValue(effectKey, out var existing) {
      if IsGlyphResident(existing) {
        return existing
      }
      existingFound = true
    }
    if TryEncodeDrawWithGrowth(run.Provider, glyphId, glyphWorkspace, ppem, out var effectResult) {
      if TryPackIntoAtlas(effectKey, existingFound, effectResult.Count,
        glyphWorkspace.GlyphExtents, glyphWorkspace.GlyphScale, GlyphRenderModeMonochrome,
        out var packed, out var memoryPressure) && packed != nil {
          return packed
        }
      if memoryPressure {
        return nil
      }
    }
    return CacheFallbackSkipGlyph(effectKey, existingFound)
  }

  private func CachedGlyph(run ShapedRun, glyphId uint32, ppem int32) VulkanTextAtlasGlyph? {
    let key = VulkanTextAtlasGlyphKey(run.Family, run.Provider, glyphId, ppem, 0u)
    if glyphs.TryGetValue(key, out var value)
      && IsGlyphResident(value) {
        return value
      }
    return nil
  }

  private func HintPpem(provider VulkanTextProvider, fontSize float32) int32 {
    if !provider.OutlineHintingAvailable || fontSize <= 0.0F { return 0 }
    return Math.Max(1, int32(MathF.Round(fontSize * pixelScale * 64.0F)))
  }

  private func CanRender(glyph VulkanTextAtlasGlyph) bool {
    if glyph.RenderMode == GlyphRenderModeEmptySkip {
      return true
    }
    if glyph.RenderMode == GlyphRenderModeColorAtlas {
      return colorGlyphAtlas?.IsPlacementResident(glyph.ColorPlacement) == true
    }
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

  public func EvictionSerial(handle int32) uint64? ->
    if handle != atlasSet.CurrentAtlasIndex && handle < activeAtlasUse.Length && !activeAtlasUse[handle]
      && atlasSet.IsActive(handle) && atlasSet.CanRetireAtlas(handle, completedGlobalSubmissionSerial) {
        atlasSet.LastUseSerial(handle)
      } else { nil }

  public func Evict(handle int32) {
    if !atlasSet.TryRetireAtlas(handle, completedGlobalSubmissionSerial) {
      throw InvalidOperationException("Vulkan text atlas eviction candidate did not retire")
    }
    EnsureAtlasStates()
  }

  private func RecycleAtlas(minimumByteSize VkDeviceSize = 0uL) bool {
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
      identity = atlasSet.RecycleAtlas(index, completedGlobalSubmissionSerial, minimumByteSize)
    } catch (error Exception) {
      RemoveStateGlyphs(state)
      states[index] = nil
      stateCount = stateCount - 1
      return false
    }
    RemoveStateGlyphs(state)
    state.Reset(atlasSet.AtlasAt(index), identity)
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

  private func TrimUnusedAtlasPages() {
    var retired = false
    for index in 0 ... states.Length {
      guard let state = states[index] else { continue }
      if activeAtlasUse[index] {
        state.UnusedCompiles = 0
        continue
      }
      if state.UnusedCompiles < 2 { state.UnusedCompiles++ }
      if state.UnusedCompiles >= 2
        && atlasSet.TryRetireAtlas(index, completedGlobalSubmissionSerial) {
        RemoveStateGlyphs(state)
        states[index] = nil
        stateCount--
        retired = true
      }
    }
    trimAtlasPages = atlasSet.AtlasCount > 1
    if !trimAtlasPages {
      states[atlasSet.CurrentAtlasIndex]!!.UnusedCompiles = 0
      if retired { glyphs.TrimExcess() }
    }
  }

  private func SameIdentity(left ResourceId, right ResourceId) bool -> left.Kind == right.Kind && left.LogicalId == right.LogicalId
    && left.Version == right.Version

  private func MarkActiveAtlas(glyph VulkanTextAtlasGlyph) {
    if glyph.RenderMode == GlyphRenderModeColorAtlas {
      colorGlyphAtlas?.TouchPage(glyph.ColorPlacement.ImageId)
      return
    }
    if glyph.RenderMode == GlyphRenderModeEmptySkip || !glyph.AtlasId.IsValid {
      return
    }
    TryMarkAtlasActive(glyph.AtlasId)
  }
}
