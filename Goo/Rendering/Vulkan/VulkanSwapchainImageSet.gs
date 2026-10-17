package Goo

import System

internal struct VulkanSwapchainPresentState {
  internal let Fences []VkFence
  internal let Prepared []bool
  internal let Pending []bool
  internal let PresentIds []uint64

  internal init(imageCount int32) {
    Fences = [imageCount]VkFence
    Prepared = [imageCount]bool
    Pending = [imageCount]bool
    PresentIds = [imageCount]uint64
  }
}

internal unsafe class VulkanSwapchainImageSet {
  private let device VkDevice
  private let dispatch VkDeviceDispatch
  private let objectAccounting VulkanObjectAccounting?
  private let images []VkImage
  private let imageViews []VkImageView
  private let renderSemaphores []VkSemaphore
  private let presentState VulkanSwapchainPresentState?
  private let imageLayouts []VkImageLayout
  private let appliedSceneVersions []uint64
  private let pendingSceneVersions []uint64
  private var trackedImageCount int32
  private var disposed bool

  internal init(
    nativeDevice VkDevice,
    nativeDispatch VkDeviceDispatch,
    swapchain VkSwapchainKHR,
    imageCount int32,
    format VkFormat,
    enablePresentFence bool,
    nativeObjectAccounting VulkanObjectAccounting?) {
      if nativeDevice == nint(0) {
        throw ArgumentException("Vulkan device is null", "nativeDevice")
      }
      if swapchain == 0uL {
        throw ArgumentException("Vulkan swapchain is null", "swapchain")
      }
      if imageCount <= 0 {
        throw ArgumentOutOfRangeException("imageCount")
      }
      device = nativeDevice
      dispatch = nativeDispatch
      objectAccounting = nativeObjectAccounting
      images = [imageCount]VkImage
      imageViews = [imageCount]VkImageView
      renderSemaphores = [imageCount]VkSemaphore
      presentState = if enablePresentFence {
        VulkanSwapchainPresentState(imageCount)
      } else {
        nil
      }
      imageLayouts = [imageCount]VkImageLayout
      appliedSceneVersions = [imageCount]uint64
      pendingSceneVersions = [imageCount]uint64
      try {
        Create(swapchain, format)
      } catch (error Exception) {
        try { DisposeAfterDeviceLoss() } catch (cleanup Exception) { }
        throw error
      }
    }

  internal prop Count uint32{ get -> uint32(images.Length) }
  internal prop PresentFenceEnabled bool{ get -> presentState != nil }

  internal func Image(index uint32) VkImage {
    EnsureIndex(index)
    return images[int32(index)]
  }

  internal func ImageView(index uint32) VkImageView {
    EnsureIndex(index)
    return imageViews[int32(index)]
  }

  internal func RenderSemaphore(index uint32) VkSemaphore {
    EnsureIndex(index)
    return renderSemaphores[int32(index)]
  }

  internal func AppliedSceneVersion(index uint32) uint64 {
    EnsureIndex(index)
    return appliedSceneVersions[int32(index)]
  }

  internal func PendingSceneVersion(index uint32) uint64 {
    EnsureIndex(index)
    return pendingSceneVersions[int32(index)]
  }

  internal func PromoteAcquiredSceneVersion(index uint32) bool {
    EnsureIndex(index)
    let offset = int32(index)
    if imageLayouts[offset] != VkConstants.VK_IMAGE_LAYOUT_PRESENT_SRC_KHR
      || pendingSceneVersions[offset] == 0uL {
        return false
      }
    appliedSceneVersions[offset] = pendingSceneVersions[offset]
    pendingSceneVersions[offset] = 0uL
    return true
  }

  internal func SetPendingSceneVersion(index uint32, version uint64) {
    EnsureIndex(index)
    if version == 0uL {
      throw ArgumentOutOfRangeException("version")
    }
    let offset = int32(index)
    if pendingSceneVersions[offset] != 0uL {
      throw InvalidOperationException("Vulkan swapchain image already has a pending scene version")
    }
    pendingSceneVersions[offset] = version
  }

