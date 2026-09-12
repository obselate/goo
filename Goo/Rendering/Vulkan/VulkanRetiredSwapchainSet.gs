package Goo

import System

internal class VulkanRetiredSwapchainSet {
  private let generations []VulkanSwapchainGeneration?
  private var count int32

  internal init(capacity int32) {
    if capacity <= 0 {
      throw ArgumentOutOfRangeException("capacity")
    }
    generations = [capacity]VulkanSwapchainGeneration?
  }

  internal prop Count int32{
    get -> count
  }

  internal func Generation(index int32) VulkanSwapchainGeneration {
    EnsureIndex(index)
    guard let generation = generations[index] else {
      throw InvalidOperationException("Vulkan retired swapchain generation is unavailable")
    }
    return generation
  }

  internal func Enqueue(generation VulkanSwapchainGeneration,
    retirement VulkanPresentationRetirement) {
      if generation == nil {
        throw ArgumentNullException("generation")
      }
      if count >= generations.Length {
        throw OverflowException("Vulkan retired swapchain capacity exceeded")
      }
      retirement.QueueRetiredGeneration(generation.Generation)
      generations[count] = generation
      count = count + 1
    }

  internal func CollectReady(retirement VulkanPresentationRetirement) {
    var generationId uint64 = 0uL
    while retirement.TryPopRetiredGeneration(out generationId) {
      let index = Find(generationId)
      if index < 0 {
        throw InvalidOperationException("Vulkan retired swapchain generation is missing")
      }
      Generation(index).Dispose()
      RemoveAt(index)
    }
  }

  internal func TryWaitAndDisposeNext(retirement VulkanPresentationRetirement,
    out result VkResult) bool{
      result = VkConstants.VK_SUCCESS
      if count == 0 {
        return false
      }
      let generation = Generation(0)
      let generationId = generation.Generation
      try {
        result = generation.WaitForPresentCompletion(retirement)
      } catch (cleanup Exception) { }
      try { generation.Dispose() } catch (cleanup Exception) { }
      retirement.RetireGenerationNow(generationId)
      RemoveAt(0)
      return true
    }

  internal func DisposeAfterDeviceLoss() {
    let staleCount = count
    count = 0
    var index int32 = 0
    while index < staleCount {
      let generation = generations[index]
      generations[index] = nil
      if let current = generation {
        try { current.DisposeAfterDeviceLoss() } catch (cleanup Exception) { }
      }
      index = index + 1
    }
  }

  private func Find(generationId uint64) int32 {
    var index int32 = 0
    while index < count {
      if Generation(index).Generation == generationId {
        return index
      }
      index = index + 1
    }
    return -1
  }

  private func RemoveAt(index int32) {
    EnsureIndex(index)
    var readIndex = index + 1
    while readIndex < count {
      generations[readIndex - 1] = generations[readIndex]
      readIndex = readIndex + 1
    }
    count = count - 1
    generations[count] = nil
  }

  private func EnsureIndex(index int32) {
    if index < 0 || index >= count {
      throw ArgumentOutOfRangeException("index")
    }
  }
}
