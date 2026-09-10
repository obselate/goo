package Goo

internal unsafe partial class VulkanWindowTarget {
  private var nextGenerationId uint64 = 1uL

  private func RecreateSwapchain(width int32, height int32) bool {
    if width <= 0 || height <= 0 {
      recreatePending = true
      return true
    }
    if !WaitForGpu() {
      return false
    }
    let completedGlobalSubmissionSerial = CompletedGlobalSubmissionSerial()
    if let renderer = primitiveRenderer {
      renderer.Collect(completedGlobalSubmissionSerial)
    } else if let atlas = clipMaskAtlas {
      atlas.Collect(completedGlobalSubmissionSerial)
    }
    layerPool?.Collect(completedGlobalSubmissionSerial)
    var surfaceRecovery = false
    if surfaceLost {
      surfaceRecovery = true
      if !RetireCurrentSwapchain(true) {
        return false
      }
      if !RecreateSurface() {
        return false
      }
      surfaceLost = false
    }
    var selection VulkanWindowTargetSelection = VulkanWindowTargetSelection{}
    if !TryQuerySelection(out selection) {
      if !surfaceLost {
        return false
      }
      surfaceRecovery = true
      if !RetireCurrentSwapchain(true) {
        return false
      }
      if !RecreateSurface() {
        return false
      }
      surfaceLost = false
      if !TryQuerySelection(out selection) {
        return false
      }
    }
    let oldFormat = if let old = generation { old.Format } else { VkFormat(-1) }
    let generationId = nextGenerationId
    if nextGenerationId == uint64.MaxValue {
      throw OverflowException("Vulkan swapchain generation overflow")
    }
    nextGenerationId = nextGenerationId + 1uL
    let old = generation
    var oldSwapchain VkSwapchainKHR = 0uL
    if let current = old {
      oldSwapchain = current.Handle
    }
    if primitiveRenderer != nil && oldFormat != selection.Format.format {
      primitiveRenderer!!.Dispose()
      primitiveRenderer = nil
    }
    if layerPool != nil && oldFormat != selection.Format.format {
      layerPool!!.Dispose()
      layerPool = nil
    }
    var desiredExtent = VkExtent2D{}
    desiredExtent.width = uint32(width)
    desiredExtent.height = uint32(height)
    let next = VulkanSwapchainGeneration(
      device,
      dispatch,
      surface,
      selection.Capabilities,
      selection.Format,
      selection.PresentMode,
      desiredExtent,
      selection.CompositeAlpha,
      oldSwapchain,
      generationId,
      swapchainMaintenanceVariant != VulkanSwapchainMaintenanceVariant.None,
      windowObjectAccounting,
      host.PreferRequestedFramebufferExtent)
    generation = next
    if let previous = old {
      InvalidateLastPresentedImageState()
      retiredSwapchains.Enqueue(previous, presentationRetirement)
      if !previous.PresentFenceEnabled {
        let idleResult = WaitDeviceIdleResult()
        if idleResult != VkConstants.VK_SUCCESS {
          RecordDiagnosticResult(VulkanDiagnosticEventIds.PresentWait, idleResult)
          HandleFrameFailure(idleResult, VulkanDiagnosticEventIds.PresentWait)
          return false
        }
        DisposeRetiredSwapchains()
      }
    }
    next.ResetSceneVersions()
    EnsureClipMaskAtlas(next.Extent.width, next.Extent.height)
    if primitiveRenderer == nil {
      guard let activeRuntime = runtime else {
        throw InvalidOperationException("Vulkan shared runtime is unavailable")
      }
      primitiveRenderer = VulkanPrimitiveRenderer(
        device,
        dispatch,
        selection.Format.format,
        64,
        imageResources,
        activeRuntime.Generation,
        activeRuntime.MaxStorageBufferRange,
        activeRuntime.PrimitiveState,
        2,
        activeRuntime.PathResources.Atlas,
        textAtlas,
        windowObjectAccounting,
        memoryAllocator,
        clipMaskAtlas)
    }
    if layerPool == nil {
      guard let allocator = memoryAllocator,
      let resources = imageResources,
      let layerRuntime = runtime else {
        throw InvalidOperationException("Vulkan layer pool resources are unavailable")
      }
      let policy = layerRuntime.ResourcePolicy
      layerPool = VulkanOffscreenLayerPool(
        device,
        dispatch,
        allocator,
        resources.DescriptorSetLayout,
        selection.Format.format,
        windowObjectAccounting,
        policy.OffscreenLayerInitialCapacity,
        policy.OffscreenLayerHardBytes,
        diagnostics)
    }
    primitiveRenderer!!.SetLayerPool(layerPool)
    if surfaceRecovery {
      primitiveRenderer!!.InvalidateClipFrameRetention()
      clipMaskFrameStats = primitiveRenderer!!.ClipMaskFrameStats
      clipMaskFrameTotals = primitiveRenderer!!.ClipMaskFrameTotals
    }
    framebufferWidth = int32(next.Extent.width)
    framebufferHeight = int32(next.Extent.height)
    requestedWidth = width
    requestedHeight = height
    recreatePending = false
    forceFullRedraw = true
    if surfaceRecovery {
      diagnostics?.AddSurfaceRecovery(1uL)
    }
    return true
  }

