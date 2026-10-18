package Goo

import System.Diagnostics
import System.Runtime.InteropServices

internal unsafe partial class VulkanWindowTarget {
  private var pendingTraceContext FrameTraceContext
  private var activeTraceContext FrameTraceContext
  private var pendingTraceId string?
  private var activeTraceId string?
  private var profileGpuTraceId string?

  public func BeginPump(recorder FrameRecorder, context FrameTraceContext) {
    pendingTraceContext = context
    pendingTraceId = recorder.TraceId
    Sample(recorder, false, true)
    if timestampState == nil {
      if dispatch.vkCreateQueryPool == nil { LoadTimestampDispatch() }
      guard let activeRuntime = runtime else { return }
      let state = VulkanDiagnosticTimestampState(diagnostics, windowObjectAccounting)
      timestampState = state
      state.CreateTimestampQueryPool(device, dispatch, timestampValidBits,
        timestampPeriod, timestampComputeAndGraphics, activeRuntime)
    }
    if profileGpuTraceId != recorder.TraceId {
      profileGpuTraceId = recorder.TraceId
      var gpuContext = context
      gpuContext.DeviceId = uint64(device)
      gpuContext.DeviceGeneration = runtime?.Generation ?? 0uL
      recorder.Publish(FrameTraceRecord{
        Kind: FrameTraceKind.Metadata, Ticks: Stopwatch.GetTimestamp() - recorder.Origin,
        Context: gpuContext, Name: "gpu.timestamp", Source: "vulkan.timestamp",
        Validity: if timestampState?.TimestampQueriesSupported ?? false { "available" } else { "unavailable" },
      })
    }
  }

  public func Sample(recorder FrameRecorder, force bool, includeShared bool) {
    if includeShared {
      runtime?.MemoryAllocator.ProfileSnapshot(recorder, force)
      TextShaping.ProfileResources(recorder)
      runtime?.PrimitiveState.ProfileResources(recorder)
      runtime?.PipelineCache.ProfileResources(recorder)
      runtime?.ImageIdentityRegistry.ProfileResources(recorder)
    }
    ProfileSwapchains(recorder)
  }

  private func ProfileSwapchains(recorder FrameRecorder) {
    generation?.Profile(recorder)
    for i in 0 ... retiredSwapchains.Count {
      retiredSwapchains.Generation(i).Profile(recorder, retired: true)
    }
  }

  public func Describe() FrameTraceRecord {
    var properties = VkPhysicalDeviceProperties{}
    let getProperties = instanceDispatch.vkGetPhysicalDeviceProperties
    getProperties(physicalDevice, &properties)
    return FrameTraceRecord{Kind: FrameTraceKind.Metadata,
      Context: FrameTraceContext{DeviceId: uint64(device), DeviceGeneration: runtime?.Generation ?? 0uL},
      Name: Marshal.PtrToStringUTF8(nint(&properties.deviceName[0])),
      Source: "vulkan.device", Validity: "available",
      Value0: uint64(properties.vendorID), Value1: uint64(properties.deviceID)}
  }

  private prop TraceRecorder FrameRecorder? {
    get {
      let current = FrameRecorder.Current
      return if current != nil && current.TraceId == activeTraceId { current } else { nil }
    }
  }

  private func TraceContext() FrameTraceContext {
    var context = activeTraceContext
    context.FrameId = activeFrameId
    context.DeviceId = uint64(device)
    context.DeviceGeneration = runtime?.Generation ?? 0uL
    if let current = generation { context.Generation = current.Generation }
    return context
  }
  internal prop LastClipMaskFrameStats VulkanClipMaskFrameStats{
    get -> clipMaskFrameStats
  }

  internal prop ClipMaskFrameTotals VulkanClipMaskFrameTotals{
    get -> clipMaskFrameTotals
  }

  public prop Active bool{
    get -> diagnostics != nil
  }

  public func Record(stage FrameProfileStage, start FrameProfilePoint, end FrameProfilePoint, result int32) {
    RecordDerived(stage, end.Ticks - start.Ticks, end.Bytes - start.Bytes)
  }

