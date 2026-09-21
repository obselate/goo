package Goo

import Hexa.NET.SDL3
import System
import System.Diagnostics
import System.Threading

internal data struct VulkanPrimitiveFrameRetentionTestSnapshot {
  internal var SlotIndex int32
  internal var RecordCount int32
  internal var ByteCount VkDeviceSize
  internal var Capacity VkDeviceSize
  internal var BufferGeneration uint64
  internal var PlannedTransferBytes VkDeviceSize
  internal var SkippedTransferBytes VkDeviceSize
  internal var DirtyRecordCount int32
  internal var UploadRangeCount int32
  internal var FullUpload bool
  internal var CpuWriteOperations uint64
  internal var NativeFlushCalls uint64
  internal var RetainedReuse uint64
  internal var LastUseSerial uint64
  internal var Prepared bool
  internal var CpuWrittenBytes uint64
  internal var TotalCpuWrittenBytes uint64
  internal var CpuComparedBytes uint64
  internal var TotalCpuComparedBytes uint64
  internal var HistoryCopiedBytes uint64
  internal var TotalHistoryCopiedBytes uint64
  internal var FlushRequests uint64
  internal var TotalFlushRequests uint64
  internal var SubmittedTransferBytes uint64
  internal var TotalSubmittedTransferBytes uint64
  internal var RecordedCopyCommands uint64
  internal var TotalRecordedCopyCommands uint64
  internal var RecordedBarriers uint64
  internal var TotalRecordedBarriers uint64
  internal var TotalPlannedTransferBytes VkDeviceSize
  internal var TotalSkippedTransferBytes VkDeviceSize
  internal var TotalDirtyRecordCount uint64
  internal var TotalUploadRangeCount uint64
  internal var TotalFullUploads uint64
  internal var TotalCpuWriteOperations uint64
  internal var TotalNativeFlushCalls uint64
  internal var TotalRetainedReuse uint64
}
internal data struct VulkanFrameSubmissionTestSnapshot {
  internal var Slot0Serial uint64
  internal var Slot1Serial uint64
}
internal data struct VulkanGraphicsTimelineTestSnapshot {
  internal var Available bool
  internal var Timeline uint64
  internal var RuntimeGeneration uint64
  internal var LastEnqueuedSerial uint64
  internal var CompletedSerial uint64
  internal var CompletedResult VkResult
  internal var PendingWindowSerial uint64
  internal var ReadbackSerial uint64
  internal var ReadbackPendingReconcile bool
}
internal data struct VulkanGraphicsTimelineValidationTestSnapshot {
  internal var Threw bool
  internal var MailboxIdle bool
  internal var SerialBefore uint64
  internal var SerialAfter uint64
  internal var MailboxSerial uint64
}
internal data struct VulkanShaderEffectPipelineIdentityTestSnapshot {
  internal var EntryCount int32
  internal var UniquePipelineCount int32
  internal var FirstPipeline uint64
  internal var AllHandlesEqual bool
  internal var SameObjectStable bool
}
internal data struct VulkanWindowFramebufferExtentTestSnapshot {
  internal var Width int32
  internal var Height int32
}
internal data struct VulkanPathCompileProbeTestSnapshot {
  internal var PathResourceDeferred bool
  internal var PathClipCount int32
  internal var ClipMaskCount int32
}
internal data struct VulkanClipMaskAtlasGrowthTestSnapshot {
  internal var ActiveLayerCount uint32
  internal var MaximumLayerCount uint32
  internal var UniqueLayerMask uint32
  internal var IncrementalGrowth bool
  internal var GenerationPreserved bool
  internal var ImagePreserved bool
  internal var Reacquired bool
  internal var FailureObserved bool
  internal var PressureFailureCount uint64
}

internal partial class VulkanWindowTarget {
  internal func DiagnosticFrameIdForTest() uint64 -> nextFrameId

  internal func DiagnosticCountersSnapshotForTest() VulkanDiagnosticCounterSnapshot {
    if let current = diagnostics {
      return current.Counters
    }
    return VulkanDiagnosticCounterSnapshot{}
  }
  internal func ImageResourceStatsForTest() VulkanImageResourceStats ->
  imageResources?.Stats ?? VulkanImageResourceStats{}
  internal func PathResourceStatsForTest() VulkanPathResourcesStats ->
  pathResources?.Stats ?? VulkanPathResourcesStats{}

  internal func CompilePathProbeForTest(root Node?, viewportWidth float32,
    viewportHeight float32) VulkanPathCompileProbeTestSnapshot{
      guard let resources = pathResources else {
        return VulkanPathCompileProbeTestSnapshot{}
      }
      let pathProbe = VulkanPathScene(resources)
      try {
        let compiler = VulkanSceneCompiler()
        compiler.SetPathScene(pathProbe)
        let result = compiler.Compile(root, Color.Rgb(12, 20, 32),
          viewportWidth, viewportHeight)
        return VulkanPathCompileProbeTestSnapshot{
          PathResourceDeferred: result.PathResourceDeferred,
          PathClipCount: result.PathClipCount,
          ClipMaskCount: result.ClipMaskCount,
        }
      } finally {
        pathProbe.Dispose()
      }
    }

