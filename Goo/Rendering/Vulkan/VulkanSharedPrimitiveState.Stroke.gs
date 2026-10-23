package Goo

import System

internal unsafe sealed partial class VulkanSharedPrimitiveState {
    private var strokeFragmentModule VkShaderModule
    private var strokeMaskModule VkShaderModule
    private var strokeMetricModule VkShaderModule
    private var strokeDescriptorLayout VkDescriptorSetLayout
    private var strokePipelineLayout VkPipelineLayout
    private var strokeMaskPipelineLayout VkPipelineLayout
    private var strokeMetricPipelineLayout VkPipelineLayout
    private var strokeMetricPipeline VkPipeline
    private var strokeRgbaPipeline VkPipeline
    private var strokeBgraPipeline VkPipeline
    private var strokeMaskR8Pipeline VkPipeline
    private var strokeMaskRgbaPipeline VkPipeline

    internal prop StrokeDescriptorSetLayout VkDescriptorSetLayout {
        get {
            EnsurePathStrokes()
            return strokeDescriptorLayout
        }
    }

    internal prop StrokePipelineLayout VkPipelineLayout {
        get {
            EnsurePathStrokes()
            return strokePipelineLayout
        }
    }

    internal prop StrokeMaskPipelineLayout VkPipelineLayout {
        get {
            EnsurePathStrokes()
            return strokeMaskPipelineLayout
        }
    }

    internal prop StrokeMetricPipelineLayout VkPipelineLayout {
        get {
            EnsurePathStrokes()
            return strokeMetricPipelineLayout
        }
    }

    internal prop StrokeMetricPipeline VkPipeline {
        get {
            EnsurePathStrokes()
            return strokeMetricPipeline
        }
    }

    internal func StrokePipelineFor(format VkFormat) VkPipeline {
        if format == VkConstants.VK_FORMAT_R8G8B8A8_SRGB {
            return ResolveStrokePipeline(ref strokeRgbaPipeline, format, false)
        }
        if format == VkConstants.VK_FORMAT_B8G8R8A8_SRGB {
            return ResolveStrokePipeline(ref strokeBgraPipeline, format, false)
        }
        throw ArgumentOutOfRangeException("format")
    }

    internal func StrokeMaskPipelineFor(format VulkanClipMaskFormat) VkPipeline {
        if format == VulkanClipMaskFormat.R8Unorm {
            return ResolveStrokePipeline(ref strokeMaskR8Pipeline, VkConstants.VK_FORMAT_R8_UNORM, true)
        }
        if format == VulkanClipMaskFormat.Rgba8Unorm {
            return ResolveStrokePipeline(ref strokeMaskRgbaPipeline, VkConstants.VK_FORMAT_R8G8B8A8_UNORM, true)
        }
        throw ArgumentOutOfRangeException("format")
    }

    private func ResolveStrokePipeline(ref pipeline VkPipeline, format VkFormat, mask bool) VkPipeline {
        lock (clipPipelineGate) {
            EnsurePathStrokes()
            if pipeline == 0uL {
                pipeline = VulkanPipelineFactory.CreateGraphics(
                    device,
                    dispatch,
                    pipelineCache,
                    objectAccounting,
                    mask ? clipMaskVertexModule: pathVertexModule,
                    mask ? strokeMaskModule: strokeFragmentModule,
                    mask ? strokeMaskPipelineLayout: strokePipelineLayout,
                    format,
                    VkConstants.VK_PRIMITIVE_TOPOLOGY_TRIANGLE_LIST,
                    !mask,
                    uint32(
                        mask ? VkConstants.VK_COLOR_COMPONENT_R_BIT: VkConstants.VK_COLOR_COMPONENT_R_BIT
                        | VkConstants.VK_COLOR_COMPONENT_G_BIT | VkConstants.VK_COLOR_COMPONENT_B_BIT
                        | VkConstants.VK_COLOR_COMPONENT_A_BIT
                    )
                )
                profileTraceId = nil
            }
            return pipeline
        }
    }

