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
  var profileTraceId string?
  var profileId uint64
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
  var payloadBytes uint64?
  var width int32?
  var height int32?
  var format VkFormat
  var layers uint32
  var profileTraceId string?
  var profileId uint64
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
}