  internal func FramebufferExtentForTest()
  VulkanWindowFramebufferExtentTestSnapshot{
    if let current = generation {
      return VulkanWindowFramebufferExtentTestSnapshot{
        Width: int32(current.Extent.width),
        Height: int32(current.Extent.height),
      }
    }
    return VulkanWindowFramebufferExtentTestSnapshot{
      Width: framebufferWidth,
      Height: framebufferHeight,
    }
  }
  internal func PrimitiveFrameRetentionSnapshotForTest()
  VulkanPrimitiveFrameRetentionTestSnapshot{
    guard let renderer = primitiveRenderer else {
      return VulkanPrimitiveFrameRetentionTestSnapshot{}
    }
    let stats = renderer.PrimitiveFrameStats
    return VulkanPrimitiveFrameRetentionTestSnapshot{
      SlotIndex: stats.SlotIndex,
      RecordCount: stats.RecordCount,
      ByteCount: stats.ByteCount,
      Capacity: stats.Capacity,
      BufferGeneration: stats.BufferGeneration,
      PlannedTransferBytes: stats.PlannedTransferBytes,
      SkippedTransferBytes: stats.SkippedTransferBytes,
      DirtyRecordCount: stats.DirtyRecordCount,
      UploadRangeCount: stats.UploadRangeCount,
      FullUpload: stats.FullUpload,
      CpuWriteOperations: stats.CpuWriteOperations,
      NativeFlushCalls: stats.NativeFlushCalls,
      RetainedReuse: stats.RetainedReuse,
      LastUseSerial: stats.LastUseSerial,
      Prepared: stats.Prepared,
      CpuWrittenBytes: stats.CpuWrittenBytes,
      TotalCpuWrittenBytes: stats.TotalCpuWrittenBytes,
      CpuComparedBytes: stats.CpuComparedBytes,
      TotalCpuComparedBytes: stats.TotalCpuComparedBytes,
      HistoryCopiedBytes: stats.HistoryCopiedBytes,
      TotalHistoryCopiedBytes: stats.TotalHistoryCopiedBytes,
      FlushRequests: stats.FlushRequests,
      TotalFlushRequests: stats.TotalFlushRequests,
      SubmittedTransferBytes: stats.SubmittedTransferBytes,
      TotalSubmittedTransferBytes: stats.TotalSubmittedTransferBytes,
      RecordedCopyCommands: stats.RecordedCopyCommands,
      TotalRecordedCopyCommands: stats.TotalRecordedCopyCommands,
      RecordedBarriers: stats.RecordedBarriers,
      TotalRecordedBarriers: stats.TotalRecordedBarriers,
      TotalPlannedTransferBytes: stats.TotalPlannedTransferBytes,
      TotalSkippedTransferBytes: stats.TotalSkippedTransferBytes,
      TotalDirtyRecordCount: stats.TotalDirtyRecordCount,
      TotalUploadRangeCount: stats.TotalUploadRangeCount,
      TotalFullUploads: stats.TotalFullUploads,
      TotalCpuWriteOperations: stats.TotalCpuWriteOperations,
      TotalNativeFlushCalls: stats.TotalNativeFlushCalls,
      TotalRetainedReuse: stats.TotalRetainedReuse,
    }
  }
  internal func FrameSubmissionSerialsForTest() VulkanFrameSubmissionTestSnapshot -> VulkanFrameSubmissionTestSnapshot {
    Slot0Serial: frameSlots.Slot(0u)?.SubmissionSerial ?? 0uL,
    Slot1Serial: frameSlots.Slot(1u)?.SubmissionSerial ?? 0uL,
  }

  internal func GraphicsTimelineForTest() VulkanGraphicsTimelineTestSnapshot {
    guard let activeRuntime = runtime else {
      return VulkanGraphicsTimelineTestSnapshot{}
    }
    var completed uint64
    let completedResult = activeRuntime.GetCompletedGraphicsSubmissionSerial(out completed)
    return VulkanGraphicsTimelineTestSnapshot{
      Available: activeRuntime.GraphicsTimeline != 0uL,
      Timeline: uint64(activeRuntime.GraphicsTimeline),
      RuntimeGeneration: activeRuntime.Generation,
      LastEnqueuedSerial: activeRuntime.QueueWorker.LastEnqueuedGraphicsSubmissionSerial,
      CompletedSerial: completed,
      CompletedResult: completedResult,
      PendingWindowSerial: pendingGlobalSubmissionSerial,
      ReadbackSerial: readbackRequest?.SubmissionSerial ?? 0uL,
      ReadbackPendingReconcile: readbackRequest?.SubmissionPendingReconcile == true,
    }
  }

  internal func PollGraphicsSubmissionForTest(serial uint64) VkResult {
    guard let activeRuntime = runtime else {
      return VkConstants.VK_NOT_READY
    }
    return activeRuntime.PollGraphicsSubmission(serial)
  }

  internal func WaitGraphicsSubmissionForTest(serial uint64, timeout uint64) VkResult {
    guard let activeRuntime = runtime else {
      return VkConstants.VK_NOT_READY
    }
    return activeRuntime.WaitGraphicsSubmission(serial, timeout)
  }

  internal func GraphicsTimelineValidationRollbackForTest()
  VulkanGraphicsTimelineValidationTestSnapshot{
    guard let activeRuntime = runtime else {
      return VulkanGraphicsTimelineValidationTestSnapshot{}
    }
    let worker = activeRuntime.QueueWorker
    let mailbox = worker.CreateMailbox(nil)
    let serialBefore = worker.LastEnqueuedGraphicsSubmissionSerial
    var threw = false
    mailbox.PrepareSubmit(nint(0), 0uL, 0uL)
    if !mailbox.BeginSubmit() {
      throw InvalidOperationException("Timeline validation mailbox was not idle")
    }
    try {
      activeRuntime.EnqueueGraphicsSubmission(mailbox, serial -> {
        throw InvalidOperationException("timeline validation probe")
      })
    } catch (error InvalidOperationException) {
      threw = true
    }
    return VulkanGraphicsTimelineValidationTestSnapshot{
      Threw: threw,
      MailboxIdle: mailbox.Phase == VulkanQueueMailboxPhase.Idle,
      SerialBefore: serialBefore,
      SerialAfter: worker.LastEnqueuedGraphicsSubmissionSerial,
      MailboxSerial: mailbox.SubmitSerial,
    }
  }

  internal func AbandonAcquiredFrameForTest() VkResult {
    if !frameBegun || activeFrameSlot == nil {
      return if frameFailureRetryable {
        VkConstants.VK_NOT_READY
      } else {
        VkConstants.VK_ERROR_INITIALIZATION_FAILED
      }
    }
    let result = TryAbandonRecordedFrameForRetry()
    RecordDiagnosticResult(VulkanDiagnosticEventIds.PresentWait, result)
    if result == VkConstants.VK_SUCCESS {
      CloseDiagnosticFrame(false)
      ClearActiveFrame()
    } else {
      if result != VkConstants.VK_ERROR_DEVICE_LOST {
        runtime?.MarkTeardownFailed(result)
      }
      HandleFrameFailure(result, VulkanDiagnosticEventIds.PresentWait)
    }
    return result
  }

