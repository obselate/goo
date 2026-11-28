package Goo

import System
import System.Runtime.CompilerServices

internal unsafe sealed class VulkanGpuTableSlot : IDisposable {
    internal var Buffers VulkanFrameBuffers
    internal var Lifecycle VulkanFrameSlotLifecycle
    internal var PreparedByteCount VkDeviceSize
    internal var PreparedElementCount int32
    internal var HistoryWords []uint32
    internal var HistoryElementCount int32
    internal var HistoryBufferGeneration uint64
    internal var HistoryValid bool
    internal var PreparedRanges []VkBufferCopy
    internal var PreparedRangeCount int32
    internal var Staged bool
    internal var disposed bool

    internal init(
        nativeDevice VkDevice,
        nativeDispatch VkDeviceDispatch,
        nativeAllocator VulkanMemoryAllocator,
        nativeObjectAccounting VulkanObjectAccounting?,
        staged bool = true
    ) {
        Buffers = VulkanFrameBuffers{
            Device: nativeDevice,
            Dispatch: nativeDispatch,
            Allocator: nativeAllocator,
            ObjectAccounting: nativeObjectAccounting
        }
        Lifecycle = VulkanFrameSlotLifecycle{}
        HistoryWords = [0]uint32
        PreparedRanges = [0]VkBufferCopy
        Staged = staged
    }

    internal prop MappedPointer *void { get -> Buffers.Mapped }
    internal prop DeviceBuffer VkBuffer { get -> Buffers.Buffer }
    internal prop Capacity VkDeviceSize { get -> Buffers.Capacity }
    internal prop Generation uint64 { get -> Buffers.Generation }

    internal func EnsureCapacity(
        requiredBytes VkDeviceSize,
        initialBytes VkDeviceSize,
        completedSubmissionSerial uint64,
        usage VkBufferUsageFlags = uint32(VkConstants.VK_BUFFER_USAGE_STORAGE_BUFFER_BIT)
    ) bool {
        if Lifecycle.LastUseSerial > completedSubmissionSerial {
            throw InvalidOperationException("Vulkan GPU table slot is still in flight")
        }
        if Lifecycle.Prepared || Lifecycle.Recorded {
            throw InvalidOperationException("Vulkan GPU table slot has prepared work")
        }
        try {
            let reallocated = if Staged {
                Buffers.EnsureStagedCapacity(requiredBytes, initialBytes)
            } else {
                Buffers.EnsureMappedCapacity(requiredBytes, initialBytes, usage)
            }
            if reallocated {
                InvalidateHistory()
            }
            return reallocated
        } catch (error Exception) {
            InvalidateHistory()
            rethrow
        }
    }

    internal func EnsureHistoryWordCapacity(requiredWords int32) {
        HistoryWords = GrowArray(HistoryWords, HistoryWords.Length, requiredWords, 256)
    }

    internal func EnsureRangeCapacity(requiredRanges int32) {
        PreparedRanges = GrowArray(PreparedRanges, PreparedRanges.Length, requiredRanges, 8)
    }

    internal func InvalidateHistory() {
        HistoryElementCount = 0
        HistoryBufferGeneration = 0uL
        HistoryValid = false
    }

    internal func Flush(byteCount VkDeviceSize, out nativeCall bool) VkResult ->
        Buffers.Flush(0uL, byteCount, out nativeCall)

    internal func RecordUpload(
        commandBuffer VkCommandBuffer,
        dispatch VkDeviceDispatch,
        barrierBytes VkDeviceSize,
        destinationStages VkPipelineStageFlags2
    ) VkDeviceSize {
        if !Staged || PreparedRangeCount <= 0 {
            return 0uL
        }
        Buffers.RecordUpload(
            commandBuffer,
            dispatch,
            PreparedRanges,
            PreparedRangeCount,
            barrierBytes,
            destinationStages
        )
        var submitted VkDeviceSize
        var index int32
        while index < PreparedRangeCount {
            submitted += PreparedRanges[index].size
            index++
        }
        return submitted
    }

    internal func DestroyBuffers() {
        Buffers.Destroy()
        PreparedByteCount = 0uL
        PreparedElementCount = 0
        PreparedRangeCount = 0
        Lifecycle.FlushPrepared = false
        Lifecycle.Recorded = false
        Lifecycle.RecordedCommandBuffer = VkCommandBuffer.Null
        InvalidateHistory()
    }

    public func Dispose() {
        if disposed {
            return
        }
        if Lifecycle.Prepared || Lifecycle.Recorded || Lifecycle.Submitted || Lifecycle.LastUseSerial != 0uL {
            throw InvalidOperationException("Vulkan GPU table slot is in use")
        }
        disposed = true
        DestroyBuffers()
    }

    deinit {
        try {
            Dispose()
        } catch (cleanup Exception) {
        }
    }
}

internal unsafe sealed class VulkanGpuTable[T] : IDisposable {
    private let slots []VulkanGpuTableSlot
    private let staged bool
    private let initialBytes VkDeviceSize
    private let maxStorageBufferRange VkDeviceSize
    private var preparedSlot int32 = -1
    private var disposed bool

