package Goo

import System

internal data struct VulkanDescriptorAllocation(
  Pool VkDescriptorPool,
  SetCount uint32) { }

internal unsafe class VulkanDescriptorFactory {
  shared {
    internal func CreateSingleBindingLayout(
      device VkDevice,
      dispatch VkDeviceDispatch,
      objectAccounting VulkanObjectAccounting?,
      descriptorType VkDescriptorType,
      stageFlags VkShaderStageFlags) VkDescriptorSetLayout{
        var binding = VkDescriptorSetLayoutBinding{
          binding: 0u,
          descriptorType: descriptorType,
          descriptorCount: 1u,
          stageFlags: stageFlags,
          pImmutableSamplers: nil,
        }
        return CreateLayout(device, dispatch, objectAccounting, &binding, 1u)
      }

    internal func CreateLayout(
      device VkDevice,
      dispatch VkDeviceDispatch,
      objectAccounting VulkanObjectAccounting?,
      bindings * VkDescriptorSetLayoutBinding,
      bindingCount uint32) VkDescriptorSetLayout{
        if bindings == nil {
          throw ArgumentNullException("bindings")
        }
        if bindingCount == 0u {
          throw ArgumentOutOfRangeException("bindingCount")
        }

        var layout VkDescriptorSetLayout = 0uL
        var accounted bool = false
        var info = VkDescriptorSetLayoutCreateInfo{
          sType: VkConstants.VK_STRUCTURE_TYPE_DESCRIPTOR_SET_LAYOUT_CREATE_INFO,
          pNext: nil,
          flags: 0u,
          bindingCount: bindingCount,
          pBindings: bindings,
        }
        try {
          let createLayout = dispatch.vkCreateDescriptorSetLayout
          let result = createLayout(device, &info, nil, &layout)
          if result != VkConstants.VK_SUCCESS || layout == 0uL {
            throw InvalidOperationException(
              "vkCreateDescriptorSetLayout failed: " + result.ToString())
          }
          if let accounting = objectAccounting {
            accounting.Allocate()
            accounted = true
          }
          return layout
        } catch (error Exception) {
          if layout != 0uL {
            let destroyLayout = dispatch.vkDestroyDescriptorSetLayout
            try { destroyLayout(device, layout, nil) } catch (cleanup Exception) { }
          }
          if accounted {
            if let accounting = objectAccounting {
              try { accounting.Release() } catch (cleanup Exception) { }
            }
          }
          rethrow
        }
      }

    internal func CreatePoolAndAllocate(
      device VkDevice,
      dispatch VkDeviceDispatch,
      objectAccounting VulkanObjectAccounting?,
      poolSizes * VkDescriptorPoolSize,
      poolSizeCount uint32,
      setLayouts * VkDescriptorSetLayout,
      descriptorSetCount uint32,
      descriptorSets * VkDescriptorSet) VulkanDescriptorAllocation{
        if poolSizes == nil {
          throw ArgumentNullException("poolSizes")
        }
        if poolSizeCount == 0u {
          throw ArgumentOutOfRangeException("poolSizeCount")
        }
        if setLayouts == nil {
          throw ArgumentNullException("setLayouts")
        }
        if descriptorSets == nil {
          throw ArgumentNullException("descriptorSets")
        }
        if descriptorSetCount == 0u || descriptorSetCount > uint32(Int32.MaxValue) {
          throw ArgumentOutOfRangeException("descriptorSetCount")
        }

        var pool VkDescriptorPool = 0uL
        var poolAccounted bool = false
        var setsAccounted int32 = 0
        var poolInfo = VkDescriptorPoolCreateInfo{
          sType: VkConstants.VK_STRUCTURE_TYPE_DESCRIPTOR_POOL_CREATE_INFO,
          pNext: nil,
          flags: 0u,
          maxSets: descriptorSetCount,
          poolSizeCount: poolSizeCount,
          pPoolSizes: poolSizes,
        }
        try {
          let createPool = dispatch.vkCreateDescriptorPool
          let poolResult = createPool(device, &poolInfo, nil, &pool)
          if poolResult != VkConstants.VK_SUCCESS || pool == 0uL {
            throw InvalidOperationException(
              "vkCreateDescriptorPool failed: " + poolResult.ToString())
          }
          if let accounting = objectAccounting {
            accounting.Allocate()
            poolAccounted = true
          }

          var allocateInfo = VkDescriptorSetAllocateInfo{
            sType: VkConstants.VK_STRUCTURE_TYPE_DESCRIPTOR_SET_ALLOCATE_INFO,
            pNext: nil,
            descriptorPool: pool,
            descriptorSetCount: descriptorSetCount,
            pSetLayouts: setLayouts,
          }
          let allocateSets = dispatch.vkAllocateDescriptorSets
          let allocationResult = allocateSets(device, &allocateInfo, descriptorSets)
          if allocationResult != VkConstants.VK_SUCCESS {
            throw InvalidOperationException(
              "vkAllocateDescriptorSets failed: " + allocationResult.ToString())
          }
          if let accounting = objectAccounting {
            while setsAccounted < int32(descriptorSetCount) {
              accounting.Allocate()
              setsAccounted++
            }
          }
          return VulkanDescriptorAllocation(pool, descriptorSetCount)
        } catch (error Exception) {
          if pool != 0uL {
            let destroyPool = dispatch.vkDestroyDescriptorPool
            try { destroyPool(device, pool, nil) } catch (cleanup Exception) { }
          }
          if poolAccounted {
            if let accounting = objectAccounting {
              try { accounting.Release() } catch (cleanup Exception) { }
            }
          }
          if let accounting = objectAccounting {
            while setsAccounted > 0 {
              try { accounting.Release() } catch (cleanup Exception) { }
              setsAccounted--
            }
          }
          var index int32 = 0
          while index < int32(descriptorSetCount) {
            descriptorSets[index] = 0uL
            index++
          }
          rethrow
        }
      }

    internal func WriteStorageBuffer(
      device VkDevice,
      dispatch VkDeviceDispatch,
      descriptorSet VkDescriptorSet,
      binding uint32,
      buffer VkBuffer,
      offset VkDeviceSize,
      byteRange VkDeviceSize) {
        var bufferInfo = VkDescriptorBufferInfo{
          buffer: buffer,
          offset: offset,
          _range: byteRange,
        }
        var write = VkWriteDescriptorSet{
          sType: VkConstants.VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET,
          dstSet: descriptorSet,
          dstBinding: binding,
          descriptorCount: 1u,
          descriptorType: VkConstants.VK_DESCRIPTOR_TYPE_STORAGE_BUFFER,
          pBufferInfo: &bufferInfo,
        }
        let update = dispatch.vkUpdateDescriptorSets
        update(device, 1u, &write, 0u, nil)
      }

    internal func WriteCombinedImageSampler(
      device VkDevice,
      dispatch VkDeviceDispatch,
      descriptorSet VkDescriptorSet,
      binding uint32,
      sampler VkSampler,
      imageView VkImageView,
      imageLayout VkImageLayout) {
        var imageInfo = VkDescriptorImageInfo{
          sampler: sampler,
          imageView: imageView,
          imageLayout: imageLayout,
        }
        var write = VkWriteDescriptorSet{
          sType: VkConstants.VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET,
          dstSet: descriptorSet,
          dstBinding: binding,
          descriptorCount: 1u,
          descriptorType: VkConstants.VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER,
          pImageInfo: &imageInfo,
        }
        let update = dispatch.vkUpdateDescriptorSets
        update(device, 1u, &write, 0u, nil)
      }

    internal func WriteUniformTexelBuffer(
      device VkDevice,
      dispatch VkDeviceDispatch,
      descriptorSet VkDescriptorSet,
      binding uint32,
      bufferView VkBufferView) {
        var currentBufferView = bufferView
        var write = VkWriteDescriptorSet{
          sType: VkConstants.VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET,
          dstSet: descriptorSet,
          dstBinding: binding,
          descriptorCount: 1u,
          descriptorType: VkConstants.VK_DESCRIPTOR_TYPE_UNIFORM_TEXEL_BUFFER,
          pTexelBufferView: &currentBufferView,
        }
        let update = dispatch.vkUpdateDescriptorSets
        update(device, 1u, &write, 0u, nil)
      }
  }
}
