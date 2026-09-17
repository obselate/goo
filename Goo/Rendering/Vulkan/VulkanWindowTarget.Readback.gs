package Goo

import System
import System.Diagnostics
import System.Numerics

internal unsafe partial class VulkanWindowTarget {
  private const ReadbackBudgetBytes VkDeviceSize = 67108864uL
  private var readbackDispatch VulkanReadbackDispatch? = nil
  private var readbackRequest VulkanAsyncReadback? = nil
  private var readbackRequestCount uint64
  private var readbackCompletionCount uint64
  private var readbackAbandonCount uint64
  private var readbackBudgetExceededCount uint64
  private var readbackTiming VulkanReadbackTimingSnapshot
  private var readbackObjectAllocationBaseline uint64
  private var readbackPrerequisiteFrame SceneFrame? = nil
  private var readbackPrerequisiteGeneration uint64 = 0uL
  private var readbackPrerequisiteSceneVersion uint64 = 0uL
  private var readbackPrerequisiteTextScaleX float32 = 1.0F
  private var readbackPrerequisiteTextScaleY float32 = 1.0F

  internal prop ReadbackSubmissionReadyForReconcile bool{
    get -> readbackRequest?.SubmissionReadyForReconcile == true
  }

  private func DeferForPendingReadbackSubmission() bool {
    guard let request = readbackRequest else {
      return false
    }
    if !request.SubmissionPendingReconcile {
      return false
    }
    PollReadback()
    if readbackRequest?.SubmissionPendingReconcile != true {
      return false
    }
    frameFailureRetryable = true
    host.Wake()
    return true
  }

  internal prop ReadbackResidentResourceBytes VkDeviceSize{
    get {
      if let request = readbackRequest {
        return request.TargetResourceByteSize
      }
      return 0uL
    }
  }

  internal prop ReadbackRequestCount uint64{ get -> readbackRequestCount }
  internal prop ReadbackCompletionCount uint64{ get -> readbackCompletionCount }
  internal prop ReadbackTiming VulkanReadbackTimingSnapshot{ get -> readbackTiming }

