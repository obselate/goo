package Goo

import System.Diagnostics

internal unsafe partial class VulkanWindowTarget {
  internal prop LastClipMaskFrameStats VulkanClipMaskFrameStats{
    get -> clipMaskFrameStats
  }

  internal prop ClipMaskFrameTotals VulkanClipMaskFrameTotals{
    get -> clipMaskFrameTotals
  }

  public prop Active bool{
    get -> diagnostics != nil
  }

  public func Record(stage FrameProfileStage, ticks int64, bytes int64) {
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
    if diagnostics == nil {
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
    try {
      if let current = timestampState {
        current.ResetTimestampQueries(
          slot.CommandBuffer,
          int32(activeFrameSlotIndex),
          DiagnosticTimestampRecordingContext(slot))
      }
    } catch (cleanup Exception) { }
  }

  private func BeginDiagnosticTimestamp(slot VulkanFrameSlot,
    stage VulkanDiagnosticTimestampStage) bool{
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
    if start == 0uL {
      return
    }
    try {
      if let current = diagnostics {
        let end = uint64(Stopwatch.GetTimestamp())
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

  private func RecordDiagnosticPlan(start uint64, result VulkanSceneCompileResult,
    planCounters ScenePlanCounters, frame SceneFrame) {
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
          RecordDiagnosticTiming(VulkanDiagnosticEventIds.PlanCompile,
            VulkanDiagnosticCategories.Timing, start)
        }
      } catch (cleanup Exception) { }
    }

  private func RecordDiagnosticDamage(region VulkanDamageRegion, hasDamage bool) {
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
    try {
      if let current = diagnostics {
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
