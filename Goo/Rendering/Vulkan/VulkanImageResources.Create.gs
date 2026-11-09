package Goo

import System

internal unsafe partial class VulkanImageResources : IDisposable {
  private func CreateGeneration() {
    descriptorSetLayout = VulkanDescriptorFactory.CreateSingleBindingLayout(
      device,
      dispatch,
      objectAccounting,
      VkConstants.VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER,
      uint32(VkConstants.VK_SHADER_STAGE_FRAGMENT_BIT))
    try {
      CreateDescriptorBlock(capacity, 0)
    } catch (error Exception) {
      DestroyGeneration()
      throw error
    }
    nearestSampler = CreateSampler(VkConstants.VK_FILTER_NEAREST)
    linearSampler = CreateSampler(VkConstants.VK_FILTER_LINEAR)
  }

  private func CreateDescriptorBlock(imageCount int32, imageOffset int32) {
    if imageCount <= 0 || imageOffset < 0
      || imageOffset > capacity - imageCount{
        throw ArgumentOutOfRangeException("imageCount")
      }
    let setCount = imageCount * 2
    let setOffset = imageOffset * 2
    var poolSize = VkDescriptorPoolSize{}
    poolSize._type = VkConstants.VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER
    poolSize.descriptorCount = uint32(setCount)
    let layouts = [setCount]VkDescriptorSetLayout
    let createdSets = [setCount]VkDescriptorSet
    var descriptorIndex int32 = 0
    while descriptorIndex < setCount {
      layouts[descriptorIndex] = descriptorSetLayout
      descriptorIndex++
    }
    var creation VulkanDescriptorAllocation
    fixed layoutPointer * VkDescriptorSetLayout = layouts {
      fixed setPointer * VkDescriptorSet = createdSets {
        creation = VulkanDescriptorFactory.CreatePoolAndAllocate(
          device,
          dispatch,
          objectAccounting,
          &poolSize,
          1u,
          layoutPointer,
          uint32(setCount),
          setPointer)
      }
    }
    descriptorPools.Add(creation.Pool)
    trackedDescriptorPoolCount++
    Array.Copy(createdSets, 0, descriptorSets, setOffset, setCount)
    if objectAccounting != nil {
      trackedDescriptorSetCount += int32(creation.SetCount)
    }
  }

  private func CreateSampler(filter VkFilter) VkSampler {
    var samplerInfo = VkSamplerCreateInfo{}
    samplerInfo.sType = VkConstants.VK_STRUCTURE_TYPE_SAMPLER_CREATE_INFO
    samplerInfo.magFilter = filter
    samplerInfo.minFilter = filter
    samplerInfo.mipmapMode = if filter == VkConstants.VK_FILTER_LINEAR {
      VkConstants.VK_SAMPLER_MIPMAP_MODE_LINEAR
    } else {
      VkConstants.VK_SAMPLER_MIPMAP_MODE_NEAREST
    }
    samplerInfo.addressModeU = VkConstants.VK_SAMPLER_ADDRESS_MODE_CLAMP_TO_EDGE
    samplerInfo.addressModeV = VkConstants.VK_SAMPLER_ADDRESS_MODE_CLAMP_TO_EDGE
    samplerInfo.addressModeW = VkConstants.VK_SAMPLER_ADDRESS_MODE_CLAMP_TO_EDGE
    samplerInfo.maxLod = if filter == VkConstants.VK_FILTER_LINEAR { VkConstants.VK_LOD_CLAMP_NONE } else { 0.0F }
    samplerInfo.borderColor = VkConstants.VK_BORDER_COLOR_FLOAT_TRANSPARENT_BLACK
    let createSampler = dispatch.vkCreateSampler
    var sampler VkSampler = 0uL
    if createSampler(device, &samplerInfo, nil, &sampler) != VkConstants.VK_SUCCESS || sampler == 0uL {
      throw InvalidOperationException("vkCreateSampler failed")
    }
    try {
      if let accounting = objectAccounting {
        accounting.Allocate()
      }
    } catch (error Exception) {
      let destroySampler = dispatch.vkDestroySampler
      destroySampler(device, sampler, nil)
      throw error
    }
    return sampler
  }

