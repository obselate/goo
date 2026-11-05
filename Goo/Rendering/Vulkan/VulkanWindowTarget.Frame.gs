package Goo

internal unsafe partial class VulkanWindowTarget {
  private func BeginCommandBuffer(slot VulkanFrameSlot) bool {
    var beginInfo = VkCommandBufferBeginInfo{}
    beginInfo.sType = VkConstants.VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO
    beginInfo.flags = uint32(VkConstants.VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT)
    let beginCommandBuffer = dispatch.vkBeginCommandBuffer
    let beginStart = DiagnosticTimestamp()
    let beginResult = beginCommandBuffer(slot.CommandBuffer, &beginInfo)
    RecordDiagnosticResult(VulkanDiagnosticEventIds.CommandRecord, beginResult)
    RecordDiagnosticTiming(VulkanDiagnosticEventIds.CommandRecord, VulkanDiagnosticCategories.Timing, beginStart)
    if beginResult != VkConstants.VK_SUCCESS {
      try {
        HandleFrameFailure(beginResult, VulkanDiagnosticEventIds.CommandRecord)
      } finally {
        if !recoveryPending && frameBegun {
          try { AbandonRecordedFrameForRetry() } catch (cleanup Exception) { frameFailed = true }
        }
        CloseDiagnosticFrame(false)
        ClearActiveFrame()
      }
      return false
    }
    ResetDiagnosticTimestamp(slot)
    return true
  }

  private func BeginRendering(
    current VulkanSwapchainGeneration,
    slot VulkanFrameSlot,
    imageIndex uint32,
    damage VulkanDamageRegion) {
      let image = current.Image(imageIndex)
      let oldLayout = current.CurrentLayout(imageIndex)
      var srcStageMask VkPipelineStageFlags2
      var srcAccessMask VkAccessFlags2
      if oldLayout == VkConstants.VK_IMAGE_LAYOUT_UNDEFINED {
        srcStageMask = VkConstants.VK_PIPELINE_STAGE_2_TOP_OF_PIPE_BIT
        srcAccessMask = VkConstants.VK_ACCESS_2_NONE
      } else if oldLayout == VkConstants.VK_IMAGE_LAYOUT_PRESENT_SRC_KHR {
        srcStageMask = VkConstants.VK_PIPELINE_STAGE_2_BOTTOM_OF_PIPE_BIT
        srcAccessMask = VkConstants.VK_ACCESS_2_NONE
      } else {
        throw InvalidOperationException("Vulkan swapchain image layout is invalid")
      }
      VulkanTransitions.RecordImage(
        slot.CommandBuffer,
        dispatch.vkCmdPipelineBarrier2,
        image,
        VulkanTransitions.ColorSubresourceRange(),
        oldLayout,
        VkConstants.VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL,
        srcStageMask,
        srcAccessMask,
        VkConstants.VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT,
        VkConstants.VK_ACCESS_2_COLOR_ATTACHMENT_WRITE_BIT)
      RecordDiagnosticBarrier()
      var clear = VkClearValue{}
      clear.color.float32.values[0] = 0.0F
      clear.color.float32.values[1] = 0.0F
      clear.color.float32.values[2] = 0.0F
      clear.color.float32.values[3] = 0.0F
      var attachment = VkRenderingAttachmentInfo{}
      attachment.sType = VkConstants.VK_STRUCTURE_TYPE_RENDERING_ATTACHMENT_INFO
      attachment.imageView = current.ImageView(imageIndex)
      attachment.imageLayout = VkConstants.VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL
      attachment.resolveMode = VkConstants.VK_RESOLVE_MODE_NONE
      attachment.loadOp = VkConstants.VK_ATTACHMENT_LOAD_OP_CLEAR
      attachment.storeOp = VkConstants.VK_ATTACHMENT_STORE_OP_STORE
      attachment.clearValue = clear
      var rendering = VkRenderingInfo{}
      rendering.sType = VkConstants.VK_STRUCTURE_TYPE_RENDERING_INFO
      rendering.renderArea.offset = VkOffset2D{ x: damage.X, y: damage.Y }
      rendering.renderArea.extent = VkExtent2D{
        width: uint32(damage.Width),
        height: uint32(damage.Height),
      }
      rendering.layerCount = 1u
      rendering.colorAttachmentCount = 1u
      rendering.pColorAttachments = &attachment
      BeginDiagnosticTimestamp(slot, VulkanDiagnosticTimestampStage.Main)
      let beginRendering = dispatch.vkCmdBeginRendering
      beginRendering(slot.CommandBuffer, &rendering)
      timestampState?.BeginFragmentPass(int32(activeFrameSlotIndex))
      RecordDiagnosticPass()
      renderingBegun = true
    }

  private func EndRendering(
    current VulkanSwapchainGeneration,
    slot VulkanFrameSlot) {
      let endRendering = dispatch.vkCmdEndRendering
      endRendering(slot.CommandBuffer)
      EndDiagnosticTimestamp(slot, VulkanDiagnosticTimestampStage.Main)
      VulkanTransitions.RecordImage(
        slot.CommandBuffer,
        dispatch.vkCmdPipelineBarrier2,
        current.Image(activeImageIndex),
        VulkanTransitions.ColorSubresourceRange(),
        VkConstants.VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL,
        VkConstants.VK_IMAGE_LAYOUT_PRESENT_SRC_KHR,
        VkConstants.VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT,
        VkConstants.VK_ACCESS_2_COLOR_ATTACHMENT_WRITE_BIT,
        VkConstants.VK_PIPELINE_STAGE_2_BOTTOM_OF_PIPE_BIT,
        VkConstants.VK_ACCESS_2_NONE)
      RecordDiagnosticBarrier()
    }
}
