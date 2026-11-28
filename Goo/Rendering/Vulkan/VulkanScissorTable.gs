package Goo

import System
import System.Collections.Generic
import System.Runtime.InteropServices

internal data struct VulkanScissorTableStats {
    var SlotIndex int32
    var DrawCount int32
    var MaskCount int32
    var ClipChainCount int32
    var RecordCount int32
    var ByteCount VkDeviceSize
    var Capacity VkDeviceSize
    var BufferGeneration uint64
    var LastUseSerial uint64
    var RetentionEligible bool
    var Retained bool
    var RetentionValid bool
}

internal data struct VulkanScissorTableTotals {
    var WrittenBytes uint64
    var SkippedBytes uint64
    var MappedWrites uint64
    var Flushes uint64
    var RetainedReuse uint64
}

private data struct VulkanScissorChainKey(
    RectClipIndex int32,
    PathClipChainId int32,
    ScaleXBits uint32,
    ScaleYBits uint32,
    OriginXBits uint32,
    OriginYBits uint32
) { }

private unsafe sealed class VulkanScissorTableSlot : IDisposable {
    internal let Table VulkanGpuTableSlot
    internal var BoundBufferGeneration uint64
    internal var BoundPathAtlasBuffer VkBuffer
    internal var HistoryContentHash uint64
    internal var HistoryWordCount int32

    internal init(
        nativeDevice VkDevice,
        nativeDispatch VkDeviceDispatch,
        nativeAllocator VulkanMemoryAllocator,
        nativeObjectAccounting VulkanObjectAccounting?
    ) {
        Table = VulkanGpuTableSlot(
            nativeDevice,
            nativeDispatch,
            nativeAllocator,
            nativeObjectAccounting,
            false
        )
    }

    internal func DestroyBuffers() {
        Table.DestroyBuffers()
        BoundBufferGeneration = 0uL
        BoundPathAtlasBuffer = VkBuffer.Null
        HistoryContentHash = 0uL
        HistoryWordCount = 0
    }

    internal func InvalidateHistory() {
        Table.InvalidateHistory()
        HistoryContentHash = 0uL
        HistoryWordCount = 0
    }

    public func Dispose() {
        Table.Dispose()
    }
}

internal unsafe sealed class VulkanScissorTable : IDisposable {
    private const HeaderWords int32 = 4
    private const ChainWords int32 = VulkanShaderAbi.GooScissorChainWords
    private const RecordWords int32 = VulkanShaderAbi.GooScissorRecordWords
    private const MaxDepth int32 = VulkanShaderAbi.GooScissorMaxDepth
    private const PathMinPixelsPerUnit float32 = 0.0000152587890625F
    private const HashOffset uint64 = 14695981039346656037uL
    private const HashPrime uint64 = 1099511628211uL

    private let device VkDevice
    private let dispatch VkDeviceDispatch
    private let allocator VulkanMemoryAllocator
    private let descriptorSetLayout VkDescriptorSetLayout
    private let maxStorageBufferRange VkDeviceSize
    private let slotCount int32
    private let objectAccounting VulkanObjectAccounting?
    private let slots []VulkanScissorTableSlot
    private var descriptors VulkanFrameDescriptorOwner
    private var fallbackPathBuffer VkBuffer = VkBuffer.Null
    private var fallbackPathAllocation VulkanMemoryAllocation?
    private var fallbackPathAccounted bool

    private var stagingWords []uint32 = [1024]uint32
    private var chains []uint32 = [256 * ChainWords]uint32
    private var chainCount int32
    private var recordCount int32
    private var maskRecordIndices []int32 = [64]int32
    private var rectRecordIndices []int32 = [64]int32
    private var tempRecordIndices []int32 = [MaxDepth * 2]int32
    private var textClipChainOverrides []int32 = [64]int32
    private let textLayerStack []int32 = [32]int32
    private let chainMap Dictionary[VulkanScissorChainKey, uint32] = Dictionary[VulkanScissorChainKey, uint32]()

    private var activeFrame SceneFrame?
    private var activePathAtlas VulkanPathAtlas?
    private var activeSlot int32 = -1
    private var lastStats VulkanScissorTableStats
    private var totals VulkanScissorTableTotals
    private var disposed bool

    internal prop LastStats VulkanScissorTableStats { get -> lastStats }
    internal prop Totals VulkanScissorTableTotals { get -> totals }