  private func EnsureStagingBuffer(requiredBytes VkDeviceSize) {
    let demand = if requiredBytes < stagingMaximumByteCapacity {
      requiredBytes
    } else {
      stagingMaximumByteCapacity
    }
    if stagingBuffer != 0uL && stagingAllocation != nil
      && stagingByteCapacity >= demand{
        return
      }
    lock (stagingGate) {
      if stagingBuffer != 0uL && stagingAllocation != nil
        && stagingByteCapacity >= demand{
          return
        }
      if (stagingBuffer != 0uL) != (stagingAllocation != nil) {
        throw InvalidOperationException("Vulkan image staging state is incomplete")
      }
      if uploadRing.Stats.ActiveRanges == 0 && stagingByteCapacity < demand {
        var grown = stagingByteCapacity
        while grown < demand {
          if grown > stagingMaximumByteCapacity / 2uL {
            grown = stagingMaximumByteCapacity
          } else {
            grown = grown * 2uL
          }
        }
        GrowStagingBuffer(grown)
      } else if stagingBuffer == 0uL {
        try {
          CreateStagingBuffer(stagingByteCapacity)
        } catch (error Exception) {
          DestroyStagingBuffer()
          throw error
        }
      }
    }
  }

  private func CreateStagingBuffer(byteCapacity VkDeviceSize) {
    let creation = VulkanBufferFactory.CreateMapped(
      device,
      dispatch,
      allocator,
      objectAccounting,
      byteCapacity,
      uint32(VkConstants.VK_BUFFER_USAGE_TRANSFER_SRC_BIT),
      VulkanMemoryPolicy.HostVisibleCoherentCached)
    stagingBuffer = creation.Buffer
    stagingAllocation = creation.Allocation
  }

  private func GrowStagingBuffer(byteCapacity VkDeviceSize) {
    let creation = VulkanBufferFactory.CreateMapped(
      device,
      dispatch,
      allocator,
      objectAccounting,
      byteCapacity,
      uint32(VkConstants.VK_BUFFER_USAGE_TRANSFER_SRC_BIT),
      VulkanMemoryPolicy.HostVisibleCoherentCached)
    try {
      uploadRing.GrowCapacity(byteCapacity)
    } catch (error Exception) {
      ReleaseStagingBuffer(creation.Buffer, creation.Allocation)
      throw error
    }
    let staleBuffer = stagingBuffer
    let staleAllocation = stagingAllocation
    stagingBuffer = creation.Buffer
    stagingAllocation = creation.Allocation
    stagingByteCapacity = byteCapacity
    if let allocation = staleAllocation {
      ReleaseStagingBuffer(staleBuffer, allocation)
    }
  }

  private func CreateImage(
    index int32,
    id ResourceId,
    width uint32,
    height uint32,
    bytes VkDeviceSize,
    source VulkanResourceSource,
    cacheable bool,
    samplerId ResourceId,
    samplerMode VulkanImageSamplerMode,
    mipLevels uint32) {
      EnsureDescriptorSlots(index)
      let logicalIndex = PrepareLogicalRegistration(id, source)
      let creation = VulkanImageFactory.Create2D(
        device,
        dispatch,
        allocator,
        objectAccounting,
        VkExtent2D{ width: width, height: height },
        VkConstants.VK_FORMAT_R8G8B8A8_UNORM,
        uint32(VkConstants.VK_IMAGE_USAGE_TRANSFER_DST_BIT)
        | uint32(VkConstants.VK_IMAGE_USAGE_TRANSFER_SRC_BIT)
        | uint32(VkConstants.VK_IMAGE_USAGE_SAMPLED_BIT),
        uint32(VkConstants.VK_IMAGE_ASPECT_COLOR_BIT),
        VulkanMemoryPolicy.DeviceLocalRequired,
        VulkanMemoryOwnerKind.Image,
        mipLevels)
      allocator.Track(creation.Allocation, this, index)
      let entry = VulkanImageResourceEntry{
        Id: id,
        ProviderId: source.ProviderId,
        SourceId: source.SourceId,
        Width: width,
        Height: height,
        Bytes: bytes,
        ResidentBytes: ResidentImageBytes(width, height, mipLevels),
        MipLevels: mipLevels,
        SamplerId: samplerId,
        SamplerMode: samplerMode,
        Cacheable: cacheable,
        State: VulkanImageResourceState.Resident,
        Image: creation.Image,
        ImageView: creation.ImageView,
        Allocation: creation.Allocation,
        ImageLayout: VkConstants.VK_IMAGE_LAYOUT_UNDEFINED,
        LastTouch: TouchValue(),
      }
      CommitLogicalRegistration(logicalIndex, index, id, bytes, source, cacheable)
      entries[index] = entry
      if index >= entryLimit { entryLimit = index + 1 }
      liveCount++
      residentBytes += entry.ResidentBytes
    }

  private func DemoteChains(bytes VkDeviceSize) {
    refusedDemand += bytes
    var covered VkDeviceSize = 0uL
    for pending in 0 ... entryLimit {
      if entries[pending].DemotionTarget != 0 { covered += entries[pending].ResidentBytes - entries[pending].Bytes }
    }
    var index int32 = 0
    while covered < refusedDemand && index < entryLimit {
      let chain = entries[index]
      if chain.MipLevels > 1u && chain.DemotionTarget == 0 && chain.State == VulkanImageResourceState.Resident
        && chain.GpuPublished && !chain.PendingRetire && currentReferenceCounts[index] > 0 {
          if !DemoteChain(index) { return }
          covered += chain.ResidentBytes - chain.Bytes
        }
      index++
    }
  }

