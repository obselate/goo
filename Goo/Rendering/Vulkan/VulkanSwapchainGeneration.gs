package Goo

import System

internal unsafe partial class VulkanSwapchainGeneration : IDisposable {
  private let device VkDevice
  private let dispatch VkDeviceDispatch
  private let surface VkSurfaceKHR
  private let surfaceFormat VkSurfaceFormatKHR
  private let presentMode VkPresentModeKHR
  private let preTransform VkSurfaceTransformFlagBitsKHR
  private let extent VkExtent2D
  private let generation uint64
  private let swapchainMaintenanceEnabled bool
  private let objectAccounting VulkanObjectAccounting?
  private let requestedImageCount uint32
  private var swapchain VkSwapchainKHR
  private var imageSet VulkanSwapchainImageSet? = nil
  private var disposed bool
  private let imageUsage uint32

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

  internal prop PresentMode VkPresentModeKHR{
    get {
      EnsureUsable()
      return presentMode
    }
  }

  internal prop Format VkFormat{
    get {
      EnsureUsable()
      return surfaceFormat.format
    }
  }

  internal prop SupportsTransferSource bool{
    get -> (imageUsage & uint32(VkConstants.VK_IMAGE_USAGE_TRANSFER_SRC_BIT)) != 0u
  }

  internal prop ImageCount uint32{
    get -> RequireImageSet().Count
  }

  internal prop PresentFenceEnabled bool{
    get -> RequireImageSet().PresentFenceEnabled
  }

  internal func AppliedSceneVersion(index uint32) uint64
  -> RequireImageSet().AppliedSceneVersion(index)

  internal func PendingSceneVersion(index uint32) uint64
  -> RequireImageSet().PendingSceneVersion(index)

  internal func PromoteAcquiredSceneVersion(index uint32) bool
  -> RequireImageSet().PromoteAcquiredSceneVersion(index)

  internal func SetPendingSceneVersion(index uint32, version uint64) {
    RequireImageSet().SetPendingSceneVersion(index, version)
  }

  internal func ResetSceneVersions() {
    RequireImageSet().ResetSceneVersions()
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
    generationId uint64,
    enablePresentFence bool,
    nativeObjectAccounting VulkanObjectAccounting?,
    preferRequestedExtent bool = false) {
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

      let resolvedExtent = ResolveExtent(capabilities, desiredExtent, preferRequestedExtent)
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
      if (capabilities.supportedTransforms & uint32(VkConstants.VK_SURFACE_TRANSFORM_IDENTITY_BIT_KHR)) == 0u {
        throw InvalidOperationException("Vulkan surface does not support unrotated presentation")
      }

      this.device = nativeDevice
      this.dispatch = nativeDispatch
      this.surface = nativeSurface
      this.surfaceFormat = chosenSurfaceFormat
      this.presentMode = chosenPresentMode
      this.preTransform = VkConstants.VK_SURFACE_TRANSFORM_IDENTITY_BIT_KHR
      this.extent = resolvedExtent
      this.generation = generationId
      this.swapchainMaintenanceEnabled = enablePresentFence
      objectAccounting = nativeObjectAccounting
      imageUsage = uint32(VkConstants.VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT)
      | (capabilities.supportedUsageFlags
        &uint32(VkConstants.VK_IMAGE_USAGE_TRANSFER_SRC_BIT))
      this.requestedImageCount = requestedImageCount
      Create(chosenPresentMode, chosenCompositeAlpha, oldSwapchain)
    }

  internal func Image(index uint32) VkImage -> RequireImageSet().Image(index)

  internal func ImageView(index uint32) VkImageView -> RequireImageSet().ImageView(index)

  internal func RenderSemaphore(index uint32) VkSemaphore
  -> RequireImageSet().RenderSemaphore(index)

  internal func TryPreparePresent(index uint32, out fence VkFence,
    out completedPresentId uint64) VkResult
  -> RequireImageSet().TryPreparePresent(index, out fence, out completedPresentId)

  internal func ReconcilePreparedPresent(index uint32, presentAttempted bool) {
    RequireImageSet().ReconcilePreparedPresent(index, presentAttempted)
  }

  internal func MarkPresented(index uint32, result VkResult, presentId uint64) VkResult
  -> RequireImageSet().MarkPresented(index, result, presentId)

  internal func WaitForPresentCompletion(retirement VulkanPresentationRetirement) VkResult
  -> RequireImageSet().WaitForPresentCompletion(retirement)

  internal func PollForPresentCompletion(retirement VulkanPresentationRetirement) VkResult
  -> RequireImageSet().PollForPresentCompletion(retirement)

  internal func CurrentLayout(index uint32) VkImageLayout
  -> RequireImageSet().CurrentLayout(index)

  internal func CommitLayout(index uint32, layout VkImageLayout) {
    RequireImageSet().CommitLayout(index, layout)
  }

  public func Dispose() {
    if disposed {
      return
    }
    if let storage = imageSet {
      storage.Dispose()
    }
    disposed = true
    imageSet = nil
    if swapchain != 0uL {
      let destroySwapchain = dispatch.vkDestroySwapchainKHR
      destroySwapchain(device, swapchain, nil)
      if let accounting = objectAccounting {
        accounting.Release()
      }
      swapchain = 0uL
    }
  }

  private func EnsureUsable() {
    if disposed {
      throw ObjectDisposedException("VulkanSwapchainGeneration")
    }
  }

  private func RequireImageSet() VulkanSwapchainImageSet {
    EnsureUsable()
    guard let storage = imageSet else {
      throw InvalidOperationException("Vulkan swapchain images are unavailable")
    }
    return storage
  }

  private func ResolveExtent(capabilities VkSurfaceCapabilitiesKHR, desired VkExtent2D,
    preferRequestedExtent bool) VkExtent2D{
      if !preferRequestedExtent && capabilities.currentExtent.width != uint32.MaxValue {
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
        createInfo.minImageCount = requestedImageCount
        createInfo.imageFormat = surfaceFormat.format
        createInfo.imageColorSpace = surfaceFormat.colorSpace
        createInfo.imageExtent = extent
        createInfo.imageArrayLayers = 1u
        createInfo.imageUsage = imageUsage
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
        try {
          if let accounting = objectAccounting {
            accounting.Allocate()
          }
        } catch (error Exception) {
          let destroySwapchain = dispatch.vkDestroySwapchainKHR
          destroySwapchain(device, swapchain, nil)
          swapchain = 0uL
          throw error
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
        let capacity = int32(queriedImageCount)
        imageSet = VulkanSwapchainImageSet(
          device,
          dispatch,
          swapchain,
          capacity,
          surfaceFormat.format,
          swapchainMaintenanceEnabled,
          objectAccounting)
      } catch (error Exception) {
        Dispose()
        throw error
      }
    }

}