  public func RecordDerived(stage FrameProfileStage, ticks int64, bytes int64) {
    if diagnostics == nil {
      return
    }
    let eventId = DiagnosticCpuStageEvent(stage)
    if eventId == VulkanDiagnosticEventIds.None {
      return
    }
    let duration = ticks < 0L ? 0uL : uint64(ticks)
    let allocation = bytes < 0L ? 0uL : uint64(bytes)
    try {
      if let current = diagnostics {
        current.Record(
          0uL,
          0uL,
          0uL,
          DiagnosticWindowValue(),
          activeFrameId,
          uint64(int32(stage)),
          DiagnosticQueueValue(),
          DiagnosticSubmissionValue(),
          0uL,
          0uL,
          eventId,
          VulkanDiagnosticCategories.Timing,
          0uL,
          int32(stage),
          duration,
          allocation)
      }
    } catch (cleanup Exception) { }
  }

  private func DiagnosticCpuStageEvent(stage FrameProfileStage) uint64 {
    if stage == FrameProfileStage.Events {
      return VulkanDiagnosticEventIds.EventWait
    }
    if stage == FrameProfileStage.Input || stage == FrameProfileStage.Motion
      || stage == FrameProfileStage.Transitions || stage == FrameProfileStage.InputTree{
        return VulkanDiagnosticEventIds.StatePropagation
      }
    if stage == FrameProfileStage.Reconcile || stage == FrameProfileStage.Build
      || stage == FrameProfileStage.Diff || stage == FrameProfileStage.StyleResolve{
        return VulkanDiagnosticEventIds.Reconciliation
      }
    return if stage == FrameProfileStage.Layout { VulkanDiagnosticEventIds.Layout } else { VulkanDiagnosticEventIds.None }
  }

  private func DiagnosticTimestamp() uint64 {
    if diagnostics == nil && TraceRecorder == nil {
      return 0uL
    }
    return uint64(Stopwatch.GetTimestamp())
  }

  private func DiagnosticWindowValue() uint64 {
    if diagnostics == nil {
      return 0uL
    }
    return diagnosticWindowHandle
  }

  private func DiagnosticQueueValue() uint64 {
    if diagnostics == nil {
      return 0uL
    }
    return uint64(queue)
  }

  private func DiagnosticSubmissionValue() uint64 {
    if diagnostics == nil {
      return 0uL
    }
    if let slot = activeFrameSlot {
      return slot.SubmissionSerial
    }
    return 0uL
  }

  private func DiagnosticSwapchainValue() uint64 {
    if diagnostics == nil {
      return 0uL
    }
    if let current = generation {
      return uint64(current.Handle)
    }
    return 0uL
  }

  private func DiagnosticGenerationValue() uint64 {
    if diagnostics == nil {
      return 0uL
    }
    if let current = generation {
      return current.Generation
    }
    return 0uL
  }

  private func CaptureDiagnosticTimestampCapabilities() {
    try {
      if let current = diagnostics {
        current.Record(
          0uL,
          0uL,
          0uL,
          DiagnosticWindowValue(),
          activeFrameId,
          0uL,
          DiagnosticQueueValue(),
          0uL,
          0uL,
          0uL,
          VulkanDiagnosticEventIds.GpuTimestamp,
          VulkanDiagnosticCategories.Timing,
          0uL,
          0,
          uint64(timestampValidBits),
          uint64(timestampPeriod * 1000.0F))
        current.Record(
          0uL,
          0uL,
          0uL,
          DiagnosticWindowValue(),
          activeFrameId,
          0uL,
          DiagnosticQueueValue(),
          0uL,
          0uL,
          0uL,
          VulkanDiagnosticEventIds.GpuTimestamp,
          VulkanDiagnosticCategories.Timing,
          0uL,
          0,
          if timestampComputeAndGraphics == VkConstants.VK_TRUE { 1uL } else { 0uL },
          0uL)
      }
    } catch (cleanup Exception) { }
  }

  private func DiagnosticTimestampRecordingContext(slot VulkanFrameSlot)
  VulkanDiagnosticTimestampContext -> VulkanDiagnosticTimestampContext{
    run: 0uL,
    workload: 0uL,
    process: 0uL,
    window: DiagnosticWindowValue(),
    frame: activeFrameId,
    sample: 0uL,
    queue: DiagnosticQueueValue(),
    submission: slot.NextSubmissionSerial,
    fence: 0uL,
    completionSerial: 0uL,
  }

