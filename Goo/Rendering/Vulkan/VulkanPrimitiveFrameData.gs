package Goo

import System
import System.Runtime.InteropServices

internal data struct VulkanPrimitiveFrameStats {
  var SlotIndex int32
  var RecordCount int32
  var ByteCount VkDeviceSize
  var Capacity VkDeviceSize
  var BufferGeneration uint64
  var PlannedTransferBytes VkDeviceSize
  var SkippedTransferBytes VkDeviceSize
  var DirtyRecordCount int32
  var UploadRangeCount int32
  var FullUpload bool
  var CpuWriteOperations uint64
  var NativeFlushCalls uint64
  var RetainedReuse uint64
  var LastUseSerial uint64
  var Prepared bool

  var CpuWrittenBytes uint64
  var CpuComparedBytes uint64
  var HistoryCopiedBytes uint64
  var FlushRequests uint64
  var SubmittedTransferBytes uint64
  var RecordedCopyCommands uint64
  var RecordedBarriers uint64

  var TotalCpuWrittenBytes uint64
  var TotalCpuComparedBytes uint64
  var TotalHistoryCopiedBytes uint64
  var TotalFlushRequests uint64
  var TotalSubmittedTransferBytes uint64
  var TotalRecordedCopyCommands uint64
  var TotalRecordedBarriers uint64
  var TotalPlannedTransferBytes VkDeviceSize
  var TotalSkippedTransferBytes VkDeviceSize
  var TotalDirtyRecordCount uint64
  var TotalUploadRangeCount uint64
  var TotalFullUploads uint64
  var TotalCpuWriteOperations uint64
  var TotalNativeFlushCalls uint64
  var TotalRetainedReuse uint64
}

internal unsafe sealed class VulkanPrimitiveFrameSlot : IDisposable {
  internal var Buffers VulkanFrameBuffers
  internal var Lifecycle VulkanFrameSlotLifecycle
  internal var PreparedByteCount VkDeviceSize
  internal var PreparedRecordCount int32
  internal var PreparedRecordRegionByteCount VkDeviceSize
  internal var PreparedEffectDataByteCount VkDeviceSize
  internal var HistoryWords []uint32
  internal var HistoryRecordCount int32
  internal var HistoryEffectDataOffset VkDeviceSize
  internal var HistoryEffectDataByteCount VkDeviceSize
  internal var HistoryEffectDataVersion uint64
  internal var HistoryBufferGeneration uint64
  internal var HistoryValid bool
  internal var PreparedRanges []VkBufferCopy
  internal var PreparedRangeCount int32
  internal var disposed bool

  internal init(nativeDevice VkDevice, nativeDispatch VkDeviceDispatch,
    nativeAllocator VulkanMemoryAllocator, nativeObjectAccounting VulkanObjectAccounting?) {
      Buffers = VulkanFrameBuffers{
        Device: nativeDevice,
        Dispatch: nativeDispatch,
        Allocator: nativeAllocator,
        ObjectAccounting: nativeObjectAccounting,
      }
      Lifecycle = VulkanFrameSlotLifecycle{}
      HistoryWords = [0]uint32
      HistoryRecordCount = 0
      HistoryBufferGeneration = 0uL
      HistoryValid = false
      PreparedRanges = [0]VkBufferCopy
      PreparedRangeCount = 0
    }

  internal func EnsureCapacity(required VkDeviceSize, completedSubmissionSerial uint64) {
    if Lifecycle.LastUseSerial > completedSubmissionSerial {
      throw InvalidOperationException("Vulkan primitive frame slot is still in flight")
    }
    if Lifecycle.Prepared || Lifecycle.Recorded {
      throw InvalidOperationException("Vulkan primitive frame slot has prepared work")
    }
    try {
      if Buffers.EnsureStagedCapacity(required, 4096uL) {
        InvalidateHistory()
      }
    } catch (error Exception) {
      InvalidateHistory()
      throw error
    }
  }

  internal func EnsureHistoryWordCapacity(requiredWords int32) {
    if requiredWords < 0 {
      throw ArgumentOutOfRangeException("requiredWords")
    }
    if requiredWords <= HistoryWords.Length {
      return
    }
    var next = if HistoryWords.Length == 0 { 256 } else { HistoryWords.Length }
    while next < requiredWords {
      if next > Int32.MaxValue / 2 {
        next = requiredWords
        break
      }
      next = next * 2
    }
    let replacement = [next]uint32
    Array.Copy(HistoryWords, replacement, HistoryWords.Length)
    HistoryWords = replacement
  }

