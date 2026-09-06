package Goo.VulkanProof

import System
import System.IO
import System.Runtime.InteropServices
import Goo

internal unsafe class VulkanSolidQuad : IDisposable {
  private let device VkDevice
  private let dispatch VkDeviceDispatch
  private var pipelineLayout VkPipelineLayout
  private var pipeline VkPipeline
  private var disposed bool

  internal init(device VkDevice, dispatch VkDeviceDispatch, colorFormat VkFormat) {
    if device == nint(0) {
      throw ArgumentException("Vulkan device is null", "device")
    }
    this.device = device
    this.dispatch = dispatch
    Create(colorFormat)
  }

  internal func Record(
    commandBuffer VkCommandBuffer,
    imageView VkImageView,
    extent VkExtent2D,
    clearColor VkClearColorValue,
    pushConstants SolidQuadPushConstants) {
      if disposed {
        throw ObjectDisposedException("VulkanSolidQuad")
      }
      if commandBuffer == nint(0) {
        throw ArgumentException("Command buffer is null", "commandBuffer")
      }
      if imageView == 0uL {
        throw ArgumentException("Image view is null", "imageView")
      }
      if extent.width == 0u || extent.height == 0u {
        throw ArgumentException("Extent must be non-zero", "extent")
      }

      var viewport = VkViewport{}
      viewport.x = 0.0F
      viewport.y = 0.0F
      viewport.width = float32(extent.width)
      viewport.height = float32(extent.height)
      viewport.minDepth = 0.0F
      viewport.maxDepth = 1.0F

      var scissor = VkRect2D{}
      scissor.offset = VkOffset2D{}
      scissor.extent = extent

      var clearValue = VkClearValue{}
      clearValue.color = clearColor

      var colorAttachment = VkRenderingAttachmentInfo{}
      colorAttachment.sType = VkConstants.VK_STRUCTURE_TYPE_RENDERING_ATTACHMENT_INFO
      colorAttachment.imageView = imageView
      colorAttachment.imageLayout = VkConstants.VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL
      colorAttachment.resolveMode = VkConstants.VK_RESOLVE_MODE_NONE
      colorAttachment.resolveImageView = 0uL
      colorAttachment.resolveImageLayout = VkConstants.VK_IMAGE_LAYOUT_UNDEFINED
      colorAttachment.loadOp = VkConstants.VK_ATTACHMENT_LOAD_OP_CLEAR
      colorAttachment.storeOp = VkConstants.VK_ATTACHMENT_STORE_OP_STORE
      colorAttachment.clearValue = clearValue

      var rendering = VkRenderingInfo{}
      rendering.sType = VkConstants.VK_STRUCTURE_TYPE_RENDERING_INFO
      rendering.renderArea = VkRect2D{}
      rendering.renderArea.offset = VkOffset2D{}
      rendering.renderArea.extent = extent
      rendering.layerCount = 1u
      rendering.viewMask = 0u
      rendering.colorAttachmentCount = 1u
      rendering.pColorAttachments = &colorAttachment
      rendering.pDepthAttachment = nil
      rendering.pStencilAttachment = nil

      let beginRendering = dispatch.vkCmdBeginRendering
      beginRendering(commandBuffer, &rendering)
      let setViewport = dispatch.vkCmdSetViewport
      setViewport(commandBuffer, 0u, 1u, &viewport)
      let setScissor = dispatch.vkCmdSetScissor
      setScissor(commandBuffer, 0u, 1u, &scissor)
      let bindPipeline = dispatch.vkCmdBindPipeline
      bindPipeline(commandBuffer, VkConstants.VK_PIPELINE_BIND_POINT_GRAPHICS, pipeline)
      var nativePushConstants = pushConstants
      let push = dispatch.vkCmdPushConstants
      push(commandBuffer, pipelineLayout, uint32(VkConstants.VK_SHADER_STAGE_VERTEX_BIT), 0u, 32u, *void(&nativePushConstants))
      let draw = dispatch.vkCmdDraw
      draw(commandBuffer, 6u, 1u, 0u, 0u)
      let endRendering = dispatch.vkCmdEndRendering
      endRendering(commandBuffer)
    }

