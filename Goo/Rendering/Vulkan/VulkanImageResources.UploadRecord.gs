package Goo

import System

internal unsafe partial class VulkanImageResources : IDisposable {
  private func RecordUpload(commandBuffer VkCommandBuffer,
    entry VulkanImageResourceEntry) int32{
      if entry.UploadRowCount == 0u
        || entry.UploadRowOffset >= entry.Height
        || entry.UploadRowCount > entry.Height - entry.UploadRowOffset{
          throw InvalidOperationException("Vulkan image upload row range is invalid")
        }
      let subresourceRange = VulkanTransitions.ColorSubresourceRange()
      let pipelineBarrier = dispatch.vkCmdPipelineBarrier2
      var barrierCount int32 = 0
      if entry.ImageLayout != VkConstants.VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL {
        var srcStageMask VkPipelineStageFlags2
        var srcAccessMask VkAccessFlags2
        if entry.ImageLayout == VkConstants.VK_IMAGE_LAYOUT_UNDEFINED {
          srcStageMask = VkConstants.VK_PIPELINE_STAGE_2_TOP_OF_PIPE_BIT
          srcAccessMask = VkConstants.VK_ACCESS_2_NONE
        } else if entry.ImageLayout == VkConstants.VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL {
          srcStageMask = VkConstants.VK_PIPELINE_STAGE_2_FRAGMENT_SHADER_BIT
          srcAccessMask = VkConstants.VK_ACCESS_2_SHADER_SAMPLED_READ_BIT
        } else {
          throw InvalidOperationException("Vulkan image has an unsupported layout")
        }
        VulkanTransitions.RecordImage(
          commandBuffer,
          pipelineBarrier,
          entry.Image,
          subresourceRange,
          entry.ImageLayout,
          VkConstants.VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL,
          srcStageMask,
          srcAccessMask,
          VkConstants.VK_PIPELINE_STAGE_2_COPY_BIT,
          VkConstants.VK_ACCESS_2_TRANSFER_WRITE_BIT)
        barrierCount++
      }

      var copy = VkBufferImageCopy{}
      copy.bufferOffset = entry.Upload.Offset
      copy.bufferRowLength = 0u
      copy.bufferImageHeight = 0u
      copy.imageSubresource = VkImageSubresourceLayers{}
      copy.imageSubresource.aspectMask = uint32(VkConstants.VK_IMAGE_ASPECT_COLOR_BIT)
      copy.imageSubresource.layerCount = 1u
      copy.imageOffset = VkOffset3D{}
      copy.imageOffset.y = int32(entry.UploadRowOffset)
      copy.imageExtent = VkExtent3D{}
      copy.imageExtent.width = entry.Width
      copy.imageExtent.height = entry.UploadRowCount
      copy.imageExtent.depth = 1u
      let copyBufferToImage = dispatch.vkCmdCopyBufferToImage
      copyBufferToImage(commandBuffer, stagingBuffer, entry.Image,
        VkConstants.VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, 1u, &copy)

      if entry.UploadRowOffset + entry.UploadRowCount == entry.Height {
        VulkanTransitions.RecordImage(
          commandBuffer,
          pipelineBarrier,
          entry.Image,
          subresourceRange,
          VkConstants.VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL,
          VkConstants.VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL,
          VkConstants.VK_PIPELINE_STAGE_2_COPY_BIT,
          VkConstants.VK_ACCESS_2_TRANSFER_WRITE_BIT,
          VkConstants.VK_PIPELINE_STAGE_2_FRAGMENT_SHADER_BIT,
          VkConstants.VK_ACCESS_2_SHADER_SAMPLED_READ_BIT)
        barrierCount++
      }
      return barrierCount
    }