  private func DemoteChain(source int32) bool {
    let index = EnsureEmptyIndex()
    let chain = entries[source]
    try {
      let creation = VulkanImageFactory.Create2D(device, dispatch, allocator, objectAccounting,
        VkExtent2D{ width: chain.Width, height: chain.Height }, VkConstants.VK_FORMAT_R8G8B8A8_UNORM,
        uint32(VkConstants.VK_IMAGE_USAGE_TRANSFER_DST_BIT) | uint32(VkConstants.VK_IMAGE_USAGE_SAMPLED_BIT),
        uint32(VkConstants.VK_IMAGE_ASPECT_COLOR_BIT), VulkanMemoryPolicy.DeviceLocalRequired)
      allocator.Track(creation.Allocation, this, index)
      entries[index] = VulkanImageResourceEntry{
        Width: chain.Width, Height: chain.Height, Bytes: chain.Bytes, ResidentBytes: chain.Bytes, MipLevels: 1u,
        DemotionSource: source + 1, State: VulkanImageResourceState.Resident, Image: creation.Image,
        ImageView: creation.ImageView, Allocation: creation.Allocation, ImageLayout: VkConstants.VK_IMAGE_LAYOUT_UNDEFINED,
      }
    } catch (pressure VulkanMemoryPressureException) {
      return false
    }
    var target = entries[source]
    target.DemotionTarget = index + 1
    entries[source] = target
    if index >= entryLimit { entryLimit = index + 1 }
    liveCount++
    residentBytes += chain.Bytes
    demotionCount++
    return true
  }

  private func RecordDemotions(commandBuffer VkCommandBuffer) int32 {
    let pipelineBarrier = dispatch.vkCmdPipelineBarrier2
    let copyImage = dispatch.vkCmdCopyImage
    let baseLevel = VulkanTransitions.ColorSubresourceRange()
    var barriers int32 = 0
    for index in 0 ... entryLimit {
      var target = entries[index]
      if target.DemotionSource != 0 && target.State == VulkanImageResourceState.Resident && !target.UploadRecorded {
        let chain = entries[target.DemotionSource - 1]
        if chain.DemotionTarget == index + 1 && chain.State == VulkanImageResourceState.Resident && !chain.PendingRetire {
          ReserveRecording(chain.Id, generation)
          VulkanTransitions.RecordImage(commandBuffer, pipelineBarrier, chain.Image, baseLevel,
            VkConstants.VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL, VkConstants.VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL,
            VkConstants.VK_PIPELINE_STAGE_2_FRAGMENT_SHADER_BIT, VkConstants.VK_ACCESS_2_NONE,
            VkConstants.VK_PIPELINE_STAGE_2_ALL_TRANSFER_BIT, VkConstants.VK_ACCESS_2_TRANSFER_READ_BIT)
          VulkanTransitions.RecordImage(commandBuffer, pipelineBarrier, target.Image, baseLevel,
            VkConstants.VK_IMAGE_LAYOUT_UNDEFINED, VkConstants.VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL,
            VkConstants.VK_PIPELINE_STAGE_2_TOP_OF_PIPE_BIT, VkConstants.VK_ACCESS_2_NONE,
            VkConstants.VK_PIPELINE_STAGE_2_ALL_TRANSFER_BIT, VkConstants.VK_ACCESS_2_TRANSFER_WRITE_BIT)
          var region = VkImageCopy{}
          region.srcSubresource = VkImageSubresourceLayers{
            aspectMask: uint32(VkConstants.VK_IMAGE_ASPECT_COLOR_BIT), layerCount: 1u,
          }
          region.dstSubresource = region.srcSubresource
          region.extent = VkExtent3D{ width: target.Width, height: target.Height, depth: 1u }
          copyImage(commandBuffer, chain.Image, VkConstants.VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL,
            target.Image, VkConstants.VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, 1u, &region)
          VulkanTransitions.RecordImage(commandBuffer, pipelineBarrier, chain.Image, baseLevel,
            VkConstants.VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL, VkConstants.VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL,
            VkConstants.VK_PIPELINE_STAGE_2_ALL_TRANSFER_BIT, VkConstants.VK_ACCESS_2_NONE,
            VkConstants.VK_PIPELINE_STAGE_2_FRAGMENT_SHADER_BIT, VkConstants.VK_ACCESS_2_SHADER_SAMPLED_READ_BIT)
          VulkanTransitions.RecordImage(commandBuffer, pipelineBarrier, target.Image, baseLevel,
            VkConstants.VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, VkConstants.VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL,
            VkConstants.VK_PIPELINE_STAGE_2_ALL_TRANSFER_BIT, VkConstants.VK_ACCESS_2_TRANSFER_WRITE_BIT,
            VkConstants.VK_PIPELINE_STAGE_2_FRAGMENT_SHADER_BIT, VkConstants.VK_ACCESS_2_SHADER_SAMPLED_READ_BIT)
          barriers += 4
          target.UploadRecorded = true
          target.UploadCommandBuffer = commandBuffer
          entries[index] = target
        }
      }
    }
    return barriers
  }

