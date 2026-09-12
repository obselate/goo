package Goo

internal unsafe partial class VulkanWindowTarget {
  private var forceFullRedraw bool
  private var recoveryPending bool

  internal func RecoveryRuntime() VulkanSharedLease ? -> runtime

  internal func ServiceRecoveryQueueCompletion() {
    if queueStage == QueueStageSubmit || queueStage == QueueStageSubmitRetry {
      PollQueueCompletion()
    }
  }

  internal func RecordDeviceRecovery(result VkResult, oldGeneration uint64,
    targetCount int32) {
      if let currentDiagnostics = diagnostics {
        currentDiagnostics.AddDeviceRecovery(1uL)
      }
      let newGeneration = if let currentRuntime = runtime {
        currentRuntime.Generation
      } else {
        0uL
      }
      RecordDiagnosticEvent(
        VulkanDiagnosticEventIds.RuntimeDeviceLost,
        VulkanDiagnosticCategories.Recovery,
        1uL,
        int32(result),
        oldGeneration,
        0uL)
      RecordDiagnosticEvent(
        VulkanDiagnosticEventIds.RuntimeRecovery,
        VulkanDiagnosticCategories.Recovery,
        0uL,
        0,
        newGeneration,
        targetCount > 1 ? uint64(targetCount) : 1uL)
    }

  internal func RecordDeviceRecoveryFailure(result VkResult) {
    CaptureDiagnosticFatal(int32(result), VulkanDiagnosticEventIds.RuntimeRecovery)
  }

  internal func AbandonForDeviceRecovery() {
    let staleLease = runtime
    AbandonReadbackAfterDeviceLoss()
    PrepareForDeviceRecovery()
    runtime = nil
    if let lease = staleLease {
      lease.AbandonAfterDeviceLoss()
    }
  }

  internal func CleanupFailedDeviceRecovery() {
    let staleLease = runtime
    AbandonReadbackAfterDeviceLoss()
    if staleLease == nil {
      CleanupUnpublishedBootstrap()
    }
    try { PrepareForDeviceRecovery() } catch (cleanup Exception) { }
    runtime = nil
    if let lease = staleLease {
      try { lease.AbandonAfterDeviceLoss() } catch (cleanup Exception) { }
    }
  }

  private func CleanupUnpublishedBootstrap() {
    let staleInstance = instance
    let staleDevice = device
    let staleSurface = surface
    let staleSurfaceCreated = surfaceCreated
    surface = 0uL
    surfaceCreated = false
    if staleSurfaceCreated && staleSurface != 0uL && staleInstance != nint(0) {
      try {
        host.DestroyVulkanSurface(staleInstance, staleSurface)
        if let accounting = windowObjectAccounting {
          accounting.Release()
        }
      } catch (cleanup Exception) { }
    }
    if staleDevice != nint(0) {
      var destroyed = false
      if deviceDestroyAvailable {
        try {
          let destroyDevice = dispatch.vkDestroyDevice
          destroyDevice(staleDevice, nil)
          destroyed = true
        } catch (cleanup Exception) { }
      } else if staleInstance != nint(0) {
        try {
          let nullable = ResolveGlobalProc(staleInstance, "vkDestroyDevice") as (unmanaged[Cdecl](VkDevice, *VkAllocationCallbacks) -> void)?
          if nullable != nil {
            let destroyDevice = nullable
            destroyDevice(staleDevice, nil)
            destroyed = true
          }
        } catch (cleanup Exception) { }
      }
      if destroyed {
        if let accounting = sharedObjectAccounting {
          try { accounting.Release() } catch (cleanup Exception) { }
        }
      }
      device = nint(0)
    }
    try { DestroyValidationMessenger() } catch (cleanup Exception) { }
    if staleInstance != nint(0) {
      var destroyed = false
      if instanceDestroyAvailable {
        try {
          let destroyInstance = instanceDispatch.vkDestroyInstance
          destroyInstance(staleInstance, nil)
          destroyed = true
        } catch (cleanup Exception) { }
      } else {
        try {
          let nullable = ResolveGlobalProc(staleInstance, "vkDestroyInstance") as (unmanaged[Cdecl](VkInstance, *VkAllocationCallbacks) -> void)?
          if nullable != nil {
            let destroyInstance = nullable
            destroyInstance(staleInstance, nil)
            destroyed = true
          }
        } catch (cleanup Exception) { }
      }
      if destroyed {
        if let accounting = sharedObjectAccounting {
          try { accounting.Release() } catch (cleanup Exception) { }
        }
      }
      instance = nint(0)
    }
  }

