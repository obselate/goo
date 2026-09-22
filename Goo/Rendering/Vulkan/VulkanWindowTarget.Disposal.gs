package Goo

import System
import System.Collections.Generic
import System.Diagnostics
import System.Numerics
import System.Threading

internal unsafe partial class VulkanWindowTarget {
  public func Resize(width int32, height int32) bool {
    if disposed || width < 0 || height < 0 {
      return false
    }
    guard let activeRuntime = runtime else {
      return false
    }
    if activeRuntime.Terminal {
      return false
    }
    if activeRuntime.DeviceLost {
      if !VulkanDeviceRecoveryCoordinator.Recover(VkConstants.VK_ERROR_DEVICE_LOST) {
        return false
      }
    }
    requestedWidth = width
    requestedHeight = height
    framebufferWidth = width
    framebufferHeight = height
    if QueueWorkPending {
      recreatePending = true
      return true
    }
    if width == 0 || height == 0 {
      recreatePending = true
      return true
    }
    if frameBegun {
      return false
    }
    frameFailureRetryable = false
    let recreated = RecreateSwapchain(width, height)
    if !recreated && frameFailureRetryable {
      recreatePending = true
    }
    return recreated || frameFailureRetryable
  }

  public func Dispose() {
    if disposed {
      return
    }
    presentationRetirement.ClearPresentationLatency()
    if QueueWorkPending {
      host.Wake()
      return
    }
    InvalidateLastPresentedImageState()
    let lostRuntime = runtime
    if let activeRuntime = lostRuntime {
      if activeRuntime.Terminal {
        disposed = true
        VulkanDeviceRecoveryCoordinator.Unregister(this)
        RemoveTextAtlasDiagnosticContribution()
        RecordDiagnosticResult(
          VulkanDiagnosticEventIds.PresentWait,
          activeRuntime.TerminalIdleResult)
        RecordDiagnosticEvent(
          VulkanDiagnosticEventIds.WindowDestroy,
          VulkanDiagnosticCategories.Window,
          1uL,
          int32(activeRuntime.TerminalIdleResult),
          0uL,
          0uL)
        VulkanWindowTarget.RetainTerminalTarget(this)
        if let currentDiagnostics = diagnostics {
          CaptureDiagnosticLiveMemory(VulkanDiagnosticEventIds.LiveMemory)
          currentDiagnostics.Seal()
          try { currentDiagnostics.FlushNdjson(Console.Error) } catch (cleanup Exception) { }
        }
        return
      }
      if activeRuntime.DeviceLost {
        AbandonReadbackAfterDeviceLoss()
      }
    }
    disposed = true
    VulkanDeviceRecoveryCoordinator.Unregister(this)
    if let activeRuntime = lostRuntime {
      if activeRuntime.DeviceLost && VulkanDeviceRecoveryCoordinator.Count > 0 {
        AbandonAfterDeviceLossForClose()
        return
      }
    }
    if let scene = imageScene {
      try { scene.Dispose() } catch (cleanup Exception) { }
    }
    CaptureDiagnosticWsi()
    CaptureDiagnosticResources()
    CaptureDiagnosticLiveMemory(VulkanDiagnosticEventIds.LiveMemory)
    let liveTargetsRemain = VulkanDeviceRecoveryCoordinator.Count > 0
    var deviceIdleCompleted = device == nint(0)
    var idleResult VkResult = if deviceIdleCompleted {
      VkConstants.VK_SUCCESS
    } else {
      VkConstants.VK_ERROR_INITIALIZATION_FAILED
    }
    if device != nint(0) {
      if liveTargetsRemain {
        idleResult = WaitForOwnedWorkCompletion()
      }
      if !liveTargetsRemain || idleResult == VkConstants.VK_ERROR_FEATURE_NOT_PRESENT {
        idleResult = WaitDeviceIdleResult()
        deviceIdleCompleted = idleResult == VkConstants.VK_SUCCESS
      }
    }
    RecordDiagnosticResult(VulkanDiagnosticEventIds.PresentWait, idleResult)
    let ownedWorkCompleted = device == nint(0) || idleResult == VkConstants.VK_SUCCESS
    if ownedWorkCompleted {
      if !DrainReadbackForClose(deviceIdleCompleted) {
        disposed = false
        VulkanDeviceRecoveryCoordinator.Register(this)
        throw InvalidOperationException("Vulkan readback could not be drained during close")
      }
    } else {
      var deviceLoss = idleResult == VkConstants.VK_ERROR_DEVICE_LOST
      if let activeRuntime = runtime {
        deviceLoss = deviceLoss || activeRuntime.DeviceLost
      }
      if deviceLoss {
        AbandonReadbackAfterDeviceLoss()
      } else {
        disposed = false
        VulkanDeviceRecoveryCoordinator.Register(this)
        throw InvalidOperationException("Vulkan window work did not complete during close")
      }
    }
    CaptureDiagnosticValidationBoundary()
    if !ownedWorkCompleted {
      RemoveTextAtlasDiagnosticContribution()
      if let activeRuntime = runtime {
        activeRuntime.MarkTeardownFailed(idleResult)
      } else {
        VulkanSharedRuntime.MarkGlobalTerminalFailure(idleResult)
      }
      RecordDiagnosticEvent(
        VulkanDiagnosticEventIds.WindowDestroy,
        VulkanDiagnosticCategories.Window,
        1uL,
        int32(idleResult),
        uint64(surface),
        DiagnosticSwapchainValue())
      VulkanWindowTarget.RetainTerminalTarget(this)
      if let currentDiagnostics = diagnostics {
        currentDiagnostics.Seal()
        try { currentDiagnostics.FlushNdjson(Console.Error) } catch (cleanup Exception) { }
      }
      return
    }
    if let renderer = primitiveRenderer {
      try { renderer.ReleaseImageReferences(sceneCompiler.Frame) } catch (cleanup Exception) { }
    }
    try { AbortUnsubmittedImageUploads() } catch (cleanup Exception) { }
    try { AbortUnsubmittedPathUpload() } catch (cleanup Exception) { }
    try { AbortUnsubmittedClipMask() } catch (cleanup Exception) { }
    CloseDiagnosticFrame(false)
    ClearActiveFrame()
    DestroyDiagnosticTimestampPool()
    let timestampPoolDestroyed = ForceDestroyDiagnosticTimestampPool()
    if let renderer = primitiveRenderer {
      try { renderer.Collect(CompletedGlobalSubmissionSerial()) } catch (cleanup Exception) { }
      try { renderer.Dispose() } catch (cleanup Exception) { }
      primitiveRenderer = nil
    }
    if let pool = layerPool {
      try { pool.Dispose() } catch (cleanup Exception) { }
      layerPool = nil
    }
    if let atlas = clipMaskAtlas {
      try { atlas.RetireAll(uint64.MaxValue) } catch (cleanup Exception) { }
      try { atlas.Dispose() } catch (cleanup Exception) { }
      clipMaskAtlas = nil
    }
    clipMaskRedrawPending = false
    clipMaskFrameStarted = false
    clipMaskFramePrepared = false
    clipMaskAtlasAbandoned = false
    if let atlas = textAtlas {
      try { atlas.RetireAll(uint64.MaxValue) } catch (cleanup Exception) { }
      try { atlas.Collect(uint64.MaxValue) } catch (cleanup Exception) { }
      try { atlas.AbortUploads() } catch (cleanup Exception) { }
      try { atlas.Dispose() } catch (cleanup Exception) { }
      textAtlas = nil
    }
    textScene = nil
    RemoveTextAtlasDiagnosticContribution()
    textRedrawPending = false
    imageScene = nil
    imageRedrawPending = false
    imageResources = nil
    if let scene = pathScene {
      try { scene.Dispose() } catch (cleanup Exception) { }
      pathScene = nil
    }
    pathRedrawPending = false
    pathResources = nil
    if let current = generation {
      try {
        let presentCompletionResult = current.WaitForPresentCompletion(presentationRetirement)
        RecordDiagnosticResult(VulkanDiagnosticEventIds.PresentWait, presentCompletionResult)
      } catch (cleanup Exception) { }
      try { current.Dispose() } catch (cleanup Exception) { }
      generation = nil
    }
    DisposeRetiredSwapchains()
    frameSlots.Dispose()
    if commandPool != 0uL && device != nint(0) {
      let destroyCommandPool = dispatch.vkDestroyCommandPool
      destroyCommandPool(device, commandPool, nil)
      var bufferIndex int32 = 0
      while bufferIndex < commandBufferObjectCount {
        if let accounting = windowObjectAccounting {
          accounting.Release()
        }
        bufferIndex = bufferIndex + 1
      }
      commandBufferObjectCount = 0
      if let accounting = windowObjectAccounting {
        accounting.Release()
      }
      commandPool = 0uL
    }
    if surfaceCreated && instance != nint(0) {
      try { host.DestroyVulkanSurface(instance, surface) } catch (cleanup Exception) { }
      if let accounting = windowObjectAccounting {
        accounting.Release()
      }
      surface = 0uL
      surfaceCreated = false
    }
    if runtime == nil {
      try { DestroyValidationMessenger() } catch (cleanup Exception) { }
    }
    if runtime == nil && device != nint(0) && deviceDestroyAvailable {
      let destroyDevice = dispatch.vkDestroyDevice
      destroyDevice(device, nil)
      if let accounting = sharedObjectAccounting {
        accounting.Release()
      }
      device = nint(0)
    }
    if runtime == nil && instance != nint(0) && instanceDestroyAvailable {
      let destroyInstance = instanceDispatch.vkDestroyInstance
      destroyInstance(instance, nil)
      if let accounting = sharedObjectAccounting {
        accounting.Release()
      }
      instance = nint(0)
    }
    var flushDiagnostics = runtime == nil
    if let activeRuntime = runtime {
      var releasedLastLease = false
      try {
        releasedLastLease = if deviceIdleCompleted {
          activeRuntime.ReleaseAfterIdle()
        } else {
          activeRuntime.Release()
        }
      } catch (cleanup Exception) { }
      if !releasedLastLease && activeRuntime.Terminal {
        RemoveTextAtlasDiagnosticContribution()
        RecordDiagnosticResult(
          VulkanDiagnosticEventIds.PresentWait,
          activeRuntime.TerminalIdleResult)
        RecordDiagnosticEvent(
          VulkanDiagnosticEventIds.WindowDestroy,
          VulkanDiagnosticCategories.Window,
          1uL,
          int32(activeRuntime.TerminalIdleResult),
          0uL,
          0uL)
        VulkanWindowTarget.RetainTerminalTarget(this)
        if let currentDiagnostics = diagnostics {
          currentDiagnostics.Seal()
          try { currentDiagnostics.FlushNdjson(Console.Error) } catch (cleanup Exception) { }
        }
        return
      }
      runtime = nil
      if releasedLastLease {
        flushDiagnostics = true
      }
    }
    if !timestampPoolDestroyed {
      AbandonDiagnosticTimestampPool()
    }
    RemoveTextAtlasDiagnosticContribution()
    instance = nint(0)
    device = nint(0)
    CaptureDiagnosticResources()
    memoryAllocator = nil
    if vulkanLoaded {
      try { host.UnloadVulkanLibrary() } catch (cleanup Exception) { }
      vulkanLoaded = false
    }
    CaptureDiagnosticValidationBoundary()
    RecordDiagnosticEvent(
      VulkanDiagnosticEventIds.WindowDestroy,
      VulkanDiagnosticCategories.Window,
      0uL,
      0,
      0uL,
      0uL)
    if flushDiagnostics {
      if let currentDiagnostics = diagnostics {
        currentDiagnostics.Seal()
        try { currentDiagnostics.FlushNdjson(Console.Error) } catch (cleanup Exception) { }
      }
    }
    activeFrameSlot = nil
    activeFrameSlotIndex = 0u
    activeImageIndex = 0u
    activeImageLayout = VkConstants.VK_IMAGE_LAYOUT_UNDEFINED
    activeFrameId = 0uL
    frameBegun = false
  }

}
