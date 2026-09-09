package Goo

import System
import System.Collections.Generic
import System.Diagnostics
import System.Numerics
import System.Threading

internal unsafe partial class VulkanWindowTarget : IDisposable, FrameProfileSink, WindowRenderTarget {
  shared {
    private var terminalTargets List[VulkanWindowTarget]? = nil
    private var testFailNextSurfaceLost int32

    internal func RetainTerminalTarget(target VulkanWindowTarget) {
      if terminalTargets == nil {
        terminalTargets = List[VulkanWindowTarget]()
      }
      terminalTargets!!.Add(target)
    }

    internal func FailNextSurfaceLostForTest() {
      Interlocked.Exchange(ref testFailNextSurfaceLost, 1)
    }

    private func TakeTestSurfaceLostForTest() bool -> Interlocked.Exchange(ref testFailNextSurfaceLost, 0) != 0
  }

  private let host VulkanSurfaceHost
  private let diagnosticWindowHandle uint64
  private var diagnostics VulkanDiagnostics? = nil
  private var timestampState VulkanDiagnosticTimestampState? = nil
  private var validation VulkanDiagnosticsValidation? = nil
  private let sceneCompiler VulkanSceneCompiler
  private let presentationRetirement VulkanPresentationRetirement
  private var runtime VulkanSharedLease? = nil
  private var queueMailbox VulkanQueueMailbox? = nil
  private let validateGraphicsSubmission Action[uint64]
  private var completedGraphicsSubmissionSerial uint64
  private var objectAccounting VulkanObjectAccounting? = nil
  private var sharedObjectAccounting VulkanObjectAccounting? = nil
  private var windowObjectAccounting VulkanObjectAccounting? = nil
  private var memoryAllocator VulkanMemoryAllocator? = nil
  private var imageResources VulkanImageResources? = nil
  private var imageScene VulkanImageScene? = nil
  private var pathResources VulkanPathResources? = nil
  private var pathScene VulkanPathScene? = nil
  private var textAtlas VulkanTextAtlasSet? = nil
  private var textScene VulkanTextScene? = nil
  private var textAtlasDiagnosticsToken uint64
  private var clipMaskAtlas VulkanClipMaskAtlas? = nil
  private var clipMaskRedrawPending bool
  private var clipMaskFrameStarted bool
  private var clipMaskFramePrepared bool
  private var clipMaskAtlasAbandoned bool
  private var clipMaskFrameStats VulkanClipMaskFrameStats
  private var clipMaskFrameTotals VulkanClipMaskFrameTotals
  private var instance VkInstance = nint(0)
  private var instanceDispatch VkInstanceDispatch = VkInstanceDispatch{}
  private var getProcAddress nint = nint(0)
  private var instanceMaintenanceVariant VulkanSwapchainMaintenanceVariant
  private var swapchainMaintenanceVariant VulkanSwapchainMaintenanceVariant
  private var portabilitySubsetSupported bool
  private var memoryBudgetSupported bool
  private var clipMaskFormatSupport VulkanClipMaskFormatSupport
  private var physicalDevice VkPhysicalDevice = nint(0)
  private var device VkDevice = nint(0)
  private var dispatch VkDeviceDispatch = VkDeviceDispatch{}
  private var instanceDestroyAvailable bool
  private var deviceDestroyAvailable bool
  private var debugUtilsEnabled bool
  private var validationMessenger VkDebugUtilsMessengerEXT = 0uL
  private var validationMessengerCreated bool
  private var timestampValidBits uint32
  private var timestampPeriod float32
  private var timestampComputeAndGraphics VkBool32 = VkConstants.VK_FALSE
  private var deviceFacts VulkanSharedDeviceFacts
  private var queue VkQueue = nint(0)
  private var queueFamilyIndex uint32 = 0u
  private var surface VkSurfaceKHR = 0uL
  private var surfaceCreated bool
  private var vulkanLoaded bool
  private var deviceWaitIdleAddress nint = nint(0)
  private var commandPool VkCommandPool = 0uL
  private var commandBufferObjectCount int32
  private var frameSlots VulkanFrameSlotRing
  private var generation VulkanSwapchainGeneration? = nil
  private let retiredSwapchains VulkanRetiredSwapchainSet
  private var primitiveRenderer VulkanPrimitiveRenderer? = nil
  private var layerPool VulkanOffscreenLayerPool? = nil
  private var framebufferWidth int32
  private var framebufferHeight int32
  private var requestedWidth int32
  private var requestedHeight int32
  private var nextFrameId uint64
  private var activeFrameId uint64
  private var activeFrameSlot VulkanFrameSlot? = nil
  private var activeFrameSlotIndex uint32
  private var activeImageIndex uint32
  private var activeImageLayout VkImageLayout
  private var frameBegun bool
  private var renderingBegun bool
  private var frameRendered bool
  private var frameRenderDeferred bool
  private var activeDamageRegion VulkanDamageRegion
  private var activePartialRedraw bool
  private var activeSceneVersion uint64
  private var activeAppliedSceneVersion uint64
  private var lastFrameSubmitted bool
  private var activeImagePromoted bool
  private var lastPresentedImageStateValid bool
  private var lastPresentedImageIndex uint32
  private var lastPresentedAppliedSceneVersion uint64
  private var lastPresentedPendingSceneVersion uint64
  private var lastPresentedImagePromoted bool
  private var frameFailed bool
  private var frameFailureRetryable bool
  private var textRedrawPending bool
  private var imageRedrawPending bool
  private var pathRedrawPending bool
  private var recreatePending bool = true
  private var vsync bool
  private var surfaceLost bool
  private var disposed bool
  private const QueueStageIdle int32 = 0
  private const QueueStageSubmit int32 = 1
  private const QueueStagePresentPrepare int32 = 2
  private const QueueStagePresent int32 = 3
  private const QueueStageSubmitRetry int32 = 4
  private var queueStage int32
  private var pendingGlobalSubmissionSerial uint64
  private var pendingSubmitStart uint64
  private var pendingPresentStart uint64
  private var pendingPresentFence VkFence

  public prop ProfileSink FrameProfileSink{ get -> this }

  public prop NeedsRender bool{
    get {
      if let activeRuntime = runtime {
        if activeRuntime.DeviceLost {
          return true
        }
      }
      return textRedrawPending || imageRedrawPending || pathRedrawPending
        || clipMaskRedrawPending
        || sceneCompiler.Frame.LavaCount > 0
        || forceFullRedraw
        || (recreatePending && framebufferWidth > 0 && framebufferHeight > 0)
    }
  }

  public prop LastFrameSubmitted bool{ get -> lastFrameSubmitted }
  public prop QueueWorkPending bool{ get -> queueStage != QueueStageIdle }