  internal func EnsureRangeCapacity(recordCount int32) {
    if recordCount < 0 {
      throw ArgumentOutOfRangeException("recordCount")
    }
    if recordCount <= PreparedRanges.Length {
      return
    }
    var next = if PreparedRanges.Length == 0 { 8 } else { PreparedRanges.Length }
    while next < recordCount {
      if next > Int32.MaxValue / 2 {
        next = recordCount
        break
      }
      next = next * 2
    }
    let replacement = [next]VkBufferCopy
    var index int32 = 0
    while index < PreparedRanges.Length {
      replacement[index] = PreparedRanges[index]
      index++
    }
    PreparedRanges = replacement
  }

  internal func DestroyBuffers() {
    Buffers.Destroy()
    PreparedByteCount = 0uL
    PreparedRecordCount = 0
    PreparedRecordRegionByteCount = 0uL
    PreparedEffectDataByteCount = 0uL
    Lifecycle.FlushPrepared = false
    PreparedRangeCount = 0
    Lifecycle.Recorded = false
    Lifecycle.RecordedCommandBuffer = nint(0)
    InvalidateHistory()
  }

  internal func InvalidateHistory() {
    HistoryRecordCount = 0
    HistoryEffectDataOffset = 0uL
    HistoryEffectDataByteCount = 0uL
    HistoryEffectDataVersion = 0uL
    HistoryBufferGeneration = 0uL
    HistoryValid = false
  }

  public func Dispose() {
    if disposed {
      return
    }
    if Lifecycle.Prepared || Lifecycle.Recorded || Lifecycle.Submitted
      || Lifecycle.LastUseSerial != 0uL {
        throw InvalidOperationException("Vulkan primitive frame slot is in use")
      }
    disposed = true
    DestroyBuffers()
  }

  deinit{
    try { Dispose() } catch (cleanup Exception) { }
  }
}

internal unsafe sealed class VulkanPrimitiveFrameData : IDisposable {
  private const RecordBytes VkDeviceSize = 128uL
  private let device VkDevice
  private let dispatch VkDeviceDispatch
  private let allocator VulkanMemoryAllocator
  private let objectAccounting VulkanObjectAccounting?
  private let descriptorSetLayout VkDescriptorSetLayout
  private let effectDataDescriptorSetLayout VkDescriptorSetLayout
  private let maxStorageBufferRange VkDeviceSize
  private let slotCount int32
  private let slots []VulkanPrimitiveFrameSlot
  private var descriptors VulkanFrameDescriptorOwner
  private var preparedSlot int32 = -1
  private var preparedBytes VkDeviceSize
  private var preparedRecords int32
  private var preparedRecordBytes VkDeviceSize
  private var preparedRecordRegionBytes VkDeviceSize
  private var preparedEffectDataBytes VkDeviceSize
  private var preparedBufferSpan VkDeviceSize
  private var preparedEffectDataVersion uint64
  private var preparedEffectDataNeedsWrite bool
  private var preparedEffectDataWritten bool
  private var preparedCommandBuffer VkCommandBuffer
  private var lastStats VulkanPrimitiveFrameStats
  private var totalCpuWrittenBytes uint64
  private var totalCpuComparedBytes uint64
  private var totalHistoryCopiedBytes uint64
  private var totalFlushRequests uint64
  private var totalSubmittedTransferBytes uint64
  private var totalRecordedCopyCommands uint64
  private var totalRecordedBarriers uint64
  private var totalPlannedTransferBytes VkDeviceSize
  private var totalSkippedTransferBytes VkDeviceSize
  private var totalDirtyRecordCount uint64
  private var totalUploadRangeCount uint64
  private var totalFullUploads uint64
  private var totalCpuWriteOperations uint64
  private var totalNativeFlushCalls uint64
  private var totalRetainedReuse uint64
  private var disposed bool