  public func Dispose() {
    if disposed {
      return
    }
    disposed = true
    if pipeline != 0uL {
      let destroyPipeline = dispatch.vkDestroyPipeline
      destroyPipeline(device, pipeline, nil)
      pipeline = 0uL
    }
    if pipelineLayout != 0uL {
      let destroyPipelineLayout = dispatch.vkDestroyPipelineLayout
      destroyPipelineLayout(device, pipelineLayout, nil)
      pipelineLayout = 0uL
    }
  }

  deinit{
    Dispose()
  }

  private func Create(colorFormat VkFormat) {
    var vertexModule VkShaderModule = 0uL
    var fragmentModule VkShaderModule = 0uL
    var createdLayout VkPipelineLayout = 0uL
    var createdPipeline VkPipeline = 0uL
    var entryPointStorage nint = nint(0)
    try {
      vertexModule = CreateShaderModule("solid_quad.vert.spv")
      fragmentModule = CreateShaderModule("solid_quad.frag.spv")
      createdLayout = CreatePipelineLayout()
      entryPointStorage = Marshal.StringToCoTaskMemUTF8("main")
      createdPipeline = CreatePipeline(vertexModule, fragmentModule, createdLayout, colorFormat, entryPointStorage)
      let destroyShaderModule = dispatch.vkDestroyShaderModule
      destroyShaderModule(device, vertexModule, nil)
      vertexModule = 0uL
      destroyShaderModule(device, fragmentModule, nil)
      fragmentModule = 0uL
      pipelineLayout = createdLayout
      createdLayout = 0uL
      pipeline = createdPipeline
      createdPipeline = 0uL
    } catch (error Exception) {
      if createdPipeline != 0uL {
        let destroyPipeline = dispatch.vkDestroyPipeline
        destroyPipeline(device, createdPipeline, nil)
      }
      if createdLayout != 0uL {
        let destroyPipelineLayout = dispatch.vkDestroyPipelineLayout
        destroyPipelineLayout(device, createdLayout, nil)
      }
      let destroyShaderModule = dispatch.vkDestroyShaderModule
      if vertexModule != 0uL {
        destroyShaderModule(device, vertexModule, nil)
      }
      if fragmentModule != 0uL {
        destroyShaderModule(device, fragmentModule, nil)
      }
      throw error
    } finally {
      if entryPointStorage != nint(0) {
        Marshal.FreeCoTaskMem(entryPointStorage)
      }
    }
  }

  private func CreateShaderModule(fileName string) VkShaderModule {
    let path = Path.Combine(AppContext.BaseDirectory, "Generated", "Shaders", fileName)
    let code = File.ReadAllBytes(path)
    if code.Length == 0 || (code.Length & 3) != 0 {
      throw InvalidDataException("Invalid SPIR-V artifact: " + path)
    }
    let pin = GCHandle.Alloc(code, GCHandleType.Pinned)
    try {
      var createInfo = VkShaderModuleCreateInfo{}
      createInfo.sType = VkConstants.VK_STRUCTURE_TYPE_SHADER_MODULE_CREATE_INFO
      createInfo.codeSize = nuint(code.Length)
      createInfo.pCode = *uint32(pin.AddrOfPinnedObject())
      var result VkShaderModule = 0uL
      let createShaderModule = dispatch.vkCreateShaderModule
      if createShaderModule(device, &createInfo, nil, &result) != VkConstants.VK_SUCCESS || result == 0uL {
        throw InvalidOperationException("vkCreateShaderModule failed: " + fileName)
      }
      return result
    } finally {
      pin.Free()
    }
  }