  internal func ResetSceneVersions() {
    EnsureUsable()
    var index int32 = 0
    while index < images.Length {
      appliedSceneVersions[index] = 0uL
      pendingSceneVersions[index] = 0uL
      index = index + 1
    }
  }

  internal func TryPreparePresent(index uint32, out fence VkFence,
    out completedPresentId uint64) VkResult{
      EnsureIndex(index)
      fence = 0uL
      completedPresentId = 0uL
      if presentState == nil {
        return VkConstants.VK_SUCCESS
      }
      let offset = int32(index)
      let present = RequirePresentState()
      let fences = present.Fences
      let prepared = present.Prepared
      let pending = present.Pending
      let ids = present.PresentIds
      if prepared[offset] {
        throw InvalidOperationException("Vulkan swapchain present fence is still prepared")
      }
      if pending[offset] {
        let getFenceStatus = dispatch.vkGetFenceStatus
        let status = getFenceStatus(device, fences[offset])
        if status != VkConstants.VK_SUCCESS {
          return status
        }
        completedPresentId = ids[offset]
        pending[offset] = false
        ids[offset] = 0uL
      }
      fence = fences[offset]
      let resetFences = dispatch.vkResetFences
      let resetResult = resetFences(device, 1u, &fence)
      if resetResult != VkConstants.VK_SUCCESS {
        return resetResult
      }
      prepared[offset] = true
      return VkConstants.VK_SUCCESS
    }

  internal func ReconcilePreparedPresent(index uint32, presentAttempted bool) {
    EnsureIndex(index)
    if presentState == nil {
      return
    }
    let offset = int32(index)
    let present = RequirePresentState()
    let fences = present.Fences
    let prepared = present.Prepared
    let pending = present.Pending
    let ids = present.PresentIds
    if !prepared[offset] {
      return
    }
    var fence = fences[offset]
    if presentAttempted {
      let waitForFences = dispatch.vkWaitForFences
      let waitResult = waitForFences(
        device, 1u, &fence, VkConstants.VK_TRUE, VkConstants.VK_WHOLE_SIZE)
      if waitResult != VkConstants.VK_SUCCESS {
        throw InvalidOperationException(
          "vkWaitForFences failed while reconciling Vulkan present fence")
      }
    } else {
      let resetFences = dispatch.vkResetFences
      let resetResult = resetFences(device, 1u, &fence)
      if resetResult != VkConstants.VK_SUCCESS {
        throw InvalidOperationException(
          "vkResetFences failed while reconciling Vulkan present fence")
      }
    }
    prepared[offset] = false
    pending[offset] = false
    ids[offset] = 0uL
  }

  internal func MarkPresented(index uint32, result VkResult, presentId uint64) VkResult {
    EnsureIndex(index)
    if presentState == nil {
      if (result == VkConstants.VK_SUCCESS || result == VkConstants.VK_SUBOPTIMAL_KHR)
        && presentId == 0uL {
          throw InvalidOperationException(
            "Vulkan successful presentation must have a nonzero present id")
        }
      if result != VkConstants.VK_SUCCESS && result != VkConstants.VK_SUBOPTIMAL_KHR
        && presentId != 0uL {
          throw InvalidOperationException(
            "Vulkan failed presentation must have a zero present id")
        }
      return result
    }
    let offset = int32(index)
    let present = RequirePresentState()
    let prepared = present.Prepared
    let pending = present.Pending
    let ids = present.PresentIds
    if !prepared[offset] {
      throw InvalidOperationException("Vulkan swapchain present fence was not prepared")
    }
    if result == VkConstants.VK_SUCCESS || result == VkConstants.VK_SUBOPTIMAL_KHR {
      if presentId == 0uL {
        throw InvalidOperationException(
          "Vulkan successful presentation must have a nonzero present id")
      }
      pending[offset] = true
      ids[offset] = presentId
    } else if result == VkConstants.VK_ERROR_OUT_OF_DATE_KHR
      || result == VkConstants.VK_ERROR_SURFACE_LOST_KHR{
        if presentId != 0uL {
          throw InvalidOperationException(
            "Vulkan failed presentation must have a zero present id")
        }
        pending[offset] = true
        ids[offset] = 0uL
      } else {
        if presentId != 0uL {
          throw InvalidOperationException(
            "Vulkan failed presentation must have a zero present id")
        }
        pending[offset] = false
        ids[offset] = 0uL
      }
    prepared[offset] = false
    return result
  }