  internal func SetForceFullRedrawForTest(value bool) {
    forceFullRedraw = value
  }

  internal func VerifyClipMaskAtlasGrowthForTest()
  VulkanClipMaskAtlasGrowthTestSnapshot{
    guard let activeRuntime = runtime else {
      return VulkanClipMaskAtlasGrowthTestSnapshot{}
    }
    guard let activeAllocator = memoryAllocator else {
      return VulkanClipMaskAtlasGrowthTestSnapshot{}
    }
    let atlas = VulkanClipMaskAtlas(
      device,
      dispatch,
      activeAllocator,
      32u,
      32u,
      clipMaskFormatSupport,
      32768uL,
      activeRuntime.Generation,
      nil)
    try {
      atlas.BeginUsageBatch()
      var key uint64 = 1uL
      var incrementalGrowth = true
      while key <= 8uL {
        atlas.Acquire(key, 0, 0, 32u, 32u)
        if atlas.Stats.ActiveLayerCount != uint32(key) {
          incrementalGrowth = false
        }
        key++
      }
      let grown = atlas.Stats
      var uniqueLayerMask uint32 = 0u
      key = 1uL
      while key <= 8uL {
        let region = atlas.Acquire(key, 0, 0, 32u, 32u)
        if region.Generation == grown.Generation && region.Layer < 32u {
          uniqueLayerMask = uniqueLayerMask | (1u << int32(region.Layer))
        }
        key++
      }
      var failureObserved = false
      try {
        atlas.Acquire(9uL, 0, 0, 32u, 32u)
      } catch (error InvalidOperationException) {
        failureObserved = true
      }
      let afterFailure = atlas.Stats
      let recovered = atlas.Acquire(1uL, 0, 0, 32u, 32u)
      return VulkanClipMaskAtlasGrowthTestSnapshot{
        ActiveLayerCount: grown.ActiveLayerCount,
        MaximumLayerCount: grown.MaximumLayerCount,
        UniqueLayerMask: uniqueLayerMask,
        IncrementalGrowth: incrementalGrowth,
        GenerationPreserved: afterFailure.Generation == grown.Generation,
        ImagePreserved: afterFailure.Image == grown.Image,
        Reacquired: recovered.Generation == grown.Generation && recovered.Layer == 0u,
        FailureObserved: failureObserved,
        PressureFailureCount: afterFailure.PressureFailureCount,
      }
    } finally {
      atlas.AbortUsageBatch()
      atlas.Dispose()
    }
  }
}

public partial class Window {
  private func VulkanTargetForTest() VulkanWindowTarget ? ->
  windowTarget as VulkanWindowTarget?

  private func SdlHostForTest() SdlHost ? -> host as SdlHost?
  internal func NativeHitTestForTest(x int32, y int32) SDLHitTestResult {
    guard let host = SdlHostForTest() else {
      throw InvalidOperationException("Native hit test requires an SDL host")
    }
    return host.HitTestForTest(x, y)
  }

  internal func PushNativeMouseMotionForTest(x float32, y float32, buttons PointerButtons) {
    guard let host = SdlHostForTest() else {
      throw InvalidOperationException("Native mouse motion requires an SDL host")
    }
    host.PushNativeMouseMotionForTest(x, y, buttons)
  }

  internal func PushNativeMouseButtonForTest(x float32, y float32, button PointerButton,
    down bool) {
    guard let host = SdlHostForTest() else {
      throw InvalidOperationException("Native mouse button requires an SDL host")
    }
    host.PushNativeMouseButtonForTest(x, y, button, down)
  }

  internal func ImageResourceStatsForTest() VulkanImageResourceStats ->
  VulkanTargetForTest()?.ImageResourceStatsForTest() ?? VulkanImageResourceStats{}

  internal func PathResourceStatsForTest() VulkanPathResourcesStats -> VulkanTargetForTest()?.PathResourceStatsForTest()
  ?? VulkanPathResourcesStats{}

  internal func PathProbeNodeForTest() Node ? -> node

  internal func RuntimeHoldNextQueueSubmitForTest() {
    VulkanTargetForTest()?.HoldNextQueueSubmitForTest()
  }

  internal func RuntimeHoldNextQueuePresentForTest() {
    VulkanTargetForTest()?.HoldNextQueuePresentForTest()
  }

  internal func RuntimeDeferNextQueueEnqueueForTest() {
    VulkanSharedRuntime.DeferNextQueueEnqueueForTest()
  }

  internal func RuntimeAcquireAndAbandonFrameForTest() VkResult {
    guard let target = VulkanTargetForTest() else {
      return VkConstants.VK_ERROR_INITIALIZATION_FAILED
    }
    target.BeginFrame()
    return target.AbandonAcquiredFrameForTest()
  }

  internal func RuntimeWaitForHeldQueueCallForTest(timeoutMs int32) bool -> VulkanSharedRuntime.WaitForHeldQueueCallForTest(timeoutMs)

  internal func RuntimeQueueWorkPendingForTest() bool -> VulkanTargetForTest()?.QueueWorkPending ?? false

  internal func SchedulerWaitMsForTest(nowTicks float64) int32 -> SchedulerWaitMs(nowTicks)

  internal func DeferSchedulerFrameForTest(seconds float64) {
    host?.DeferFrame(float64(Stopwatch.GetTimestamp()) + seconds * float64(Stopwatch.Frequency))
  }

  internal func PollQueueCompletionForTest() bool {
    let completed = VulkanTargetForTest()?.PollQueueCompletion() == true
    if completed {
      SdlHostForTest()?.FramePacing.MarkFrame(float64(Stopwatch.GetTimestamp()))
    }
    return completed
  }

  internal func DiagnosticCountersSnapshotForTest() VulkanDiagnosticCounterSnapshot {
    guard let target = VulkanTargetForTest() else {
      return VulkanDiagnosticCounterSnapshot{}
    }
    return target.DiagnosticCountersSnapshotForTest()
  }
  internal func CaptureTargetForTest() VulkanWindowTarget ? -> VulkanTargetForTest()
  internal func DiagnosticFrameIdForTest() uint64 -> VulkanTargetForTest()?.DiagnosticFrameIdForTest() ?? 0uL

