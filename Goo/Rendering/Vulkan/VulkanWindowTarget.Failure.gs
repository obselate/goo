package Goo

import System
import System.Collections.Generic
import System.Diagnostics
import System.Numerics
import System.Threading

internal unsafe partial class VulkanWindowTarget {
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

  private func ResolveScale(value float32) float32 -> if Single.IsNaN(value) || Single.IsInfinity(value) || value <= 0.0F { 1.0F } else { value }
}
