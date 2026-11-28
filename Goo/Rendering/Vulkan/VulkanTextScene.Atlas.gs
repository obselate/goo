package Goo

import System
import System.Collections.Generic
import System.Runtime.CompilerServices

internal unsafe sealed partial class VulkanTextScene {
    private func GetProviderGlyphTable(provider VulkanTextProvider) VulkanTextProviderGlyphTable {
        if Object.ReferenceEquals(lastGlyphProvider, provider) {
            if let cached = lastGlyphTable {
                return cached
            }
        }
        if providerGlyphTables.TryGetValue(provider, out var existing) {
            lastGlyphProvider = provider
            lastGlyphTable = existing
            return existing
        }
        let providerIndex = providerTablesByIndex.Count
        let created = VulkanTextProviderGlyphTable(providerIndex)
        providerTablesByIndex.Add(WeakReference[VulkanTextProviderGlyphTable](created))
        providerGlyphTables.Add(provider, created)
        lastGlyphProvider = provider
        lastGlyphTable = created
        return created
    }

    private func StoreTableGlyph(
        table VulkanTextProviderGlyphTable,
        packedKey uint64,
        existingFound bool,
        glyph VulkanTextAtlasGlyph
    ) {
        if existingFound {
            table.Glyphs[packedKey] = glyph
        } else if table.Glyphs.TryAdd(packedKey, glyph) {
            cachedGlyphCount = cachedGlyphCount + 1
        } else {
            table.Glyphs[packedKey] = glyph
        }
    }

    private func TryGetAtlasState(glyph VulkanTextAtlasGlyph, out state VulkanTextSceneAtlasState?) bool {
        let slot = glyph.AtlasSlotIndex
        if slot >= 0 && slot < states.Length && glyph.AtlasGeneration == ResourceGeneration {
            if let candidate = states[slot] {
                if SameIdentity(candidate.Identity, glyph.AtlasId) {
                    state = candidate
                    return true
                }
            }
        }
        state = nil
        return false
    }

    internal func ResolveAtlasSlot(atlasId ResourceId, slotHint int32 = -1) int32 {
        if !atlasId.IsValid || atlasId.Kind != SceneResourceKind.Atlas {
            return -1
        }
        if slotHint >= 0 && slotHint < states.Length {
            if let candidate = states[slotHint] {
                if SameIdentity(candidate.Identity, atlasId) {
                    return slotHint
                }
            }
        }
        return atlasSet.FindIndex(atlasId)
    }

    private func IsGlyphResident(glyph VulkanTextAtlasGlyph) bool {
        if glyph.RenderMode == GlyphRenderModeColorAtlas {
            return colorGlyphAtlas?.IsPlacementResident(glyph.ColorPlacement) == true
        }
        if glyph.RenderMode == GlyphRenderModeEmptySkip || glyph.RenderMode == GlyphRenderModeEmptyInk {
            return true
        }
        return TryGetAtlasState(glyph, out _)
    }

