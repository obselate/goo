package Goo

import System
import System.Collections.Generic
import System.Runtime.CompilerServices

private data struct PathStrokeMetricKey(Id uint64, Revision uint64, A float32, B float32, C float32, D float32) { }

private class PathStrokeDashWords {
    internal let Words[]uint32
    internal let Total float32
    internal var Offset int32 = -1
    internal var Frame uint64

    internal init(pattern DashPattern) {
        Words = [pattern.Intervals.Count]uint32
        var total = 0.0F
        for index in 0 ... Words.Length {
            let interval = float32(pattern.Intervals[index])
            Words[index] = uint32(BitConverter.SingleToInt32Bits(interval))
            total += interval
        }
        Total = total
    }
}

private unsafe class PathStrokeFrameSlot {
    internal var Buffers VulkanFrameBuffers
    internal var Lifecycle VulkanFrameSlotLifecycle
    internal var DescriptorGeneration uint64
    internal var DescriptorBytes uint64

    internal init(
        device VkDevice,
        dispatch VkDeviceDispatch,
        allocator VulkanMemoryAllocator,
        accounting VulkanObjectAccounting?
    ) {
        Buffers = VulkanFrameBuffers{
            Device: device,
            Dispatch: dispatch,
            Allocator: allocator,
            ObjectAccounting: accounting
        }
    }
}

internal unsafe class VulkanPathStrokeFrameData : IDisposable {
    shared {
        internal var MetricBuildCount uint64
    }

    private const RequestWords int32 = 8
    private const StyleWords int32 = 11
    private let device VkDevice
    private let dispatch VkDeviceDispatch
    private let shared VulkanSharedPrimitiveState
    private let maxBytes uint64
    private let slots[]PathStrokeFrameSlot
    private var descriptors VulkanFrameDescriptorOwner
    private let metrics Dictionary[PathStrokeMetricKey, int32] = Dictionary[PathStrokeMetricKey, int32]()
    private let dashWords ConditionalWeakTable[DashPattern, PathStrokeDashWords] = ConditionalWeakTable[
        DashPattern,
        PathStrokeDashWords
    ]()
    private let frameDashes Dictionary[DashPattern, PathStrokeDashWords] = Dictionary[
        DashPattern,
        PathStrokeDashWords
    ]()
    private var words[]uint32 = [256]uint32
    private var requests[]int32 = [16]int32
    private var pathStyles[]uint32 = [16]uint32
    private var maskStyles[]uint32 = [16]uint32
    private var wordCount int32
    private var requestCount int32
    private var metricCount int32
    private var frame uint64
    private var preparedSlot int32 = -1
    private var preparedBytes uint64
    private var disposed bool

    internal prop LiveObjectCount uint64 {
        get {
            var count = descriptors.LiveObjectCount
            for slot in slots {
                count += slot.Buffers.LiveObjectCount
            }
            return count
        }
    }

    internal init(
        device VkDevice,
        dispatch VkDeviceDispatch,
        allocator VulkanMemoryAllocator,
        shared VulkanSharedPrimitiveState,
        slotCount int32,
        maxBytes uint64,
        accounting VulkanObjectAccounting?
    ) {
        this.device = device
        this.dispatch = dispatch
        this.shared = shared
        this.maxBytes = maxBytes
        slots = [slotCount]PathStrokeFrameSlot
        for index in 0 ... slots.Length {
            slots[index] = PathStrokeFrameSlot(device, dispatch, allocator, accounting)
        }
        descriptors = VulkanFrameDescriptorOwner{
            Device: device,
            Dispatch: dispatch,
            ObjectAccounting: accounting,
            Sets: [slotCount]VkDescriptorSet,
        }
    }

    internal func Begin(pathCount int32, maskCount int32) {
        frame++
        wordCount = 0
        requestCount = 0
        metricCount = 0
        metrics.Clear()
        frameDashes.Clear()
        pathStyles = GrowArray(pathStyles, 0, pathCount, 16)
        maskStyles = GrowArray(maskStyles, 0, maskCount, 16)
    }