  internal prop PreparedSlot int32{ get -> preparedSlot }
  internal prop PreparedBytes VkDeviceSize{ get -> preparedBytes }
  internal prop PreparedRecordCount int32{ get -> preparedRecords }
  internal prop EffectDataWordOffset uint32{
    get -> uint32(preparedRecordRegionBytes / 4uL)
  }
  internal prop LastStats VulkanPrimitiveFrameStats{
    get {
      var snapshot = lastStats
      snapshot.TotalPlannedTransferBytes = totalPlannedTransferBytes
      snapshot.TotalSkippedTransferBytes = totalSkippedTransferBytes
      snapshot.TotalDirtyRecordCount = totalDirtyRecordCount
      snapshot.TotalUploadRangeCount = totalUploadRangeCount
      snapshot.TotalFullUploads = totalFullUploads
      snapshot.TotalCpuWriteOperations = totalCpuWriteOperations
      snapshot.TotalNativeFlushCalls = totalNativeFlushCalls
      snapshot.TotalRetainedReuse = totalRetainedReuse
      snapshot.TotalCpuWrittenBytes = totalCpuWrittenBytes
      snapshot.TotalCpuComparedBytes = totalCpuComparedBytes
      snapshot.TotalHistoryCopiedBytes = totalHistoryCopiedBytes
      snapshot.TotalFlushRequests = totalFlushRequests
      snapshot.TotalSubmittedTransferBytes = totalSubmittedTransferBytes
      snapshot.TotalRecordedCopyCommands = totalRecordedCopyCommands
      snapshot.TotalRecordedBarriers = totalRecordedBarriers
      return snapshot
    }
  }
  internal prop Totals VulkanPrimitiveFrameStats{
    get {
      return VulkanPrimitiveFrameStats{
        TotalCpuWrittenBytes: totalCpuWrittenBytes,
        TotalCpuComparedBytes: totalCpuComparedBytes,
        TotalHistoryCopiedBytes: totalHistoryCopiedBytes,
        TotalFlushRequests: totalFlushRequests,
        TotalSubmittedTransferBytes: totalSubmittedTransferBytes,
        TotalRecordedCopyCommands: totalRecordedCopyCommands,
        TotalRecordedBarriers: totalRecordedBarriers,
        TotalPlannedTransferBytes: totalPlannedTransferBytes,
        TotalSkippedTransferBytes: totalSkippedTransferBytes,
        TotalDirtyRecordCount: totalDirtyRecordCount,
        TotalUploadRangeCount: totalUploadRangeCount,
        TotalFullUploads: totalFullUploads,
        TotalCpuWriteOperations: totalCpuWriteOperations,
        TotalNativeFlushCalls: totalNativeFlushCalls,
        TotalRetainedReuse: totalRetainedReuse,
      }
    }
  }
  internal prop LiveObjectCount uint64{
    get {
      var count = descriptors.LiveObjectCount
      var index int32 = 0
      while index < slots.Length {
        count += slots[index].Buffers.LiveObjectCount
        index++
      }
      return count
    }
  }

  internal init(nativeDevice VkDevice, nativeDispatch VkDeviceDispatch,
    nativeAllocator VulkanMemoryAllocator, nativeDescriptorSetLayout VkDescriptorSetLayout,
    nativeEffectDataDescriptorSetLayout VkDescriptorSetLayout,
    nativeMaxStorageBufferRange VkDeviceSize, nativeSlotCount int32,
    nativeObjectAccounting VulkanObjectAccounting?) {
      if nativeDevice == nint(0) {
        throw ArgumentException("Vulkan device is null", "nativeDevice")
      }
      if nativeAllocator == nil {
        throw ArgumentNullException("nativeAllocator")
      }
      if nativeDescriptorSetLayout == 0uL {
        throw ArgumentException("Vulkan primitive descriptor set layout is null", "nativeDescriptorSetLayout")
      }
      if nativeEffectDataDescriptorSetLayout == 0uL {
        throw ArgumentException("Vulkan effect data descriptor set layout is null",
          "nativeEffectDataDescriptorSetLayout")
      }
      if nativeMaxStorageBufferRange < RecordBytes {
        throw ArgumentOutOfRangeException("nativeMaxStorageBufferRange")
      }
      if nativeSlotCount < 1 || nativeSlotCount > 2 {
        throw ArgumentOutOfRangeException("nativeSlotCount")
      }
      device = nativeDevice
      dispatch = nativeDispatch
      allocator = nativeAllocator
      descriptorSetLayout = nativeDescriptorSetLayout
      effectDataDescriptorSetLayout = nativeEffectDataDescriptorSetLayout
      maxStorageBufferRange = nativeMaxStorageBufferRange
      slotCount = nativeSlotCount
      objectAccounting = nativeObjectAccounting
      slots = [nativeSlotCount]VulkanPrimitiveFrameSlot
      descriptors = VulkanFrameDescriptorOwner{
        Device: device,
        Dispatch: dispatch,
        ObjectAccounting: objectAccounting,
        Sets: [nativeSlotCount * 2]VkDescriptorSet,
      }
      var index int32
      while index < slotCount {
        slots[index] = VulkanPrimitiveFrameSlot(device, dispatch, allocator, objectAccounting)
        index++
      }
      try {
        CreateDescriptorResources()
      } catch (error Exception) {
        DestroyDescriptorResources()
        DisposeSlots()
        throw error
      }
    }