  internal func ForceRenderForTest(dt float64) {
    requestRender()
    PumpScheduled(dt)
  }

  internal func StabilizeNativeMetricsForTest() {
    let quietTicks = int64(float64(Stopwatch.Frequency) * 0.05)
    let timeoutTicks = int64(float64(Stopwatch.Frequency) * 1.0)
    let start = Stopwatch.GetTimestamp()
    var quietStart = start
    var prior = CurrentWindowMetrics()
    while Stopwatch.GetTimestamp() - start < timeoutTicks {
      SdlRuntime.PumpEvents(Int32.MaxValue)
      consumeNativeMetrics()
      let current = CurrentWindowMetrics()
      let changed = current.LogicalWidth != prior.LogicalWidth
        || current.LogicalHeight != prior.LogicalHeight
        || current.FramebufferWidth != prior.FramebufferWidth
        || current.FramebufferHeight != prior.FramebufferHeight
      let now = Stopwatch.GetTimestamp()
      if changed {
        prior = current
        quietStart = now
      } else if now - quietStart >= quietTicks {
        return
      }
      Thread.Yield()
    }
    throw InvalidOperationException("Window metrics did not stabilize")
  }

  internal func PumpForTest(dt float64) {
    PumpScheduled(dt)
  }

  internal func UpdateTreeOnlyForTest(dt float64) {
    UpdateTree(dt)
  }

  internal func RequestReadbackForTest(width uint32, height uint32)
  WindowReadbackRequestStatus{
    guard let target = VulkanTargetForTest() else {
      return WindowReadbackRequestStatus.NotReady
    }
    let region = VulkanReadbackRegion{
      X: 0u,
      Y: 0u,
      Width: width,
      Height: height,
    }
    return target.RequestReadback(node, portalRoot, background, dpi, region)
  }

  internal func RequestReadbackForTest() WindowReadbackRequestStatus -> RequestReadbackForTest(64u, 64u)

  internal func CurrentWindowMetricsForTest() WindowMetrics -> CurrentWindowMetrics()

  internal func ApplyNativeResizeForTest(logicalWidth int32, logicalHeight int32,
    framebufferWidth int32, framebufferHeight int32) bool{
      guard let target = VulkanTargetForTest() else {
        return false
      }
      let previousGeneration = target.CurrentPresentGeneration
      if !applyNativeResize(logicalWidth, logicalHeight, framebufferWidth,
        framebufferHeight) {
          return false
        }
      let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 2L
      var actual = target.FramebufferExtentForTest()
      var currentGeneration = target.CurrentPresentGeneration
      while (currentGeneration == previousGeneration
          || actual.Width != framebufferWidth
          || actual.Height != framebufferHeight)
        && Stopwatch.GetTimestamp() < deadline{
          Thread.Yield()
          if !target.Resize(framebufferWidth, framebufferHeight) {
            return false
          }
          actual = target.FramebufferExtentForTest()
          currentGeneration = target.CurrentPresentGeneration
        }
      SdlHostForTest()?.SetMetricsForTest(logicalWidth, logicalHeight, actual.Width,
        actual.Height)
      this.framebufferWidth = actual.Width
      this.framebufferHeight = actual.Height
      return currentGeneration != 0uL
        && currentGeneration != previousGeneration
        && actual.Width == framebufferWidth
        && actual.Height == framebufferHeight
    }

  internal func FrameSubmissionSerialsForTest() VulkanFrameSubmissionTestSnapshot {
    guard let target = VulkanTargetForTest() else {
      return VulkanFrameSubmissionTestSnapshot{}
    }
    return target.FrameSubmissionSerialsForTest()
  }

  internal func GraphicsTimelineForTest() VulkanGraphicsTimelineTestSnapshot {
    guard let target = VulkanTargetForTest() else {
      return VulkanGraphicsTimelineTestSnapshot{}
    }
    return target.GraphicsTimelineForTest()
  }

  internal func PollGraphicsSubmissionForTest(serial uint64) VkResult ->
  VulkanTargetForTest()?.PollGraphicsSubmissionForTest(serial) ?? VkConstants.VK_NOT_READY

  internal func WaitGraphicsSubmissionForTest(serial uint64, timeout uint64) VkResult ->
  VulkanTargetForTest()?.WaitGraphicsSubmissionForTest(serial, timeout) ?? VkConstants.VK_NOT_READY

  internal func GraphicsTimelineValidationRollbackForTest()
  VulkanGraphicsTimelineValidationTestSnapshot{
    guard let target = VulkanTargetForTest() else {
      return VulkanGraphicsTimelineValidationTestSnapshot{}
    }
    return target.GraphicsTimelineValidationRollbackForTest()
  }

  internal func PollReadbackForTest() VkResult {
    guard let target = VulkanTargetForTest() else {
      return VkConstants.VK_NOT_READY
    }
    return target.PollReadback()
  }

  internal func TakeReadbackForTest() VulkanReadbackResult? {
    guard let target = VulkanTargetForTest() else {
      return nil
    }
    return target.TakeReadbackResult()
  }

  internal func ReadbackRequestCountForTest() uint64 {
    guard let target = VulkanTargetForTest() else {
      return 0uL
    }
    return target.ReadbackRequestCount
  }

  internal func ReadbackCompletionCountForTest() uint64 {
    guard let target = VulkanTargetForTest() else {
      return 0uL
    }
    return target.ReadbackCompletionCount
  }

  internal func ReadbackSubmissionReadyForReconcileForTest() bool -> VulkanTargetForTest()?.ReadbackSubmissionReadyForReconcile == true

  internal func ReadbackResidentResourceBytesForTest() uint64 {
    guard let target = VulkanTargetForTest() else {
      return 0uL
    }
    return uint64(target.ReadbackResidentResourceBytes)
  }

  internal func SetForceFullRedrawForTest(value bool) {
    VulkanTargetForTest()?.SetForceFullRedrawForTest(value)
  }

  internal func InputQueuePointerMoveForTest(x float64, y float64) {
    input.QueuePointerMove(float32(x), float32(y))
  }

