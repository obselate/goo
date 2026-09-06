package Goo.VulkanProof

import System
import Goo

internal unsafe class VulkanSolidQuadReadbackTarget : IDisposable {
  private let device VkDevice
  private let dispatch VkDeviceDispatch
  private let allocator VulkanMemoryAllocator
  private let readbackDispatch VulkanReadbackDispatch
  private let extent VkExtent2D
  private let byteSize VkDeviceSize
  private let targetFormat VkFormat
  private var image VkImage
  private var imageView VkImageView
  private var imageAllocation VulkanMemoryAllocation? = nil
  private var stagingBuffer VkBuffer
  private var stagingAllocation VulkanMemoryAllocation? = nil
  private var completionFence VkFence
  private var solidQuad VulkanSolidQuad? = nil
  private var imageLayout VkImageLayout
  private var requestPrepared bool
  private var commandRecorded bool
  private var submissionPending bool
  private var readbackComplete bool
  private var disposed bool

  internal prop CompletionFence VkFence{ get -> completionFence }
  internal prop LiveObjectCount uint32{
    get {
      var count uint32 = 0u
      if image != 0uL { count = count + 1u }
      if imageView != 0uL { count = count + 1u }
      if stagingBuffer != 0uL { count = count + 1u }
      if completionFence != 0uL { count = count + 1u }
      if solidQuad != nil { count = count + 2u }
      return count
    }
  }
  internal prop ReadbackPointer * void{
    get {
      if !readbackComplete {
        throw InvalidOperationException("Vulkan direct quad readback is not complete")
      }
      return stagingAllocation!!.mapped
    }
  }

  internal init(
    nativeDevice VkDevice,
    nativeDispatch VkDeviceDispatch,
    nativeAllocator VulkanMemoryAllocator,
    nativeReadbackDispatch VulkanReadbackDispatch,
    targetExtent VkExtent2D,
    colorFormat VkFormat) {
      if nativeDevice == nint(0) {
        throw ArgumentException("Vulkan device is null", "nativeDevice")
      }
      if targetExtent.width == 0u || targetExtent.height == 0u {
        throw ArgumentOutOfRangeException("targetExtent")
      }
      if colorFormat != VkConstants.VK_FORMAT_R8G8B8A8_UNORM {
        throw ArgumentException("SolidQuad readback requires R8G8B8A8_UNORM", "colorFormat")
      }
      if uint64(targetExtent.width) > uint64.MaxValue / 4uL {
        throw OverflowException("Direct quad readback row byte size overflow")
      }
      let rowBytes = uint64(targetExtent.width) * 4uL
      if uint64(targetExtent.height) > uint64.MaxValue / rowBytes {
        throw OverflowException("Direct quad readback staging byte size overflow")
      }
      this.device = nativeDevice
      this.dispatch = nativeDispatch
      this.allocator = nativeAllocator
      this.readbackDispatch = nativeReadbackDispatch
      this.extent = targetExtent
      this.byteSize = VkDeviceSize(rowBytes * uint64(targetExtent.height))
      this.targetFormat = colorFormat
      this.imageLayout = VkConstants.VK_IMAGE_LAYOUT_UNDEFINED
      Create()
    }

  internal func PrepareSubmit() VkResult {
    if disposed {
      throw ObjectDisposedException("VulkanSolidQuadReadbackTarget")
    }
    if submissionPending {
      return VkConstants.VK_NOT_READY
    }
    if requestPrepared || commandRecorded {
      throw InvalidOperationException("Vulkan direct quad readback is already prepared")
    }
    let resetFences = dispatch.vkResetFences
    let result = resetFences(device, 1u, &completionFence)
    if result == VkConstants.VK_SUCCESS {
      requestPrepared = true
      commandRecorded = false
      readbackComplete = false
    }
    return result
  }

  internal func Record(
    commandBuffer VkCommandBuffer,
    clearColor VkClearColorValue,
    pushConstants SolidQuadPushConstants) {
      if disposed {
        throw ObjectDisposedException("VulkanSolidQuadReadbackTarget")
      }
      if commandBuffer == nint(0) {
        throw ArgumentException("Command buffer is null", "commandBuffer")
      }
      if !requestPrepared {
        throw InvalidOperationException("PrepareSubmit must precede Record")
      }
      if commandRecorded {
        throw InvalidOperationException("Vulkan direct quad command buffer is already recorded")
      }
      BeginRecord(commandBuffer)
      solidQuad!!.Record(commandBuffer, imageView, extent, clearColor, pushConstants)
      FinishRecord(commandBuffer)
    }