  private func DiagnosticTimestampSubmittedContext(slot VulkanFrameSlot)
  VulkanDiagnosticTimestampContext -> VulkanDiagnosticTimestampContext{
    run: 0uL,
    workload: 0uL,
    process: 0uL,
    window: DiagnosticWindowValue(),
    frame: activeFrameId,
    sample: 0uL,
    queue: DiagnosticQueueValue(),
    submission: slot.SubmissionSerial,
    fence: 0uL,
    completionSerial: slot.GlobalSubmissionSerial,
  }

  private func DiagnosticTimestampCompletedContext(slot VulkanFrameSlot)
  VulkanDiagnosticTimestampContext -> VulkanDiagnosticTimestampContext{
    run: 0uL,
    workload: 0uL,
    process: 0uL,
    window: DiagnosticWindowValue(),
    frame: activeFrameId,
    sample: 0uL,
    queue: DiagnosticQueueValue(),
    submission: slot.LastCompletedSerial,
    fence: 0uL,
    completionSerial: slot.LastCompletedGlobalSubmissionSerial,
  }

  private func ResetDiagnosticTimestamp(slot VulkanFrameSlot) {
    if diagnostics == nil && FrameRecorder.Current == nil {
      RetireDetachedTimestampPool()
      return
    }
    try {
      if let current = timestampState {
        if current.ResetTimestampQueries(
          slot.CommandBuffer, int32(activeFrameSlotIndex), DiagnosticTimestampRecordingContext(slot)) {
          if let recorder = TraceRecorder { current.TraceSlot(int32(activeFrameSlotIndex), recorder, TraceContext()) }
        }
      }
    } catch (cleanup Exception) { }
  }

  private func BeginDiagnosticTimestamp(slot VulkanFrameSlot,
    stage VulkanDiagnosticTimestampStage) bool{
      if diagnostics == nil && FrameRecorder.Current == nil { return false }
      try {
        if let current = timestampState {
          return current.BeginTimestampStage(
            slot.CommandBuffer,
            int32(activeFrameSlotIndex),
            stage,
            DiagnosticTimestampRecordingContext(slot))
        }
      } catch (cleanup Exception) { }
      return false
    }

  private func EndDiagnosticTimestamp(slot VulkanFrameSlot,
    stage VulkanDiagnosticTimestampStage) bool{
      if diagnostics == nil && FrameRecorder.Current == nil { return false }
      try {
        if let current = timestampState {
          return current.EndTimestampStage(
            slot.CommandBuffer,
            int32(activeFrameSlotIndex),
            stage,
            DiagnosticTimestampRecordingContext(slot))
        }
      } catch (cleanup Exception) { }
      return false
    }

  private func ResolveDiagnosticTimestamp(slot VulkanFrameSlot, slotIndex uint32) {
    try {
      if let current = timestampState {
        current.ResolveTimestampSlot(
          int32(slotIndex),
          DiagnosticTimestampCompletedContext(slot))
      }
    } catch (cleanup Exception) { }
  }

  private func SubmitDiagnosticTimestamp(slot VulkanFrameSlot) {
    try {
      if let current = timestampState {
        current.SubmitTimestampSlot(
          int32(activeFrameSlotIndex),
          DiagnosticTimestampSubmittedContext(slot))
      }
    } catch (cleanup Exception) { }
  }

  private func RetireDetachedTimestampPool() {
    guard let state = timestampState else { return }
    if diagnostics != nil && !state.HasTraceRecorder { return }
    for i in 0 ... 2 {
      if let slot = frameSlots.Slot(uint32(i)) { ResolveDiagnosticTimestamp(slot, uint32(i)) }
    }
    if diagnostics == nil {
      DestroyDiagnosticTimestampPool()
      if !state.TimestampQueriesSupported { timestampState = nil }
    }
  }

  private func DestroyDiagnosticTimestampPool() {
    try {
      if let current = timestampState {
        current.DestroyTimestampQueryPool()
      }
    } catch (cleanup Exception) { }
  }

  private func ForceDestroyDiagnosticTimestampPool() bool {
    try {
      if let current = timestampState {
        return current.ForceDestroyTimestampQueryPool()
      }
    } catch (cleanup Exception) { }
    return false
  }