  internal func RequestReadback(root Node?, background Color, dpi Vector2,
    requestedRegion VulkanReadbackRegion) WindowReadbackRequestStatus{
      PollQueueCompletion()
      let hasPrerequisite = readbackPrerequisiteFrame != nil
      if !hasPrerequisite {
        readbackTiming = VulkanReadbackTimingSnapshot{
          RequestStartTicks: Stopwatch.GetTimestamp(),
          RequestedByteSize: 0uL,
          ResidentResourceBytes: 0uL,
        }
        readbackObjectAllocationBaseline = 0uL
        if let accounting = objectAccounting {
          readbackObjectAllocationBaseline = accounting.AllocationCount
        }
      }
      if disposed || frameFailed {
        ClearReadbackPrerequisite()
        return WindowReadbackRequestStatus.NotReady
      }
      if let existing = readbackRequest {
        if existing.State == VulkanReadbackState.Pending
          || existing.State == VulkanReadbackState.Complete{
            return WindowReadbackRequestStatus.Busy
          }
        if existing.State != VulkanReadbackState.Idle {
          if !ClearReadbackStorage() {
            return WindowReadbackRequestStatus.Busy
          }
        }
      }
      if frameBegun {
        return WindowReadbackRequestStatus.Busy
      }
      var captureFrame SceneFrame? = nil
      var replayTextScaleX = ResolveScale(dpi.X)
      var replayTextScaleY = ResolveScale(dpi.Y)
      if let prerequisite = readbackPrerequisiteFrame {
        if queueStage != QueueStageIdle {
          return WindowReadbackRequestStatus.NotReady
        }
        guard let prerequisiteGeneration = generation else {
          ClearReadbackPrerequisite()
          return WindowReadbackRequestStatus.NotReady
        }
        if prerequisiteGeneration.Generation != readbackPrerequisiteGeneration
          || !Object.ReferenceEquals(sceneCompiler.Frame, prerequisite)
          || sceneCompiler.LastResult.FrameVersion != readbackPrerequisiteSceneVersion{
            ClearReadbackPrerequisite()
          } else {
            captureFrame = prerequisite
            replayTextScaleX = readbackPrerequisiteTextScaleX
            replayTextScaleY = readbackPrerequisiteTextScaleY
          }
      }
      if captureFrame == nil && queueStage != QueueStageIdle {
        return WindowReadbackRequestStatus.Busy
      }
      guard let activeRuntime = runtime else {
        return WindowReadbackRequestStatus.NotReady
      }
      if activeRuntime.DeviceLost || activeRuntime.Terminal {
        return WindowReadbackRequestStatus.DeviceLost
      }
      guard let currentGeneration = generation else {
        return WindowReadbackRequestStatus.NotReady
      }
      let extent = currentGeneration.Extent
      var readbackPlan VulkanReadbackPlan
      try {
        readbackPlan = VulkanReadbackPlan.Create(requestedRegion, extent)
      } catch (error Exception) {
        return WindowReadbackRequestStatus.Failed
      }
      let requestedByteSize = readbackPlan.ByteSize
      readbackTiming.RequestedByteSize = requestedByteSize
      if readbackPlan.ResourceByteSize > ReadbackBudgetBytes {
        readbackBudgetExceededCount = readbackBudgetExceededCount + 1uL
        return WindowReadbackRequestStatus.BudgetExceeded
      }
      if !ReadbackFormatSupported(VkConstants.VK_FORMAT_R8G8B8A8_SRGB) {
        return WindowReadbackRequestStatus.Failed
      }

      var request VulkanAsyncReadback? = nil
      var reusedRequest = false
      var leaseOwned = false
      var ownedLease VulkanSharedLease? = nil
      var ownedTarget VulkanOffscreenTarget? = nil
      var ownedRequest VulkanAsyncReadback? = nil
      try {
        if captureFrame == nil {
          BeginFrame()
          if !frameBegun {
            return WindowReadbackRequestStatus.NotReady
          }
          Render(root, background, dpi)
          if !frameRendered {
            return if frameRenderDeferred {
              WindowReadbackRequestStatus.NotReady
            } else {
              WindowReadbackRequestStatus.Failed
            }
          }
          readbackTiming.RecordTicks = Stopwatch.GetTimestamp()
          Present()
          if let currentRuntime = runtime {
            if currentRuntime.DeviceLost {
              return WindowReadbackRequestStatus.DeviceLost
            }
          }
          if frameFailed {
            return WindowReadbackRequestStatus.Failed
          }
          let prerequisite = sceneCompiler.Frame
          guard let currentGeneration = generation else {
            return WindowReadbackRequestStatus.NotReady
          }
          readbackPrerequisiteFrame = prerequisite
          readbackPrerequisiteGeneration = currentGeneration.Generation
          readbackPrerequisiteSceneVersion = activeSceneVersion
          readbackPrerequisiteTextScaleX = ResolveScale(dpi.X)
          readbackPrerequisiteTextScaleY = ResolveScale(dpi.Y)
          return WindowReadbackRequestStatus.NotReady
        }
        let replayFrame = captureFrame
        request = TryReuseReadback(extent, requestedByteSize)
        reusedRequest = request != nil
        if request == nil && readbackRequest != nil {
          return WindowReadbackRequestStatus.Busy
        }
        if request == nil {
          guard let readbackLease = VulkanSharedRuntime.TryAcquire() else {
            return WindowReadbackRequestStatus.NotReady
          }
          leaseOwned = true
          ownedLease = readbackLease
          let copyDispatch = EnsureReadbackDispatch()
          guard let currentAllocator = memoryAllocator,
          let currentImages = imageResources,
          let currentPaths = pathResources,
          let currentClipAtlas = clipMaskAtlas else {
            readbackLease.Release()
            leaseOwned = false
            ownedLease = nil
            return WindowReadbackRequestStatus.NotReady
          }
          let target = VulkanOffscreenTarget(
            device,
            dispatch,
            queue,
            currentAllocator,
            copyDispatch,
            extent,
            requestedByteSize,
            activeRuntime.GraphicsFamilyIndex,
            VkConstants.VK_FORMAT_R8G8B8A8_SRGB,
            currentImages,
            activeRuntime.Generation,
            activeRuntime.MaxStorageBufferRange,
            activeRuntime.ResourcePolicy,
            activeRuntime.PrimitiveState,
            currentPaths.Atlas,
            currentPaths,
            currentClipAtlas,
            textAtlas,
            objectAccounting,
            diagnostics,
            timestampState,
            activeRuntime.QueueWorker.CreateMailbox(nil),
            readbackLease)
          if let accounting = objectAccounting {
            let currentAllocations = accounting.AllocationCount
            let baseline = readbackObjectAllocationBaseline
            if currentAllocations >= baseline {
              readbackTiming.ObjectCreateDelta = currentAllocations - baseline
            }
          }
          ownedTarget = target
          leaseOwned = false
          ownedLease = nil
          ownedTarget = nil
          let createdRequest = VulkanReadbackFactory.Create(target, readbackLease,
            activeRuntime.Generation)
          ownedRequest = createdRequest
          readbackRequest = createdRequest
          ownedRequest = nil
          ownedTarget = nil
          request = createdRequest
        }
        let activeRequest = request
        let clearColor = VkClearColorValue{}
        let submitResult = activeRequest.Request(replayFrame, clearColor,
          requestedRegion, replayTextScaleX, replayTextScaleY)
        readbackTiming.SubmitTicks = Stopwatch.GetTimestamp()
        if submitResult == VkConstants.VK_ERROR_DEVICE_LOST {
          try { activeRequest.AbandonAfterDeviceLoss() } catch (cleanup Exception) { }
          readbackAbandonCount = readbackAbandonCount + 1uL
          ClearReadbackStorage()
          return WindowReadbackRequestStatus.DeviceLost
        }
        if submitResult != VkConstants.VK_SUCCESS {
          ClearReadbackStorage()
          return WindowReadbackRequestStatus.Failed
        }
        readbackRequest = activeRequest
        readbackTiming.ResidentResourceBytes = activeRequest.TargetResourceByteSize
        ownedRequest = nil
        ownedTarget = nil
        ClearReadbackPrerequisite()
        readbackRequestCount = readbackRequestCount + 1uL
        return WindowReadbackRequestStatus.Accepted
      } catch (error Exception) {
        ClearReadbackPrerequisite()
        var installedHandled = false
        if let activeRequest = request {
          if Object.ReferenceEquals(readbackRequest, activeRequest)
            && (!reusedRequest || activeRequest.TargetPending
                || activeRequest.DeviceLossDetected) {
                  if activeRequest.DeviceLossDetected {
                    AbandonReadbackAfterDeviceLoss()
                  } else if !ClearReadbackStorage()
                    && activeRequest.DeviceLossDetected{
                      AbandonReadbackAfterDeviceLoss()
                    }
                  installedHandled = true
                }
        }
        if !installedHandled {
          if reusedRequest {
            ReleaseReusableReadback(request)
          } else if let activeRequest = ownedRequest {
            try { activeRequest.Dispose() } catch (cleanup Exception) { }
          } else if let activeTarget = ownedTarget {
            try { activeTarget.Dispose() } catch (cleanup Exception) { }
          }
        }
        if leaseOwned {
          if let activeLease = ownedLease {
            try { activeLease.Release() } catch (cleanup Exception) { }
          }
        }
        return WindowReadbackRequestStatus.Failed
      }
    }