    internal init(
        nativeDevice VkDevice,
        nativeDispatch VkDeviceDispatch,
        nativeAllocator VulkanMemoryAllocator,
        nativeDescriptorSetLayout VkDescriptorSetLayout,
        nativeMaxStorageBufferRange VkDeviceSize,
        nativeSlotCount int32,
        nativeObjectAccounting VulkanObjectAccounting?
    ) {
        if nativeDevice == VkDevice.Null {
            throw ArgumentException("Vulkan device is null", "nativeDevice")
        }
        if nativeAllocator == nil {
            throw ArgumentNullException("nativeAllocator")
        }
        if nativeDescriptorSetLayout == VkDescriptorSetLayout.Null {
            throw ArgumentException("Vulkan scissor descriptor set layout is null", "nativeDescriptorSetLayout")
        }
        if nativeMaxStorageBufferRange < 256uL {
            throw ArgumentOutOfRangeException("nativeMaxStorageBufferRange")
        }
        if nativeSlotCount < 1 || nativeSlotCount > 2 {
            throw ArgumentOutOfRangeException("nativeSlotCount")
        }
        device = nativeDevice
        dispatch = nativeDispatch
        allocator = nativeAllocator
        descriptorSetLayout = nativeDescriptorSetLayout
        maxStorageBufferRange = nativeMaxStorageBufferRange
        slotCount = nativeSlotCount
        objectAccounting = nativeObjectAccounting
        slots = [nativeSlotCount]VulkanScissorTableSlot
        descriptors = VulkanFrameDescriptorOwner{
            Device: device,
            Dispatch: dispatch,
            ObjectAccounting: objectAccounting,
            Sets: [nativeSlotCount]VkDescriptorSet,
        }
        for index in 0 ... slotCount {
            slots[index] = VulkanScissorTableSlot(device, dispatch, allocator, objectAccounting)
        }
        try {
            CreateFallbackPathBuffer()
            CreateDescriptorResources()
        } catch (error Exception) {
            DestroyDescriptorResources()
            DestroyFallbackPathBuffer()
            DisposeSlots()
            rethrow
        }
    }

    internal func InvalidateRetention() {
        for slot in slots {
            slot.InvalidateHistory()
        }
    }

    internal func Collect(completedSubmissionSerial uint64) {
        if disposed {
            return
        }
        for slot in slots {
            slot.Table.Lifecycle.Collect(completedSubmissionSerial)
        }
    }

    internal func BeginBuild(
        frame SceneFrame,
        pathAtlas VulkanPathAtlas,
        slotIndex int32,
        completedSubmissionSerial uint64
    ) {
        EnsureOpen()
        if slotIndex < 0 || slotIndex >= slotCount {
            throw ArgumentOutOfRangeException("slotIndex")
        }
        Collect(completedSubmissionSerial)
        let slot = slots[slotIndex]
        if slot.Table.Lifecycle.LastUseSerial > completedSubmissionSerial {
            throw InvalidOperationException("Vulkan scissor table slot is still in flight")
        }
        if slot.Table.Lifecycle.Prepared || slot.Table.Lifecycle.Recorded {
            throw InvalidOperationException("Vulkan scissor table slot already has prepared work")
        }
        if frame.ClipMaskCount < 0 || frame.ClipMaskCount > frame.ClipMasks.Length
            || frame.ClipChainCount < 0 || frame.ClipChainCount > frame.ClipChains.Length
            || frame.RectClipCount < 0 || frame.RectClipCount > frame.RectClips.Length {
            throw ArgumentOutOfRangeException("clip table frame counts")
        }
        activeFrame = frame
        activePathAtlas = pathAtlas
        activeSlot = slotIndex
        chainCount = 0
        recordCount = 0
        chainMap.Clear()
        maskRecordIndices = GrowArray(maskRecordIndices, maskRecordIndices.Length, frame.ClipMaskCount, 64)
        rectRecordIndices = GrowArray(rectRecordIndices, rectRecordIndices.Length, frame.RectClipCount, 64)
        for i in 0 ... frame.ClipMaskCount {
            maskRecordIndices[i] = i
        }
        for i in 0 ... frame.RectClipCount {
            rectRecordIndices[i] = -1
        }
        recordCount = frame.ClipMaskCount

        // Chain 0 is unclipped root; Chains 1..ClipChainCount-1 mirror SceneFrame.ClipChains at root 1:1.
        let rootChainCount = Math.Max(frame.ClipChainCount, 1)
        for pathChainId in 0 ... rootChainCount {
            let emitted = AppendChain(
                frame,
                -1,
                pathChainId,
                FloatBits(1.0F),
                FloatBits(1.0F),
                FloatBits(0.0F),
                FloatBits(0.0F)
            )
            if emitted != uint32(pathChainId) {
                throw InvalidOperationException("Vulkan scissor root chain order mismatch")
            }
        }
    }

    internal func MaskRecordIndex(maskIndex int32) uint32 {
        guard let frame = activeFrame else {
            throw InvalidOperationException("Vulkan scissor table is not building")
        }
        if maskIndex < 0 || maskIndex >= frame.ClipMaskCount {
            throw ArgumentOutOfRangeException("maskIndex")
        }
        return uint32(maskRecordIndices[maskIndex])
    }

    internal func ResolveChainId(
        rectClipIndex int32,
        pathClipChainId int32,
        layerOriginX float32,
        layerOriginY float32,
        logicalExtent VkExtent2D,
        physicalExtent VkExtent2D
    ) uint32 {
        guard let frame = activeFrame else {
            throw InvalidOperationException("Vulkan scissor table is not building")
        }
        if rectClipIndex < -1 || rectClipIndex >= frame.RectClipCount {
            throw ArgumentOutOfRangeException("rectClipIndex")
        }
        if pathClipChainId < 0 || (pathClipChainId > 0 && pathClipChainId >= frame.ClipChainCount) {
            throw ArgumentOutOfRangeException("pathClipChainId")
        }
        if rectClipIndex < 0 && pathClipChainId == 0 {
            return 0u
        }
        let scaleX = if physicalExtent.width > 0u && logicalExtent.width > 0u {
            float32(logicalExtent.width) / float32(physicalExtent.width)
        } else {
            1.0F
        }
        let scaleY = if physicalExtent.height > 0u && logicalExtent.height > 0u {
            float32(logicalExtent.height) / float32(physicalExtent.height)
        } else {
            1.0F
        }
        let key = VulkanScissorChainKey(
            rectClipIndex,
            pathClipChainId,
            FloatBits(scaleX),
            FloatBits(scaleY),
            FloatBits(layerOriginX),
            FloatBits(layerOriginY)
        )
        if chainMap.TryGetValue(key, out var existing) {
            return existing
        }
        return AppendChain(frame, rectClipIndex, pathClipChainId, key.ScaleXBits, key.ScaleYBits, key.OriginXBits, key.OriginYBits)
    }