  private func RetireCurrentSwapchain(destroySurface bool) bool {
    if let old = generation {
      if let activeRuntime = runtime {
        if activeRuntime.QueueWorker.HasOutstandingWork {
          frameFailureRetryable = true
          host.Wake()
          return false
        }
      }
      InvalidateLastPresentedImageState()
      if !old.PresentFenceEnabled {
        let idleResult = WaitDeviceIdleResult()
        if idleResult != VkConstants.VK_SUCCESS {
          RecordDiagnosticResult(VulkanDiagnosticEventIds.PresentWait, idleResult)
          HandleFrameFailure(idleResult, VulkanDiagnosticEventIds.PresentWait)
          return false
        }
        retiredSwapchains.Enqueue(old, presentationRetirement)
        generation = nil
        DisposeRetiredSwapchains()
        if destroySurface {
          DestroyCurrentSurface()
        }
        return true
      }
      if destroySurface {
        let presentCompletionResult = old.PollForPresentCompletion(presentationRetirement)
        RecordDiagnosticResult(VulkanDiagnosticEventIds.PresentWait, presentCompletionResult)
        if presentCompletionResult == VkConstants.VK_NOT_READY
          || presentCompletionResult == VkConstants.VK_TIMEOUT{
            frameFailureRetryable = true
            return false
          }
        if presentCompletionResult != VkConstants.VK_SUCCESS {
          HandleFrameFailure(presentCompletionResult, VulkanDiagnosticEventIds.PresentWait)
          return false
        }
        old.Dispose()
        generation = nil
        DestroyCurrentSurface()
        return true
      }
      retiredSwapchains.Enqueue(old, presentationRetirement)
      generation = nil
      return true
    }
    if destroySurface {
      DestroyCurrentSurface()
    }
    return true
  }

  private func DestroyCurrentSurface() {
    if surfaceCreated && instance != nint(0) {
      host.DestroyVulkanSurface(instance, surface)
      if let accounting = windowObjectAccounting {
        accounting.Release()
      }
    }
    surface = 0uL
    surfaceCreated = false
  }

  private func CollectRetiredSwapchains() {
    retiredSwapchains.CollectReady(presentationRetirement)
  }

  private func DisposeRetiredSwapchains() {
    var presentCompletionResult VkResult = VkConstants.VK_SUCCESS
    while retiredSwapchains.TryWaitAndDisposeNext(
      presentationRetirement, out presentCompletionResult) {
        if presentCompletionResult != VkConstants.VK_SUCCESS {
          RecordDiagnosticResult(VulkanDiagnosticEventIds.PresentWait, presentCompletionResult)
        }
      }
  }