  internal func InputQueuePointerPressForTest(x float64, y float64) {
    input.QueuePointerPress(float32(x), float32(y), PointerButton.Primary, KeyModifiers{})
  }

  internal func InputQueuePointerReleaseForTest(x float64, y float64) {
    input.QueuePointerRelease(float32(x), float32(y), PointerButton.Primary, KeyModifiers{})
  }

  internal func InputQueueWheelForTest(x float64, y float64, dx float64, dy float64) {
    input.QueuePointerWheel(float32(x), float32(y), float32(dx), float32(dy), KeyModifiers{})
  }

  internal func InputQueueKeyPressForTest(key Key) {
    input.QueueKeyPress(key, KeyModifiers{})
  }

  internal func InputQueueKeyReleaseForTest(key Key) {
    input.QueueKeyRelease(key)
  }

  internal func PrimitiveFrameRetentionSnapshotForTest()
  VulkanPrimitiveFrameRetentionTestSnapshot{
    guard let target = VulkanTargetForTest() else {
      return VulkanPrimitiveFrameRetentionTestSnapshot{}
    }
    return target.PrimitiveFrameRetentionSnapshotForTest()
  }
}
internal unsafe partial class SdlHost {
  internal func SetMetricsForTest(logicalWidth int32, logicalHeight int32,
    framebufferWidth int32, framebufferHeight int32) {
      LogicalWidth = logicalWidth
      LogicalHeight = logicalHeight
      FramebufferWidth = framebufferWidth
      FramebufferHeight = framebufferHeight
    }

  internal func HitTestForTest(x int32, y int32) SDLHitTestResult {
    var point = SdlHostPoint(x, y)
    return HitTest(windowHandle, nint(&point), nint(0))
  }

  internal func PushNativeMouseMotionForTest(x float32, y float32, buttons PointerButtons) {
    var nativeEvent = SDLEvent{
      Type: uint32(SDLEventType.MouseMotion),
      Motion: SDLMouseMotionEvent{
        Type: SDLEventType.MouseMotion,
        WindowID: windowId,
        Which: 0u,
        State: NativeMouseStateForTest(buttons),
        X: x,
        Y: y,
      },
    }
    PushNativeEventForTest(&nativeEvent)
  }

  internal func PushNativeMouseButtonForTest(x float32, y float32, button PointerButton,
    down bool) {
    let eventType = down ? SDLEventType.MouseButtonDown : SDLEventType.MouseButtonUp
    var nativeEvent = SDLEvent{
      Type: uint32(eventType),
      Button: SDLMouseButtonEvent{
        Type: eventType,
        WindowID: windowId,
        Which: 0u,
        Button: NativeSdlButtonForTest(button),
        Down: down ? uint8(1) : uint8(0),
        Clicks: uint8(1),
        X: x,
        Y: y,
      },
    }
    PushNativeEventForTest(&nativeEvent)
  }

  private func NativeMouseStateForTest(buttons PointerButtons) uint32 {
    var state uint32
    if (int32(buttons) & int32(PointerButtons.Primary)) != 0 {
      state = state | NativePointerMask(SDL.SDL_BUTTON_LEFT)
    }
    if (int32(buttons) & int32(PointerButtons.Secondary)) != 0 {
      state = state | NativePointerMask(SDL.SDL_BUTTON_RIGHT)
    }
    return state
  }

  private func NativeSdlButtonForTest(button PointerButton) uint8 -> switch button {
    case PointerButton.Primary: uint8(SDL.SDL_BUTTON_LEFT)
    case PointerButton.Secondary: uint8(SDL.SDL_BUTTON_RIGHT)
    case PointerButton.Middle: uint8(SDL.SDL_BUTTON_MIDDLE)
    case PointerButton.Back: uint8(SDL.SDL_BUTTON_X1)
    case PointerButton.Forward: uint8(SDL.SDL_BUTTON_X2)
    case _: uint8(0)
  }