  private func CreatePipelineLayout() VkPipelineLayout {
    var pushRange = VkPushConstantRange{}
    pushRange.stageFlags = uint32(VkConstants.VK_SHADER_STAGE_VERTEX_BIT)
    pushRange.offset = 0u
    pushRange.size = 32u
    var createInfo = VkPipelineLayoutCreateInfo{}
    createInfo.sType = VkConstants.VK_STRUCTURE_TYPE_PIPELINE_LAYOUT_CREATE_INFO
    createInfo.pushConstantRangeCount = 1u
    createInfo.pPushConstantRanges = &pushRange
    var result VkPipelineLayout = 0uL
    let createPipelineLayout = dispatch.vkCreatePipelineLayout
    if createPipelineLayout(device, &createInfo, nil, &result) != VkConstants.VK_SUCCESS || result == 0uL {
      throw InvalidOperationException("vkCreatePipelineLayout failed")
    }
    return result
  }

  private func CreatePipeline(
    vertexModule VkShaderModule,
    fragmentModule VkShaderModule,
    layout VkPipelineLayout,
    colorFormat VkFormat,
    entryPointStorage nint) VkPipeline{
      let entryPoint = *int8(entryPointStorage)
      let stages * VkPipelineShaderStageCreateInfo = stackalloc[2]VkPipelineShaderStageCreateInfo
      stages[0] = VkPipelineShaderStageCreateInfo{}
      stages[0].sType = VkConstants.VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO
      stages[0].stage = VkConstants.VK_SHADER_STAGE_VERTEX_BIT
      stages[0].module = vertexModule
      stages[0].pName = entryPoint
      stages[1] = VkPipelineShaderStageCreateInfo{}
      stages[1].sType = VkConstants.VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO
      stages[1].stage = VkConstants.VK_SHADER_STAGE_FRAGMENT_BIT
      stages[1].module = fragmentModule
      stages[1].pName = entryPoint

      var vertexInput = VkPipelineVertexInputStateCreateInfo{}
      vertexInput.sType = VkConstants.VK_STRUCTURE_TYPE_PIPELINE_VERTEX_INPUT_STATE_CREATE_INFO

      var inputAssembly = VkPipelineInputAssemblyStateCreateInfo{}
      inputAssembly.sType = VkConstants.VK_STRUCTURE_TYPE_PIPELINE_INPUT_ASSEMBLY_STATE_CREATE_INFO
      inputAssembly.topology = VkConstants.VK_PRIMITIVE_TOPOLOGY_TRIANGLE_LIST

      var viewportState = VkPipelineViewportStateCreateInfo{}
      viewportState.sType = VkConstants.VK_STRUCTURE_TYPE_PIPELINE_VIEWPORT_STATE_CREATE_INFO
      viewportState.viewportCount = 1u
      viewportState.scissorCount = 1u

      var rasterization = VkPipelineRasterizationStateCreateInfo{}
      rasterization.sType = VkConstants.VK_STRUCTURE_TYPE_PIPELINE_RASTERIZATION_STATE_CREATE_INFO
      rasterization.polygonMode = VkConstants.VK_POLYGON_MODE_FILL
      rasterization.cullMode = uint32(VkConstants.VK_CULL_MODE_NONE)
      rasterization.frontFace = VkConstants.VK_FRONT_FACE_COUNTER_CLOCKWISE
      rasterization.lineWidth = 1.0F

      var multisample = VkPipelineMultisampleStateCreateInfo{}
      multisample.sType = VkConstants.VK_STRUCTURE_TYPE_PIPELINE_MULTISAMPLE_STATE_CREATE_INFO
      multisample.rasterizationSamples = VkConstants.VK_SAMPLE_COUNT_1_BIT

      var colorBlendAttachment = VkPipelineColorBlendAttachmentState{}
      colorBlendAttachment.blendEnable = VkConstants.VK_FALSE
      colorBlendAttachment.srcColorBlendFactor = VkConstants.VK_BLEND_FACTOR_ONE
      colorBlendAttachment.dstColorBlendFactor = VkConstants.VK_BLEND_FACTOR_ZERO
      colorBlendAttachment.colorBlendOp = VkConstants.VK_BLEND_OP_ADD
      colorBlendAttachment.srcAlphaBlendFactor = VkConstants.VK_BLEND_FACTOR_ONE
      colorBlendAttachment.dstAlphaBlendFactor = VkConstants.VK_BLEND_FACTOR_ZERO
      colorBlendAttachment.alphaBlendOp = VkConstants.VK_BLEND_OP_ADD
      colorBlendAttachment.colorWriteMask = uint32(VkConstants.VK_COLOR_COMPONENT_R_BIT)
      | uint32(VkConstants.VK_COLOR_COMPONENT_G_BIT)
      | uint32(VkConstants.VK_COLOR_COMPONENT_B_BIT)
      | uint32(VkConstants.VK_COLOR_COMPONENT_A_BIT)

      var colorBlend = VkPipelineColorBlendStateCreateInfo{}
      colorBlend.sType = VkConstants.VK_STRUCTURE_TYPE_PIPELINE_COLOR_BLEND_STATE_CREATE_INFO
      colorBlend.logicOpEnable = VkConstants.VK_FALSE
      colorBlend.logicOp = VkConstants.VK_LOGIC_OP_COPY
      colorBlend.attachmentCount = 1u
      colorBlend.pAttachments = &colorBlendAttachment

      let dynamicStates * VkDynamicState = stackalloc[2]VkDynamicState
      dynamicStates[0] = VkConstants.VK_DYNAMIC_STATE_VIEWPORT
      dynamicStates[1] = VkConstants.VK_DYNAMIC_STATE_SCISSOR
      var dynamicState = VkPipelineDynamicStateCreateInfo{}
      dynamicState.sType = VkConstants.VK_STRUCTURE_TYPE_PIPELINE_DYNAMIC_STATE_CREATE_INFO
      dynamicState.dynamicStateCount = 2u
      dynamicState.pDynamicStates = dynamicStates

      var pipelineColorFormat = colorFormat
      var pipelineRendering = VkPipelineRenderingCreateInfo{}
      pipelineRendering.sType = VkConstants.VK_STRUCTURE_TYPE_PIPELINE_RENDERING_CREATE_INFO
      pipelineRendering.colorAttachmentCount = 1u
      pipelineRendering.pColorAttachmentFormats = &pipelineColorFormat
      pipelineRendering.depthAttachmentFormat = VkFormat(0)
      pipelineRendering.stencilAttachmentFormat = VkFormat(0)

      var createInfo = VkGraphicsPipelineCreateInfo{}
      createInfo.sType = VkConstants.VK_STRUCTURE_TYPE_GRAPHICS_PIPELINE_CREATE_INFO
      createInfo.pNext = *void(&pipelineRendering)
      createInfo.stageCount = 2u
      createInfo.pStages = stages
      createInfo.pVertexInputState = &vertexInput
      createInfo.pInputAssemblyState = &inputAssembly
      createInfo.pViewportState = &viewportState
      createInfo.pRasterizationState = &rasterization
      createInfo.pMultisampleState = &multisample
      createInfo.pColorBlendState = &colorBlend
      createInfo.pDynamicState = &dynamicState
      createInfo.layout = layout
      createInfo.renderPass = 0uL
      var result VkPipeline = 0uL
      let createGraphicsPipelines = dispatch.vkCreateGraphicsPipelines
      if createGraphicsPipelines(device, 0uL, 1u, &createInfo, nil, &result) != VkConstants.VK_SUCCESS || result == 0uL {
        throw InvalidOperationException("vkCreateGraphicsPipelines failed")
      }
      return result
    }
}
