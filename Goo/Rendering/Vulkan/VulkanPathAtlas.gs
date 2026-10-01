package Goo

import System

internal data struct VulkanPathAtlasStats {
  var WordCapacity VkDeviceSize
  var ByteCapacity VkDeviceSize
  var Buffer VkBuffer
  var StagingBuffer VkBuffer
  var DescriptorSetLayout VkDescriptorSetLayout
  var DescriptorSet VkDescriptorSet
  var LiveObjectCount uint64
  var UploadPending bool
  var UploadRecorded bool
  var UploadSubmitted bool
  var Uploaded bool
  var UploadWordOffset VkDeviceSize
  var UploadWordCount VkDeviceSize
  var UploadByteOffset VkDeviceSize
  var UploadByteCount VkDeviceSize
  var UploadFence uint64
  var UploadCommandBuffer VkCommandBuffer
}

internal unsafe partial class VulkanPathAtlas : IDisposable {
  private const WordBytes VkDeviceSize = 4uL
  private const MaxWordCapacity VkDeviceSize = 536870911uL
  private const MaxAtlasBytes VkDeviceSize = 2147483644uL

  private let device VkDevice
  private let dispatch VkDeviceDispatch
  private let allocator VulkanMemoryAllocator?
  private let objectAccounting VulkanObjectAccounting?
  private let wordCapacity VkDeviceSize
  private let byteCapacity VkDeviceSize
  private let maximumWordCapacity VkDeviceSize
  private let descriptorSetLayout VkDescriptorSetLayout
  private var atlasBuffer VkBuffer = 0uL
  private var atlasAllocation VulkanMemoryAllocation? = nil
  private var stagingBuffer VkBuffer = 0uL
  private var stagingAllocation VulkanMemoryAllocation? = nil
  private var descriptorPool VkDescriptorPool = 0uL
  private var descriptorSet VkDescriptorSet = 0uL
  private var uploadCommandBuffer VkCommandBuffer = nint(0)
  private var uploadFence uint64 = 0uL
  private var uploadPending bool
  private var uploadRecorded bool
  private var uploadSubmitted bool
  private var uploaded bool
  private var uploadWordOffset VkDeviceSize
  private var uploadWordCount VkDeviceSize
  private var uploadByteOffset VkDeviceSize
  private var uploadByteCount VkDeviceSize
  private var uploadSequence uint64
  private var completedUploadSequence uint64
  private var flushPrepared bool
  private var disposed bool
  private let testMode bool

  internal prop WordCapacity VkDeviceSize{ get -> wordCapacity }
  internal prop ByteCapacity VkDeviceSize{ get -> byteCapacity }
  internal prop MaximumWordCapacity VkDeviceSize{ get -> maximumWordCapacity }
  internal prop Buffer VkBuffer{ get -> atlasBuffer }
  internal prop StagingBuffer VkBuffer{ get -> stagingBuffer }
  internal prop DescriptorSetLayout VkDescriptorSetLayout{ get -> descriptorSetLayout }
  internal prop DescriptorSet VkDescriptorSet{ get -> descriptorSet }
  internal prop UploadPending bool{ get -> uploadPending }
  internal prop UploadRecorded bool{ get -> uploadRecorded }
  internal prop UploadSubmitted bool{ get -> uploadSubmitted }
  internal prop IsUploaded bool{ get -> uploaded }
  internal prop UploadWordOffset VkDeviceSize{ get -> uploadWordOffset }
  internal prop UploadWordCount VkDeviceSize{ get -> uploadWordCount }
  internal prop UploadByteOffset VkDeviceSize{ get -> uploadByteOffset }
  internal prop UploadByteCount VkDeviceSize{ get -> uploadByteCount }
  internal prop UploadSequence uint64{ get -> uploadSequence }
  internal prop CompletedUploadSequence uint64{ get -> completedUploadSequence }
  internal prop Stats VulkanPathAtlasStats{
    get {
      return VulkanPathAtlasStats{
        WordCapacity: wordCapacity,
        ByteCapacity: byteCapacity,
        Buffer: atlasBuffer,
        StagingBuffer: stagingBuffer,
        DescriptorSetLayout: descriptorSetLayout,
        DescriptorSet: descriptorSet,
        LiveObjectCount: LiveObjectCount(),
        UploadPending: uploadPending,
        UploadRecorded: uploadRecorded,
        UploadSubmitted: uploadSubmitted,
        Uploaded: uploaded,
        UploadWordOffset: uploadWordOffset,
        UploadWordCount: uploadWordCount,
        UploadByteOffset: uploadByteOffset,
        UploadByteCount: uploadByteCount,
        UploadFence: uploadFence,
        UploadCommandBuffer: uploadCommandBuffer,
      }
    }
  }

