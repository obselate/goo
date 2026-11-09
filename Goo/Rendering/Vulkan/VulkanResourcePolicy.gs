package Goo

import System

internal data struct VulkanResourcePolicy {
  internal let ImageInitialResourceCapacity int32
  internal let ImageInitialLogicalCapacity int32
  internal let ImageStagingInitialBytes VkDeviceSize
  internal let ImageStagingHardBytes VkDeviceSize
  internal let ImageUploadInitialRangeCapacity int32
  internal let ImageIdentityInitialCapacity int32
  internal let PathAtlasInitialBytes VkDeviceSize
  internal let PathAtlasHardBytes VkDeviceSize
  internal let OffscreenLayerInitialCapacity int32
}

internal func CreateVulkanResourcePolicy(maxStorageBufferRange uint32) VulkanResourcePolicy {
  var pathHardBytes = VkDeviceSize(maxStorageBufferRange)
  if pathHardBytes > 2147483644uL {
    pathHardBytes = 2147483644uL
  }
  pathHardBytes = pathHardBytes - (pathHardBytes % 4uL)
  return VulkanResourcePolicy{
    ImageInitialResourceCapacity: 16,
    ImageInitialLogicalCapacity: 512,
    ImageStagingInitialBytes: 65536uL,
    ImageStagingHardBytes: 16777216uL,
    ImageUploadInitialRangeCapacity: 64,
    ImageIdentityInitialCapacity: 4096,
    PathAtlasInitialBytes: 262144uL,
    PathAtlasHardBytes: pathHardBytes,
    OffscreenLayerInitialCapacity: 16,
  }
}