  private func SubmitDemotions(commandBuffer VkCommandBuffer, fence uint64) {
    for index in 0 ... entryLimit {
      var target = entries[index]
      if target.DemotionSource != 0 && target.UploadRecorded && !target.UploadSubmitted
        && target.UploadCommandBuffer == commandBuffer {
          let chain = entries[target.DemotionSource - 1].Id
          if fence == 0uL {
            ReleaseRecording(chain, generation)
            target.UploadRecorded = false
          } else {
            MarkUsed(chain, generation, fence)
            target.UploadSubmitted = true
            target.UploadFence = fence
          }
          entries[index] = target
        }
    }
  }

  private func CompleteDemotions() {
    for index in 0 ... entryLimit {
      let target = entries[index]
      if target.DemotionSource != 0 && target.State == VulkanImageResourceState.Resident
        && (!target.UploadRecorded || target.UploadSubmitted) {
          let source = target.DemotionSource - 1
          var chain = entries[source]
          if chain.DemotionTarget != index + 1 || chain.State != VulkanImageResourceState.Resident || chain.PendingRetire {
            if chain.DemotionTarget == index + 1 {
              chain.DemotionTarget = 0
              entries[source] = chain
            }
            var orphan = target
            orphan.State = VulkanImageResourceState.Retiring
            orphan.RetireFence = target.UploadFence
            if let allocation = target.Allocation { allocator.Retire(allocation) }
            entries[index] = orphan
          } else if target.UploadSubmitted && target.UploadFence <= highestCompletedFence && chain.RecordingUseCount == 0 {
            let logicalIndex = LogicalIndexForPhysical(source, chain)
            var demoted = chain
            demoted.Image = target.Image
            demoted.ImageView = target.ImageView
            demoted.Allocation = target.Allocation
            demoted.MipLevels = 1u
            demoted.ResidentBytes = chain.Bytes
            demoted.DemotionTarget = 0
            demoted.NearestDescriptor = BindDescriptorSet(index, chain.Id, chain.SamplerId,
              target.ImageView, VulkanImageSamplerMode.Nearest)
            demoted.LinearDescriptor = BindDescriptorSet(index, chain.Id, chain.SamplerId,
              target.ImageView, VulkanImageSamplerMode.Linear)
            let retireFence = RetireFence(chain, highestCompletedFence)
            var retired = RetireDescriptors(chain, retireFence)
            retired.State = VulkanImageResourceState.Retiring
            retired.RetireFence = retireFence
            retired.Id = ResourceId{}
            entries[index] = demoted
            entries[source] = retired
            currentReferenceCounts[index] = currentReferenceCounts[source]
            currentReferenceCounts[source] = 0
            var logical = logicalRecords[logicalIndex]
            logical.PhysicalSlot = index
            logicalRecords[logicalIndex] = logical
          }
        }
    }
  }

  private func BindDescriptorSet(
    index int32,
    id ResourceId,
    samplerId ResourceId,
    view VkImageView,
    samplerMode VulkanImageSamplerMode) VulkanImageDescriptorBinding{
      let sampler = if samplerMode == VulkanImageSamplerMode.Nearest { nearestSampler } else { linearSampler }
      let slot = DescriptorSlot(index, samplerMode)
      if slot < 0 || slot >= descriptorCapacity || descriptorSets[slot] == 0uL {
        throw InvalidOperationException("Vulkan image descriptor capacity reached")
      }
      let existing = if samplerMode == VulkanImageSamplerMode.Nearest {
        entries[index].NearestDescriptor
      } else {
        entries[index].LinearDescriptor
      }
      if existing.State != VulkanImageDescriptorState.Empty {
        throw InvalidOperationException("Vulkan image descriptor is still in use")
      }
      let token = uint64(view)
      VulkanDescriptorFactory.WriteCombinedImageSampler(
        device,
        dispatch,
        descriptorSets[slot],
        0u,
        sampler,
        view,
        VkConstants.VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL)
      return VulkanImageDescriptorBinding{
        State: VulkanImageDescriptorState.Bound,
        ImageId: id,
        SamplerId: samplerId,
        SamplerMode: samplerMode,
        Generation: generation,
        Slot: slot,
        DescriptorToken: token,
        RetireFence: 0uL,
      }
    }

}