  private func AbandonDiagnosticTimestampPool() {
    try {
      if let current = timestampState {
        current.AbandonTimestampQueryPool()
      }
    } catch (cleanup Exception) { }
  }

  private func CaptureDiagnosticValidationBoundary() {
    try {
      if let current = diagnostics {
        if current.ValidationErrorCount != 0 && !current.Fatal.captured {
          CaptureDiagnosticFatal(
            int32(VkConstants.VK_ERROR_UNKNOWN),
            VulkanDiagnosticEventIds.ValidationMessage)
        }
      }
    } catch (cleanup Exception) { }
  }

  private func CloseDiagnosticFrame(submissionAccepted bool) {
    if activeFrameId == 0uL {
      return
    }
    try {
      RecordDiagnosticEvent(
        VulkanDiagnosticEventIds.FrameEnd,
        VulkanDiagnosticCategories.Timing,
        0uL,
        if submissionAccepted { 0 } else { 1 },
        if submissionAccepted { 1uL } else { 0uL },
        0uL)
    } catch (cleanup Exception) { }
    activeFrameId = 0uL
  }

  private func CaptureDiagnosticDeviceFacts(properties VkPhysicalDeviceProperties) {
    try {
      if let current = diagnostics {
        current.CaptureDeviceFacts(
          properties.apiVersion,
          properties.driverVersion,
          properties.vendorID,
          properties.deviceID,
          properties.deviceType,
          &properties.deviceName[0],
          1u,
          1u,
          1u)
      }
    } catch (cleanup Exception) { }
  }

  private func RecordDiagnosticEvent(eventId uint64, category uint64, severity uint64,
    result int32, value0 uint64, value1 uint64) {
      if let recorder = TraceRecorder {
        recorder.Instant(eventId, category, TraceContext(), result, value0, value1)
      }
      try {
        if let current = diagnostics {
          current.Record(
            0uL,
            0uL,
            0uL,
            DiagnosticWindowValue(),
            activeFrameId,
            0uL,
            DiagnosticQueueValue(),
            DiagnosticSubmissionValue(),
            0uL,
            0uL,
            eventId,
            category,
            severity,
            result,
            value0,
            value1)
        }
      } catch (cleanup Exception) { }
    }

  private func RecordDiagnosticResult(eventId uint64, result VkResult) {
    if result == VkConstants.VK_NOT_READY || result == VkConstants.VK_TIMEOUT {
      return
    }
    if let recorder = TraceRecorder {
      recorder.Instant(eventId, VulkanDiagnosticCategories.Timing, TraceContext(), int32(result),
        source: "result")
    }
    try {
      if let current = diagnostics {
        current.RecordResult(
          eventId,
          int32(result),
          activeFrameId,
          DiagnosticQueueValue(),
          DiagnosticSubmissionValue(),
          0uL)
      }
    } catch (cleanup Exception) { }
  }

  private func RecordDiagnosticTiming(eventId uint64, category uint64, start uint64) {
    if diagnostics == nil && TraceRecorder == nil { return }
    if start == 0uL {
      return
    }
    let end = uint64(Stopwatch.GetTimestamp())
    if let recorder = TraceRecorder {
      recorder.Duration(eventId, category, TraceContext(), int64(start), int64(end),
        source: "cpu.instrumented")
    }
    try {
      if let current = diagnostics {
        current.RecordStage(
          0uL,
          0uL,
          0uL,
          DiagnosticWindowValue(),
          activeFrameId,
          0uL,
          DiagnosticQueueValue(),
          DiagnosticSubmissionValue(),
          0uL,
          eventId,
          category,
          start,
          end)
      }
    } catch (cleanup Exception) { }
  }

  internal func RecordSdlWindowCreate(startTicks uint64, endTicks uint64) {
    if startTicks == 0uL || endTicks == 0uL {
      return
    }
    try {
      if let current = diagnostics {
        current.RecordStage(
          0uL,
          0uL,
          0uL,
          DiagnosticWindowValue(),
          0uL,
          0uL,
          0uL,
          0uL,
          0uL,
          VulkanDiagnosticEventIds.SdlWindowCreate,
          VulkanDiagnosticCategories.Window,
          startTicks,
          endTicks)
      }
    } catch (cleanup Exception) { }
  }

