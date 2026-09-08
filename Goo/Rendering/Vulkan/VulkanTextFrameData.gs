package Goo

import System

internal data struct VulkanTextFrameStats {
  var SlotIndex int32
  var SegmentCount int32
  var RunCount int32
  var RecordCount int32
  var ByteCount VkDeviceSize
  var Capacity VkDeviceSize
  var BufferGeneration uint64
  var TopologyKey uint64
  var WrittenBytes VkDeviceSize
  var SkippedBytes VkDeviceSize
  var DirtySegmentCount int32
  var UploadRangeCount int32
  var FullUpload bool
  var MappedWrites uint64
  var Flushes uint64
  var RetainedReuse uint64
  var LastUseSerial uint64
  var Prepared bool
  var TotalSegmentCount uint64
  var TotalRunCount uint64
  var TotalRecordCount uint64
  var TotalWrittenBytes VkDeviceSize
  var TotalSkippedBytes VkDeviceSize
  var TotalDirtySegmentCount uint64
  var TotalUploadRangeCount uint64
  var TotalFullUploads uint64
  var TotalMappedWrites uint64
  var TotalFlushes uint64
  var TotalRetainedReuse uint64
  var TotalCapacity VkDeviceSize
  var TotalBufferGeneration uint64
  var TotalLastUseSerial uint64
  var TotalPrepared uint64
}

internal unsafe sealed class VulkanTextFrameSlot : IDisposable {
  internal let Device VkDevice
  internal let Dispatch VkDeviceDispatch
  internal let Allocator VulkanMemoryAllocator
  internal let ObjectAccounting VulkanObjectAccounting?
  internal var StagingBuffer VkBuffer = 0uL
  internal var StagingAllocation VulkanMemoryAllocation? = nil
  internal var Buffer VkBuffer = 0uL
  internal var Allocation VulkanMemoryAllocation? = nil
  internal var Capacity VkDeviceSize
  internal var BufferGeneration uint64
  internal var LastUseGlobalSubmissionSerial uint64
  internal var Prepared bool
  internal var Recorded bool
  internal var Submitted bool
  internal var RecordedCommandBuffer VkCommandBuffer
  internal var PreparedByteCount VkDeviceSize
  internal var PreparedRecordCount int32
  internal var FlushPrepared bool
  internal var CandidateIds []uint64
  internal var CandidateVersions []uint64
  internal var CandidateFirstInstances []int32
  internal var CandidateRecordCounts []int32
  internal var CandidateSegmentCount int32
  internal var CandidateTopologyKey uint64
  internal var HistoryIds []uint64
  internal var HistoryVersions []uint64
  internal var HistoryFirstInstances []int32
  internal var HistoryRecordCounts []int32
  internal var HistorySegmentCount int32
  internal var HistoryTopologyKey uint64
  internal var HistoryBufferGeneration uint64
  internal var HistoryValid bool
  internal var PreparedRanges []VkBufferCopy
  internal var PreparedRangeCount int32
  internal var ObjectStagingAccounted bool
  internal var ObjectBufferAccounted bool
  internal var disposed bool

  internal init(nativeDevice VkDevice, nativeDispatch VkDeviceDispatch,
    nativeAllocator VulkanMemoryAllocator, nativeObjectAccounting VulkanObjectAccounting?) {
      Device = nativeDevice
      Dispatch = nativeDispatch
      Allocator = nativeAllocator
      ObjectAccounting = nativeObjectAccounting
      Capacity = 0uL
      BufferGeneration = 0uL
      LastUseGlobalSubmissionSerial = 0uL
      Prepared = false
      Recorded = false
      Submitted = false
      RecordedCommandBuffer = nint(0)
      CandidateIds = [0]uint64
      CandidateVersions = [0]uint64
      CandidateFirstInstances = [0]int32
      CandidateRecordCounts = [0]int32
      CandidateSegmentCount = 0
      CandidateTopologyKey = 0uL
      HistoryIds = [0]uint64
      HistoryVersions = [0]uint64
      HistoryFirstInstances = [0]int32
      HistoryRecordCounts = [0]int32
      HistorySegmentCount = 0
      HistoryTopologyKey = 0uL
      HistoryBufferGeneration = 0uL
      HistoryValid = false
      PreparedRanges = [0]VkBufferCopy
      PreparedRangeCount = 0
    }

  internal func EnsureCapacity(required VkDeviceSize, completedSubmissionSerial uint64) {
    if required == 0uL {
      throw ArgumentOutOfRangeException("required")
    }
    if LastUseGlobalSubmissionSerial > completedSubmissionSerial {
      throw InvalidOperationException("Vulkan text frame slot is still in flight")
    }
    if required <= Capacity && Buffer != 0uL && StagingBuffer != 0uL
      && Allocation != nil && StagingAllocation != nil {
        return
      }
    if Prepared || Recorded {
      throw InvalidOperationException("Vulkan text frame slot has prepared work")
    }
    if BufferGeneration == uint64.MaxValue {
      throw OverflowException("Vulkan text frame buffer generation overflow")
    }
    var next = if Capacity == 0uL { 128uL } else { Capacity }
    while next < required {
      if next > uint64.MaxValue / 2uL {
        next = required
        break
      }
      next = next * 2uL
    }
    DestroyBuffers()
    try {
      let deviceCreation = VulkanBufferFactory.Create(
        Device,
        Dispatch,
        Allocator,
        ObjectAccounting,
        next,
        uint32(VkConstants.VK_BUFFER_USAGE_TRANSFER_DST_BIT)
        | uint32(VkConstants.VK_BUFFER_USAGE_STORAGE_BUFFER_BIT),
        VulkanMemoryPolicy.DeviceLocalRequired)
      Buffer = deviceCreation.Buffer
      Allocation = deviceCreation.Allocation
      ObjectBufferAccounted = ObjectAccounting != nil

      let stagingCreation = VulkanBufferFactory.CreateMapped(
        Device,
        Dispatch,
        Allocator,
        ObjectAccounting,
        next,
        uint32(VkConstants.VK_BUFFER_USAGE_TRANSFER_SRC_BIT),
        VulkanMemoryPolicy.HostVisibleCoherentCached)
      StagingBuffer = stagingCreation.Buffer
      StagingAllocation = stagingCreation.Allocation
      ObjectStagingAccounted = ObjectAccounting != nil
      Capacity = next
      BufferGeneration = BufferGeneration + 1uL
      InvalidateHistory()
    } catch (error Exception) {
      DestroyBuffers()
      throw error
    }
  }

