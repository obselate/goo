package Goo

import System

internal unsafe sealed class VulkanAndroidImageNormalization : IDisposable {
    private let source VulkanExternalImage
    internal let Encoding ExternalImageColorEncoding
    internal let AlphaMode ExternalImageAlphaMode
    private var conversion uint64
    private var sampler VkSampler
    private var inputView VkImageView
    private var descriptorLayout VkDescriptorSetLayout
    private var pool VkDescriptorPool
    private var descriptor VkDescriptorSet
    private var pipelineLayout VkPipelineLayout
    private var pipeline VkPipeline
    private var outputAllocation VulkanMemoryAllocation?
    internal var Image VkImage
    internal var View VkImageView

    internal init(image VulkanExternalImage, encoding ExternalImageColorEncoding, alpha ExternalImageAlphaMode) {
        source = image
        Encoding = encoding
        AlphaMode = alpha
        try {
            CreateSampler()
            CreateDescriptors()
            CreatePipeline()
        } catch (error Exception) {
            Dispose()
            throw error
        }
    }

    private func Check(result VkResult, operation string) {
        if result != VkConstants.VK_SUCCESS { throw System.Runtime.InteropServices.ExternalException(operation, int32(result)) }
    }

    private func CreateSampler() {
        let dispatch = source.Runtime.Dispatch
        let device = source.Runtime.Device
        var external = VkExternalFormatANDROID{ sType: 1000129005, externalFormat: source.AndroidFormat.externalFormat }
        var conversionInfo = VkSamplerYcbcrConversionInfo{ sType: 1000156001 }
        if source.Format == 0 {
            var info = VkSamplerYcbcrConversionCreateInfo{ sType: 1000156000,
                pNext: *void(&external),
                ycbcrModel: if Encoding == ExternalImageColorEncoding.AndroidBt709Limited
                    || Encoding == ExternalImageColorEncoding.AndroidBt709Full { 2 } else { 3 },
                ycbcrRange: if int32(Encoding) % 2 == 0 { 1 } else { 0 },
                components: source.AndroidFormat.samplerYcbcrConversionComponents,
                xChromaOffset: source.AndroidFormat.suggestedXChromaOffset,
                yChromaOffset: source.AndroidFormat.suggestedYChromaOffset,
                chromaFilter: VkConstants.VK_FILTER_NEAREST }
            let create = dispatch.vkCreateSamplerYcbcrConversion
            Check(create(device, &info, nil, &conversion), "Android YCbCr conversion creation failed")
            conversionInfo.conversion = conversion
        }
        var samplerInfo = VkSamplerCreateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_SAMPLER_CREATE_INFO,
            pNext: if conversion != 0uL { *void(&conversionInfo) } else { nil },
            magFilter: VkConstants.VK_FILTER_NEAREST, minFilter: VkConstants.VK_FILTER_NEAREST,
            mipmapMode: VkConstants.VK_SAMPLER_MIPMAP_MODE_NEAREST,
            addressModeU: VkConstants.VK_SAMPLER_ADDRESS_MODE_CLAMP_TO_EDGE,
            addressModeV: VkConstants.VK_SAMPLER_ADDRESS_MODE_CLAMP_TO_EDGE,
            addressModeW: VkConstants.VK_SAMPLER_ADDRESS_MODE_CLAMP_TO_EDGE, maxAnisotropy: 1.0F }
        let createSampler = dispatch.vkCreateSampler
        Check(createSampler(device, &samplerInfo, nil, &sampler), "Android sampler creation failed")
        var viewInfo = VkImageViewCreateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_IMAGE_VIEW_CREATE_INFO,
            pNext: if conversion != 0uL { *void(&conversionInfo) } else { nil }, image: source.Image,
            viewType: VkConstants.VK_IMAGE_VIEW_TYPE_2D, format: source.Format,
            subresourceRange: VulkanTransitions.ColorSubresourceRange() }
        let createView = dispatch.vkCreateImageView
        Check(createView(device, &viewInfo, nil, &inputView), "Android image view creation failed")
    }

    private func CreateDescriptors() {
        let dispatch = source.Runtime.Dispatch
        let device = source.Runtime.Device
        var binding = VkDescriptorSetLayoutBinding{ binding: 0u,
            descriptorType: VkConstants.VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER, descriptorCount: 1u,
            stageFlags: uint32(VkConstants.VK_SHADER_STAGE_FRAGMENT_BIT), pImmutableSamplers: &sampler }
        descriptorLayout = VulkanDescriptorFactory.CreateLayout(device, dispatch, nil, &binding, 1u)
        var size = VkDescriptorPoolSize{ _type: VkConstants.VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER,
            descriptorCount: if conversion == 0uL { 1u } else { dispatch.AndroidDescriptorCount } }
        var poolInfo = VkDescriptorPoolCreateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_DESCRIPTOR_POOL_CREATE_INFO,
            maxSets: 1u, poolSizeCount: 1u, pPoolSizes: &size }
        let createPool = dispatch.vkCreateDescriptorPool
        Check(createPool(device, &poolInfo, nil, &pool), "Android descriptor pool creation failed")
        var allocation = VkDescriptorSetAllocateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_DESCRIPTOR_SET_ALLOCATE_INFO,
            descriptorPool: pool, descriptorSetCount: 1u, pSetLayouts: &descriptorLayout }
        let allocate = dispatch.vkAllocateDescriptorSets
        Check(allocate(device, &allocation, &descriptor), "Android descriptor allocation failed")
        var imageInfo = VkDescriptorImageInfo{ imageView: inputView,
            imageLayout: VkConstants.VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL }
        var write = VkWriteDescriptorSet{ sType: VkConstants.VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET,
            dstSet: descriptor, dstBinding: 0u, descriptorCount: 1u,
            descriptorType: VkConstants.VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER, pImageInfo: &imageInfo }
        let update = dispatch.vkUpdateDescriptorSets
        update(device, 1u, &write, 0u, nil)
        let output = VulkanImageFactory.Create2D(device, dispatch, source.Runtime.MemoryAllocator, nil,
            VkExtent2D{ width: uint32(source.Width), height: uint32(source.Height) },
            VkConstants.VK_FORMAT_R8G8B8A8_SRGB,
            uint32(VkConstants.VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT) | uint32(VkConstants.VK_IMAGE_USAGE_SAMPLED_BIT),
            uint32(VkConstants.VK_IMAGE_ASPECT_COLOR_BIT), VulkanMemoryPolicy.DeviceLocalRequiredPreferred)
        Image = output.Image
        View = output.ImageView
        outputAllocation = output.Allocation
    }

    private func CreatePipeline() {
        let dispatch = source.Runtime.Dispatch
        let device = source.Runtime.Device
        var push = VkPushConstantRange{ stageFlags: uint32(VkConstants.VK_SHADER_STAGE_FRAGMENT_BIT), size: 8u }
        pipelineLayout = VulkanPipelineFactory.CreateLayout(device, dispatch, nil, &descriptorLayout, 1u, &push, 1u)
        let vertex = VulkanPipelineFactory.CreateShaderModule(device, dispatch, nil,
            VulkanShaderAssets.Read("android_normalize.vert.spv"), "android_normalize.vert.spv")
        var fragment VkShaderModule
        try {
            fragment = VulkanPipelineFactory.CreateShaderModule(device, dispatch, nil,
                VulkanShaderAssets.Read("android_normalize.frag.spv"), "android_normalize.frag.spv")
            pipeline = VulkanPipelineFactory.CreateGraphics(device, dispatch, source.Runtime.PipelineCache, nil,
                vertex, fragment, pipelineLayout, VkConstants.VK_FORMAT_R8G8B8A8_SRGB,
                VkConstants.VK_PRIMITIVE_TOPOLOGY_TRIANGLE_LIST, false, 15u)
        } finally {
            let destroy = dispatch.vkDestroyShaderModule
            if fragment != 0uL { destroy(device, fragment, nil) }
            destroy(device, vertex, nil)
        }
    }

    internal func Record(command VkCommandBuffer) {
        let dispatch = source.Runtime.Dispatch
        VulkanTransitions.RecordImage(command, dispatch.vkCmdPipelineBarrier2, Image,
            VulkanTransitions.ColorSubresourceRange(), VkConstants.VK_IMAGE_LAYOUT_UNDEFINED,
            VkConstants.VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL, 0uL, 0uL,
            VkConstants.VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT, VkConstants.VK_ACCESS_2_COLOR_ATTACHMENT_WRITE_BIT)
        let extent = VkExtent2D{ width: uint32(source.Width), height: uint32(source.Height) }
        var attachment = VkRenderingAttachmentInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_RENDERING_ATTACHMENT_INFO,
            imageView: View, imageLayout: VkConstants.VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL,
            loadOp: VkConstants.VK_ATTACHMENT_LOAD_OP_DONT_CARE, storeOp: VkConstants.VK_ATTACHMENT_STORE_OP_STORE }
        var rendering = VkRenderingInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_RENDERING_INFO,
            renderArea: VkRect2D{ extent: extent }, layerCount: 1u, colorAttachmentCount: 1u, pColorAttachments: &attachment }
        let begin = dispatch.vkCmdBeginRendering
        begin(command, &rendering)
        var viewport = VkViewport{ width: float32(extent.width), height: float32(extent.height), maxDepth: 1.0F }
        var scissor = VkRect2D{ extent: extent }
        let setViewport = dispatch.vkCmdSetViewport
        setViewport(command, 0u, 1u, &viewport)
        let setScissor = dispatch.vkCmdSetScissor
        setScissor(command, 0u, 1u, &scissor)
        let bindPipeline = dispatch.vkCmdBindPipeline
        bindPipeline(command, VkConstants.VK_PIPELINE_BIND_POINT_GRAPHICS, pipeline)
        let bind = dispatch.vkCmdBindDescriptorSets
        bind(command, VkConstants.VK_PIPELINE_BIND_POINT_GRAPHICS, pipelineLayout, 0u, 1u, &descriptor, 0u, nil)
        let values *uint32 = stackalloc[2]uint32{
            if source.Format == 43 || source.Format == 50 { 0u } else { uint32(Encoding) },
            if AlphaMode == ExternalImageAlphaMode.Opaque { 1u } else { 0u } }
        let constants = dispatch.vkCmdPushConstants
        constants(command, pipelineLayout, uint32(VkConstants.VK_SHADER_STAGE_FRAGMENT_BIT), 0u, 8u, *void(values))
        let draw = dispatch.vkCmdDraw
        draw(command, 3u, 1u, 0u, 0u)
        let end = dispatch.vkCmdEndRendering
        end(command)
        VulkanTransitions.RecordImage(command, dispatch.vkCmdPipelineBarrier2, Image,
            VulkanTransitions.ColorSubresourceRange(), VkConstants.VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL,
            VkConstants.VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL,
            VkConstants.VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT, VkConstants.VK_ACCESS_2_COLOR_ATTACHMENT_WRITE_BIT,
            VkConstants.VK_PIPELINE_STAGE_2_FRAGMENT_SHADER_BIT, VkConstants.VK_ACCESS_2_SHADER_SAMPLED_READ_BIT)
    }

    public func Dispose() {
        let dispatch = source.Runtime.Dispatch
        let device = source.Runtime.Device
        if View != 0uL {
            let destroy = dispatch.vkDestroyImageView
            destroy(device, View, nil)
            View = 0uL
        }
        if Image != 0uL {
            let destroy = dispatch.vkDestroyImage
            destroy(device, Image, nil)
            Image = 0uL
        }
        if let allocation = outputAllocation {
            source.Runtime.MemoryAllocator.Release(allocation)
            outputAllocation = nil
        }
        if pipeline != 0uL {
            let destroy = dispatch.vkDestroyPipeline
            destroy(device, pipeline, nil)
            pipeline = 0uL
        }
        if pipelineLayout != 0uL {
            let destroy = dispatch.vkDestroyPipelineLayout
            destroy(device, pipelineLayout, nil)
            pipelineLayout = 0uL
        }
        if pool != 0uL {
            let destroy = dispatch.vkDestroyDescriptorPool
            destroy(device, pool, nil)
            pool = 0uL
        }
        if descriptorLayout != 0uL {
            let destroy = dispatch.vkDestroyDescriptorSetLayout
            destroy(device, descriptorLayout, nil)
            descriptorLayout = 0uL
        }
        if inputView != 0uL {
            let destroy = dispatch.vkDestroyImageView
            destroy(device, inputView, nil)
            inputView = 0uL
        }
        if sampler != 0uL {
            let destroy = dispatch.vkDestroySampler
            destroy(device, sampler, nil)
            sampler = 0uL
        }
        if conversion != 0uL {
            let destroy = dispatch.vkDestroySamplerYcbcrConversion
            destroy(device, conversion, nil)
            conversion = 0uL
        }
    }
}