    internal func ResolveTextClipChains(
        frame SceneFrame,
        layerPool VulkanOffscreenLayerPool?
    ) ([]int32)? {
        if frame.CachedTextSegmentCount <= 0 || frame.LayerCount <= 0 {
            return nil
        }
        textClipChainOverrides = GrowArray(
            textClipChainOverrides,
            textClipChainOverrides.Length,
            frame.CachedTextSegmentCount,
            64
        )
        let overrides = textClipChainOverrides
        for i in 0 ... frame.CachedTextSegmentCount {
            overrides[i] = 0
        }
        let stackLayerIdx = textLayerStack
        var stackDepth = 0
        for drawIndex in 0 ... frame.DrawRefCount {
            let drawRef = frame.DrawRefs[drawIndex]
            if drawRef.Kind == SceneDrawKind.LayerBegin {
                if stackDepth < stackLayerIdx.Length {
                    stackLayerIdx[stackDepth] = drawRef.Index
                }
                stackDepth++
            } else if drawRef.Kind == SceneDrawKind.LayerEnd {
                if stackDepth > 0 {
                    stackDepth--
                }
            } else if drawRef.Kind == SceneDrawKind.CachedTextSegment {
                if drawRef.ClipChainId <= 0 || stackDepth <= 0 {
                    overrides[drawRef.Index] = drawRef.ClipChainId
                } else {
                    let layerIndex = stackLayerIdx[Math.Min(stackDepth - 1, stackLayerIdx.Length - 1)]
                    let layer = frame.Layer(layerIndex)
                    let phys = layerPool?.LayerExtent(layerIndex)
                        ?? VkExtent2D{ width: layer.ExtentWidth, height: layer.ExtentHeight }
                    let logical = VkExtent2D{ width: layer.ExtentWidth, height: layer.ExtentHeight }
                    let chainId = ResolveChainId(
                        -1,
                        drawRef.ClipChainId,
                        layer.OriginX,
                        layer.OriginY,
                        logical,
                        phys
                    )
                    overrides[drawRef.Index] = int32(chainId)
                }
            }
        }
        return overrides
    }

