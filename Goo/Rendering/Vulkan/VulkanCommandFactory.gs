package Goo

import System

internal data struct VulkanCommandAllocation(
  Pool VkCommandPool,
  BufferCount int32) { }

internal unsafe class VulkanCommandFactory {
  shared {
    internal func CreatePoolAndAllocate(
      device VkDevice,
      dispatch VkDeviceDispatch,
      objectAccounting VulkanObjectAccounting?,
      queueFamilyIndex uint32,
      flags VkCommandPoolCreateFlags,
      level VkCommandBufferLevel,
      commandBufferCount uint32,
      commandBuffers * VkCommandBuffer) VulkanCommandAllocation{
        if commandBuffers == nil {
          throw ArgumentNullException("commandBuffers")
        }
        if commandBufferCount == 0u || commandBufferCount > uint32(Int32.MaxValue) {
          throw ArgumentOutOfRangeException("commandBufferCount")
        }

        let count = int32(commandBufferCount)
        var index int32 = 0
        while index < count {
          commandBuffers[index] = VkCommandBuffer.Null
          index++
        }

        var pool VkCommandPool = VkCommandPool.Null
        var poolAccounted bool = false
        var buffersAccounted int32 = 0
        var poolInfo = VkCommandPoolCreateInfo{
          sType: VkConstants.VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO,
          pNext: nil,
          flags: flags,
          queueFamilyIndex: queueFamilyIndex,
        }
        try {
          let createPool = dispatch.vkCreateCommandPool
          let poolResult = createPool(device, &poolInfo, nil, &pool)
          if poolResult != VkConstants.VK_SUCCESS || pool == VkCommandPool.Null {
            throw InvalidOperationException(
              "vkCreateCommandPool failed: " + poolResult.ToString())
          }
          if let accounting = objectAccounting {
            accounting.Allocate()
            poolAccounted = true
          }

          var allocateInfo = VkCommandBufferAllocateInfo{
            sType: VkConstants.VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO,
            pNext: nil,
            commandPool: pool,
            level: level,
            commandBufferCount: commandBufferCount,
          }
          let allocateCommandBuffers = dispatch.vkAllocateCommandBuffers
          let allocateResult = allocateCommandBuffers(
            device,
            &allocateInfo,
            commandBuffers)
          if allocateResult != VkConstants.VK_SUCCESS {
            throw InvalidOperationException(
              "vkAllocateCommandBuffers failed: " + allocateResult.ToString())
          }

          index = 0
          while index < count {
            if commandBuffers[index] == VkCommandBuffer.Null {
              throw InvalidOperationException("vkAllocateCommandBuffers returned a null buffer")
            }
            if let accounting = objectAccounting {
              accounting.Allocate()
              buffersAccounted++
            }
            index++
          }
          return VulkanCommandAllocation(pool, count)
        } catch (error Exception) {
          if pool != VkCommandPool.Null {
            let destroyPool = dispatch.vkDestroyCommandPool
            try { destroyPool(device, pool, nil) } catch (cleanup Exception) { }
          }
          if let accounting = objectAccounting {
            while buffersAccounted > 0 {
              try { accounting.Release() } catch (cleanup Exception) { }
              buffersAccounted--
            }
          }
          if poolAccounted {
            if let accounting = objectAccounting {
              try { accounting.Release() } catch (cleanup Exception) { }
            }
          }
          index = 0
          while index < count {
            commandBuffers[index] = VkCommandBuffer.Null
            index++
          }
          rethrow
        }
      }
  }
}