  internal init(
    nativeDevice VkDevice,
    nativeDispatch VkDeviceDispatch,
    nativeAllocator VulkanMemoryAllocator,
    atlasByteSize VkDeviceSize,
    nativeMaxStorageBufferRange uint32,
    nativeDescriptorSetLayout VkDescriptorSetLayout,
    nativeObjectAccounting VulkanObjectAccounting?) {
      if nativeDevice == nint(0) {
        throw ArgumentException("Vulkan device is null", "nativeDevice")
      }
      if nativeDescriptorSetLayout == 0uL {
        throw ArgumentException("Vulkan path atlas descriptor layout is null", "nativeDescriptorSetLayout")
      }
      if atlasByteSize == 0uL || atlasByteSize > MaxAtlasBytes
        || (atlasByteSize % WordBytes) != 0uL
        || nativeMaxStorageBufferRange == 0u
        || atlasByteSize > uint64(nativeMaxStorageBufferRange) {
          throw ArgumentOutOfRangeException("atlasByteSize")
        }
      device = nativeDevice
      dispatch = nativeDispatch
      allocator = nativeAllocator
      objectAccounting = nativeObjectAccounting
      testMode = false
      wordCapacity = atlasByteSize / WordBytes
      byteCapacity = atlasByteSize
      var maximumBytes = uint64(nativeMaxStorageBufferRange)
      if maximumBytes > MaxAtlasBytes {
        maximumBytes = MaxAtlasBytes
      }
      maximumWordCapacity = maximumBytes / WordBytes
      descriptorSetLayout = nativeDescriptorSetLayout
      try {
        CreateAtlasBuffer()
        CreateDescriptorResources()
        CreateStagingBuffer()
      } catch (error Exception) {
        DestroyStagingBuffer()
        DestroyDescriptorResources()
        DestroyAtlasBuffer()
        throw error
      }
    }

  internal init(testWordCapacity VkDeviceSize) {
    if testWordCapacity == 0uL || testWordCapacity > MaxWordCapacity {
      throw ArgumentOutOfRangeException("testWordCapacity")
    }
    device = nint(1)
    dispatch = VkDeviceDispatch{}
    allocator = nil
    objectAccounting = nil
    testMode = true
    wordCapacity = testWordCapacity
    byteCapacity = testWordCapacity * WordBytes
    maximumWordCapacity = MaxWordCapacity
    descriptorSetLayout = 1uL
  }

  internal func CreateReplacement(replacementWordCapacity VkDeviceSize) VulkanPathAtlas {
    EnsureOpen()
    if replacementWordCapacity <= wordCapacity
      || replacementWordCapacity > maximumWordCapacity{
        throw ArgumentOutOfRangeException("replacementWordCapacity")
      }
    if testMode {
      return VulkanPathAtlas(replacementWordCapacity)
    }
    return VulkanPathAtlas(
      device,
      dispatch,
      allocator!!,
      replacementWordCapacity * WordBytes,
      uint32(maximumWordCapacity * WordBytes),
      descriptorSetLayout,
      objectAccounting)
  }

  internal func QueueUpload(source * uint32, sourceWordCount VkDeviceSize) bool -> QueueUpload(source, 0uL, sourceWordCount)