  internal func MarkSubmitted(result VkResult) VkResult {
    if disposed {
      throw ObjectDisposedException("VulkanSolidQuadReadbackTarget")
    }
    if !requestPrepared || !commandRecorded {
      throw InvalidOperationException("Vulkan direct quad commands are not ready for submission")
    }
    requestPrepared = false
    commandRecorded = false
    if result == VkConstants.VK_SUCCESS {
      submissionPending = true
      imageLayout = VkConstants.VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL
    }
    return result
  }

  internal func PollCompletion() VkResult {
    if disposed {
      throw ObjectDisposedException("VulkanSolidQuadReadbackTarget")
    }
    if readbackComplete {
      return VkConstants.VK_SUCCESS
    }
    if !submissionPending {
      return VkConstants.VK_NOT_READY
    }
    let getFenceStatus = dispatch.vkGetFenceStatus
    let status = getFenceStatus(device, completionFence)
    if status != VkConstants.VK_SUCCESS {
      return status
    }
    let invalidateResult = allocator.InvalidateAfterFence(stagingAllocation!!, 0uL, byteSize)
    if invalidateResult != VkConstants.VK_SUCCESS {
      return invalidateResult
    }
    readbackComplete = true
    submissionPending = false
    return VkConstants.VK_SUCCESS
  }

  public func Dispose() {
    if disposed {
      return
    }
    if submissionPending {
      let waitForFences = dispatch.vkWaitForFences
      let waitResult = waitForFences(
        device, 1u, &completionFence, VkConstants.VK_TRUE, VkConstants.VK_WHOLE_SIZE)
      if waitResult != VkConstants.VK_SUCCESS {
        throw InvalidOperationException("vkWaitForFences failed for Vulkan direct quad submission")
      }
      let completion = PollCompletion()
      if completion != VkConstants.VK_SUCCESS {
        throw InvalidOperationException("Vulkan direct quad submission is still pending")
      }
    }
    disposed = true
    if solidQuad != nil {
      solidQuad!!.Dispose()
      solidQuad = nil
    }
    if imageView != 0uL {
      let destroyImageView = dispatch.vkDestroyImageView
      destroyImageView(device, imageView, nil)
      imageView = 0uL
    }
    if image != 0uL {
      let destroyImage = dispatch.vkDestroyImage
      destroyImage(device, image, nil)
      image = 0uL
    }
    if imageAllocation != nil {
      allocator.Release(imageAllocation!!)
      imageAllocation = nil
    }
    if stagingBuffer != 0uL {
      let destroyBuffer = dispatch.vkDestroyBuffer
      destroyBuffer(device, stagingBuffer, nil)
      stagingBuffer = 0uL
    }
    if stagingAllocation != nil {
      allocator.Release(stagingAllocation!!)
      stagingAllocation = nil
    }
    if completionFence != 0uL {
      let destroyFence = dispatch.vkDestroyFence
      destroyFence(device, completionFence, nil)
      completionFence = 0uL
    }
  }