  private func RecordFirstSuccessfulPresent() {
    if startupFirstPresentRecorded || diagnostics == nil {
      return
    }
    startupFirstPresentRecorded = true
    let end = uint64(Stopwatch.GetTimestamp())
    startupFirstPresentTicks = end
    try {
      if let current = diagnostics {
        let start = if current.OriginTicks == 0uL { end } else { current.OriginTicks }
        current.RecordStage(
          0uL,
          0uL,
          0uL,
          DiagnosticWindowValue(),
          activeFrameId,
          0uL,
          DiagnosticQueueValue(),
          DiagnosticSubmissionValue(),
          0uL,
          VulkanDiagnosticEventIds.FirstSuccessfulPresent,
          VulkanDiagnosticCategories.Timing,
          start,
          end)
      }
    } catch (cleanup Exception) { }
  }

  private func CaptureDiagnosticLiveMemory(eventId uint64) {
    try {
      if let current = diagnostics {
        current.CaptureLiveMemory(eventId,
          if eventId == VulkanDiagnosticEventIds.FirstSuccessfulPresent {
            startupFirstPresentTicks
          } else {
            0uL
          })
      }
    } catch (cleanup Exception) { }
  }

  private func RecordDiagnosticPlan(start uint64, result VulkanSceneCompileResult,
    planCounters ScenePlanCounters, frame SceneFrame) {
      RecordDiagnosticTiming(VulkanDiagnosticEventIds.PlanCompile, VulkanDiagnosticCategories.Timing, start)
      if let recorder = TraceRecorder {
        var context = TraceContext()
        context.SceneVersion = result.FrameVersion
        recorder.Instant(VulkanDiagnosticEventIds.PlanCompile, VulkanDiagnosticCategories.FramePlan,
          context, value0: uint64(result.DrawCount), value1: uint64(planCounters.RecordOperations),
          source: "scene.counters")
      }
      try {
        if let current = diagnostics {
          var dirtyChunkCount uint64 = 0uL
          var reusedChunkCount uint64 = 0uL
          var chunkIndex int32 = 0
          while chunkIndex < frame.ChunkCount {
            if frame.Chunks[chunkIndex].Dirty {
              dirtyChunkCount++
            } else {
              reusedChunkCount++
            }
            chunkIndex++
          }
          current.AddPlanCompile(1uL)
          current.SetDirtyChunkCount(dirtyChunkCount)
          current.SetReusedChunkCount(reusedChunkCount)
          current.Record(
            0uL,
            0uL,
            0uL,
            DiagnosticWindowValue(),
            activeFrameId,
            0uL,
            DiagnosticQueueValue(),
            DiagnosticSubmissionValue(),
            0uL,
            0uL,
            VulkanDiagnosticEventIds.PlanCompile,
            VulkanDiagnosticCategories.FramePlan,
            0uL,
            0,
            uint64(result.DrawCount),
            uint64(planCounters.RecordOperations))
          var detailIndex int32 = 0
          while detailIndex < result.UnsupportedDetailCount {
            let detail = result.UnsupportedDetails[detailIndex]
            current.Record(
              0uL,
              0uL,
              0uL,
              DiagnosticWindowValue(),
              activeFrameId,
              detail.OwnerId,
              DiagnosticQueueValue(),
              DiagnosticSubmissionValue(),
              0uL,
              0uL,
              VulkanDiagnosticEventIds.SceneUnsupported,
              VulkanDiagnosticCategories.FramePlan,
              0uL,
              int32(detail.Primitive),
              uint64(int32(detail.Blob)),
              uint64(int32(detail.Field)))
            detailIndex++
          }
          if result.UnsupportedDetailDropped != 0 {
            current.Record(
              0uL,
              0uL,
              0uL,
              DiagnosticWindowValue(),
              activeFrameId,
              0uL,
              DiagnosticQueueValue(),
              DiagnosticSubmissionValue(),
              0uL,
              0uL,
              VulkanDiagnosticEventIds.SceneUnsupportedDropped,
              VulkanDiagnosticCategories.FramePlan,
              0uL,
              result.UnsupportedDetailDropped,
              uint64(result.UnsupportedDetailDropped),
              uint64(result.UnsupportedDetailCount))
          }
        }
      } catch (cleanup Exception) { }
    }