    private func TryEncodeDrawWithGrowth(
        provider VulkanTextProvider,
        glyphId uint32,
        workspace VulkanTextProviderWorkspace,
        ppem int32,
        out encodedResult VulkanTextProviderResult
    ) bool {
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
        out encodedResult VulkanTextProviderResult
    ) bool {
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
        table VulkanTextProviderGlyphTable,
        run ShapedRun,
        glyphId uint32,
        ppem int32,
        packedKey uint64,
        existingFound bool,
        out result VulkanTextAtlasGlyph?
    ) bool {
        result = nil
        guard let colorAtlas = colorGlyphAtlas else {
            return false
        }
        if !run.Provider.HasColorBitmaps() {
            return false
        }
        var placement VulkanColorGlyphPlacement
        if !colorAtlas.TryGetCachedPlacement(run.Family, run.Provider, glyphId, ppem, out placement) {
            if !run.Provider.TryDecodeColorBitmapGlyph(
                glyphId,
                ppem,
                out var width,
                out var height,
                out var rgba,
                out var extents,
                out var scale
            ) {
                return false
            }
            if rgba == nil || width <= 0 || height <= 0 {
                return false
            }
            if !colorAtlas.TryAcquireGlyph(
                run.Family,
                run.Provider,
                glyphId,
                ppem,
                width,
                height,
                rgba,
                extents,
                scale,
                out placement
            ) {
                return false
            }
        }
        let created = VulkanTextAtlasGlyph{
            AtlasId: ResourceId{},
            AtlasSlotIndex: -1,
            AtlasGeneration: 0uL,
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
        StoreTableGlyph(table, packedKey, existingFound, created)
        result = created
        return true
    }

    private func TryPackIntoAtlas(
        table VulkanTextProviderGlyphTable,
        packedKey uint64,
        existingFound bool,
        byteCount int32,
        extents VulkanTextGlyphExtents,
        scale int32,
        renderMode uint32,
        out glyphResult VulkanTextAtlasGlyph?,
        out memoryPressure bool
    ) bool {
        glyphResult = nil
        memoryPressure = false
        let totalByteCount = uint64(byteCount)
        if byteCount < 0 || (byteCount & 7) != 0 || totalByteCount > atlasSet.HardwareMaxByteSize {
            return false
        }
        var state = CurrentState(out var slotIndex)
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
                slotIndex = createdIndex
                state = states[createdIndex]!!
            } else {
                state = CurrentState(out slotIndex)
            }
            if totalByteCount > state.Atlas.ByteSize {
                return false
            }
        }
        let byteOffset = state.NextByteOffset
        if byteOffset > uint32(Int32.MaxValue) || (byteOffset & 7u) != 0u {
            return false
        }
        if byteCount > 0 {
            let texelOffset = byteOffset / 8u
            let texelCount = uint32(byteCount) / 8u
            let texelTotal = uint64(state.Atlas.TexelCount)
            if texelCount == 0u || uint64(texelOffset) >= texelTotal
            || uint64(texelCount) > texelTotal - uint64(texelOffset) {
                return false
            }
        }
        let requiredByteCount = byteOffset + uint32(byteCount)
        state.EnsureByteCapacity(requiredByteCount)
        if byteCount > 0 {
            Array.Copy(glyphWorkspace.ByteBuffer, 0, state.Bytes, int32(byteOffset), byteCount)
        }
        let isMonochrome = renderMode == GlyphRenderModeMonochrome
        let result = VulkanTextAtlasGlyph{
            AtlasId: state.Identity,
            AtlasSlotIndex: slotIndex,
            AtlasGeneration: ResourceGeneration,
            ByteOffset: byteOffset,
            ByteLength: uint32(byteCount),
            EffectByteOffset: if isMonochrome {
                byteOffset
            } else {
                0u
            },
            EffectByteLength: if isMonochrome {
                uint32(byteCount)
            } else {
                0u
            },
            Scale: scale,
            Extents: extents,
            EffectExtents: extents,
            RenderMode: renderMode,
        }
        StoreTableGlyph(table, packedKey, existingFound, result)
        state.AddKey(table.ProviderIndex, packedKey)
        state.NextByteOffset = requiredByteCount
        glyphResult = result
        return true
    }

    private func CacheEmptyInkGlyph(
        table VulkanTextProviderGlyphTable,
        packedKey uint64,
        existingFound bool
    ) VulkanTextAtlasGlyph {
        let empty = VulkanTextAtlasGlyph{AtlasSlotIndex: -1, RenderMode: GlyphRenderModeEmptyInk,}
        StoreTableGlyph(table, packedKey, existingFound, empty)
        return empty
    }

    private func CacheFallbackSkipGlyph(
        table VulkanTextProviderGlyphTable,
        packedKey uint64,
        existingFound bool
    ) VulkanTextAtlasGlyph {
        fallbackGlyphSkipCount = fallbackGlyphSkipCount + 1uL
        colorGlyphFallback = true
        let empty = VulkanTextAtlasGlyph{AtlasSlotIndex: -1, RenderMode: GlyphRenderModeEmptySkip,}
        StoreTableGlyph(table, packedKey, existingFound, empty)
        return empty
    }

    private func TryFallbackNotdefOrEmptySkip(
        table VulkanTextProviderGlyphTable,
        run ShapedRun,
        originalGlyphId uint32,
        ppem int32,
        packedKey uint64,
        existingFound bool,
        out memoryPressure bool
    ) VulkanTextAtlasGlyph? {
        memoryPressure = false
        if originalGlyphId != 0u {
            if TryEncodeDrawWithGrowth(run.Provider, 0u, glyphWorkspace, ppem, out var notdefResult) {
                if notdefResult.Count > 0 {
                    if TryPackIntoAtlas(
                        table,
                        packedKey,
                        existingFound,
                        notdefResult.Count,
                        glyphWorkspace.GlyphExtents,
                        glyphWorkspace.GlyphScale,
                        GlyphRenderModeMonochrome,
                        out var packedNotdef,
                        out memoryPressure
                    ) &&
                        packedNotdef != nil {
                        fallbackGlyphSkipCount = fallbackGlyphSkipCount + 1uL
                        colorGlyphFallback = true
                        return packedNotdef
                    }
                    if memoryPressure {
                        return nil
                    }
                }
            }
        }
        return CacheFallbackSkipGlyph(table, packedKey, existingFound)
    }

    internal func TouchColorAtlasImage(id ResourceId) {
        colorGlyphAtlas?.TouchPage(id)
    }

    private func GlyphKeyPpem(provider VulkanTextProvider, ppem int32, effectiveBitmapPpem int32) int32 ->
    if !provider.OutlineHintingAvailable && provider.HasColorBitmaps() {
        effectiveBitmapPpem
    } else {
        ppem
    }

    private func GetGlyph(
        table VulkanTextProviderGlyphTable,
        run ShapedRun,
        glyphId uint32,
        ppem int32,
        bitmapPpem int32 = 0
    ) VulkanTextAtlasGlyph? {
        let provider = run.Provider
        let effectiveBitmapPpem = bitmapPpem > 0 ? bitmapPpem : (
            ppem > 0 ? Math.Max(1, int32(MathF.Round(float32(ppem) / 64.0F))) : 128
        )
        let keyPpem = GlyphKeyPpem(provider, ppem, effectiveBitmapPpem)
        let key = PackVulkanTextGlyphKey(glyphId, keyPpem, 0u)
        var existingFound = false
        if table.Glyphs.TryGetValue(key, out var existing) {
            if IsGlyphResident(existing) {
                if existing.RenderMode == GlyphRenderModeColorAtlas {
                    colorGlyphAtlas?.TouchPage(existing.ColorPlacement.ImageId)
                }
                return existing
            }
            existingFound = true
        }

        let hasColorPaint = (provider.HasColorPaint() && provider.GlyphHasColorPaint(glyphId))
        || (provider.HasColorLayers() && provider.GlyphHasColorLayers(glyphId))
        if hasColorPaint {
            if TryEncodePaintWithGrowth(provider, glyphId, glyphWorkspace, out var paintResult) {
                if paintResult.Count > ColorPaintByteThreshold {
                    if StoreColorBitmapGlyph(
                        table,
                        run,
                        glyphId,
                        effectiveBitmapPpem,
                        key,
                        existingFound,
                        out var bitmapOverride
                    ) &&
                        bitmapOverride != nil {
                        return bitmapOverride
                    }
                }
                if paintResult.Count > 0 {
                    if TryPackIntoAtlas(
                        table,
                        key,
                        existingFound,
                        paintResult.Count,
                        glyphWorkspace.GlyphExtents,
                        glyphWorkspace.GlyphScale,
                        GlyphRenderModeColorPaint,
                        out var paintGlyph,
                        out var paintPressure
                    ) &&
                        paintGlyph != nil {
                        return paintGlyph
                    }
                    if paintPressure {
                        return nil
                    }
                }
            }
            if StoreColorBitmapGlyph(
                table,
                run,
                glyphId,
                effectiveBitmapPpem,
                key,
                existingFound,
                out var fallbackBitmap
            ) &&
                fallbackBitmap != nil {
                return fallbackBitmap
            }
            colorGlyphFallback = true
        } else if provider.HasColorBitmaps() {
            if StoreColorBitmapGlyph(
                table,
                run,
                glyphId,
                effectiveBitmapPpem,
                key,
                existingFound,
                out var bitmapGlyph
            ) &&
                bitmapGlyph != nil {
                return bitmapGlyph
            }
        } else if provider.HasColorSvg() {
            if StoreColorBitmapGlyph(
                table,
                run,
                glyphId,
                effectiveBitmapPpem,
                key,
                existingFound,
                out var svgBitmapFallback
            ) &&
                svgBitmapFallback != nil {
                return svgBitmapFallback
            }
            if provider.TryGetColorSvgGlyph(glyphId, out var svgBytes, out var svgExtents, out var svgScale) {
                let _ = svgBytes
                let _ = svgExtents
                let _ = svgScale
            }
            colorGlyphFallback = true
        }

        if TryEncodeDrawWithGrowth(provider, glyphId, glyphWorkspace, ppem, out var drawResult) {
            if drawResult.Count == 0 {
                return CacheEmptyInkGlyph(table, key, existingFound)
            }
            if TryPackIntoAtlas(
                table,
                key,
                existingFound,
                drawResult.Count,
                glyphWorkspace.GlyphExtents,
                glyphWorkspace.GlyphScale,
                GlyphRenderModeMonochrome,
                out var drawGlyph,
                out var drawPressure
            ) &&
                drawGlyph != nil {
                return drawGlyph
            }
            if drawPressure {
                return nil
            }
        }
        return TryFallbackNotdefOrEmptySkip(table, run, glyphId, ppem, key, existingFound, out var notdefPressure)
    }

    private func GetEffectOutlineGlyph(
        table VulkanTextProviderGlyphTable,
        run ShapedRun,
        glyphId uint32,
        ppem int32
    ) VulkanTextAtlasGlyph? {
        let fillKey = PackVulkanTextGlyphKey(glyphId, ppem, 0u)
        if table.Glyphs.TryGetValue(fillKey, out var fillGlyph)
        &&
            (
            fillGlyph.RenderMode == GlyphRenderModeMonochrome
            || fillGlyph.RenderMode == GlyphRenderModeEmptyInk
        )
        && IsGlyphResident(fillGlyph) {
            return fillGlyph
        }
        let effectKey = PackVulkanTextGlyphKey(glyphId, ppem, GlyphRenderModeMonochrome)
        var existingFound = false
        if table.Glyphs.TryGetValue(effectKey, out var existing) {
            if IsGlyphResident(existing) {
                return existing
            }
            existingFound = true
        }
        if TryEncodeDrawWithGrowth(run.Provider, glyphId, glyphWorkspace, ppem, out var effectResult) {
            if effectResult.Count == 0 {
                return CacheEmptyInkGlyph(table, effectKey, existingFound)
            }
            if TryPackIntoAtlas(
                table,
                effectKey,
                existingFound,
                effectResult.Count,
                glyphWorkspace.GlyphExtents,
                glyphWorkspace.GlyphScale,
                GlyphRenderModeMonochrome,
                out var packed,
                out var memoryPressure
            ) &&
                packed != nil {
                return packed
            }
            if memoryPressure {
                return nil
            }
        }
        return CacheFallbackSkipGlyph(table, effectKey, existingFound)
    }

    private func CachedGlyph(
        table VulkanTextProviderGlyphTable,
        provider VulkanTextProvider,
        glyphId uint32,
        ppem int32,
        bitmapPpem int32 = 0
    ) VulkanTextAtlasGlyph? {
        let effectiveBitmapPpem = bitmapPpem > 0 ? bitmapPpem : (
            ppem > 0 ? Math.Max(1, int32(MathF.Round(float32(ppem) / 64.0F))) : 128
        )
        let keyPpem = GlyphKeyPpem(provider, ppem, effectiveBitmapPpem)
        let key = PackVulkanTextGlyphKey(glyphId, keyPpem, 0u)
        if table.Glyphs.TryGetValue(key, out var value)
        && IsGlyphResident(value) {
            return value
        }
        return nil
    }

    private func HintPpem(provider VulkanTextProvider, fontSize float32) int32 {
        if !provider.OutlineHintingAvailable || !(fontSize > 0.0F) {
            return 0
        }
        let scaled = fontSize * pixelScale
        if !FiniteValue(scaled) || scaled > 32.5F {
            return 0
        }
        let fixedPpem = int32(MathF.Round(scaled * 64.0F))
        if fixedPpem > 2080 {
            return 0
        }
        return Math.Max(1, fixedPpem)
    }

    private func BitmapPpem(fontSize float32) int32 {
        if !(fontSize > 0.0F) {
            return 0
        }
        let scaled = fontSize * pixelScale
        if !FiniteValue(scaled) {
            return 0
        }
        return Math.Max(1, int32(MathF.Round(scaled)))
    }

    private func CanRender(glyph VulkanTextAtlasGlyph) bool {
        if glyph.RenderMode == GlyphRenderModeEmptySkip || glyph.RenderMode == GlyphRenderModeEmptyInk {
            return true
        }
        if glyph.RenderMode == GlyphRenderModeColorAtlas {
            return colorGlyphAtlas?.IsPlacementResident(glyph.ColorPlacement) == true
        }
        if !TryGetAtlasState(glyph, out var state) || state == nil {
            return false
        }
        let glyphEnd = uint64(glyph.ByteOffset) + uint64(glyph.ByteLength)
        return IsStateRangeResident(state, glyphEnd)
    }

    private func ProtectSegmentAtlases(segment VulkanRetainedTextSegment) bool {
        if segment.GlyphCount <= 0
        || segment.GlyphCount != segment.RecordCount
        || segment.RunCount <= 0
        || segment.RunCount > segment.Runs.Length
        || segment.GlyphCount > segment.Records.Length {
            return false
        }
        var glyphBase int32 = 0
        var runIndex int32 = 0
        while runIndex < segment.RunCount {
            let run = segment.Runs[runIndex]
            if run.FirstInstance != glyphBase
            || run.InstanceCount <= 0
            || run.InstanceCount > segment.GlyphCount - glyphBase
            || !TryMarkAtlasActive(run.AtlasId, run.AtlasSlotHint) {
                return false
            }
            let runEnd = glyphBase + run.InstanceCount
            if run.ByteRangeEnd == 0uL
            || !IsAtlasRangeResident(run.AtlasId, run.ByteRangeEnd, run.AtlasSlotHint) {
                return false
            }
            glyphBase = runEnd
            runIndex = runIndex + 1
        }
        return glyphBase == segment.GlyphCount
    }

    private func CurrentState(out slotIndex int32) VulkanTextSceneAtlasState {
        EnsureAtlasStates()
        slotIndex = atlasSet.CurrentAtlasIndex
        guard let state = states[slotIndex] else {
            throw InvalidOperationException("Vulkan current text atlas state is unavailable")
        }
        return state
    }

    private func EnsureAtlasStates() {
        if states.Length < atlasSet.AtlasSlotCapacity {
            Array.Resize(ref states, atlasSet.AtlasSlotCapacity)
            Array.Resize(ref activeAtlasUse, atlasSet.AtlasSlotCapacity)
        }
        var index int32 = 0
        while index < states.Length {
            if atlasSet.IsActive(index) {
                let identity = atlasSet.IdentityAt(index)
                if let state = states[index] {
                    if !SameIdentity(state.Identity, identity) {
                        RemoveStateGlyphs(state, index)
                        states[index] = nil
                        stateCount = stateCount - 1
                    }
                }
                if states[index] == nil {
                    states[index] = VulkanTextSceneAtlasState(atlasSet.AtlasAt(index), identity)
                    stateCount = stateCount + 1
                }
            } else if let state = states[index] {
                RemoveStateGlyphs(state, index)
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
    } else {
        nil
    }

    public func Evict(handle int32) {
        if !atlasSet.TryRetireAtlas(handle, completedGlobalSubmissionSerial) {
            throw InvalidOperationException("Vulkan text atlas eviction candidate did not retire")
        }
        EnsureAtlasStates()
    }

    private func RecycleAtlas(minimumByteSize VkDeviceSize = 0uL) bool {
        EnsureAtlasStates()
        let index = atlasSet.FindReclaimable(completedGlobalSubmissionSerial, activeAtlasUse)
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
            RemoveStateGlyphs(state, index)
            states[index] = nil
            stateCount = stateCount - 1
            return false
        }
        RemoveStateGlyphs(state, index)
        state.Reset(atlasSet.AtlasAt(index), identity)
        return true
    }

    private func RemoveStateGlyphs(state VulkanTextSceneAtlasState, slotIndex int32) {
        var keyIndex int32 = 0
        while keyIndex < state.KeyCount {
            let entry = state.Keys[keyIndex]
            if entry.ProviderIndex >= 0 && entry.ProviderIndex < providerTablesByIndex.Count {
                if providerTablesByIndex[entry.ProviderIndex].TryGetTarget(out var table) {
                    if table.Glyphs.TryGetValue(entry.PackedKey, out var current)
                    && current.AtlasSlotIndex == slotIndex
                    && SameIdentity(current.AtlasId, state.Identity) {
                        if table.Glyphs.Remove(entry.PackedKey) && cachedGlyphCount > 0 {
                            cachedGlyphCount = cachedGlyphCount - 1
                        }
                    }
                }
            }
            state.Keys[keyIndex] = VulkanTextAtlasGlyphEntryRef{}
            keyIndex = keyIndex + 1
        }
        state.KeyCount = 0
    }

    private func TrimUnusedAtlasPages() {
        for index in 0 ... states.Length {
            guard let state = states[index] else {
                continue
            }
            if activeAtlasUse[index] {
                state.UnusedCompiles = 0
                continue
            }
            if state.UnusedCompiles < 2 {
                state.UnusedCompiles++
            }
            if state.UnusedCompiles >= 2
            && atlasSet.TryRetireAtlas(index, completedGlobalSubmissionSerial) {
                RemoveStateGlyphs(state, index)
                states[index] = nil
                stateCount--
            }
        }
        trimAtlasPages = atlasSet.AtlasCount > 1
        if !trimAtlasPages {
            states[atlasSet.CurrentAtlasIndex]!!.UnusedCompiles = 0
        }
    }

    private func SameIdentity(left ResourceId, right ResourceId) bool -> left.Kind == right.Kind &&
        left.LogicalId == right.LogicalId
    && left.Version == right.Version

    private func MarkActiveAtlas(glyph VulkanTextAtlasGlyph) {
        if glyph.RenderMode == GlyphRenderModeColorAtlas {
            colorGlyphAtlas?.TouchPage(glyph.ColorPlacement.ImageId)
            return
        }
        if glyph.RenderMode == GlyphRenderModeEmptySkip
        || glyph.RenderMode == GlyphRenderModeEmptyInk
        || !glyph.AtlasId.IsValid {
            return
        }
        let slot = glyph.AtlasSlotIndex
        if slot >= 0 && slot < states.Length && slot < activeAtlasUse.Length
        && glyph.AtlasGeneration == ResourceGeneration {
            if let state = states[slot] {
                if SameIdentity(state.Identity, glyph.AtlasId) {
                    activeAtlasUse[slot] = true
                }
            }
        }
    }
}
