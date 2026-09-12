package Goo

import System

internal data struct VulkanClipMaskFrameStats {
  var SlotIndex int32
  var DrawCount int32
  var MaskCount int32
  var ClipChainCount int32
  var LayerCount int32
  var ByteCount VkDeviceSize
  var DirtyRegionCount int32
  var AtlasGeneration uint64
  var WrittenBytes VkDeviceSize
  var SkippedBytes VkDeviceSize
  var MappedWrites uint64
  var Flushes uint64
  var RetainedReuse uint64
  var RetentionEligible bool
  var Retained bool
  var RetentionValid bool
  var Capacity VkDeviceSize
  var BufferGeneration uint64
  var LastUseSerial uint64

}

internal data struct VulkanClipMaskFrameTotals {
  var WrittenBytes VkDeviceSize
  var SkippedBytes VkDeviceSize
  var MappedWrites uint64
  var Flushes uint64
  var RetainedReuse uint64

}

internal unsafe sealed class VulkanClipMaskFrameSlot : IDisposable {
  internal var Buffers VulkanFrameBuffers
  internal var Lifecycle VulkanFrameSlotLifecycle
  internal var RetentionValid bool
  internal var RetainedDrawCount int32
  internal var RetainedByteCount VkDeviceSize
  internal var RetainedCapacity VkDeviceSize
  internal var RetainedBufferGeneration uint64
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
      RetentionValid = false
    }

  internal func EnsureCapacity(required VkDeviceSize) {
    if required == 0uL {
      throw ArgumentOutOfRangeException("required")
    }
    if Buffers.EnsureMappedCapacity(required, 4096uL,
      uint32(VkConstants.VK_BUFFER_USAGE_STORAGE_BUFFER_BIT)) {
        InvalidateRetention()
      }
  }

  internal func Flush(byteCount VkDeviceSize) {
    let result = Buffers.Flush(0uL, byteCount)
    if result != VkConstants.VK_SUCCESS {
      throw InvalidOperationException("vkFlushMappedMemoryRanges failed for Vulkan clip frame data")
    }
  }

  internal func CanReuse(drawCount int32, byteCount VkDeviceSize) bool -> RetentionValid
    && Buffers.Buffer != 0uL
    && Buffers.Allocation != nil
    && RetainedDrawCount == drawCount
    && RetainedByteCount == byteCount
    && RetainedCapacity == Buffers.Capacity
    && RetainedBufferGeneration == Buffers.Generation

  internal func RememberRetention(drawCount int32, byteCount VkDeviceSize) {
    RetentionValid = true
    RetainedDrawCount = drawCount
    RetainedByteCount = byteCount
    RetainedCapacity = Buffers.Capacity
    RetainedBufferGeneration = Buffers.Generation
  }

  internal func InvalidateRetention() {
    RetentionValid = false
    RetainedDrawCount = 0
    RetainedByteCount = 0uL
    RetainedCapacity = 0uL
    RetainedBufferGeneration = 0uL
  }

  internal func DestroyBuffer() {
    Buffers.Destroy()
    InvalidateRetention()
  }

  public func Dispose() {
    if disposed {
      return
    }
    if Lifecycle.Prepared {
      throw InvalidOperationException("Vulkan clip frame data has prepared work")
    }
    disposed = true
    DestroyBuffer()
  }

  deinit{
    try { Dispose() } catch (cleanup Exception) { }
  }
}