  public func PrepareClose() bool {
    PollQueueCompletion()
    if queueStage != QueueStageIdle || frameBegun {
      return false
    }
    if let activeRuntime = runtime {
      if activeRuntime.Terminal {
        return true
      }
      if activeRuntime.QueueWorker.HasOutstandingWork {
        host.Wake()
        return false
      }
    }
    var ready = true
    if let slot = frameSlots.Slot(0u) {
      let result = slot.PollForCompletion()
      RecordDiagnosticResult(VulkanDiagnosticEventIds.PresentWait, result)
      if result == VkConstants.VK_ERROR_DEVICE_LOST {
        runtime?.MarkDeviceLost()
      } else if result != VkConstants.VK_SUCCESS {
        ready = false
      } else {
        presentationRetirement.CollectCompleted(0u, slot.LastCompletedSerial)
      }
    }
    if let slot = frameSlots.Slot(1u) {
      let result = slot.PollForCompletion()
      RecordDiagnosticResult(VulkanDiagnosticEventIds.PresentWait, result)
      if result == VkConstants.VK_ERROR_DEVICE_LOST {
        runtime?.MarkDeviceLost()
      } else if result != VkConstants.VK_SUCCESS {
        ready = false
      } else {
        presentationRetirement.CollectCompleted(1u, slot.LastCompletedSerial)
      }
    }
    if let current = generation {
      let result = current.PollForPresentCompletion(presentationRetirement)
      RecordDiagnosticResult(VulkanDiagnosticEventIds.PresentWait, result)
      if result == VkConstants.VK_ERROR_DEVICE_LOST {
        runtime?.MarkDeviceLost()
      } else if result != VkConstants.VK_SUCCESS {
        ready = false
      }
    }
    var retiredIndex int32 = 0
    while retiredIndex < retiredSwapchains.Count {
      let result = retiredSwapchains.Generation(retiredIndex).PollForPresentCompletion(presentationRetirement)
      RecordDiagnosticResult(VulkanDiagnosticEventIds.PresentWait, result)
      if result == VkConstants.VK_ERROR_DEVICE_LOST {
        runtime?.MarkDeviceLost()
      } else if result != VkConstants.VK_SUCCESS {
        ready = false
      }
      retiredIndex = retiredIndex + 1
    }
    CollectRetiredSwapchains()
    if let request = readbackRequest {
      let result = request.PollTargetCompletionForClose()
      if result == VkConstants.VK_ERROR_DEVICE_LOST {
        runtime?.MarkDeviceLost()
      } else if result == VkConstants.VK_NOT_READY || result == VkConstants.VK_TIMEOUT {
        ready = false
      } else if result != VkConstants.VK_SUCCESS {
        throw InvalidOperationException("Vulkan readback close poll failed: " + result.ToString())
      }
    }
    if ready {
      return true
    }
    return VulkanDeviceRecoveryCoordinator.Count <= 1
  }

  internal func HoldNextQueueSubmitForTest() {
    guard let mailbox = queueMailbox else { return }
    VulkanSharedRuntime.HoldQueueSubmitForMailboxForTest(mailbox)
  }

  internal func HoldNextQueuePresentForTest() {
    guard let mailbox = queueMailbox else { return }
    VulkanSharedRuntime.HoldQueuePresentForMailboxForTest(mailbox)
  }

  internal func FailedIdleCollectRetiredSwapchainsForTest() {
    CollectRetiredSwapchains()
  }
  internal func SetPresentationLatencySink(
    sink Action[VulkanPresentationLatencySample]?) {
      if sink == nil {
        presentationRetirement.ClearPresentationLatency()
        return
      }
      presentationRetirement.SetPresentationLatencySink(sink)
    }

  internal func BeginPresentationLatency(
    token uint64, kind int32, startTimestamp int64) {
      presentationRetirement.BeginPresentationLatency(token, kind, startTimestamp)
    }

  internal prop PresentFenceSupported bool{
    get {
      if let current = generation {
        return current.PresentFenceEnabled
      }
      return false
    }
  }

  internal prop CurrentPresentMode VkPresentModeKHR{
    get {
      if let current = generation {
        return current.PresentMode
      }
      return VkPresentModeKHR(-1)
    }
  }

  internal prop CurrentPresentGeneration uint64{
    get {
      if let current = generation {
        return current.Generation
      }
      return 0uL
    }
  }

  public func SetVSync(value bool) {
    if disposed || vsync == value {
      return
    }
    vsync = value
    recreatePending = true
    forceFullRedraw = true
    host.RefreshDisplayPacing(true)
    host.Wake()
  }

  internal init(nativeHost VulkanSurfaceHost) {
    if nativeHost == nil {
      throw ArgumentNullException("nativeHost")
    }
    host = nativeHost
    validateGraphicsSubmission = (serial uint64) -> { ValidateGraphicsSubmission(serial) }
    diagnosticWindowHandle = uint64(nativeHost.WindowHandle)
    vsync = host.VSync
    sceneCompiler = VulkanSceneCompiler()
    presentationRetirement = VulkanPresentationRetirement(64u, 8u)
    retiredSwapchains = VulkanRetiredSwapchainSet(8)
    try {
      Bootstrap()
      if let resources = textScene {
        sceneCompiler.SetTextScene(resources)
      }
      sceneCompiler.SetImageScene(imageScene)
      sceneCompiler.SetPathScene(pathScene)
      RecordDiagnosticEvent(
        VulkanDiagnosticEventIds.WindowCreate,
        VulkanDiagnosticCategories.Window,
        0uL,
        0,
        uint64(framebufferWidth),
        uint64(framebufferHeight))
      CaptureDiagnosticWsi()
      VulkanDeviceRecoveryCoordinator.Register(this)
    } catch (error Exception) {
      CaptureDiagnosticFatal(-1, VulkanDiagnosticEventIds.RuntimeStart)
      try { Dispose() } catch (cleanup Exception) { }
      throw error
    }
  }