  internal func WaitForPresentCompletion(retirement VulkanPresentationRetirement) VkResult {
    EnsureUsable()
    if presentState == nil {
      return VkConstants.VK_SUCCESS
    }
    let present = RequirePresentState()
    let fences = present.Fences
    let prepared = present.Prepared
    let pending = present.Pending
    let ids = present.PresentIds
    var index int32 = 0
    while index < images.Length {
      if prepared[index] {
        throw InvalidOperationException(
          "Vulkan swapchain present fence is prepared but not submitted")
      }
      if pending[index] {
        let waitForFences = dispatch.vkWaitForFences
        var fence = fences[index]
        let result = waitForFences(
          device, 1u, &fence, VkConstants.VK_TRUE, VkConstants.VK_WHOLE_SIZE)
        if result != VkConstants.VK_SUCCESS {
          return result
        }
        if ids[index] != 0uL {
          retirement.CompletePresent(ids[index])
        }
        pending[index] = false
        ids[index] = 0uL
      }
      index = index + 1
    }
    return VkConstants.VK_SUCCESS
  }

  internal func PollForPresentCompletion(retirement VulkanPresentationRetirement) VkResult {
    EnsureUsable()
    if presentState == nil {
      return VkConstants.VK_SUCCESS
    }
    let present = RequirePresentState()
    let fences = present.Fences
    let prepared = present.Prepared
    let pending = present.Pending
    let ids = present.PresentIds
    var index int32 = 0
    while index < images.Length {
      if prepared[index] {
        throw InvalidOperationException(
          "Vulkan swapchain present fence is prepared but not submitted")
      }
      if pending[index] {
        let getFenceStatus = dispatch.vkGetFenceStatus
        let result = getFenceStatus(device, fences[index])
        if result != VkConstants.VK_SUCCESS {
          return result
        }
        if ids[index] != 0uL {
          retirement.CompletePresent(ids[index])
        }
        pending[index] = false
        ids[index] = 0uL
      }
      index = index + 1
    }
    return VkConstants.VK_SUCCESS
  }

  internal func CurrentLayout(index uint32) VkImageLayout {
    EnsureIndex(index)
    return imageLayouts[int32(index)]
  }

  internal func CommitLayout(index uint32, layout VkImageLayout) {
    EnsureIndex(index)
    imageLayouts[int32(index)] = layout
  }

  internal func Dispose() {
    if disposed {
      return
    }
    if let present = presentState {
      let prepared = present.Prepared
      let pending = present.Pending
      var index int32 = 0
      while index < images.Length {
        if prepared[index] || pending[index] {
          throw InvalidOperationException("Vulkan swapchain present fence is still in use")
        }
        index = index + 1
      }
    }
    disposed = true
    DestroyNative(false)
  }

  internal func DisposeAfterDeviceLoss() {
    if disposed {
      return
    }
    disposed = true
    DestroyNative(true)
  }

