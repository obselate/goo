package Goo

import System
import System.Runtime.InteropServices

internal type VkAccessFlagBits2 = uint64
internal type VkFlags64 = uint64
internal type VkAccessFlags2 = VkFlags64
internal type VkAttachmentLoadOp = int32
internal type VkAttachmentStoreOp = int32
internal type VkBlendFactor = int32
internal type VkBlendOp = int32
internal type VkBool32 = uint32
internal type VkBorderColor = int32
internal type VkFlags = uint32
internal type VkBufferCreateFlags = VkFlags
internal type VkBufferUsageFlagBits = int32
internal type VkBufferUsageFlags = VkFlags
internal type VkBufferViewCreateFlags = VkFlags
internal type VkColorComponentFlagBits = int32
internal type VkColorComponentFlags = VkFlags
internal type VkColorSpaceKHR = int32
internal type VkCommandBufferLevel = int32
internal type VkCommandBufferResetFlags = VkFlags
internal type VkCommandBufferUsageFlagBits = int32
internal type VkCommandBufferUsageFlags = VkFlags
internal type VkCommandPoolCreateFlagBits = int32
internal type VkCommandPoolCreateFlags = VkFlags
internal type VkCompareOp = int32
internal type VkComponentSwizzle = int32
internal type VkCompositeAlphaFlagBitsKHR = int32
internal type VkCompositeAlphaFlagsKHR = VkFlags
internal type VkCullModeFlagBits = int32
internal type VkCullModeFlags = VkFlags
internal type VkDebugUtilsMessageSeverityFlagBitsEXT = int32
internal type VkDebugUtilsMessageSeverityFlagsEXT = VkFlags
internal type VkDebugUtilsMessageTypeFlagBitsEXT = int32
internal type VkDebugUtilsMessageTypeFlagsEXT = VkFlags
internal type VkDebugUtilsMessengerCallbackDataFlagsEXT = VkFlags
internal type VkDebugUtilsMessengerCreateFlagsEXT = VkFlags
internal type VkDependencyFlags = VkFlags
internal type VkDescriptorPoolCreateFlags = VkFlags
internal type VkDescriptorSetLayoutCreateFlags = VkFlags
internal type VkDescriptorType = int32
internal type VkDeviceCreateFlags = VkFlags
internal type VkDeviceQueueCreateFlags = VkFlags
internal type VkDeviceSize = uint64
internal type VkDirectDriverLoadingFlagsLUNARG = VkFlags
internal type VkDirectDriverLoadingModeLUNARG = int32
internal type VkWin32SurfaceCreateFlagsKHR = VkFlags
internal type VkDynamicState = int32
internal type VkFenceCreateFlags = VkFlags
internal type VkFilter = int32
internal type VkFormat = int32
internal type VkFormatFeatureFlagBits = int32
internal type VkFormatFeatureFlags = VkFlags
internal type VkFrontFace = int32
internal type VkImageAspectFlagBits = int32
internal type VkImageAspectFlags = VkFlags
internal type VkImageCreateFlags = VkFlags
internal type VkImageLayout = int32
internal type VkImageTiling = int32
internal type VkImageType = int32
internal type VkImageUsageFlagBits = int32
internal type VkImageUsageFlags = VkFlags
internal type VkImageViewCreateFlags = VkFlags
internal type VkImageViewType = int32
internal type VkInstanceCreateFlagBits = int32
internal type VkInstanceCreateFlags = VkFlags
internal type VkInternalAllocationType = int32
internal type VkLogicOp = int32
internal type VkMemoryHeapFlags = VkFlags
internal type VkMemoryMapFlags = VkFlags
internal type VkMemoryPropertyFlagBits = int32
internal type VkMemoryPropertyFlags = VkFlags
internal type VkObjectType = int32
internal type VkPhysicalDeviceType = int32
internal type VkPipelineBindPoint = int32
internal type VkPipelineCacheCreateFlags = VkFlags
internal type VkPipelineColorBlendStateCreateFlags = VkFlags
internal type VkPipelineCreateFlags = VkFlags
internal type VkPipelineDepthStencilStateCreateFlags = VkFlags
internal type VkPipelineDynamicStateCreateFlags = VkFlags
internal type VkPipelineInputAssemblyStateCreateFlags = VkFlags
internal type VkPipelineLayoutCreateFlags = VkFlags
internal type VkPipelineMultisampleStateCreateFlags = VkFlags
internal type VkPipelineRasterizationStateCreateFlags = VkFlags
internal type VkPipelineShaderStageCreateFlags = VkFlags
internal type VkPipelineStageFlagBits2 = uint64
internal type VkPipelineStageFlags2 = VkFlags64
internal type VkPipelineTessellationStateCreateFlags = VkFlags
internal type VkPipelineVertexInputStateCreateFlags = VkFlags
internal type VkPipelineViewportStateCreateFlags = VkFlags
internal type VkPolygonMode = int32
internal type VkPresentModeKHR = int32
internal type VkPrimitiveTopology = int32
internal type VkQueryControlFlags = VkFlags
internal type VkQueryPipelineStatisticFlags = VkFlags
internal type VkQueryPoolCreateFlags = VkFlags
internal type VkQueryResultFlagBits = int32
internal type VkQueryResultFlags = VkFlags
internal type VkQueryType = int32
internal type VkQueueFlagBits = int32
internal type VkQueueFlags = VkFlags
internal type VkRenderingFlags = VkFlags
internal type VkResolveModeFlagBits = int32
internal type VkResult = int32
internal type VkSampleCountFlagBits = int32
internal type VkSampleCountFlags = VkFlags
internal type VkSampleMask = uint32
internal type VkSamplerAddressMode = int32
internal type VkSamplerCreateFlags = VkFlags
internal type VkSamplerMipmapMode = int32
internal type VkSemaphoreCreateFlags = VkFlags
internal type VkSemaphoreType = int32
internal type VkSemaphoreWaitFlags = VkFlags
internal type VkShaderModuleCreateFlags = VkFlags
internal type VkShaderStageFlagBits = int32
internal type VkShaderStageFlags = VkFlags
internal type VkSharingMode = int32
internal type VkStencilOp = int32
internal type VkStructureType = int32
internal type VkSubmitFlags = VkFlags
internal type VkSurfaceTransformFlagBitsKHR = int32
internal type VkSurfaceTransformFlagsKHR = VkFlags
internal type VkSwapchainCreateFlagsKHR = VkFlags
internal type VkSystemAllocationScope = int32
internal type VkVertexInputRate = int32