  public func BeginFrame() {
    lastFrameSubmitted = false
    if frameFailed {
      throw InvalidOperationException("Vulkan window target cannot continue after a failed frame")
    }
    if disposed || frameBegun || queueStage != QueueStageIdle {
      return
    }
    if let activeRuntime = runtime {
      if activeRuntime.DeviceLost {
        if !VulkanDeviceRecoveryCoordinator.Recover(VkConstants.VK_ERROR_DEVICE_LOST) {
          frameFailed = true
          throw InvalidOperationException("Vulkan device recovery failed")
        }
      } else if activeRuntime.DeviceLost || activeRuntime.Terminal {
        presentationRetirement.ClearPresentationLatency()
        return
      }
    }
    VulkanDeviceRecoveryCoordinator.ServiceQueueCompletions(this)
    if DeferForPendingReadbackSubmission() {
      return
    }
    if let activeRuntime = runtime {
      if activeRuntime.DeviceLost || activeRuntime.Terminal {
        presentationRetirement.ClearPresentationLatency()
        return
      }
      if activeRuntime.HasUnsubmittedRecordedSharedUpload {
        frameFailureRetryable = true
        host.Wake()
        return
      }
    }
    if framebufferWidth <= 0 || framebufferHeight <= 0 {
      return
    }
    activeFrameId = nextFrameId + 1uL
    nextFrameId = activeFrameId
    frameFailureRetryable = false
    frameRenderDeferred = false
    RecordDiagnosticEvent(
      VulkanDiagnosticEventIds.FrameBegin,
      VulkanDiagnosticCategories.Timing,
      0uL,
      0,
      uint64(framebufferWidth),
      uint64(framebufferHeight))
    try {
      if recreatePending {
        if !RecreateSwapchain(requestedWidth, requestedHeight) {
          return
        }
      }
      guard let current = generation else {
        return
      }
      let slotIndex = frameSlots.CurrentIndex
      let slot = frameSlots.Current
      guard let selectedSlot = slot else {
        throw InvalidOperationException("Vulkan frame slots are unavailable")
      }
      let prepareResult = selectedSlot.PrepareAcquire()
      RecordDiagnosticResult(VulkanDiagnosticEventIds.PresentWait, prepareResult)
      if prepareResult != VkConstants.VK_SUCCESS {
        if prepareResult == VkConstants.VK_NOT_READY || prepareResult == VkConstants.VK_TIMEOUT {
          frameFailureRetryable = true
          return
        }
        HandleFrameFailure(prepareResult, VulkanDiagnosticEventIds.PresentWait)
        return
      }
      guard let activeRuntime = runtime else {
        throw InvalidOperationException("Vulkan shared runtime is unavailable")
      }
      var completed uint64
      let completionResult = activeRuntime.GetCompletedGraphicsSubmissionSerial(out completed)
      RecordDiagnosticResult(VulkanDiagnosticEventIds.PresentWait, completionResult)
      if completionResult != VkConstants.VK_SUCCESS {
        selectedSlot.AbortPrepared()
        HandleFrameFailure(completionResult, VulkanDiagnosticEventIds.PresentWait)
        return
      }
      completedGraphicsSubmissionSerial = completed
      ResolveDiagnosticTimestamp(selectedSlot, slotIndex)
      if let atlas = textAtlas {
        atlas.Collect(completedGraphicsSubmissionSerial)
        textScene?.PublishCompletedUploads()
      }
      if let resources = imageResources {
        resources.Collect(completedGraphicsSubmissionSerial)
      }
      if let resources = pathScene {
        resources.Collect(completedGraphicsSubmissionSerial)
      }
      layerPool?.Collect(completedGraphicsSubmissionSerial)
      if let renderer = primitiveRenderer {
        renderer.Collect(completedGraphicsSubmissionSerial)
        clipMaskFrameStats = renderer.ClipMaskFrameStats
        clipMaskFrameTotals = renderer.ClipMaskFrameTotals
      } else if let atlas = clipMaskAtlas {
        atlas.Collect(completedGraphicsSubmissionSerial)
      }
      presentationRetirement.CollectCompleted(slotIndex, selectedSlot.LastCompletedSerial)
      CollectRetiredSwapchains()
      var imageIndex uint32 = 0u
      let acquireNextImage = dispatch.vkAcquireNextImageKHR
      let acquire = acquireNextImage(
        device,
        current.Handle,
        0uL,
        selectedSlot.AcquireSemaphore,
        0uL,
        &imageIndex)
      RecordDiagnosticResult(VulkanDiagnosticEventIds.SwapchainAcquire, acquire)
      let markedAcquire = selectedSlot.MarkAcquired(acquire)
      if markedAcquire != acquire {
        RecordDiagnosticResult(VulkanDiagnosticEventIds.SwapchainAcquire, markedAcquire)
      }
      if markedAcquire == VkConstants.VK_ERROR_OUT_OF_DATE_KHR
        || markedAcquire == VkConstants.VK_ERROR_SURFACE_LOST_KHR{
          recreatePending = true
          surfaceLost = markedAcquire == VkConstants.VK_ERROR_SURFACE_LOST_KHR
          return
        }
      if markedAcquire == VkConstants.VK_NOT_READY || markedAcquire == VkConstants.VK_TIMEOUT {
        frameFailureRetryable = true
        return
      }
      if markedAcquire != VkConstants.VK_SUCCESS && markedAcquire != VkConstants.VK_SUBOPTIMAL_KHR {
        HandleFrameFailure(markedAcquire, VulkanDiagnosticEventIds.SwapchainAcquire)
        return
      }
      activeFrameSlot = selectedSlot
      activeFrameSlotIndex = slotIndex
      activeImageIndex = imageIndex
      frameBegun = true
      renderingBegun = false
      frameRendered = false
      if imageIndex >= current.ImageCount {
        throw InvalidOperationException("Vulkan acquired image index is invalid")
      }
      activeImageLayout = current.CurrentLayout(imageIndex)
      activeImagePromoted = current.PromoteAcquiredSceneVersion(imageIndex)
      activeAppliedSceneVersion = current.AppliedSceneVersion(imageIndex)
      activeSceneVersion = 0uL
      activeDamageRegion = VulkanDamageRegion{}
      activePartialRedraw = false
      CaptureDiagnosticWsi()
      if markedAcquire == VkConstants.VK_SUBOPTIMAL_KHR {
        recreatePending = true
      }
      if !BeginCommandBuffer(selectedSlot) {
        return
      }
    } catch (error Exception) {
      CaptureDiagnosticFatal(-1, VulkanDiagnosticEventIds.SwapchainAcquire)
      if frameBegun && !recoveryPending {
        try { AbandonRecordedFrameForRetry() } catch (cleanup Exception) { frameFailed = true }
        ClearActiveFrame()
      }
      throw error
    } finally {
      if !frameBegun {
        CloseDiagnosticFrame(false)
      }
    }
  }

  internal func Render(root Node?, background Color, dpi Vector2) {
    Render(root, background, dpi, nil)
  }

