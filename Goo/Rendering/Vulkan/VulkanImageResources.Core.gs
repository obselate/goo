package Goo

import System
import System.Collections.Generic

internal unsafe partial class VulkanImageResources : IDisposable {
  internal prop HasUnsubmittedRecordedUpload bool{
    get {
      if uploadRing.Stats.ActiveRanges == 0 {
        return false
      }
      var index int32 = 0
      while index < entries.Length {
        let entry = entries[index]
        if entry.State == VulkanImageResourceState.UploadPending
          && entry.Upload.Succeeded && entry.UploadRecorded
          && !entry.UploadSubmitted{
            return true
          }
        index++
      }
      return false
    }
  }

  private const MaxCapacity int32 = 1048576
  private const MaxStagingBytes VkDeviceSize = 4294967295uL

  private let device VkDevice
  private let dispatch VkDeviceDispatch
  private let allocator VulkanMemoryAllocator
  private var capacity int32
  private var descriptorCapacity int32
  private let residentByteBudget VkDeviceSize
  private var logicalStats VulkanResourceRegistryStats
  private var entries []VulkanImageResourceEntry
  private var logicalRecords []VulkanImageLogicalRecord
  private var descriptorSets []VkDescriptorSet
  private let poolSizes []VkDescriptorPoolSize
  private var currentReferenceCounts []int32
  private let uploadRing VulkanUploadRing
  private let diagnostics VulkanDiagnostics?
  private let objectAccounting VulkanObjectAccounting?
  private let stagingMaximumByteCapacity VkDeviceSize
  private var stagingByteCapacity VkDeviceSize
  private let stagingGate object
  private var stagingBuffer VkBuffer
  private var stagingAllocation VulkanMemoryAllocation? = nil
  private let descriptorPools List[VkDescriptorPool]
  private var descriptorSetLayout VkDescriptorSetLayout
  private var trackedDescriptorSetCount int32
  private var trackedDescriptorPoolCount int32
  private var nearestSampler VkSampler
  private var linearSampler VkSampler
  private var generation uint64
  private var generationLastUseFence uint64
  private var highestCompletedFence uint64
  private var nextTouch uint64
  private var liveCount int32
  private var residentBytes VkDeviceSize
  private var flushPrepared bool
  private var disposed bool

  internal prop Generation uint64{ get -> generation }
  internal prop DescriptorSetLayout VkDescriptorSetLayout{ get -> descriptorSetLayout }
  internal prop Stats VulkanImageResourceStats{
    get {
      return VulkanImageResourceStats{
        Generation: generation,
        Capacity: capacity,
        LiveCount: liveCount,
        ResidentBytes: residentBytes,
        ResidentByteBudget: residentByteBudget,
        LiveObjectCount: CurrentLiveObjectHandleCount(),
        DescriptorCapacity: descriptorCapacity,
        BoundDescriptorCount: CurrentBoundDescriptorCount(),
        RetiringDescriptorCount: CurrentRetiringDescriptorCount(),
        HighestCompletedFence: highestCompletedFence,
        Upload: uploadRing.Stats,
        Registry: logicalStats,
      }
    }
  }

  private func ClearDiagnosticImageState() {
    if let currentDiagnostics = diagnostics {
      currentDiagnostics.SetImageResidentBytes(0uL)
      currentDiagnostics.SetImageLiveObjectCount(0uL)
    }
  }