  private func PushNativeEventForTest(nativeEvent *SDLEvent) {
    if !SDL.PushEvent(nativeEvent) {
      throw InvalidOperationException("SDL_PushEvent failed: " + SDL.GetErrorS())
    }
  }
}
internal class WindowReadbackTestFixture {
  shared {
    internal func AbortPrimitiveMetrics(window Window, finish bool) VulkanPrimitiveFrameStats ->
    window.AbortPrimitiveMetricsForTest(finish)

    internal func VerifyFlushMetrics(window Window) {
      window.VerifyFlushMetricsForTest()
    }

    internal func ShaderEffectProgramId(effect ShaderEffect) uint64 -> effect.ProgramId

    internal func ResolvePipelineIdentity(window Window, effects []ShaderEffect,
      warmEffect ShaderEffect) VulkanShaderEffectPipelineIdentityTestSnapshot ->
    window.ResolvePipelineIdentityForTest(effects, warmEffect)

    internal func ResolveShaderEffectPipeline(window Window, effect ShaderEffect) uint64 ->
    window.ResolveShaderEffectPipelineForTest(effect)

    internal func ShaderEffectPipelineEntryCount(window Window) int32 ->
    window.ShaderEffectPipelineEntryCountForTest()

    internal func VerifyShaderEffectDigestCollision(window Window,
      first ShaderEffectProgram, second ShaderEffectProgram) bool ->
    window.VerifyShaderEffectDigestCollisionForTest(first, second)

    internal func RejectShaderEffectWithoutVulkanArtifact(
      window Window, effect ShaderEffect) bool ->
    window.RejectShaderEffectWithoutVulkanArtifactForTest(effect)

    internal func ShaderEffectVerifyPresentationRetirement() {
      let retirement = VulkanPresentationRetirement(4u, 2u)
      let completed = retirement.RecordPresent(1uL, 0u)
      retirement.CompletePresent(completed)
      if retirement.TryBindPriorSameImageToCompletion(1uL, 0u, 0u, 1uL) {
        throw InvalidOperationException("completed presentation required a retirement bind")
      }
      retirement.RecordPresent(1uL, 0u)
      if !retirement.TryBindPriorSameImageToCompletion(1uL, 0u, 1u, 2uL) {
        throw InvalidOperationException("unresolved presentation did not bind")
      }
      if retirement.TryBindPriorSameImageToCompletion(1uL, 0u, 1u, 2uL) {
        throw InvalidOperationException("presentation retirement accepted a duplicate bind")
      }
      if retirement.CollectCompleted(1u, 2uL) != 1 {
        throw InvalidOperationException("bound presentation did not retire")
      }
    }

    internal func DiagnosticCounters(window Window) VulkanDiagnosticCounterSnapshot -> window.DiagnosticCountersSnapshotForTest()
    internal func ImageResourceStats(window Window) VulkanImageResourceStats ->
    window.ImageResourceStatsForTest()
    internal func VerifyClipMaskAtlasGrowth(window Window)
    VulkanClipMaskAtlasGrowthTestSnapshot{
      guard let target = window.CaptureTargetForTest() else {
        return VulkanClipMaskAtlasGrowthTestSnapshot{}
      }
      return target.VerifyClipMaskAtlasGrowthForTest()
    }
    internal func CaptureTarget(window Window) VulkanWindowTarget ? -> window.CaptureTargetForTest()

    internal func ForceRender(window Window, dt float64,
      timeoutSeconds float64 = 2.0) {
        let baseline = window.FrameSubmissionSerialsForTest()
        window.ForceRenderForTest(dt)
        let deadline = Stopwatch.GetTimestamp()
        +int64(float64(Stopwatch.Frequency) * timeoutSeconds)
        var accepted = false
        while Stopwatch.GetTimestamp() < deadline {
          SdlRuntime.PumpEvents(Int32.MaxValue)
          window.PollQueueCompletionForTest()
          let current = window.FrameSubmissionSerialsForTest()
          accepted = current.Slot0Serial != baseline.Slot0Serial
            || current.Slot1Serial != baseline.Slot1Serial
          let pending = window.RuntimeQueueWorkPendingForTest()
          if accepted && !pending {
            return
          }
          if !accepted && !pending {
            window.ForceRenderForTest(0.0)
          }
          Thread.Yield()
        }
        throw InvalidOperationException("WindowReadbackTestFixture.ForceRender did not accept and drain queue work")
      }

    internal func StabilizeNativeMetrics(window Window) {
      window.StabilizeNativeMetricsForTest()
    }

    internal func ForceRenderNonblocking(window Window, dt float64) {
      window.ForceRenderForTest(dt)
    }

    internal func Pump(window Window, dt float64) {
      window.PumpForTest(dt)
    }

    internal func UpdateTreeOnly(window Window, dt float64) {
      window.UpdateTreeOnlyForTest(dt)
    }

    internal func PumpNativeEvents() {
      SdlRuntime.PumpEvents(Int32.MaxValue)
    }
    internal func SetForceFullRedraw(window Window, value bool) {
      window.SetForceFullRedrawForTest(value)
    }

    internal func Request(window Window) WindowReadbackRequestStatus -> window.RequestReadbackForTest()

    internal func Request(window Window, width uint32, height uint32)
    WindowReadbackRequestStatus -> window.RequestReadbackForTest(width, height)

    internal func Metrics(window Window) WindowMetrics -> window.CurrentWindowMetricsForTest()
    internal func Resize(window Window, logicalWidth int32, logicalHeight int32,
      framebufferWidth int32, framebufferHeight int32) bool{
        if logicalWidth <= 0 || logicalHeight <= 0
          || framebufferWidth <= 0 || framebufferHeight <= 0 {
            throw InvalidOperationException(
              "WindowReadbackTestFixture.Resize dimensions must be positive")
          }
        return window.ApplyNativeResizeForTest(logicalWidth, logicalHeight,
          framebufferWidth, framebufferHeight)
      }

    internal func FrameSubmissions(window Window) VulkanFrameSubmissionTestSnapshot -> window.FrameSubmissionSerialsForTest()

    internal func GraphicsTimeline(window Window)
    VulkanGraphicsTimelineTestSnapshot -> window.GraphicsTimelineForTest()

    internal func PollGraphicsSubmission(window Window, serial uint64) VkResult ->
    window.PollGraphicsSubmissionForTest(serial)

    internal func WaitGraphicsSubmission(window Window, serial uint64,
      timeout uint64) VkResult -> window.WaitGraphicsSubmissionForTest(serial, timeout)

    internal func GraphicsTimelineValidationRollback(window Window)
    VulkanGraphicsTimelineValidationTestSnapshot ->
    window.GraphicsTimelineValidationRollbackForTest()

    internal func RuntimeAcquireAndAbandonFrame(window Window) VkResult ->
    window.RuntimeAcquireAndAbandonFrameForTest()

    internal func InputQueuePointerMove(window Window, x float64, y float64) {
      window.InputQueuePointerMoveForTest(x, y)
    }

    internal func InputQueuePointerPress(window Window, x float64, y float64) {
      window.InputQueuePointerPressForTest(x, y)
    }

    internal func InputQueuePointerRelease(window Window, x float64, y float64) {
      window.InputQueuePointerReleaseForTest(x, y)
    }

    internal func NativeHitTest(window Window, x int32, y int32) SDLHitTestResult ->
    window.NativeHitTestForTest(x, y)

    internal func NativeMouseMove(window Window, x float64, y float64, buttons PointerButtons) {
      window.PushNativeMouseMotionForTest(float32(x), float32(y), buttons)
      PumpNativeEvents()
    }

    internal func NativeMousePress(window Window, x float64, y float64,
      button PointerButton = PointerButton.Primary) {
      window.PushNativeMouseButtonForTest(float32(x), float32(y), button, true)
      PumpNativeEvents()
    }

    internal func NativeMouseRelease(window Window, x float64, y float64,
      button PointerButton = PointerButton.Primary) {
      window.PushNativeMouseButtonForTest(float32(x), float32(y), button, false)
      PumpNativeEvents()
    }

    internal func Poll(window Window) VkResult -> window.PollReadbackForTest()

    internal func Take(window Window) VulkanReadbackResult ? -> window.TakeReadbackForTest()

    internal func RequestCount(window Window) uint64 -> window.ReadbackRequestCountForTest()

    internal func CompletionCount(window Window) uint64 -> window.ReadbackCompletionCountForTest()

    internal func PathResources(window Window) VulkanPathResourcesStats ->
    window.PathResourceStatsForTest()

    internal func CompilePathProbe(resourcesWindow Window, treeWindow Window)
    VulkanPathCompileProbeTestSnapshot{
      guard let target = resourcesWindow.CaptureTargetForTest() else {
        return VulkanPathCompileProbeTestSnapshot{}
      }
      let metrics = treeWindow.CurrentWindowMetricsForTest()
      return target.CompilePathProbeForTest(treeWindow.PathProbeNodeForTest(),
        float32(metrics.LogicalWidth), float32(metrics.LogicalHeight))
    }

    internal func SubmissionReadyForReconcile(window Window) bool -> window.ReadbackSubmissionReadyForReconcileForTest()

    internal func ResidentResourceBytes(window Window) uint64 -> window.ReadbackResidentResourceBytesForTest()
    internal func PrimitiveFrameRetention(window Window)
    VulkanPrimitiveFrameRetentionTestSnapshot -> window.PrimitiveFrameRetentionSnapshotForTest()
    internal func RuntimeHoldNextQueueSubmit(window Window) {
      window.RuntimeHoldNextQueueSubmitForTest()
    }

    internal func RuntimeHoldNextQueuePresent(window Window) {
      window.RuntimeHoldNextQueuePresentForTest()
    }

    internal func RuntimeWaitForHeldQueueCall(window Window, timeoutMs int32) bool -> window.RuntimeWaitForHeldQueueCallForTest(timeoutMs)

    internal func RuntimeReleaseHeldQueueCall() {
      VulkanSharedRuntime.ReleaseHeldQueueCallForTest()
    }

    internal func RuntimeDeferNextQueueEnqueue(window Window) {
      window.RuntimeDeferNextQueueEnqueueForTest()
    }

    internal func RuntimeQueueWorkPending(window Window) bool -> window.RuntimeQueueWorkPendingForTest()

    internal func PollQueueCompletion(window Window) bool ->
    window.PollQueueCompletionForTest()

    internal func SchedulerWaitMs(window Window, nowTicks float64) int32 ->
    window.SchedulerWaitMsForTest(nowTicks)

    internal func DeferSchedulerFrame(window Window, seconds float64) {
      window.DeferSchedulerFrameForTest(seconds)
    }

    internal func DrainWindowQueue(window Window, timeoutMs int32) {
      let timeoutTicks = int64(float64(Stopwatch.Frequency) * float64(timeoutMs) / 1000.0)
      let start = Stopwatch.GetTimestamp()
      while RuntimeQueueWorkPending(window) {
        SdlRuntime.PumpEvents(Int32.MaxValue)
        window.PollQueueCompletionForTest()
        if Stopwatch.GetTimestamp() - start >= timeoutTicks {
          throw InvalidOperationException("window queue did not drain within the timeout")
        }
        Thread.Yield()
      }
    }

    internal func RuntimeDeferredQueueEnqueueCount() int64 -> VulkanSharedRuntime.QueueEnqueueDeferralCountForTest

  }
}

