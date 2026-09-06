package Goo.VulkanProof

import System
import Goo

internal unsafe class VulkanSwapchainGeneration : IDisposable {
  private let device VkDevice
  private let dispatch VkDeviceDispatch
  private let surface VkSurfaceKHR
  private let surfaceFormat VkSurfaceFormatKHR
  private let preTransform VkSurfaceTransformFlagBitsKHR
  private let extent VkExtent2D
  private let generation uint64
  private var imageCount uint32
  private var swapchain VkSwapchainKHR
  private var images [] ? VkImage = nil
  private var imageViews [] ? VkImageView = nil
  private var renderSemaphores [] ? VkSemaphore = nil
  private var presentFences [] ? VkFence = nil
  private var presentFencePrepared [] ? bool = nil
  private var presentFencePending [] ? bool = nil
  private var presentIds [] ? uint64 = nil
  private var imageLayouts [] ? VkImageLayout = nil
  private var disposed bool

  internal prop Handle VkSwapchainKHR{
    get {
      EnsureUsable()
      return swapchain
    }
  }

  internal prop Generation uint64{
    get {
      EnsureUsable()
      return generation
    }
  }

  internal prop Extent VkExtent2D{
    get {
      EnsureUsable()
      return extent
    }
  }

  internal prop SurfaceFormat VkSurfaceFormatKHR{
    get {
      EnsureUsable()
      return surfaceFormat
    }
  }

  internal prop Format VkFormat{
    get {
      EnsureUsable()
      return surfaceFormat.format
    }
  }

  internal prop ImageCount uint32{
    get {
      EnsureUsable()
      return imageCount
    }
  }

  internal init(
    nativeDevice VkDevice,
    nativeDispatch VkDeviceDispatch,
    nativeSurface VkSurfaceKHR,
    capabilities VkSurfaceCapabilitiesKHR,
    chosenSurfaceFormat VkSurfaceFormatKHR,
    chosenPresentMode VkPresentModeKHR,
    desiredExtent VkExtent2D,
    chosenCompositeAlpha VkCompositeAlphaFlagBitsKHR,
    oldSwapchain VkSwapchainKHR,
    generationId uint64) {
      if nativeDevice == nint(0) {
        throw ArgumentException("Vulkan device is null", "nativeDevice")
      }
      if nativeSurface == 0uL {
        throw ArgumentException("Vulkan surface is null", "nativeSurface")
      }
      if desiredExtent.width == 0u || desiredExtent.height == 0u {
        throw ArgumentOutOfRangeException("desiredExtent")
      }
      if (capabilities.supportedUsageFlags & uint32(VkConstants.VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT)) == 0u {
        throw InvalidOperationException("Vulkan surface does not support color attachment swapchain images")
      }
      if (capabilities.supportedCompositeAlpha & uint32(chosenCompositeAlpha)) == 0u {
        throw ArgumentException("Chosen composite alpha is not supported by the Vulkan surface", "chosenCompositeAlpha")
      }
      if capabilities.maxImageCount != 0u && capabilities.maxImageCount < capabilities.minImageCount {
        throw InvalidOperationException("Vulkan surface image count limits are invalid")
      }
      if capabilities.minImageCount == uint32.MaxValue {
        throw InvalidOperationException("Vulkan surface minimum image count cannot be incremented")
      }

      let resolvedExtent = ResolveExtent(capabilities, desiredExtent)
      if resolvedExtent.width == 0u || resolvedExtent.height == 0u {
        throw ArgumentOutOfRangeException("desiredExtent")
      }

      var requestedImageCount = capabilities.minImageCount + 1u
      if capabilities.maxImageCount != 0u && requestedImageCount > capabilities.maxImageCount {
        requestedImageCount = capabilities.maxImageCount
      }
      if requestedImageCount == 0u || requestedImageCount > 2147483647u {
        throw InvalidOperationException("Vulkan surface image count cannot be represented by a managed array")
      }

      this.device = nativeDevice
      this.dispatch = nativeDispatch
      this.surface = nativeSurface
      this.surfaceFormat = chosenSurfaceFormat
      this.preTransform = capabilities.currentTransform
      this.extent = resolvedExtent
      this.generation = generationId
      this.imageCount = requestedImageCount
      Create(chosenPresentMode, chosenCompositeAlpha, oldSwapchain)
    }