  internal func BeginPrepare(slotIndex int32, maximumRecordCount uint64,
    effectDataByteCount int32, effectDataVersion uint64,
    completedSubmissionSerial uint64) {
      EnsureOpen()
      if preparedSlot >= 0 {
        throw InvalidOperationException("Vulkan primitive frame data already has prepared work")
      }
      if slotIndex < 0 || slotIndex >= slotCount {
        throw ArgumentOutOfRangeException("slotIndex")
      }
      if effectDataByteCount < 0 || (effectDataByteCount & 3) != 0 {
        throw ArgumentOutOfRangeException("effectDataByteCount")
      }
      var recordLimit = maximumRecordCount
      if recordLimit == 0uL { recordLimit = 1uL }
      if recordLimit >= uint64(Int32.MaxValue)
        || recordLimit > maxStorageBufferRange / RecordBytes{
          throw ArgumentOutOfRangeException("maximumRecordCount")
        }
      let recordRegionBytes = recordLimit * RecordBytes
      let dataBytes = uint64(effectDataByteCount)
      if dataBytes > maxStorageBufferRange
        || recordRegionBytes > maxStorageBufferRange - dataBytes{
          throw ArgumentOutOfRangeException("effectDataByteCount")
        }
      let requiredBytes = recordRegionBytes + dataBytes
      let requiredWords = requiredBytes / 4uL
      if requiredWords > uint64(Int32.MaxValue) {
        throw ArgumentOutOfRangeException("effectDataByteCount")
      }
      let slot = slots[slotIndex]
      Collect(completedSubmissionSerial)
      if slot.Lifecycle.Prepared || slot.Lifecycle.Recorded {
        throw InvalidOperationException("Vulkan primitive frame slot already has prepared work")
      }
      slot.EnsureCapacity(requiredBytes, completedSubmissionSerial)
      slot.EnsureHistoryWordCapacity(int32(requiredWords))
      preparedEffectDataNeedsWrite = dataBytes > 0uL
        && (!slot.HistoryValid
            || slot.HistoryBufferGeneration != slot.Buffers.Generation
            || slot.HistoryEffectDataOffset != recordRegionBytes
            || slot.HistoryEffectDataByteCount != dataBytes
            || slot.HistoryEffectDataVersion != effectDataVersion)
      slot.EnsureRangeCapacity(int32(recordLimit) + 1)
      lastStats = VulkanPrimitiveFrameStats{ SlotIndex: slotIndex, Prepared: true }
      preparedSlot = slotIndex
      preparedBytes = 0uL
      preparedRecordBytes = 0uL
      preparedRecordRegionBytes = recordRegionBytes
      preparedEffectDataBytes = dataBytes
      preparedBufferSpan = requiredBytes
      preparedEffectDataVersion = effectDataVersion
      preparedEffectDataWritten = dataBytes == 0uL
      preparedRecords = 0
      preparedCommandBuffer = nint(0)
      slot.Lifecycle.Begin()
      slot.PreparedByteCount = 0uL
      slot.PreparedRecordCount = 0
      slot.PreparedRecordRegionByteCount = recordRegionBytes
      slot.PreparedEffectDataByteCount = dataBytes
      slot.PreparedRangeCount = 0
    }

  private func CountCpuWrite(bytes uint64) {
    lastStats.CpuWrittenBytes += bytes
    lastStats.CpuWriteOperations++
    totalCpuWrittenBytes = SaturatingAdd(totalCpuWrittenBytes, bytes)
    totalCpuWriteOperations = SaturatingAdd(totalCpuWriteOperations, 1uL)
  }

  private func FlushRanges(slot VulkanPrimitiveFrameSlot) {
    var index int32 = 0
    while index < slot.PreparedRangeCount {
      let copyRange = slot.PreparedRanges[index]
      if copyRange.size > 0uL {
        lastStats.FlushRequests++
        totalFlushRequests = SaturatingAdd(totalFlushRequests, 1uL)
        let result = slot.Buffers.Flush(
          copyRange.srcOffset, copyRange.size, out var nativeCall)
        if nativeCall {
          lastStats.NativeFlushCalls++
          totalNativeFlushCalls = SaturatingAdd(totalNativeFlushCalls, 1uL)
        }
        if result != VkConstants.VK_SUCCESS {
          throw InvalidOperationException("vkFlushMappedMemoryRanges failed for Vulkan primitive frame data")
        }
      }
      index++
    }
    slot.Lifecycle.FlushPrepared = true
  }

  internal func WriteRecord(recordIndex int32, source * void) {
    EnsureOpen()
    if preparedSlot < 0 || source == nil {
      throw InvalidOperationException("Vulkan primitive frame data is not prepared")
    }
    if recordIndex != preparedRecords {
      throw InvalidOperationException("Vulkan primitive record ordinal is not sequential")
    }
    if recordIndex < 0 || uint64(recordIndex) >= maxStorageBufferRange / RecordBytes {
      throw ArgumentOutOfRangeException("recordIndex")
    }
    let slot = slots[preparedSlot]
    let sourceWords = *uint32(nint(source))
    let destination = *uint32(nint(slot.Buffers.Mapped)
      +nint(uint64(recordIndex) * RecordBytes))
    var index int32 = 0
    while index < 32 {
      destination[index] = sourceWords[index]
      index++
    }
    CountCpuWrite(RecordBytes)
    preparedRecords = preparedRecords + 1
  }