  private func RecordDiagnosticDamage(region VulkanDamageRegion, hasDamage bool) {
    if let recorder = TraceRecorder {
      recorder.Publish(FrameTraceRecord{Kind: FrameTraceKind.Instant,
        Ticks: Stopwatch.GetTimestamp() - recorder.Origin, ThreadId: System.Environment.CurrentManagedThreadId,
        Context: TraceContext(), EventId: VulkanDiagnosticEventIds.DamageBuild,
        Category: VulkanDiagnosticCategories.FramePlan, X: region.X, Y: region.Y,
        Width: region.Width, Height: region.Height, Result: if activePartialRedraw { 1 } else { 0 },
        Value0: if hasDamage { 1uL } else { 0uL }, Source: "frame.damage"})
    }
    if !hasDamage || region.IsEmpty {
      return
    }
    try {
      if let current = diagnostics {
        let area = uint64(region.Width) * uint64(region.Height)
        current.AddDamage(1uL, area)
        current.Record(
          0uL,
          0uL,
          0uL,
          DiagnosticWindowValue(),
          activeFrameId,
          0uL,
          DiagnosticQueueValue(),
          DiagnosticSubmissionValue(),
          0uL,
          0uL,
          VulkanDiagnosticEventIds.DamageBuild,
          VulkanDiagnosticCategories.FramePlan,
          0uL,
          activePartialRedraw ? 1 : 0,
          area,
          uint64(region.Width) << 32 | uint64(region.Height))
      }
    } catch (cleanup Exception) { }
  }

  private func RecordDiagnosticUpload(start uint64, bytes uint64) {
    if let recorder = TraceRecorder {
      recorder.Duration(VulkanDiagnosticEventIds.UploadStage, VulkanDiagnosticCategories.Timing,
        TraceContext(), int64(start), Stopwatch.GetTimestamp(), source: "upload.prepare")
    }
    if bytes == 0uL {
      return
    }
    try {
      if let current = diagnostics {
        current.AddUpload(1uL)
        current.AddUploadBytes(bytes)
        RecordDiagnosticTiming(VulkanDiagnosticEventIds.UploadStage,
          VulkanDiagnosticCategories.Timing, start)
      }
    } catch (cleanup Exception) { }
  }

  private func RecordDiagnosticRecord(start uint64, frame SceneFrame,
    recordResult VulkanPrimitiveRecordResult) {
      if let recorder = TraceRecorder {
        recorder.Duration(VulkanDiagnosticEventIds.CommandRecord, VulkanDiagnosticCategories.Timing,
          TraceContext(), int64(start), Stopwatch.GetTimestamp(), source: "command.record")
      }
      try {
        if let current = diagnostics {
          current.AddRecord(1uL)
          current.AddDraw(recordResult.drawCallCount)
          current.AddPipelineChange(recordResult.pipelineChangeCount)
          current.AddDescriptorChange(recordResult.descriptorChangeCount)
          current.Record(
            0uL,
            0uL,
            0uL,
            DiagnosticWindowValue(),
            activeFrameId,
            0uL,
            DiagnosticQueueValue(),
            DiagnosticSubmissionValue(),
            0uL,
            0uL,
            VulkanDiagnosticEventIds.CommandRecord,
            VulkanDiagnosticCategories.FramePlan,
            0uL,
            0,
            recordResult.drawCallCount,
            uint64(frame.DrawRefCount))
          RecordDiagnosticTiming(VulkanDiagnosticEventIds.CommandRecord,
            VulkanDiagnosticCategories.Timing, start)
          CaptureDiagnosticResources()
        }
      } catch (cleanup Exception) { }
    }

