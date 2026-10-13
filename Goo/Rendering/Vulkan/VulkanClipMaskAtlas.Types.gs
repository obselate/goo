package Goo

import System

internal enum VulkanClipMaskFormat {
  R8Unorm;
  Rgba8Unorm;
}

internal data struct VulkanClipMaskFormatSupport {
  var MaxImageArrayLayers uint32
  var R8UnormSampledImage bool
  var R8UnormColorAttachment bool
  var R8UnormLinearFilter bool
  var Rgba8UnormSampledImage bool
  var Rgba8UnormColorAttachment bool
  var Rgba8UnormLinearFilter bool
}

internal data struct VulkanClipMaskAtlasKey {
  var Value uint64

  internal prop IsValid bool{ get -> Value != 0uL }
}

internal data struct VulkanClipMaskMapping {
  var ScaleX float32
  var ScaleY float32
  var OffsetX float32
  var OffsetY float32
  var Layer uint32
}

internal data struct VulkanClipMaskRegion {
  var Key uint64
  var Generation uint64
  var Layer uint32
  var PaddedX uint32
  var PaddedY uint32
  var PaddedWidth uint32
  var PaddedHeight uint32
  var ContentX uint32
  var ContentY uint32
  var ContentWidth uint32
  var ContentHeight uint32
  var ScreenX int32
  var ScreenY int32
  var ScreenWidth uint32
  var ScreenHeight uint32
  var Dirty bool
  var Mapping VulkanClipMaskMapping
}

internal data struct VulkanClipMaskDirtyRegion {
  var Key uint64
  var Generation uint64
  var Layer uint32
  var X uint32
  var Y uint32
  var Width uint32
  var Height uint32
}

internal data struct VulkanClipMaskAtlasStats {
  var Generation uint64
  var Width uint32
  var Height uint32
  var ActiveLayerCount uint32
  var MaximumLayerCount uint32
  var Format VulkanClipMaskFormat
  var BytesPerPixel uint32
  var ResidentBytes VkDeviceSize
  var ByteBudget VkDeviceSize
  var RegionCount int32
  var DirtyRegionCount int32
  var RetiredGenerationCount int32
  var FreePlacementCount int32
  var EvictionCount uint64
  var PressureEventCount uint64
  var PressureFailureCount uint64
  var LastUseSerial uint64
  var CompletedSerial uint64
  var Image VkImage
  var ImageView VkImageView
  var Sampler VkSampler
}

internal class VulkanClipMaskAtlasContract {
  shared {
    const RegionPadding uint32 = 1u
  }
}