  internal prop Mapped * void{
    get {
      guard let allocation = StagingAllocation else {
        throw InvalidOperationException("Vulkan text staging buffer is not allocated")
      }
      if allocation.mapped == nil {
        throw InvalidOperationException("Vulkan text staging buffer is not mapped")
      }
      return allocation.mapped
    }
  }

  internal func EnsureSegmentCapacity(segmentCount int32) {
    if segmentCount < 0 {
      throw ArgumentOutOfRangeException("segmentCount")
    }
    if segmentCount <= CandidateIds.Length && segmentCount <= HistoryIds.Length {
      return
    }
    var next = if CandidateIds.Length == 0 { 8 } else { CandidateIds.Length }
    if HistoryIds.Length > next { next = HistoryIds.Length }
    while next < segmentCount {
      if next > Int32.MaxValue / 2 {
        next = segmentCount
        break
      }
      next = next * 2
    }
    let candidateIds = [next]uint64
    let candidateVersions = [next]uint64
    let candidateFirstInstances = [next]int32
    let candidateRecordCounts = [next]int32
    var index int32 = 0
    while index < CandidateIds.Length {
      candidateIds[index] = CandidateIds[index]
      candidateVersions[index] = CandidateVersions[index]
      candidateFirstInstances[index] = CandidateFirstInstances[index]
      candidateRecordCounts[index] = CandidateRecordCounts[index]
      index = index + 1
    }
    CandidateIds = candidateIds
    CandidateVersions = candidateVersions
    CandidateFirstInstances = candidateFirstInstances
    CandidateRecordCounts = candidateRecordCounts

    let historyIds = [next]uint64
    let historyVersions = [next]uint64
    let historyFirstInstances = [next]int32
    let historyRecordCounts = [next]int32
    index = 0
    while index < HistoryIds.Length {
      historyIds[index] = HistoryIds[index]
      historyVersions[index] = HistoryVersions[index]
      historyFirstInstances[index] = HistoryFirstInstances[index]
      historyRecordCounts[index] = HistoryRecordCounts[index]
      index = index + 1
    }
    HistoryIds = historyIds
    HistoryVersions = historyVersions
    HistoryFirstInstances = historyFirstInstances
    HistoryRecordCounts = historyRecordCounts
  }

  internal func EnsureRangeCapacity(rangeCount int32) {
    if rangeCount < 0 {
      throw ArgumentOutOfRangeException("rangeCount")
    }
    if rangeCount <= PreparedRanges.Length {
      return
    }
    var next = if PreparedRanges.Length == 0 { 8 } else { PreparedRanges.Length }
    while next < rangeCount {
      if next > Int32.MaxValue / 2 {
        next = rangeCount
        break
      }
      next = next * 2
    }
    let replacement = [next]VkBufferCopy
    var index int32 = 0
    while index < PreparedRanges.Length {
      replacement[index] = PreparedRanges[index]
      index = index + 1
    }
    PreparedRanges = replacement
  }

  internal func FlushRanges() uint64 {
    guard let allocation = StagingAllocation else {
      throw InvalidOperationException("Vulkan text staging buffer is not allocated")
    }
    var index int32 = 0
    var flushes uint64 = 0uL
    while index < PreparedRangeCount {
      let copyRange = PreparedRanges[index]
      if copyRange.size > 0uL {
        let result = Allocator.FlushBeforeSubmit(allocation,
          copyRange.srcOffset, copyRange.size)
        if result != VkConstants.VK_SUCCESS {
          throw InvalidOperationException("vkFlushMappedMemoryRanges failed for Vulkan text frame data")
        }
        flushes = flushes + 1uL
      }
      index = index + 1
    }
    FlushPrepared = true
    return flushes
  }

