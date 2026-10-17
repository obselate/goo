package Goo

import System
import System.Diagnostics
import System.Runtime.InteropServices

internal unsafe class VulkanPipelineFactory {
  shared {
    internal func CreateShaderModule(
      device VkDevice,
      dispatch VkDeviceDispatch,
      objectAccounting VulkanObjectAccounting?,
      code []uint8,
      artifactName string) VkShaderModule{

        if code.Length == 0 || (code.Length & 3) != 0 {
          throw ArgumentException("SPIR-V code must be non-empty and word-aligned", "code")
        }

        let pin = GCHandle.Alloc(code, GCHandleType.Pinned)
        try {
          var module VkShaderModule = 0uL
          var accounted bool = false
          var info = VkShaderModuleCreateInfo{
            sType: VkConstants.VK_STRUCTURE_TYPE_SHADER_MODULE_CREATE_INFO,
            pNext: nil,
            flags: 0u,
            codeSize: nuint(code.Length),
            pCode: *uint32(pin.AddrOfPinnedObject()),
          }
          try {
            let createShaderModule = dispatch.vkCreateShaderModule
            let recorder = FrameRecorder.Current
            let start = if recorder != nil { Stopwatch.GetTimestamp() } else { 0L }
            let result = createShaderModule(device, &info, nil, &module)
            if let trace = recorder {
              let id = trace.NativeResource(FrameResourceKind.Shader, uint64(device), module)
              trace.ResourceDuration(FrameResourceKind.Shader, id, "shader.create", start,
                bytes: uint64(code.Length), device: uint64(device), result: int32(result))
              if result == VkConstants.VK_SUCCESS && module != 0uL {
                trace.Resource(FrameResourceKind.Shader, id, VulkanDiagnosticEventIds.ResourceCreate,
                  "shader.module", name: artifactName, bytes: uint64(code.Length), device: uint64(device))
              }
            }
            if result != VkConstants.VK_SUCCESS || module == 0uL {
              throw InvalidOperationException(
                "vkCreateShaderModule failed for " + artifactName + ": " + result.ToString())
            }
            if let accounting = objectAccounting {
              accounting.Allocate()
              accounted = true
            }
            return module
          } catch (error Exception) {
            if module != 0uL {
              try {
                VulkanNativeHandleDestroyer.DestroyShaderModule(device, dispatch.vkDestroyShaderModule, nil, ref module)
              } catch (cleanup Exception) { }
            }
            if accounted {
              if let accounting = objectAccounting {
                try { accounting.Release() } catch (cleanup Exception) { }
              }
            }
            throw error
          }
        } finally {
          pin.Free()
        }
      }

    internal func CreateLayout(
      device VkDevice,
      dispatch VkDeviceDispatch,
      objectAccounting VulkanObjectAccounting?,
      setLayouts * VkDescriptorSetLayout,
      setLayoutCount uint32,
      pushConstantRanges * VkPushConstantRange,
      pushConstantRangeCount uint32) VkPipelineLayout{

        if setLayoutCount > 0u && setLayouts == nil {
          throw ArgumentNullException("setLayouts")
        }
        if pushConstantRangeCount > 0u && pushConstantRanges == nil {
          throw ArgumentNullException("pushConstantRanges")
        }

        var layout VkPipelineLayout = 0uL
        var accounted bool = false
        var info = VkPipelineLayoutCreateInfo{
          sType: VkConstants.VK_STRUCTURE_TYPE_PIPELINE_LAYOUT_CREATE_INFO,
          pNext: nil,
          flags: 0u,
          setLayoutCount: setLayoutCount,
          pSetLayouts: setLayouts,
          pushConstantRangeCount: pushConstantRangeCount,
          pPushConstantRanges: pushConstantRanges,
        }
        try {
          let createPipelineLayout = dispatch.vkCreatePipelineLayout
          let result = createPipelineLayout(device, &info, nil, &layout)
          if result != VkConstants.VK_SUCCESS || layout == 0uL {
            throw InvalidOperationException(
              "vkCreatePipelineLayout failed: " + result.ToString())
          }
          if let accounting = objectAccounting {
            accounting.Allocate()
            accounted = true
          }
          return layout
        } catch (error Exception) {
          if layout != 0uL {
            let destroyPipelineLayout = dispatch.vkDestroyPipelineLayout
            try { destroyPipelineLayout(device, layout, nil) } catch (cleanup Exception) { }
          }
          if accounted {
            if let accounting = objectAccounting {
              try { accounting.Release() } catch (cleanup Exception) { }
            }
          }
          throw error
        }
      }

    internal func CreateGraphics(
      device VkDevice,
      dispatch VkDeviceDispatch,
      pipelineCache VulkanPipelineCache,
      objectAccounting VulkanObjectAccounting?,
      vertexModule VkShaderModule,
      fragmentModule VkShaderModule,
      layout VkPipelineLayout,
      targetFormat VkFormat,
      topology VkPrimitiveTopology,
      blendingEnabled bool,
      colorWriteMask uint32) VkPipeline{

        let entryPointStorage = Marshal.StringToCoTaskMemUTF8("main")
        try {
          let entryPoint = *int8(entryPointStorage)
          let stages * VkPipelineShaderStageCreateInfo =
          stackalloc[2]VkPipelineShaderStageCreateInfo
          stages[0] = VkPipelineShaderStageCreateInfo{
            sType: VkConstants.VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO,
            stage: VkConstants.VK_SHADER_STAGE_VERTEX_BIT,
            module: vertexModule,
            pName: entryPoint,
          }
          stages[1] = VkPipelineShaderStageCreateInfo{
            sType: VkConstants.VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO,
            stage: VkConstants.VK_SHADER_STAGE_FRAGMENT_BIT,
            module: fragmentModule,
            pName: entryPoint,
          }

          var vertexInput = VkPipelineVertexInputStateCreateInfo{
            sType: VkConstants.VK_STRUCTURE_TYPE_PIPELINE_VERTEX_INPUT_STATE_CREATE_INFO,
          }
          var inputAssembly = VkPipelineInputAssemblyStateCreateInfo{
            sType: VkConstants.VK_STRUCTURE_TYPE_PIPELINE_INPUT_ASSEMBLY_STATE_CREATE_INFO,
            topology: topology,
          }
          var viewportState = VkPipelineViewportStateCreateInfo{
            sType: VkConstants.VK_STRUCTURE_TYPE_PIPELINE_VIEWPORT_STATE_CREATE_INFO,
            viewportCount: 1u,
            scissorCount: 1u,
          }
          var rasterization = VkPipelineRasterizationStateCreateInfo{
            sType: VkConstants.VK_STRUCTURE_TYPE_PIPELINE_RASTERIZATION_STATE_CREATE_INFO,
            polygonMode: VkConstants.VK_POLYGON_MODE_FILL,
            cullMode: uint32(VkConstants.VK_CULL_MODE_NONE),
            frontFace: VkConstants.VK_FRONT_FACE_COUNTER_CLOCKWISE,
            lineWidth: 1.0F,
          }
          var multisample = VkPipelineMultisampleStateCreateInfo{
            sType: VkConstants.VK_STRUCTURE_TYPE_PIPELINE_MULTISAMPLE_STATE_CREATE_INFO,
            rasterizationSamples: VkConstants.VK_SAMPLE_COUNT_1_BIT,
          }
          var colorBlendAttachment = VkPipelineColorBlendAttachmentState{
            blendEnable: if blendingEnabled { VkConstants.VK_TRUE } else { VkConstants.VK_FALSE },
            srcColorBlendFactor: VkConstants.VK_BLEND_FACTOR_ONE,
            dstColorBlendFactor: VkConstants.VK_BLEND_FACTOR_ONE_MINUS_SRC_ALPHA,
            colorBlendOp: VkConstants.VK_BLEND_OP_ADD,
            srcAlphaBlendFactor: VkConstants.VK_BLEND_FACTOR_ONE,
            dstAlphaBlendFactor: VkConstants.VK_BLEND_FACTOR_ONE_MINUS_SRC_ALPHA,
            alphaBlendOp: VkConstants.VK_BLEND_OP_ADD,
            colorWriteMask: colorWriteMask,
          }
          var colorBlend = VkPipelineColorBlendStateCreateInfo{
            sType: VkConstants.VK_STRUCTURE_TYPE_PIPELINE_COLOR_BLEND_STATE_CREATE_INFO,
            logicOpEnable: VkConstants.VK_FALSE,
            logicOp: VkConstants.VK_LOGIC_OP_COPY,
            attachmentCount: 1u,
            pAttachments: &colorBlendAttachment,
          }

          let dynamicStates * VkDynamicState = stackalloc[2]VkDynamicState
          dynamicStates[0] = VkConstants.VK_DYNAMIC_STATE_VIEWPORT
          dynamicStates[1] = VkConstants.VK_DYNAMIC_STATE_SCISSOR
          var dynamicState = VkPipelineDynamicStateCreateInfo{
            sType: VkConstants.VK_STRUCTURE_TYPE_PIPELINE_DYNAMIC_STATE_CREATE_INFO,
            dynamicStateCount: 2u,
            pDynamicStates: dynamicStates,
          }

          var pipelineColorFormat = targetFormat
          var pipelineRendering = VkPipelineRenderingCreateInfo{
            sType: VkConstants.VK_STRUCTURE_TYPE_PIPELINE_RENDERING_CREATE_INFO,
            colorAttachmentCount: 1u,
            pColorAttachmentFormats: &pipelineColorFormat,
            depthAttachmentFormat: VkFormat(0),
            stencilAttachmentFormat: VkFormat(0),
          }
          var info = VkGraphicsPipelineCreateInfo{
            sType: VkConstants.VK_STRUCTURE_TYPE_GRAPHICS_PIPELINE_CREATE_INFO,
            pNext: *void(&pipelineRendering),
            stageCount: 2u,
            pStages: stages,
            pVertexInputState: &vertexInput,
            pInputAssemblyState: &inputAssembly,
            pViewportState: &viewportState,
            pRasterizationState: &rasterization,
            pMultisampleState: &multisample,
            pColorBlendState: &colorBlend,
            pDynamicState: &dynamicState,
            layout: layout,
            renderPass: 0uL,
          }

          var pipeline VkPipeline = 0uL
          var accounted bool = false
          try {
            let result = pipelineCache.CreateGraphicsPipelines(1u, &info, &pipeline)
            if result != VkConstants.VK_SUCCESS || pipeline == 0uL {
              throw InvalidOperationException(
                "vkCreateGraphicsPipelines failed: " + result.ToString())
            }
            if let accounting = objectAccounting {
              accounting.Allocate()
              accounted = true
            }
            return pipeline
          } catch (error Exception) {
            if pipeline != 0uL {
              try {
                VulkanNativeHandleDestroyer.DestroyPipeline(device, dispatch.vkDestroyPipeline, nil, ref pipeline)
              } catch (cleanup Exception) { }
            }
            if accounted {
              if let accounting = objectAccounting {
                try { accounting.Release() } catch (cleanup Exception) { }
              }
            }
            throw error
          }
        } finally {
          Marshal.FreeCoTaskMem(entryPointStorage)
        }
      }
  }
}
