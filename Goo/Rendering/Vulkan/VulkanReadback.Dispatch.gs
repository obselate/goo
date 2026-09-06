package Goo

import System

internal unsafe sealed class VulkanReadbackDispatch {
  private let copyImageToBuffer unmanaged[Cdecl](VkCommandBuffer, VkImage,
    VkImageLayout, VkBuffer, uint32, nint) -> void

  internal init(nativeAddress nint) {
    if nativeAddress == nint(0) {
      throw ArgumentException("Vulkan copy command is null", "nativeAddress")
    }
    let copy = nativeAddress as (unmanaged[Cdecl](VkCommandBuffer, VkImage,
      VkImageLayout, VkBuffer, uint32, nint) -> void)?
    if copy == nil {
      throw InvalidOperationException("vkCmdCopyImageToBuffer has an invalid address")
    }
    copyImageToBuffer = copy!!
  }

  internal func CopyImageToBuffer(commandBuffer VkCommandBuffer, image VkImage,
    imageLayout VkImageLayout, buffer VkBuffer, region VkBufferImageCopy) {
      var copyRegion = region
      let copy = copyImageToBuffer
      copy(commandBuffer, image, imageLayout, buffer, 1u, nint(&copyRegion))
    }
}