  public func Render(root Node?, background Color, dpi Vector2, overlay DiagnosticOverlay?) {
    if disposed || !frameBegun || frameRendered {
      return
    }
    if let activeRuntime = runtime {
      if activeRuntime.DeviceLost || activeRuntime.Terminal {
        return
      }
    }
    guard let renderer = primitiveRenderer else {
      return
    }
    try {
      let scaleX = ResolveScale(dpi.X)
      let scaleY = ResolveScale(dpi.Y)
      let logicalWidth = host.LogicalWidth > 0
      ? float32(host.LogicalWidth) : float32(framebufferWidth) / scaleX
      let logicalHeight = host.LogicalHeight > 0
      ? float32(host.LogicalHeight) : float32(framebufferHeight) / scaleY
      let blendModesSupported = if let activeGeneration = generation {
        activeGeneration.SupportsTransferSource
      } else { false }
      sceneCompiler.SetBlendModeSupport(blendModesSupported)
      textScene?.BeginCompile(completedGraphicsSubmissionSerial)
      imageScene?.BeginCompile()
      let planStart = DiagnosticTimestamp()
      let compileResult = sceneCompiler.Compile(root, background, logicalWidth, logicalHeight)
      RecordDiagnosticPlan(planStart, compileResult,
        sceneCompiler.Frame.Counters, sceneCompiler.Frame)
      if compileResult.PathResourceDeferred {
        pathRedrawPending = true
        AbortUnsubmittedTextUpload()
        AbortUnsubmittedImageUploads()
        AbandonRecordedFrameForRetry()
        CloseDiagnosticFrame(false)
        ClearActiveFrame()
        frameRenderDeferred = true
        host.Wake()
        return
      }
      if let debugOverlay = overlay {
        sceneCompiler.AppendDebugOverlay(debugOverlay, compileResult.FrameVersion,
          logicalWidth, logicalHeight)
      }
      textRedrawPending = textScene?.RedrawRequired == true
      imageRedrawPending = imageScene?.RedrawRequired == true
      pathRedrawPending = pathScene?.RedrawRequired == true
      ScaleFrame(sceneCompiler.Frame, scaleX, scaleY)
      guard let current = generation else {
        return
      }
      activeSceneVersion = compileResult.FrameVersion
      var damageRegion VulkanDamageRegion
      var fullRedraw bool
      var hasDamage = sceneCompiler.BuildDamage(
        activeAppliedSceneVersion,
        activeSceneVersion,
        scaleX,
        scaleY,
        current.Extent.width,
        current.Extent.height,
        out damageRegion,
        out fullRedraw)
      if forceFullRedraw || textRedrawPending || imageRedrawPending
        || pathRedrawPending || clipMaskRedrawPending
        || sceneCompiler.Frame.LavaCount > 0 {
          fullRedraw = true
          hasDamage = true
          damageRegion = VulkanDamageRegion{
            X: 0,
            Y: 0,
            Width: int32(current.Extent.width),
            Height: int32(current.Extent.height),
          }
        } else if !hasDamage {
          fullRedraw = true
          hasDamage = true
          damageRegion = VulkanDamageRegion{
            X: 0,
            Y: 0,
            Width: int32(current.Extent.width),
            Height: int32(current.Extent.height),
          }
        }
      activeDamageRegion = damageRegion
      activePartialRedraw = hasDamage && !fullRedraw
      RecordDiagnosticDamage(damageRegion, hasDamage)
      let uploadStart = DiagnosticTimestamp()
      var uploadBytes uint64 = 0uL
      if let resources = imageResources {
        if let slot = activeFrameSlot {
          var imageUploadBytes VkDeviceSize = 0uL
          var imageUploadBarriers int32 = 0
          resources.RecordUploads(
            slot.CommandBuffer,
            resources.Generation,
            out imageUploadBytes,
            out imageUploadBarriers)
          RecordDiagnosticBarrierCount(imageUploadBarriers)
          if imageUploadBytes > 0uL {
            RecordDiagnosticEvent(
              VulkanDiagnosticEventIds.ResourceUpload,
              VulkanDiagnosticCategories.Image,
              0uL,
              0,
              uint64(imageUploadBytes),
              resources.Generation)
          }
          uploadBytes = uploadBytes + uint64(imageUploadBytes)
        }
      }
      if let resources = pathScene {
        resources.PrepareUpload()
        if let slot = activeFrameSlot {
          let stats = resources.Resources.Atlas.Stats
          if stats.UploadPending && !stats.UploadSubmitted {
            resources.RecordUpload(slot.CommandBuffer)
            let recorded = resources.Resources.Atlas.Stats
            if recorded.UploadRecorded
              && recorded.UploadCommandBuffer == slot.CommandBuffer{
                uploadBytes = uploadBytes + uint64(recorded.UploadByteCount)
                RecordDiagnosticBarrierCount(1)
              }
          }
        }
      }
      if let resources = textScene {
        resources.PrepareUpload()
        if let slot = activeFrameSlot, let atlas = textAtlas {
          let timestampStarted = BeginDiagnosticTimestamp(
            slot, VulkanDiagnosticTimestampStage.Upload)
          var recordedBytes VkDeviceSize = 0uL
          var recordedBarriers int32 = 0
          atlas.RecordUploads(slot.CommandBuffer, out recordedBytes, out recordedBarriers)
          RecordDiagnosticBarrierCount(recordedBarriers)
          if timestampStarted {
            EndDiagnosticTimestamp(slot, VulkanDiagnosticTimestampStage.Upload)
          }
          uploadBytes = uploadBytes + uint64(recordedBytes)
        }
      }
      RecordDiagnosticUpload(uploadStart, uploadBytes)
      if let current = generation {
        if let slot = activeFrameSlot {
          let recordStart = DiagnosticTimestamp()
          if let resources = pathScene {
            renderer.SetPathAtlas(resources.Resources.Atlas)
          }
          renderer.ReserveImageReferences(sceneCompiler.Frame)
          clipMaskFrameStarted = true
          let clipFrameStats = renderer.PrepareClipMasks(
            sceneCompiler.Frame,
            current.Extent,
            int32(activeFrameSlotIndex),
            completedGraphicsSubmissionSerial)
          clipMaskFrameStats = clipFrameStats
          clipMaskFrameTotals = renderer.ClipMaskFrameTotals
          clipMaskFramePrepared = true
          clipMaskRedrawPending = clipFrameStats.DirtyRegionCount > 0
          renderer.SetPrimitiveFrameSlot(int32(activeFrameSlotIndex))
          renderer.PreparePrimitiveFrame(
            sceneCompiler.Frame,
            current.Extent,
            scaleX,
            scaleY,
            completedGraphicsSubmissionSerial)
          renderer.RecordPrimitiveFrameUpload(slot.CommandBuffer)
          renderer.RecordClipMaskPass(slot.CommandBuffer, current.Extent)
          BeginRendering(current, slot, activeImageIndex, activeDamageRegion)
          renderer.ConfigureLayerFrame(
            slot.CommandBuffer,
            current.Image(activeImageIndex),
            current.ImageView(activeImageIndex),
            current.Extent,
            completedGraphicsSubmissionSerial)
          renderer.ConfigureTimestampRecording(
            timestampState,
            int32(activeFrameSlotIndex),
            DiagnosticTimestampRecordingContext(slot))
          let recordResult = renderer.RecordInsideRendering(
            slot.CommandBuffer,
            sceneCompiler.Frame,
            current.Extent,
            activeDamageRegion,
            activePartialRedraw)
          renderer.ClearTimestampRecording()
          RecordDiagnosticRecord(recordStart, sceneCompiler.Frame, recordResult)
          frameRendered = true
        }
      }
    } catch (error Exception) {
      CaptureDiagnosticFatal(-1, VulkanDiagnosticEventIds.CommandRecord)
      if let renderer = primitiveRenderer {
        try { renderer.ClearTimestampRecording() } catch (cleanup Exception) { }
        try { renderer.ReleaseImageReferences(sceneCompiler.Frame) } catch (cleanup Exception) { }
      }
      try { AbortUnsubmittedTextUpload() } catch (cleanup Exception) { }
      try { AbortUnsubmittedImageUploads() } catch (cleanup Exception) { }
      try { AbortUnsubmittedPathUpload() } catch (cleanup Exception) { }
      try { AbortUnsubmittedClipMask() } catch (cleanup Exception) { }
      layerPool?.Abort()
      if !recoveryPending {
        try { AbandonRecordedFrameForRetry() } catch (cleanup Exception) { frameFailed = true }
      }
      CaptureDiagnosticResources()
      CloseDiagnosticFrame(false)
      CaptureDiagnosticValidationBoundary()
      presentationRetirement.CancelPendingPresentationLatency()
      ClearActiveFrame()
      throw error
    }
  }