  private func WaitForOwnedWorkCompletion() VkResult {
    if frameBegun {
      return VkConstants.VK_ERROR_INITIALIZATION_FAILED
    }
    if let activeRuntime = runtime {
      if activeRuntime.QueueWorker.HasOutstandingWork {
        return VkConstants.VK_NOT_READY
      }
    }
    if let slot = frameSlots.Slot(0u) {
      let result = slot.WaitForCompletion()
      RecordDiagnosticResult(VulkanDiagnosticEventIds.PresentWait, result)
      if result != VkConstants.VK_SUCCESS {
        return result
      }
      presentationRetirement.CollectCompleted(0u, slot.LastCompletedSerial)
    }
    if let slot = frameSlots.Slot(1u) {
      let result = slot.WaitForCompletion()
      RecordDiagnosticResult(VulkanDiagnosticEventIds.PresentWait, result)
      if result != VkConstants.VK_SUCCESS {
        return result
      }
      presentationRetirement.CollectCompleted(1u, slot.LastCompletedSerial)
    }
    if let current = generation {
      if !current.PresentFenceEnabled {
        return VkConstants.VK_ERROR_FEATURE_NOT_PRESENT
      }
      let result = current.WaitForPresentCompletion(presentationRetirement)
      RecordDiagnosticResult(VulkanDiagnosticEventIds.PresentWait, result)
      if result != VkConstants.VK_SUCCESS {
        return result
      }
    }
    var index int32 = 0
    while index < retiredSwapchains.Count {
      let retired = retiredSwapchains.Generation(index)
      if !retired.PresentFenceEnabled {
        return VkConstants.VK_ERROR_FEATURE_NOT_PRESENT
      }
      let result = retired.WaitForPresentCompletion(presentationRetirement)
      RecordDiagnosticResult(VulkanDiagnosticEventIds.PresentWait, result)
      if result != VkConstants.VK_SUCCESS {
        return result
      }
      index = index + 1
    }
    return VkConstants.VK_SUCCESS
  }

  private func RecreateSurface() bool {
    DestroyCurrentSurface()
    var createdSurface VkSurfaceKHR = 0uL
    if !host.CreateVulkanSurface(instance, out createdSurface) || createdSurface == 0uL {
      return false
    }
    try {
      if let accounting = windowObjectAccounting {
        accounting.Allocate()
      }
    } catch (error Exception) {
      try { host.DestroyVulkanSurface(instance, createdSurface) } catch (cleanup Exception) { }
      throw error
    }
    surface = createdSurface
    surfaceCreated = true
    return true
  }

