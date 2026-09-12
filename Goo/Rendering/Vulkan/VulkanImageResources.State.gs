package Goo

import System

internal unsafe partial class VulkanImageResources : IDisposable {
  internal func Collect(completedFence uint64) int32 {
    EnsureOpen()
    if completedFence > highestCompletedFence {
      highestCompletedFence = completedFence
    }
    let effectiveCompletedFence = highestCompletedFence
    let uploadStats = uploadRing.Stats
    if uploadStats.ActiveRanges == 0 && logicalStats.RetiringCount == 0
      && liveCount == logicalStats.ResidentCount{
        return 0
      }
    var completedUploads int32 = 0
    var index int32 = 0
    while index < entries.Length {
      var entry = entries[index]
      if entry.State == VulkanImageResourceState.UploadPending
        && entry.UploadSubmitted && entry.UploadFence <= effectiveCompletedFence{
          let completedRows = entry.UploadRowOffset + entry.UploadRowCount
          if entry.UploadRowCount == 0u
            || entry.UploadRowOffset != entry.UploadCompletedRows
            || completedRows > entry.Height{
              throw InvalidOperationException("Vulkan image upload completion range is invalid")
            }
          let finalChunk = completedRows == entry.Height
          if finalChunk {
            if let currentDiagnostics = diagnostics {
              currentDiagnostics.AddImageUploadCompleted(1uL)
            }
          }
          let pendingRetire = entry.PendingRetire
          if pendingRetire && !entry.GpuPublished {
            if finalChunk {
              entry.UploadedVersion = entry.Id.Version
            }
            entry.UploadCompletedRows = completedRows
            ResetUploadAttempt(ref entry)
            entry.PendingRetire = false
            entry.State = VulkanImageResourceState.Retiring
            entry.LastTouch = TouchValue()
            entries[index] = entry
          } else if !finalChunk {
            entry.UploadCompletedRows = completedRows
            ResetUploadAttempt(ref entry)
            entry.State = VulkanImageResourceState.Resident
            entry.LastTouch = TouchValue()
            entries[index] = entry
          } else {
            if pendingRetire {
              let logicalIndex = LogicalIndexForPhysical(index, entry)
              let retiredEntry = RetireDescriptors(entry, entry.RetireFence)
              RetireLogical(logicalIndex)
              entry = retiredEntry
            } else if !entry.GpuPublished {
              entry = PublishCompletedImage(index, entry)
            } else {
              LogicalIndexForPhysical(index, entry)
              entry.UploadedVersion = entry.Id.Version
            }
            entry.UploadCompletedRows = completedRows
            ResetUploadAttempt(ref entry)
            entry.LastTouch = TouchValue()
            if pendingRetire {
              entry.PendingRetire = false
              entry.State = VulkanImageResourceState.Retiring
            } else {
              entry.State = VulkanImageResourceState.Resident
            }
            entries[index] = entry
          }
          completedUploads++
        }
      index++
    }
    uploadRing.Collect(effectiveCompletedFence)
    var retired int32 = 0
    index = 0
    while index < entries.Length {
      let entry = entries[index]
      if entry.State == VulkanImageResourceState.Retiring && entry.RetireFence <= effectiveCompletedFence {
        let logicalIndex = LogicalIndexForPhysical(index, entry)
        DestroyImage(index, entry)
        CompleteLogicalRetirement(logicalIndex, entry)
        if let currentDiagnostics = diagnostics {
          currentDiagnostics.AddImageRetirement(1uL)
        }
        currentReferenceCounts[index] = 0
        entries[index] = VulkanImageResourceEntry{}
        liveCount--
        residentBytes -= entry.Bytes
        retired++
      }
      index++
    }
    return completedUploads + retired
  }

  private func PublishCompletedImage(
    index int32,
    entry VulkanImageResourceEntry) VulkanImageResourceEntry{
      let logicalIndex = LogicalIndexForPhysical(index, entry)
      EnsureLogicalPublication(entry.Bytes)
      let nearestDescriptor = BindDescriptorSet(index, entry.Id, entry.SamplerId,
        entry.ImageView, VulkanImageSamplerMode.Nearest)
      let linearDescriptor = BindDescriptorSet(index, entry.Id, entry.SamplerId,
        entry.ImageView, VulkanImageSamplerMode.Linear)
      PublishLogical(logicalIndex)
      var updated = entry
      updated.NearestDescriptor = nearestDescriptor
      updated.LinearDescriptor = linearDescriptor
      updated.GpuPublished = true
      updated.UploadedVersion = entry.Id.Version
      updated.State = VulkanImageResourceState.Resident
      return updated
    }