  public func Present() {
    if disposed || !frameBegun || queueStage != QueueStageIdle {
      return
    }
    guard let current = generation, let slot = activeFrameSlot, let mailbox = queueMailbox,
    let activeRuntime = runtime else {
      return
    }
    if activeRuntime.DeviceLost || activeRuntime.Terminal {
      return
    }
    try {
      if !renderingBegun {
        if activeDamageRegion.IsEmpty {
          activeDamageRegion = VulkanDamageRegion{
            X: 0,
            Y: 0,
            Width: int32(current.Extent.width),
            Height: int32(current.Extent.height),
          }
        }
        BeginRendering(current, slot, activeImageIndex, activeDamageRegion)
      }
      let endStart = DiagnosticTimestamp()
      EndRendering(current, slot)
      let endCommandBuffer = dispatch.vkEndCommandBuffer
      let endResult = endCommandBuffer(slot.CommandBuffer)
      RecordDiagnosticResult(VulkanDiagnosticEventIds.CommandRecord, endResult)
      RecordDiagnosticTiming(VulkanDiagnosticEventIds.CommandRecord,
        VulkanDiagnosticCategories.Timing, endStart)
      if endResult != VkConstants.VK_SUCCESS {
        HandleFrameFailure(endResult, VulkanDiagnosticEventIds.CommandRecord)
        return
      }
      if let atlas = textAtlas {
        let flushResult = atlas.FlushBeforeSubmit()
        RecordDiagnosticResult(VulkanDiagnosticEventIds.UploadStage, flushResult)
        if flushResult != VkConstants.VK_SUCCESS {
          HandleFrameFailure(flushResult, VulkanDiagnosticEventIds.UploadStage)
          return
        }
      }
      if let resources = imageResources {
        let flushResult = resources.FlushBeforeSubmit()
        RecordDiagnosticResult(VulkanDiagnosticEventIds.UploadStage, flushResult)
        if flushResult != VkConstants.VK_SUCCESS {
          HandleFrameFailure(flushResult, VulkanDiagnosticEventIds.UploadStage)
          return
        }
      }
      if let resources = pathScene {
        let stats = resources.Resources.Atlas.Stats
        if stats.UploadPending && stats.UploadRecorded && !stats.UploadSubmitted
          && stats.UploadCommandBuffer == slot.CommandBuffer{
            let flushResult = resources.FlushBeforeSubmit()
            RecordDiagnosticResult(VulkanDiagnosticEventIds.UploadStage, flushResult)
            if flushResult != VkConstants.VK_SUCCESS {
              HandleFrameFailure(flushResult, VulkanDiagnosticEventIds.UploadStage)
              return
            }
          }
      }
      if let renderer = primitiveRenderer {
        let flushResult = renderer.FlushPrimitiveFrameBeforeSubmit()
        RecordDiagnosticResult(VulkanDiagnosticEventIds.UploadStage, flushResult)
        if flushResult != VkConstants.VK_SUCCESS {
          HandleFrameFailure(flushResult, VulkanDiagnosticEventIds.UploadStage)
          return
        }
      }
      pendingSubmitStart = DiagnosticTimestamp()
      let prepareSubmit = slot.PrepareSubmit()
      RecordDiagnosticResult(VulkanDiagnosticEventIds.Submit, prepareSubmit)
      if prepareSubmit != VkConstants.VK_SUCCESS {
        HandleFrameFailure(prepareSubmit, VulkanDiagnosticEventIds.Submit)
        return
      }
      mailbox.PrepareSubmit(slot.CommandBuffer, slot.AcquireSemaphore,
        current.RenderSemaphore(activeImageIndex))
      if !mailbox.BeginSubmit() {
        throw InvalidOperationException("Vulkan queue mailbox rejected graphics submission")
      }
      if !activeRuntime.EnqueueGraphicsSubmission(mailbox, validateGraphicsSubmission) {
        queueStage = QueueStageSubmitRetry
        host.Wake()
        return
      }
      queueStage = QueueStageSubmit
    } catch (error Exception) {
      try { AbortUnsubmittedTextUpload() } catch (cleanup Exception) { }
      try { AbortUnsubmittedImageUploads() } catch (cleanup Exception) { }
      try { AbortUnsubmittedPathUpload() } catch (cleanup Exception) { }
      try { AbortUnsubmittedClipMask() } catch (cleanup Exception) { }
      layerPool?.Abort()
      try { AbandonRecordedFrameForRetry() } catch (cleanup Exception) { }
      CloseDiagnosticFrame(false)
      presentationRetirement.CancelPendingPresentationLatency()
      ClearActiveFrame()
      throw error
    }
  }

  private func ValidateGraphicsSubmission(serial uint64) {
    guard let slot = activeFrameSlot else {
      throw InvalidOperationException("Vulkan active frame slot is unavailable")
    }
    if let resources = imageResources {
      resources.ValidateUploadSubmission(slot.CommandBuffer, serial, resources.Generation)
    }
    if clipMaskFramePrepared {
      guard let renderer = primitiveRenderer else {
        throw InvalidOperationException("Vulkan clip renderer is unavailable after preparation")
      }
      renderer.ValidateClipFrameSubmission(int32(activeFrameSlotIndex), serial)
    }
    pendingGlobalSubmissionSerial = serial
  }

