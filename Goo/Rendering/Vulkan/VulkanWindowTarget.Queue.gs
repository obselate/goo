package Goo

import System
import System.Collections.Generic
import System.Diagnostics
import System.Numerics
import System.Threading

internal unsafe partial class VulkanWindowTarget {
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

  // Advances a completed graphics submission into presentation.
  public func ServicePendingSubmission() bool {
    if queueStage != QueueStageSubmit {
      return false
    }
    guard let mailbox = queueMailbox else {
      return false
    }
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
      return true
    }
    CompleteQueueSubmit()
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
      ServicePendingSubmission()
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
        if completed {
          RecordFirstSuccessfulPresent()
        }
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
      if startupFirstPresentTicks != 0uL {
        CaptureDiagnosticLiveMemory(VulkanDiagnosticEventIds.FirstSuccessfulPresent)
        startupFirstPresentTicks = 0uL
      }
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

}