  internal func CopyLogicalResources(destination []VulkanLogicalResource) int32 {
    EnsureOpen()
    if destination.Length < logicalStats.LogicalCount {
      throw ArgumentException("Logical resource destination is too small", "destination")
    }
    var output int32 = 0
    for index in 0 ... logicalRecords.Length {
      let logical = logicalRecords[index]
      if logical.Id.IsValid
        && (logical.PhysicalSlot < 0 || !entries[logical.PhysicalSlot].GpuPublished) {
          destination[output] = VulkanLogicalResource{
            Id: logical.Id,
            Source: VulkanResourceSource{
              ProviderId: logical.ProviderId,
              SourceId: logical.SourceId,
              Version: logical.Id.Version,
              Bytes: logical.Bytes,
            },
            Bytes: logical.Bytes,
            Cacheable: logical.Cacheable,
          }
          output++
        }
    }
    return output
  }

  internal func EvictLeastRecentlyUsed() bool {
    EnsureOpen()
    var candidate int32 = -1
    var candidateTouch uint64 = uint64.MaxValue
    var index int32 = 0
    while index < entries.Length {
      let entry = entries[index]
      if entry.State == VulkanImageResourceState.Resident
        && entry.Cacheable
        && !entry.PendingRetire
        && entry.RecordingUseCount == 0
        && currentReferenceCounts[index] == 0
        && entry.LastUseFence <= highestCompletedFence
        && entry.LastTouch < candidateTouch{
          candidate = index
          candidateTouch = entry.LastTouch
        }
      index++
    }
    if candidate < 0 {
      return false
    }
    let id = entries[candidate].Id
    if !Retire(id, generation, highestCompletedFence) {
      return false
    }
    Collect(highestCompletedFence)
    if let currentDiagnostics = diagnostics {
      currentDiagnostics.AddImageEviction(1uL)
    }
    return true
  }

  internal func AddCurrentReference(id ResourceId, expectedGeneration uint64) bool {
    if disposed || expectedGeneration == 0uL || expectedGeneration != generation
      || !id.IsValid || id.Kind != SceneResourceKind.Image{
        return false
      }
    let index = FindExactIndex(id)
    if index < 0 {
      return false
    }
    if currentReferenceCounts[index] == Int32.MaxValue {
      throw InvalidOperationException("Vulkan image current reference capacity reached")
    }
    currentReferenceCounts[index]++
    return true
  }

  internal func ReleaseCurrentReference(id ResourceId, expectedGeneration uint64) bool {
    if disposed || expectedGeneration == 0uL || expectedGeneration != generation
      || !id.IsValid || id.Kind != SceneResourceKind.Image{
        return false
      }
    let index = FindExactIndex(id)
    if index < 0 || currentReferenceCounts[index] == 0 {
      return false
    }
    currentReferenceCounts[index]--
    let retire = currentReferenceCounts[index] == 0
      && entries[index].PendingRetire && entries[index].RecordingUseCount == 0
    if retire {
      var entry = entries[index]
      entry.PendingRetire = false
      entries[index] = entry
      if !Retire(id, generation, highestCompletedFence) {
        throw InvalidOperationException("Vulkan image retirement failed")
      }
    }
    return true
  }

  internal func PriorRenderableSourceVersion(source VulkanResourceSource,
    samplerId ResourceId, samplerMode VulkanImageSamplerMode) VulkanImageResourceLookup{
      var candidate int32 = -1
      var candidateVersion uint64
      var index int32 = 0
      while index < entries.Length {
        let entry = entries[index]
        if entry.State == VulkanImageResourceState.Resident
          && entry.GpuPublished && !entry.PendingRetire
          && entry.ProviderId == source.ProviderId
          && entry.SourceId == source.SourceId
          && entry.Id.Version < source.Version
          && entry.Id.Version > candidateVersion{
            candidate = index
            candidateVersion = entry.Id.Version
          }
        index++
      }
      if candidate < 0 {
        return VulkanImageResourceLookup{ Found: false }
      }
      return Lookup(candidate, samplerId, samplerMode)
    }