  private func RetryQueueSubmit() bool {
    guard let mailbox = queueMailbox, let activeRuntime = runtime else {
      return false
    }
    if activeRuntime.DeviceLost {
      if !VulkanDeviceRecoveryCoordinator.Recover(VkConstants.VK_ERROR_DEVICE_LOST) {
        frameFailed = true
        throw InvalidOperationException("Vulkan device recovery failed")
      }
      return false
    }
    if activeRuntime.Terminal {
      queueStage = QueueStageIdle
      frameFailed = true
      presentationRetirement.CancelPendingPresentationLatency()
      CloseDiagnosticFrame(false)
      ClearActiveFrame()
      return false
    }
    try {
      if !activeRuntime.EnqueueGraphicsSubmission(mailbox, validateGraphicsSubmission) {
        host.Wake()
        return false
      }
    } catch (error Exception) {
      queueStage = QueueStageIdle
      try { AbortUnsubmittedTextUpload() } catch (cleanup Exception) { }
      try { AbortUnsubmittedImageUploads() } catch (cleanup Exception) { }
      try { AbortUnsubmittedPathUpload() } catch (cleanup Exception) { }
      try { AbortUnsubmittedClipMask() } catch (cleanup Exception) { }
      layerPool?.Abort()
      try { AbandonRecordedFrameForRetry() } catch (cleanup Exception) { frameFailed = true }
      CloseDiagnosticFrame(false)
      presentationRetirement.CancelPendingPresentationLatency()
      ClearActiveFrame()
      throw error
    }
    queueStage = QueueStageSubmit
    return true
  }

  public func PollQueueCompletion() bool {
    if queueStage == QueueStageSubmitRetry {
      if !RetryQueueSubmit() {
        return false
      }
    }
    guard let mailbox = queueMailbox else {
      return false
    }
    if queueStage == QueueStageSubmit {
      var submitResult VkResult = VkConstants.VK_NOT_READY
      if !mailbox.TakeSubmitCompletion(out submitResult) {
        return false
      }
      if submitResult != VkConstants.VK_SUCCESS {
        mailbox.ResetSubmitCompletion()
        if mailbox.SyntheticDrainPerformed {
          RecordDiagnosticResult(
            VulkanDiagnosticEventIds.PresentWait,
            mailbox.SyntheticDrainResult)
        }
        let marked = activeFrameSlot?.MarkSubmitted(submitResult, pendingGlobalSubmissionSerial)
        RecordDiagnosticResult(VulkanDiagnosticEventIds.Submit, marked ?? submitResult)
        runtime?.MarkDeviceLost()
        queueStage = QueueStageIdle
        try {
          HandleFrameFailure(VkConstants.VK_ERROR_DEVICE_LOST,
            VulkanDiagnosticEventIds.Submit)
        } finally {
          FinishFailedFrame()
        }
        return false
      }
      CompleteQueueSubmit()
      return false
    }
    if queueStage == QueueStagePresentPrepare {
      TryQueuePresent()
      return false
    }
    if queueStage == QueueStagePresent {
      var presentResult VkResult = VkConstants.VK_NOT_READY
      if !mailbox.TakePresentCompletion(out presentResult) {
        return false
      }
      let completed = CompleteQueuePresent(presentResult)
      return completed
    }
    return false
  }

  private func CompleteQueueSubmit() {
    guard let mailbox = queueMailbox else {
      queueStage = QueueStageIdle
      ClearActiveFrame()
      presentationRetirement.CancelPendingPresentationLatency()
      return
    }
    guard let current = generation, let slot = activeFrameSlot,
    let activeRuntime = runtime else {
      mailbox.ResetSubmitCompletion()
      queueStage = QueueStageIdle
      frameFailed = true
      ClearActiveFrame()
      presentationRetirement.CancelPendingPresentationLatency()
      return
    }
    let markedSubmit = slot.MarkSubmitted(VkConstants.VK_SUCCESS, pendingGlobalSubmissionSerial)
    if markedSubmit != VkConstants.VK_SUCCESS {
      mailbox.ResetSubmitCompletion()
      queueStage = QueueStageIdle
      try {
        HandleFrameFailure(markedSubmit, VulkanDiagnosticEventIds.Submit)
      } finally {
        FinishFailedFrame()
      }
      return
    }
    lastFrameSubmitted = true
    try {
      layerPool?.MarkSubmitted(pendingGlobalSubmissionSerial)
      if clipMaskFramePrepared {
        if let renderer = primitiveRenderer {
          renderer.MarkClipFrameSubmitted(int32(activeFrameSlotIndex), pendingGlobalSubmissionSerial)
          renderer.MarkPrimitiveFrameSubmitted(pendingGlobalSubmissionSerial)
          clipMaskFrameStats = renderer.ClipMaskFrameStats
          clipMaskFrameTotals = renderer.ClipMaskFrameTotals
        }
      }
      if let resources = imageResources {
        resources.MarkSubmitted(slot.CommandBuffer, pendingGlobalSubmissionSerial, resources.Generation)
        var imageIndex int32 = 0
        while imageIndex < sceneCompiler.Frame.CachedImageCount {
          let image = sceneCompiler.Frame.CachedImages[imageIndex]
          if image.ImageId.IsValid {
            resources.MarkUsed(image.ImageId, resources.Generation, pendingGlobalSubmissionSerial)
          }
          imageIndex = imageIndex + 1
        }
      }
      SubmitDiagnosticTimestamp(slot)
      RecordDiagnosticSubmit(pendingSubmitStart)
      if let atlas = textAtlas {
        atlas.MarkSubmitted(slot.CommandBuffer, pendingGlobalSubmissionSerial)
        var segmentIndex int32 = 0
        while segmentIndex < sceneCompiler.Frame.CachedTextSegmentCount {
          let reference = sceneCompiler.Frame.CachedTextSegments[segmentIndex]
          guard let segment = reference.Segment else {
            throw InvalidOperationException("cached text segment is unavailable at submit")
          }
          var runIndex int32 = 0
          while runIndex < segment.RunCount {
            atlas.MarkUsed(segment.Runs[runIndex].AtlasId,
              pendingGlobalSubmissionSerial)
            runIndex = runIndex + 1
          }
          segmentIndex = segmentIndex + 1
        }
      }
      if let resources = pathScene {
        resources.MarkSubmitted(slot.CommandBuffer, pendingGlobalSubmissionSerial)
      }
      if activeImageLayout == VkConstants.VK_IMAGE_LAYOUT_PRESENT_SRC_KHR {
        presentationRetirement.TryBindPriorSameImageToCompletion(current.Generation,
          activeImageIndex, activeFrameSlotIndex, slot.SubmissionSerial)
      }
      pendingPresentStart = DiagnosticTimestamp()
      queueStage = QueueStagePresentPrepare
    } catch (error Exception) {
      frameFailed = true
      presentationRetirement.CancelPendingPresentationLatency()
      recreatePending = true
      forceFullRedraw = true
      CaptureDiagnosticFatal(-1, VulkanDiagnosticEventIds.Submit)
      try { mailbox.ResetSubmitCompletion() } catch (cleanup Exception) { }
      queueStage = QueueStageIdle
      try { CaptureDiagnosticResources() } catch (cleanup Exception) { }
      try { CaptureDiagnosticValidationBoundary() } catch (cleanup Exception) { }
      try { CloseDiagnosticFrame(false) } catch (cleanup Exception) { }
      ClearActiveFrame()
      throw error
    }
    TryQueuePresent()
  }