  private func RecordDiagnosticSubmit(start uint64) {
    if let recorder = TraceRecorder {
      recorder.Duration(VulkanDiagnosticEventIds.Submit, VulkanDiagnosticCategories.Timing,
        TraceContext(), int64(start), Stopwatch.GetTimestamp(), source: "submit.prepare-to-observed")
    }
    try {
      if let current = diagnostics {
        if !startupFirstSubmitRecorded {
          startupFirstSubmitRecorded = true
          RecordDiagnosticTiming(VulkanDiagnosticEventIds.FirstSubmit,
            VulkanDiagnosticCategories.Timing, start)
        }
        current.AddSubmit(1uL)
        RecordDiagnosticTiming(VulkanDiagnosticEventIds.Submit,
          VulkanDiagnosticCategories.Timing, start)
        if let slot = activeFrameSlot {
          current.CaptureSubmission(slot.SubmissionSerial, DiagnosticQueueValue(),
            0uL)
        }
        CaptureDiagnosticResources()
      }
    } catch (cleanup Exception) { }
  }

  private func RecordDiagnosticPresent(start uint64) {
    if let recorder = TraceRecorder {
      recorder.Duration(VulkanDiagnosticEventIds.SwapchainPresent, VulkanDiagnosticCategories.Timing,
        TraceContext(), int64(start), Stopwatch.GetTimestamp(), source: "present.prepare-to-observed")
    }
    try {
      if let current = diagnostics {
        current.AddPresent(1uL)
        RecordDiagnosticTiming(VulkanDiagnosticEventIds.SwapchainPresent,
          VulkanDiagnosticCategories.Timing, start)
        CaptureDiagnosticWsi()
      }
    } catch (cleanup Exception) { }
  }

  private func RecordDiagnosticBarrier() {
    RecordDiagnosticBarrierCount(1)
  }

  private func RecordDiagnosticBarrierCount(count int32) {
    if count <= 0 {
      return
    }
    try {
      if let current = diagnostics {
        current.AddBarrier(uint64(count))
      }
    } catch (cleanup Exception) { }
  }

  private func RecordDiagnosticPass() {
    try {
      if let current = diagnostics {
        current.AddPass(1uL)
      }
    } catch (cleanup Exception) { }
  }

  private func CaptureDiagnosticWsi() {
    try {
      if let current = diagnostics {
        current.CaptureWsiFacts(
          DiagnosticWindowValue(),
          uint64(surface),
          DiagnosticSwapchainValue(),
          activeFrameId,
          DiagnosticGenerationValue())
      }
    } catch (cleanup Exception) { }
  }

  private func RemoveTextAtlasDiagnosticContribution() {
    let token = textAtlasDiagnosticsToken
    if token == 0uL {
      return
    }
    textAtlasDiagnosticsToken = 0uL
    if let current = diagnostics {
      current.RemoveTextAtlasContribution(token)
    }
  }

  private func PublishTextAtlasDiagnosticContribution(
    current VulkanDiagnostics, stats VulkanTextAtlasSetStats) {
      if textAtlasDiagnosticsToken == 0uL {
        textAtlasDiagnosticsToken = current.RegisterTextAtlasContribution()
      }
      if textAtlasDiagnosticsToken != 0uL {
        current.SetTextAtlasContribution(
          textAtlasDiagnosticsToken,
          uint64(stats.AtlasCount),
          uint64(stats.ByteBudget),
          uint64(stats.ResidentByteSize),
          stats.LiveObjectCount)
      }
    }

  private func CaptureDiagnosticSwapchains() {
    if diagnostics == nil { return }
    try {
      var retiredImageCount uint64 = 0uL
      for index in 0 ... retiredSwapchains.Count {
        retiredImageCount = retiredImageCount + uint64(retiredSwapchains.Generation(index).ImageCount)
      }
      let liveCount = if generation != nil { 1uL } else { 0uL }
      let liveImageCount = generation?.ImageCount ?? 0u
      let payload = if let bytes = generation?.EstimatedPayloadBytes { bytes.ToString() } else {
        if liveCount == 0uL { "0" } else { "null" }
      }
      Console.Error.WriteLine("{\"kind\":\"swapchain\",\"window\":${DiagnosticWindowValue()},\"generation\":${DiagnosticGenerationValue()},\"ticks\":${Stopwatch.GetTimestamp()},\"swapchainLiveCount\":${liveCount},\"swapchainLiveImageCount\":${liveImageCount},\"swapchainRetiredCount\":${retiredSwapchains.Count},\"swapchainRetiredImageCount\":${retiredImageCount},\"swapchainEstimatedPayloadBytes\":${payload}}")
    } catch (cleanup Exception) { }
  }