  internal func DestroyBuffers() {
    if StagingBuffer != 0uL {
      let stale = StagingBuffer
      StagingBuffer = 0uL
      let destroyBuffer = Dispatch.vkDestroyBuffer
      try { destroyBuffer(Device, stale, nil) } catch (cleanup Exception) { }
      if ObjectStagingAccounted {
        if let accounting = ObjectAccounting {
          try { accounting.Release() } catch (cleanup Exception) { }
        }
        ObjectStagingAccounted = false
      }
    }
    if let allocation = StagingAllocation {
      StagingAllocation = nil
      try { Allocator.Release(allocation) } catch (cleanup Exception) { }
    }
    if Buffer != 0uL {
      let stale = Buffer
      Buffer = 0uL
      let destroyBuffer = Dispatch.vkDestroyBuffer
      try { destroyBuffer(Device, stale, nil) } catch (cleanup Exception) { }
      if ObjectBufferAccounted {
        if let accounting = ObjectAccounting {
          try { accounting.Release() } catch (cleanup Exception) { }
        }
        ObjectBufferAccounted = false
      }
    }
    if let allocation = Allocation {
      Allocation = nil
      try { Allocator.Release(allocation) } catch (cleanup Exception) { }
    }
    Capacity = 0uL
    PreparedByteCount = 0uL
    PreparedRecordCount = 0
    FlushPrepared = false
    PreparedRangeCount = 0
    Recorded = false
    RecordedCommandBuffer = nint(0)
    InvalidateHistory()
  }

  internal func InvalidateHistory() {
    HistorySegmentCount = 0
    HistoryTopologyKey = 0uL
    HistoryBufferGeneration = 0uL
    HistoryValid = false
  }

  public func Dispose() {
    if disposed {
      return
    }
    if Prepared || Recorded || Submitted || LastUseGlobalSubmissionSerial != 0uL {
      throw InvalidOperationException("Vulkan text frame slot is in use")
    }
    disposed = true
    DestroyBuffers()
  }

  deinit{
    try { Dispose() } catch (cleanup Exception) { }
  }
}

internal unsafe sealed class VulkanTextFrameData : IDisposable {
  private const RecordBytes VkDeviceSize = 112uL
  private const TopologyHashOffset uint64 = 1469598103934665603uL
  private const TopologyHashPrime uint64 = 1099511628211uL
  private let device VkDevice
  private let dispatch VkDeviceDispatch
  private let allocator VulkanMemoryAllocator
  private let objectAccounting VulkanObjectAccounting?
  private let descriptorSetLayout VkDescriptorSetLayout
  private let maxStorageBufferRange VkDeviceSize
  private let slotCount int32
  private let slots []VulkanTextFrameSlot
  private let descriptorSets []VkDescriptorSet
  private var descriptorPool VkDescriptorPool = 0uL
  private var descriptorPoolAccounted bool
  private var descriptorSetsAccounted int32
  private var preparedSlot int32 = -1
  private var preparedBytes VkDeviceSize
  private var preparedRecords int32
  private var preparedCommandBuffer VkCommandBuffer
  private var lastStats VulkanTextFrameStats
  private var totalSegmentCount uint64
  private var totalRunCount uint64
  private var totalRecordCount uint64
  private var totalWrittenBytes VkDeviceSize
  private var totalSkippedBytes VkDeviceSize
  private var totalDirtySegmentCount uint64
  private var totalUploadRangeCount uint64
  private var totalFullUploads uint64
  private var totalMappedWrites uint64
  private var totalFlushes uint64
  private var totalRetainedReuse uint64
  private var totalCapacity VkDeviceSize
  private var totalBufferGeneration uint64
  private var totalLastUseSerial uint64
  private var totalPrepared uint64
  private var disposed bool

  internal prop PreparedSlot int32{ get -> preparedSlot }
  internal prop PreparedBytes VkDeviceSize{ get -> preparedBytes }
  internal prop PreparedRecordCount int32{ get -> preparedRecords }
  internal prop LastStats VulkanTextFrameStats{ get -> lastStats }
  internal prop Totals VulkanTextFrameStats{
    get {
      return VulkanTextFrameStats{
        TotalSegmentCount: totalSegmentCount,
        TotalRunCount: totalRunCount,
        TotalRecordCount: totalRecordCount,
        TotalWrittenBytes: totalWrittenBytes,
        TotalSkippedBytes: totalSkippedBytes,
        TotalDirtySegmentCount: totalDirtySegmentCount,
        TotalUploadRangeCount: totalUploadRangeCount,
        TotalFullUploads: totalFullUploads,
        TotalMappedWrites: totalMappedWrites,
        TotalFlushes: totalFlushes,
        TotalRetainedReuse: totalRetainedReuse,
        TotalCapacity: totalCapacity,
        TotalBufferGeneration: totalBufferGeneration,
        TotalLastUseSerial: totalLastUseSerial,
        TotalPrepared: totalPrepared,
      }
    }
  }
  internal prop LiveObjectCount uint64{
    get {
      var count uint64 = 0uL
      if descriptorPool != 0uL { count = count + 1uL }
      count = count + uint64(descriptorSetsAccounted)
      var index int32 = 0
      while index < slots.Length {
        if slots[index].Buffer != 0uL { count = count + 1uL }
        if slots[index].StagingBuffer != 0uL { count = count + 1uL }
        index = index + 1
      }
      return count
    }
  }

