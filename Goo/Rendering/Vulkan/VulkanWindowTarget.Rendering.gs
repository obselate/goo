package Goo

import System
import System.Collections.Generic
import System.Diagnostics
import System.Numerics
import System.Threading

internal unsafe partial class VulkanWindowTarget {
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
    Render(root, nil, background, dpi, nil)
  }

  public func Render(root Node?, portalRoot Node?, background Color, dpi Vector2,
    overlay DiagnosticOverlay?) {
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
      let compileResult = sceneCompiler.Compile(root, portalRoot, background,
        logicalWidth, logicalHeight)
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
        || pathRedrawPending || clipMaskRedrawPending{
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

}