  private func CaptureDiagnosticResources() {
    try {
      if let current = diagnostics {
        var heapAllocated uint64 = 0uL
        var heapBudgetAvailable uint32 = 0u
        var heapBudgetSampleCurrent uint32 = 0u
        var heapBudget uint64 = 0uL
        var driverHeapUsage uint64 = 0uL
        var retiredBytes uint64 = 0uL
        var allocatorBytes uint64 = 0uL
        if let allocator = memoryAllocator {
          allocator.RefreshBudget()
          let values = allocator.Counters
          if allocator.BudgetSampleAvailable {
            heapBudgetAvailable = 1u
            heapBudget = uint64(allocator.DriverHeapBudget)
            driverHeapUsage = uint64(allocator.DriverHeapUsage)
          }
          if allocator.BudgetSampleCurrent {
            heapBudgetSampleCurrent = 1u
          }
          heapAllocated = uint64(values.residentBytes)
          retiredBytes = uint64(values.retiredBytes)
          allocatorBytes = uint64(values.liveBytes) + uint64(values.retiredBytes)
          current.SetAllocatorBytes(allocatorBytes)
          current.SetVulkanDeviceMemoryAllocationCount(values.allocationEvents)
          current.SetVulkanDeviceMemoryBytes(uint64(values.residentBytes))
        }
        var liveObjects uint64 = 0uL
        if let accounting = objectAccounting {
          liveObjects = accounting.LiveCount
          current.SetVulkanObjectCount(liveObjects)
          current.SetVulkanObjectAllocationCount(accounting.AllocationCount)
        }
        var cacheBytes uint64 = 0uL
        if let resources = imageResources {
          let stats = resources.Stats
          cacheBytes = cacheBytes + uint64(stats.ResidentBytes)
          current.SetImageByteBudget(uint64(stats.ResidentByteBudget))
          current.SetImageResidentBytes(uint64(stats.ResidentBytes))
          current.SetImageLiveObjectCount(stats.LiveObjectCount)
          current.SetImagePeakResidentBytes(uint64(stats.ResidentBytes))
          current.SetImagePeakLiveObjectCount(stats.LiveObjectCount)
        }
        if let atlas = textAtlas {
          let stats = atlas.Stats
          cacheBytes = cacheBytes + uint64(stats.ResidentByteSize)
          PublishTextAtlasDiagnosticContribution(current, stats)
          current.SetTextAtlasPeakCount(uint64(stats.AtlasCount))
          current.SetTextAtlasPeakByteBudget(uint64(stats.ByteBudget))
          current.SetTextAtlasPeakResidentBytes(uint64(stats.ResidentByteSize))
          current.SetTextAtlasPeakLiveObjectCount(stats.LiveObjectCount)
        }
        if let resources = pathResources {
          let stats = resources.Stats
          cacheBytes = cacheBytes + uint64(stats.LiveWordCount) * 4uL
          current.SetPathAtlasStats(stats, resources.Atlas.Stats.LiveObjectCount)
        }
        if let atlas = clipMaskAtlas {
          current.SetClipMaskAtlasStats(atlas.Stats)
        } else {
          current.ClearClipMaskAtlasCurrentState()
        }
        current.SetClipMaskFrameStats(clipMaskFrameStats, clipMaskFrameTotals)
        if let renderer = primitiveRenderer {
          current.SetTextFrameStats(renderer.TextFrameStats)
        }
        current.SetCacheBytes(cacheBytes)
        current.CaptureResourceFacts(
          heapBudgetAvailable, heapBudgetSampleCurrent, heapBudget, driverHeapUsage, heapAllocated,
          retiredBytes, liveObjects)
      }
    } catch (cleanup Exception) { }
  }

  private func CaptureDiagnosticFatal(code int32, value uint64) {
    try {
      if let current = diagnostics {
        if current.Fatal.captured {
          return
        }
        CaptureDiagnosticWsi()
        CaptureDiagnosticResources()
        if let slot = activeFrameSlot {
          current.CaptureSubmission(slot.SubmissionSerial, DiagnosticQueueValue(),
            0uL)
        }
        current.CaptureFatal(code, value)
      }
    } catch (cleanup Exception) { }
  }
}