  private func BeginRecord(commandBuffer VkCommandBuffer) {
    var subresourceRange = VkImageSubresourceRange{}
    subresourceRange.aspectMask = uint32(VkConstants.VK_IMAGE_ASPECT_COLOR_BIT)
    subresourceRange.levelCount = 1u
    subresourceRange.layerCount = 1u
    var barrier = VkImageMemoryBarrier2{}
    barrier.sType = VkConstants.VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER_2
    if imageLayout == VkConstants.VK_IMAGE_LAYOUT_UNDEFINED {
      barrier.srcStageMask = VkConstants.VK_PIPELINE_STAGE_2_TOP_OF_PIPE_BIT
      barrier.srcAccessMask = VkConstants.VK_ACCESS_2_NONE
    } else if imageLayout == VkConstants.VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL {
      barrier.srcStageMask = VkConstants.VK_PIPELINE_STAGE_2_COPY_BIT
      barrier.srcAccessMask = VkConstants.VK_ACCESS_2_TRANSFER_READ_BIT
    } else {
      throw InvalidOperationException("Vulkan direct quad image has an unsupported layout")
    }
    barrier.dstStageMask = VkConstants.VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT
    barrier.dstAccessMask = VkConstants.VK_ACCESS_2_COLOR_ATTACHMENT_WRITE_BIT
    barrier.oldLayout = imageLayout
    barrier.newLayout = VkConstants.VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL
    barrier.srcQueueFamilyIndex = VkConstants.VK_QUEUE_FAMILY_IGNORED
    barrier.dstQueueFamilyIndex = VkConstants.VK_QUEUE_FAMILY_IGNORED
    barrier.image = image
    barrier.subresourceRange = subresourceRange
    var dependency = VkDependencyInfo{}
    dependency.sType = VkConstants.VK_STRUCTURE_TYPE_DEPENDENCY_INFO
    dependency.imageMemoryBarrierCount = 1u
    dependency.pImageMemoryBarriers = &barrier
    let pipelineBarrier = dispatch.vkCmdPipelineBarrier2
    pipelineBarrier(commandBuffer, &dependency)
  }

  private func FinishRecord(commandBuffer VkCommandBuffer) {
    var subresourceRange = VkImageSubresourceRange{}
    subresourceRange.aspectMask = uint32(VkConstants.VK_IMAGE_ASPECT_COLOR_BIT)
    subresourceRange.levelCount = 1u
    subresourceRange.layerCount = 1u
    var barrier = VkImageMemoryBarrier2{}
    barrier.sType = VkConstants.VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER_2
    barrier.srcStageMask = VkConstants.VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT
    barrier.srcAccessMask = VkConstants.VK_ACCESS_2_COLOR_ATTACHMENT_WRITE_BIT
    barrier.dstStageMask = VkConstants.VK_PIPELINE_STAGE_2_COPY_BIT
    barrier.dstAccessMask = VkConstants.VK_ACCESS_2_TRANSFER_READ_BIT
    barrier.oldLayout = VkConstants.VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL
    barrier.newLayout = VkConstants.VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL
    barrier.srcQueueFamilyIndex = VkConstants.VK_QUEUE_FAMILY_IGNORED
    barrier.dstQueueFamilyIndex = VkConstants.VK_QUEUE_FAMILY_IGNORED
    barrier.image = image
    barrier.subresourceRange = subresourceRange
    var dependency = VkDependencyInfo{}
    dependency.sType = VkConstants.VK_STRUCTURE_TYPE_DEPENDENCY_INFO
    dependency.imageMemoryBarrierCount = 1u
    dependency.pImageMemoryBarriers = &barrier
    let pipelineBarrier = dispatch.vkCmdPipelineBarrier2
    pipelineBarrier(commandBuffer, &dependency)

    var copyRegion = VkBufferImageCopy{}
    copyRegion.imageSubresource = VkImageSubresourceLayers{}
    copyRegion.imageSubresource.aspectMask = uint32(VkConstants.VK_IMAGE_ASPECT_COLOR_BIT)
    copyRegion.imageSubresource.layerCount = 1u
    copyRegion.imageExtent = VkExtent3D{
      width: extent.width,
      height: extent.height,
      depth: 1u,
    }
    readbackDispatch.CopyImageToBuffer(commandBuffer, image,
      VkConstants.VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL, stagingBuffer, copyRegion)
    commandRecorded = true
  }

