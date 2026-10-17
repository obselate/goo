package Goo

import System

internal unsafe partial class VulkanMemoryAllocator : IDisposable {
  private func RemoveActive(allocation VulkanMemoryAllocation) {
    let activeIndex = allocation.activeIndex
    if activeIndex < 0 || activeIndex >= activeCount {
      return
    }
    let lastIndex = activeCount - 1
    if activeIndex != lastIndex {
      let moved = activeAllocations[lastIndex]!!
      activeAllocations[activeIndex] = moved
      moved.activeIndex = activeIndex
    }
    activeAllocations[lastIndex] = nil
    activeCount = lastIndex
    allocation.activeIndex = -1
  }

  private func RemoveBlock(block VulkanMemoryBlock) {
    var blockIndex int32 = 0
    while blockIndex < blockCount {
      if let candidate = blocks[blockIndex] {
        if candidate == block {
          if block.mapped != nil {
            let unmapMemory = deviceDispatch.vkUnmapMemory
            unmapMemory(device, block.memory)
            block.mapped = nil
          }
          if block.memory != 0uL {
            let freeMemory = deviceDispatch.vkFreeMemory
            freeMemory(device, block.memory, nil)
            if let recorder = FrameRecorder.Current {
              ProfileBlock(recorder, block, FrameTraceKind.ResourceLifecycle, VulkanDiagnosticEventIds.ResourceEvict)
            }
            if let accounting = objectAccounting {
              accounting.Release()
            }
            block.memory = 0uL
          }
          block.allocationCount = 0u
          heapResidentBytes[int32(block.heapIndex)] -= block.size
          residentBytes -= block.size
          residentAllocations--
          let lastIndex = blockCount - 1
          if blockIndex != lastIndex {
            blocks[blockIndex] = blocks[lastIndex]
          }
          blocks[lastIndex] = nil
          blockCount = lastIndex
          return
        }
      }
      blockIndex = blockIndex + 1
    }
  }

  private func TrimEmptyPooledBlocks(block VulkanMemoryBlock) {
    var blockIndex int32 = 0
    while blockIndex < blockCount {
      if let candidate = blocks[blockIndex] {
        if candidate != block
          && !candidate.dedicated
          && candidate.memoryTypeIndex == block.memoryTypeIndex
          && candidate.resourceClass == block.resourceClass
          && candidate.allocationCount == 0u {
            RemoveBlock(candidate)
            continue
          }
      }
      blockIndex = blockIndex + 1
    }
  }

  private func EnsureLiveCapacity(size VkDeviceSize) {
    if size > uint64.MaxValue - liveBytes
      || size > uint64.MaxValue - retiredBytes{
        throw OverflowException("Vulkan memory counter overflow")
      }
  }

  private func EnsureBlockCapacity(heapIndex uint32, blockSize VkDeviceSize) {
    if residentAllocations >= maxAllocationCount {
      throw InvalidOperationException("Vulkan memory allocation count limit reached")
    }
    if heapIndex >= memoryProperties.memoryHeapCount {
      throw InvalidOperationException("Vulkan memory allocation references an invalid heap")
    }
    budget.Refresh()
    if !budget.CanAllocate(heapIndex, blockSize) {
      throw InvalidOperationException("Vulkan memory heap budget exceeded")
    }
    let heap = MemoryHeap(memoryProperties, heapIndex)
    let current = heapResidentBytes[int32(heapIndex)]
    if blockSize > heap.size || current > heap.size - blockSize {
      throw InvalidOperationException("Vulkan memory heap capacity exceeded")
    }
    if residentBytes > uint64.MaxValue - blockSize {
      throw OverflowException("Vulkan resident memory counter overflow")
    }
    EnsureBlockMetadataCapacity()
  }

  private func EnsureUsable(allocation VulkanMemoryAllocation) {
    if allocation.state != VulkanMemoryAllocationState.Live || allocation.memory == 0uL {
      throw InvalidOperationException("Vulkan memory allocation is not live")
    }
  }

  private func EnsureOpen() {
    if disposed {
      throw ObjectDisposedException("VulkanMemoryAllocator")
    }
  }

