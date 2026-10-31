package Goo

import System.Runtime.InteropServices

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkPhysicalDeviceMemoryProperties {
  var memoryTypeCount uint32
  var memoryTypes_0 VkMemoryType
  var memoryTypes_1 VkMemoryType
  var memoryTypes_2 VkMemoryType
  var memoryTypes_3 VkMemoryType
  var memoryTypes_4 VkMemoryType
  var memoryTypes_5 VkMemoryType
  var memoryTypes_6 VkMemoryType
  var memoryTypes_7 VkMemoryType
  var memoryTypes_8 VkMemoryType
  var memoryTypes_9 VkMemoryType
  var memoryTypes_10 VkMemoryType
  var memoryTypes_11 VkMemoryType
  var memoryTypes_12 VkMemoryType
  var memoryTypes_13 VkMemoryType
  var memoryTypes_14 VkMemoryType
  var memoryTypes_15 VkMemoryType
  var memoryTypes_16 VkMemoryType
  var memoryTypes_17 VkMemoryType
  var memoryTypes_18 VkMemoryType
  var memoryTypes_19 VkMemoryType
  var memoryTypes_20 VkMemoryType
  var memoryTypes_21 VkMemoryType
  var memoryTypes_22 VkMemoryType
  var memoryTypes_23 VkMemoryType
  var memoryTypes_24 VkMemoryType
  var memoryTypes_25 VkMemoryType
  var memoryTypes_26 VkMemoryType
  var memoryTypes_27 VkMemoryType
  var memoryTypes_28 VkMemoryType
  var memoryTypes_29 VkMemoryType
  var memoryTypes_30 VkMemoryType
  var memoryTypes_31 VkMemoryType
  var memoryHeapCount uint32
  var memoryHeaps_0 VkMemoryHeap
  var memoryHeaps_1 VkMemoryHeap
  var memoryHeaps_2 VkMemoryHeap
  var memoryHeaps_3 VkMemoryHeap
  var memoryHeaps_4 VkMemoryHeap
  var memoryHeaps_5 VkMemoryHeap
  var memoryHeaps_6 VkMemoryHeap
  var memoryHeaps_7 VkMemoryHeap
  var memoryHeaps_8 VkMemoryHeap
  var memoryHeaps_9 VkMemoryHeap
  var memoryHeaps_10 VkMemoryHeap
  var memoryHeaps_11 VkMemoryHeap
  var memoryHeaps_12 VkMemoryHeap
  var memoryHeaps_13 VkMemoryHeap
  var memoryHeaps_14 VkMemoryHeap
  var memoryHeaps_15 VkMemoryHeap
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkPhysicalDeviceMemoryProperties2 {
  var sType VkStructureType
  var pNext * void
  var memoryProperties VkPhysicalDeviceMemoryProperties
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkPhysicalDeviceMemoryBudgetPropertiesEXT {
  var sType VkStructureType
  var pNext * void
  fixed heapBudget[16]VkDeviceSize
  fixed heapUsage[16]VkDeviceSize
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkPhysicalDeviceProperties {
  var apiVersion uint32
  var driverVersion uint32
  var vendorID uint32
  var deviceID uint32
  var deviceType VkPhysicalDeviceType
  fixed deviceName[256]int8
  fixed pipelineCacheUUID[16]uint8
  var limits VkPhysicalDeviceLimits
  var sparseProperties VkPhysicalDeviceSparseProperties
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkPhysicalDeviceSparseProperties {
  var residencyStandard2DBlockShape VkBool32
  var residencyStandard2DMultisampleBlockShape VkBool32
  var residencyStandard3DBlockShape VkBool32
  var residencyAlignedMipSize VkBool32
  var residencyNonResidentStrict VkBool32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkPhysicalDeviceSwapchainMaintenance1FeaturesEXT {
  var sType VkStructureType
  var pNext * void
  var swapchainMaintenance1 VkBool32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkPhysicalDeviceVulkan12Features {
  var sType VkStructureType
  var pNext * void
  var samplerMirrorClampToEdge VkBool32
  var drawIndirectCount VkBool32
  var storageBuffer8BitAccess VkBool32
  var uniformAndStorageBuffer8BitAccess VkBool32
  var storagePushConstant8 VkBool32
  var shaderBufferInt64Atomics VkBool32
  var shaderSharedInt64Atomics VkBool32
  var shaderFloat16 VkBool32
  var shaderInt8 VkBool32
  var descriptorIndexing VkBool32
  var shaderInputAttachmentArrayDynamicIndexing VkBool32
  var shaderUniformTexelBufferArrayDynamicIndexing VkBool32
  var shaderStorageTexelBufferArrayDynamicIndexing VkBool32
  var shaderUniformBufferArrayNonUniformIndexing VkBool32
  var shaderSampledImageArrayNonUniformIndexing VkBool32
  var shaderStorageBufferArrayNonUniformIndexing VkBool32
  var shaderStorageImageArrayNonUniformIndexing VkBool32
  var shaderInputAttachmentArrayNonUniformIndexing VkBool32
  var shaderUniformTexelBufferArrayNonUniformIndexing VkBool32
  var shaderStorageTexelBufferArrayNonUniformIndexing VkBool32
  var descriptorBindingUniformBufferUpdateAfterBind VkBool32
  var descriptorBindingSampledImageUpdateAfterBind VkBool32
  var descriptorBindingStorageImageUpdateAfterBind VkBool32
  var descriptorBindingStorageBufferUpdateAfterBind VkBool32
  var descriptorBindingUniformTexelBufferUpdateAfterBind VkBool32
  var descriptorBindingStorageTexelBufferUpdateAfterBind VkBool32
  var descriptorBindingUpdateUnusedWhilePending VkBool32
  var descriptorBindingPartiallyBound VkBool32
  var descriptorBindingVariableDescriptorCount VkBool32
  var runtimeDescriptorArray VkBool32
  var samplerFilterMinmax VkBool32
  var scalarBlockLayout VkBool32
  var imagelessFramebuffer VkBool32
  var uniformBufferStandardLayout VkBool32
  var shaderSubgroupExtendedTypes VkBool32
  var separateDepthStencilLayouts VkBool32
  var hostQueryReset VkBool32
  var timelineSemaphore VkBool32
  var bufferDeviceAddress VkBool32
  var bufferDeviceAddressCaptureReplay VkBool32
  var bufferDeviceAddressMultiDevice VkBool32
  var vulkanMemoryModel VkBool32
  var vulkanMemoryModelDeviceScope VkBool32
  var vulkanMemoryModelAvailabilityVisibilityChains VkBool32
  var shaderOutputViewportIndex VkBool32
  var shaderOutputLayer VkBool32
  var subgroupBroadcastDynamicId VkBool32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkPhysicalDeviceVulkan13Features {
  var sType VkStructureType
  var pNext * void
  var robustImageAccess VkBool32
  var inlineUniformBlock VkBool32
  var descriptorBindingInlineUniformBlockUpdateAfterBind VkBool32
  var pipelineCreationCacheControl VkBool32
  var privateData VkBool32
  var shaderDemoteToHelperInvocation VkBool32
  var shaderTerminateInvocation VkBool32
  var subgroupSizeControl VkBool32
  var computeFullSubgroups VkBool32
  var synchronization2 VkBool32
  var textureCompressionASTC_HDR VkBool32
  var shaderZeroInitializeWorkgroupMemory VkBool32
  var dynamicRendering VkBool32
  var shaderIntegerDotProduct VkBool32
  var maintenance4 VkBool32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkPipelineColorBlendAttachmentState {
  var blendEnable VkBool32
  var srcColorBlendFactor VkBlendFactor
  var dstColorBlendFactor VkBlendFactor
  var colorBlendOp VkBlendOp
  var srcAlphaBlendFactor VkBlendFactor
  var dstAlphaBlendFactor VkBlendFactor
  var alphaBlendOp VkBlendOp
  var colorWriteMask VkColorComponentFlags
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkPipelineColorBlendStateCreateInfo {
  var sType VkStructureType
  var pNext * void
  var flags VkPipelineColorBlendStateCreateFlags
  var logicOpEnable VkBool32
  var logicOp VkLogicOp
  var attachmentCount uint32
  var pAttachments * VkPipelineColorBlendAttachmentState
  fixed blendConstants[4]float32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkPipelineDepthStencilStateCreateInfo {
  var sType VkStructureType
  var pNext * void
  var flags VkPipelineDepthStencilStateCreateFlags
  var depthTestEnable VkBool32
  var depthWriteEnable VkBool32
  var depthCompareOp VkCompareOp
  var depthBoundsTestEnable VkBool32
  var stencilTestEnable VkBool32
  var front VkStencilOpState
  var back VkStencilOpState
  var minDepthBounds float32
  var maxDepthBounds float32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkPipelineDynamicStateCreateInfo {
  var sType VkStructureType
  var pNext * void
  var flags VkPipelineDynamicStateCreateFlags
  var dynamicStateCount uint32
  var pDynamicStates * VkDynamicState
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkPipelineInputAssemblyStateCreateInfo {
  var sType VkStructureType
  var pNext * void
  var flags VkPipelineInputAssemblyStateCreateFlags
  var topology VkPrimitiveTopology
  var primitiveRestartEnable VkBool32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkPipelineLayoutCreateInfo {
  var sType VkStructureType
  var pNext * void
  var flags VkPipelineLayoutCreateFlags
  var setLayoutCount uint32
  var pSetLayouts * VkDescriptorSetLayout
  var pushConstantRangeCount uint32
  var pPushConstantRanges * VkPushConstantRange
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkPipelineMultisampleStateCreateInfo {
  var sType VkStructureType
  var pNext * void
  var flags VkPipelineMultisampleStateCreateFlags
  var rasterizationSamples VkSampleCountFlagBits
  var sampleShadingEnable VkBool32
  var minSampleShading float32
  var pSampleMask * VkSampleMask
  var alphaToCoverageEnable VkBool32
  var alphaToOneEnable VkBool32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkPipelineRasterizationStateCreateInfo {
  var sType VkStructureType
  var pNext * void
  var flags VkPipelineRasterizationStateCreateFlags
  var depthClampEnable VkBool32
  var rasterizerDiscardEnable VkBool32
  var polygonMode VkPolygonMode
  var cullMode VkCullModeFlags
  var frontFace VkFrontFace
  var depthBiasEnable VkBool32
  var depthBiasConstantFactor float32
  var depthBiasClamp float32
  var depthBiasSlopeFactor float32
  var lineWidth float32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkPipelineRenderingCreateInfo {
  var sType VkStructureType
  var pNext * void
  var viewMask uint32
  var colorAttachmentCount uint32
  var pColorAttachmentFormats * VkFormat
  var depthAttachmentFormat VkFormat
  var stencilAttachmentFormat VkFormat
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkPipelineShaderStageCreateInfo {
  var sType VkStructureType
  var pNext * void
  var flags VkPipelineShaderStageCreateFlags
  var stage VkShaderStageFlagBits
  var module VkShaderModule
  var pName * int8
  var pSpecializationInfo * VkSpecializationInfo
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkPipelineTessellationStateCreateInfo {
  var sType VkStructureType
  var pNext * void
  var flags VkPipelineTessellationStateCreateFlags
  var patchControlPoints uint32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkPipelineVertexInputStateCreateInfo {
  var sType VkStructureType
  var pNext * void
  var flags VkPipelineVertexInputStateCreateFlags
  var vertexBindingDescriptionCount uint32
  var pVertexBindingDescriptions * VkVertexInputBindingDescription
  var vertexAttributeDescriptionCount uint32
  var pVertexAttributeDescriptions * VkVertexInputAttributeDescription
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkPipelineViewportStateCreateInfo {
  var sType VkStructureType
  var pNext * void
  var flags VkPipelineViewportStateCreateFlags
  var viewportCount uint32
  var pViewports * VkViewport
  var scissorCount uint32
  var pScissors * VkRect2D
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkPresentInfoKHR {
  var sType VkStructureType
  var pNext * void
  var waitSemaphoreCount uint32
  var pWaitSemaphores * VkSemaphore
  var swapchainCount uint32
  var pSwapchains * VkSwapchainKHR
  var pImageIndices * uint32
  var pResults * VkResult
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkPushConstantRange {
  var stageFlags VkShaderStageFlags
  var offset uint32
  var size uint32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkQueryPoolCreateInfo {
  var sType VkStructureType
  var pNext * void
  var flags VkQueryPoolCreateFlags
  var queryType VkQueryType
  var queryCount uint32
  var pipelineStatistics VkQueryPipelineStatisticFlags
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkQueueFamilyProperties {
  var queueFlags VkQueueFlags
  var queueCount uint32
  var timestampValidBits uint32
  var minImageTransferGranularity VkExtent3D
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkRect2D {
  var offset VkOffset2D
  var extent VkExtent2D
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkRenderingAttachmentInfo {
  var sType VkStructureType
  var pNext * void
  var imageView VkImageView
  var imageLayout VkImageLayout
  var resolveMode VkResolveModeFlagBits
  var resolveImageView VkImageView
  var resolveImageLayout VkImageLayout
  var loadOp VkAttachmentLoadOp
  var storeOp VkAttachmentStoreOp
  var clearValue VkClearValue
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkRenderingInfo {
  var sType VkStructureType
  var pNext * void
  var flags VkRenderingFlags
  var renderArea VkRect2D
  var layerCount uint32
  var viewMask uint32
  var colorAttachmentCount uint32
  var pColorAttachments * VkRenderingAttachmentInfo
  var pDepthAttachment * VkRenderingAttachmentInfo
  var pStencilAttachment * VkRenderingAttachmentInfo
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkSamplerCreateInfo {
  var sType VkStructureType
  var pNext * void
  var flags VkSamplerCreateFlags
  var magFilter VkFilter
  var minFilter VkFilter
  var mipmapMode VkSamplerMipmapMode
  var addressModeU VkSamplerAddressMode
  var addressModeV VkSamplerAddressMode
  var addressModeW VkSamplerAddressMode
  var mipLodBias float32
  var anisotropyEnable VkBool32
  var maxAnisotropy float32
  var compareEnable VkBool32
  var compareOp VkCompareOp
  var minLod float32
  var maxLod float32
  var borderColor VkBorderColor
  var unnormalizedCoordinates VkBool32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkSemaphoreCreateInfo {
  var sType VkStructureType
  var pNext * void
  var flags VkSemaphoreCreateFlags
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkSemaphoreSubmitInfo {
  var sType VkStructureType
  var pNext * void
  var semaphore VkSemaphore
  var value uint64
  var stageMask VkPipelineStageFlags2
  var deviceIndex uint32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkSemaphoreTypeCreateInfo {
  var sType VkStructureType
  var pNext * void
  var semaphoreType VkSemaphoreType
  var initialValue uint64
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkSemaphoreWaitInfo {
  var sType VkStructureType
  var pNext * void
  var flags VkSemaphoreWaitFlags
  var semaphoreCount uint32
  var pSemaphores * VkSemaphore
  var pValues * uint64
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkShaderModuleCreateInfo {
  var sType VkStructureType
  var pNext * void
  var flags VkShaderModuleCreateFlags
  var codeSize nuint
  var pCode * uint32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkSpecializationInfo {
  var mapEntryCount uint32
  var pMapEntries * VkSpecializationMapEntry
  var dataSize nuint
  var pData * void
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkSpecializationMapEntry {
  var constantID uint32
  var offset uint32
  var size nuint
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkStencilOpState {
  var failOp VkStencilOp
  var passOp VkStencilOp
  var depthFailOp VkStencilOp
  var compareOp VkCompareOp
  var compareMask uint32
  var writeMask uint32
  var reference uint32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkSubmitInfo2 {
  var sType VkStructureType
  var pNext * void
  var flags VkSubmitFlags
  var waitSemaphoreInfoCount uint32
  var pWaitSemaphoreInfos * VkSemaphoreSubmitInfo
  var commandBufferInfoCount uint32
  var pCommandBufferInfos * VkCommandBufferSubmitInfo
  var signalSemaphoreInfoCount uint32
  var pSignalSemaphoreInfos * VkSemaphoreSubmitInfo
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkSurfaceCapabilitiesKHR {
  var minImageCount uint32
  var maxImageCount uint32
  var currentExtent VkExtent2D
  var minImageExtent VkExtent2D
  var maxImageExtent VkExtent2D
  var maxImageArrayLayers uint32
  var supportedTransforms VkSurfaceTransformFlagsKHR
  var currentTransform VkSurfaceTransformFlagBitsKHR
  var supportedCompositeAlpha VkCompositeAlphaFlagsKHR
  var supportedUsageFlags VkImageUsageFlags
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkSurfaceFormatKHR {
  var format VkFormat
  var colorSpace VkColorSpaceKHR
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkImageFormatListCreateInfo {
  var sType VkStructureType
  var pNext * void
  var viewFormatCount uint32
  var pViewFormats * VkFormat
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkSwapchainCreateInfoKHR {
  var sType VkStructureType
  var pNext * void
  var flags VkSwapchainCreateFlagsKHR
  var surface VkSurfaceKHR
  var minImageCount uint32
  var imageFormat VkFormat
  var imageColorSpace VkColorSpaceKHR
  var imageExtent VkExtent2D
  var imageArrayLayers uint32
  var imageUsage VkImageUsageFlags
  var imageSharingMode VkSharingMode
  var queueFamilyIndexCount uint32
  var pQueueFamilyIndices * uint32
  var preTransform VkSurfaceTransformFlagBitsKHR
  var compositeAlpha VkCompositeAlphaFlagBitsKHR
  var presentMode VkPresentModeKHR
  var clipped VkBool32
  var oldSwapchain VkSwapchainKHR
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkSwapchainPresentFenceInfoEXT {
  var sType VkStructureType
  var pNext * void
  var swapchainCount uint32
  var pFences * VkFence
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkVertexInputAttributeDescription {
  var location uint32
  var binding uint32
  var format VkFormat
  var offset uint32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkVertexInputBindingDescription {
  var binding uint32
  var stride uint32
  var inputRate VkVertexInputRate
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkViewport {
  var x float32
  var y float32
  var width float32
  var height float32
  var minDepth float32
  var maxDepth float32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkWriteDescriptorSet {
  var sType VkStructureType
  var pNext * void
  var dstSet VkDescriptorSet
  var dstBinding uint32
  var dstArrayElement uint32
  var descriptorCount uint32
  var descriptorType VkDescriptorType
  var pImageInfo * VkDescriptorImageInfo
  var pBufferInfo * VkDescriptorBufferInfo
  var pTexelBufferView * VkBufferView
}
