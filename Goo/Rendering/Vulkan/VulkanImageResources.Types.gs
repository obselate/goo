package Goo

import System

internal enum VulkanImageSamplerMode {
  Nearest;
  Linear;
}

internal enum VulkanImageResourceState {
  Empty;
  Resident;
  UploadPending;
  Retiring;
}

internal enum VulkanImageDescriptorState {
  Empty;
  Bound;
  Retiring;
}

internal data struct VulkanImageDescriptorBinding {
  var State VulkanImageDescriptorState
  var ImageId ResourceId
  var SamplerId ResourceId
  var SamplerMode VulkanImageSamplerMode
  var Generation uint64
  var Slot int32
  var DescriptorToken uint64
  var RetireFence uint64
}

internal data struct VulkanImageResourceEntry {
  var Id ResourceId
  var ProviderId uint64
  var SourceId uint64
  var Width uint32
  var Height uint32
  var Bytes VkDeviceSize
  var SamplerId ResourceId
  var SamplerMode VulkanImageSamplerMode
  var Cacheable bool
  var State VulkanImageResourceState
  var GpuPublished bool
  var Image VkImage
  var ImageView VkImageView
  var Allocation VulkanMemoryAllocation?
  var NearestDescriptor VulkanImageDescriptorBinding
  var LinearDescriptor VulkanImageDescriptorBinding
  var ImageLayout VkImageLayout
  var UploadedVersion uint64
  var UploadCompletedRows uint32
  var UploadRowOffset uint32
  var UploadRowCount uint32
  var Upload VulkanUploadReservation
  var UploadRecorded bool
  var UploadSubmitted bool
  var UploadCommandBuffer VkCommandBuffer
  var UploadFence uint64
  var PendingRetire bool
  var DropLogicalOnRetire bool
  var RecordingUseCount int32
  var LastUseFence uint64
  var RetireFence uint64
  var LastTouch uint64
}

internal data struct VulkanImageSourceRelease {
  var Retired bool
  var Remaining bool
  var AwaitsFence bool
}

internal data struct VulkanImageResourceStats {
  var Generation uint64
  var Capacity int32
  var LiveCount int32
  var ResidentBytes VkDeviceSize
  var ResidentByteBudget VkDeviceSize
  var LiveObjectCount uint64
  var DescriptorCapacity int32
  var BoundDescriptorCount int32
  var RetiringDescriptorCount int32
  var HighestCompletedFence uint64
  var Upload VulkanUploadRingStats
  var Registry VulkanResourceRegistryStats
}

internal data struct VulkanImageResourceLookup {
  var Found bool
  var Renderable bool
  var Id ResourceId
  var Image VkImage
  var ImageView VkImageView
  var DescriptorSet VkDescriptorSet
  var Width uint32
  var Height uint32
  var SamplerId ResourceId
  var SamplerMode VulkanImageSamplerMode
  var UploadedVersion uint64
}
