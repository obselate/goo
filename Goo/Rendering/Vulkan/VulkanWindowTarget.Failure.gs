package Goo

import System
import System.Collections.Generic
import System.Diagnostics
import System.Numerics
import System.Threading

internal unsafe partial class VulkanWindowTarget {
  private func ClearActiveFrame() {
    pathScene?.SetUsePending(false)
    frameBegun = false
    renderingBegun = false
    frameRendered = false
    frameRenderDeferred = false
    initialImageUploadFrame = false
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
    pendingPresentFence = VkFence.Null
    frameSlots.Advance()
  }

  private func CancelDeferredInitialFrame() {
    if !frameBegun || queueStage != QueueStageIdle || !frameRenderDeferred { return }
    AbortUnsubmittedTextUpload()
    try { AbortUnsubmittedImageUploads() } catch (cleanup Exception) { }
    AbortUnsubmittedPathUpload()
    if runtime?.Runtime.DeviceLost != true && runtime?.Runtime.Terminal != true { AbandonRecordedFrameForRetry() }
    CloseDiagnosticFrame(false)
    ClearActiveFrame()
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
    colorGlyphAtlas?.AbortUploads()
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
      clipMaskFrameStarted = false
      clipMaskFramePrepared = false
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
      runtime?.Runtime.MarkTeardownFailed(abandonResult)
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
      frameFailureRetryable = false
      runtime?.Runtime.MarkDeviceLost()
      recoveryPending = true
      forceFullRedraw = true
      return
    }
    frameFailureRetryable = false
    CaptureDiagnosticFatal(int32(result), eventId)
    throw InvalidOperationException("Vulkan frame operation failed: " + result.ToString())
  }

  private func ResolveScale(value float32) float32 -> if Single.IsNaN(value) || Single.IsInfinity(value) || value <= 0.0F { 1.0F } else { value }
}