  internal func Image(index uint32) VkImage {
    EnsureIndex(index)
    let storage = images
    if storage == nil {
      throw InvalidOperationException("Vulkan swapchain images are unavailable")
    }
    return storage!! [int32(index)]
  }

  internal func ImageView(index uint32) VkImageView {
    EnsureIndex(index)
    let storage = imageViews
    if storage == nil {
      throw InvalidOperationException("Vulkan swapchain image views are unavailable")
    }
    return storage!! [int32(index)]
  }

  internal func RenderSemaphore(index uint32) VkSemaphore {
    EnsureIndex(index)
    let storage = renderSemaphores
    if storage == nil {
      throw InvalidOperationException("Vulkan swapchain render semaphores are unavailable")
    }
    return storage!! [int32(index)]
  }

  internal func PreparePresent(index uint32, out completedPresentId uint64) VkFence {
    EnsureIndex(index)
    completedPresentId = 0uL
    let fences = presentFences
    let prepared = presentFencePrepared
    let pending = presentFencePending
    let presentIdsStorage = presentIds
    if fences == nil || prepared == nil || pending == nil || presentIdsStorage == nil {
      throw InvalidOperationException("Vulkan swapchain present fences are unavailable")
    }
    if prepared!! [int32(index)] || pending!! [int32(index)] {
      if prepared!! [int32(index)] {
        throw InvalidOperationException("Vulkan swapchain present fence is still prepared")
      }
      var pendingFence = fences!! [int32(index)]
      let waitForFences = dispatch.vkWaitForFences
      let waitResult = waitForFences(device, 1u, &pendingFence, VkConstants.VK_TRUE, VkConstants.VK_WHOLE_SIZE)
      if waitResult != VkConstants.VK_SUCCESS {
        throw InvalidOperationException("vkWaitForFences failed for Vulkan swapchain present fence")
      }
      completedPresentId = presentIdsStorage!! [int32(index)]
      pending!! [int32(index)] = false
      presentIdsStorage!! [int32(index)] = 0uL
    }
    var fence = fences!! [int32(index)]
    let resetFences = dispatch.vkResetFences
    let resetResult = resetFences(device, 1u, &fence)
    if resetResult != VkConstants.VK_SUCCESS {
      throw InvalidOperationException("vkResetFences failed for Vulkan swapchain present fence")
    }
    prepared!! [int32(index)] = true
    return fence
  }

  internal func MarkPresented(index uint32, result VkResult, presentId uint64) VkResult {
    EnsureIndex(index)
    let prepared = presentFencePrepared
    let pending = presentFencePending
    let presentIdsStorage = presentIds
    if prepared == nil || pending == nil || presentIdsStorage == nil {
      throw InvalidOperationException("Vulkan swapchain present fences are unavailable")
    }
    if !prepared!! [int32(index)] {
      throw InvalidOperationException("Vulkan swapchain present fence was not prepared")
    }
    if result == VkConstants.VK_SUCCESS || result == VkConstants.VK_SUBOPTIMAL_KHR {
      if presentId == 0uL {
        throw InvalidOperationException("Vulkan successful presentation must have a nonzero present id")
      }
      pending!! [int32(index)] = true
      presentIdsStorage!! [int32(index)] = presentId
    } else if result == VkConstants.VK_ERROR_OUT_OF_DATE_KHR
      || result == VkConstants.VK_ERROR_SURFACE_LOST_KHR{
        if presentId != 0uL {
          throw InvalidOperationException("Vulkan failed presentation must have a zero present id")
        }
        pending!! [int32(index)] = true
        presentIdsStorage!! [int32(index)] = 0uL
      } else {
        if presentId != 0uL {
          throw InvalidOperationException("Vulkan failed presentation must have a zero present id")
        }
        pending!! [int32(index)] = false
        presentIdsStorage!! [int32(index)] = 0uL
      }
    prepared!! [int32(index)] = false
    return result
  }