  private func TryQuerySelection(out selection VulkanWindowTargetSelection) bool {
    selection = VulkanWindowTargetSelection{}
    if VulkanWindowTarget.TakeTestSurfaceLostForTest() {
      surfaceLost = true
      return false
    }
    var capabilities = VkSurfaceCapabilitiesKHR{}
    let getSurfaceCapabilities = instanceDispatch.vkGetPhysicalDeviceSurfaceCapabilitiesKHR
    let capabilitiesResult = getSurfaceCapabilities(
      physicalDevice,
      surface,
      &capabilities)
    if capabilitiesResult == VkConstants.VK_ERROR_SURFACE_LOST_KHR {
      surfaceLost = true
      return false
    }
    if capabilitiesResult != VkConstants.VK_SUCCESS {
      throw InvalidOperationException("Vulkan surface capabilities query failed: " + capabilitiesResult.ToString())
    }
    if (capabilities.supportedUsageFlags & uint32(VkConstants.VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT)) == 0u {
      throw InvalidOperationException("Vulkan surface does not support color attachment swapchain images")
    }
    var formatCount uint32 = 0u
    let getFormats = instanceDispatch.vkGetPhysicalDeviceSurfaceFormatsKHR
    let formatCountResult = getFormats(physicalDevice, surface, &formatCount, nil)
    if formatCountResult == VkConstants.VK_ERROR_SURFACE_LOST_KHR {
      surfaceLost = true
      return false
    }
    if formatCountResult != VkConstants.VK_SUCCESS || formatCount == 0u {
      throw InvalidOperationException("Vulkan surface formats are unavailable")
    }
    let formats * VkSurfaceFormatKHR = stackalloc[int32(formatCount)]VkSurfaceFormatKHR
    let formatResult = getFormats(physicalDevice, surface, &formatCount, formats)
    if formatResult == VkConstants.VK_ERROR_SURFACE_LOST_KHR {
      surfaceLost = true
      return false
    }
    if formatResult != VkConstants.VK_SUCCESS {
      throw InvalidOperationException("Vulkan surface format query failed")
    }
    var selectedFormat VkSurfaceFormatKHR = VkSurfaceFormatKHR{}
    if !SelectSrgbFormat(formats, formatCount, out selectedFormat) {
      throw InvalidOperationException("Vulkan surface exposes no supported sRGB swapchain format")
    }
    var formatProperties = VkFormatProperties{}
    let getFormatProperties = instanceDispatch.vkGetPhysicalDeviceFormatProperties
    getFormatProperties(
      physicalDevice,
      selectedFormat.format,
      &formatProperties)
    let requiredFormatFeatures = uint32(VkConstants.VK_FORMAT_FEATURE_COLOR_ATTACHMENT_BIT)
    | uint32(VkConstants.VK_FORMAT_FEATURE_COLOR_ATTACHMENT_BLEND_BIT)
    if (formatProperties.optimalTilingFeatures & requiredFormatFeatures) != requiredFormatFeatures {
      throw InvalidOperationException("Vulkan sRGB surface format lacks color attachment blend support")
    }
    var modeCount uint32 = 0u
    let getModes = instanceDispatch.vkGetPhysicalDeviceSurfacePresentModesKHR
    let modeCountResult = getModes(physicalDevice, surface, &modeCount, nil)
    if modeCountResult == VkConstants.VK_ERROR_SURFACE_LOST_KHR {
      surfaceLost = true
      return false
    }
    if modeCountResult != VkConstants.VK_SUCCESS || modeCount == 0u {
      throw InvalidOperationException("Vulkan surface present modes are unavailable")
    }
    let modes * VkPresentModeKHR = stackalloc[int32(modeCount)]VkPresentModeKHR
    let modeResult = getModes(physicalDevice, surface, &modeCount, modes)
    if modeResult == VkConstants.VK_ERROR_SURFACE_LOST_KHR {
      surfaceLost = true
      return false
    }
    if modeResult != VkConstants.VK_SUCCESS {
      throw InvalidOperationException("Vulkan surface present mode query failed")
    }
    var hasImmediate = false
    var hasMailbox = false
    var hasFifo = false
    var modeIndex uint32 = 0u
    while modeIndex < modeCount {
      let mode = modes[modeIndex]
      if mode == VkConstants.VK_PRESENT_MODE_IMMEDIATE_KHR {
        hasImmediate = true
      } else if mode == VkConstants.VK_PRESENT_MODE_MAILBOX_KHR {
        hasMailbox = true
      } else if mode == VkConstants.VK_PRESENT_MODE_FIFO_KHR {
        hasFifo = true
      }
      modeIndex = modeIndex + 1u
    }
    var presentMode VkPresentModeKHR
    if !VulkanPresentModeSelector.TrySelect(
      vsync,
      deviceFacts.DeviceType == int32(VkConstants.VK_PHYSICAL_DEVICE_TYPE_CPU),
      hasImmediate,
      hasMailbox,
      hasFifo,
      out presentMode) {
        throw InvalidOperationException("Vulkan FIFO present mode is unavailable")
      }
    let compositeAlpha = SelectCompositeAlpha(
      capabilities.supportedCompositeAlpha,
      host.Transparent)
    if compositeAlpha == VkCompositeAlphaFlagBitsKHR(0) {
      if host.Transparent {
        throw InvalidOperationException(
          "Vulkan surface has no premultiplied composite alpha mode for a transparent window")
      }
      throw InvalidOperationException("Vulkan surface has no supported composite alpha mode")
    }
    var support VkBool32 = VkConstants.VK_FALSE
    let surfaceSupport = instanceDispatch.vkGetPhysicalDeviceSurfaceSupportKHR
    let supportResult = surfaceSupport(
      physicalDevice,
      queueFamilyIndex,
      surface,
      &support)
    if supportResult == VkConstants.VK_ERROR_SURFACE_LOST_KHR {
      surfaceLost = true
      return false
    }
    if supportResult != VkConstants.VK_SUCCESS || support != VkConstants.VK_TRUE {
      throw InvalidOperationException("Vulkan selected queue does not support the SDL surface")
    }
    selection = VulkanWindowTargetSelection{
      Capabilities: capabilities,
      Format: selectedFormat,
      PresentMode: presentMode,
      CompositeAlpha: compositeAlpha,
    }
    return true
  }

