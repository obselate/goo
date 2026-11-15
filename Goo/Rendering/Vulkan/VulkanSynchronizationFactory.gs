package Goo

import System

internal unsafe class VulkanSynchronizationFactory {
  shared {
    internal func CreateSemaphore(
      device VkDevice,
      dispatch VkDeviceDispatch,
      objectAccounting VulkanObjectAccounting?) VkSemaphore{
        var semaphore VkSemaphore = 0uL
        var accounted bool = false
        var info = VkSemaphoreCreateInfo{
          sType: VkConstants.VK_STRUCTURE_TYPE_SEMAPHORE_CREATE_INFO,
          pNext: nil,
          flags: 0u,
        }
        try {
          let createSemaphore = dispatch.vkCreateSemaphore
          let result = createSemaphore(device, &info, nil, &semaphore)
          if result != VkConstants.VK_SUCCESS || semaphore == 0uL {
            throw InvalidOperationException(
              "vkCreateSemaphore failed: " + result.ToString())
          }
          if let accounting = objectAccounting {
            accounting.Allocate()
            accounted = true
          }
          return semaphore
        } catch (error Exception) {
          if semaphore != 0uL {
            let destroySemaphore = dispatch.vkDestroySemaphore
            try { destroySemaphore(device, semaphore, nil) } catch (cleanup Exception) { }
          }
          if accounted {
            if let accounting = objectAccounting {
              try { accounting.Release() } catch (cleanup Exception) { }
            }
          }
          rethrow
        }
      }

    internal func CreateFence(
      device VkDevice,
      dispatch VkDeviceDispatch,
      objectAccounting VulkanObjectAccounting?,
      flags VkFenceCreateFlags) VkFence{
        var fence VkFence = 0uL
        var accounted bool = false
        var info = VkFenceCreateInfo{
          sType: VkConstants.VK_STRUCTURE_TYPE_FENCE_CREATE_INFO,
          pNext: nil,
          flags: flags,
        }
        try {
          let createFence = dispatch.vkCreateFence
          let result = createFence(device, &info, nil, &fence)
          if result != VkConstants.VK_SUCCESS || fence == 0uL {
            throw InvalidOperationException(
              "vkCreateFence failed: " + result.ToString())
          }
          if let accounting = objectAccounting {
            accounting.Allocate()
            accounted = true
          }
          return fence
        } catch (error Exception) {
          if fence != 0uL {
            let destroyFence = dispatch.vkDestroyFence
            try { destroyFence(device, fence, nil) } catch (cleanup Exception) { }
          }
          if accounted {
            if let accounting = objectAccounting {
              try { accounting.Release() } catch (cleanup Exception) { }
            }
          }
          rethrow
        }
      }
  }
}