  internal init(
    nativeDevice VkDevice,
    nativeDispatch VkDeviceDispatch,
    nativeAllocator VulkanMemoryAllocator,
    imageCapacity int32,
    logicalResourceCapacity int32,
    maximumResidentBytes VkDeviceSize,
    maximumLogicalSourceBytes VkDeviceSize,
    stagingInitialBytes VkDeviceSize,
    maximumStagingBytes VkDeviceSize,
    uploadRangeCapacity int32,
    nativeDiagnostics VulkanDiagnostics?,
    initialGeneration uint64,
    nativeObjectAccounting VulkanObjectAccounting?) {
      if nativeDevice == nint(0) {
        throw ArgumentException("Vulkan device is null", "nativeDevice")
      }
      if imageCapacity <= 0 || imageCapacity > MaxCapacity {
        throw ArgumentOutOfRangeException("imageCapacity")
      }
      if logicalResourceCapacity < imageCapacity || logicalResourceCapacity > MaxCapacity {
        throw ArgumentOutOfRangeException("logicalResourceCapacity")
      }
      if maximumResidentBytes == 0uL {
        throw ArgumentOutOfRangeException("maximumResidentBytes")
      }
      if maximumLogicalSourceBytes == 0uL {
        throw ArgumentOutOfRangeException("maximumLogicalSourceBytes")
      }
      if stagingInitialBytes == 0uL || stagingInitialBytes > MaxStagingBytes
        || maximumStagingBytes < stagingInitialBytes
        || maximumStagingBytes > MaxStagingBytes{
          throw ArgumentOutOfRangeException("stagingInitialBytes")
        }
      if uploadRangeCapacity <= 0 || uploadRangeCapacity > MaxCapacity {
        throw ArgumentOutOfRangeException("uploadRangeCapacity")
      }
      if initialGeneration == 0uL {
        throw ArgumentOutOfRangeException("initialGeneration")
      }
      device = nativeDevice
      dispatch = nativeDispatch
      allocator = nativeAllocator
      diagnostics = nativeDiagnostics
      objectAccounting = nativeObjectAccounting
      capacity = imageCapacity
      residentByteBudget = maximumResidentBytes
      logicalStats = VulkanResourceRegistryStats{
        LogicalSourceBudget: maximumLogicalSourceBytes,
      }
      stagingByteCapacity = stagingInitialBytes
      stagingMaximumByteCapacity = maximumStagingBytes
      stagingGate = Object()
      entries = [imageCapacity]VulkanImageResourceEntry
      logicalRecords = [logicalResourceCapacity]VulkanImageLogicalRecord
      descriptorCapacity = imageCapacity + imageCapacity
      descriptorSets = [descriptorCapacity]VkDescriptorSet
      poolSizes = [1]VkDescriptorPoolSize
      currentReferenceCounts = [imageCapacity]int32
      descriptorPools = List[VkDescriptorPool]()
      generation = initialGeneration
      highestCompletedFence = 0uL
      generationLastUseFence = 0uL
      nextTouch = 1uL
      uploadRing = VulkanUploadRing(stagingInitialBytes, uploadRangeCapacity, initialGeneration)
      flushPrepared = false
      try {
        CreateGeneration()
      } catch (error Exception) {
        DestroyGeneration()
        DestroyStagingBuffer()
        uploadRing.Dispose()
        throw error
      }
    }

  internal func SetGeneration(nextGeneration uint64, completedFence uint64) {
    EnsureOpen()
    if nextGeneration == 0uL || nextGeneration <= generation {
      throw ArgumentOutOfRangeException("nextGeneration")
    }
    Collect(completedFence)
    if highestCompletedFence < generationLastUseFence {
      throw InvalidOperationException("Vulkan image generation is still in use")
    }
    var entryIndex int32 = 0
    while entryIndex < entries.Length {
      let entry = entries[entryIndex]
      if entry.State == VulkanImageResourceState.Retiring
        && entry.RetireFence > highestCompletedFence{
          throw InvalidOperationException("Vulkan image retirement is still in flight")
        }
      if entry.RecordingUseCount != 0 || entry.PendingRetire {
        throw InvalidOperationException("Vulkan image recording reservation is still active")
      }
      entryIndex++
    }
    let uploadStats = uploadRing.Stats
    if uploadStats.ActiveRanges != 0 || uploadStats.SubmittedRanges != 0 {
      throw InvalidOperationException("Vulkan image uploads are still in flight")
    }
    try {
      ValidateLogicalAttachments()
      DestroyGpuResources()
      DetachLogicalResources()
      ClearCurrentReferences()
      uploadRing.SetGeneration(nextGeneration)
      generation = nextGeneration
      generationLastUseFence = 0uL
      highestCompletedFence = 0uL
      flushPrepared = false
      CreateGeneration()
    } catch (error Exception) {
      ClearCurrentReferences()
      DestroyGeneration()
      DestroyStagingBuffer()
      uploadRing.Dispose()
      ClearLogicalResources()
      disposed = true
      throw error
    }
  }

}