    internal func FinishPrepare(
        strokeData VulkanPathStrokeFrameData?,
        textScaleX float32,
        textScaleY float32
    ) VulkanScissorTableStats {
        EnsureOpen()
        guard let frame = activeFrame, let pathAtlas = activePathAtlas else {
            throw InvalidOperationException("Vulkan scissor table build has not started")
        }
        if activeSlot < 0 {
            throw InvalidOperationException("Vulkan scissor table slot is invalid")
        }
        let slot = slots[activeSlot]
        let totalWords = HeaderWords + chainCount * ChainWords + recordCount * RecordWords
        stagingWords = GrowArray(stagingWords, stagingWords.Length, totalWords, 512)
        for i in 0 ... totalWords {
            stagingWords[i] = 0u
        }
        let chainBase = HeaderWords
        let recordBase = HeaderWords + chainCount * ChainWords
        let noClipSampling = VulkanGpuExperiments.Selected == VulkanGpuExperiment.NoClipSampling
        let clipClearOnly = VulkanGpuExperiments.Selected == VulkanGpuExperiment.ClipClearOnly
        let clipRegenerate = VulkanGpuExperiments.Selected == VulkanGpuExperiment.ClipRegenerate
        stagingWords[0] = uint32(chainCount)
        stagingWords[1] = uint32(chainBase)
        stagingWords[2] = if noClipSampling { 0u } else { uint32(recordCount) }
        stagingWords[3] = uint32(recordBase)
        if chainCount > 0 {
            Array.Copy(chains, 0, stagingWords, chainBase, chainCount * ChainWords)
        }

        // Write mask records [0 ..< frame.ClipMaskCount)
        for maskIndex in 0 ... frame.ClipMaskCount {
            let entryBase = recordBase + maskIndex * RecordWords
            if clipClearOnly {
                stagingWords[entryBase + 20] = VulkanShaderAbi.GooScissorKindZero
            } else {
                WriteClipMaskRecord(frame, maskIndex, entryBase, pathAtlas, strokeData, textScaleX, textScaleY)
            }
        }
        // Write referenced RectClip records [frame.ClipMaskCount ..< recordCount)
        for rectIndex in 0 ... frame.RectClipCount {
            let assigned = rectRecordIndices[rectIndex]
            if assigned >= 0 {
                let entryBase = recordBase + assigned * RecordWords
                WriteRectClipRecord(frame, rectIndex, entryBase)
            }
        }

        let pathBuffer = if pathAtlas.Buffer != VkBuffer.Null { pathAtlas.Buffer } else { fallbackPathBuffer }
        var hash = HashOffset
        hash = MixHash(hash, pathBuffer.Raw)
        for i in 0 ... totalWords {
            hash = MixHash(hash, uint64(stagingWords[i]))
        }

        let byteCount = VkDeviceSize(totalWords) * 4uL
        if byteCount > maxStorageBufferRange {
            throw InvalidOperationException("Vulkan scissor table exceeds maxStorageBufferRange")
        }
        let reallocated = slot.Table.EnsureCapacity(
            byteCount,
            4096uL,
            slot.Table.Lifecycle.LastUseSerial,
            uint32(VkConstants.VK_BUFFER_USAGE_STORAGE_BUFFER_BIT)
        )
        let retained = !clipRegenerate
            && !reallocated
            && slot.Table.HistoryValid
            && slot.BoundBufferGeneration == slot.Table.Generation
            && slot.BoundPathAtlasBuffer == pathBuffer
            && slot.HistoryWordCount == totalWords
            && slot.HistoryContentHash == hash
        var writtenBytes uint64 = 0uL
        var skippedBytes uint64 = 0uL
        var mappedWrites uint64 = 0uL
        var flushes uint64 = 0uL
        var retainedReuse uint64 = 0uL
        if retained {
            skippedBytes = byteCount
            retainedReuse = 1uL
        } else {
            let mapped = *uint32(nint(slot.Table.MappedPointer))
            fixed source *uint32 = stagingWords {
                Buffer.MemoryCopy(source, mapped, int64(slot.Table.Capacity), int64(byteCount))
            }
            let flushResult = slot.Table.Flush(byteCount, out _)
            if flushResult != VkConstants.VK_SUCCESS {
                throw InvalidOperationException("vkFlushMappedMemoryRanges failed for Vulkan scissor table")
            }
            writtenBytes = byteCount
            mappedWrites = 1uL
            flushes = 1uL
        }
        UpdateSlotDescriptorIfNeeded(activeSlot, slot, byteCount, pathBuffer)
        slot.Table.Lifecycle.Begin()
        slot.Table.Lifecycle.FlushPrepared = true
        slot.Table.PreparedByteCount = byteCount
        slot.Table.PreparedElementCount = totalWords
        slot.HistoryContentHash = hash
        slot.HistoryWordCount = totalWords
        slot.Table.HistoryBufferGeneration = slot.Table.Generation
        slot.Table.HistoryValid = true

        totals.WrittenBytes += writtenBytes
        totals.SkippedBytes += skippedBytes
        totals.MappedWrites += mappedWrites
        totals.Flushes += flushes
        totals.RetainedReuse += retainedReuse

        lastStats = VulkanScissorTableStats{
            SlotIndex: activeSlot,
            DrawCount: frame.DrawRefCount,
            MaskCount: frame.ClipMaskCount,
            ClipChainCount: chainCount,
            RecordCount: recordCount,
            ByteCount: byteCount,
            Capacity: slot.Table.Capacity,
            BufferGeneration: slot.Table.Generation,
            LastUseSerial: slot.Table.Lifecycle.LastUseSerial,
            RetentionEligible: !clipRegenerate,
            Retained: retained,
            RetentionValid: slot.Table.HistoryValid,
        }
        return lastStats
    }

    internal func Record(commandBuffer VkCommandBuffer) {
        EnsureOpen()
        if commandBuffer == VkCommandBuffer.Null {
            throw ArgumentException("Command buffer is null", "commandBuffer")
        }
        if activeSlot < 0 {
            throw InvalidOperationException("Vulkan scissor table is not prepared")
        }
        let slot = slots[activeSlot]
        if !slot.Table.Lifecycle.Prepared {
            throw InvalidOperationException("Vulkan scissor table slot is not prepared")
        }
        if slot.Table.Lifecycle.Recorded {
            if slot.Table.Lifecycle.RecordedCommandBuffer != commandBuffer {
                throw InvalidOperationException("Vulkan scissor table belongs to another command buffer")
            }
            return
        }
        slot.Table.Lifecycle.Record(commandBuffer)
    }

    internal func Bind(commandBuffer VkCommandBuffer, layout VkPipelineLayout, setIndex uint32) {
        EnsureOpen()
        if commandBuffer == VkCommandBuffer.Null || layout == VkPipelineLayout.Null {
            throw ArgumentException("Vulkan scissor descriptor binding arguments are invalid")
        }
        if activeSlot < 0 || !slots[activeSlot].Table.Lifecycle.Prepared {
            throw InvalidOperationException("Vulkan scissor table is not prepared")
        }
        descriptors.Bind(activeSlot, commandBuffer, layout, setIndex)
    }

    internal func ValidateSubmission(slotIndex int32, submissionSerial uint64) {
        EnsureOpen()
        if slotIndex < 0 || slotIndex >= slotCount || submissionSerial == 0uL {
            throw ArgumentOutOfRangeException("submissionSerial")
        }
        let slot = slots[slotIndex]
        if activeSlot != slotIndex || !slot.Table.Lifecycle.Prepared || !slot.Table.Lifecycle.FlushPrepared {
            throw InvalidOperationException("Vulkan scissor table slot has no prepared work")
        }
    }

    internal func MarkSubmitted(slotIndex int32, submissionSerial uint64) {
        ValidateSubmission(slotIndex, submissionSerial)
        let slot = slots[slotIndex]
        slot.Table.Lifecycle.AcceptSubmission(submissionSerial)
        lastStats.LastUseSerial = submissionSerial
        activeSlot = -1
        activeFrame = nil
        activePathAtlas = nil
    }