  private func Lookup(
    index int32,
    samplerId ResourceId,
    samplerMode VulkanImageSamplerMode) VulkanImageResourceLookup{
      var entry = entries[index]
      let descriptor = DescriptorFor(entry, samplerId, samplerMode)
      let descriptorSet = if descriptor.State == VulkanImageDescriptorState.Bound
        && descriptor.Slot >= 0 && descriptor.Slot < descriptorCapacity{
          descriptorSets[descriptor.Slot]
        } else { 0uL }
      let renderable = entry.GpuPublished
        && entry.State == VulkanImageResourceState.Resident
        && entry.Image != 0uL && entry.ImageView != 0uL
        && entry.UploadedVersion == entry.Id.Version && descriptorSet != 0uL
      entry.LastTouch = TouchValue()
      entries[index] = entry
      return VulkanImageResourceLookup{
        Found: entry.State != VulkanImageResourceState.Empty,
        Renderable: renderable,
        Id: entry.Id,
        Image: entry.Image,
        ImageView: entry.ImageView,
        DescriptorSet: descriptorSet,
        Width: entry.Width,
        Height: entry.Height,
        SamplerId: samplerId,
        SamplerMode: samplerMode,
        UploadedVersion: entry.UploadedVersion,
      }
    }

  private func DestroyImage(index int32, entry VulkanImageResourceEntry) {
    if entry.ImageView != 0uL {
      let destroyView = dispatch.vkDestroyImageView
      try { destroyView(device, entry.ImageView, nil) } catch (cleanup Exception) { }
      if let accounting = objectAccounting {
        try { accounting.Release() } catch (cleanup Exception) { }
      }
    }
    if entry.Image != 0uL {
      let destroyImage = dispatch.vkDestroyImage
      try { destroyImage(device, entry.Image, nil) } catch (cleanup Exception) { }
      if let accounting = objectAccounting {
        try { accounting.Release() } catch (cleanup Exception) { }
      }
    }
    if let allocation = entry.Allocation {
      try { allocator.Release(allocation) } catch (cleanup Exception) { }
    }
  }

  private func DestroyGpuResources() {
    var index int32 = 0
    while index < entries.Length {
      let entry = entries[index]
      if entry.State != VulkanImageResourceState.Empty
        || entry.ImageView != 0uL || entry.Image != 0uL || entry.Allocation != nil {
          DestroyImage(index, entry)
          entries[index] = VulkanImageResourceEntry{}
        }
      index++
    }
    liveCount = 0
    residentBytes = 0uL
    DestroyGeneration()
  }

  private func DestroyGeneration() {
    if nearestSampler != 0uL {
      let staleSampler = nearestSampler
      nearestSampler = 0uL
      let destroySampler = dispatch.vkDestroySampler
      try { destroySampler(device, staleSampler, nil) } catch (cleanup Exception) { }
      if let accounting = objectAccounting {
        try { accounting.Release() } catch (cleanup Exception) { }
      }
    }
    if linearSampler != 0uL {
      let staleSampler = linearSampler
      linearSampler = 0uL
      let destroySampler = dispatch.vkDestroySampler
      try { destroySampler(device, staleSampler, nil) } catch (cleanup Exception) { }
      if let accounting = objectAccounting {
        try { accounting.Release() } catch (cleanup Exception) { }
      }
    }
    if descriptorPools.Count > 0 {
      let destroyPool = dispatch.vkDestroyDescriptorPool
      for pool in descriptorPools {
        try { destroyPool(device, pool, nil) } catch (cleanup Exception) { }
      }
      descriptorPools.Clear()
      let staleSetCount = trackedDescriptorSetCount
      let stalePoolCount = trackedDescriptorPoolCount
      trackedDescriptorSetCount = 0
      trackedDescriptorPoolCount = 0
      if let accounting = objectAccounting {
        var descriptorIndex int32 = 0
        while descriptorIndex < staleSetCount {
          try { accounting.Release() } catch (cleanup Exception) { }
          descriptorIndex++
        }
        var poolIndex int32 = 0
        while poolIndex < stalePoolCount {
          try { accounting.Release() } catch (cleanup Exception) { }
          poolIndex++
        }
      }
    }
    if descriptorSetLayout != 0uL {
      let staleLayout = descriptorSetLayout
      descriptorSetLayout = 0uL
      let destroyLayout = dispatch.vkDestroyDescriptorSetLayout
      try { destroyLayout(device, staleLayout, nil) } catch (cleanup Exception) { }
      if let accounting = objectAccounting {
        try { accounting.Release() } catch (cleanup Exception) { }
      }
    }
    var index int32 = 0
    while index < descriptorSets.Length {
      descriptorSets[index] = 0uL
      index++
    }
  }