    private func EnsurePathStrokes() {
        lock (clipPipelineGate) {
            EnsureOpen()
            if strokeMetricPipeline != 0uL {
                return
            }
            try {
                strokeFragmentModule = CreateShaderModule(
                    LoadShaderCode("path_stroke.frag.spv"),
                    "path_stroke.frag.spv"
                )
                strokeMaskModule = CreateShaderModule(LoadShaderCode("stroke_mask.frag.spv"), "stroke_mask.frag.spv")
                strokeMetricModule = CreateShaderModule(LoadShaderCode("path_stroke.comp.spv"), "path_stroke.comp.spv")
                strokeDescriptorLayout = VulkanDescriptorFactory.CreateSingleBindingLayout(
                    device,
                    dispatch,
                    objectAccounting,
                    VkConstants.VK_DESCRIPTOR_TYPE_STORAGE_BUFFER,
                    uint32(VkConstants.VK_SHADER_STAGE_COMPUTE_BIT) | uint32(VkConstants.VK_SHADER_STAGE_FRAGMENT_BIT)
                )
                let graphicsLayouts *VkDescriptorSetLayout = stackalloc[3]VkDescriptorSetLayout
                graphicsLayouts[0] = pathDescriptorSetLayout
                graphicsLayouts[1] = clipDescriptorSetLayout
                graphicsLayouts[2] = strokeDescriptorLayout
                var drawRange = VkPushConstantRange{
                    stageFlags: uint32(VkConstants.VK_SHADER_STAGE_VERTEX_BIT)
                    | uint32(VkConstants.VK_SHADER_STAGE_FRAGMENT_BIT),
                    size: 80u,
                }
                strokePipelineLayout = VulkanPipelineFactory.CreateLayout(
                    device,
                    dispatch,
                    objectAccounting,
                    graphicsLayouts,
                    3u,
                    &drawRange,
                    1u
                )
                graphicsLayouts[1] = strokeDescriptorLayout
                drawRange.size = 112u
                strokeMaskPipelineLayout = VulkanPipelineFactory.CreateLayout(
                    device,
                    dispatch,
                    objectAccounting,
                    graphicsLayouts,
                    2u,
                    &drawRange,
                    1u
                )
                var computeRange = VkPushConstantRange{
                    stageFlags: uint32(VkConstants.VK_SHADER_STAGE_COMPUTE_BIT),
                    size: 4u,
                }
                strokeMetricPipelineLayout = VulkanPipelineFactory.CreateLayout(
                    device,
                    dispatch,
                    objectAccounting,
                    graphicsLayouts,
                    2u,
                    &computeRange,
                    1u
                )
                CreateStrokeMetricPipeline()
                profileTraceId = nil
            } catch (error Exception) {
                DisposePathStrokes()
                throw error
            }
        }
    }

    private func CreateStrokeMetricPipeline() {
        let entry *int8 = stackalloc[5]int8
        entry[0] = 109
        entry[1] = 97
        entry[2] = 105
        entry[3] = 110
        entry[4] = 0
        var info = VkComputePipelineCreateInfo{
            sType: VkConstants.VK_STRUCTURE_TYPE_COMPUTE_PIPELINE_CREATE_INFO,
            stage: VkPipelineShaderStageCreateInfo{
                sType: VkConstants.VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO,
                stage: VkConstants.VK_SHADER_STAGE_COMPUTE_BIT,
                module: strokeMetricModule,
                pName: entry,
            },
            layout: strokeMetricPipelineLayout,
            basePipelineIndex: -1,
        }
        var pipeline VkPipeline = 0uL
        try {
            let result = pipelineCache.CreateComputePipeline(&info, &pipeline)
            if result != VkConstants.VK_SUCCESS || pipeline == 0uL {
                throw InvalidOperationException("vkCreateComputePipelines failed: " + result.ToString())
            }
            if let accounting = objectAccounting {
                accounting.Allocate()
            }
            strokeMetricPipeline = pipeline
        } catch (error Exception) {
            if pipeline != 0uL {
                let destroy = dispatch.vkDestroyPipeline
                destroy(device, pipeline, nil)
            }
            throw error
        }
    }

    private func DisposePathStrokes() {
        VulkanNativeHandleDestroyer.DestroyPipeline(
            device,
            dispatch.vkDestroyPipeline,
            objectAccounting,
            ref strokeRgbaPipeline
        )
        VulkanNativeHandleDestroyer.DestroyPipeline(
            device,
            dispatch.vkDestroyPipeline,
            objectAccounting,
            ref strokeBgraPipeline
        )
        VulkanNativeHandleDestroyer.DestroyPipeline(
            device,
            dispatch.vkDestroyPipeline,
            objectAccounting,
            ref strokeMaskR8Pipeline
        )
        VulkanNativeHandleDestroyer.DestroyPipeline(
            device,
            dispatch.vkDestroyPipeline,
            objectAccounting,
            ref strokeMaskRgbaPipeline
        )
        VulkanNativeHandleDestroyer.DestroyPipeline(
            device,
            dispatch.vkDestroyPipeline,
            objectAccounting,
            ref strokeMetricPipeline
        )
        VulkanNativeHandleDestroyer.DestroyPipelineLayout(
            device,
            dispatch.vkDestroyPipelineLayout,
            objectAccounting,
            ref strokePipelineLayout
        )
        VulkanNativeHandleDestroyer.DestroyPipelineLayout(
            device,
            dispatch.vkDestroyPipelineLayout,
            objectAccounting,
            ref strokeMaskPipelineLayout
        )
        VulkanNativeHandleDestroyer.DestroyPipelineLayout(
            device,
            dispatch.vkDestroyPipelineLayout,
            objectAccounting,
            ref strokeMetricPipelineLayout
        )
        VulkanNativeHandleDestroyer.DestroyDescriptorSetLayout(
            device,
            dispatch.vkDestroyDescriptorSetLayout,
            objectAccounting,
            ref strokeDescriptorLayout
        )
        VulkanNativeHandleDestroyer.DestroyShaderModule(
            device,
            dispatch.vkDestroyShaderModule,
            objectAccounting,
            ref strokeFragmentModule
        )
        VulkanNativeHandleDestroyer.DestroyShaderModule(
            device,
            dispatch.vkDestroyShaderModule,
            objectAccounting,
            ref strokeMaskModule
        )
        VulkanNativeHandleDestroyer.DestroyShaderModule(
            device,
            dispatch.vkDestroyShaderModule,
            objectAccounting,
            ref strokeMetricModule
        )
    }
}