  internal func QueueUpload(source * uint32, destinationWordOffset VkDeviceSize,
    sourceWordCount VkDeviceSize) bool{
      EnsureOpen()
      if source == nil {
        throw ArgumentNullException("source")
      }
      if sourceWordCount == 0uL || destinationWordOffset > wordCapacity
        || sourceWordCount > wordCapacity - destinationWordOffset{
          throw ArgumentException("Vulkan path atlas upload range is invalid", "sourceWordCount")
        }
      if uploadPending {
        throw InvalidOperationException("Vulkan path atlas upload is already pending")
      }
      if uploadSequence == uint64.MaxValue {
        throw OverflowException("Vulkan path atlas upload sequence overflow")
      }
      uploadSequence = uploadSequence + 1uL
      if !testMode {
        let destination = *uint32(nint(stagingAllocation!!.mapped))
        var wordIndex int32 = 0
        let destinationOffset = int32(destinationWordOffset)
        let copyLength = int32(sourceWordCount)
        while wordIndex < copyLength {
          destination[destinationOffset + wordIndex] = source[wordIndex]
          wordIndex++
        }
      }
      uploadPending = true
      uploadRecorded = false
      uploadSubmitted = false
      uploadWordOffset = destinationWordOffset
      uploadWordCount = sourceWordCount
      uploadByteOffset = destinationWordOffset * WordBytes
      uploadByteCount = sourceWordCount * WordBytes
      uploadCommandBuffer = nint(0)
      uploadFence = 0uL
      flushPrepared = false
      return true
    }

  internal func RecordUpload(commandBuffer VkCommandBuffer) {
    EnsureOpen()
    if commandBuffer == nint(0) {
      throw ArgumentException("Command buffer is null", "commandBuffer")
    }
    if !uploadPending {
      throw InvalidOperationException("Vulkan path atlas has no pending upload")
    }
    if uploadSubmitted {
      throw InvalidOperationException("Vulkan path atlas upload has already been submitted")
    }
    if uploadRecorded {
      if uploadCommandBuffer != commandBuffer {
        throw InvalidOperationException("Vulkan path atlas upload is recorded into another command buffer")
      }
      return
    }
    if testMode {
      uploadCommandBuffer = commandBuffer
      uploadRecorded = true
      return
    }
    var copy = VkBufferCopy{}
    copy.srcOffset = uploadByteOffset
    copy.dstOffset = uploadByteOffset
    copy.size = uploadByteCount
    let copyBuffer = dispatch.vkCmdCopyBuffer
    copyBuffer(commandBuffer, stagingBuffer, atlasBuffer, 1u, &copy)

    VulkanTransitions.RecordBuffer(
      commandBuffer,
      dispatch.vkCmdPipelineBarrier2,
      atlasBuffer,
      uploadByteOffset,
      uploadByteCount,
      VkConstants.VK_PIPELINE_STAGE_2_TRANSFER_BIT,
      VkConstants.VK_ACCESS_2_TRANSFER_WRITE_BIT,
      VkConstants.VK_PIPELINE_STAGE_2_VERTEX_SHADER_BIT
      | VkConstants.VK_PIPELINE_STAGE_2_FRAGMENT_SHADER_BIT,
      VkConstants.VK_ACCESS_2_SHADER_STORAGE_READ_BIT)
    uploadCommandBuffer = commandBuffer
    uploadRecorded = true
  }

  internal func FlushBeforeSubmit() VkResult {
    EnsureOpen()
    if !uploadPending || flushPrepared {
      return VkConstants.VK_SUCCESS
    }
    if testMode {
      flushPrepared = true
      return VkConstants.VK_SUCCESS
    }
    let result = allocator!!.FlushBeforeSubmit(stagingAllocation!!,
      uploadByteOffset, uploadByteCount)
    if result == VkConstants.VK_SUCCESS {
      flushPrepared = true
    }
    return result
  }