    internal func Add(
        index int32,
        mask bool,
        path ResourceId,
        baseWord uint32,
        curves uint32,
        scaleX float32,
        scaleY float32,
        style PathStrokeStyle,
        transform PrimitiveTransform,
        dpiX float32,
        dpiY float32
    ) {
        let key = PathStrokeMetricKey(
            path.LogicalId,
            path.Version,
            transform.A * scaleX / dpiX,
            transform.C * scaleY / dpiX,
            transform.B * scaleX / dpiY,
            transform.D * scaleY / dpiY
        )
        let request = if metrics.TryGetValue(key, out var existing) {
            existing
        } else {
            let offset = Reserve(RequestWords)
            words[offset] = baseWord
            words[offset + 1] = 0u
            let xx = float64(key.A) * float64(key.A) + float64(key.C) * float64(key.C)
            let yy = float64(key.B) * float64(key.B) + float64(key.D) * float64(key.D)
            let xy = float64(key.A) * float64(key.B) + float64(key.C) * float64(key.D)
            words[offset + 3] = Bits(xx == yy && xy == 0.0 ? float32(Math.Sqrt(xx)): 0.0F)
            words[offset + 4] = Bits(key.A)
            words[offset + 5] = Bits(key.B)
            words[offset + 6] = Bits(key.C)
            words[offset + 7] = Bits(key.D)
            requests = GrowArray(requests, requestCount, requestCount + 1, 16)
            requests[requestCount] = offset
            requestCount++
            metrics.Add(key, offset)
            offset
        }
        if (style.Start != 0.0F || style.End != 1.0F || (style.Dashes?.Intervals.Count ?? 0) != 0)
        && words[request + 3] == 0u && words[request + 1] == 0u {
            words[request + 1] = curves
            metricCount++
        }
        let offset = Reserve(StyleWords)
        words[offset] = uint32(request)
        words[offset + 1] = 0u
        words[offset + 2] = 0u
        words[offset + 3] = uint32(int32(style.Cap))
        words[offset + 4] = Bits(style.Width)
        words[offset + 5] = Bits(style.MiterLimit)
        words[offset + 6] = Bits(style.Start)
        words[offset + 7] = Bits(style.End)
        words[offset + 8] = 0u
        words[offset + 9] = 0u
        words[offset + 10] = uint32(int32(style.Join))
        if let pattern = style.Dashes {
            let packed = PackDashes(pattern)
            words[offset + 1] = uint32(packed.Offset)
            words[offset + 2] = uint32(pattern.Intervals.Count)
            words[offset + 8] = Bits(float32(pattern.Offset))
            words[offset + 9] = Bits(packed.Total)
        }
        if mask {
            maskStyles[index] = uint32(offset + 1)
        } else {
            pathStyles[index] = uint32(offset + 1)
        }
    }

    private func PackDashes(pattern DashPattern) PathStrokeDashWords {
        if frameDashes.TryGetValue(pattern, out var found) {
            return found
        }
        let packed = dashWords.GetValue(pattern, (value) -> PathStrokeDashWords(value))
        let count = packed.Words.Length
        let offset = Reserve(count)
        if packed.Offset != offset || packed.Frame + 1uL != frame {
            Array.Copy(packed.Words, 0, words, offset, count)
            packed.Offset = offset
        }
        packed.Frame = frame
        frameDashes.Add(pattern, packed)
        return packed
    }

    internal func FinishPrepare(slotIndex int32, completed uint64) {
        if requestCount == 0 {
            return
        }
        let slot = slots[slotIndex]
        slot.Lifecycle.Collect(completed)
        if slot.Lifecycle.LastUseSerial > completed || slot.Lifecycle.Prepared {
            throw InvalidOperationException("Vulkan stroke frame slot is still in use")
        }
        var totalWords = uint64(wordCount)
        for index in 0 ... requestCount {
            let offset = requests[index]
            words[offset + 2] = uint32(totalWords)
            if words[offset + 1] != 0u {
                totalWords += uint64(words[offset + 1]) * 2uL + 1uL
            }
        }
        if totalWords > maxBytes / 4uL || totalWords > uint64(Int32.MaxValue) {
            throw InvalidOperationException("Vulkan stroke frame exceeds storage buffer capacity")
        }
        preparedBytes = totalWords * 4uL
        slot.Buffers.EnsureMappedCapacity(preparedBytes, 4096uL, uint32(VkConstants.VK_BUFFER_USAGE_STORAGE_BUFFER_BIT))
        if descriptors.Pool == 0uL {
            CreateDescriptors()
        }
        if slot.DescriptorGeneration != slot.Buffers.Generation || slot.DescriptorBytes != preparedBytes {
            VulkanDescriptorFactory.WriteStorageBuffer(
                device,
                dispatch,
                descriptors.Sets[slotIndex],
                0u,
                slot.Buffers.Buffer,
                0uL,
                preparedBytes
            )
            slot.DescriptorGeneration = slot.Buffers.Generation
            slot.DescriptorBytes = preparedBytes
        }
        fixed source *uint32 = words {
            Buffer.MemoryCopy(source, slot.Buffers.Mapped, int64(slot.Buffers.Capacity), int64(wordCount) * 4L)
        }
        let result = slot.Buffers.Flush(0uL, uint64(wordCount) * 4uL)
        if result != VkConstants.VK_SUCCESS {
            throw InvalidOperationException("Vulkan stroke constants flush failed")
        }
        slot.Lifecycle.Begin()
        preparedSlot = slotIndex
    }