  internal func WaitForPresentCompletion(retirement VulkanPresentationRetirement) VkResult {
    EnsureUsable()
    let fences = presentFences
    let pending = presentFencePending
    let prepared = presentFencePrepared
    let presentIdsStorage = presentIds
    if fences == nil || pending == nil || prepared == nil || presentIdsStorage == nil {
      throw InvalidOperationException("Vulkan swapchain present fences are unavailable")
    }
    var index uint32 = 0u
    while index < imageCount {
      if prepared!! [int32(index)] {
        throw InvalidOperationException("Vulkan swapchain present fence is prepared but not submitted")
      }
      if pending!! [int32(index)] {
        let waitForFences = dispatch.vkWaitForFences
        var fence = fences!! [int32(index)]
        let result = waitForFences(device, 1u, &fence, VkConstants.VK_TRUE, VkConstants.VK_WHOLE_SIZE)
        if result != VkConstants.VK_SUCCESS {
          return result
        }
        let completedPresentId = presentIdsStorage!! [int32(index)]
        if completedPresentId != 0uL {
          retirement.CompletePresent(completedPresentId)
        }
        pending!! [int32(index)] = false
        presentIdsStorage!! [int32(index)] = 0uL
      }
      index++
    }
    return VkConstants.VK_SUCCESS
  }

  internal func CurrentLayout(index uint32) VkImageLayout {
    EnsureIndex(index)
    let storage = imageLayouts
    if storage == nil {
      throw InvalidOperationException("Vulkan swapchain image layouts are unavailable")
    }
    return storage!! [int32(index)]
  }

  internal func CommitLayout(index uint32, layout VkImageLayout) {
    EnsureIndex(index)
    let storage = imageLayouts
    if storage == nil {
      throw InvalidOperationException("Vulkan swapchain image layouts are unavailable")
    }
    storage!! [int32(index)] = layout
  }

  public func Dispose() {
    if disposed {
      return
    }
    let prepared = presentFencePrepared
    let pending = presentFencePending
    if prepared != nil && pending != nil {
      var index int32 = 0
      while index < prepared!!.Length {
        if prepared!! [index] || pending!! [index] {
          throw InvalidOperationException("Vulkan swapchain present fence is still in use")
        }
        index++
      }
    }
    disposed = true

    if let storage = renderSemaphores {
      let destroySemaphore = dispatch.vkDestroySemaphore
      var index int32 = 0
      while index < storage.Length {
        if storage[index] != 0uL {
          destroySemaphore(device, storage[index], nil)
          storage[index] = 0uL
        }
        index++
      }
    }
    if let storage = presentFences {
      let destroyFence = dispatch.vkDestroyFence
      var index int32 = 0
      while index < storage.Length {
        if storage[index] != 0uL {
          destroyFence(device, storage[index], nil)
          storage[index] = 0uL
        }
        index++
      }
    }
    if let storage = imageViews {
      let destroyImageView = dispatch.vkDestroyImageView
      var index int32 = 0
      while index < storage.Length {
        if storage[index] != 0uL {
          destroyImageView(device, storage[index], nil)
          storage[index] = 0uL
        }
        index++
      }
    }
    if swapchain != 0uL {
      let destroySwapchain = dispatch.vkDestroySwapchainKHR
      destroySwapchain(device, swapchain, nil)
      swapchain = 0uL
    }
  }

  private func EnsureUsable() {
    if disposed {
      throw ObjectDisposedException("VulkanSwapchainGeneration")
    }
  }