internal unsafe partial class VulkanSharedPrimitiveFormatState {
  internal func PipelineIdentityForTest(effects []ShaderEffect,
    warmEffect ShaderEffect) VulkanShaderEffectPipelineIdentityTestSnapshot{
      var firstPipeline VkPipeline
      var allHandlesEqual = true
      var uniquePipelineCount int32
      for effect in effects {
        let pipeline = ResolveShaderEffectPipeline(effect)
        if firstPipeline == 0uL {
          firstPipeline = pipeline
          uniquePipelineCount = 1
        } else if pipeline != firstPipeline {
          allHandlesEqual = false
          uniquePipelineCount++
        }
      }
      let beforeWarm = shaderEffectPipelineCount
      let warmPipeline = ResolveShaderEffectPipeline(warmEffect)
      var warmIndex int32
      var sameObjectStable = warmPipeline == firstPipeline
      while warmIndex < 4096 {
        sameObjectStable = sameObjectStable
          && ResolveShaderEffectPipeline(warmEffect) == warmPipeline
        warmIndex++
      }
      sameObjectStable = sameObjectStable
        && shaderEffectPipelineCount == beforeWarm
      return VulkanShaderEffectPipelineIdentityTestSnapshot{
        EntryCount: shaderEffectPipelineCount,
        UniquePipelineCount: uniquePipelineCount,
        FirstPipeline: firstPipeline,
        AllHandlesEqual: allHandlesEqual,
        SameObjectStable: sameObjectStable,
      }
    }

  internal func VerifyDigestCollisionForTest(
    first ShaderEffectProgram, second ShaderEffectProgram) bool{
      let firstDigest = first.VulkanSpirvDigest
      let secondDigest = second.VulkanSpirvDigest
      if firstDigest.Length != secondDigest.Length {
        return false
      }
      Array.Copy(firstDigest, secondDigest, firstDigest.Length)
      let before = shaderEffectPipelineCount
      let firstPipeline = ResolveShaderEffectPipeline(ShaderEffect(first))
      let secondPipeline = ResolveShaderEffectPipeline(ShaderEffect(second))
      return firstPipeline != 0uL && secondPipeline != 0uL
        && firstPipeline != secondPipeline
        && shaderEffectPipelineCount == before + 1
    }

  internal func RejectMissingArtifactForTest(effect ShaderEffect) bool {
    try {
      ResolveShaderEffectPipeline(effect)
      return false
    } catch (error NotSupportedException) {
      return true
    }
  }

  internal prop ShaderEffectPipelineEntryCountForTest int32{
    get -> shaderEffectPipelineCount
  }
}

internal unsafe partial class VulkanPrimitiveRenderer {
  internal func PipelineIdentityForTest(effects []ShaderEffect,
    warmEffect ShaderEffect) VulkanShaderEffectPipelineIdentityTestSnapshot ->
  primitivePipelines.PipelineIdentityForTest(effects, warmEffect)

  internal func ResolveShaderEffectPipelineForTest(effect ShaderEffect) uint64 ->
  primitivePipelines.ResolveShaderEffectPipeline(effect)