  private func TryQueuePresent() {
    guard let current = generation, let mailbox = queueMailbox,
    let activeRuntime = runtime else {
      queueStage = QueueStageIdle
      ClearActiveFrame()
      presentationRetirement.CancelPendingPresentationLatency()
      return
    }
    if activeRuntime.DeviceLost || activeRuntime.Terminal {
      mailbox.ResetSubmitCompletion()
      queueStage = QueueStageIdle
      try {
        HandleFrameFailure(VkConstants.VK_ERROR_DEVICE_LOST,
          VulkanDiagnosticEventIds.PresentWait)
      } finally {
        FinishFailedFrame()
      }
      return
    }
    if activeRuntime.QueueWorker.HasOutstandingWork {
      host.Wake()
      return
    }
    var completedPresentId uint64 = 0uL
    try {
      let prepareResult = current.TryPreparePresent(activeImageIndex,
        out pendingPresentFence, out completedPresentId)
      RecordDiagnosticResult(VulkanDiagnosticEventIds.PresentWait, prepareResult)
      if prepareResult == VkConstants.VK_NOT_READY || prepareResult == VkConstants.VK_TIMEOUT {
        host.Wake()
        return
      }
      if prepareResult != VkConstants.VK_SUCCESS {
        mailbox.ResetSubmitCompletion()
        queueStage = QueueStageIdle
        try {
          HandleFrameFailure(prepareResult, VulkanDiagnosticEventIds.PresentWait)
        } finally {
          FinishFailedFrame()
        }
        return
      }
      if completedPresentId != 0uL {
        presentationRetirement.CompletePresent(completedPresentId)
      }
      mailbox.PreparePresent(current.Handle, activeImageIndex,
        current.RenderSemaphore(activeImageIndex), pendingPresentFence, current.PresentFenceEnabled)
    } catch (error Exception) {
      frameFailed = true
      recreatePending = true
      forceFullRedraw = true
      CaptureDiagnosticFatal(-1, VulkanDiagnosticEventIds.PresentWait)
      try { current.ReconcilePreparedPresent(activeImageIndex, false) } catch (cleanup Exception) { }
      try { mailbox.ResetSubmitCompletion() } catch (cleanup Exception) { }
      queueStage = QueueStageIdle
      try { CaptureDiagnosticResources() } catch (cleanup Exception) { }
      try { CaptureDiagnosticValidationBoundary() } catch (cleanup Exception) { }
      try { CloseDiagnosticFrame(false) } catch (cleanup Exception) { }
      presentationRetirement.CancelPendingPresentationLatency()
      ClearActiveFrame()
      throw error
    }
    if !mailbox.BeginPresent() {
      mailbox.ResetSubmitCompletion()
      queueStage = QueueStageIdle
      frameFailed = true
      try {
        try { current.ReconcilePreparedPresent(activeImageIndex, false) } catch (cleanup Exception) { }
        HandleFrameFailure(VkConstants.VK_ERROR_UNKNOWN,
          VulkanDiagnosticEventIds.SwapchainPresent)
      } finally {
        FinishFailedFrame()
      }
      return
    }
    if !activeRuntime.QueueWorker.EnqueuePresent(mailbox) {
      mailbox.RetryPresent()
      try { current.ReconcilePreparedPresent(activeImageIndex, false) } catch (cleanup Exception) { }
      pendingPresentFence = 0uL
      host.Wake()
      return
    }
    queueStage = QueueStagePresent
  }

  private func CompleteQueuePresent(presentResult VkResult) bool {
    var completed = false
    guard let current = generation else {
      queueStage = QueueStageIdle
      ClearActiveFrame()
      presentationRetirement.CancelPendingPresentationLatency()
      return false
    }
    try {
      RecordDiagnosticResult(VulkanDiagnosticEventIds.SwapchainPresent, presentResult)
      RecordDiagnosticPresent(pendingPresentStart)
      if presentResult == VkConstants.VK_ERROR_SURFACE_LOST_KHR {
        current.MarkPresented(activeImageIndex, presentResult, 0uL)
        surfaceLost = true
        recreatePending = true
      } else {
        var presentId uint64 = 0uL
        if presentResult == VkConstants.VK_SUCCESS || presentResult == VkConstants.VK_SUBOPTIMAL_KHR {
          presentId = presentationRetirement.RecordPresent(current.Generation, activeImageIndex)
        }
        let markedPresent = current.MarkPresented(activeImageIndex, presentResult, presentId)
        if markedPresent != VkConstants.VK_SUCCESS && markedPresent != VkConstants.VK_SUBOPTIMAL_KHR
          && markedPresent != VkConstants.VK_ERROR_OUT_OF_DATE_KHR{
            HandleFrameFailure(markedPresent, VulkanDiagnosticEventIds.SwapchainPresent)
          }
        completed = (presentResult == VkConstants.VK_SUCCESS
            || presentResult == VkConstants.VK_SUBOPTIMAL_KHR)
          && (markedPresent == VkConstants.VK_SUCCESS
              || markedPresent == VkConstants.VK_SUBOPTIMAL_KHR)
        if completed && presentId != 0uL {
          let handoffTimestamp = Stopwatch.GetTimestamp()
          presentationRetirement.AttachPendingPresentationLatency(
            presentId, handoffTimestamp, current.PresentFenceEnabled)
        }
        if presentId != 0uL {
          presentationRetirement.AnchorRetiredGenerations(current.Generation)
        }
        if (presentResult == VkConstants.VK_SUCCESS || presentResult == VkConstants.VK_SUBOPTIMAL_KHR)
          && (markedPresent == VkConstants.VK_SUCCESS || markedPresent == VkConstants.VK_SUBOPTIMAL_KHR)
          && activeSceneVersion != 0uL {
            current.SetPendingSceneVersion(activeImageIndex, activeSceneVersion)
            PublishLastPresentedImageState(activeImageIndex, activeAppliedSceneVersion,
              activeSceneVersion, activeImagePromoted)
          }
        if presentResult == VkConstants.VK_ERROR_OUT_OF_DATE_KHR || presentResult == VkConstants.VK_SUBOPTIMAL_KHR {
          recreatePending = true
        } else if presentResult != VkConstants.VK_SUCCESS {
          HandleFrameFailure(presentResult, VulkanDiagnosticEventIds.SwapchainPresent)
        } else {
          current.CommitLayout(activeImageIndex, VkConstants.VK_IMAGE_LAYOUT_PRESENT_SRC_KHR)
        }
      }
      CaptureDiagnosticWsi()
      clipMaskFrameStarted = false
      clipMaskFramePrepared = false
      clipMaskRedrawPending = false
      if !recoveryPending && presentResult == VkConstants.VK_SUCCESS {
        forceFullRedraw = false
      }
    } catch (error Exception) {
      presentationRetirement.CancelPendingPresentationLatency()
      recreatePending = true
      forceFullRedraw = true
      throw error
    } finally {
      queueStage = QueueStageIdle
      CaptureDiagnosticResources()
      CaptureDiagnosticValidationBoundary()
      CloseDiagnosticFrame(completed)
      ClearActiveFrame()
    }
    return completed
  }