  private func Create() {
    try {
      var imageCreateInfo = VkImageCreateInfo{}
      imageCreateInfo.sType = VkConstants.VK_STRUCTURE_TYPE_IMAGE_CREATE_INFO
      imageCreateInfo.imageType = VkConstants.VK_IMAGE_TYPE_2D
      imageCreateInfo.format = targetFormat
      imageCreateInfo.extent = VkExtent3D{
        width: extent.width,
        height: extent.height,
        depth: 1u,
      }
      imageCreateInfo.mipLevels = 1u
      imageCreateInfo.arrayLayers = 1u
      imageCreateInfo.samples = VkConstants.VK_SAMPLE_COUNT_1_BIT
      imageCreateInfo.tiling = VkConstants.VK_IMAGE_TILING_OPTIMAL
      imageCreateInfo.usage = uint32(VkConstants.VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT)
      | uint32(VkConstants.VK_IMAGE_USAGE_TRANSFER_SRC_BIT)
      imageCreateInfo.sharingMode = VkConstants.VK_SHARING_MODE_EXCLUSIVE
      imageCreateInfo.initialLayout = VkConstants.VK_IMAGE_LAYOUT_UNDEFINED
      let createImage = dispatch.vkCreateImage
      if createImage(device, &imageCreateInfo, nil, &image) != VkConstants.VK_SUCCESS
        || image == 0uL {
          throw InvalidOperationException("vkCreateImage failed")
        }
      imageAllocation = allocator.AllocateImage(
        image,
        VulkanMemoryPolicy(0u, uint32(VkConstants.VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT)))

      var imageViewCreateInfo = VkImageViewCreateInfo{}
      imageViewCreateInfo.sType = VkConstants.VK_STRUCTURE_TYPE_IMAGE_VIEW_CREATE_INFO
      imageViewCreateInfo.image = image
      imageViewCreateInfo.viewType = VkConstants.VK_IMAGE_VIEW_TYPE_2D
      imageViewCreateInfo.format = targetFormat
      imageViewCreateInfo.components = VkComponentMapping{
        r: VkConstants.VK_COMPONENT_SWIZZLE_IDENTITY,
        g: VkConstants.VK_COMPONENT_SWIZZLE_IDENTITY,
        b: VkConstants.VK_COMPONENT_SWIZZLE_IDENTITY,
        a: VkConstants.VK_COMPONENT_SWIZZLE_IDENTITY,
      }
      imageViewCreateInfo.subresourceRange = VkImageSubresourceRange{}
      imageViewCreateInfo.subresourceRange.aspectMask = uint32(VkConstants.VK_IMAGE_ASPECT_COLOR_BIT)
      imageViewCreateInfo.subresourceRange.levelCount = 1u
      imageViewCreateInfo.subresourceRange.layerCount = 1u
      let createImageView = dispatch.vkCreateImageView
      if createImageView(device, &imageViewCreateInfo, nil, &imageView) != VkConstants.VK_SUCCESS
        || imageView == 0uL {
          throw InvalidOperationException("vkCreateImageView failed")
        }

      var bufferCreateInfo = VkBufferCreateInfo{}
      bufferCreateInfo.sType = VkConstants.VK_STRUCTURE_TYPE_BUFFER_CREATE_INFO
      bufferCreateInfo.size = byteSize
      bufferCreateInfo.usage = uint32(VkConstants.VK_BUFFER_USAGE_TRANSFER_DST_BIT)
      bufferCreateInfo.sharingMode = VkConstants.VK_SHARING_MODE_EXCLUSIVE
      let createBuffer = dispatch.vkCreateBuffer
      if createBuffer(device, &bufferCreateInfo, nil, &stagingBuffer) != VkConstants.VK_SUCCESS
        || stagingBuffer == 0uL {
          throw InvalidOperationException("vkCreateBuffer failed")
        }
      stagingAllocation = allocator.AllocateBuffer(
        stagingBuffer,
        VulkanMemoryPolicy.HostVisibleCoherentCached)
      if allocator.Map(stagingAllocation!!) != VkConstants.VK_SUCCESS {
        throw InvalidOperationException("vkMapMemory failed")
      }

      var fenceCreateInfo = VkFenceCreateInfo{}
      fenceCreateInfo.sType = VkConstants.VK_STRUCTURE_TYPE_FENCE_CREATE_INFO
      fenceCreateInfo.flags = uint32(VkConstants.VK_FENCE_CREATE_SIGNALED_BIT)
      let createFence = dispatch.vkCreateFence
      if createFence(device, &fenceCreateInfo, nil, &completionFence) != VkConstants.VK_SUCCESS
        || completionFence == 0uL {
          throw InvalidOperationException("vkCreateFence failed")
        }
      solidQuad = VulkanSolidQuad(device, dispatch, targetFormat)
    } catch (error Exception) {
      Dispose()
      throw error
    }
  }
}