  internal func MarkSubmitted(commandBuffer VkCommandBuffer, fence uint64) {
    EnsureOpen()
    if commandBuffer == nint(0) || fence == 0uL {
      throw ArgumentException("Path atlas submission arguments are invalid")
    }
    if !uploadPending || !uploadRecorded || uploadCommandBuffer != commandBuffer {
      throw InvalidOperationException("Vulkan path atlas upload is not recorded for this command buffer")
    }
    if !flushPrepared {
      throw InvalidOperationException("Vulkan path atlas upload must be flushed before submit")
    }
    if uploadSubmitted {
      if uploadFence != fence {
        throw InvalidOperationException("Vulkan path atlas upload fence changed")
      }
      return
    }
    uploadSubmitted = true
    uploadFence = fence
  }

  internal func Collect(completedFence uint64) bool {
    EnsureOpen()
    if !uploadSubmitted || uploadFence > completedFence {
      return false
    }
    uploadPending = false
    uploadRecorded = false
    uploadSubmitted = false
    uploaded = true
    uploadWordOffset = 0uL
    uploadWordCount = 0uL
    uploadByteOffset = 0uL
    uploadByteCount = 0uL
    uploadCommandBuffer = nint(0)
    uploadFence = 0uL
    completedUploadSequence = uploadSequence
    flushPrepared = false
    return true
  }

  internal func AbortUpload(commandBuffer VkCommandBuffer) bool {
    EnsureOpen()
    if !uploadPending {
      return false
    }
    if uploadSubmitted {
      throw InvalidOperationException("Vulkan path atlas upload has already been submitted")
    }
    if uploadRecorded && uploadCommandBuffer != commandBuffer {
      throw InvalidOperationException("Vulkan path atlas upload belongs to another command buffer")
    }
    uploadPending = false
    uploadRecorded = false
    uploadWordOffset = 0uL
    uploadWordCount = 0uL
    uploadByteOffset = 0uL
    uploadByteCount = 0uL
    uploadCommandBuffer = nint(0)
    uploadFence = 0uL
    flushPrepared = false
    return true
  }

  internal func BindDescriptor(commandBuffer VkCommandBuffer, pipelineLayout VkPipelineLayout) {
    EnsureOpen()
    if commandBuffer == nint(0) || pipelineLayout == 0uL {
      throw ArgumentException("Path atlas descriptor binding arguments are invalid")
    }
    let recordedHere = uploadPending && uploadRecorded && !uploadSubmitted
      && uploadCommandBuffer == commandBuffer
    if !uploaded && !recordedHere && !uploadSubmitted {
      throw InvalidOperationException("Vulkan path atlas upload is not ready for this command buffer")
    }
    if uploadPending && (!uploadRecorded
        || (!uploadSubmitted && uploadCommandBuffer != commandBuffer)) {
          throw InvalidOperationException("Vulkan path atlas upload is not ready for this command buffer")
        }
    if descriptorSet == 0uL {
      throw InvalidOperationException("Vulkan path atlas descriptor set is unavailable")
    }
    let bindDescriptorSets = dispatch.vkCmdBindDescriptorSets
    bindDescriptorSets(commandBuffer, VkConstants.VK_PIPELINE_BIND_POINT_GRAPHICS,
      pipelineLayout, 0u, 1u, &descriptorSet, 0u, nil)
  }

  private func LiveObjectCount() uint64 {
    var count uint64 = 0uL
    if atlasBuffer != 0uL { count++ }
    if descriptorPool != 0uL { count++ }
    if descriptorSet != 0uL { count++ }
    if stagingBuffer != 0uL { count++ }
    return count
  }

  public func Dispose() {
    if disposed {
      return
    }
    if uploadSubmitted || (uploadPending && uploadRecorded) {
      throw InvalidOperationException("Vulkan path atlas still has in-flight upload work")
    }
    disposed = true
    DestroyStagingBuffer()
    DestroyDescriptorResources()
    DestroyAtlasBuffer()
  }