    internal func ReconcileSubmitted(slotIndex int32, submissionSerial uint64) {
        EnsureOpen()
        if slotIndex < 0 || slotIndex >= slotCount || submissionSerial == 0uL {
            throw ArgumentOutOfRangeException("submissionSerial")
        }
        let slot = slots[slotIndex]
        if activeSlot == slotIndex && slot.Table.Lifecycle.Prepared {
            slot.Table.Lifecycle.AcceptSubmission(submissionSerial)
            lastStats.LastUseSerial = submissionSerial
            activeSlot = -1
            activeFrame = nil
            activePathAtlas = nil
        }
    }

    internal func Abort(slotIndex int32) {
        if disposed {
            return
        }
        if slotIndex >= 0 && slotIndex < slotCount {
            slots[slotIndex].Table.Lifecycle.Abort()
        }
        if activeSlot == slotIndex {
            activeSlot = -1
            activeFrame = nil
            activePathAtlas = nil
        }
    }

    internal func DisposeAfterDeviceLoss() {
        if disposed {
            return
        }
        for slot in slots {
            slot.Table.Lifecycle.Reset()
            slot.DestroyBuffers()
        }
        activeSlot = -1
        activeFrame = nil
        activePathAtlas = nil
        Dispose()
    }

    public func Dispose() {
        if disposed {
            return
        }
        if activeSlot >= 0 {
            Abort(activeSlot)
        }
        disposed = true
        DestroyDescriptorResources()
        DestroyFallbackPathBuffer()
        DisposeSlots()
    }

    private func AppendChain(
        frame SceneFrame,
        rectClipIndex int32,
        pathClipChainId int32,
        scaleXBits uint32,
        scaleYBits uint32,
        originXBits uint32,
        originYBits uint32
    ) uint32 {
        let index = chainCount
        let requiredWords = (index + 1) * ChainWords
        chains = GrowArray(chains, chainCount * ChainWords, requiredWords, 64 * ChainWords)
        let baseOffset = index * ChainWords
        for i in 0 ... ChainWords {
            chains[baseOffset + i] = 0u
        }
        var forceZero = false
        var depth = 0

        // Collect path clip chain records outer-to-inner first
        var pathDepth = 0
        var chainCursor = pathClipChainId
        var chainSteps = 0
        while chainCursor > 0 {
            if chainCursor >= frame.ClipChainCount || chainSteps >= frame.ClipChainCount {
                throw ArgumentOutOfRangeException("clip chain parent index")
            }
            let record = frame.ClipChains[chainCursor]
            if (record.Flags & uint32(SceneClipChainFlags.Zero)) != 0u || record.MaskIndex < 0 {
                forceZero = true
            } else if pathDepth < tempRecordIndices.Length {
                tempRecordIndices[pathDepth] = record.MaskIndex
                pathDepth++
            }
            chainCursor = record.ParentIndex
            chainSteps++
        }
        if !forceZero {
            var p = pathDepth - 1
            while p >= 0 && depth < MaxDepth {
                chains[baseOffset + 1 + depth] = uint32(maskRecordIndices[tempRecordIndices[p]])
                depth++
                p--
            }
        }

        // Collect rect clip records outer-to-inner next
        var rectDepth = 0
        var rectCursor = rectClipIndex
        var rectSteps = 0
        while rectCursor >= 0 && !forceZero {
            if rectCursor >= frame.RectClipCount || rectSteps >= frame.RectClipCount {
                throw ArgumentOutOfRangeException("rect clip parent index")
            }
            let recordIndex = EnsureRectRecordIndex(rectCursor)
            if frame.RectClips[rectCursor].Bounds.IsEmpty {
                forceZero = true
            } else if rectDepth < tempRecordIndices.Length {
                tempRecordIndices[rectDepth] = recordIndex
                rectDepth++
            }
            rectCursor = frame.RectClips[rectCursor].ParentIndex
            rectSteps++
        }
        if !forceZero {
            var r = rectDepth - 1
            while r >= 0 && depth < MaxDepth {
                chains[baseOffset + 1 + depth] = uint32(tempRecordIndices[r])
                depth++
                r--
            }
        }

        chains[baseOffset + 0] = forceZero ? 0u : uint32(depth)
        chains[baseOffset + 11] = forceZero ? VulkanShaderAbi.GooScissorChainFlagForceZero : 0u
        chains[baseOffset + 12] = scaleXBits
        chains[baseOffset + 13] = scaleYBits
        chains[baseOffset + 14] = originXBits
        chains[baseOffset + 15] = originYBits
        chainCount++
        let key = VulkanScissorChainKey(rectClipIndex, pathClipChainId, scaleXBits, scaleYBits, originXBits, originYBits)
        if !chainMap.ContainsKey(key) {
            chainMap.Add(key, uint32(index))
        }
        return uint32(index)
    }

    private func EnsureRectRecordIndex(rectClipIndex int32) int32 {
        let existing = rectRecordIndices[rectClipIndex]
        if existing >= 0 {
            return existing
        }
        let assigned = recordCount
        recordCount++
        rectRecordIndices[rectClipIndex] = assigned
        return assigned
    }

    private func WriteRectClipRecord(frame SceneFrame, rectClipIndex int32, entryBase int32) {
        let value = frame.RectClips[rectClipIndex]
        let transform = ResolveFrameTransform(frame, value.TransformIndex)
        WriteRoundedBoxRecord(entryBase, value.Bounds, 0.0F, 0.0F, 0.0F, 0.0F, transform)
    }

