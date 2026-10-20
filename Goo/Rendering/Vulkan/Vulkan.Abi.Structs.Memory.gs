package Goo

import System.Runtime.InteropServices

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkAllocationCallbacks {
  var pUserData * void
  var pfnAllocation unmanaged[Cdecl](nint, nuint, nuint, VkSystemAllocationScope) -> nint
  var pfnReallocation unmanaged[Cdecl](nint, nint, nuint, nuint, VkSystemAllocationScope) -> nint
  var pfnFree unmanaged[Cdecl](nint, nint) -> void
  var pfnInternalAllocation unmanaged[Cdecl](nint, nuint, VkInternalAllocationType, VkSystemAllocationScope) -> void
  var pfnInternalFree unmanaged[Cdecl](nint, nuint, VkInternalAllocationType, VkSystemAllocationScope) -> void
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkApplicationInfo {
  var sType VkStructureType
  var pNext * void
  var pApplicationName * int8
  var applicationVersion uint32
  var pEngineName * int8
  var engineVersion uint32
  var apiVersion uint32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkBindBufferMemoryInfo {
  var sType VkStructureType
  var pNext * void
  var buffer VkBuffer
  var memory VkDeviceMemory
  var memoryOffset VkDeviceSize
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkBindImageMemoryInfo {
  var sType VkStructureType
  var pNext * void
  var image VkImage
  var memory VkDeviceMemory
  var memoryOffset VkDeviceSize
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkBufferCopy {
  var srcOffset VkDeviceSize
  var dstOffset VkDeviceSize
  var size VkDeviceSize
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkBufferCreateInfo {
  var sType VkStructureType
  var pNext * void
  var flags VkBufferCreateFlags
  var size VkDeviceSize
  var usage VkBufferUsageFlags
  var sharingMode VkSharingMode
  var queueFamilyIndexCount uint32
  var pQueueFamilyIndices * uint32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkBufferImageCopy {
  var bufferOffset VkDeviceSize
  var bufferRowLength uint32
  var bufferImageHeight uint32
  var imageSubresource VkImageSubresourceLayers
  var imageOffset VkOffset3D
  var imageExtent VkExtent3D
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkImageCopy {
  var srcSubresource VkImageSubresourceLayers
  var srcOffset VkOffset3D
  var dstSubresource VkImageSubresourceLayers
  var dstOffset VkOffset3D
  var extent VkExtent3D
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkBufferMemoryBarrier2 {
  var sType VkStructureType
  var pNext * void
  var srcStageMask VkPipelineStageFlags2
  var srcAccessMask VkAccessFlags2
  var dstStageMask VkPipelineStageFlags2
  var dstAccessMask VkAccessFlags2
  var srcQueueFamilyIndex uint32
  var dstQueueFamilyIndex uint32
  var buffer VkBuffer
  var offset VkDeviceSize
  var size VkDeviceSize
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkBufferMemoryRequirementsInfo2 {
  var sType VkStructureType
  var pNext * void
  var buffer VkBuffer
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkBufferViewCreateInfo {
  var sType VkStructureType
  var pNext * void
  var flags VkBufferViewCreateFlags
  var buffer VkBuffer
  var format VkFormat
  var offset VkDeviceSize
  var _range VkDeviceSize
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkClearColorValue_float32Array {
  fixed values[4]float32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkClearColorValue_int32Array {
  fixed values[4]int32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkClearColorValue_uint32Array {
  fixed values[4]uint32
}

@StructLayout(LayoutKind.Explicit, Size: 16)
internal unsafe struct VkClearColorValue {
  @FieldOffset(0) var float32 VkClearColorValue_float32Array
  @FieldOffset(0) var int32 VkClearColorValue_int32Array
  @FieldOffset(0) var uint32 VkClearColorValue_uint32Array
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkClearDepthStencilValue {
  var depth float32
  var stencil uint32
}

@StructLayout(LayoutKind.Explicit, Size: 16)
internal unsafe struct VkClearValue {
  @FieldOffset(0) var color VkClearColorValue
  @FieldOffset(0) var depthStencil VkClearDepthStencilValue
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkCommandBufferAllocateInfo {
  var sType VkStructureType
  var pNext * void
  var commandPool VkCommandPool
  var level VkCommandBufferLevel
  var commandBufferCount uint32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkCommandBufferBeginInfo {
  var sType VkStructureType
  var pNext * void
  var flags VkCommandBufferUsageFlags
  var pInheritanceInfo * VkCommandBufferInheritanceInfo
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkCommandBufferInheritanceInfo {
  var sType VkStructureType
  var pNext * void
  var renderPass VkRenderPass
  var subpass uint32
  var framebuffer VkFramebuffer
  var occlusionQueryEnable VkBool32
  var queryFlags VkQueryControlFlags
  var pipelineStatistics VkQueryPipelineStatisticFlags
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkCommandBufferSubmitInfo {
  var sType VkStructureType
  var pNext * void
  var commandBuffer VkCommandBuffer
  var deviceMask uint32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkCommandPoolCreateInfo {
  var sType VkStructureType
  var pNext * void
  var flags VkCommandPoolCreateFlags
  var queueFamilyIndex uint32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkComponentMapping {
  var r VkComponentSwizzle
  var g VkComponentSwizzle
  var b VkComponentSwizzle
  var a VkComponentSwizzle
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkCopyDescriptorSet {
  var sType VkStructureType
  var pNext * void
  var srcSet VkDescriptorSet
  var srcBinding uint32
  var srcArrayElement uint32
  var dstSet VkDescriptorSet
  var dstBinding uint32
  var dstArrayElement uint32
  var descriptorCount uint32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkDebugUtilsLabelEXT {
  var sType VkStructureType
  var pNext * void
  var pLabelName * int8
  fixed color[4]float32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkDebugUtilsMessengerCallbackDataEXT {
  var sType VkStructureType
  var pNext * void
  var flags VkDebugUtilsMessengerCallbackDataFlagsEXT
  var pMessageIdName * int8
  var messageIdNumber int32
  var pMessage * int8
  var queueLabelCount uint32
  var pQueueLabels * VkDebugUtilsLabelEXT
  var cmdBufLabelCount uint32
  var pCmdBufLabels * VkDebugUtilsLabelEXT
  var objectCount uint32
  var pObjects * VkDebugUtilsObjectNameInfoEXT
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkDebugUtilsMessengerCreateInfoEXT {
  var sType VkStructureType
  var pNext * void
  var flags VkDebugUtilsMessengerCreateFlagsEXT
  var messageSeverity VkDebugUtilsMessageSeverityFlagsEXT
  var messageType VkDebugUtilsMessageTypeFlagsEXT
  var pfnUserCallback unmanaged[Cdecl](VkDebugUtilsMessageSeverityFlagBitsEXT, VkDebugUtilsMessageTypeFlagsEXT, nint, nint) -> VkBool32
  var pUserData * void
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkDebugUtilsObjectNameInfoEXT {
  var sType VkStructureType
  var pNext * void
  var objectType VkObjectType
  var objectHandle uint64
  var pObjectName * int8
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkDependencyInfo {
  var sType VkStructureType
  var pNext * void
  var dependencyFlags VkDependencyFlags
  var memoryBarrierCount uint32
  var pMemoryBarriers * VkMemoryBarrier2
  var bufferMemoryBarrierCount uint32
  var pBufferMemoryBarriers * VkBufferMemoryBarrier2
  var imageMemoryBarrierCount uint32
  var pImageMemoryBarriers * VkImageMemoryBarrier2
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkDescriptorBufferInfo {
  var buffer VkBuffer
  var offset VkDeviceSize
  var _range VkDeviceSize
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkDescriptorImageInfo {
  var sampler VkSampler
  var imageView VkImageView
  var imageLayout VkImageLayout
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkDescriptorPoolCreateInfo {
  var sType VkStructureType
  var pNext * void
  var flags VkDescriptorPoolCreateFlags
  var maxSets uint32
  var poolSizeCount uint32
  var pPoolSizes * VkDescriptorPoolSize
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkDescriptorPoolSize {
  var _type VkDescriptorType
  var descriptorCount uint32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkDescriptorSetAllocateInfo {
  var sType VkStructureType
  var pNext * void
  var descriptorPool VkDescriptorPool
  var descriptorSetCount uint32
  var pSetLayouts * VkDescriptorSetLayout
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkDescriptorSetLayoutBinding {
  var binding uint32
  var descriptorType VkDescriptorType
  var descriptorCount uint32
  var stageFlags VkShaderStageFlags
  var pImmutableSamplers * VkSampler
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkDescriptorSetLayoutCreateInfo {
  var sType VkStructureType
  var pNext * void
  var flags VkDescriptorSetLayoutCreateFlags
  var bindingCount uint32
  var pBindings * VkDescriptorSetLayoutBinding
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkDeviceCreateInfo {
  var sType VkStructureType
  var pNext * void
  var flags VkDeviceCreateFlags
  var queueCreateInfoCount uint32
  var pQueueCreateInfos * VkDeviceQueueCreateInfo
  var enabledLayerCount uint32
  var ppEnabledLayerNames * *int8
  var enabledExtensionCount uint32
  var ppEnabledExtensionNames * *int8
  var pEnabledFeatures * VkPhysicalDeviceFeatures
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkDeviceQueueCreateInfo {
  var sType VkStructureType
  var pNext * void
  var flags VkDeviceQueueCreateFlags
  var queueFamilyIndex uint32
  var queueCount uint32
  var pQueuePriorities * float32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkExtensionProperties {
  fixed extensionName[256]int8
  var specVersion uint32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkExtent2D {
  var width uint32
  var height uint32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkExtent3D {
  var width uint32
  var height uint32
  var depth uint32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkFenceCreateInfo {
  var sType VkStructureType
  var pNext * void
  var flags VkFenceCreateFlags
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkFormatProperties {
  var linearTilingFeatures VkFormatFeatureFlags
  var optimalTilingFeatures VkFormatFeatureFlags
  var bufferFeatures VkFormatFeatureFlags
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkGraphicsPipelineCreateInfo {
  var sType VkStructureType
  var pNext * void
  var flags VkPipelineCreateFlags
  var stageCount uint32
  var pStages * VkPipelineShaderStageCreateInfo
  var pVertexInputState * VkPipelineVertexInputStateCreateInfo
  var pInputAssemblyState * VkPipelineInputAssemblyStateCreateInfo
  var pTessellationState * VkPipelineTessellationStateCreateInfo
  var pViewportState * VkPipelineViewportStateCreateInfo
  var pRasterizationState * VkPipelineRasterizationStateCreateInfo
  var pMultisampleState * VkPipelineMultisampleStateCreateInfo
  var pDepthStencilState * VkPipelineDepthStencilStateCreateInfo
  var pColorBlendState * VkPipelineColorBlendStateCreateInfo
  var pDynamicState * VkPipelineDynamicStateCreateInfo
  var layout VkPipelineLayout
  var renderPass VkRenderPass
  var subpass uint32
  var basePipelineHandle VkPipeline
  var basePipelineIndex int32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkPipelineCacheCreateInfo {
  var sType VkStructureType
  var pNext * void
  var flags VkPipelineCacheCreateFlags
  var initialDataSize nuint
  var pInitialData * void
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkImageCreateInfo {
  var sType VkStructureType
  var pNext * void
  var flags VkImageCreateFlags
  var imageType VkImageType
  var format VkFormat
  var extent VkExtent3D
  var mipLevels uint32
  var arrayLayers uint32
  var samples VkSampleCountFlagBits
  var tiling VkImageTiling
  var usage VkImageUsageFlags
  var sharingMode VkSharingMode
  var queueFamilyIndexCount uint32
  var pQueueFamilyIndices * uint32
  var initialLayout VkImageLayout
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkImageMemoryBarrier2 {
  var sType VkStructureType
  var pNext * void
  var srcStageMask VkPipelineStageFlags2
  var srcAccessMask VkAccessFlags2
  var dstStageMask VkPipelineStageFlags2
  var dstAccessMask VkAccessFlags2
  var oldLayout VkImageLayout
  var newLayout VkImageLayout
  var srcQueueFamilyIndex uint32
  var dstQueueFamilyIndex uint32
  var image VkImage
  var subresourceRange VkImageSubresourceRange
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkImageMemoryRequirementsInfo2 {
  var sType VkStructureType
  var pNext * void
  var image VkImage
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkImageSubresourceLayers {
  var aspectMask VkImageAspectFlags
  var mipLevel uint32
  var baseArrayLayer uint32
  var layerCount uint32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkImageSubresourceRange {
  var aspectMask VkImageAspectFlags
  var baseMipLevel uint32
  var levelCount uint32
  var baseArrayLayer uint32
  var layerCount uint32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkImageViewCreateInfo {
  var sType VkStructureType
  var pNext * void
  var flags VkImageViewCreateFlags
  var image VkImage
  var viewType VkImageViewType
  var format VkFormat
  var components VkComponentMapping
  var subresourceRange VkImageSubresourceRange
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkInstanceCreateInfo {
  var sType VkStructureType
  var pNext * void
  var flags VkInstanceCreateFlags
  var pApplicationInfo * VkApplicationInfo
  var enabledLayerCount uint32
  var ppEnabledLayerNames * *int8
  var enabledExtensionCount uint32
  var ppEnabledExtensionNames * *int8
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkDirectDriverLoadingInfoLUNARG {
  var sType VkStructureType
  var pNext * void
  var flags VkDirectDriverLoadingFlagsLUNARG
  var pfnGetInstanceProcAddr nint
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkDirectDriverLoadingListLUNARG {
  var sType VkStructureType
  var pNext * void
  var mode VkDirectDriverLoadingModeLUNARG
  var driverCount uint32
  var pDrivers * VkDirectDriverLoadingInfoLUNARG
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkWin32SurfaceCreateInfoKHR {
  var sType VkStructureType
  var pNext * void
  var flags VkWin32SurfaceCreateFlagsKHR
  var hinstance nint
  var hwnd nint
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkMappedMemoryRange {
  var sType VkStructureType
  var pNext * void
  var memory VkDeviceMemory
  var offset VkDeviceSize
  var size VkDeviceSize
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkMemoryAllocateInfo {
  var sType VkStructureType
  var pNext * void
  var allocationSize VkDeviceSize
  var memoryTypeIndex uint32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkMemoryBarrier2 {
  var sType VkStructureType
  var pNext * void
  var srcStageMask VkPipelineStageFlags2
  var srcAccessMask VkAccessFlags2
  var dstStageMask VkPipelineStageFlags2
  var dstAccessMask VkAccessFlags2
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkMemoryDedicatedAllocateInfo {
  var sType VkStructureType
  var pNext * void
  var image VkImage
  var buffer VkBuffer
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkMemoryDedicatedRequirements {
  var sType VkStructureType
  var pNext * void
  var prefersDedicatedAllocation VkBool32
  var requiresDedicatedAllocation VkBool32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkMemoryHeap {
  var size VkDeviceSize
  var flags VkMemoryHeapFlags
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkMemoryRequirements {
  var size VkDeviceSize
  var alignment VkDeviceSize
  var memoryTypeBits uint32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkMemoryRequirements2 {
  var sType VkStructureType
  var pNext * void
  var memoryRequirements VkMemoryRequirements
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkMemoryType {
  var propertyFlags VkMemoryPropertyFlags
  var heapIndex uint32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkOffset2D {
  var x int32
  var y int32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkOffset3D {
  var x int32
  var y int32
  var z int32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkPhysicalDeviceFeatures {
  var robustBufferAccess VkBool32
  var fullDrawIndexUint32 VkBool32
  var imageCubeArray VkBool32
  var independentBlend VkBool32
  var geometryShader VkBool32
  var tessellationShader VkBool32
  var sampleRateShading VkBool32
  var dualSrcBlend VkBool32
  var logicOp VkBool32
  var multiDrawIndirect VkBool32
  var drawIndirectFirstInstance VkBool32
  var depthClamp VkBool32
  var depthBiasClamp VkBool32
  var fillModeNonSolid VkBool32
  var depthBounds VkBool32
  var wideLines VkBool32
  var largePoints VkBool32
  var alphaToOne VkBool32
  var multiViewport VkBool32
  var samplerAnisotropy VkBool32
  var textureCompressionETC2 VkBool32
  var textureCompressionASTC_LDR VkBool32
  var textureCompressionBC VkBool32
  var occlusionQueryPrecise VkBool32
  var pipelineStatisticsQuery VkBool32
  var vertexPipelineStoresAndAtomics VkBool32
  var fragmentStoresAndAtomics VkBool32
  var shaderTessellationAndGeometryPointSize VkBool32
  var shaderImageGatherExtended VkBool32
  var shaderStorageImageExtendedFormats VkBool32
  var shaderStorageImageMultisample VkBool32
  var shaderStorageImageReadWithoutFormat VkBool32
  var shaderStorageImageWriteWithoutFormat VkBool32
  var shaderUniformBufferArrayDynamicIndexing VkBool32
  var shaderSampledImageArrayDynamicIndexing VkBool32
  var shaderStorageBufferArrayDynamicIndexing VkBool32
  var shaderStorageImageArrayDynamicIndexing VkBool32
  var shaderClipDistance VkBool32
  var shaderCullDistance VkBool32
  var shaderFloat64 VkBool32
  var shaderInt64 VkBool32
  var shaderInt16 VkBool32
  var shaderResourceResidency VkBool32
  var shaderResourceMinLod VkBool32
  var sparseBinding VkBool32
  var sparseResidencyBuffer VkBool32
  var sparseResidencyImage2D VkBool32
  var sparseResidencyImage3D VkBool32
  var sparseResidency2Samples VkBool32
  var sparseResidency4Samples VkBool32
  var sparseResidency8Samples VkBool32
  var sparseResidency16Samples VkBool32
  var sparseResidencyAliased VkBool32
  var variableMultisampleRate VkBool32
  var inheritedQueries VkBool32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkPhysicalDeviceFeatures2 {
  var sType VkStructureType
  var pNext * void
  var features VkPhysicalDeviceFeatures
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkPhysicalDeviceLimits {
  var maxImageDimension1D uint32
  var maxImageDimension2D uint32
  var maxImageDimension3D uint32
  var maxImageDimensionCube uint32
  var maxImageArrayLayers uint32
  var maxTexelBufferElements uint32
  var maxUniformBufferRange uint32
  var maxStorageBufferRange uint32
  var maxPushConstantsSize uint32
  var maxMemoryAllocationCount uint32
  var maxSamplerAllocationCount uint32
  var bufferImageGranularity VkDeviceSize
  var sparseAddressSpaceSize VkDeviceSize
  var maxBoundDescriptorSets uint32
  var maxPerStageDescriptorSamplers uint32
  var maxPerStageDescriptorUniformBuffers uint32
  var maxPerStageDescriptorStorageBuffers uint32
  var maxPerStageDescriptorSampledImages uint32
  var maxPerStageDescriptorStorageImages uint32
  var maxPerStageDescriptorInputAttachments uint32
  var maxPerStageResources uint32
  var maxDescriptorSetSamplers uint32
  var maxDescriptorSetUniformBuffers uint32
  var maxDescriptorSetUniformBuffersDynamic uint32
  var maxDescriptorSetStorageBuffers uint32
  var maxDescriptorSetStorageBuffersDynamic uint32
  var maxDescriptorSetSampledImages uint32
  var maxDescriptorSetStorageImages uint32
  var maxDescriptorSetInputAttachments uint32
  var maxVertexInputAttributes uint32
  var maxVertexInputBindings uint32
  var maxVertexInputAttributeOffset uint32
  var maxVertexInputBindingStride uint32
  var maxVertexOutputComponents uint32
  var maxTessellationGenerationLevel uint32
  var maxTessellationPatchSize uint32
  var maxTessellationControlPerVertexInputComponents uint32
  var maxTessellationControlPerVertexOutputComponents uint32
  var maxTessellationControlPerPatchOutputComponents uint32
  var maxTessellationControlTotalOutputComponents uint32
  var maxTessellationEvaluationInputComponents uint32
  var maxTessellationEvaluationOutputComponents uint32
  var maxGeometryShaderInvocations uint32
  var maxGeometryInputComponents uint32
  var maxGeometryOutputComponents uint32
  var maxGeometryOutputVertices uint32
  var maxGeometryTotalOutputComponents uint32
  var maxFragmentInputComponents uint32
  var maxFragmentOutputAttachments uint32
  var maxFragmentDualSrcAttachments uint32
  var maxFragmentCombinedOutputResources uint32
  var maxComputeSharedMemorySize uint32
  fixed maxComputeWorkGroupCount[3]uint32
  var maxComputeWorkGroupInvocations uint32
  fixed maxComputeWorkGroupSize[3]uint32
  var subPixelPrecisionBits uint32
  var subTexelPrecisionBits uint32
  var mipmapPrecisionBits uint32
  var maxDrawIndexedIndexValue uint32
  var maxDrawIndirectCount uint32
  var maxSamplerLodBias float32
  var maxSamplerAnisotropy float32
  var maxViewports uint32
  fixed maxViewportDimensions[2]uint32
  fixed viewportBoundsRange[2]float32
  var viewportSubPixelBits uint32
  var minMemoryMapAlignment nuint
  var minTexelBufferOffsetAlignment VkDeviceSize
  var minUniformBufferOffsetAlignment VkDeviceSize
  var minStorageBufferOffsetAlignment VkDeviceSize
  var minTexelOffset int32
  var maxTexelOffset uint32
  var minTexelGatherOffset int32
  var maxTexelGatherOffset uint32
  var minInterpolationOffset float32
  var maxInterpolationOffset float32
  var subPixelInterpolationOffsetBits uint32
  var maxFramebufferWidth uint32
  var maxFramebufferHeight uint32
  var maxFramebufferLayers uint32
  var framebufferColorSampleCounts VkSampleCountFlags
  var framebufferDepthSampleCounts VkSampleCountFlags
  var framebufferStencilSampleCounts VkSampleCountFlags
  var framebufferNoAttachmentsSampleCounts VkSampleCountFlags
  var maxColorAttachments uint32
  var sampledImageColorSampleCounts VkSampleCountFlags
  var sampledImageIntegerSampleCounts VkSampleCountFlags
  var sampledImageDepthSampleCounts VkSampleCountFlags
  var sampledImageStencilSampleCounts VkSampleCountFlags
  var storageImageSampleCounts VkSampleCountFlags
  var maxSampleMaskWords uint32
  var timestampComputeAndGraphics VkBool32
  var timestampPeriod float32
  var maxClipDistances uint32
  var maxCullDistances uint32
  var maxCombinedClipAndCullDistances uint32
  var discreteQueuePriorities uint32
  fixed pointSizeRange[2]float32
  fixed lineWidthRange[2]float32
  var pointSizeGranularity float32
  var lineWidthGranularity float32
  var strictLines VkBool32
  var standardSampleLocations VkBool32
  var optimalBufferCopyOffsetAlignment VkDeviceSize
  var optimalBufferCopyRowPitchAlignment VkDeviceSize
  var nonCoherentAtomSize VkDeviceSize
}