  private func FinishFailedFrame() {
    CaptureDiagnosticResources()
    CaptureDiagnosticValidationBoundary()
    CloseDiagnosticFrame(false)
    ClearActiveFrame()
  }

  public func Resize(width int32, height int32) bool {
    if disposed {
      return false
    }
    if let activeRuntime = runtime {
      if activeRuntime.DeviceLost || activeRuntime.Terminal {
        return false
      }
    }
    if width < 0 || height < 0 {
      return false
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

  private func ClearActiveFrame() {
    frameBegun = false
    renderingBegun = false
    frameRendered = false
    frameFailureRetryable = false
    clipMaskFrameStarted = false
    clipMaskFramePrepared = false
    activeFrameSlot = nil
    activeFrameSlotIndex = 0u
    activeImageIndex = 0u
    activeImageLayout = VkConstants.VK_IMAGE_LAYOUT_UNDEFINED
    activeFrameId = 0uL
    pendingGlobalSubmissionSerial = 0uL
    pendingSubmitStart = 0uL
    pendingPresentStart = 0uL
    pendingPresentFence = 0uL
    frameSlots.Advance()
  }

  private func PublishLastPresentedImageState(
    imageIndex uint32,
    appliedSceneVersion uint64,
    pendingSceneVersion uint64,
    promoted bool) {
      lastPresentedImageIndex = imageIndex
      lastPresentedAppliedSceneVersion = appliedSceneVersion
      lastPresentedPendingSceneVersion = pendingSceneVersion
      lastPresentedImagePromoted = promoted
      lastPresentedImageStateValid = true
    }

  private func InvalidateLastPresentedImageState() {
    lastPresentedImageStateValid = false
    lastPresentedImageIndex = 0u
    lastPresentedAppliedSceneVersion = 0uL
    lastPresentedPendingSceneVersion = 0uL
    lastPresentedImagePromoted = false
  }

  private func AbortUnsubmittedTextUpload() {
    if let atlas = textAtlas {
      if atlas.AbortUploads() {
        textScene?.RestoreUpload()
      }
    }
  }

  private func AbortUnsubmittedImageUploads() {
    guard let resources = imageResources, let slot = activeFrameSlot else {
      return
    }
    resources.AbortUploads(slot.CommandBuffer, resources.Generation)
    resources.AbortUnrecordedUploads(resources.Generation)
  }

  private func AbortUnsubmittedPathUpload() {
    guard let resources = pathScene else { return }
    let stats = resources.Resources.Atlas.Stats
    if !stats.UploadPending || stats.UploadSubmitted {
      return
    }
    if stats.UploadRecorded {
      guard let slot = activeFrameSlot else { return }
      if stats.UploadCommandBuffer != slot.CommandBuffer {
        return
      }
    }
    resources.AbortUpload()
  }

  private func AbortUnsubmittedClipMask() {
    if clipMaskFrameStarted {
      if let renderer = primitiveRenderer {
        try { renderer.Abort(int32(activeFrameSlotIndex)) } catch (cleanup Exception) { }
        clipMaskFrameStats = renderer.ClipMaskFrameStats
        clipMaskFrameTotals = renderer.ClipMaskFrameTotals
      }
      if let atlas = clipMaskAtlas {
        try { atlas.InvalidateRecordedLayouts() } catch (cleanup Exception) { }
      }
      clipMaskFrameStarted = false
      clipMaskFramePrepared = false
      clipMaskRedrawPending = true
    }
    if let atlas = clipMaskAtlas {
      if atlas.DirtyRegionCount > 0 {
        clipMaskRedrawPending = true
      }
    }
  }

  private func TryAbandonRecordedFrameForRetry() VkResult {
    guard let slot = activeFrameSlot else {
      return VkConstants.VK_ERROR_INITIALIZATION_FAILED
    }
    let abandonResult = slot.AbandonAcquiredForSwapchainRetirement()
    if abandonResult == VkConstants.VK_SUCCESS {
      recreatePending = true
      forceFullRedraw = true
      frameFailed = false
    }
    return abandonResult
  }

  private func AbandonRecordedFrameForRetry() {
    let abandonResult = TryAbandonRecordedFrameForRetry()
    RecordDiagnosticResult(VulkanDiagnosticEventIds.PresentWait, abandonResult)
    if abandonResult == VkConstants.VK_SUCCESS {
      return
    }
    if abandonResult != VkConstants.VK_ERROR_DEVICE_LOST {
      runtime?.MarkTeardownFailed(abandonResult)
    }
    HandleFrameFailure(abandonResult, VulkanDiagnosticEventIds.PresentWait)
    throw InvalidOperationException(
      "Vulkan acquired frame could not be retired: " + abandonResult.ToString())
  }

  private func HandleFrameFailure(result VkResult, eventId uint64) {
    if result == VkConstants.VK_ERROR_OUT_OF_DATE_KHR
      || result == VkConstants.VK_SUBOPTIMAL_KHR{
        frameFailureRetryable = true
        recreatePending = true
        return
      }
    if result == VkConstants.VK_ERROR_SURFACE_LOST_KHR {
      frameFailureRetryable = true
      surfaceLost = true
      recreatePending = true
      return
    }
    if result == VkConstants.VK_ERROR_DEVICE_LOST {
      presentationRetirement.ClearPresentationLatency()
      frameFailureRetryable = false
      runtime?.MarkDeviceLost()
      recoveryPending = true
      forceFullRedraw = true
      return
    }
    frameFailureRetryable = false
    presentationRetirement.ClearPresentationLatency()
    CaptureDiagnosticFatal(int32(result), eventId)
    throw InvalidOperationException("Vulkan frame operation failed: " + result.ToString())
  }

  private func ResolveScale(value float32) float32 {
    if Single.IsNaN(value) || Single.IsInfinity(value) || value <= 0.0F {
      return 1.0F
    }
    return value
  }
}