    private func WriteClipMaskRecord(
        frame SceneFrame,
        maskIndex int32,
        entryBase int32,
        pathAtlas VulkanPathAtlas,
        strokeData VulkanPathStrokeFrameData?,
        textScaleX float32,
        textScaleY float32
    ) {
        let mask = frame.ClipMasks[maskIndex]
        let transform = ResolveFrameTransform(frame, mask.TransformIndex)
        if mask.AnalyticBox {
            WriteRoundedBoxRecord(
                entryBase,
                mask.Bounds,
                mask.RadiusTopLeft,
                mask.RadiusTopRight,
                mask.RadiusBottomRight,
                mask.RadiusBottomLeft,
                transform
            )
            return
        }
        if mask.ScaleX == 0.0F || mask.ScaleY == 0.0F || mask.Bounds.IsEmpty {
            stagingWords[entryBase + 20] = VulkanShaderAbi.GooScissorKindZero
            return
        }
        let atlasCapacity = uint64(pathAtlas.WordCapacity)
        let atlasOffset = uint64(mask.AtlasWordOffset)
        let atlasCount = uint64(mask.AtlasWordCount)
        if !mask.PathId.IsValid || mask.PathId.Kind != SceneResourceKind.PathBand
            || !mask.AtlasId.IsValid || mask.AtlasId.Kind != SceneResourceKind.Atlas
            || atlasCount == 0uL || atlasOffset >= atlasCapacity || atlasCount > atlasCapacity - atlasOffset {
            throw ArgumentOutOfRangeException("clip mask path atlas range")
        }
        let m00 = transform.A * mask.ScaleX
        let m01 = transform.C * mask.ScaleY
        let m10 = transform.B * mask.ScaleX
        let m11 = transform.D * mask.ScaleY
        let mtx = transform.A * mask.TranslateX + transform.C * mask.TranslateY + transform.TX
        let mty = transform.B * mask.TranslateX + transform.D * mask.TranslateY + transform.TY
        let det = m00 * m11 - m01 * m10
        if MathF.Abs(det) <= 1e-7F {
            stagingWords[entryBase + 20] = VulkanShaderAbi.GooScissorKindZero
            return
        }
        let invDet = 1.0F / det
        let inv00 = m11 * invDet
        let inv01 = -m01 * invDet
        let inv10 = -m10 * invDet
        let inv11 = m00 * invDet
        let invTx = -(inv00 * mtx + inv01 * mty)
        let invTy = -(inv10 * mtx + inv11 * mty)
        let pixelsPerPathX = MathF.Max(MathF.Sqrt(m00 * m00 + m10 * m10), PathMinPixelsPerUnit)
        let pixelsPerPathY = MathF.Max(MathF.Sqrt(m01 * m01 + m11 * m11), PathMinPixelsPerUnit)

        let strokePadding = if mask.Stroke.Width > 0.0F {
            resolveShapeStrokeExtent(mask.Stroke.Width, mask.Stroke.Join, mask.Stroke.MiterLimit, mask.Stroke.Cap) *
                MathF.Max(textScaleX, textScaleY) + 2.0F
        } else {
            2.0F
        }
        WriteIntersectedScreenBounds(entryBase, mask.Bounds, mask.PathBounds, transform, 2.0F, strokePadding)
        stagingWords[entryBase + 4] = FloatBits(inv00)
        stagingWords[entryBase + 5] = FloatBits(inv01)
        stagingWords[entryBase + 6] = FloatBits(invTx)
        stagingWords[entryBase + 7] = FloatBits(pixelsPerPathX)
        stagingWords[entryBase + 8] = FloatBits(inv10)
        stagingWords[entryBase + 9] = FloatBits(inv11)
        stagingWords[entryBase + 10] = FloatBits(invTy)
        stagingWords[entryBase + 11] = FloatBits(pixelsPerPathY)

        if TryComputeBoxInverse(mask.Bounds, transform, out var b0, out var b1) {
            stagingWords[entryBase + 12] = FloatBits(b0.inv00)
            stagingWords[entryBase + 13] = FloatBits(b0.inv01)
            stagingWords[entryBase + 14] = FloatBits(b0.invTx)
            stagingWords[entryBase + 15] = FloatBits(mask.Bounds.Width)
            stagingWords[entryBase + 16] = FloatBits(b1.inv10)
            stagingWords[entryBase + 17] = FloatBits(b1.inv11)
            stagingWords[entryBase + 18] = FloatBits(b1.invTy)
            stagingWords[entryBase + 19] = FloatBits(mask.Bounds.Height)
        }
        stagingWords[entryBase + 20] = VulkanShaderAbi.GooScissorKindPathBand
        stagingWords[entryBase + 21] = mask.AtlasWordOffset
        stagingWords[entryBase + 22] = if mask.FillRule == 1u { 1u } else { 0u }
        stagingWords[entryBase + 23] = if mask.Stroke.Width > 0.0F {
            strokeData?.StyleOffset(maskIndex, true) ?? 0u
        } else {
            0u
        }
    }

