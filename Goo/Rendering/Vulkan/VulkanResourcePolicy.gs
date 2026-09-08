package Goo

import System

internal data struct VulkanResourcePolicy {
  internal let ImageInitialResourceCapacity int32
  internal let ImageInitialLogicalCapacity int32
  internal let ImageResidentHardBytes VkDeviceSize
  internal let ImageLogicalSourceHardBytes VkDeviceSize
  internal let ImageStagingInitialBytes VkDeviceSize
  internal let ImageStagingHardBytes VkDeviceSize
  internal let ImageUploadInitialRangeCapacity int32
  internal let ImageIdentityInitialCapacity int32
  internal let PathAtlasInitialBytes VkDeviceSize
  internal let PathAtlasHardBytes VkDeviceSize
  internal let OffscreenLayerInitialCapacity int32
  internal let OffscreenLayerSoftBytes VkDeviceSize
  internal let OffscreenLayerHardBytes VkDeviceSize
}

internal func CreateVulkanResourcePolicy(memoryProperties VkPhysicalDeviceMemoryProperties,
  sampledHeapBudget VkDeviceSize, maxStorageBufferRange uint32) VulkanResourcePolicy{
    let minimumResidentBytes VkDeviceSize = 67108864uL
    let maximumResidentBytes VkDeviceSize = 268435456uL
    let fallbackAllowance = VulkanResourcePolicyTotalHeapBytes(memoryProperties) / 8uL
    var availableBytes = sampledHeapBudget
    if availableBytes == 0uL {
      availableBytes = fallbackAllowance
    }
    var imageResidentBytes = availableBytes / 8uL
    if imageResidentBytes < minimumResidentBytes {
      imageResidentBytes = minimumResidentBytes
    }
    if imageResidentBytes > maximumResidentBytes {
      imageResidentBytes = maximumResidentBytes
    }
    let imageLogicalBytes = imageResidentBytes * 2uL
    var layerHardBytes = availableBytes / 16uL
    if layerHardBytes < 134217728uL {
      layerHardBytes = 134217728uL
    }
    if layerHardBytes > 536870912uL {
      layerHardBytes = 536870912uL
    }
    let layerSoftBytes = layerHardBytes / 2uL
    var pathHardBytes = VkDeviceSize(maxStorageBufferRange)
    if pathHardBytes > 2147483644uL {
      pathHardBytes = 2147483644uL
    }
    pathHardBytes = pathHardBytes - (pathHardBytes % 4uL)
    return VulkanResourcePolicy{
      ImageInitialResourceCapacity: 256,
      ImageInitialLogicalCapacity: 512,
      ImageResidentHardBytes: imageResidentBytes,
      ImageLogicalSourceHardBytes: imageLogicalBytes,
      ImageStagingInitialBytes: 65536uL,
      ImageStagingHardBytes: 16777216uL,
      ImageUploadInitialRangeCapacity: 64,
      ImageIdentityInitialCapacity: 4096,
      PathAtlasInitialBytes: 262144uL,
      PathAtlasHardBytes: pathHardBytes,
      OffscreenLayerInitialCapacity: 16,
      OffscreenLayerSoftBytes: layerSoftBytes,
      OffscreenLayerHardBytes: layerHardBytes,
    }
  }

private func VulkanResourcePolicyTotalHeapBytes(
  properties VkPhysicalDeviceMemoryProperties) VkDeviceSize{
    var total VkDeviceSize = 0uL
    var index uint32 = 0u
    while index < properties.memoryHeapCount {
      let size = VulkanResourcePolicyHeap(properties, index).size
      if total > uint64.MaxValue - size {
        return uint64.MaxValue
      }
      total += size
      index++
    }
    return total
  }

private func VulkanResourcePolicyHeap(
  properties VkPhysicalDeviceMemoryProperties, index uint32) VkMemoryHeap{
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