  internal func RequestReadback(root Node?, background Color, dpi Vector2)
  WindowReadbackRequestStatus{
    guard let currentGeneration = generation else {
      return WindowReadbackRequestStatus.NotReady
    }
    return RequestReadback(root, background, dpi,
      VulkanReadbackPlan.Full(currentGeneration.Extent).Region)
  }

  public func RequestCapture(root Node?, background Color, dpi Vector2)
  WindowReadbackRequestStatus -> RequestReadback(root, background, dpi)

  public func PollCapture() WindowReadbackPollStatus {
    let result = PollReadback()
    if result == VkConstants.VK_SUCCESS {
      return WindowReadbackPollStatus.Complete
    }
    return if result == VkConstants.VK_NOT_READY { WindowReadbackPollStatus.NotReady } else { WindowReadbackPollStatus.Failed }
  }

  public func TakeCaptureResult() WindowReadbackResult ? -> TakeReadbackResult()

  internal func PollReadback() VkResult {
    guard let request = readbackRequest else {
      return VkConstants.VK_NOT_READY
    }
    let wasPending = request.State == VulkanReadbackState.Pending
    let result = request.PollCompletion()
    if result == VkConstants.VK_ERROR_DEVICE_LOST {
      readbackAbandonCount = readbackAbandonCount + 1uL
      ClearReadbackStorage()
    } else if wasPending && result == VkConstants.VK_SUCCESS
      && request.State == VulkanReadbackState.Complete{
        readbackCompletionCount = readbackCompletionCount + 1uL
        readbackTiming.ReadyTicks = Stopwatch.GetTimestamp()
        readbackTiming.CpuCopyStartTicks = request.CpuCopyStartTicks
        readbackTiming.CpuCopyEndTicks = request.CpuCopyEndTicks
        readbackTiming.GpuTimingAvailable = request.GpuTimingAvailable
        readbackTiming.GpuSceneReplayNanoseconds = request.GpuSceneReplayNanoseconds
        readbackTiming.GpuCopyNanoseconds = request.GpuCopyNanoseconds
      }
    return result
  }

  internal func TakeReadbackResult() VulkanReadbackResult? {
    guard let request = readbackRequest else {
      return nil
    }
    if request.State != VulkanReadbackState.Complete {
      return nil
    }
    let result = request.Result
    try { request.Reset() } catch (error Exception) {
      return nil
    }
    return result
  }