    private func WriteRoundedBoxRecord(
        entryBase int32,
        bounds ConservativeBounds,
        topLeft float32,
        topRight float32,
        bottomRight float32,
        bottomLeft float32,
        transform PrimitiveTransform
    ) {
        if bounds.IsEmpty || !TryComputeBoxInverse(bounds, transform, out var b0, out var b1) {
            stagingWords[entryBase + 20] = VulkanShaderAbi.GooScissorKindZero
            return
        }
        WriteScreenBounds(entryBase, bounds, transform, 2.0F)
        stagingWords[entryBase + 4] = FloatBits(b0.inv00)
        stagingWords[entryBase + 5] = FloatBits(b0.inv01)
        stagingWords[entryBase + 6] = FloatBits(b0.invTx)
        stagingWords[entryBase + 7] = FloatBits(bounds.Width)
        stagingWords[entryBase + 8] = FloatBits(b1.inv10)
        stagingWords[entryBase + 9] = FloatBits(b1.inv11)
        stagingWords[entryBase + 10] = FloatBits(b1.invTy)
        stagingWords[entryBase + 11] = FloatBits(bounds.Height)
        stagingWords[entryBase + 12] = FloatBits(topLeft)
        stagingWords[entryBase + 13] = FloatBits(topRight)
        stagingWords[entryBase + 14] = FloatBits(bottomRight)
        stagingWords[entryBase + 15] = FloatBits(bottomLeft)
        stagingWords[entryBase + 20] = VulkanShaderAbi.GooScissorKindRoundedBox
    }

    private func WriteScreenBounds(
        entryBase int32,
        bounds ConservativeBounds,
        transform PrimitiveTransform,
        inflation float32
    ) {
        TransformScreenAabb(bounds, transform, inflation, out var minX, out var minY, out var maxX, out var maxY)
        stagingWords[entryBase + 0] = FloatBits(minX)
        stagingWords[entryBase + 1] = FloatBits(minY)
        stagingWords[entryBase + 2] = FloatBits(maxX)
        stagingWords[entryBase + 3] = FloatBits(maxY)
    }

    private func WriteIntersectedScreenBounds(
        entryBase int32,
        bounds ConservativeBounds,
        pathBounds ConservativeBounds,
        transform PrimitiveTransform,
        boundsInflation float32,
        pathInflation float32
    ) {
        TransformScreenAabb(bounds, transform, boundsInflation, out var minX, out var minY, out var maxX, out var maxY)
        if !pathBounds.IsEmpty {
            TransformScreenAabb(
                pathBounds,
                transform,
                pathInflation,
                out var pathMinX,
                out var pathMinY,
                out var pathMaxX,
                out var pathMaxY
            )
            let clippedMinX = MathF.Max(minX, pathMinX)
            let clippedMinY = MathF.Max(minY, pathMinY)
            let clippedMaxX = MathF.Min(maxX, pathMaxX)
            let clippedMaxY = MathF.Min(maxY, pathMaxY)
            if clippedMaxX > clippedMinX && clippedMaxY > clippedMinY {
                minX = clippedMinX
                minY = clippedMinY
                maxX = clippedMaxX
                maxY = clippedMaxY
            }
        }
        stagingWords[entryBase + 0] = FloatBits(minX)
        stagingWords[entryBase + 1] = FloatBits(minY)
        stagingWords[entryBase + 2] = FloatBits(maxX)
        stagingWords[entryBase + 3] = FloatBits(maxY)
    }

    private func TransformScreenAabb(
        bounds ConservativeBounds,
        transform PrimitiveTransform,
        inflation float32,
        out minX float32,
        out minY float32,
        out maxX float32,
        out maxY float32
    ) {
        let x0 = bounds.X
        let y0 = bounds.Y
        let x1 = bounds.Right
        let y1 = bounds.Bottom
        let sx0 = transform.A * x0 + transform.C * y0 + transform.TX
        let sy0 = transform.B * x0 + transform.D * y0 + transform.TY
        let sx1 = transform.A * x1 + transform.C * y0 + transform.TX
        let sy1 = transform.B * x1 + transform.D * y0 + transform.TY
        let sx2 = transform.A * x1 + transform.C * y1 + transform.TX
        let sy2 = transform.B * x1 + transform.D * y1 + transform.TY
        let sx3 = transform.A * x0 + transform.C * y1 + transform.TX
        let sy3 = transform.B * x0 + transform.D * y1 + transform.TY
        minX = MathF.Min(MathF.Min(sx0, sx1), MathF.Min(sx2, sx3)) - inflation
        minY = MathF.Min(MathF.Min(sy0, sy1), MathF.Min(sy2, sy3)) - inflation
        maxX = MathF.Max(MathF.Max(sx0, sx1), MathF.Max(sx2, sx3)) + inflation
        maxY = MathF.Max(MathF.Max(sy0, sy1), MathF.Max(sy2, sy3)) + inflation
    }

    private data struct BoxRow0(inv00 float32, inv01 float32, invTx float32) { }
    private data struct BoxRow1(inv10 float32, inv11 float32, invTy float32) { }

    private func TryComputeBoxInverse(
        bounds ConservativeBounds,
        transform PrimitiveTransform,
        out row0 BoxRow0,
        out row1 BoxRow1
    ) bool {
        let det = transform.A * transform.D - transform.B * transform.C
        if MathF.Abs(det) <= 1e-7F {
            row0 = BoxRow0{}
            row1 = BoxRow1{}
            return false
        }
        let invDet = 1.0F / det
        let inv00 = transform.D * invDet
        let inv01 = -transform.C * invDet
        let inv10 = -transform.B * invDet
        let inv11 = transform.A * invDet
        row0 = BoxRow0(inv00, inv01, -(inv00 * transform.TX + inv01 * transform.TY) - bounds.X)
        row1 = BoxRow1(inv10, inv11, -(inv10 * transform.TX + inv11 * transform.TY) - bounds.Y)
        return true
    }