  internal func WriteEffectData(source []uint8, byteCount int32) {
    EnsureOpen()
    if preparedSlot < 0 {
      throw InvalidOperationException("Vulkan primitive frame data is not prepared")
    }
    if byteCount < 0 || uint64(byteCount) != preparedEffectDataBytes
      || byteCount > source.Length{
        throw ArgumentOutOfRangeException("byteCount")
      }
    if byteCount > 0 && preparedEffectDataNeedsWrite {
      let destination = nint(slots[preparedSlot].Buffers.Mapped) + nint(preparedRecordRegionBytes)
      Marshal.Copy(source, 0, destination, byteCount)
      CountCpuWrite(uint64(byteCount))
    }
    preparedEffectDataWritten = true
  }

  internal func FinishPrepare() {
    EnsureOpen()
    if preparedSlot < 0 {
      throw InvalidOperationException("Vulkan primitive frame data has no prepared work")
    }
    if !preparedEffectDataWritten {
      throw InvalidOperationException("Vulkan shader effect data was not written")
    }
    let slot = slots[preparedSlot]
    if slot.Lifecycle.FlushPrepared {
      throw InvalidOperationException("Vulkan primitive frame data is already prepared")
    }
    if preparedRecords <= 0 {
      preparedRecords = 1
      let destination = *uint32(nint(slot.Buffers.Mapped))
      var index int32
      while index < 32 {
        destination[index] = 0u
        index++
      }
      CountCpuWrite(RecordBytes)
    }
    if uint64(preparedRecords) > maxStorageBufferRange / RecordBytes {
      throw ArgumentOutOfRangeException("primitive record storage range")
    }
    preparedRecordBytes = uint64(preparedRecords) * RecordBytes
    preparedBytes = preparedRecordBytes + preparedEffectDataBytes
    slot.PreparedByteCount = preparedBufferSpan
    slot.PreparedRecordCount = preparedRecords
    let fullUpload = !slot.HistoryValid
      || slot.HistoryBufferGeneration != slot.Buffers.Generation
      || slot.HistoryRecordCount != preparedRecords
    let candidate = *uint32(nint(slot.Buffers.Mapped))
    var dirtyRecordCount int32
    var rangeCount int32
    let dataChanged = preparedEffectDataNeedsWrite
    if fullUpload {
      dirtyRecordCount = preparedRecords
      if preparedRecordBytes > 0uL {
        var recordRange = VkBufferCopy{}
        recordRange.srcOffset = 0uL
        recordRange.dstOffset = 0uL
        recordRange.size = preparedRecordBytes
        slot.PreparedRanges[rangeCount] = recordRange
        rangeCount++
      }
    } else {
      var recordIndex int32
      var rangeStart = -1
      while recordIndex < preparedRecords {
        let firstWord = recordIndex * 32
        var same = true
        var wordIndex int32
        while wordIndex < 32 {
          if candidate[firstWord + wordIndex] != slot.HistoryWords[firstWord + wordIndex] {
            same = false
            break
          }
          wordIndex++
        }
        let comparedBytes = uint64(wordIndex + (same ? 0 : 1)) * 4uL
        lastStats.CpuComparedBytes += comparedBytes
        totalCpuComparedBytes = SaturatingAdd(totalCpuComparedBytes, comparedBytes)
        if !same {
          dirtyRecordCount++
          if rangeStart < 0 { rangeStart = recordIndex }
        } else if rangeStart >= 0 {
          var copyRange = VkBufferCopy{}
          copyRange.srcOffset = uint64(rangeStart) * RecordBytes
          copyRange.dstOffset = copyRange.srcOffset
          copyRange.size = uint64(recordIndex - rangeStart) * RecordBytes
          slot.PreparedRanges[rangeCount] = copyRange
          rangeCount++
          rangeStart = -1
        }
        recordIndex++
      }
      if rangeStart >= 0 {
        var copyRange = VkBufferCopy{}
        copyRange.srcOffset = uint64(rangeStart) * RecordBytes
        copyRange.dstOffset = copyRange.srcOffset
        copyRange.size = uint64(preparedRecords - rangeStart) * RecordBytes
        slot.PreparedRanges[rangeCount] = copyRange
        rangeCount++
      }
    }
    if dataChanged {
      var dataRange = VkBufferCopy{}
      dataRange.srcOffset = preparedRecordRegionBytes
      dataRange.dstOffset = preparedRecordRegionBytes
      dataRange.size = preparedEffectDataBytes
      slot.PreparedRanges[rangeCount] = dataRange
      rangeCount++
    }
    slot.PreparedRangeCount = rangeCount
    let plannedTransferBytes = uint64(dirtyRecordCount) * RecordBytes
    +(dataChanged ? preparedEffectDataBytes : 0uL)
    let skippedTransferBytes = preparedBytes - plannedTransferBytes
    let retainedReuse = if fullUpload {
      0uL
    } else {
      uint64(preparedRecords - dirtyRecordCount)
    }
    FlushRanges(slot)
    UpdateDescriptors(preparedSlot, preparedRecordBytes,
      preparedEffectDataBytes > 0uL ? preparedBufferSpan : 0uL)
    lastStats.SlotIndex = preparedSlot
    lastStats.RecordCount = preparedRecords
    lastStats.ByteCount = preparedBytes
    lastStats.Capacity = slot.Buffers.Capacity
    lastStats.BufferGeneration = slot.Buffers.Generation
    lastStats.PlannedTransferBytes = plannedTransferBytes
    lastStats.SkippedTransferBytes = skippedTransferBytes
    lastStats.DirtyRecordCount = dirtyRecordCount
    lastStats.UploadRangeCount = rangeCount
    lastStats.FullUpload = fullUpload
    lastStats.RetainedReuse = retainedReuse
    lastStats.LastUseSerial = slot.Lifecycle.LastUseSerial
    lastStats.Prepared = true
    totalPlannedTransferBytes = SaturatingAdd(totalPlannedTransferBytes, plannedTransferBytes)
    totalSkippedTransferBytes = SaturatingAdd(totalSkippedTransferBytes, skippedTransferBytes)
    totalDirtyRecordCount = SaturatingAdd(totalDirtyRecordCount, uint64(dirtyRecordCount))
    totalUploadRangeCount = SaturatingAdd(totalUploadRangeCount, uint64(rangeCount))
    if fullUpload { totalFullUploads = SaturatingAdd(totalFullUploads, 1uL) }
    totalRetainedReuse = SaturatingAdd(totalRetainedReuse, retainedReuse)
  }

