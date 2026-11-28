package Goo

import System

internal unsafe sealed partial class VulkanSharedPrimitiveState {
    private var strokeFragmentModule VkShaderModule
    private var strokeMetricModule VkShaderModule
    private var strokeDescriptorLayout VkDescriptorSetLayout
    private var strokePipelineLayout VkPipelineLayout
    private var strokeMetricPipelineLayout VkPipelineLayout
    private var strokeMetricPipeline VkPipeline
    private var strokeRgbaPipeline VkPipeline
    private var strokeBgraPipeline VkPipeline

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
        if format == VkConstants.VK_FORMAT_R8G8B8A8_UNORM {
            return ResolveStrokePipeline(ref strokeRgbaPipeline, format)
        }
        if format == VkConstants.VK_FORMAT_B8G8R8A8_UNORM {
            return ResolveStrokePipeline(ref strokeBgraPipeline, format)
        }
        throw ArgumentOutOfRangeException("format")
    }

    private func ResolveStrokePipeline(ref pipeline VkPipeline, format VkFormat) VkPipeline {
        lock (strokePipelineGate) {
            EnsurePathStrokes()
            if pipeline == VkPipeline.Null {
                pipeline = VulkanPipelineFactory.CreateGraphics(
                    device,
                    dispatch,
                    pipelineCache,
                    objectAccounting,
                    pathVertexModule,
                    strokeFragmentModule,
                    strokePipelineLayout,
                    format,
                    VkConstants.VK_PRIMITIVE_TOPOLOGY_TRIANGLE_LIST,
                    true,
                    uint32(
                        VkConstants.VK_COLOR_COMPONENT_R_BIT
                        | VkConstants.VK_COLOR_COMPONENT_G_BIT | VkConstants.VK_COLOR_COMPONENT_B_BIT
                        | VkConstants.VK_COLOR_COMPONENT_A_BIT
                    ),
                    nil
                )
                profileTraceId = nil
            }
            return pipeline
        }
    }

    private func EnsurePathStrokes() {
        lock (strokePipelineGate) {
            EnsureOpen()
            if strokeMetricPipeline != VkPipeline.Null {
                return
            }
            try {
                strokeFragmentModule = CreateShaderModule(
                    LoadShaderCode("path_stroke.frag.spv"),
                    "path_stroke.frag.spv"
                )
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
                rethrow
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
        var pipeline VkPipeline = VkPipeline.Null
        try {
            let result = pipelineCache.CreateComputePipeline(&info, &pipeline)
            if result != VkConstants.VK_SUCCESS || pipeline == VkPipeline.Null {
                throw InvalidOperationException("vkCreateComputePipelines failed: " + result.ToString())
            }
            if let accounting = objectAccounting {
                accounting.Allocate()
            }
            strokeMetricPipeline = pipeline
        } catch (error Exception) {
            if pipeline != VkPipeline.Null {
                let destroy = dispatch.vkDestroyPipeline
                destroy(device, pipeline, nil)
            }
            rethrow
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
            ref strokeMetricModule
        )
    }
}