    private func ResolveFrameTransform(frame SceneFrame, index int32) PrimitiveTransform {
        var result = PrimitiveTransform{ A: 1.0F, D: 1.0F }
        var current = index
        var steps = 0
        var scrollX = 0.0F
        var scrollY = 0.0F
        while current >= 0 {
            if current >= frame.TransformCount || steps >= frame.TransformCount {
                throw InvalidOperationException("Vulkan scissor transform chain is invalid")
            }
            let value = frame.Transforms[current]
            if value.IsScrollPlacement {
                scrollX += value.TX
                scrollY += value.TY
            } else {
                result = PrimitiveTransform{
                    A: value.A * result.A + value.C * result.B,
                    B: value.B * result.A + value.D * result.B,
                    C: value.A * result.C + value.C * result.D,
                    D: value.B * result.C + value.D * result.D,
                    TX: value.A * result.TX + value.C * result.TY + value.TX,
                    TY: value.B * result.TX + value.D * result.TY + value.TY,
                }
            }
            current = value.ParentIndex
            steps++
        }
        result.TX -= scrollX
        result.TY -= scrollY
        return result
    }

    private func UpdateSlotDescriptorIfNeeded(
        slotIndex int32,
        slot VulkanScissorTableSlot,
        byteCount VkDeviceSize,
        pathBuffer VkBuffer
    ) {
        if slot.BoundBufferGeneration == slot.Table.Generation
            && slot.BoundPathAtlasBuffer == pathBuffer {
            return
        }
        let descriptorSet = descriptors.Sets[slotIndex]
        VulkanDescriptorFactory.WriteStorageBuffer(
            device,
            dispatch,
            descriptorSet,
            0u,
            slot.Table.DeviceBuffer,
            0uL,
            VkDeviceSize(VkConstants.VK_WHOLE_SIZE)
        )
        VulkanDescriptorFactory.WriteStorageBuffer(
            device,
            dispatch,
            descriptorSet,
            1u,
            pathBuffer,
            0uL,
            VkDeviceSize(VkConstants.VK_WHOLE_SIZE)
        )
        slot.BoundBufferGeneration = slot.Table.Generation
        slot.BoundPathAtlasBuffer = pathBuffer
    }

    private func CreateDescriptorResources() {
        var poolSize = VkDescriptorPoolSize{
            _type: VkConstants.VK_DESCRIPTOR_TYPE_STORAGE_BUFFER,
            descriptorCount: uint32(slotCount * 2),
        }
        let layouts *VkDescriptorSetLayout = stackalloc[2]VkDescriptorSetLayout
        for index in 0 ... slotCount {
            layouts[index] = descriptorSetLayout
        }
        fixed descriptorPointer *VkDescriptorSet = descriptors.Sets {
            descriptors.Adopt(
                VulkanDescriptorFactory.CreatePoolAndAllocate(
                    device,
                    dispatch,
                    objectAccounting,
                    &poolSize,
                    1u,
                    layouts,
                    uint32(slotCount),
                    descriptorPointer
                )
            )
        }
    }

    private func DestroyDescriptorResources() {
        descriptors.Destroy()
    }

    private func CreateFallbackPathBuffer() {
        let creation = VulkanBufferFactory.CreateMapped(
            device,
            dispatch,
            allocator,
            objectAccounting,
            16uL,
            uint32(VkConstants.VK_BUFFER_USAGE_STORAGE_BUFFER_BIT),
            VulkanMemoryPolicy.HostVisibleCoherentCached
        )
        fallbackPathBuffer = creation.Buffer
        fallbackPathAllocation = creation.Allocation
        fallbackPathAccounted = objectAccounting != nil
        let pointer = *uint32(nint(creation.Allocation.mapped))
        for i in 0 ... 4 {
            pointer[i] = 0u
        }
        let _ = allocator.FlushBeforeSubmit(creation.Allocation, 0uL, 16uL)
    }

    private func DestroyFallbackPathBuffer() {
        if fallbackPathBuffer != VkBuffer.Null {
            let stale = fallbackPathBuffer
            fallbackPathBuffer = VkBuffer.Null
            let destroyBuffer = dispatch.vkDestroyBuffer
            try { destroyBuffer(device, stale, nil) } catch (cleanup Exception) { }
            if fallbackPathAccounted {
                if let accounting = objectAccounting {
                    try { accounting.Release() } catch (cleanup Exception) { }
                }
                fallbackPathAccounted = false
            }
        }
        if let allocation = fallbackPathAllocation {
            fallbackPathAllocation = nil
            try { allocator.Release(allocation) } catch (cleanup Exception) { }
        }
    }

    private func DisposeSlots() {
        for slot in slots {
            slot.Table.Lifecycle.Reset()
            slot.Dispose()
        }
    }

    private func EnsureOpen() {
        if disposed {
            throw ObjectDisposedException("VulkanScissorTable")
        }
    }

    private func FloatBits(value float32) uint32 ->
        uint32(BitConverter.SingleToInt32Bits(value))

    private func MixHash(hash uint64, value uint64) uint64 ->
        (hash ^ value) * HashPrime

    deinit {
        try { Dispose() } catch (cleanup Exception) { }
    }
}