  private func AbandonAfterDeviceLossForClose() {
    let staleLease = runtime
    AbandonReadbackAfterDeviceLoss()
    try { PrepareForDeviceRecovery() } catch (cleanup Exception) { }
    runtime = nil
    if let lease = staleLease {
      try { lease.AbandonAfterDeviceLoss() } catch (cleanup Exception) { }
    }
    if vulkanLoaded {
      try { host.UnloadVulkanLibrary() } catch (cleanup Exception) { }
      vulkanLoaded = false
    }
  }

  private func PrepareForDeviceRecovery() {
    InvalidateLastPresentedImageState()
    frameFailed = false
    recoveryPending = true
    queueMailbox = nil
    queueStage = QueueStageIdle
    pendingGlobalSubmissionSerial = 0uL
    pendingSubmitStart = 0uL
    pendingPresentStart = 0uL
    pendingPresentFence = 0uL
    completedGraphicsSubmissionSerial = 0uL
    let staleImageScene = imageScene
    imageScene = nil
    if let scene = staleImageScene {
      try { scene.Dispose() } catch (cleanup Exception) { }
    }
    let stalePathScene = pathScene
    pathScene = nil
    if let scene = stalePathScene {
      try { scene.Dispose() } catch (cleanup Exception) { }
    }
    textScene = nil
    RemoveTextAtlasDiagnosticContribution()
    let staleTextAtlas = textAtlas
    textAtlas = nil
    if let atlas = staleTextAtlas {
      try { atlas.DisposeAfterDeviceLoss() } catch (cleanup Exception) { }
    }
    if let atlas = clipMaskAtlas {
      try { atlas.DisposeAfterDeviceLoss() } catch (cleanup Exception) { }
      clipMaskAtlasAbandoned = true
    }
    let staleRenderer = primitiveRenderer
    primitiveRenderer = nil
    if let renderer = staleRenderer {
      try { renderer.DisposeAfterDeviceLoss() } catch (cleanup Exception) { }
    }
    clipMaskFrameStats = VulkanClipMaskFrameStats{}
    clipMaskFrameTotals = VulkanClipMaskFrameTotals{}
    let staleLayerPool = layerPool
    layerPool = nil
    if let pool = staleLayerPool {
      try { pool.AbandonAfterDeviceLoss() } catch (cleanup Exception) { }
    }
    let staleTimestampState = timestampState
    timestampState = nil
    if let current = staleTimestampState {
      try { current.ForceDestroyTimestampQueryPool() } catch (cleanup Exception) {
        try { current.AbandonTimestampQueryPool() } catch (cleanup Exception) { }
      }
    }
    let staleGeneration = generation
    generation = nil
    try { if let current = staleGeneration { current.DisposeAfterDeviceLoss() } } catch (cleanup Exception) { }
    try { DisposeRetiredSwapchainsAfterDeviceLoss() } catch (cleanup Exception) { }
    presentationRetirement.ResetAfterDeviceLoss()
    frameSlots.DisposeAfterDeviceLoss()
    let staleDevice = device
    let staleCommandPool = commandPool
    let staleCommandBufferCount = commandBufferObjectCount
    commandPool = 0uL
    commandBufferObjectCount = 0
    if staleCommandPool != 0uL && staleDevice != nint(0) {
      let destroyCommandPool = dispatch.vkDestroyCommandPool
      try { destroyCommandPool(staleDevice, staleCommandPool, nil) } catch (cleanup Exception) { }
      var bufferIndex int32 = 0
      while bufferIndex < staleCommandBufferCount {
        if let accounting = windowObjectAccounting {
          try { accounting.Release() } catch (cleanup Exception) { }
        }
        bufferIndex = bufferIndex + 1
      }
      if let accounting = windowObjectAccounting {
        try { accounting.Release() } catch (cleanup Exception) { }
      }
    }
    AbandonCurrentSurfaceAfterDeviceLoss()
    runtime = nil
    memoryAllocator = nil
    imageResources = nil
    pathResources = nil
    instance = nint(0)
    instanceDispatch = VkInstanceDispatch{}
    instanceMaintenanceVariant = VulkanSwapchainMaintenanceVariant.None
    swapchainMaintenanceVariant = VulkanSwapchainMaintenanceVariant.None
    portabilitySubsetSupported = false
    physicalDevice = nint(0)
    device = nint(0)
    dispatch = VkDeviceDispatch{}
    queue = nint(0)
    queueFamilyIndex = 0u
    deviceWaitIdleAddress = nint(0)
    memoryBudgetSupported = false
    debugUtilsEnabled = false
    instanceDestroyAvailable = false
    deviceDestroyAvailable = false
    validation = nil
    validationMessenger = 0uL
    validationMessengerCreated = false
    timestampValidBits = 0u
    timestampPeriod = 0.0F
    timestampComputeAndGraphics = VkConstants.VK_FALSE
    deviceFacts = VulkanSharedDeviceFacts{}
    surface = 0uL
    surfaceCreated = false
    frameBegun = false
    renderingBegun = false
    frameRendered = false
    clipMaskFrameStarted = false
    clipMaskFramePrepared = false
    activeFrameSlot = nil
    activeFrameSlotIndex = 0u
    activeImageIndex = 0u
    activeImageLayout = VkConstants.VK_IMAGE_LAYOUT_UNDEFINED
    activeFrameId = 0uL
    recreatePending = true
    surfaceLost = false
    forceFullRedraw = true
  }