  private func TryReuseReadback(extent VkExtent2D,
    requestedByteSize VkDeviceSize) VulkanAsyncReadback? {
      guard let request = readbackRequest else {
        return nil
      }
      if request.State != VulkanReadbackState.Idle {
        return nil
      }
      if request.Extent.width != extent.width || request.Extent.height != extent.height
        || requestedByteSize > request.StagingByteSize{
          let liveBefore = CurrentObjectLiveCount()
          try { request.Dispose() } catch (cleanup Exception) {
            return nil
          }
          RecordObjectDestroyDelta(liveBefore)
          readbackRequest = nil
          return nil
        }
      return request
    }

  private func ReleaseReusableReadback(request VulkanAsyncReadback?) {
      guard let activeRequest = request else {
        return
      }
      try { activeRequest.Reset() } catch (cleanup Exception) { }
    }

  private func EnsureReadbackDispatch() VulkanReadbackDispatch {
    if let current = readbackDispatch {
      return current
    }
    let address = ResolveDeviceProc("vkCmdCopyImageToBuffer")
    if address == nint(0) {
      throw NotSupportedException("vkCmdCopyImageToBuffer is unavailable")
    }
    let created = VulkanReadbackDispatch(address)
    readbackDispatch = created
    return created
  }

  private func ReadbackFormatSupported(format VkFormat) bool {
    var properties = VkFormatProperties{}
    let getFormatProperties = instanceDispatch.vkGetPhysicalDeviceFormatProperties
    getFormatProperties(physicalDevice, format, &properties)
    let requiredFeatures = uint32(VkConstants.VK_FORMAT_FEATURE_COLOR_ATTACHMENT_BIT)
    | uint32(VkConstants.VK_FORMAT_FEATURE_COLOR_ATTACHMENT_BLEND_BIT)
    | uint32(VkConstants.VK_FORMAT_FEATURE_TRANSFER_SRC_BIT)
    return (properties.optimalTilingFeatures & requiredFeatures) == requiredFeatures
  }

  private func ClearReadbackStorage() bool {
    ClearReadbackPrerequisite()
    let liveBefore = CurrentObjectLiveCount()
    if let request = readbackRequest {
      try {
        if request.TargetPending {
          request.DrainAndDispose()
        } else {
          request.Dispose()
        }
      } catch (cleanup Exception) {
        return false
      }
    }
    RecordObjectDestroyDelta(liveBefore)
    readbackRequest = nil
    readbackDispatch = nil
    return true
  }

  private func AbandonReadbackAfterDeviceLoss() {
    ClearReadbackPrerequisite()
    if readbackRequest != nil {
      readbackAbandonCount = readbackAbandonCount + 1uL
    }
    let liveBefore = CurrentObjectLiveCount()
    var abandoned = true
    if let request = readbackRequest {
      try { request.AbandonAfterDeviceLoss() } catch (cleanup Exception) {
        abandoned = false
      }
    }
    if !abandoned {
      return
    }
    RecordObjectDestroyDelta(liveBefore)
    readbackRequest = nil
    readbackDispatch = nil
  }

  private func DrainReadbackForClose(deviceIdleCompleted bool) bool {
    ClearReadbackPrerequisite()
    let liveBefore = CurrentObjectLiveCount()
    if let request = readbackRequest {
      if deviceIdleCompleted {
        try { request.ConfirmDeviceIdleForTeardown() } catch (cleanup Exception) {
          if !request.DeviceLossDetected {
            return false
          }
          try { request.AbandonAfterDeviceLoss() } catch (abandon Exception) {
            return false
          }
        }
      }
      try { request.DrainAndDispose() } catch (cleanup Exception) {
        if !request.DeviceLossDetected {
          return false
        }
        try { request.AbandonAfterDeviceLoss() } catch (cleanup Exception) {
          return false
        }
      }
    }
    RecordObjectDestroyDelta(liveBefore)
    readbackRequest = nil
    readbackDispatch = nil
    return true
  }

  private func ClearReadbackPrerequisite() {
    readbackPrerequisiteFrame = nil
    readbackPrerequisiteGeneration = 0uL
    readbackPrerequisiteSceneVersion = 0uL
    readbackPrerequisiteTextScaleX = 1.0F
    readbackPrerequisiteTextScaleY = 1.0F
  }

  private func CurrentObjectLiveCount() uint64 {
    if let accounting = objectAccounting {
      return accounting.LiveCount
    }
    return 0uL
  }

  private func RecordObjectDestroyDelta(liveBefore uint64) {
    let liveAfter = CurrentObjectLiveCount()
    if liveBefore > liveAfter {
      readbackTiming.ObjectDestroyDelta = readbackTiming.ObjectDestroyDelta
      +liveBefore - liveAfter
    }
  }
}