  private func Create(swapchain VkSwapchainKHR, format VkFormat) {
    var enumeratedImageCount = uint32(images.Length)
    let getSwapchainImages = dispatch.vkGetSwapchainImagesKHR
    fixed imagePointer * VkImage = images{
      let result = getSwapchainImages(device, swapchain, &enumeratedImageCount, imagePointer)
      if result != VkConstants.VK_SUCCESS || enumeratedImageCount != uint32(images.Length) {
        throw InvalidOperationException("Swapchain image enumeration failed")
      }
    }
    while trackedImageCount < images.Length {
      if let accounting = objectAccounting {
        accounting.Allocate()
      }
      trackedImageCount = trackedImageCount + 1
    }
    var index int32 = 0
    while index < images.Length {
      imageViews[index] = VulkanImageFactory.CreateView(
        device,
        dispatch,
        objectAccounting,
        images[index],
        VkConstants.VK_IMAGE_VIEW_TYPE_2D,
        format,
        uint32(VkConstants.VK_IMAGE_ASPECT_COLOR_BIT),
        0u,
        1u)
      imageLayouts[index] = VkConstants.VK_IMAGE_LAYOUT_UNDEFINED
      index = index + 1
    }
    index = 0
    while index < images.Length {
      renderSemaphores[index] = VulkanSynchronizationFactory.CreateSemaphore(
        device,
        dispatch,
        objectAccounting)
      index = index + 1
    }
    if let present = presentState {
      let fences = present.Fences
      index = 0
      while index < images.Length {
        fences[index] = VulkanSynchronizationFactory.CreateFence(
          device,
          dispatch,
          objectAccounting,
          0u)
        index = index + 1
      }
    }
  }

  private func DestroyNative(bestEffort bool) {
    let destroySemaphore = dispatch.vkDestroySemaphore
    var index int32 = 0
    while index < renderSemaphores.Length {
      if renderSemaphores[index] != 0uL {
        let semaphore = renderSemaphores[index]
        if bestEffort {
          renderSemaphores[index] = 0uL
          try { destroySemaphore(device, semaphore, nil) } catch (cleanup Exception) { }
          ReleaseAccounting(true)
        } else {
          destroySemaphore(device, semaphore, nil)
          ReleaseAccounting(false)
          renderSemaphores[index] = 0uL
        }
      }
      index = index + 1
    }
    if let present = presentState {
      let fences = present.Fences
      let destroyFence = dispatch.vkDestroyFence
      index = 0
      while index < fences.Length {
        if fences[index] != 0uL {
          let fence = fences[index]
          if bestEffort {
            fences[index] = 0uL
            try { destroyFence(device, fence, nil) } catch (cleanup Exception) { }
            ReleaseAccounting(true)
          } else {
            destroyFence(device, fence, nil)
            ReleaseAccounting(false)
            fences[index] = 0uL
          }
        }
        index = index + 1
      }
    }
    let destroyImageView = dispatch.vkDestroyImageView
    index = 0
    while index < imageViews.Length {
      if imageViews[index] != 0uL {
        let view = imageViews[index]
        if bestEffort {
          imageViews[index] = 0uL
          try { destroyImageView(device, view, nil) } catch (cleanup Exception) { }
          ReleaseAccounting(true)
        } else {
          destroyImageView(device, view, nil)
          ReleaseAccounting(false)
          imageViews[index] = 0uL
        }
      }
      index = index + 1
    }
    let imageCount = trackedImageCount
    trackedImageCount = 0
    index = 0
    while index < imageCount {
      ReleaseAccounting(bestEffort)
      index = index + 1
    }
  }

  private func ReleaseAccounting(bestEffort bool) {
    if let accounting = objectAccounting {
      if bestEffort {
        try { accounting.Release() } catch (cleanup Exception) { }
      } else {
        accounting.Release()
      }
    }
  }

  private func RequirePresentState() VulkanSwapchainPresentState {
    guard let storage = presentState else {
      throw InvalidOperationException("Vulkan swapchain present fences are unavailable")
    }
    return storage
  }

  private func EnsureUsable() {
    if disposed {
      throw ObjectDisposedException("VulkanSwapchainImageSet")
    }
  }

  private func EnsureIndex(index uint32) {
    EnsureUsable()
    if index >= uint32(images.Length) {
      throw ArgumentOutOfRangeException("index")
    }
  }
}