  internal init(nativeDevice VkDevice, nativeDispatch VkDeviceDispatch,
    nativeAllocator VulkanMemoryAllocator, nativeDescriptorSetLayout VkDescriptorSetLayout,
    nativeMaxStorageBufferRange VkDeviceSize, nativeSlotCount int32,
    nativeObjectAccounting VulkanObjectAccounting?) {
      if nativeDevice == nint(0) {
        throw ArgumentException("Vulkan device is null", "nativeDevice")
      }
      if nativeAllocator == nil {
        throw ArgumentNullException("nativeAllocator")
      }
      if nativeDescriptorSetLayout == 0uL {
        throw ArgumentException("Vulkan text descriptor set layout is null", "nativeDescriptorSetLayout")
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
      maxStorageBufferRange = nativeMaxStorageBufferRange
      slotCount = nativeSlotCount
      objectAccounting = nativeObjectAccounting
      slots = [nativeSlotCount]VulkanTextFrameSlot
      descriptorSets = [nativeSlotCount]VkDescriptorSet
      var index int32 = 0
      while index < slotCount {
        slots[index] = VulkanTextFrameSlot(device, dispatch, allocator, objectAccounting)
        descriptorSets[index] = 0uL
        index = index + 1
      }
      try {
        CreateDescriptorResources()
      } catch (error Exception) {
        DestroyDescriptorResources()
        DisposeSlots()
        throw error
      }
    }

  internal func Prepare(frame SceneFrame, slotIndex int32,
    completedSubmissionSerial uint64) VulkanTextFrameStats{
      EnsureOpen()
      if frame == nil {
        throw ArgumentNullException("frame")
      }
      if slotIndex < 0 || slotIndex >= slotCount {
        throw ArgumentOutOfRangeException("slotIndex")
      }
      if preparedSlot >= 0 {
        throw InvalidOperationException("Vulkan text frame data already has prepared work")
      }
      Collect(completedSubmissionSerial)
      let slot = slots[slotIndex]
      if slot.Prepared || slot.Recorded {
        throw InvalidOperationException("Vulkan text frame slot already has prepared work")
      }
      if slot.LastUseGlobalSubmissionSerial > completedSubmissionSerial {
        throw InvalidOperationException("Vulkan text frame slot is still in flight")
      }
      if frame.DrawRefCount < 0 || frame.DrawRefCount > frame.DrawRefs.Length
        || frame.CachedTextSegmentCount < 0
        || frame.CachedTextSegmentCount > frame.CachedTextSegments.Length{
          throw ArgumentOutOfRangeException("text frame size")
        }
      var maxRecords = maxStorageBufferRange / RecordBytes
      if maxRecords > uint64(Int32.MaxValue) {
        maxRecords = uint64(Int32.MaxValue)
      }
      slot.CandidateSegmentCount = 0
      slot.CandidateTopologyKey = TopologyHashOffset
      slot.EnsureSegmentCapacity(frame.CachedTextSegmentCount)
      var recordCount int32 = 0
      var runCount int32 = 0
      var drawIndex int32 = 0
      while drawIndex < frame.DrawRefCount {
        let drawRef = frame.DrawRefs[drawIndex]
        slot.CandidateTopologyKey = MixTopology(slot.CandidateTopologyKey,
          uint64(int32(drawRef.Kind)))
        slot.CandidateTopologyKey = MixTopology(slot.CandidateTopologyKey,
          uint64(drawRef.Index))
        slot.CandidateTopologyKey = MixTopology(slot.CandidateTopologyKey,
          uint64(drawRef.Flags))
        slot.CandidateTopologyKey = MixTopology(slot.CandidateTopologyKey,
          uint64(drawRef.ClipChainId))
        if drawRef.Kind == SceneDrawKind.CachedTextSegment {
          if drawRef.Index < 0 || drawRef.Index >= frame.CachedTextSegmentCount {
            throw ArgumentOutOfRangeException("cached text segment index")
          }
          let referenceIndex = drawRef.Index
          var reference = frame.CachedTextSegments[referenceIndex]
          let segment = ValidateSegment(drawRef, reference)
          let nextSegmentCount = AddInt32(slot.CandidateSegmentCount, 1,
            "text segment count")
          let candidateIndex = slot.CandidateSegmentCount
          if uint64(recordCount) > maxRecords {
            throw ArgumentOutOfRangeException("text record count")
          }
          reference.FirstInstance = recordCount
          frame.CachedTextSegments[referenceIndex] = reference
          slot.CandidateIds[candidateIndex] = segment.Id
          slot.CandidateVersions[candidateIndex] = segment.Version
          slot.CandidateFirstInstances[candidateIndex] = recordCount
          slot.CandidateRecordCounts[candidateIndex] = segment.RecordCount
          slot.CandidateSegmentCount = nextSegmentCount
          slot.CandidateTopologyKey = MixTopology(slot.CandidateTopologyKey, segment.Id)
          slot.CandidateTopologyKey = MixTopology(slot.CandidateTopologyKey,
            uint64(segment.RecordCount))
          slot.CandidateTopologyKey = MixTopology(slot.CandidateTopologyKey,
            uint64(segment.RunCount))
          var segmentRun int32 = 0
          while segmentRun < segment.RunCount {
            let run = segment.Runs[segmentRun]
            slot.CandidateTopologyKey = MixTopology(slot.CandidateTopologyKey,
              uint64(run.FirstInstance))
            slot.CandidateTopologyKey = MixTopology(slot.CandidateTopologyKey,
              uint64(run.InstanceCount))
            slot.CandidateTopologyKey = MixResource(slot.CandidateTopologyKey, run.AtlasId)
            slot.CandidateTopologyKey = MixTopology(slot.CandidateTopologyKey,
              uint64(run.PipelineKind))
            runCount = AddInt32(runCount, 1, "text run count")
            segmentRun = segmentRun + 1
          }
          if uint64(segment.RecordCount) > maxRecords - uint64(recordCount) {
            throw ArgumentOutOfRangeException("text record storage range")
          }
          recordCount = AddInt32(recordCount, segment.RecordCount, "text record count")
        }
        drawIndex = drawIndex + 1
      }
      let logicalBytes = uint64(recordCount) * RecordBytes
      let backingBytes = if logicalBytes == 0uL { RecordBytes } else { logicalBytes }
      if backingBytes > maxStorageBufferRange {
        throw ArgumentOutOfRangeException("text record storage range")
      }
      slot.EnsureCapacity(backingBytes, completedSubmissionSerial)
      slot.EnsureRangeCapacity(slot.CandidateSegmentCount)
      let fullUpload = !slot.HistoryValid
        || slot.HistoryBufferGeneration != slot.BufferGeneration
        || !TopologyMatches(slot)
      slot.PreparedRangeCount = 0
      var dirtySegmentCount int32 = 0
      var dirtyRecordCount int32 = 0
      var textIndex int32 = 0
      var rangeStart int32 = -1
      drawIndex = 0
      while drawIndex < frame.DrawRefCount {
        let drawRef = frame.DrawRefs[drawIndex]
        if drawRef.Kind == SceneDrawKind.CachedTextSegment {
          let reference = frame.CachedTextSegments[drawRef.Index]
          guard let segment = reference.Segment else {
            throw InvalidOperationException("cached text segment validation failed")
          }
          let dirty = fullUpload
            || slot.CandidateVersions[textIndex] != slot.HistoryVersions[textIndex]
          if dirty {
            dirtySegmentCount = AddInt32(dirtySegmentCount, 1,
              "dirty text segment count")
            dirtyRecordCount = AddInt32(dirtyRecordCount, segment.RecordCount,
              "dirty text record count")
            CopySegmentRecords(slot, segment,
              slot.CandidateFirstInstances[textIndex], segment.RecordCount)
            if rangeStart < 0 {
              rangeStart = slot.CandidateFirstInstances[textIndex]
            }
          } else if rangeStart >= 0 {
            AppendRange(slot, rangeStart,
              slot.CandidateFirstInstances[textIndex] - rangeStart)
            rangeStart = -1
          }
          textIndex = textIndex + 1
        }
        drawIndex = drawIndex + 1
      }
      if rangeStart >= 0 {
        AppendRange(slot, rangeStart, recordCount - rangeStart)
      }
      let writtenBytes = uint64(dirtyRecordCount) * RecordBytes
      let skippedBytes = logicalBytes - writtenBytes
      let retainedReuse = uint64(recordCount - dirtyRecordCount)
      let mappedWrites = if dirtyRecordCount > 0 { 1uL } else { 0uL }
      let flushes = if slot.PreparedRangeCount > 0 { slot.FlushRanges() } else {
        slot.FlushPrepared = true
        0uL
      }
      UpdateDescriptor(slotIndex, backingBytes)
      slot.Prepared = true
      slot.Recorded = false
      slot.Submitted = false
      slot.RecordedCommandBuffer = nint(0)
      slot.PreparedByteCount = logicalBytes
      slot.PreparedRecordCount = recordCount
      preparedSlot = slotIndex
      preparedBytes = logicalBytes
      preparedRecords = recordCount
      preparedCommandBuffer = nint(0)
      totalSegmentCount = SaturatingAdd(totalSegmentCount, uint64(slot.CandidateSegmentCount))
      totalRunCount = SaturatingAdd(totalRunCount, uint64(runCount))
      totalRecordCount = SaturatingAdd(totalRecordCount, uint64(recordCount))
      totalWrittenBytes = SaturatingAdd(totalWrittenBytes, writtenBytes)
      totalSkippedBytes = SaturatingAdd(totalSkippedBytes, skippedBytes)
      totalDirtySegmentCount = SaturatingAdd(totalDirtySegmentCount,
        uint64(dirtySegmentCount))
      totalUploadRangeCount = SaturatingAdd(totalUploadRangeCount,
        uint64(slot.PreparedRangeCount))
      if fullUpload {
        totalFullUploads = SaturatingAdd(totalFullUploads, 1uL)
      }
      totalMappedWrites = SaturatingAdd(totalMappedWrites, mappedWrites)
      totalFlushes = SaturatingAdd(totalFlushes, flushes)
      totalRetainedReuse = SaturatingAdd(totalRetainedReuse, retainedReuse)
      totalCapacity = SaturatingAdd(totalCapacity, slot.Capacity)
      totalBufferGeneration = SaturatingAdd(totalBufferGeneration, slot.BufferGeneration)
      totalPrepared = SaturatingAdd(totalPrepared, 1uL)
      let stats = VulkanTextFrameStats{
        SlotIndex: slotIndex,
        SegmentCount: slot.CandidateSegmentCount,
        RunCount: runCount,
        RecordCount: recordCount,
        ByteCount: logicalBytes,
        Capacity: slot.Capacity,
        BufferGeneration: slot.BufferGeneration,
        TopologyKey: slot.CandidateTopologyKey,
        WrittenBytes: writtenBytes,
        SkippedBytes: skippedBytes,
        DirtySegmentCount: dirtySegmentCount,
        UploadRangeCount: slot.PreparedRangeCount,
        FullUpload: fullUpload,
        MappedWrites: mappedWrites,
        Flushes: flushes,
        RetainedReuse: retainedReuse,
        LastUseSerial: slot.LastUseGlobalSubmissionSerial,
        Prepared: true,
        TotalSegmentCount: totalSegmentCount,
        TotalRunCount: totalRunCount,
        TotalRecordCount: totalRecordCount,
        TotalWrittenBytes: totalWrittenBytes,
        TotalSkippedBytes: totalSkippedBytes,
        TotalDirtySegmentCount: totalDirtySegmentCount,
        TotalUploadRangeCount: totalUploadRangeCount,
        TotalFullUploads: totalFullUploads,
        TotalMappedWrites: totalMappedWrites,
        TotalFlushes: totalFlushes,
        TotalRetainedReuse: totalRetainedReuse,
        TotalCapacity: totalCapacity,
        TotalBufferGeneration: totalBufferGeneration,
        TotalLastUseSerial: totalLastUseSerial,
        TotalPrepared: totalPrepared,
      }
      lastStats = stats
      return stats
    }

  internal func RecordUpload(commandBuffer VkCommandBuffer) {
    EnsureOpen()
    if commandBuffer == nint(0) {
      throw ArgumentException("Command buffer is null", "commandBuffer")
    }
    if preparedSlot < 0 {
      throw InvalidOperationException("Vulkan text frame data is not prepared")
    }
    let slot = slots[preparedSlot]
    if !slot.Prepared {
      throw InvalidOperationException("Vulkan text frame slot is not prepared")
    }
    if slot.Recorded {
      if slot.RecordedCommandBuffer != commandBuffer {
        throw InvalidOperationException("Vulkan text frame upload belongs to another command buffer")
      }
      return
    }
    if slot.PreparedRangeCount > 0 {
      let copyBuffer = dispatch.vkCmdCopyBuffer
      copyBuffer(commandBuffer, slot.StagingBuffer, slot.Buffer,
        uint32(slot.PreparedRangeCount), &slot.PreparedRanges[0])
      VulkanTransitions.RecordBuffer(
        commandBuffer,
        dispatch.vkCmdPipelineBarrier2,
        slot.Buffer,
        0uL,
        preparedBytes,
        VkConstants.VK_PIPELINE_STAGE_2_TRANSFER_BIT,
        VkConstants.VK_ACCESS_2_TRANSFER_WRITE_BIT,
        VkConstants.VK_PIPELINE_STAGE_2_VERTEX_SHADER_BIT,
        VkConstants.VK_ACCESS_2_SHADER_STORAGE_READ_BIT)
    }
    slot.Recorded = true
    slot.RecordedCommandBuffer = commandBuffer
    preparedCommandBuffer = commandBuffer
  }

  internal func FlushBeforeSubmit() VkResult {
    EnsureOpen()
    if preparedSlot < 0 {
      return VkConstants.VK_SUCCESS
    }
    let slot = slots[preparedSlot]
    if !slot.Prepared || !slot.Recorded || !slot.FlushPrepared
      || slot.RecordedCommandBuffer != preparedCommandBuffer{
        throw InvalidOperationException("Vulkan text frame upload is not ready for submit")
      }
    return VkConstants.VK_SUCCESS
  }

  internal func Bind(commandBuffer VkCommandBuffer, pipelineLayout VkPipelineLayout) {
    Bind(commandBuffer, pipelineLayout, 2u)
  }

  internal func Bind(commandBuffer VkCommandBuffer, pipelineLayout VkPipelineLayout,
    setIndex uint32) {
      EnsureOpen()
      if commandBuffer == nint(0) || pipelineLayout == 0uL {
        throw ArgumentException("Vulkan text descriptor binding arguments are invalid")
      }
      if preparedSlot < 0 || !slots[preparedSlot].Prepared {
        throw InvalidOperationException("Vulkan text frame data is not prepared")
      }
      var descriptorSet = descriptorSets[preparedSlot]
      let bindDescriptorSets = dispatch.vkCmdBindDescriptorSets
      bindDescriptorSets(commandBuffer, VkConstants.VK_PIPELINE_BIND_POINT_GRAPHICS,
        pipelineLayout, setIndex, 1u, &descriptorSet, 0u, nil)
    }

  internal func ValidateSubmission(slotIndex int32, submissionSerial uint64) {
    EnsureOpen()
    if slotIndex < 0 || slotIndex >= slotCount || submissionSerial == 0uL {
      throw ArgumentOutOfRangeException("submissionSerial")
    }
    if preparedSlot != slotIndex || !slots[slotIndex].Prepared
      || !slots[slotIndex].Recorded || !slots[slotIndex].FlushPrepared{
        throw InvalidOperationException("Vulkan text frame slot has no submitted work")
      }
  }

  internal func MarkSubmitted(slotIndex int32, submissionSerial uint64) {
    ValidateSubmission(slotIndex, submissionSerial)
    let slot = slots[slotIndex]
    CommitHistory(slot)
    slot.Prepared = false
    slot.Recorded = false
    slot.RecordedCommandBuffer = nint(0)
    slot.Submitted = true
    slot.LastUseGlobalSubmissionSerial = submissionSerial
    preparedSlot = -1
    preparedBytes = 0uL
    preparedRecords = 0
    preparedCommandBuffer = nint(0)
    totalLastUseSerial = SaturatingAdd(totalLastUseSerial, submissionSerial)
    lastStats.Prepared = false
    lastStats.LastUseSerial = submissionSerial
    lastStats.TotalLastUseSerial = totalLastUseSerial
  }

  internal func ReconcileSubmitted(slotIndex int32, submissionSerial uint64) {
    EnsureOpen()
    if slotIndex < 0 || slotIndex >= slotCount || submissionSerial == 0uL {
      throw ArgumentOutOfRangeException("submissionSerial")
    }
    let slot = slots[slotIndex]
    if preparedSlot == slotIndex && slot.Prepared {
      CommitHistory(slot)
      slot.Prepared = false
      slot.Recorded = false
      slot.RecordedCommandBuffer = nint(0)
      slot.Submitted = true
      slot.LastUseGlobalSubmissionSerial = submissionSerial
      preparedSlot = -1
      preparedBytes = 0uL
      preparedRecords = 0
      preparedCommandBuffer = nint(0)
      totalLastUseSerial = SaturatingAdd(totalLastUseSerial, submissionSerial)
      lastStats.Prepared = false
      lastStats.LastUseSerial = submissionSerial
      lastStats.TotalLastUseSerial = totalLastUseSerial
      return
    }
    if preparedSlot >= 0 {
      throw InvalidOperationException("Vulkan text frame data belongs to another slot")
    }
    if slot.LastUseGlobalSubmissionSerial != submissionSerial {
      throw InvalidOperationException("Vulkan text frame submission state is not recoverable")
    }
  }

  internal func Collect(completedSubmissionSerial uint64) {
    EnsureOpen()
    var index int32 = 0
    while index < slots.Length {
      if slots[index].Submitted
        && slots[index].LastUseGlobalSubmissionSerial != 0uL
        && slots[index].LastUseGlobalSubmissionSerial <= completedSubmissionSerial{
          slots[index].Submitted = false
          slots[index].LastUseGlobalSubmissionSerial = 0uL
          if lastStats.SlotIndex == index {
            lastStats.LastUseSerial = 0uL
          }
        }
      index = index + 1
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
    slot.Prepared = false
    slot.Recorded = false
    slot.RecordedCommandBuffer = nint(0)
    slot.PreparedByteCount = 0uL
    slot.PreparedRecordCount = 0
    slot.FlushPrepared = false
    slot.PreparedRangeCount = 0
    preparedSlot = -1
    preparedBytes = 0uL
    preparedRecords = 0
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
    preparedCommandBuffer = nint(0)
    var index int32 = 0
    while index < slots.Length {
      slots[index].Prepared = false
      slots[index].Recorded = false
      slots[index].Submitted = false
      slots[index].LastUseGlobalSubmissionSerial = 0uL
      slots[index].DestroyBuffers()
      index = index + 1
    }
    lastStats.Prepared = false
    lastStats.Capacity = 0uL
    lastStats.BufferGeneration = 0uL
    lastStats.LastUseSerial = 0uL
    DestroyDescriptorResources()
  }

  public func Dispose() {
    if disposed {
      return
    }
    if preparedSlot >= 0 {
      throw InvalidOperationException("Vulkan text frame data has prepared work")
    }
    var index int32 = 0
    while index < slots.Length {
      if slots[index].Submitted || slots[index].LastUseGlobalSubmissionSerial != 0uL {
        throw InvalidOperationException("Vulkan text frame data is still in flight")
      }
      index = index + 1
    }
    disposed = true
    DisposeSlots()
    DestroyDescriptorResources()
  }

  deinit{
    try { Dispose() } catch (cleanup Exception) { }
  }

  private func ValidateSegment(drawRef DrawRef,
    reference CachedTextSegmentRefRecord) VulkanRetainedTextSegment{
      if drawRef.ClipChainId < 0 || reference.SegmentId == 0uL
        || reference.SegmentVersion == 0uL
        || reference.GlyphCount <= 0
        || reference.ClipChainId != drawRef.ClipChainId{
          throw ArgumentException("cached text segment reference is invalid")
        }
      guard let segment = reference.Segment else {
        throw ArgumentNullException("segment")
      }
      if segment.Id == 0uL || segment.Version == 0uL
        || reference.SegmentId != segment.Id
        || reference.SegmentVersion != segment.Version
        || reference.GlyphCount != segment.GlyphCount
        || reference.ClipChainId != segment.ClipChainId
        || segment.RecordCount != segment.GlyphCount
        || segment.RecordCount <= 0
        || segment.RecordCount > segment.Records.Length
        || segment.RunCount <= 0 || segment.RunCount > segment.Runs.Length{
          throw ArgumentException("cached text segment is invalid")
        }
      var runIndex int32 = 0
      var expectedFirst int32 = 0
      while runIndex < segment.RunCount {
        let run = segment.Runs[runIndex]
        if run.FirstInstance < 0 || run.InstanceCount <= 0
          || run.FirstInstance != expectedFirst
          || run.FirstInstance > segment.RecordCount
          || run.InstanceCount > segment.RecordCount - run.FirstInstance
          || run.PipelineKind > 1u
          || !run.AtlasId.IsValid || run.AtlasId.Kind != SceneResourceKind.Atlas{
            throw ArgumentException("cached text segment run is invalid")
          }
        expectedFirst = AddInt32(expectedFirst, run.InstanceCount,
          "text run record count")
        runIndex = runIndex + 1
      }
      if expectedFirst != segment.RecordCount {
        throw ArgumentException("cached text segment runs do not partition records")
      }
      return segment
    }

  private func TopologyMatches(slot VulkanTextFrameSlot) bool {
    if !slot.HistoryValid
      || slot.HistorySegmentCount != slot.CandidateSegmentCount{
        return false
      }
    var index int32 = 0
    while index < slot.CandidateSegmentCount {
      if slot.HistoryIds[index] != slot.CandidateIds[index]
        || slot.HistoryFirstInstances[index] != slot.CandidateFirstInstances[index]
        || slot.HistoryRecordCounts[index] != slot.CandidateRecordCounts[index]{
          return false
        }
      index = index + 1
    }
    return true
  }

  private func CopySegmentRecords(slot VulkanTextFrameSlot,
    segment VulkanRetainedTextSegment, destinationFirst int32, recordCount int32) {
      if destinationFirst < 0 || recordCount <= 0
        || destinationFirst > Int32.MaxValue - recordCount{
          throw ArgumentOutOfRangeException("text record copy range")
        }
      let destinationBase = nint(slot.Mapped)
      +nint(uint64(destinationFirst) * RecordBytes)
      let copyBytes = uint64(recordCount) * RecordBytes
      System.Buffer.MemoryCopy(
        *void(nint(&segment.Records[0])),
        *void(destinationBase),
        copyBytes,
        copyBytes)
    }

  private func AppendRange(slot VulkanTextFrameSlot, firstRecord int32,
    recordCount int32) {
      if firstRecord < 0 || recordCount <= 0
        || firstRecord > Int32.MaxValue - recordCount
        || slot.PreparedRangeCount >= slot.PreparedRanges.Length{
          throw ArgumentOutOfRangeException("text upload range")
        }
      let byteOffset = uint64(firstRecord) * RecordBytes
      let byteCount = uint64(recordCount) * RecordBytes
      var copyRange = VkBufferCopy{}
      copyRange.srcOffset = byteOffset
      copyRange.dstOffset = byteOffset
      copyRange.size = byteCount
      slot.PreparedRanges[slot.PreparedRangeCount] = copyRange
      slot.PreparedRangeCount = AddInt32(slot.PreparedRangeCount, 1,
        "text upload range count")
    }

  private func CommitHistory(slot VulkanTextFrameSlot) {
    if !slot.Prepared {
      throw InvalidOperationException("Vulkan text frame slot has no candidate history")
    }
    var index int32 = 0
    while index < slot.CandidateSegmentCount {
      slot.HistoryIds[index] = slot.CandidateIds[index]
      slot.HistoryVersions[index] = slot.CandidateVersions[index]
      slot.HistoryFirstInstances[index] = slot.CandidateFirstInstances[index]
      slot.HistoryRecordCounts[index] = slot.CandidateRecordCounts[index]
      index = index + 1
    }
    slot.HistorySegmentCount = slot.CandidateSegmentCount
    slot.HistoryTopologyKey = slot.CandidateTopologyKey
    slot.HistoryBufferGeneration = slot.BufferGeneration
    slot.HistoryValid = true
  }

  private func CreateDescriptorResources() {
    var poolSize = VkDescriptorPoolSize{}
    poolSize._type = VkConstants.VK_DESCRIPTOR_TYPE_STORAGE_BUFFER
    poolSize.descriptorCount = uint32(slotCount)
    let layouts * VkDescriptorSetLayout = stackalloc[2]VkDescriptorSetLayout
    var index int32 = 0
    while index < slotCount {
      layouts[index] = descriptorSetLayout
      index = index + 1
    }
    let creation = VulkanDescriptorFactory.CreatePoolAndAllocate(
      device,
      dispatch,
      objectAccounting,
      &poolSize,
      1u,
      layouts,
      uint32(slotCount),
      &descriptorSets[0])
    descriptorPool = creation.Pool
    if objectAccounting != nil {
      descriptorPoolAccounted = true
      descriptorSetsAccounted = int32(creation.SetCount)
    }
  }

  private func UpdateDescriptor(slotIndex int32, byteCount VkDeviceSize) {
    VulkanDescriptorFactory.WriteStorageBuffer(
      device,
      dispatch,
      descriptorSets[slotIndex],
      0u,
      slots[slotIndex].Buffer,
      0uL,
      byteCount)
  }

  private func DisposeSlots() {
    var index int32 = 0
    while index < slots.Length {
      try { slots[index].Dispose() } catch (cleanup Exception) { slots[index].DestroyBuffers() }
      index = index + 1
    }
  }

  private func DestroyDescriptorResources() {
    if descriptorPool != 0uL {
      let stalePool = descriptorPool
      descriptorPool = 0uL
      let destroyPool = dispatch.vkDestroyDescriptorPool
      try { destroyPool(device, stalePool, nil) } catch (cleanup Exception) { }
      if let accounting = objectAccounting {
        var index int32 = 0
        while index < descriptorSetsAccounted {
          try { accounting.Release() } catch (cleanup Exception) { }
          index = index + 1
        }
        descriptorSetsAccounted = 0
        if descriptorPoolAccounted {
          try { accounting.Release() } catch (cleanup Exception) { }
          descriptorPoolAccounted = false
        }
      }
    }
    var index int32 = 0
    while index < descriptorSets.Length {
      descriptorSets[index] = 0uL
      index = index + 1
    }
  }

  private func EnsureOpen() {
    if disposed {
      throw ObjectDisposedException("VulkanTextFrameData")
    }
  }

  private func AddInt32(current int32, value int32, name string) int32 {
    if value < 0 || current > Int32.MaxValue - value {
      throw OverflowException(name + " overflow")
    }
    return current + value
  }

  private func MixTopology(hash uint64, value uint64) uint64 -> (hash ^ value) * TopologyHashPrime

  private func MixResource(hash uint64, value ResourceId) uint64 {
    var result = MixTopology(hash, uint64(int32(value.Kind)))
    result = MixTopology(result, value.LogicalId)
    return MixTopology(result, value.Version)
  }

  private func SaturatingAdd(current uint64, value uint64) uint64 {
    if value > uint64.MaxValue - current {
      return uint64.MaxValue
    }
    return current + value
  }
}