@StructLayout(LayoutKind.Sequential)
internal struct VkBuffer : IEquatable[VkBuffer] {
    internal let Raw uint64

    internal init(raw uint64) {
        Raw = raw
    }

    internal prop IsNull bool {
        get -> Raw == 0uL
    }

    shared {
        internal let Null VkBuffer = VkBuffer(0uL)
    }

    public func Equals(other VkBuffer) bool -> Raw == other.Raw

    public override func Equals(other object?) bool -> other is VkBuffer && Equals(other)

    public override func GetHashCode() int32 -> Raw.GetHashCode()
}

internal func (left VkBuffer) operator == (right VkBuffer) bool -> left.Raw == right.Raw
internal func (left VkBuffer) operator != (right VkBuffer) bool -> left.Raw != right.Raw
internal func operator explicit(value VkBuffer) uint64 -> value.Raw

@StructLayout(LayoutKind.Sequential)
internal struct VkBufferView : IEquatable[VkBufferView] {
    internal let Raw uint64

    internal init(raw uint64) {
        Raw = raw
    }

    internal prop IsNull bool {
        get -> Raw == 0uL
    }

    shared {
        internal let Null VkBufferView = VkBufferView(0uL)
    }

    public func Equals(other VkBufferView) bool -> Raw == other.Raw