  private func DestroyStagingBuffer() {
    let staleBuffer = stagingBuffer
    let staleAllocation = stagingAllocation
    stagingBuffer = 0uL
    stagingAllocation = nil
    if let allocation = staleAllocation {
      ReleaseStagingBuffer(staleBuffer, allocation)
    }
  }

  private func ReleaseStagingBuffer(buffer VkBuffer, allocation VulkanMemoryAllocation) {
    if buffer != 0uL {
      let destroyBuffer = dispatch.vkDestroyBuffer
      try { destroyBuffer(device, buffer, nil) } catch (cleanup Exception) { }
      if let accounting = objectAccounting {
        try { accounting.Release() } catch (cleanup Exception) { }
      }
    }
    try { allocator.Release(allocation) } catch (cleanup Exception) { }
  }

  private func FindEmptyIndex() int32 {
    var index int32 = 0
    while index < entries.Length {
      if entries[index].State == VulkanImageResourceState.Empty {
        return index
      }
      index++
    }
    return -1
  }

  private func TryEnsureResidentCapacity(bytes VkDeviceSize) bool {
    if bytes > residentByteBudget {
      return false
    }
    while residentBytes > residentByteBudget - bytes {
      if !EvictLeastRecentlyUsed() {
        return false
      }
    }
    if FindEmptyIndex() < 0 {
      EnsureImageCapacity(entries.Length + 1)
    }
    return true
  }

  private func EnsureImageCapacity(required int32) {
    if required <= capacity {
      return
    }
    if required > MaxCapacity {
      throw InvalidOperationException("Vulkan image metadata hard limit exceeded")
    }
    var nextCapacity = capacity
    while nextCapacity < required {
      if nextCapacity > MaxCapacity / 2 {
        nextCapacity = MaxCapacity
      } else {
        nextCapacity = nextCapacity * 2
      }
    }
    let previousCapacity = capacity
    let previousDescriptorCapacity = descriptorCapacity
    let previousEntries = entries
    let previousReferences = currentReferenceCounts
    let previousDescriptorSets = descriptorSets
    capacity = nextCapacity
    descriptorCapacity = nextCapacity * 2
    entries = [nextCapacity]VulkanImageResourceEntry
    currentReferenceCounts = [nextCapacity]int32
    descriptorSets = [descriptorCapacity]VkDescriptorSet
    Array.Copy(previousEntries, entries, previousEntries.Length)
    Array.Copy(previousReferences, currentReferenceCounts, previousReferences.Length)
    Array.Copy(previousDescriptorSets, descriptorSets, previousDescriptorSets.Length)
    try {
      CreateDescriptorBlock(nextCapacity - previousCapacity, previousCapacity)
    } catch (error Exception) {
      capacity = previousCapacity
      descriptorCapacity = previousDescriptorCapacity
      entries = previousEntries
      currentReferenceCounts = previousReferences
      descriptorSets = previousDescriptorSets
      throw error
    }
  }

  private func EnsureLogicalPublication(bytes VkDeviceSize) {
    if bytes > residentByteBudget || logicalStats.ResidentBytes > residentByteBudget - bytes {
      throw InvalidOperationException("Vulkan image registry byte budget exceeded")
    }
  }

  private func EnsureExactMetadata(
    entry VulkanImageResourceEntry,
    id ResourceId,
    width uint32,
    height uint32,
    source VulkanResourceSource,
    cacheable bool,
    samplerId ResourceId,
    samplerMode VulkanImageSamplerMode) {
      if entry.Id.Version != id.Version
        || entry.Width != width
        || entry.Height != height
        || entry.Bytes != source.Bytes
        || !SameSource(entry.SamplerId, samplerId)
        || entry.Cacheable != cacheable
        || !SameSource(entry.Id, id)
        || !SameSource(entry, source) {
          throw InvalidOperationException("Vulkan image metadata changed for an unchanged version")
        }
    }

}