  internal func Lookup(id ResourceId, expectedGeneration uint64) VulkanImageResourceLookup {
    if disposed || !id.IsValid || id.Kind != SceneResourceKind.Image
      || expectedGeneration == 0uL || expectedGeneration != generation{
        return VulkanImageResourceLookup{ Found: false }
      }
    let index = FindExactIndex(id)
    if index < 0 {
      return VulkanImageResourceLookup{ Found: false }
    }
    let entry = entries[index]
    return Lookup(index, entry.SamplerId, entry.SamplerMode)
  }

  internal func Lookup(
    id ResourceId,
    samplerId ResourceId,
    samplerMode VulkanImageSamplerMode,
    expectedGeneration uint64) VulkanImageResourceLookup{
      if disposed || !id.IsValid || id.Kind != SceneResourceKind.Image
        || !samplerId.IsValid || samplerId.Kind != SceneResourceKind.Sampler
        || expectedGeneration == 0uL || expectedGeneration != generation{
          return VulkanImageResourceLookup{ Found: false }
        }
      let index = FindExactIndex(id)
      if index < 0 {
        return VulkanImageResourceLookup{ Found: false }
      }
      return Lookup(index, samplerId, samplerMode)
    }

  internal func BindDescriptor(
    commandBuffer VkCommandBuffer,
    pipelineLayout VkPipelineLayout,
    id ResourceId,
    expectedGeneration uint64) {
      EnsureOpen()
      ValidateGeneration(expectedGeneration)
      let index = FindExactIndex(id)
      if index < 0 {
        throw InvalidOperationException("Vulkan image is not registered")
      }
      let entry = entries[index]
      BindDescriptor(commandBuffer, pipelineLayout, id, entry.SamplerId, entry.SamplerMode,
        expectedGeneration)
    }

  internal func BindDescriptor(
    commandBuffer VkCommandBuffer,
    pipelineLayout VkPipelineLayout,
    id ResourceId,
    samplerId ResourceId,
    samplerMode VulkanImageSamplerMode,
    expectedGeneration uint64) {
      EnsureOpen()
      ValidateGeneration(expectedGeneration)
      ValidateSamplerId(samplerId)
      let index = FindExactIndex(id)
      if index < 0 {
        throw InvalidOperationException("Vulkan image is not registered")
      }
      let lookup = Lookup(index, samplerId, samplerMode)
      if !lookup.Renderable {
        throw InvalidOperationException("Vulkan image upload is not complete")
      }
      if lookup.DescriptorSet == 0uL {
        throw InvalidOperationException("Vulkan image descriptor is stale")
      }
      var descriptorSet = lookup.DescriptorSet
      let bindDescriptorSets = dispatch.vkCmdBindDescriptorSets
      bindDescriptorSets(commandBuffer, VkConstants.VK_PIPELINE_BIND_POINT_GRAPHICS,
        pipelineLayout, 0u, 1u, &descriptorSet, 0u, nil)
    }

  public func Dispose() {
    if disposed {
      return
    }
    Collect(highestCompletedFence)
    if highestCompletedFence < generationLastUseFence {
      throw InvalidOperationException("Vulkan image resources still have in-flight work")
    }
    var index int32 = 0
    while index < entries.Length {
      let entry = entries[index]
      if entry.State == VulkanImageResourceState.UploadPending
        || entry.State == VulkanImageResourceState.Retiring
        || entry.RecordingUseCount != 0
        || entry.PendingRetire
        || entry.LastUseFence > highestCompletedFence
        || entry.RetireFence > highestCompletedFence
        || (entry.UploadSubmitted && entry.UploadFence > highestCompletedFence) {
          throw InvalidOperationException("Vulkan image resources still have in-flight work")
        }
      index++
    }
    disposed = true
    DestroyGpuResources()
    DestroyStagingBuffer()
    uploadRing.Dispose()
    ClearLogicalResources()
    ClearCurrentReferences()
    index = 0
    while index < entries.Length {
      entries[index] = VulkanImageResourceEntry{}
      index++
    }
    liveCount = 0
    residentBytes = 0uL
    ClearDiagnosticImageState()
  }

  private func ClearCurrentReferences() {
    var index int32 = 0
    while index < currentReferenceCounts.Length {
      currentReferenceCounts[index] = 0
      index++
    }
  }

  deinit{
    Dispose()
  }

}