    internal init(
        nativeDevice VkDevice,
        nativeDispatch VkDeviceDispatch,
        nativeAllocator VulkanMemoryAllocator,
        nativeMaxStorageBufferRange VkDeviceSize,
        nativeSlotCount int32,
        nativeObjectAccounting VulkanObjectAccounting?,
        staged bool = true,
        initialBytes VkDeviceSize = 4096uL
    ) {
        if nativeDevice == VkDevice.Null {
            throw ArgumentException("Vulkan device is null", "nativeDevice")
        }
        if nativeAllocator == nil {
            throw ArgumentNullException("nativeAllocator")
        }
        if nativeSlotCount < 1 || nativeSlotCount > 2 {
            throw ArgumentOutOfRangeException("nativeSlotCount")
        }
        let minStride = VkDeviceSize(Unsafe.SizeOf[T]())
        if nativeMaxStorageBufferRange < minStride {
            throw ArgumentOutOfRangeException("nativeMaxStorageBufferRange")
        }
        this.staged = staged
        this.initialBytes = initialBytes
        this.maxStorageBufferRange = nativeMaxStorageBufferRange
        slots = [nativeSlotCount]VulkanGpuTableSlot
        var index int32
        while index < nativeSlotCount {
            slots[index] = VulkanGpuTableSlot(
                nativeDevice,
                nativeDispatch,
                nativeAllocator,
                nativeObjectAccounting,
                staged
            )
            index++
        }
    }

    internal prop SlotCount int32 { get -> slots.Length }
    internal prop PreparedSlot int32 { get -> preparedSlot }
    internal prop StrideBytes VkDeviceSize { get -> VkDeviceSize(Unsafe.SizeOf[T]()) }

    internal func SlotAt(slotIndex int32) VulkanGpuTableSlot {
        if slotIndex < 0 || slotIndex >= slots.Length {
            throw ArgumentOutOfRangeException("slotIndex")
        }
        return slots[slotIndex]
    }

    internal func Prepare(
        slotIndex int32,
        elementCount int32,
        completedSubmissionSerial uint64,
        usage VkBufferUsageFlags = uint32(VkConstants.VK_BUFFER_USAGE_STORAGE_BUFFER_BIT)
    ) Span[T] {
        if disposed {
            throw ObjectDisposedException("VulkanGpuTable")
        }
        if elementCount < 0 {
            throw ArgumentOutOfRangeException("elementCount")
        }
        let slot = SlotAt(slotIndex)
        let resolvedCount = elementCount > 0 ? elementCount : 1
        let requiredBytes = VkDeviceSize(resolvedCount) * StrideBytes
        if requiredBytes > maxStorageBufferRange {
            throw ArgumentOutOfRangeException("elementCount")
        }
        slot.EnsureCapacity(requiredBytes, initialBytes, completedSubmissionSerial, usage)
        slot.Lifecycle.Begin()
        slot.PreparedElementCount = resolvedCount
        slot.PreparedByteCount = requiredBytes
        preparedSlot = slotIndex
        return Span[T](slot.MappedPointer, resolvedCount)
    }

    internal func ValidateSubmission(slotIndex int32, submissionSerial uint64) {
        let slot = SlotAt(slotIndex)
        if !slot.Lifecycle.Prepared || !slot.Lifecycle.FlushPrepared || !slot.Lifecycle.Recorded {
            throw InvalidOperationException("Vulkan GPU table submission is incomplete")
        }
        if submissionSerial == 0uL {
            throw ArgumentOutOfRangeException("submissionSerial")
        }
    }

    internal func MarkSubmitted(slotIndex int32, submissionSerial uint64) {
        ValidateSubmission(slotIndex, submissionSerial)
        SlotAt(slotIndex).Lifecycle.AcceptSubmission(submissionSerial)
        if preparedSlot == slotIndex {
            preparedSlot = -1
        }
    }

    internal func ReconcileSubmitted(completedSubmissionSerial uint64) {
        Collect(completedSubmissionSerial)
    }

    internal func Collect(completedSubmissionSerial uint64) {
        var index int32
        while index < slots.Length {
            slots[index].Lifecycle.Collect(completedSubmissionSerial)
            index++
        }
    }

    internal func Abort(slotIndex int32) {
        if slotIndex < 0 || slotIndex >= slots.Length {
            return
        }
        slots[slotIndex].Lifecycle.Abort()
        if preparedSlot == slotIndex {
            preparedSlot = -1
        }
    }

    internal func ResetAfterDeviceLoss() {
        var index int32
        while index < slots.Length {
            slots[index].Lifecycle.Reset()
            slots[index].DestroyBuffers()
            index++
        }
        preparedSlot = -1
    }

    public func Dispose() {
        if disposed {
            return
        }
        disposed = true
        var index int32
        while index < slots.Length {
            slots[index].Lifecycle.Reset()
            slots[index].Dispose()
            index++
        }
        preparedSlot = -1
    }
}