    public override func Equals(other object?) bool -> other is VkBufferView && Equals(other)

    public override func GetHashCode() int32 -> Raw.GetHashCode()
}

internal func (left VkBufferView) operator == (right VkBufferView) bool -> left.Raw == right.Raw
internal func (left VkBufferView) operator != (right VkBufferView) bool -> left.Raw != right.Raw
internal func operator explicit(value VkBufferView) uint64 -> value.Raw

@StructLayout(LayoutKind.Sequential)
internal struct VkCommandBuffer : IEquatable[VkCommandBuffer] {
    internal let Raw nint

    internal init(raw nint) {
        Raw = raw
    }

    internal prop IsNull bool {
        get -> Raw == nint(0)
    }

    shared {
        internal let Null VkCommandBuffer = VkCommandBuffer(nint(0))
    }

    public func Equals(other VkCommandBuffer) bool -> Raw == other.Raw

    public override func Equals(other object?) bool -> other is VkCommandBuffer && Equals(other)

    public override func GetHashCode() int32 -> Raw.GetHashCode()
}

internal func (left VkCommandBuffer) operator == (right VkCommandBuffer) bool -> left.Raw == right.Raw
internal func (left VkCommandBuffer) operator != (right VkCommandBuffer) bool -> left.Raw != right.Raw
internal func operator explicit(value VkCommandBuffer) nint -> value.Raw
internal func operator explicit(value VkCommandBuffer) uint64 -> uint64(value.Raw)

@StructLayout(LayoutKind.Sequential)
internal struct VkCommandPool : IEquatable[VkCommandPool] {
    internal let Raw uint64

    internal init(raw uint64) {
        Raw = raw
    }

    internal prop IsNull bool {
        get -> Raw == 0uL
    }

    shared {
        internal let Null VkCommandPool = VkCommandPool(0uL)
    }

    public func Equals(other VkCommandPool) bool -> Raw == other.Raw

    public override func Equals(other object?) bool -> other is VkCommandPool && Equals(other)

    public override func GetHashCode() int32 -> Raw.GetHashCode()
}

internal func (left VkCommandPool) operator == (right VkCommandPool) bool -> left.Raw == right.Raw
internal func (left VkCommandPool) operator != (right VkCommandPool) bool -> left.Raw != right.Raw
internal func operator explicit(value VkCommandPool) uint64 -> value.Raw

@StructLayout(LayoutKind.Sequential)
internal struct VkDebugUtilsMessengerEXT : IEquatable[VkDebugUtilsMessengerEXT] {
    internal let Raw uint64

    internal init(raw uint64) {
        Raw = raw
    }

    internal prop IsNull bool {
        get -> Raw == 0uL
    }

    shared {
        internal let Null VkDebugUtilsMessengerEXT = VkDebugUtilsMessengerEXT(0uL)
    }

    public func Equals(other VkDebugUtilsMessengerEXT) bool -> Raw == other.Raw

    public override func Equals(other object?) bool -> other is VkDebugUtilsMessengerEXT && Equals(other)

    public override func GetHashCode() int32 -> Raw.GetHashCode()
}

internal func (left VkDebugUtilsMessengerEXT) operator == (right VkDebugUtilsMessengerEXT) bool -> left.Raw == right.Raw
internal func (left VkDebugUtilsMessengerEXT) operator != (right VkDebugUtilsMessengerEXT) bool -> left.Raw != right.Raw
internal func operator explicit(value VkDebugUtilsMessengerEXT) uint64 -> value.Raw

@StructLayout(LayoutKind.Sequential)
internal struct VkDescriptorPool : IEquatable[VkDescriptorPool] {
    internal let Raw uint64

    internal init(raw uint64) {
        Raw = raw
    }

    internal prop IsNull bool {
        get -> Raw == 0uL
    }

    shared {
        internal let Null VkDescriptorPool = VkDescriptorPool(0uL)
    }

    public func Equals(other VkDescriptorPool) bool -> Raw == other.Raw

