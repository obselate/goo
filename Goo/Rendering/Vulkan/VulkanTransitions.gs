package Goo

import System.Runtime.CompilerServices

internal unsafe class VulkanTransitions {
  shared {
    @MethodImpl(MethodImplOptions.AggressiveInlining)
    internal func ColorSubresourceRange(
      baseArrayLayer uint32 = 0u,
      layerCount uint32 = 1u,
      baseMipLevel uint32 = 0u,
      levelCount uint32 = 1u) VkImageSubresourceRange -> VkImageSubresourceRange{
        aspectMask: uint32(VkConstants.VK_IMAGE_ASPECT_COLOR_BIT),
        baseMipLevel: baseMipLevel,
        levelCount: levelCount,
        baseArrayLayer: baseArrayLayer,
        layerCount: layerCount,
      }

    @MethodImpl(MethodImplOptions.AggressiveInlining)
    internal func RecordImage(
      commandBuffer VkCommandBuffer,
      pipelineBarrier unmanaged[Cdecl](VkCommandBuffer, *VkDependencyInfo) -> void,
      image VkImage,
      subresourceRange VkImageSubresourceRange,
      oldLayout VkImageLayout,
      newLayout VkImageLayout,
      srcStageMask VkPipelineStageFlags2,
      srcAccessMask VkAccessFlags2,
      dstStageMask VkPipelineStageFlags2,
      dstAccessMask VkAccessFlags2) {
        var barrier = VkImageMemoryBarrier2{
          sType: VkConstants.VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER_2,
          srcStageMask: srcStageMask,
          srcAccessMask: srcAccessMask,
          dstStageMask: dstStageMask,
          dstAccessMask: dstAccessMask,
          oldLayout: oldLayout,
          newLayout: newLayout,
          srcQueueFamilyIndex: VkConstants.VK_QUEUE_FAMILY_IGNORED,
          dstQueueFamilyIndex: VkConstants.VK_QUEUE_FAMILY_IGNORED,
          image: image,
          subresourceRange: subresourceRange,
        }
        var dependency = VkDependencyInfo{
          sType: VkConstants.VK_STRUCTURE_TYPE_DEPENDENCY_INFO,
          imageMemoryBarrierCount: 1u,
          pImageMemoryBarriers: &barrier,
        }
        pipelineBarrier(commandBuffer, &dependency)
      }

    @MethodImpl(MethodImplOptions.AggressiveInlining)
    internal func RecordBuffer(
      commandBuffer VkCommandBuffer,
      pipelineBarrier unmanaged[Cdecl](VkCommandBuffer, *VkDependencyInfo) -> void,
      buffer VkBuffer,
      offset VkDeviceSize,
      size VkDeviceSize,
      srcStageMask VkPipelineStageFlags2,
      srcAccessMask VkAccessFlags2,
      dstStageMask VkPipelineStageFlags2,
      dstAccessMask VkAccessFlags2) {
        var barrier = VkBufferMemoryBarrier2{
          sType: VkConstants.VK_STRUCTURE_TYPE_BUFFER_MEMORY_BARRIER_2,
          srcStageMask: srcStageMask,
          srcAccessMask: srcAccessMask,
          dstStageMask: dstStageMask,
          dstAccessMask: dstAccessMask,
          srcQueueFamilyIndex: VkConstants.VK_QUEUE_FAMILY_IGNORED,
          dstQueueFamilyIndex: VkConstants.VK_QUEUE_FAMILY_IGNORED,
          buffer: buffer,
          offset: offset,
          size: size,
        }
        var dependency = VkDependencyInfo{
          sType: VkConstants.VK_STRUCTURE_TYPE_DEPENDENCY_INFO,
          bufferMemoryBarrierCount: 1u,
          pBufferMemoryBarriers: &barrier,
        }
        pipelineBarrier(commandBuffer, &dependency)
      }
  }
}
