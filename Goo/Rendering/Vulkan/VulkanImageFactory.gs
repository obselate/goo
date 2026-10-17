package Goo

import System

internal data struct VulkanImageCreation(
  Image VkImage,
  ImageView VkImageView,
  Allocation VulkanMemoryAllocation) { }

internal unsafe class VulkanImageFactory {
  shared {
    internal func Create2D(
      device VkDevice,
      dispatch VkDeviceDispatch,
      allocator VulkanMemoryAllocator,
      objectAccounting VulkanObjectAccounting?,
      extent VkExtent2D,
      format VkFormat,
      usage VkImageUsageFlags,
      aspectMask VkImageAspectFlags,
      memoryPolicy VulkanMemoryPolicy,
      ownerKind VulkanMemoryOwnerKind = VulkanMemoryOwnerKind.Image) VulkanImageCreation ->
    Create(
      device,
      dispatch,
      allocator,
      objectAccounting,
      extent,
      format,
      usage,
      aspectMask,
      1u,
      VkConstants.VK_IMAGE_VIEW_TYPE_2D,
      memoryPolicy, ownerKind)

    internal func Create2DArray(
      device VkDevice,
      dispatch VkDeviceDispatch,
      allocator VulkanMemoryAllocator,
      objectAccounting VulkanObjectAccounting?,
      extent VkExtent2D,
      format VkFormat,
      usage VkImageUsageFlags,
      aspectMask VkImageAspectFlags,
      layerCount uint32,
      memoryPolicy VulkanMemoryPolicy,
      ownerKind VulkanMemoryOwnerKind = VulkanMemoryOwnerKind.Image) VulkanImageCreation ->
    Create(
      device,
      dispatch,
      allocator,
      objectAccounting,
      extent,
      format,
      usage,
      aspectMask,
      layerCount,
      VkConstants.VK_IMAGE_VIEW_TYPE_2D_ARRAY,
      memoryPolicy, ownerKind)

    internal func CreateView(
      device VkDevice,
      dispatch VkDeviceDispatch,
      objectAccounting VulkanObjectAccounting?,
      image VkImage,
      viewType VkImageViewType,
      format VkFormat,
      aspectMask VkImageAspectFlags,
      baseArrayLayer uint32,
      layerCount uint32) VkImageView{

        if image == 0uL {
          throw ArgumentException("image")
        }
        if format == VkConstants.VK_FORMAT_UNDEFINED {
          throw ArgumentException("format")
        }
        if aspectMask == 0u {
          throw ArgumentOutOfRangeException("aspectMask")
        }
        if layerCount == 0u {
          throw ArgumentOutOfRangeException("layerCount")
        }

        var imageView VkImageView = 0uL
        var imageViewAccounted bool = false
        var viewInfo = VkImageViewCreateInfo{
          sType: VkConstants.VK_STRUCTURE_TYPE_IMAGE_VIEW_CREATE_INFO,
          pNext: nil,
          flags: 0u,
          image: image,
          viewType: viewType,
          format: format,
          components: VkComponentMapping{
            r: VkConstants.VK_COMPONENT_SWIZZLE_IDENTITY,
            g: VkConstants.VK_COMPONENT_SWIZZLE_IDENTITY,
            b: VkConstants.VK_COMPONENT_SWIZZLE_IDENTITY,
            a: VkConstants.VK_COMPONENT_SWIZZLE_IDENTITY,
          },
          subresourceRange: VkImageSubresourceRange{
            aspectMask: aspectMask,
            baseMipLevel: 0u,
            levelCount: 1u,
            baseArrayLayer: baseArrayLayer,
            layerCount: layerCount,
          },
        }

        try {
          let createImageView = dispatch.vkCreateImageView
          let viewResult = createImageView(device, &viewInfo, nil, &imageView)
          if viewResult != VkConstants.VK_SUCCESS || imageView == 0uL {
            throw InvalidOperationException("vkCreateImageView failed: " + viewResult.ToString())
          }
          if let accounting = objectAccounting {
            accounting.Allocate()
            imageViewAccounted = true
          }
          return imageView
        } catch (error Exception) {
          if imageView != 0uL {
            let destroyImageView = dispatch.vkDestroyImageView
            try { destroyImageView(device, imageView, nil) } catch (cleanup Exception) { }
          }
          if imageViewAccounted {
            if let accounting = objectAccounting {
              try { accounting.Release() } catch (cleanup Exception) { }
            }
          }
          throw error
        }
      }

    private func Create(
      device VkDevice,
      dispatch VkDeviceDispatch,
      allocator VulkanMemoryAllocator,
      objectAccounting VulkanObjectAccounting?,
      extent VkExtent2D,
      format VkFormat,
      usage VkImageUsageFlags,
      aspectMask VkImageAspectFlags,
      layerCount uint32,
      viewType VkImageViewType,
      memoryPolicy VulkanMemoryPolicy, ownerKind VulkanMemoryOwnerKind) VulkanImageCreation{

        if extent.width == 0u || extent.height == 0u {
          throw ArgumentOutOfRangeException("extent")
        }
        if format == VkConstants.VK_FORMAT_UNDEFINED {
          throw ArgumentException("format")
        }
        if usage == 0u {
          throw ArgumentOutOfRangeException("usage")
        }
        if aspectMask == 0u {
          throw ArgumentOutOfRangeException("aspectMask")
        }
        if layerCount == 0u {
          throw ArgumentOutOfRangeException("layerCount")
        }

        var image VkImage = 0uL
        var imageView VkImageView = 0uL
        var allocation VulkanMemoryAllocation? = nil
        var imageAccounted bool = false
        var imageViewAccounted bool = false
        var imageInfo = VkImageCreateInfo{
          sType: VkConstants.VK_STRUCTURE_TYPE_IMAGE_CREATE_INFO,
          pNext: nil,
          flags: 0u,
          imageType: VkConstants.VK_IMAGE_TYPE_2D,
          format: format,
          extent: VkExtent3D{
            width: extent.width,
            height: extent.height,
            depth: 1u,
          },
          mipLevels: 1u,
          arrayLayers: layerCount,
          samples: VkConstants.VK_SAMPLE_COUNT_1_BIT,
          tiling: VkConstants.VK_IMAGE_TILING_OPTIMAL,
          usage: usage,
          sharingMode: VkConstants.VK_SHARING_MODE_EXCLUSIVE,
          queueFamilyIndexCount: 0u,
          pQueueFamilyIndices: nil,
          initialLayout: VkConstants.VK_IMAGE_LAYOUT_UNDEFINED,
        }

        try {
          let createImage = dispatch.vkCreateImage
          let imageResult = createImage(device, &imageInfo, nil, &image)
          if imageResult != VkConstants.VK_SUCCESS || image == 0uL {
            throw InvalidOperationException("vkCreateImage failed: " + imageResult.ToString())
          }
          if let accounting = objectAccounting {
            accounting.Allocate()
            imageAccounted = true
          }

          let createdAllocation = allocator.AllocateImage(
            image,
            memoryPolicy)
          allocation = createdAllocation
          createdAllocation.ownerKind = if ownerKind == VulkanMemoryOwnerKind.Image
            && (usage & uint32(VkConstants.VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT)) != 0u {
            VulkanMemoryOwnerKind.LayerTarget
          } else { ownerKind }
          if let recorder = FrameRecorder.Current {
            allocator.ProfileAllocation(recorder, createdAllocation, FrameTraceKind.ResourceLifecycle,
              VulkanDiagnosticEventIds.ResourceCreate, width: int32(extent.width), height: int32(extent.height),
              format: format, layers: layerCount)
          }

          imageView = CreateView(
            device,
            dispatch,
            objectAccounting,
            image,
            viewType,
            format,
            aspectMask,
            0u,
            layerCount)
          imageViewAccounted = objectAccounting != nil

          return VulkanImageCreation(image, imageView, createdAllocation)
        } catch (error Exception) {
          if imageView != 0uL {
            let destroyImageView = dispatch.vkDestroyImageView
            try { destroyImageView(device, imageView, nil) } catch (cleanup Exception) { }
          }
          if imageViewAccounted {
            if let accounting = objectAccounting {
              try { accounting.Release() } catch (cleanup Exception) { }
            }
          }
          if image != 0uL {
            let destroyImage = dispatch.vkDestroyImage
            try { destroyImage(device, image, nil) } catch (cleanup Exception) { }
          }
          if imageAccounted {
            if let accounting = objectAccounting {
              try { accounting.Release() } catch (cleanup Exception) { }
            }
          }
          if let createdAllocation = allocation {
            try { allocator.Release(createdAllocation) } catch (cleanup Exception) { }
          }
          throw error
        }
      }
  }
}