  internal func RecordUpload(commandBuffer VkCommandBuffer) {
    EnsureOpen()
    if commandBuffer == nint(0) {
      throw ArgumentException("Command buffer is null", "commandBuffer")
    }
    if preparedSlot < 0 {
      throw InvalidOperationException("Vulkan primitive frame data is not prepared")
    }
    let slot = slots[preparedSlot]
    if !slot.Lifecycle.Prepared {
      throw InvalidOperationException("Vulkan primitive frame slot is not prepared")
    }
    if slot.Lifecycle.Recorded {
      if slot.Lifecycle.RecordedCommandBuffer != commandBuffer {
        throw InvalidOperationException("Vulkan primitive frame upload belongs to another command buffer")
      }
      return
    }
    if slot.PreparedRangeCount > 0 {
      slot.Buffers.RecordUpload(commandBuffer, dispatch, slot.PreparedRanges,
        slot.PreparedRangeCount, preparedBufferSpan,
        VkConstants.VK_PIPELINE_STAGE_2_VERTEX_SHADER_BIT
        | VkConstants.VK_PIPELINE_STAGE_2_FRAGMENT_SHADER_BIT)
      lastStats.RecordedCopyCommands++
      totalRecordedCopyCommands = SaturatingAdd(totalRecordedCopyCommands, 1uL)
      lastStats.RecordedBarriers++
      totalRecordedBarriers = SaturatingAdd(totalRecordedBarriers, 1uL)
    }
    slot.Lifecycle.Record(commandBuffer)
    preparedCommandBuffer = commandBuffer
  }

  internal func FlushBeforeSubmit() VkResult {
    EnsureOpen()
    if preparedSlot < 0 {
      return VkConstants.VK_SUCCESS
    }
    let slot = slots[preparedSlot]
    if !slot.Lifecycle.Prepared || !slot.Lifecycle.Recorded
      || !slot.Lifecycle.FlushPrepared
      || slot.Lifecycle.RecordedCommandBuffer != preparedCommandBuffer{
        throw InvalidOperationException("Vulkan primitive frame upload is not ready for submit")
      }
    return VkConstants.VK_SUCCESS
  }

  internal func Bind(commandBuffer VkCommandBuffer, pipelineLayout VkPipelineLayout,
    setIndex uint32) {
      EnsureOpen()
      if commandBuffer == nint(0) || pipelineLayout == 0uL {
        throw ArgumentException("Vulkan primitive descriptor binding arguments are invalid")
      }
      if preparedSlot < 0 || !slots[preparedSlot].Lifecycle.Prepared {
        throw InvalidOperationException("Vulkan primitive frame data is not prepared")
      }
      descriptors.Bind(preparedSlot, commandBuffer, pipelineLayout, setIndex)
    }

