package Goo

import System
import System.Diagnostics
import System.Numerics

internal unsafe partial class VulkanWindowTarget {
  private const ReadbackBudgetBytes VkDeviceSize = 67108864uL
  private var readbackDispatch VulkanReadbackDispatch? = nil
  private var readbackPool VulkanReadbackPool? = nil
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
      if let pool = readbackPool {
        return pool.ResidentResourceBytes
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
      var pool VulkanReadbackPool? = nil
      var reusedSlot = false
      var leaseOwned = false
      var ownedLease VulkanSharedLease? = nil
      var ownedTarget VulkanOffscreenTarget? = nil
      var ownedRequest VulkanAsyncReadback? = nil
      var ownedPool VulkanReadbackPool? = nil
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
        request = TryAcquireReusableReadback(extent, requestedByteSize)
        pool = readbackPool
        reusedSlot = request != nil
        if request == nil && readbackPool != nil {
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
          let created = VulkanReadbackFactory.Create(target, readbackLease,
            activeRuntime.Generation, ReadbackBudgetBytes)
          let createdRequest = created.Request
          let createdPool = created.Pool
          ownedRequest = createdRequest
          ownedPool = createdPool
          readbackPool = createdPool
          readbackRequest = createdRequest
          ownedPool = nil
          ownedRequest = nil
          ownedTarget = nil
          request = createdRequest
          pool = createdPool
        }
        let activeRequest = request
        guard let activePool = pool else {
          return WindowReadbackRequestStatus.Failed
        }
        let clearColor = VkClearColorValue{}
        let submitResult = activeRequest.Request(replayFrame, clearColor,
          requestedRegion, replayTextScaleX, replayTextScaleY)
        readbackTiming.SubmitTicks = Stopwatch.GetTimestamp()
        if submitResult == VkConstants.VK_ERROR_DEVICE_LOST {
          try { activeRequest.AbandonAfterDeviceLoss() } catch (cleanup Exception) { }
          try { activePool.Dispose() } catch (cleanup Exception) { }
          readbackAbandonCount = readbackAbandonCount + 1uL
          ClearReadbackStorage()
          return WindowReadbackRequestStatus.DeviceLost
        }
        if submitResult != VkConstants.VK_SUCCESS {
          try { activeRequest.Dispose() } catch (cleanup Exception) { }
          try { activePool.Dispose() } catch (cleanup Exception) { }
          ClearReadbackStorage()
          return WindowReadbackRequestStatus.Failed
        }
        readbackPool = activePool
        readbackRequest = activeRequest
        readbackTiming.ResidentResourceBytes = activePool.ResidentResourceBytes
        ownedPool = nil
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
            && (!reusedSlot || activeRequest.TargetPending
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
          if reusedSlot {
            ReleaseReusableReadback(request, pool)
          } else if let activePool = ownedPool {
            try { activePool.Dispose() } catch (cleanup Exception) { }
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
    if result == VkConstants.VK_NOT_READY {
      return WindowReadbackPollStatus.NotReady
    }
    return WindowReadbackPollStatus.Failed
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
    if let pool = readbackPool {
      try { pool.Release(request) } catch (error Exception) {
        return nil
      }
    } else {
      try { request.Dispose() } catch (cleanup Exception) { }
    }
    return result
  }

  private func TryAcquireReusableReadback(extent VkExtent2D,
    requestedByteSize VkDeviceSize) VulkanAsyncReadback? {
      guard let pool = readbackPool, let request = readbackRequest else {
        return nil
      }
      if request.State != VulkanReadbackState.Idle {
        return nil
      }
      if request.Extent.width != extent.width || request.Extent.height != extent.height
        || requestedByteSize > request.StagingByteSize{
          let liveBefore = CurrentObjectLiveCount()
          try { pool.Dispose() } catch (cleanup Exception) {
            return nil
          }
          RecordObjectDestroyDelta(liveBefore)
          readbackPool = nil
          readbackRequest = nil
          return nil
        }
      return pool.Acquire()
    }

  private func ReleaseReusableReadback(request VulkanAsyncReadback?,
    pool VulkanReadbackPool?) {
      guard let activeRequest = request else {
        return
      }
      guard let activePool = pool else {
        return
      }
      try { activePool.Release(activeRequest) } catch (cleanup Exception) { }
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
    if let pool = readbackPool {
      try { pool.Dispose() } catch (cleanup Exception) {
        return false
      }
    } else if let request = readbackRequest {
      try { request.Dispose() } catch (cleanup Exception) {
        return false
      }
    }
    RecordObjectDestroyDelta(liveBefore)
    readbackPool = nil
    readbackRequest = nil
    readbackDispatch = nil
    return true
  }

  private func AbandonReadbackAfterDeviceLoss() {
    ClearReadbackPrerequisite()
    if readbackRequest != nil || readbackPool != nil {
      readbackAbandonCount = readbackAbandonCount + 1uL
    }
    let liveBefore = CurrentObjectLiveCount()
    var abandoned = true
    if let request = readbackRequest {
      try { request.AbandonAfterDeviceLoss() } catch (cleanup Exception) {
        abandoned = false
      }
    }
    if let pool = readbackPool {
      try { pool.Dispose() } catch (cleanup Exception) {
        abandoned = false
      }
    }
    if !abandoned {
      return
    }
    RecordObjectDestroyDelta(liveBefore)
    readbackPool = nil
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
    if let pool = readbackPool {
      try { pool.Dispose() } catch (cleanup Exception) {
        return false
      }
    }
    RecordObjectDestroyDelta(liveBefore)
    readbackPool = nil
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