    public override func Equals(other object?) bool -> other is VkDescriptorPool && Equals(other)

    public override func GetHashCode() int32 -> Raw.GetHashCode()
}

internal func (left VkDescriptorPool) operator == (right VkDescriptorPool) bool -> left.Raw == right.Raw
internal func (left VkDescriptorPool) operator != (right VkDescriptorPool) bool -> left.Raw != right.Raw
internal func operator explicit(value VkDescriptorPool) uint64 -> value.Raw

@StructLayout(LayoutKind.Sequential)
internal struct VkDescriptorSet : IEquatable[VkDescriptorSet] {
    internal let Raw uint64

    internal init(raw uint64) {
        Raw = raw
    }

    internal prop IsNull bool {
        get -> Raw == 0uL
    }

    shared {
        internal let Null VkDescriptorSet = VkDescriptorSet(0uL)
    }

    public func Equals(other VkDescriptorSet) bool -> Raw == other.Raw

    public override func Equals(other object?) bool -> other is VkDescriptorSet && Equals(other)

    public override func GetHashCode() int32 -> Raw.GetHashCode()
}

internal func (left VkDescriptorSet) operator == (right VkDescriptorSet) bool -> left.Raw == right.Raw
internal func (left VkDescriptorSet) operator != (right VkDescriptorSet) bool -> left.Raw != right.Raw
internal func operator explicit(value VkDescriptorSet) uint64 -> value.Raw

@StructLayout(LayoutKind.Sequential)
internal struct VkDescriptorSetLayout : IEquatable[VkDescriptorSetLayout] {
    internal let Raw uint64

    internal init(raw uint64) {
        Raw = raw
    }

    internal prop IsNull bool {
        get -> Raw == 0uL
    }

    shared {
        internal let Null VkDescriptorSetLayout = VkDescriptorSetLayout(0uL)
    }

    public func Equals(other VkDescriptorSetLayout) bool -> Raw == other.Raw

    public override func Equals(other object?) bool -> other is VkDescriptorSetLayout && Equals(other)

    public override func GetHashCode() int32 -> Raw.GetHashCode()
}

internal func (left VkDescriptorSetLayout) operator == (right VkDescriptorSetLayout) bool -> left.Raw == right.Raw
internal func (left VkDescriptorSetLayout) operator != (right VkDescriptorSetLayout) bool -> left.Raw != right.Raw
internal func operator explicit(value VkDescriptorSetLayout) uint64 -> value.Raw

@StructLayout(LayoutKind.Sequential)
internal struct VkDevice : IEquatable[VkDevice] {
    internal let Raw nint

    internal init(raw nint) {
        Raw = raw
    }

    internal prop IsNull bool {
        get -> Raw == nint(0)
    }

    shared {
        internal let Null VkDevice = VkDevice(nint(0))
    }

    public func Equals(other VkDevice) bool -> Raw == other.Raw

    public override func Equals(other object?) bool -> other is VkDevice && Equals(other)

    public override func GetHashCode() int32 -> Raw.GetHashCode()
}

internal func (left VkDevice) operator == (right VkDevice) bool -> left.Raw == right.Raw
internal func (left VkDevice) operator != (right VkDevice) bool -> left.Raw != right.Raw
internal func operator explicit(value VkDevice) nint -> value.Raw
internal func operator explicit(value VkDevice) uint64 -> uint64(value.Raw)

@StructLayout(LayoutKind.Sequential)
internal struct VkDeviceMemory : IEquatable[VkDeviceMemory] {
    internal let Raw uint64

    internal init(raw uint64) {
        Raw = raw
    }

    internal prop IsNull bool {
        get -> Raw == 0uL
    }

    shared {
        internal let Null VkDeviceMemory = VkDeviceMemory(0uL)
    }

    public func Equals(other VkDeviceMemory) bool -> Raw == other.Raw

    public override func Equals(other object?) bool -> other is VkDeviceMemory && Equals(other)