  internal func BindEffectData(commandBuffer VkCommandBuffer,
    pipelineLayout VkPipelineLayout, setIndex uint32) {
      EnsureOpen()
      if commandBuffer == nint(0) || pipelineLayout == 0uL {
        throw ArgumentException("Vulkan effect data descriptor binding arguments are invalid")
      }
      if preparedSlot < 0 || !slots[preparedSlot].Lifecycle.Prepared
        || preparedEffectDataBytes == 0uL {
          throw InvalidOperationException("Vulkan shader effect data is not prepared")
        }
      descriptors.Bind(slotCount + preparedSlot, commandBuffer, pipelineLayout, setIndex)
    }

  internal func ValidateSubmission(slotIndex int32, submissionSerial uint64) {
    EnsureOpen()
    if slotIndex < 0 || slotIndex >= slotCount || submissionSerial == 0uL {
      throw ArgumentOutOfRangeException("submissionSerial")
    }
    if preparedSlot != slotIndex || !slots[slotIndex].Lifecycle.Prepared
      || !slots[slotIndex].Lifecycle.Recorded
      || !slots[slotIndex].Lifecycle.FlushPrepared{
        throw InvalidOperationException("Vulkan primitive frame slot has no submitted work")
      }
  }

  internal func MarkSubmitted(slotIndex int32, submissionSerial uint64) {
    ValidateSubmission(slotIndex, submissionSerial)
    let slot = slots[slotIndex]
    CommitHistory(slot)
    slot.Lifecycle.AcceptSubmission(submissionSerial)
    preparedSlot = -1
    preparedBytes = 0uL
    preparedRecords = 0
    ResetPreparedMetadata()
    preparedCommandBuffer = nint(0)
    lastStats.Prepared = false
    lastStats.LastUseSerial = submissionSerial
  }

  internal func ReconcileSubmitted(slotIndex int32, submissionSerial uint64) {
    EnsureOpen()
    if slotIndex < 0 || slotIndex >= slotCount || submissionSerial == 0uL {
      throw ArgumentOutOfRangeException("submissionSerial")
    }
    let slot = slots[slotIndex]
    if preparedSlot == slotIndex && slot.Lifecycle.Prepared {
      CommitHistory(slot)
      slot.Lifecycle.AcceptSubmission(submissionSerial)
      preparedSlot = -1
      preparedBytes = 0uL
      preparedRecords = 0
      ResetPreparedMetadata()
      preparedCommandBuffer = nint(0)
      lastStats.Prepared = false
      lastStats.LastUseSerial = submissionSerial
      return
    }
    if preparedSlot >= 0 {
      throw InvalidOperationException("Vulkan primitive frame data belongs to another slot")
    }
    if slot.Lifecycle.LastUseSerial != submissionSerial {
      throw InvalidOperationException("Vulkan primitive frame submission state is not recoverable")
    }
  }

  private func CommitHistory(slot VulkanPrimitiveFrameSlot) {
    if !slot.Lifecycle.Prepared {
      throw InvalidOperationException("Vulkan primitive frame slot has no candidate history")
    }
    lastStats.SubmittedTransferBytes = lastStats.PlannedTransferBytes
    totalSubmittedTransferBytes = SaturatingAdd(totalSubmittedTransferBytes,
      lastStats.SubmittedTransferBytes)
    let candidate = *uint32(nint(slot.Buffers.Mapped))
    var rangeIndex int32 = 0
    while rangeIndex < slot.PreparedRangeCount {
      let copyRange = slot.PreparedRanges[rangeIndex]
      let firstWord = int32(copyRange.srcOffset / 4uL)
      let wordCount = int32(copyRange.size / 4uL)
      lastStats.HistoryCopiedBytes += copyRange.size
      totalHistoryCopiedBytes = SaturatingAdd(totalHistoryCopiedBytes, copyRange.size)
      var wordIndex int32 = 0
      while wordIndex < wordCount {
        slot.HistoryWords[firstWord + wordIndex] = candidate[firstWord + wordIndex]
        wordIndex++
      }
      rangeIndex++
    }
    slot.HistoryRecordCount = slot.PreparedRecordCount
    slot.HistoryBufferGeneration = slot.Buffers.Generation
    slot.HistoryEffectDataOffset = slot.PreparedRecordRegionByteCount
    slot.HistoryEffectDataByteCount = slot.PreparedEffectDataByteCount
    slot.HistoryEffectDataVersion = slot.PreparedEffectDataByteCount > 0uL
    ? preparedEffectDataVersion : 0uL
    slot.HistoryValid = true
  }