  private func ResetAllocation(allocation VulkanMemoryAllocation) {
    allocation.memory = 0uL
    allocation.size = 0uL
    allocation.placementSpan = 0uL
    allocation.offset = 0uL
    allocation.memoryTypeIndex = 0u
    allocation.heapIndex = 0u
    allocation.propertyFlags = 0u
    allocation.hostVisible = false
    allocation.hostCoherent = false
    allocation.dedicated = false
    allocation.mapped = nil
    allocation.block = nil
    allocation.activeIndex = -1
    allocation.blockFresh = false
    allocation.pendingBind = false
    allocation.state = VulkanMemoryAllocationState.Empty
  }

  private func PointerAt(basePointer * void, offset VkDeviceSize) * void -> *void(nint(basePointer) + nint(offset))

  private func BitCount(value uint32) int32 {
    var remaining = value
    var count int32 = 0
    while remaining != 0u {
      count += int32(remaining & 1u)
      remaining = remaining >> 1
    }
    return count
  }

  private func MemoryType(properties VkPhysicalDeviceMemoryProperties, index uint32) VkMemoryType {
    switch index {
      case 0u { return properties.memoryTypes_0 }
      case 1u { return properties.memoryTypes_1 }
      case 2u { return properties.memoryTypes_2 }
      case 3u { return properties.memoryTypes_3 }
      case 4u { return properties.memoryTypes_4 }
      case 5u { return properties.memoryTypes_5 }
      case 6u { return properties.memoryTypes_6 }
      case 7u { return properties.memoryTypes_7 }
      case 8u { return properties.memoryTypes_8 }
      case 9u { return properties.memoryTypes_9 }
      case 10u { return properties.memoryTypes_10 }
      case 11u { return properties.memoryTypes_11 }
      case 12u { return properties.memoryTypes_12 }
      case 13u { return properties.memoryTypes_13 }
      case 14u { return properties.memoryTypes_14 }
      case 15u { return properties.memoryTypes_15 }
      case 16u { return properties.memoryTypes_16 }
      case 17u { return properties.memoryTypes_17 }
      case 18u { return properties.memoryTypes_18 }
      case 19u { return properties.memoryTypes_19 }
      case 20u { return properties.memoryTypes_20 }
      case 21u { return properties.memoryTypes_21 }
      case 22u { return properties.memoryTypes_22 }
      case 23u { return properties.memoryTypes_23 }
      case 24u { return properties.memoryTypes_24 }
      case 25u { return properties.memoryTypes_25 }
      case 26u { return properties.memoryTypes_26 }
      case 27u { return properties.memoryTypes_27 }
      case 28u { return properties.memoryTypes_28 }
      case 29u { return properties.memoryTypes_29 }
      case 30u { return properties.memoryTypes_30 }
      case 31u { return properties.memoryTypes_31 }
      case _ { throw ArgumentOutOfRangeException("index") }
    }
  }

  private func MemoryHeap(properties VkPhysicalDeviceMemoryProperties, index uint32) VkMemoryHeap {
    switch index {
      case 0u { return properties.memoryHeaps_0 }
      case 1u { return properties.memoryHeaps_1 }
      case 2u { return properties.memoryHeaps_2 }
      case 3u { return properties.memoryHeaps_3 }
      case 4u { return properties.memoryHeaps_4 }
      case 5u { return properties.memoryHeaps_5 }
      case 6u { return properties.memoryHeaps_6 }
      case 7u { return properties.memoryHeaps_7 }
      case 8u { return properties.memoryHeaps_8 }
      case 9u { return properties.memoryHeaps_9 }
      case 10u { return properties.memoryHeaps_10 }
      case 11u { return properties.memoryHeaps_11 }
      case 12u { return properties.memoryHeaps_12 }
      case 13u { return properties.memoryHeaps_13 }
      case 14u { return properties.memoryHeaps_14 }
      case 15u { return properties.memoryHeaps_15 }
      case _ { throw ArgumentOutOfRangeException("index") }
    }
  }
}