    public override func GetHashCode() int32 -> Raw.GetHashCode()
}

internal func (left VkDeviceMemory) operator == (right VkDeviceMemory) bool -> left.Raw == right.Raw
internal func (left VkDeviceMemory) operator != (right VkDeviceMemory) bool -> left.Raw != right.Raw
internal func operator explicit(value VkDeviceMemory) uint64 -> value.Raw

@StructLayout(LayoutKind.Sequential)
internal struct VkFence : IEquatable[VkFence] {
    internal let Raw uint64

    internal init(raw uint64) {
        Raw = raw
    }

    internal prop IsNull bool {
        get -> Raw == 0uL
    }

    shared {
        internal let Null VkFence = VkFence(0uL)
    }

    public func Equals(other VkFence) bool -> Raw == other.Raw

    public override func Equals(other object?) bool -> other is VkFence && Equals(other)

    public override func GetHashCode() int32 -> Raw.GetHashCode()
}

internal func (left VkFence) operator == (right VkFence) bool -> left.Raw == right.Raw
internal func (left VkFence) operator != (right VkFence) bool -> left.Raw != right.Raw
internal func operator explicit(value VkFence) uint64 -> value.Raw

@StructLayout(LayoutKind.Sequential)
internal struct VkFramebuffer : IEquatable[VkFramebuffer] {
    internal let Raw uint64

    internal init(raw uint64) {
        Raw = raw
    }

    internal prop IsNull bool {
        get -> Raw == 0uL
    }

    shared {
        internal let Null VkFramebuffer = VkFramebuffer(0uL)
    }

    public func Equals(other VkFramebuffer) bool -> Raw == other.Raw

    public override func Equals(other object?) bool -> other is VkFramebuffer && Equals(other)

    public override func GetHashCode() int32 -> Raw.GetHashCode()
}

internal func (left VkFramebuffer) operator == (right VkFramebuffer) bool -> left.Raw == right.Raw
internal func (left VkFramebuffer) operator != (right VkFramebuffer) bool -> left.Raw != right.Raw
internal func operator explicit(value VkFramebuffer) uint64 -> value.Raw

@StructLayout(LayoutKind.Sequential)
internal struct VkImage : IEquatable[VkImage] {
    internal let Raw uint64

    internal init(raw uint64) {
        Raw = raw
    }

    internal prop IsNull bool {
        get -> Raw == 0uL
    }

    shared {
        internal let Null VkImage = VkImage(0uL)
    }

    public func Equals(other VkImage) bool -> Raw == other.Raw

    public override func Equals(other object?) bool -> other is VkImage && Equals(other)

    public override func GetHashCode() int32 -> Raw.GetHashCode()
}

internal func (left VkImage) operator == (right VkImage) bool -> left.Raw == right.Raw
internal func (left VkImage) operator != (right VkImage) bool -> left.Raw != right.Raw
internal func operator explicit(value VkImage) uint64 -> value.Raw

@StructLayout(LayoutKind.Sequential)
internal struct VkImageView : IEquatable[VkImageView] {
    internal let Raw uint64

    internal init(raw uint64) {
        Raw = raw
    }

    internal prop IsNull bool {
        get -> Raw == 0uL
    }

    shared {
        internal let Null VkImageView = VkImageView(0uL)
    }

    public func Equals(other VkImageView) bool -> Raw == other.Raw

    public override func Equals(other object?) bool -> other is VkImageView && Equals(other)

    public override func GetHashCode() int32 -> Raw.GetHashCode()
}

internal func (left VkImageView) operator == (right VkImageView) bool -> left.Raw == right.Raw
internal func (left VkImageView) operator != (right VkImageView) bool -> left.Raw != right.Raw
internal func operator explicit(value VkImageView) uint64 -> value.Raw

@StructLayout(LayoutKind.Sequential)
internal struct VkInstance : IEquatable[VkInstance] {
    internal let Raw nint