  internal func Collect(completedSubmissionSerial uint64) {
    EnsureOpen()
    var index int32 = 0
    while index < slots.Length {
      if slots[index].Lifecycle.Collect(completedSubmissionSerial) {
        if lastStats.SlotIndex == index {
          lastStats.LastUseSerial = 0uL
        }
      }
      index++
    }
  }

  internal func Abort(slotIndex int32) {
    EnsureOpen()
    if slotIndex < 0 || slotIndex >= slotCount {
      throw ArgumentOutOfRangeException("slotIndex")
    }
    if preparedSlot != slotIndex {
      return
    }
    let slot = slots[slotIndex]
    slot.Lifecycle.Abort()
    slot.PreparedByteCount = 0uL
    slot.PreparedRecordCount = 0
    slot.PreparedRecordRegionByteCount = 0uL
    slot.PreparedEffectDataByteCount = 0uL
    slot.PreparedRangeCount = 0
    preparedSlot = -1
    preparedBytes = 0uL
    preparedRecords = 0
    ResetPreparedMetadata()
    preparedCommandBuffer = nint(0)
    lastStats.Prepared = false
  }

  internal func DisposeAfterDeviceLoss() {
    if disposed {
      return
    }
    disposed = true
    preparedSlot = -1
    preparedBytes = 0uL
    preparedRecords = 0
    ResetPreparedMetadata()
    preparedCommandBuffer = nint(0)
    var index int32 = 0
    while index < slots.Length {
      slots[index].Lifecycle.Reset()
      slots[index].DestroyBuffers()
      index++
    }
    DestroyDescriptorResources()
  }

  public func Dispose() {
    if disposed {
      return
    }
    if preparedSlot >= 0 {
      throw InvalidOperationException("Vulkan primitive frame data has prepared work")
    }
    var index int32 = 0
    while index < slots.Length {
      if slots[index].Lifecycle.Submitted
        || slots[index].Lifecycle.LastUseSerial != 0uL {
          throw InvalidOperationException("Vulkan primitive frame data is still in flight")
        }
      index++
    }
    disposed = true
    DisposeSlots()
    DestroyDescriptorResources()
  }

  deinit{
    try { Dispose() } catch (cleanup Exception) { }
  }

  private func CreateDescriptorResources() {
    var poolSize = VkDescriptorPoolSize{}
    poolSize._type = VkConstants.VK_DESCRIPTOR_TYPE_STORAGE_BUFFER
    poolSize.descriptorCount = uint32(slotCount * 2)
    let descriptorCount = slotCount * 2
    let layouts = [descriptorCount]VkDescriptorSetLayout
    var index int32
    while index < slotCount {
      layouts[index] = descriptorSetLayout
      layouts[slotCount + index] = effectDataDescriptorSetLayout
      index++
    }
    let creation = VulkanDescriptorFactory.CreatePoolAndAllocate(
      device,
      dispatch,
      objectAccounting,
      &poolSize,
      1u,
      &layouts[0],
      uint32(descriptorCount),
      &descriptors.Sets[0])
    descriptors.Adopt(creation)
  }

  private func UpdateDescriptors(slotIndex int32, recordByteCount VkDeviceSize,
    effectBufferByteCount VkDeviceSize) {
      VulkanDescriptorFactory.WriteStorageBuffer(
        device,
        dispatch,
        descriptors.Sets[slotIndex],
        0u,
        slots[slotIndex].Buffers.Buffer,
        0uL,
        recordByteCount)
      if effectBufferByteCount > 0uL {
        VulkanDescriptorFactory.WriteStorageBuffer(
          device,
          dispatch,
          descriptors.Sets[slotCount + slotIndex],
          0u,
          slots[slotIndex].Buffers.Buffer,
          0uL,
          effectBufferByteCount)
      }
    }

  private func DisposeSlots() {
    var index int32 = 0
    while index < slots.Length {
      try { slots[index].Dispose() } catch (cleanup Exception) { slots[index].DestroyBuffers() }
      index++
    }
  }

  private func DestroyDescriptorResources() {
    descriptors.Destroy()
  }

  private func ResetPreparedMetadata() {
    preparedRecordBytes = 0uL
    preparedRecordRegionBytes = 0uL
    preparedEffectDataBytes = 0uL
    preparedBufferSpan = 0uL
    preparedEffectDataWritten = false
    preparedEffectDataVersion = 0uL
    preparedEffectDataNeedsWrite = false
  }

  private func EnsureOpen() {
    if disposed {
      throw ObjectDisposedException("VulkanPrimitiveFrameData")
    }
  }

  private func SaturatingAdd(current uint64, value uint64) uint64 {
    if uint64.MaxValue - current < value {
      return uint64.MaxValue
    }
    return current + value
  }
}
