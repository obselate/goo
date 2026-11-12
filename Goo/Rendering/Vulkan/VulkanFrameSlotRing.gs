package Goo

import System

internal unsafe struct VulkanFrameSlotRing {
  private var first VulkanFrameSlot? = nil
  private var second VulkanFrameSlot? = nil
  private var currentIndex uint32

  internal prop CurrentIndex uint32{
    get -> currentIndex
  }

  internal prop Current VulkanFrameSlot? {
    get -> if currentIndex == 0u { first } else { second }
  }

  internal func Slot(index uint32) VulkanFrameSlot? {
    if index == 0u {
      return first
    }
    if index == 1u {
      return second
    }
    throw ArgumentOutOfRangeException("index")
  }

  internal func Create(
    device VkDevice,
    dispatch VkDeviceDispatch,
    firstCommandBuffer VkCommandBuffer,
    secondCommandBuffer VkCommandBuffer,
    objectAccounting VulkanObjectAccounting?,
    sharedLease VulkanSharedLease) {
      if first != nil || second != nil {
        throw InvalidOperationException("Vulkan frame slot ring is already created")
      }
      let createdFirst = VulkanFrameSlot(
        device, dispatch, firstCommandBuffer, objectAccounting, sharedLease)
      first = createdFirst
      try {
        second = VulkanFrameSlot(
          device, dispatch, secondCommandBuffer, objectAccounting, sharedLease)
      } catch (error Exception) {
        try { createdFirst.Dispose() } catch (cleanup Exception) { }
        first = nil
        rethrow
      }
      currentIndex = 0u
    }

  internal func Advance() {
    currentIndex = if currentIndex == 0u { 1u } else { 0u }
  }

  internal func Dispose() {
    let staleFirst = first
    first = nil
    if let slot = staleFirst {
      try { slot.Dispose() } catch (cleanup Exception) { }
    }
    let staleSecond = second
    second = nil
    if let slot = staleSecond {
      try { slot.Dispose() } catch (cleanup Exception) { }
    }
    currentIndex = 0u
  }

  internal func DisposeAfterDeviceLoss() {
    let staleFirst = first
    first = nil
    if let slot = staleFirst {
      try { slot.DisposeAfterDeviceLoss() } catch (cleanup Exception) { }
    }
    let staleSecond = second
    second = nil
    if let slot = staleSecond {
      try { slot.DisposeAfterDeviceLoss() } catch (cleanup Exception) { }
    }
    currentIndex = 0u
  }
}