    internal init(raw nint) {
        Raw = raw
    }

    internal prop IsNull bool {
        get -> Raw == nint(0)
    }

    shared {
        internal let Null VkInstance = VkInstance(nint(0))
    }

    public func Equals(other VkInstance) bool -> Raw == other.Raw

    public override func Equals(other object?) bool -> other is VkInstance && Equals(other)

    public override func GetHashCode() int32 -> Raw.GetHashCode()
}

internal func (left VkInstance) operator == (right VkInstance) bool -> left.Raw == right.Raw
internal func (left VkInstance) operator != (right VkInstance) bool -> left.Raw != right.Raw
internal func operator explicit(value VkInstance) nint -> value.Raw
internal func operator explicit(value VkInstance) uint64 -> uint64(value.Raw)

@StructLayout(LayoutKind.Sequential)
internal struct VkPhysicalDevice : IEquatable[VkPhysicalDevice] {
    internal let Raw nint

    internal init(raw nint) {
        Raw = raw
    }

    internal prop IsNull bool {
        get -> Raw == nint(0)
    }

    shared {
        internal let Null VkPhysicalDevice = VkPhysicalDevice(nint(0))
    }

    public func Equals(other VkPhysicalDevice) bool -> Raw == other.Raw

    public override func Equals(other object?) bool -> other is VkPhysicalDevice && Equals(other)

    public override func GetHashCode() int32 -> Raw.GetHashCode()
}

internal func (left VkPhysicalDevice) operator == (right VkPhysicalDevice) bool -> left.Raw == right.Raw
internal func (left VkPhysicalDevice) operator != (right VkPhysicalDevice) bool -> left.Raw != right.Raw
internal func operator explicit(value VkPhysicalDevice) nint -> value.Raw
internal func operator explicit(value VkPhysicalDevice) uint64 -> uint64(value.Raw)

@StructLayout(LayoutKind.Sequential)
internal struct VkPipeline : IEquatable[VkPipeline] {
    internal let Raw uint64

    internal init(raw uint64) {
        Raw = raw
    }

    internal prop IsNull bool {
        get -> Raw == 0uL
    }

    shared {
        internal let Null VkPipeline = VkPipeline(0uL)
    }

    public func Equals(other VkPipeline) bool -> Raw == other.Raw

    public override func Equals(other object?) bool -> other is VkPipeline && Equals(other)

    public override func GetHashCode() int32 -> Raw.GetHashCode()
}

internal func (left VkPipeline) operator == (right VkPipeline) bool -> left.Raw == right.Raw
internal func (left VkPipeline) operator != (right VkPipeline) bool -> left.Raw != right.Raw
internal func operator explicit(value VkPipeline) uint64 -> value.Raw

@StructLayout(LayoutKind.Sequential)
internal struct VkPipelineCache : IEquatable[VkPipelineCache] {
    internal let Raw uint64

    internal init(raw uint64) {
        Raw = raw
    }

    internal prop IsNull bool {
        get -> Raw == 0uL
    }

    shared {
        internal let Null VkPipelineCache = VkPipelineCache(0uL)
    }

    public func Equals(other VkPipelineCache) bool -> Raw == other.Raw

    public override func Equals(other object?) bool -> other is VkPipelineCache && Equals(other)

    public override func GetHashCode() int32 -> Raw.GetHashCode()
}

internal func (left VkPipelineCache) operator == (right VkPipelineCache) bool -> left.Raw == right.Raw
internal func (left VkPipelineCache) operator != (right VkPipelineCache) bool -> left.Raw != right.Raw
internal func operator explicit(value VkPipelineCache) uint64 -> value.Raw

@StructLayout(LayoutKind.Sequential)
internal struct VkPipelineLayout : IEquatable[VkPipelineLayout] {
    internal let Raw uint64

    internal init(raw uint64) {
        Raw = raw
    }

    internal prop IsNull bool {
        get -> Raw == 0uL
    }