  private func SelectSrgbFormat(
    formats * VkSurfaceFormatKHR,
    count uint32,
    out selected VkSurfaceFormatKHR) bool{
      selected = VkSurfaceFormatKHR{}
      if count == 0u {
        return false
      }
      if count == 1u && formats[0].format == VkConstants.VK_FORMAT_UNDEFINED {
        if formats[0].colorSpace != VkConstants.VK_COLOR_SPACE_SRGB_NONLINEAR_KHR {
          return false
        }
        selected.format = VkConstants.VK_FORMAT_B8G8R8A8_SRGB
        selected.colorSpace = VkConstants.VK_COLOR_SPACE_SRGB_NONLINEAR_KHR
        return true
      }
      var index uint32 = 0u
      while index < count {
        if formats[index].format == VkConstants.VK_FORMAT_B8G8R8A8_SRGB
          && formats[index].colorSpace == VkConstants.VK_COLOR_SPACE_SRGB_NONLINEAR_KHR{
            selected = formats[index]
            return true
          }
        index = index + 1u
      }
      index = 0u
      while index < count {
        if formats[index].format == VkConstants.VK_FORMAT_R8G8B8A8_SRGB
          && formats[index].colorSpace == VkConstants.VK_COLOR_SPACE_SRGB_NONLINEAR_KHR{
            selected = formats[index]
            return true
          }
        index = index + 1u
      }
      return false
    }

  shared {
    internal func SelectCompositeAlpha(
      supported VkCompositeAlphaFlagsKHR,
      transparent bool) VkCompositeAlphaFlagBitsKHR{
        if transparent {
          if (supported & uint32(VkConstants.VK_COMPOSITE_ALPHA_PRE_MULTIPLIED_BIT_KHR)) != 0u {
            return VkConstants.VK_COMPOSITE_ALPHA_PRE_MULTIPLIED_BIT_KHR
          }
          return VkCompositeAlphaFlagBitsKHR(0)
        }
        if (supported & uint32(VkConstants.VK_COMPOSITE_ALPHA_OPAQUE_BIT_KHR)) != 0u {
          return VkConstants.VK_COMPOSITE_ALPHA_OPAQUE_BIT_KHR
        }
        if (supported & uint32(VkConstants.VK_COMPOSITE_ALPHA_PRE_MULTIPLIED_BIT_KHR)) != 0u {
          return VkConstants.VK_COMPOSITE_ALPHA_PRE_MULTIPLIED_BIT_KHR
        }
        if (supported & uint32(VkConstants.VK_COMPOSITE_ALPHA_POST_MULTIPLIED_BIT_KHR)) != 0u {
          return VkConstants.VK_COMPOSITE_ALPHA_POST_MULTIPLIED_BIT_KHR
        }
        if (supported & uint32(VkConstants.VK_COMPOSITE_ALPHA_INHERIT_BIT_KHR)) != 0u {
          return VkConstants.VK_COMPOSITE_ALPHA_INHERIT_BIT_KHR
        }
        return VkCompositeAlphaFlagBitsKHR(0)
      }
  }

