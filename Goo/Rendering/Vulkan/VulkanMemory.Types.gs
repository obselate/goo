package Goo

import System

internal enum VulkanMemoryResourceClass {
  Buffer;
  Image;
}

internal enum VulkanMemoryAllocationState {
  Empty;
  Live;
  Retired;
}

internal unsafe class VulkanMemoryBlock {
  var memory VkDeviceMemory
  var size VkDeviceSize
  var memoryTypeIndex uint32
  var heapIndex uint32
  var propertyFlags VkMemoryPropertyFlags
  var hostVisible bool
  var hostCoherent bool
  var resourceClass VulkanMemoryResourceClass
  var dedicated bool
  var mapped * void
  var allocationCount uint32
}

internal unsafe class VulkanMemoryAllocation {
  var memory VkDeviceMemory
  var size VkDeviceSize
  var placementSpan VkDeviceSize
  var offset VkDeviceSize
  var memoryTypeIndex uint32
  var heapIndex uint32
  var propertyFlags VkMemoryPropertyFlags
  var hostVisible bool
  var hostCoherent bool
  var dedicated bool
  var mapped * void
  var block VulkanMemoryBlock?
  var activeIndex int32
  var blockFresh bool
  var pendingBind bool
  var state VulkanMemoryAllocationState
  var ownerKind VulkanMemoryOwnerKind
  var cache VulkanGpuCache?
  var cacheHandle int32
}

/// <summary>Cache that owns evictable allocations in <see cref="VulkanMemoryAllocator"/>.</summary>
internal interface VulkanGpuCache {
  /// <summary>Returns the submission serial of the item's last use, or nil while the current or an in-flight frame uses it.</summary>
  func EvictionSerial(handle int32) uint64?;
  /// <summary>Releases the item and all of its allocations.</summary>
  func Evict(handle int32);
}

/// <summary>An allocation does not fit in its heap after eviction and one retry.</summary>
internal sealed class VulkanMemoryPressureException : InvalidOperationException {
  internal let HeapIndex uint32

  internal init(heapIndex uint32, bytes VkDeviceSize)
    : base("Vulkan memory heap " + heapIndex.ToString() + " cannot hold " + bytes.ToString() + " bytes") {
      HeapIndex = heapIndex
    }
}

internal data struct VulkanMemoryPlacement {
  var block VulkanMemoryBlock?
  var offset VkDeviceSize
  var span VkDeviceSize
  var newBlock bool
}

internal data struct VulkanMemoryTypeSelection {
  var memoryTypeIndex uint32
  var heapIndex uint32
  var propertyFlags VkMemoryPropertyFlags
}

internal data struct VulkanMemoryCounters {
  var allocationEvents uint64
  var liveBytes VkDeviceSize
  var liveAllocations uint64
  var retiredBytes VkDeviceSize
  var retiredAllocations uint64
  var residentBytes VkDeviceSize
  var residentAllocations uint64
  var evictionCount uint64
  var allocationRetryCount uint64
  var pressureCount uint64
}