  internal func VerifyShaderEffectDigestCollisionForTest(
    first ShaderEffectProgram, second ShaderEffectProgram) bool ->
  primitivePipelines.VerifyDigestCollisionForTest(first, second)

  internal func RejectShaderEffectWithoutVulkanArtifactForTest(effect ShaderEffect) bool ->
  primitivePipelines.RejectMissingArtifactForTest(effect)

  internal prop ShaderEffectPipelineEntryCountForTest int32{
    get -> primitivePipelines.ShaderEffectPipelineEntryCountForTest
  }
}

internal unsafe partial class VulkanWindowTarget {
  internal func PipelineIdentityForTest(effects []ShaderEffect,
    warmEffect ShaderEffect) VulkanShaderEffectPipelineIdentityTestSnapshot{
      guard let renderer = primitiveRenderer else {
        throw InvalidOperationException("Pipeline identity fixture requires a renderer")
      }
      return renderer.PipelineIdentityForTest(effects, warmEffect)
    }

  internal func ResolveShaderEffectPipelineForTest(effect ShaderEffect) uint64 {
    guard let renderer = primitiveRenderer else {
      throw InvalidOperationException("Pipeline identity fixture requires a renderer")
    }
    return renderer.ResolveShaderEffectPipelineForTest(effect)
  }

  internal func VerifyShaderEffectDigestCollisionForTest(
    first ShaderEffectProgram, second ShaderEffectProgram) bool{
      guard let renderer = primitiveRenderer else {
        throw InvalidOperationException("Pipeline identity fixture requires a renderer")
      }
      return renderer.VerifyShaderEffectDigestCollisionForTest(first, second)
    }

  internal func RejectShaderEffectWithoutVulkanArtifactForTest(effect ShaderEffect) bool {
    guard let renderer = primitiveRenderer else {
      throw InvalidOperationException("Pipeline identity fixture requires a renderer")
    }
    return renderer.RejectShaderEffectWithoutVulkanArtifactForTest(effect)
  }

  internal prop ShaderEffectPipelineEntryCountForTest int32{
    get -> primitiveRenderer?.ShaderEffectPipelineEntryCountForTest ?? 0
  }
}

internal unsafe partial class VulkanPrimitiveRenderer {
  internal func AbortPrimitiveMetricsForTest(finish bool) VulkanPrimitiveFrameStats {
    let data = primitiveFrameData
    data.BeginPrepare(0, 1000uL, 8, 123uL, uint64.MaxValue)
    var record VulkanPrimitiveGpuRecord{}
    let count = finish ? 1000 : 1
    for index in 0 ... count {
      data.WriteRecord(index, *void(&record))
    }
    data.WriteEffectData([]uint8{ 1, 2, 3, 4, 5, 6, 7, 8 }, 8)
    if finish { data.FinishPrepare() }
    data.Abort(0)
    return data.LastStats
  }
}

internal unsafe partial class VulkanWindowTarget {
  internal func AbortPrimitiveMetricsForTest(finish bool) VulkanPrimitiveFrameStats {
    var attempts = 0
    while !WaitForGpu() {
      if attempts >= 1000 { throw InvalidOperationException("Metrics fixture requires completed queue work") }
      Thread.Sleep(1)
      attempts++
    }
    guard let renderer = primitiveRenderer else { throw InvalidOperationException("Renderer missing") }
    return renderer.AbortPrimitiveMetricsForTest(finish)
  }

  internal func VerifyFlushMetricsForTest() {
    guard let allocator = memoryAllocator else { throw InvalidOperationException("Allocator missing") }
    let creation = VulkanBufferFactory.CreateMapped(device, dispatch, allocator, nil,
      128uL, uint32(VkConstants.VK_BUFFER_USAGE_TRANSFER_SRC_BIT), VulkanMemoryPolicy.HostVisibleCoherentCached)
    let allocation = creation.Allocation
    let coherent = allocation.hostCoherent
    try {
      allocation.hostCoherent = true
      let skipped = allocator.FlushBeforeSubmit(allocation, 0uL, 128uL, out var skippedCall)
      allocation.hostCoherent = false
      let flushed = allocator.FlushBeforeSubmit(allocation, 0uL, 128uL, out var nativeCall)
      if skipped != VkConstants.VK_SUCCESS || skippedCall
        || flushed != VkConstants.VK_SUCCESS || !nativeCall{
          throw InvalidOperationException("Native flush call accounting is incorrect")
        }
    } finally {
      allocation.hostCoherent = coherent
      let destroyBuffer = dispatch.vkDestroyBuffer
      destroyBuffer(device, creation.Buffer, nil)
      allocator.Release(allocation)
    }
  }
}

public partial class Window {
  internal func AbortPrimitiveMetricsForTest(finish bool) VulkanPrimitiveFrameStats ->
  VulkanTargetForTest()!!.AbortPrimitiveMetricsForTest(finish)
  internal func VerifyFlushMetricsForTest() {
    VulkanTargetForTest()!!.VerifyFlushMetricsForTest()
  }
  internal func ResolvePipelineIdentityForTest(effects []ShaderEffect,
    warmEffect ShaderEffect) VulkanShaderEffectPipelineIdentityTestSnapshot ->
  VulkanTargetForTest()!!.PipelineIdentityForTest(effects, warmEffect)
  internal func ResolveShaderEffectPipelineForTest(effect ShaderEffect) uint64 ->
  VulkanTargetForTest()!!.ResolveShaderEffectPipelineForTest(effect)
  internal func ShaderEffectPipelineEntryCountForTest() int32 ->
  VulkanTargetForTest()!!.ShaderEffectPipelineEntryCountForTest
  internal func VerifyShaderEffectDigestCollisionForTest(
    first ShaderEffectProgram, second ShaderEffectProgram) bool ->
  VulkanTargetForTest()!!.VerifyShaderEffectDigestCollisionForTest(first, second)
  internal func RejectShaderEffectWithoutVulkanArtifactForTest(effect ShaderEffect) bool ->
  VulkanTargetForTest()!!.RejectShaderEffectWithoutVulkanArtifactForTest(effect)
}