  private func EnsureIndex(index uint32) {
    EnsureUsable()
    if index >= imageCount {
      throw ArgumentOutOfRangeException("index")
    }
  }

  private func ResolveExtent(capabilities VkSurfaceCapabilitiesKHR, desired VkExtent2D) VkExtent2D {
    if capabilities.currentExtent.width != uint32.MaxValue {
      return capabilities.currentExtent
    }
    var resolved = desired
    if resolved.width < capabilities.minImageExtent.width {
      resolved.width = capabilities.minImageExtent.width
    } else if resolved.width > capabilities.maxImageExtent.width {
      resolved.width = capabilities.maxImageExtent.width
    }
    if resolved.height < capabilities.minImageExtent.height {
      resolved.height = capabilities.minImageExtent.height
    } else if resolved.height > capabilities.maxImageExtent.height {
      resolved.height = capabilities.maxImageExtent.height
    }
    return resolved
  }

  private func Create(
    chosenPresentMode VkPresentModeKHR,
    chosenCompositeAlpha VkCompositeAlphaFlagBitsKHR,
    oldSwapchain VkSwapchainKHR) {
      try {
        var createInfo = VkSwapchainCreateInfoKHR{}
        createInfo.sType = VkConstants.VK_STRUCTURE_TYPE_SWAPCHAIN_CREATE_INFO_KHR
        createInfo.surface = surface
        createInfo.minImageCount = imageCount
        createInfo.imageFormat = surfaceFormat.format
        createInfo.imageColorSpace = surfaceFormat.colorSpace
        createInfo.imageExtent = extent
        createInfo.imageArrayLayers = 1u
        createInfo.imageUsage = uint32(VkConstants.VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT)
        createInfo.imageSharingMode = VkConstants.VK_SHARING_MODE_EXCLUSIVE
        createInfo.preTransform = preTransform
        createInfo.compositeAlpha = chosenCompositeAlpha
        createInfo.presentMode = chosenPresentMode
        createInfo.clipped = VkConstants.VK_TRUE
        createInfo.oldSwapchain = oldSwapchain
        let createSwapchain = dispatch.vkCreateSwapchainKHR
        let createResult = createSwapchain(device, &createInfo, nil, &swapchain)
        if createResult != VkConstants.VK_SUCCESS || swapchain == 0uL {
          throw InvalidOperationException("vkCreateSwapchainKHR failed")
        }

        var queriedImageCount uint32 = 0u
        let getSwapchainImages = dispatch.vkGetSwapchainImagesKHR
        let queryResult = getSwapchainImages(device, swapchain, &queriedImageCount, nil)
        if queryResult != VkConstants.VK_SUCCESS || queriedImageCount == 0u {
          throw InvalidOperationException("Swapchain images are unavailable")
        }
        if queriedImageCount > 2147483647u {
          throw InvalidOperationException("Vulkan swapchain image count changed during enumeration")
        }
        imageCount = queriedImageCount

        let capacity = int32(queriedImageCount)
        let imageStorage []VkImage = [capacity]VkImage
        let viewStorage []VkImageView = [capacity]VkImageView
        let semaphoreStorage []VkSemaphore = [capacity]VkSemaphore
        let presentFenceStorage []VkFence = [capacity]VkFence
        let presentFencePreparedStorage []bool = [capacity]bool
        let presentFencePendingStorage []bool = [capacity]bool
        let presentIdStorage []uint64 = [capacity]uint64
        let layoutStorage []VkImageLayout = [capacity]VkImageLayout
        images = imageStorage
        imageViews = viewStorage
        renderSemaphores = semaphoreStorage
        presentFences = presentFenceStorage
        presentFencePrepared = presentFencePreparedStorage
        presentFencePending = presentFencePendingStorage
        presentIds = presentIdStorage
        imageLayouts = layoutStorage

        var enumeratedImageCount = queriedImageCount
        fixed imagePointer * VkImage = imageStorage{
          let enumerateResult = getSwapchainImages(device, swapchain, &enumeratedImageCount, imagePointer)
          if enumerateResult != VkConstants.VK_SUCCESS || enumeratedImageCount != queriedImageCount {
            throw InvalidOperationException("Swapchain image enumeration failed")
          }
        }

        var imageIndex uint32 = 0u
        while imageIndex < imageCount {
          var imageViewCreateInfo = VkImageViewCreateInfo{}
          imageViewCreateInfo.sType = VkConstants.VK_STRUCTURE_TYPE_IMAGE_VIEW_CREATE_INFO
          imageViewCreateInfo.image = imageStorage[int32(imageIndex)]
          imageViewCreateInfo.viewType = VkConstants.VK_IMAGE_VIEW_TYPE_2D
          imageViewCreateInfo.format = surfaceFormat.format
          imageViewCreateInfo.components.r = VkConstants.VK_COMPONENT_SWIZZLE_IDENTITY
          imageViewCreateInfo.components.g = VkConstants.VK_COMPONENT_SWIZZLE_IDENTITY
          imageViewCreateInfo.components.b = VkConstants.VK_COMPONENT_SWIZZLE_IDENTITY
          imageViewCreateInfo.components.a = VkConstants.VK_COMPONENT_SWIZZLE_IDENTITY
          imageViewCreateInfo.subresourceRange.aspectMask = uint32(VkConstants.VK_IMAGE_ASPECT_COLOR_BIT)
          imageViewCreateInfo.subresourceRange.baseMipLevel = 0u
          imageViewCreateInfo.subresourceRange.levelCount = 1u
          imageViewCreateInfo.subresourceRange.baseArrayLayer = 0u
          imageViewCreateInfo.subresourceRange.layerCount = 1u
          var imageView VkImageView = 0uL
          let createImageView = dispatch.vkCreateImageView
          let viewResult = createImageView(device, &imageViewCreateInfo, nil, &imageView)
          if viewResult != VkConstants.VK_SUCCESS || imageView == 0uL {
            throw InvalidOperationException("vkCreateImageView failed")
          }
          viewStorage[int32(imageIndex)] = imageView
          imageLayouts!! [int32(imageIndex)] = VkConstants.VK_IMAGE_LAYOUT_UNDEFINED
          imageIndex++
        }

        var semaphoreCreateInfo = VkSemaphoreCreateInfo{}
        semaphoreCreateInfo.sType = VkConstants.VK_STRUCTURE_TYPE_SEMAPHORE_CREATE_INFO
        let createSemaphore = dispatch.vkCreateSemaphore
        imageIndex = 0u
        while imageIndex < imageCount {
          var semaphore VkSemaphore = 0uL
          let semaphoreResult = createSemaphore(device, &semaphoreCreateInfo, nil, &semaphore)
          if semaphoreResult != VkConstants.VK_SUCCESS || semaphore == 0uL {
            throw InvalidOperationException("vkCreateSemaphore failed for swapchain render semaphore")
          }
          semaphoreStorage[int32(imageIndex)] = semaphore
          imageIndex++
        }

        var fenceCreateInfo = VkFenceCreateInfo{}
        fenceCreateInfo.sType = VkConstants.VK_STRUCTURE_TYPE_FENCE_CREATE_INFO
        let createFence = dispatch.vkCreateFence
        imageIndex = 0u
        while imageIndex < imageCount {
          var fence VkFence = 0uL
          let fenceResult = createFence(device, &fenceCreateInfo, nil, &fence)
          if fenceResult != VkConstants.VK_SUCCESS || fence == 0uL {
            throw InvalidOperationException("vkCreateFence failed for swapchain present fence")
          }
          presentFenceStorage[int32(imageIndex)] = fence
          imageIndex++
        }
      } catch (error Exception) {
        Dispose()
        throw error
      }
    }

}