    shared {
        internal let Null VkPipelineLayout = VkPipelineLayout(0uL)
    }

    public func Equals(other VkPipelineLayout) bool -> Raw == other.Raw

    public override func Equals(other object?) bool -> other is VkPipelineLayout && Equals(other)

    public override func GetHashCode() int32 -> Raw.GetHashCode()
}

internal func (left VkPipelineLayout) operator == (right VkPipelineLayout) bool -> left.Raw == right.Raw
internal func (left VkPipelineLayout) operator != (right VkPipelineLayout) bool -> left.Raw != right.Raw
internal func operator explicit(value VkPipelineLayout) uint64 -> value.Raw

@StructLayout(LayoutKind.Sequential)
internal struct VkQueryPool : IEquatable[VkQueryPool] {
    internal let Raw uint64

    internal init(raw uint64) {
        Raw = raw
    }

    internal prop IsNull bool {
        get -> Raw == 0uL
    }

    shared {
        internal let Null VkQueryPool = VkQueryPool(0uL)
    }

    public func Equals(other VkQueryPool) bool -> Raw == other.Raw

    public override func Equals(other object?) bool -> other is VkQueryPool && Equals(other)

    public override func GetHashCode() int32 -> Raw.GetHashCode()
}

internal func (left VkQueryPool) operator == (right VkQueryPool) bool -> left.Raw == right.Raw
internal func (left VkQueryPool) operator != (right VkQueryPool) bool -> left.Raw != right.Raw
internal func operator explicit(value VkQueryPool) uint64 -> value.Raw

@StructLayout(LayoutKind.Sequential)
internal struct VkQueue : IEquatable[VkQueue] {
    internal let Raw nint

    internal init(raw nint) {
        Raw = raw
    }

    internal prop IsNull bool {
        get -> Raw == nint(0)
    }

    shared {
        internal let Null VkQueue = VkQueue(nint(0))
    }

    public func Equals(other VkQueue) bool -> Raw == other.Raw

    public override func Equals(other object?) bool -> other is VkQueue && Equals(other)

    public override func GetHashCode() int32 -> Raw.GetHashCode()
}

internal func (left VkQueue) operator == (right VkQueue) bool -> left.Raw == right.Raw
internal func (left VkQueue) operator != (right VkQueue) bool -> left.Raw != right.Raw
internal func operator explicit(value VkQueue) nint -> value.Raw
internal func operator explicit(value VkQueue) uint64 -> uint64(value.Raw)

@StructLayout(LayoutKind.Sequential)
internal struct VkRenderPass : IEquatable[VkRenderPass] {
    internal let Raw uint64

    internal init(raw uint64) {
        Raw = raw
    }

    internal prop IsNull bool {
        get -> Raw == 0uL
    }

    shared {
        internal let Null VkRenderPass = VkRenderPass(0uL)
    }

    public func Equals(other VkRenderPass) bool -> Raw == other.Raw

    public override func Equals(other object?) bool -> other is VkRenderPass && Equals(other)

    public override func GetHashCode() int32 -> Raw.GetHashCode()
}

internal func (left VkRenderPass) operator == (right VkRenderPass) bool -> left.Raw == right.Raw
internal func (left VkRenderPass) operator != (right VkRenderPass) bool -> left.Raw != right.Raw
internal func operator explicit(value VkRenderPass) uint64 -> value.Raw

@StructLayout(LayoutKind.Sequential)
internal struct VkSampler : IEquatable[VkSampler] {
    internal let Raw uint64

    internal init(raw uint64) {
        Raw = raw
    }

    internal prop IsNull bool {
        get -> Raw == 0uL
    }

    shared {
        internal let Null VkSampler = VkSampler(0uL)
    }

    public func Equals(other VkSampler) bool -> Raw == other.Raw

    public override func Equals(other object?) bool -> other is VkSampler && Equals(other)

    public override func GetHashCode() int32 -> Raw.GetHashCode()
}

