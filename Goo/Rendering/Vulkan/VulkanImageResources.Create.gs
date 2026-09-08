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
    poolSizes[0] = VkDescriptorPoolSize{}
    poolSizes[0]._type = VkConstants.VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER
    poolSizes[0].descriptorCount = uint32(setCount)
    let layouts = [setCount]VkDescriptorSetLayout
    let createdSets = [setCount]VkDescriptorSet
    var descriptorIndex int32 = 0
    while descriptorIndex < setCount {
      layouts[descriptorIndex] = descriptorSetLayout
      descriptorIndex++
    }
    let creation = VulkanDescriptorFactory.CreatePoolAndAllocate(
      device,
      dispatch,
      objectAccounting,
      &poolSizes[0],
      1u,
      &layouts[0],
      uint32(setCount),
      &createdSets[0])
    descriptorPools.Add(creation.Pool)
    trackedDescriptorPoolCount++
    Array.Copy(createdSets, 0, descriptorSets, setOffset, setCount)
    Array.Copy(layouts, 0, descriptorLayouts, setOffset, setCount)
    if objectAccounting != nil {
      trackedDescriptorSetCount += int32(creation.SetCount)
    }
  }

  private func CreateSampler(filter VkFilter) VkSampler {
    var samplerInfo = VkSamplerCreateInfo{}
    samplerInfo.sType = VkConstants.VK_STRUCTURE_TYPE_SAMPLER_CREATE_INFO
    samplerInfo.magFilter = filter
    samplerInfo.minFilter = filter
    samplerInfo.mipmapMode = VkConstants.VK_SAMPLER_MIPMAP_MODE_NEAREST
    samplerInfo.addressModeU = VkConstants.VK_SAMPLER_ADDRESS_MODE_CLAMP_TO_EDGE
    samplerInfo.addressModeV = VkConstants.VK_SAMPLER_ADDRESS_MODE_CLAMP_TO_EDGE
    samplerInfo.addressModeW = VkConstants.VK_SAMPLER_ADDRESS_MODE_CLAMP_TO_EDGE
    samplerInfo.maxLod = 1.0F
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
    priorLogical VulkanLogicalResource?) {
      EnsureDescriptorSlots(index)
      let creation = VulkanImageFactory.Create2D(
        device,
        dispatch,
        allocator,
        objectAccounting,
        VkExtent2D{ width: width, height: height },
        VkConstants.VK_FORMAT_R8G8B8A8_SRGB,
        uint32(VkConstants.VK_IMAGE_USAGE_TRANSFER_DST_BIT)
        | uint32(VkConstants.VK_IMAGE_USAGE_SAMPLED_BIT),
        uint32(VkConstants.VK_IMAGE_ASPECT_COLOR_BIT),
        VulkanMemoryPolicy.DeviceLocalRequired)
      let image = creation.Image
      let view = creation.ImageView
      let allocation = creation.Allocation
      var registration VulkanResourceRegistration{}
      try {
        EnsureRegistryPublication(bytes)
        registration = registry.Register(id, bytes, source, cacheable)
        entries[index] = VulkanImageResourceEntry{
          Id: id,
          ProviderId: source.ProviderId,
          SourceId: source.SourceId,
          Width: width,
          Height: height,
          Bytes: bytes,
          SamplerId: samplerId,
          SamplerMode: samplerMode,
          Cacheable: cacheable,
          State: VulkanImageResourceState.Resident,
          GpuPublished: false,
          Image: image,
          ImageView: view,
          Allocation: allocation,
          NearestDescriptor: VulkanImageDescriptorBinding{},
          LinearDescriptor: VulkanImageDescriptorBinding{},
          ImageLayout: VkConstants.VK_IMAGE_LAYOUT_UNDEFINED,
          UploadedVersion: 0uL,
          Upload: VulkanUploadReservation{},
          UploadRecorded: false,
          UploadSubmitted: false,
          UploadCommandBuffer: 0uL,
          UploadFence: 0uL,
          PendingRetire: false,
          DropLogicalOnRetire: false,
          RecordingUseCount: 0,
          LastUseFence: 0uL,
          RetireFence: 0uL,
          LastTouch: TouchValue(),
        }
        liveCount++
        residentBytes += bytes
      } catch (error Exception) {
        var rollbackSucceeded = true
        if registration.Accepted {
          rollbackSucceeded = RollbackRegistration(id, registration, priorLogical)
        }
        if view != 0uL {
          let destroyView = dispatch.vkDestroyImageView
          destroyView(device, view, nil)
          if let accounting = objectAccounting {
            accounting.Release()
          }
        }
        let destroyImage = dispatch.vkDestroyImage
        destroyImage(device, image, nil)
        if let accounting = objectAccounting {
          accounting.Release()
        }
        allocator.Release(allocation)
        if !rollbackSucceeded {
          throw InvalidOperationException("Vulkan image registry rollback failed")
        }
        throw error
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