    internal func RecordMetrics(commandBuffer VkCommandBuffer, atlas VulkanPathAtlas) {
        if preparedSlot < 0 {
            return
        }
        let slot = slots[preparedSlot]
        if metricCount == 0 {
            slot.Lifecycle.Record(commandBuffer)
            return
        }
        let layout = shared.StrokeMetricPipelineLayout
        let bindPipeline = dispatch.vkCmdBindPipeline
        bindPipeline(commandBuffer, VkConstants.VK_PIPELINE_BIND_POINT_COMPUTE, shared.StrokeMetricPipeline)
        let sets *VkDescriptorSet = stackalloc[2]VkDescriptorSet
        sets[0] = atlas.DescriptorSet
        sets[1] = descriptors.Sets[preparedSlot]
        let bindSets = dispatch.vkCmdBindDescriptorSets
        bindSets(commandBuffer, VkConstants.VK_PIPELINE_BIND_POINT_COMPUTE, layout, 0u, 2u, sets, 0u, nil)
        let push = dispatch.vkCmdPushConstants
        let compute = dispatch.vkCmdDispatch
        for index in 0 ... requestCount {
            if words[requests[index] + 1] == 0u {
                continue
            }
            var constants = StrokeMetricPushConstants{request: uint32(requests[index])}
            push(commandBuffer, layout, uint32(VkConstants.VK_SHADER_STAGE_COMPUTE_BIT), 0u, 4u, *void(&constants))
            compute(commandBuffer, 1u, 1u, 1u)
            MetricBuildCount++
        }
        VulkanTransitions.RecordBuffer(
            commandBuffer,
            dispatch.vkCmdPipelineBarrier2,
            slot.Buffers.Buffer,
            0uL,
            preparedBytes,
            VkConstants.VK_PIPELINE_STAGE_2_COMPUTE_SHADER_BIT,
            VkConstants.VK_ACCESS_2_SHADER_STORAGE_WRITE_BIT,
            VkConstants.VK_PIPELINE_STAGE_2_FRAGMENT_SHADER_BIT,
            VkConstants.VK_ACCESS_2_SHADER_STORAGE_READ_BIT
        )
        slot.Lifecycle.Record(commandBuffer)
    }

    internal func StyleOffset(index int32, mask bool) uint32 -> mask ? maskStyles[index]: pathStyles[index]

    internal func Bind(commandBuffer VkCommandBuffer, layout VkPipelineLayout, set uint32) {
        if preparedSlot < 0 {
            throw InvalidOperationException("Vulkan stroke constants are not prepared")
        }
        descriptors.Bind(preparedSlot, commandBuffer, layout, set)
    }

    internal func ValidateSubmission(serial uint64) {
        if preparedSlot < 0 {
            return
        }
        let slot = slots[preparedSlot]
        if serial == 0uL || !slot.Lifecycle.Prepared || !slot.Lifecycle.Recorded {
            throw InvalidOperationException("Vulkan stroke frame submission is not prepared")
        }
    }

    internal func MarkSubmitted(slotIndex int32, serial uint64) {
        let slot = slots[slotIndex]
        if slot.Lifecycle.Prepared {
            slot.Lifecycle.AcceptSubmission(serial)
        }
        if preparedSlot == slotIndex {
            preparedSlot = -1
        }
    }

    internal func Abort(slotIndex int32) {
        if slots[slotIndex].Lifecycle.Prepared {
            slots[slotIndex].Lifecycle.Abort()
        }
        if preparedSlot == slotIndex {
            preparedSlot = -1
        }
    }

    internal func Collect(completed uint64) {
        for slot in slots {
            slot.Lifecycle.Collect(completed)
        }
    }

    internal func DisposeAfterDeviceLoss() {
        for slot in slots {
            slot.Lifecycle.Reset()
        }
        preparedSlot = -1
        Dispose()
    }

    public func Dispose() {
        if disposed {
            return
        }
        for slot in slots {
            if slot.Lifecycle.Prepared || slot.Lifecycle.Submitted || slot.Lifecycle.LastUseSerial != 0uL {
                throw InvalidOperationException("Vulkan stroke frame data is still in use")
            }
        }
        disposed = true
        descriptors.Destroy()
        for slot in slots {
            slot.Buffers.Destroy()
        }
    }

    private func CreateDescriptors() {
        let count = slots.Length
        let layouts = [count]VkDescriptorSetLayout
        for index in 0 ... count {
            layouts[index] = shared.StrokeDescriptorSetLayout
        }
        var size = VkDescriptorPoolSize{
            _type: VkConstants.VK_DESCRIPTOR_TYPE_STORAGE_BUFFER,
            descriptorCount: uint32(count)
        }
        fixed layoutPointer *VkDescriptorSetLayout = layouts {
            fixed setPointer *VkDescriptorSet = descriptors.Sets {
                descriptors.Adopt(
                    VulkanDescriptorFactory.CreatePoolAndAllocate(
                        device,
                        dispatch,
                        descriptors.ObjectAccounting,
                        &size,
                        1u,
                        layoutPointer,
                        uint32(count),
                        setPointer
                    )
                )
            }
        }
    }

    private func Reserve(count int32) int32 {
        if count < 0 || uint64(wordCount) + uint64(count) > maxBytes / 4uL {
            throw InvalidOperationException("Vulkan stroke constants exceed storage buffer capacity")
        }
        let offset = wordCount
        words = GrowArray(words, wordCount, wordCount + count, 256)
        wordCount += count
        return offset
    }

    private func Bits(value float32) uint32 -> uint32(BitConverter.SingleToInt32Bits(value))
}