internal unsafe sealed class VulkanClipMaskFrameData : IDisposable {
  private const SlotCount int32 = 2
  private const MaxLayerDepth int32 = 32
  private let device VkDevice
  private let dispatch VkDeviceDispatch
  private let allocator VulkanMemoryAllocator
  private let objectAccounting VulkanObjectAccounting?
  private let atlas VulkanClipMaskAtlas
  private let descriptorSetLayout VkDescriptorSetLayout
  private let maxStorageBufferRange VkDeviceSize
  private let slots []VulkanClipMaskFrameSlot
  private var descriptors VulkanFrameDescriptorOwner
  private var preparedSlot int32 = -1
  private var preparedBytes VkDeviceSize
  private var preparedRegions([]VulkanClipMaskRegion)? = nil
  private var preparedRegionCount int32
  private let atlasGenerations []uint64
  private var lastStats VulkanClipMaskFrameStats
  private var totalWrittenBytes VkDeviceSize
  private var totalSkippedBytes VkDeviceSize
  private var totalMappedWrites uint64
  private var totalFlushes uint64
  private var totalRetainedReuse uint64
  private var disposed bool

  internal prop PreparedSlot int32{ get -> preparedSlot }
  internal prop LastStats VulkanClipMaskFrameStats{ get -> lastStats }
  internal prop Totals VulkanClipMaskFrameTotals{
    get {
      return VulkanClipMaskFrameTotals{
        WrittenBytes: totalWrittenBytes,
        SkippedBytes: totalSkippedBytes,
        MappedWrites: totalMappedWrites,
        Flushes: totalFlushes,
        RetainedReuse: totalRetainedReuse,
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
    nativeAllocator VulkanMemoryAllocator, nativeAtlas VulkanClipMaskAtlas,
    nativeDescriptorSetLayout VkDescriptorSetLayout,
    nativeMaxStorageBufferRange VkDeviceSize,
    nativeObjectAccounting VulkanObjectAccounting?) {
      if nativeDevice == nint(0) {
        throw ArgumentException("Vulkan device is null", "nativeDevice")
      }
      if nativeAllocator == nil {
        throw ArgumentNullException("nativeAllocator")
      }
      if nativeAtlas == nil {
        throw ArgumentNullException("nativeAtlas")
      }
      if nativeDescriptorSetLayout == 0uL {
        throw ArgumentException("Vulkan clip descriptor set layout is null", "nativeDescriptorSetLayout")
      }
      if nativeMaxStorageBufferRange == 0uL {
        throw ArgumentOutOfRangeException("nativeMaxStorageBufferRange")
      }
      device = nativeDevice
      dispatch = nativeDispatch
      allocator = nativeAllocator
      atlas = nativeAtlas
      descriptorSetLayout = nativeDescriptorSetLayout
      maxStorageBufferRange = nativeMaxStorageBufferRange
      objectAccounting = nativeObjectAccounting
      slots = [SlotCount]VulkanClipMaskFrameSlot
      descriptors = VulkanFrameDescriptorOwner{
        Device: device,
        Dispatch: dispatch,
        ObjectAccounting: objectAccounting,
        Sets: [SlotCount]VkDescriptorSet,
      }
      atlasGenerations = [SlotCount]uint64
      var index int32 = 0
      while index < SlotCount {
        slots[index] = VulkanClipMaskFrameSlot(device, dispatch, allocator, objectAccounting)
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

  internal func Prepare(frame SceneFrame, regions []VulkanClipMaskRegion,
    regionCount int32, slotIndex int32, completedSubmissionSerial uint64) VulkanClipMaskFrameStats{
      EnsureOpen()
      if frame == nil {
        throw ArgumentNullException("frame")
      }
      if slotIndex < 0 || slotIndex >= SlotCount {
        throw ArgumentOutOfRangeException("slotIndex")
      }
      if regionCount < 0 || regionCount > frame.ClipMaskCount || regionCount > regions.Length {
        throw ArgumentOutOfRangeException("regionCount")
      }
      if preparedSlot >= 0 {
        throw InvalidOperationException("Vulkan clip frame data already has prepared work")
      }
      Collect(completedSubmissionSerial)
      let slot = slots[slotIndex]
      if slot.Lifecycle.Prepared {
        throw InvalidOperationException("Vulkan clip frame slot already has prepared work")
      }
      if slot.Lifecycle.LastUseSerial > completedSubmissionSerial {
        throw InvalidOperationException("Vulkan clip frame slot is still in flight")
      }
      if frame.DrawRefCount < 0 || frame.ClipMaskCount < 0
        || frame.ClipChainCount < 0 || frame.CachedTextSegmentCount < 0
        || frame.DrawRefCount > frame.DrawRefs.Length
        || frame.ClipMaskCount > frame.ClipMasks.Length
        || frame.ClipChainCount > frame.ClipChains.Length{
          throw ArgumentOutOfRangeException("clip frame size")
        }
      let hasMasks = frame.ClipMaskCount > 0
      let textChainTable = hasMasks && frame.CachedTextSegmentCount > 0
      if textChainTable && frame.ClipChainCount <= 0 {
        throw ArgumentOutOfRangeException("clip frame chains")
      }
      let maxWordCount = uint64(Int32.MaxValue)
      let drawCount = uint64(frame.DrawRefCount)
      let maskCount = uint64(frame.ClipMaskCount)
      let chainCount = uint64(frame.ClipChainCount)
      if hasMasks && (drawCount > maxWordCount / 12uL
          || maskCount > maxWordCount / 12uL
          || (textChainTable && chainCount > (maxWordCount - 1uL) / 12uL)) {
            throw ArgumentOutOfRangeException("clip frame size")
          }
      let drawWords = if hasMasks { drawCount * 12uL } else { 0uL }
      let maskWords = if hasMasks { maskCount * 12uL } else { 0uL }
      var totalWords = 4uL
      if drawWords > maxWordCount - totalWords {
        throw ArgumentOutOfRangeException("clip frame size")
      }
      totalWords = totalWords + drawWords
      if maskWords > maxWordCount - totalWords {
        throw ArgumentOutOfRangeException("clip frame size")
      }
      totalWords = totalWords + maskWords
      var tableWords = 0uL
      if textChainTable {
        tableWords = 1uL + chainCount * 12uL
      }
      if tableWords > maxWordCount - totalWords {
        throw ArgumentOutOfRangeException("clip frame size")
      }
      let tableBaseWord = if textChainTable { totalWords } else { 0uL }
      totalWords = totalWords + tableWords
      if totalWords > uint64.MaxValue / 4uL {
        throw OverflowException("Vulkan clip frame data size overflow")
      }
      let byteCount = totalWords * 4uL
      if byteCount > maxStorageBufferRange {
        throw ArgumentOutOfRangeException("clip frame storage range")
      }
      slot.EnsureCapacity(byteCount)
      let retentionEligible = frame.ClipMaskCount == 0
        && frame.ClipChainCount == 1
        && frame.LayerCount == 0
        && !textChainTable
      let retained = retentionEligible && slot.CanReuse(frame.DrawRefCount, byteCount)
      if !retained {
        slot.InvalidateRetention()
        let words = *uint32(nint(slot.Buffers.Mapped))
        WriteWords(words, frame, regions, regionCount,
          textChainTable, tableBaseWord)
        slot.Flush(byteCount)
      }
      UpdateDescriptors(slotIndex, byteCount)
      if retentionEligible {
        slot.RememberRetention(frame.DrawRefCount, byteCount)
      } else {
        slot.InvalidateRetention()
      }
      slot.Lifecycle.Begin()
      preparedSlot = slotIndex
      preparedBytes = byteCount
      preparedRegions = regions
      preparedRegionCount = regionCount
      var dirtyRegionCount int32 = 0
      var dirtyIndex int32 = 0
      while dirtyIndex < regionCount {
        if regions[dirtyIndex].Dirty {
          dirtyRegionCount++
        }
        dirtyIndex++
      }
      let stats = VulkanClipMaskFrameStats{
        SlotIndex: slotIndex,
        DrawCount: frame.DrawRefCount,
        MaskCount: frame.ClipMaskCount,
        ClipChainCount: frame.ClipChainCount,
        LayerCount: frame.LayerCount,
        ByteCount: byteCount,
        DirtyRegionCount: dirtyRegionCount,
        AtlasGeneration: atlas.Generation,
        WrittenBytes: if retained { 0uL } else { byteCount },
        SkippedBytes: if retained { byteCount } else { 0uL },
        MappedWrites: if retained { 0uL } else { 1uL },
        Flushes: if retained { 0uL } else { 1uL },
        RetainedReuse: if retained { 1uL } else { 0uL },
        RetentionEligible: retentionEligible,
        Retained: retained,
        RetentionValid: slot.RetentionValid,
        Capacity: slot.Buffers.Capacity,
        BufferGeneration: slot.Buffers.Generation,
        LastUseSerial: slot.Lifecycle.LastUseSerial,
      }
      totalWrittenBytes = SaturatingAdd(totalWrittenBytes, stats.WrittenBytes)
      totalSkippedBytes = SaturatingAdd(totalSkippedBytes, stats.SkippedBytes)
      totalMappedWrites = SaturatingAdd(totalMappedWrites, stats.MappedWrites)
      totalFlushes = SaturatingAdd(totalFlushes, stats.Flushes)
      totalRetainedReuse = SaturatingAdd(totalRetainedReuse, stats.RetainedReuse)
      lastStats = stats
      return stats
    }

  internal func Bind(commandBuffer VkCommandBuffer, pipelineLayout VkPipelineLayout) {
    Bind(commandBuffer, pipelineLayout, 1u)
  }

  internal func Bind(commandBuffer VkCommandBuffer, pipelineLayout VkPipelineLayout,
    setIndex uint32) {
      EnsureOpen()
      if commandBuffer == nint(0) || pipelineLayout == 0uL {
        throw ArgumentException("Vulkan clip descriptor binding arguments are invalid")
      }
      if preparedSlot < 0 {
        throw InvalidOperationException("Vulkan clip frame data is not prepared")
      }
      if atlas.Generation != atlasGenerations[preparedSlot] {
        UpdateAtlasDescriptor(preparedSlot)
        atlasGenerations[preparedSlot] = atlas.Generation
      }
      descriptors.Bind(preparedSlot, commandBuffer, pipelineLayout, setIndex)
    }

  internal func MarkSubmitted(slotIndex int32, submissionSerial uint64) {
    ValidateSubmission(slotIndex, submissionSerial)
    if let regions = preparedRegions {
      atlas.MarkUsed(regions, preparedRegionCount, submissionSerial)
    } else {
      atlas.MarkUsed(submissionSerial)
    }
    let slot = slots[slotIndex]
    slot.Lifecycle.AcceptSubmission(submissionSerial)
    if lastStats.SlotIndex == slotIndex {
      lastStats.LastUseSerial = submissionSerial
    }
    preparedSlot = -1
    preparedBytes = 0uL
    preparedRegions = nil
    preparedRegionCount = 0
  }

  internal func ReconcileSubmitted(slotIndex int32, submissionSerial uint64) {
    EnsureOpen()
    if slotIndex < 0 || slotIndex >= SlotCount || submissionSerial == 0uL {
      throw ArgumentOutOfRangeException("submissionSerial")
    }
    let slot = slots[slotIndex]
    if preparedSlot == slotIndex && slot.Lifecycle.Prepared {
      if let regions = preparedRegions {
        atlas.MarkUsed(regions, preparedRegionCount, submissionSerial)
      } else {
        atlas.MarkUsed(submissionSerial)
      }
      slot.Lifecycle.AcceptSubmission(submissionSerial)
      if lastStats.SlotIndex == slotIndex {
        lastStats.LastUseSerial = submissionSerial
      }
      preparedSlot = -1
      preparedBytes = 0uL
    } else if preparedSlot >= 0 {
      throw InvalidOperationException("Vulkan clip frame data belongs to another prepared slot")
    } else if slot.Lifecycle.LastUseSerial != submissionSerial {
      throw InvalidOperationException("Vulkan clip frame submission state is not recoverable")
    } else if let regions = preparedRegions {
      atlas.MarkUsed(regions, preparedRegionCount, submissionSerial)
    }
    preparedRegions = nil
    preparedRegionCount = 0
  }

  internal func ValidateSubmission(slotIndex int32, submissionSerial uint64) {
    EnsureOpen()
    if slotIndex < 0 || slotIndex >= SlotCount || submissionSerial == 0uL {
      throw ArgumentOutOfRangeException("submissionSerial")
    }
    let slot = slots[slotIndex]
    if preparedSlot != slotIndex || !slot.Lifecycle.Prepared {
      throw InvalidOperationException("Vulkan clip frame slot has no prepared work")
    }
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
    if slotIndex < 0 || slotIndex >= SlotCount {
      throw ArgumentOutOfRangeException("slotIndex")
    }
    if preparedSlot != slotIndex {
      return
    }
    slots[slotIndex].Lifecycle.Abort()
    slots[slotIndex].InvalidateRetention()
    if lastStats.SlotIndex == slotIndex {
      lastStats.RetentionValid = false
      lastStats.Retained = false
    }
    preparedSlot = -1
    preparedBytes = 0uL
    preparedRegions = nil
    preparedRegionCount = 0
  }

  internal func InvalidateRetention() {
    EnsureOpen()
    var index int32 = 0
    while index < slots.Length {
      slots[index].InvalidateRetention()
      index++
    }
    lastStats.RetentionValid = false
    lastStats.Retained = false
  }

  internal func DisposeAfterDeviceLoss() {
    if disposed {
      return
    }
    disposed = true
    preparedSlot = -1
    preparedBytes = 0uL
    preparedRegions = nil
    preparedRegionCount = 0
    var index int32 = 0
    while index < slots.Length {
      slots[index].Lifecycle.Reset()
      slots[index].DestroyBuffer()
      index++
    }
    lastStats.RetentionValid = false
    lastStats.Retained = false
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
      throw InvalidOperationException("Vulkan clip frame data has prepared work")
    }
    var index int32 = 0
    while index < slots.Length {
      if slots[index].Lifecycle.LastUseSerial != 0uL {
        throw InvalidOperationException("Vulkan clip frame data is still in flight")
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

  private func WriteWords(words * uint32, frame SceneFrame,
    regions []VulkanClipMaskRegion, regionCount int32,
    textChainTable bool, tableBaseWord uint64) {
      words[0] = uint32(frame.DrawRefCount)
      let maskBaseWord = if frame.ClipMaskCount == 0 {
        4uL
      } else {
        4uL + uint64(frame.DrawRefCount) * 12uL
      }
      words[1] = uint32(maskBaseWord)
      words[2] = uint32(frame.ClipMaskCount)
      words[3] = if frame.ClipMaskCount == 0 || !textChainTable {
        0u
      } else {
        uint32(tableBaseWord)
      }
      if frame.ClipMaskCount == 0 {
        return
      }
      let layerOriginsX * float32 = stackalloc[MaxLayerDepth]float32
      let layerOriginsY * float32 = stackalloc[MaxLayerDepth]float32
      var layerDepth int32 = 0
      var drawIndex int32 = 0
      while drawIndex < frame.DrawRefCount {
        let reference = frame.DrawRefs[drawIndex]
        let base = 4 + drawIndex * 12
        words[base] = 0u
        var maskIndex int32 = 0
        while maskIndex < 8 {
          words[base + 1 + maskIndex] = 0u
          maskIndex++
        }
        words[base + 9] = 0u
        let originX = if reference.Kind == SceneDrawKind.LayerEnd {
          if layerDepth <= 0 {
            throw InvalidOperationException("Vulkan layer clip origin stack underflow")
          }
          if layerDepth > 1 { layerOriginsX[layerDepth - 2] } else { 0.0F }
        } else if layerDepth > 0 { layerOriginsX[layerDepth - 1] } else { 0.0F }
        let originY = if reference.Kind == SceneDrawKind.LayerEnd {
          if layerDepth <= 0 {
            throw InvalidOperationException("Vulkan layer clip origin stack underflow")
          }
          if layerDepth > 1 { layerOriginsY[layerDepth - 2] } else { 0.0F }
        } else if layerDepth > 0 { layerOriginsY[layerDepth - 1] } else { 0.0F }
        words[base + 10] = BitValue(originX)
        words[base + 11] = BitValue(originY)
        var chainIndex = reference.ClipChainId
        let reverse * int32 = stackalloc[8]int32
        var depth int32 = 0
        var forceZero bool = false
        while chainIndex > 0 {
          if chainIndex >= frame.ClipChainCount || depth >= 8 {
            throw InvalidOperationException("Vulkan clip chain is invalid")
          }
          let chain = frame.ClipChains[chainIndex]
          if (chain.Flags & uint32(SceneClipChainFlags.Zero)) != 0u {
            forceZero = true
            break
          }
          if chain.MaskIndex < 0 || chain.MaskIndex >= frame.ClipMaskCount {
            throw InvalidOperationException("Vulkan clip chain mask is invalid")
          }
          reverse[depth] = chain.MaskIndex
          depth++
          chainIndex = chain.ParentIndex
          if chainIndex < 0 {
            throw InvalidOperationException("Vulkan clip chain parent is invalid")
          }
        }
        words[base] = uint32(depth)
        var resolved int32 = 0
        while resolved < depth {
          words[base + 1 + resolved] = uint32(reverse[depth - resolved - 1])
          resolved++
        }
        if forceZero {
          words[base + 9] = 2u
        }
        if reference.Kind == SceneDrawKind.LayerBegin {
          if reference.Index < 0 || reference.Index >= frame.LayerCount
            || layerDepth >= MaxLayerDepth{
              throw InvalidOperationException("Vulkan layer clip origin stack is invalid")
            }
          let layer = frame.Layers[reference.Index]
          layerOriginsX[layerDepth] = layer.OriginX
          layerOriginsY[layerDepth] = layer.OriginY
          layerDepth = layerDepth + 1
        } else if reference.Kind == SceneDrawKind.LayerEnd {
          if layerDepth <= 0 {
            throw InvalidOperationException("Vulkan layer clip origin stack underflow")
          }
          layerDepth = layerDepth - 1
        }
        drawIndex++
      }
      if layerDepth != 0 {
        throw InvalidOperationException("Vulkan layer clip origin stack is not balanced")
      }
      var clipIndex int32 = 0
      while clipIndex < frame.ClipMaskCount {
        if clipIndex >= regionCount {
          throw InvalidOperationException("Vulkan clip mask region is unavailable")
        }
        let region = regions[clipIndex]
        let base = int32(words[1]) + clipIndex * 12
        words[base] = BitValue(float32(region.ScreenX))
        words[base + 1] = BitValue(float32(region.ScreenY))
        words[base + 2] = BitValue(float32(region.ScreenX + int32(region.ScreenWidth)))
        words[base + 3] = BitValue(float32(region.ScreenY + int32(region.ScreenHeight)))
        words[base + 4] = BitValue(region.Mapping.ScaleX)
        words[base + 5] = BitValue(region.Mapping.ScaleY)
        words[base + 6] = BitValue(region.Mapping.OffsetX)
        words[base + 7] = BitValue(region.Mapping.OffsetY)
        words[base + 8] = region.Mapping.Layer
        words[base + 9] = 1u
        words[base + 10] = 0u
        words[base + 11] = 0u
        clipIndex++
      }
      if textChainTable {
        let tableBase = int32(tableBaseWord)
        words[tableBase] = uint32(frame.ClipChainCount)
        var tableIndex int32 = 0
        while tableIndex < frame.ClipChainCount {
          let base = tableBase + 1 + tableIndex * 12
          var wordIndex int32 = 0
          while wordIndex < 12 {
            words[base + wordIndex] = 0u
            wordIndex++
          }
          if tableIndex > 0 {
            var chainIndex = tableIndex
            let reverse * int32 = stackalloc[8]int32
            var depth int32 = 0
            var forceZero bool = false
            while chainIndex > 0 {
              if chainIndex >= frame.ClipChainCount || depth >= 8 {
                throw InvalidOperationException("Vulkan clip chain is invalid")
              }
              let chain = frame.ClipChains[chainIndex]
              if (chain.Flags & uint32(SceneClipChainFlags.Zero)) != 0u {
                forceZero = true
                break
              }
              if chain.MaskIndex < 0 || chain.MaskIndex >= frame.ClipMaskCount {
                throw InvalidOperationException("Vulkan clip chain mask is invalid")
              }
              reverse[depth] = chain.MaskIndex
              depth++
              chainIndex = chain.ParentIndex
              if chainIndex < 0 {
                throw InvalidOperationException("Vulkan clip chain parent is invalid")
              }
            }
            words[base] = uint32(depth)
            var resolved int32 = 0
            while resolved < depth {
              words[base + 1 + resolved] = uint32(reverse[depth - resolved - 1])
              resolved++
            }
            if forceZero {
              words[base + 9] = 2u
            }
          }
          tableIndex++
        }
      }
    }

  private func BitValue(value float32) uint32 -> uint32(BitConverter.SingleToInt32Bits(value))

  private func SaturatingAdd(current uint64, value uint64) uint64 {
    if value > uint64.MaxValue - current {
      return uint64.MaxValue
    }
    return current + value
  }

  private func CreateDescriptorResources() {
    let poolSizes * VkDescriptorPoolSize = stackalloc[2]VkDescriptorPoolSize
    poolSizes[0] = VkDescriptorPoolSize{}
    poolSizes[0]._type = VkConstants.VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER
    poolSizes[0].descriptorCount = uint32(SlotCount)
    poolSizes[1] = VkDescriptorPoolSize{}
    poolSizes[1]._type = VkConstants.VK_DESCRIPTOR_TYPE_STORAGE_BUFFER
    poolSizes[1].descriptorCount = uint32(SlotCount)
    let layouts * VkDescriptorSetLayout = stackalloc[SlotCount]VkDescriptorSetLayout
    var index int32 = 0
    while index < SlotCount {
      layouts[index] = descriptorSetLayout
      index++
    }
    let creation = VulkanDescriptorFactory.CreatePoolAndAllocate(
      device,
      dispatch,
      objectAccounting,
      poolSizes,
      2u,
      layouts,
      uint32(SlotCount),
      &descriptors.Sets[0])
    descriptors.Adopt(creation)
    index = 0
    while index < SlotCount {
      UpdateAtlasDescriptor(index)
      atlasGenerations[index] = atlas.Generation
      index++
    }
  }

  private func UpdateDescriptors(slotIndex int32, byteCount VkDeviceSize) {
    VulkanDescriptorFactory.WriteStorageBuffer(
      device,
      dispatch,
      descriptors.Sets[slotIndex],
      1u,
      slots[slotIndex].Buffers.Buffer,
      0uL,
      byteCount)
    if atlas.Generation != atlasGenerations[slotIndex] {
      UpdateAtlasDescriptor(slotIndex)
      atlasGenerations[slotIndex] = atlas.Generation
    }
  }

  private func UpdateAtlasDescriptor(slotIndex int32) {
    VulkanDescriptorFactory.WriteCombinedImageSampler(
      device,
      dispatch,
      descriptors.Sets[slotIndex],
      0u,
      atlas.Sampler,
      atlas.ImageView,
      VkConstants.VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL)
  }

  private func DisposeSlots() {
    var index int32 = 0
    while index < slots.Length {
      try { slots[index].Dispose() } catch (cleanup Exception) { slots[index].DestroyBuffer() }
      index++
    }
  }

  private func DestroyDescriptorResources() {
    descriptors.Destroy()
  }

  private func EnsureOpen() {
    if disposed {
      throw ObjectDisposedException("VulkanClipMaskFrameData")
    }
  }
}