  private func WaitForGpu() bool {
    if let activeRuntime = runtime {
      if activeRuntime.QueueWorker.HasOutstandingWork {
        frameFailureRetryable = true
        host.Wake()
        return false
      }
    }
    var slot0Prepared bool
    var slot1Prepared bool
    if let slot = frameSlots.Slot(0u) {
      let result = slot.PrepareAcquire()
      RecordDiagnosticResult(VulkanDiagnosticEventIds.PresentWait, result)
      if result != VkConstants.VK_SUCCESS {
        if result == VkConstants.VK_NOT_READY || result == VkConstants.VK_TIMEOUT {
          frameFailureRetryable = true
          return false
        }
        HandleFrameFailure(result, VulkanDiagnosticEventIds.PresentWait)
        return false
      }
      slot0Prepared = true
      presentationRetirement.CollectCompleted(0u, slot.LastCompletedSerial)
    }
    if let slot = frameSlots.Slot(1u) {
      let result = slot.PrepareAcquire()
      RecordDiagnosticResult(VulkanDiagnosticEventIds.PresentWait, result)
      if result != VkConstants.VK_SUCCESS {
        if slot0Prepared {
          frameSlots.Slot(0u)?.AbortPrepared()
        }
        if result == VkConstants.VK_NOT_READY || result == VkConstants.VK_TIMEOUT {
          frameFailureRetryable = true
          return false
        }
        HandleFrameFailure(result, VulkanDiagnosticEventIds.PresentWait)
        return false
      }
      slot1Prepared = true
      presentationRetirement.CollectCompleted(1u, slot.LastCompletedSerial)
    }
    if slot0Prepared {
      frameSlots.Slot(0u)?.AbortPrepared()
    }
    if slot1Prepared {
      frameSlots.Slot(1u)?.AbortPrepared()
    }
    if let current = generation {
      if current.PresentFenceEnabled {
        let result = current.PollForPresentCompletion(presentationRetirement)
        RecordDiagnosticResult(VulkanDiagnosticEventIds.PresentWait, result)
        if result == VkConstants.VK_ERROR_SURFACE_LOST_KHR {
          surfaceLost = true
          return true
        }
        if result == VkConstants.VK_NOT_READY || result == VkConstants.VK_TIMEOUT {
          frameFailureRetryable = true
          return false
        }
        if result != VkConstants.VK_SUCCESS {
          HandleFrameFailure(result, VulkanDiagnosticEventIds.PresentWait)
          return false
        }
      }
    }
    return true
  }

  private func WaitDeviceIdleResult() VkResult {
    if let activeRuntime = runtime {
      return activeRuntime.WaitDeviceIdleResult()
    }
    if device == nint(0) || deviceWaitIdleAddress == nint(0) {
      return VkConstants.VK_ERROR_INITIALIZATION_FAILED
    }
    let nullable = deviceWaitIdleAddress as (unmanaged[Cdecl](VkDevice) -> VkResult)?
    if nullable == nil {
      return VkConstants.VK_ERROR_INITIALIZATION_FAILED
    }
    let deviceWaitIdleFunction = nullable!!
    return deviceWaitIdleFunction(device)
  }

  private func EnsureClipMaskAtlas(nativeWidth uint32, nativeHeight uint32) {
    if nativeWidth == 0u || nativeHeight == 0u {
      throw ArgumentOutOfRangeException("nativeWidth")
    }
    guard let activeRuntime = runtime else {
      throw InvalidOperationException("Vulkan shared runtime is unavailable")
    }
    guard let allocator = memoryAllocator else {
      throw InvalidOperationException("Vulkan memory allocator is unavailable")
    }
    if let atlas = clipMaskAtlas {
      if atlas.Width != nativeWidth || atlas.Height != nativeHeight {
        atlas.Resize(nativeWidth, nativeHeight, CompletedGlobalSubmissionSerial())
        clipMaskRedrawPending = true
      }
      return
    }
    clipMaskAtlas = VulkanClipMaskAtlas(
      device,
      dispatch,
      allocator,
      nativeWidth,
      nativeHeight,
      clipMaskFormatSupport,
      0uL,
      activeRuntime.Generation,
      windowObjectAccounting)
    clipMaskRedrawPending = true
    clipMaskAtlasAbandoned = false
  }

  private func CompletedGlobalSubmissionSerial() uint64 {
    guard let activeRuntime = runtime else { return 0uL }
    var completed uint64
    let result = activeRuntime.GetCompletedGraphicsSubmissionSerial(out completed)
    RecordDiagnosticResult(VulkanDiagnosticEventIds.PresentWait, result)
    if result != VkConstants.VK_SUCCESS {
      if result == VkConstants.VK_ERROR_DEVICE_LOST { activeRuntime.MarkDeviceLost() }
      throw InvalidOperationException("Vulkan graphics timeline query failed: " + result.ToString())
    }
    return completed
  }
}