internal func (left VkSampler) operator == (right VkSampler) bool -> left.Raw == right.Raw
internal func (left VkSampler) operator != (right VkSampler) bool -> left.Raw != right.Raw
internal func operator explicit(value VkSampler) uint64 -> value.Raw

@StructLayout(LayoutKind.Sequential)
internal struct VkSemaphore : IEquatable[VkSemaphore] {
    internal let Raw uint64

    internal init(raw uint64) {
        Raw = raw
    }

    internal prop IsNull bool {
        get -> Raw == 0uL
    }

    shared {
        internal let Null VkSemaphore = VkSemaphore(0uL)
    }

    public func Equals(other VkSemaphore) bool -> Raw == other.Raw

    public override func Equals(other object?) bool -> other is VkSemaphore && Equals(other)

    public override func GetHashCode() int32 -> Raw.GetHashCode()
}

internal func (left VkSemaphore) operator == (right VkSemaphore) bool -> left.Raw == right.Raw
internal func (left VkSemaphore) operator != (right VkSemaphore) bool -> left.Raw != right.Raw
internal func operator explicit(value VkSemaphore) uint64 -> value.Raw

@StructLayout(LayoutKind.Sequential)
internal struct VkShaderModule : IEquatable[VkShaderModule] {
    internal let Raw uint64

    internal init(raw uint64) {
        Raw = raw
    }

    internal prop IsNull bool {
        get -> Raw == 0uL
    }

    shared {
        internal let Null VkShaderModule = VkShaderModule(0uL)
    }

    public func Equals(other VkShaderModule) bool -> Raw == other.Raw

    public override func Equals(other object?) bool -> other is VkShaderModule && Equals(other)

    public override func GetHashCode() int32 -> Raw.GetHashCode()
}

internal func (left VkShaderModule) operator == (right VkShaderModule) bool -> left.Raw == right.Raw
internal func (left VkShaderModule) operator != (right VkShaderModule) bool -> left.Raw != right.Raw
internal func operator explicit(value VkShaderModule) uint64 -> value.Raw

@StructLayout(LayoutKind.Sequential)
internal struct VkSurfaceKHR : IEquatable[VkSurfaceKHR] {
    internal let Raw uint64

    internal init(raw uint64) {
        Raw = raw
    }

    internal prop IsNull bool {
        get -> Raw == 0uL
    }

    shared {
        internal let Null VkSurfaceKHR = VkSurfaceKHR(0uL)
    }

    public func Equals(other VkSurfaceKHR) bool -> Raw == other.Raw

    public override func Equals(other object?) bool -> other is VkSurfaceKHR && Equals(other)

    public override func GetHashCode() int32 -> Raw.GetHashCode()
}

internal func (left VkSurfaceKHR) operator == (right VkSurfaceKHR) bool -> left.Raw == right.Raw
internal func (left VkSurfaceKHR) operator != (right VkSurfaceKHR) bool -> left.Raw != right.Raw
internal func operator explicit(value VkSurfaceKHR) uint64 -> value.Raw

@StructLayout(LayoutKind.Sequential)
internal struct VkSwapchainKHR : IEquatable[VkSwapchainKHR] {
    internal let Raw uint64

    internal init(raw uint64) {
        Raw = raw
    }

    internal prop IsNull bool {
        get -> Raw == 0uL
    }

    shared {
        internal let Null VkSwapchainKHR = VkSwapchainKHR(0uL)
    }

    public func Equals(other VkSwapchainKHR) bool -> Raw == other.Raw

    public override func Equals(other object?) bool -> other is VkSwapchainKHR && Equals(other)

    public override func GetHashCode() int32 -> Raw.GetHashCode()
}

internal func (left VkSwapchainKHR) operator == (right VkSwapchainKHR) bool -> left.Raw == right.Raw
internal func (left VkSwapchainKHR) operator != (right VkSwapchainKHR) bool -> left.Raw != right.Raw
internal func operator explicit(value VkSwapchainKHR) uint64 -> value.Raw