  private func AbandonCurrentSurfaceAfterDeviceLoss() {
    let staleInstance = instance
    let staleSurface = surface
    let staleSurfaceCreated = surfaceCreated
    surface = 0uL
    surfaceCreated = false
    if staleSurfaceCreated && staleSurface != 0uL && staleInstance != nint(0) {
      try { host.DestroyVulkanSurface(staleInstance, staleSurface) } catch (cleanup Exception) { }
      if let accounting = windowObjectAccounting {
        try { accounting.Release() } catch (cleanup Exception) { }
      }
    }
  }

  internal func RebuildAfterDeviceRecovery() {
    Bootstrap()
    sceneCompiler.SetTextScene(textScene)
    sceneCompiler.SetImageScene(imageScene)
    sceneCompiler.SetPathScene(pathScene)
    if clipMaskAtlasAbandoned {
      guard let atlas = clipMaskAtlas else {
        throw InvalidOperationException("Vulkan clip mask atlas was lost during recovery")
      }
      guard let allocator = memoryAllocator else {
        throw InvalidOperationException("Vulkan memory allocator is unavailable during recovery")
      }
      guard let activeRuntime = runtime else {
        throw InvalidOperationException("Vulkan shared runtime is unavailable during recovery")
      }
      atlas.Rebuild(
        device,
        dispatch,
        allocator,
        clipMaskFormatSupport,
        windowObjectAccounting,
        activeRuntime.Generation)
      clipMaskAtlasAbandoned = false
      clipMaskRedrawPending = true
    }
    let width = if requestedWidth > 0 { requestedWidth } else { framebufferWidth }
    let height = if requestedHeight > 0 { requestedHeight } else { framebufferHeight }
    if width > 0 && height > 0 {
      if !RecreateSwapchain(width, height) {
        throw InvalidOperationException("Vulkan swapchain recreation failed during device recovery")
      }
    }
    frameFailed = false
    recoveryPending = false
    forceFullRedraw = true
  }

  internal func FinishDeviceRecovery() {
    frameFailed = false
    recoveryPending = false
    forceFullRedraw = true
  }

  internal func MarkRecoveryTerminal() {
    frameFailed = true
    recoveryPending = false
    runtime = nil
  }

  private func DisposeRetiredSwapchainsAfterDeviceLoss() {
    retiredSwapchains.DisposeAfterDeviceLoss()
  }

  internal prop RecoveryInProgress bool{
    get -> VulkanDeviceRecoveryCoordinator.InProgress
  }
}