  deinit{
    try {
      Dispose()
    } catch (error Exception) {
    }
  }

  private func CreateAtlasBuffer() {
    let creation = VulkanBufferFactory.Create(
      device,
      dispatch,
      allocator!!,
      objectAccounting,
      byteCapacity,
      uint32(VkConstants.VK_BUFFER_USAGE_TRANSFER_DST_BIT)
      | uint32(VkConstants.VK_BUFFER_USAGE_STORAGE_BUFFER_BIT),
      VulkanMemoryPolicy.DeviceLocalRequired)
    atlasBuffer = creation.Buffer
    atlasAllocation = creation.Allocation
  }

  private func CreateDescriptorResources() {
    var poolSize = VkDescriptorPoolSize{}
    poolSize._type = VkConstants.VK_DESCRIPTOR_TYPE_STORAGE_BUFFER
    poolSize.descriptorCount = 1u
    var layout = descriptorSetLayout
    var createdSet VkDescriptorSet = 0uL
    let creation = VulkanDescriptorFactory.CreatePoolAndAllocate(
      device,
      dispatch,
      objectAccounting,
      &poolSize,
      1u,
      &layout,
      1u,
      &createdSet)
    descriptorPool = creation.Pool
    descriptorSet = createdSet
    VulkanDescriptorFactory.WriteStorageBuffer(
      device,
      dispatch,
      descriptorSet,
      0u,
      atlasBuffer,
      0uL,
      byteCapacity)
  }

  private func CreateStagingBuffer() {
    let creation = VulkanBufferFactory.CreateMapped(
      device,
      dispatch,
      allocator!!,
      objectAccounting,
      byteCapacity,
      uint32(VkConstants.VK_BUFFER_USAGE_TRANSFER_SRC_BIT),
      VulkanMemoryPolicy.HostVisibleCoherentCached)
    stagingBuffer = creation.Buffer
    stagingAllocation = creation.Allocation
  }

  private func DestroyStagingBuffer() {
    if stagingBuffer != 0uL {
      let staleBuffer = stagingBuffer
      stagingBuffer = 0uL
      let destroyBuffer = dispatch.vkDestroyBuffer
      try { destroyBuffer(device, staleBuffer, nil) } catch (cleanup Exception) { }
      if let accounting = objectAccounting {
        try { accounting.Release() } catch (cleanup Exception) { }
      }
    }
    if let allocation = stagingAllocation {
      stagingAllocation = nil
      try { allocator!!.Release(allocation) } catch (cleanup Exception) { }
    }
  }

  private func DestroyDescriptorResources() {
    if descriptorPool != 0uL {
      let stalePool = descriptorPool
      let staleSet = descriptorSet
      descriptorPool = 0uL
      descriptorSet = 0uL
      let destroyPool = dispatch.vkDestroyDescriptorPool
      try { destroyPool(device, stalePool, nil) } catch (cleanup Exception) { }
      if staleSet != 0uL {
        if let accounting = objectAccounting {
          try { accounting.Release() } catch (cleanup Exception) { }
        }
      }
      if let accounting = objectAccounting {
        try { accounting.Release() } catch (cleanup Exception) { }
      }
    }
    descriptorSet = 0uL
  }

  private func DestroyAtlasBuffer() {
    if atlasBuffer != 0uL {
      let staleBuffer = atlasBuffer
      atlasBuffer = 0uL
      let destroyBuffer = dispatch.vkDestroyBuffer
      try { destroyBuffer(device, staleBuffer, nil) } catch (cleanup Exception) { }
      if let accounting = objectAccounting {
        try { accounting.Release() } catch (cleanup Exception) { }
      }
    }
    if let allocation = atlasAllocation {
      atlasAllocation = nil
      try { allocator!!.Release(allocation) } catch (cleanup Exception) { }
    }
  }

  private func EnsureOpen() {
    if disposed {
      throw ObjectDisposedException("VulkanPathAtlas")
    }
  }
}
