package Goo

import System

internal data struct VulkanBufferCreation(
  Buffer VkBuffer,
  Allocation VulkanMemoryAllocation) { }

internal unsafe class VulkanBufferFactory {
  shared {
    internal func Create(
      device VkDevice,
      dispatch VkDeviceDispatch,
      allocator VulkanMemoryAllocator,
      objectAccounting VulkanObjectAccounting?,
      size VkDeviceSize,
      usage VkBufferUsageFlags,
      memoryPolicy VulkanMemoryPolicy,
      ownerKind VulkanMemoryOwnerKind = VulkanMemoryOwnerKind.Buffer) VulkanBufferCreation{

        if size == 0uL {
          throw ArgumentOutOfRangeException("size")
        }
        if usage == 0u {
          throw ArgumentOutOfRangeException("usage")
        }

        var buffer VkBuffer = 0uL
        var info = VkBufferCreateInfo{
          sType: VkConstants.VK_STRUCTURE_TYPE_BUFFER_CREATE_INFO,
          pNext: nil,
          flags: 0u,
          size: size,
          usage: usage,
          sharingMode: VkConstants.VK_SHARING_MODE_EXCLUSIVE,
          queueFamilyIndexCount: 0u,
          pQueueFamilyIndices: nil,
        }

        var allocation VulkanMemoryAllocation? = nil
        var objectAccounted bool = false
        try {
          let createBuffer = dispatch.vkCreateBuffer
          if createBuffer(device, &info, nil, &buffer) != VkConstants.VK_SUCCESS
            || buffer == 0uL {
              buffer = 0uL
              throw InvalidOperationException("vkCreateBuffer failed")
            }
          if let accounting = objectAccounting {
            accounting.Allocate()
            objectAccounted = true
          }
          let createdAllocation = allocator.AllocateBuffer(
            buffer,
            memoryPolicy)
          allocation = createdAllocation
          createdAllocation.ownerKind = if (usage & uint32(VkConstants.VK_BUFFER_USAGE_TRANSFER_SRC_BIT)) != 0u {
            VulkanMemoryOwnerKind.Staging
          } else { ownerKind }
          if let recorder = FrameRecorder.Current {
            allocator.ProfileAllocation(recorder, createdAllocation, FrameTraceKind.ResourceLifecycle,
              VulkanDiagnosticEventIds.ResourceCreate, payloadBytes: size)
          }

          return VulkanBufferCreation(buffer, createdAllocation)
        } catch (error Exception) {
          if buffer != 0uL {
            let destroyBuffer = dispatch.vkDestroyBuffer
            try { destroyBuffer(device, buffer, nil) } catch (cleanup Exception) { }
          }
          if objectAccounted {
            if let accounting = objectAccounting {
              try { accounting.Release() } catch (cleanup Exception) { }
            }
          }
          if let createdAllocation = allocation {
            try { allocator.Release(createdAllocation) } catch (cleanup Exception) { }
          }
          throw error
        }
      }

    internal func CreateMapped(
      device VkDevice,
      dispatch VkDeviceDispatch,
      allocator VulkanMemoryAllocator,
      objectAccounting VulkanObjectAccounting?,
      size VkDeviceSize,
      usage VkBufferUsageFlags,
      memoryPolicy VulkanMemoryPolicy,
      ownerKind VulkanMemoryOwnerKind = VulkanMemoryOwnerKind.Buffer) VulkanBufferCreation{

        let creation = Create(
          device,
          dispatch,
          allocator,
          objectAccounting,
          size,
          usage,
          memoryPolicy, ownerKind)

        try {
          if allocator.Map(creation.Allocation) != VkConstants.VK_SUCCESS {
            throw InvalidOperationException("vkMapMemory failed")
          }
          return creation
        } catch (error Exception) {
          let destroyBuffer = dispatch.vkDestroyBuffer
          try { destroyBuffer(device, creation.Buffer, nil) } catch (cleanup Exception) { }
          if let accounting = objectAccounting {
            try { accounting.Release() } catch (cleanup Exception) { }
          }
          try { allocator.Release(creation.Allocation) } catch (cleanup Exception) { }
          throw error
        }
      }
  }
}
