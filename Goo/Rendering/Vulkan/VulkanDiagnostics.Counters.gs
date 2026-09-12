package Goo

import System.Threading

internal class VulkanDiagnosticCounters {
  private var rebuildCount uint64
  private var layoutCount uint64
  private var planCompileCount uint64
  private var uploadCount uint64
  private var recordCount uint64
  private var submitCount uint64
  private var presentCount uint64
  private var readbackCount uint64
  private var managedAllocatedBytes uint64
  private var heapBudgetAvailable uint32
  private var heapBudgetSampleCurrent uint32
  private var heapBudget uint64
  private var driverHeapUsage uint64
  private var vulkanObjectCount uint64
  private var vulkanObjectAllocationCount uint64
  private var vulkanDeviceMemoryAllocationCount uint64
  private var vulkanDeviceMemoryBytes uint64
  private var cacheBytes uint64
  private var imageByteBudget uint64
  private var imageResidentBytes uint64
  private var imageLiveObjectCount uint64
  private var imagePeakResidentBytes uint64
  private var imagePeakLiveObjectCount uint64
  private var imageUploadChunkCount uint64
  private var imageUploadDeferredCount uint64
  private var imageUploadCompletedCount uint64
  private var textAtlasCount uint64
  private var textAtlasByteBudget uint64
  private var textAtlasResidentBytes uint64
  private var textAtlasLiveObjectCount uint64
  private var textAtlasPeakCount uint64
  private var textAtlasPeakByteBudget uint64
  private var textAtlasPeakResidentBytes uint64
  private var textAtlasPeakLiveObjectCount uint64
  private var textAtlasRecordedUploadBytes uint64
  private var textAtlasEvictionCount uint64
  private var textAtlasRetirementCount uint64
  private var pathAtlasByteBudget uint64
  private var pathAtlasResidentWords uint64
  private var pathAtlasFreeWords uint64
  private var pathAtlasPathCount uint64
  private var pathAtlasActiveReferenceCount uint64
  private var pathAtlasLiveObjectCount uint64
  private var pathAtlasEvictionCount uint64
  private var pathAtlasRetiredWords uint64
  private var pathAtlasReuseCount uint64
  private var pathAtlasPressureEventCount uint64
  private var pathAtlasPressureFailureCount uint64
  private var clipMaskAtlasByteBudget uint64
  private var clipMaskAtlasResidentBytes uint64
  private var clipMaskAtlasRegionCount uint64
  private var clipMaskAtlasFreePlacementCount uint64
  private var clipMaskAtlasActiveLayerCount uint64
  private var clipMaskAtlasMaximumLayerCount uint64
  private var clipMaskAtlasRetiredGenerationCount uint64
  private var clipMaskAtlasEvictionCount uint64
  private var clipMaskAtlasPressureEventCount uint64
  private var clipMaskAtlasPressureFailureCount uint64
  private var clipFrameWrittenBytes uint64
  private var clipFrameSkippedBytes uint64
  private var clipFrameMappedWrites uint64
  private var clipFrameFlushes uint64
  private var clipFrameRetainedReuse uint64
  private var clipFrameSlotIndex uint64
  private var clipFrameDrawCount uint64
  private var clipFrameMaskCount uint64
  private var clipFrameChainCount uint64
  private var clipFrameLayerCount uint64
  private var clipFrameByteCount uint64
  private var clipFrameCapacity uint64
  private var clipFrameBufferGeneration uint64
  private var clipFrameLastUseSerial uint64
  private var clipFrameRetentionEligible uint32
  private var clipFrameRetained uint32
  private var clipFrameRetentionValid uint32
  private var textFrameWrittenBytes uint64
  private var textFrameSkippedBytes uint64
  private var textFrameDirtySegmentCount uint64
  private var textFrameUploadRangeCount uint64
  private var textFrameFullUploadCount uint64
  private var textFrameMappedWrites uint64
  private var textFrameFlushes uint64
  private var textFrameRetainedReuse uint64
  private var textFrameSlotIndex uint64
  private var textFrameSegmentCount uint64
  private var textFrameRunCount uint64
  private var textFrameRecordCount uint64
  private var textFrameByteCount uint64
  private var textFrameCapacity uint64
  private var textFrameBufferGeneration uint64
  private var textFrameTopologyKey uint64
  private var textFrameLastUseSerial uint64
  private var textFramePrepared uint32
  private var imageEvictionCount uint64
  private var imageRetirementCount uint64
  private var allocatorBytes uint64
  private var dirtyChunkCount uint64
  private var reusedChunkCount uint64
  private var uploadBytes uint64
  private var drawCount uint64
  private var pipelineChangeCount uint64
  private var descriptorChangeCount uint64
  private var passCount uint64
  private var barrierCount uint64
  private var damageCount uint64
  private var damageArea uint64
  private var surfaceRecoveryCount uint64
  private var deviceRecoveryCount uint64
  private var validationErrorCount uint64
  private var resultCount uint64
  private var resultFailureCount uint64
  private var layerPoolByteBudget uint64
  private var layerPoolResidentBytes uint64
  private var layerPoolTargetCount uint64
  private var layerPoolLeasedCount uint64
  private var layerPoolCreateCount uint64
  private var layerPoolReuseCount uint64
  private var layerPoolEvictionCount uint64
  private var layerPoolPressureEventCount uint64
  private var layerPoolPressureFailureCount uint64
  private var layerPoolFailureCount uint64
  private var layerPoolPassCount uint64
  private var layerPoolCompositeCount uint64

  internal prop Snapshot VulkanDiagnosticCounterSnapshot{
    get {
      return VulkanDiagnosticCounterSnapshot{
        rebuildCount: Interlocked.Read(ref rebuildCount),
        layoutCount: Interlocked.Read(ref layoutCount),
        planCompileCount: Interlocked.Read(ref planCompileCount),
        uploadCount: Interlocked.Read(ref uploadCount),
        recordCount: Interlocked.Read(ref recordCount),
        submitCount: Interlocked.Read(ref submitCount),
        presentCount: Interlocked.Read(ref presentCount),
        readbackCount: Interlocked.Read(ref readbackCount),
        managedAllocatedBytes: Interlocked.Read(ref managedAllocatedBytes),
        heapBudgetAvailable: Interlocked.CompareExchange(ref heapBudgetAvailable, 0u, 0u),
        heapBudgetSampleCurrent: Interlocked.CompareExchange(ref heapBudgetSampleCurrent, 0u, 0u),
        heapBudget: Interlocked.Read(ref heapBudget),
        driverHeapUsage: Interlocked.Read(ref driverHeapUsage),
        vulkanObjectCount: Interlocked.Read(ref vulkanObjectCount),
        vulkanObjectAllocationCount: Interlocked.Read(ref vulkanObjectAllocationCount),
        vulkanDeviceMemoryAllocationCount: Interlocked.Read(ref vulkanDeviceMemoryAllocationCount),
        vulkanDeviceMemoryBytes: Interlocked.Read(ref vulkanDeviceMemoryBytes),
        cacheBytes: Interlocked.Read(ref cacheBytes),
        imageByteBudget: Interlocked.Read(ref imageByteBudget),
        imageResidentBytes: Interlocked.Read(ref imageResidentBytes),
        imageLiveObjectCount: Interlocked.Read(ref imageLiveObjectCount),
        imagePeakResidentBytes: Interlocked.Read(ref imagePeakResidentBytes),
        imagePeakLiveObjectCount: Interlocked.Read(ref imagePeakLiveObjectCount),
        imageUploadChunkCount: Interlocked.Read(ref imageUploadChunkCount),
        imageUploadDeferredCount: Interlocked.Read(ref imageUploadDeferredCount),
        imageUploadCompletedCount: Interlocked.Read(ref imageUploadCompletedCount),
        textAtlasCount: Interlocked.Read(ref textAtlasCount),
        textAtlasByteBudget: Interlocked.Read(ref textAtlasByteBudget),
        textAtlasResidentBytes: Interlocked.Read(ref textAtlasResidentBytes),
        textAtlasLiveObjectCount: Interlocked.Read(ref textAtlasLiveObjectCount),
        textAtlasPeakCount: Interlocked.Read(ref textAtlasPeakCount),
        textAtlasPeakByteBudget: Interlocked.Read(ref textAtlasPeakByteBudget),
        textAtlasPeakResidentBytes: Interlocked.Read(ref textAtlasPeakResidentBytes),
        textAtlasPeakLiveObjectCount: Interlocked.Read(ref textAtlasPeakLiveObjectCount),
        textAtlasRecordedUploadBytes: Interlocked.Read(ref textAtlasRecordedUploadBytes),
        textAtlasEvictionCount: Interlocked.Read(ref textAtlasEvictionCount),
        textAtlasRetirementCount: Interlocked.Read(ref textAtlasRetirementCount),
        pathAtlasByteBudget: Interlocked.Read(ref pathAtlasByteBudget),
        pathAtlasResidentWords: Interlocked.Read(ref pathAtlasResidentWords),
        pathAtlasFreeWords: Interlocked.Read(ref pathAtlasFreeWords),
        pathAtlasPathCount: Interlocked.Read(ref pathAtlasPathCount),
        pathAtlasActiveReferenceCount: Interlocked.Read(ref pathAtlasActiveReferenceCount),
        pathAtlasLiveObjectCount: Interlocked.Read(ref pathAtlasLiveObjectCount),
        pathAtlasEvictionCount: Interlocked.Read(ref pathAtlasEvictionCount),
        pathAtlasRetiredWords: Interlocked.Read(ref pathAtlasRetiredWords),
        pathAtlasReuseCount: Interlocked.Read(ref pathAtlasReuseCount),
        pathAtlasPressureEventCount: Interlocked.Read(ref pathAtlasPressureEventCount),
        pathAtlasPressureFailureCount: Interlocked.Read(ref pathAtlasPressureFailureCount),
        clipMaskAtlasByteBudget: Interlocked.Read(ref clipMaskAtlasByteBudget),
        clipMaskAtlasResidentBytes: Interlocked.Read(ref clipMaskAtlasResidentBytes),
        clipMaskAtlasRegionCount: Interlocked.Read(ref clipMaskAtlasRegionCount),
        clipMaskAtlasFreePlacementCount: Interlocked.Read(ref clipMaskAtlasFreePlacementCount),
        clipMaskAtlasActiveLayerCount: Interlocked.Read(ref clipMaskAtlasActiveLayerCount),
        clipMaskAtlasMaximumLayerCount: Interlocked.Read(ref clipMaskAtlasMaximumLayerCount),
        clipMaskAtlasRetiredGenerationCount: Interlocked.Read(ref clipMaskAtlasRetiredGenerationCount),
        clipMaskAtlasEvictionCount: Interlocked.Read(ref clipMaskAtlasEvictionCount),
        clipMaskAtlasPressureEventCount: Interlocked.Read(ref clipMaskAtlasPressureEventCount),
        clipMaskAtlasPressureFailureCount: Interlocked.Read(ref clipMaskAtlasPressureFailureCount),
        clipFrameWrittenBytes: Interlocked.Read(ref clipFrameWrittenBytes),
        clipFrameSkippedBytes: Interlocked.Read(ref clipFrameSkippedBytes),
        clipFrameMappedWrites: Interlocked.Read(ref clipFrameMappedWrites),
        clipFrameFlushes: Interlocked.Read(ref clipFrameFlushes),
        clipFrameRetainedReuse: Interlocked.Read(ref clipFrameRetainedReuse),
        clipFrameSlotIndex: Interlocked.Read(ref clipFrameSlotIndex),
        clipFrameDrawCount: Interlocked.Read(ref clipFrameDrawCount),
        clipFrameMaskCount: Interlocked.Read(ref clipFrameMaskCount),
        clipFrameChainCount: Interlocked.Read(ref clipFrameChainCount),
        clipFrameLayerCount: Interlocked.Read(ref clipFrameLayerCount),
        clipFrameByteCount: Interlocked.Read(ref clipFrameByteCount),
        clipFrameCapacity: Interlocked.Read(ref clipFrameCapacity),
        clipFrameBufferGeneration: Interlocked.Read(ref clipFrameBufferGeneration),
        clipFrameLastUseSerial: Interlocked.Read(ref clipFrameLastUseSerial),
        clipFrameRetentionEligible: Interlocked.CompareExchange(ref clipFrameRetentionEligible, 0u, 0u),
        clipFrameRetained: Interlocked.CompareExchange(ref clipFrameRetained, 0u, 0u),
        clipFrameRetentionValid: Interlocked.CompareExchange(ref clipFrameRetentionValid, 0u, 0u),
        textFrameWrittenBytes: Interlocked.Read(ref textFrameWrittenBytes),
        textFrameSkippedBytes: Interlocked.Read(ref textFrameSkippedBytes),
        textFrameDirtySegmentCount: Interlocked.Read(ref textFrameDirtySegmentCount),
        textFrameUploadRangeCount: Interlocked.Read(ref textFrameUploadRangeCount),
        textFrameFullUploadCount: Interlocked.Read(ref textFrameFullUploadCount),
        textFrameMappedWrites: Interlocked.Read(ref textFrameMappedWrites),
        textFrameFlushes: Interlocked.Read(ref textFrameFlushes),
        textFrameRetainedReuse: Interlocked.Read(ref textFrameRetainedReuse),
        textFrameSlotIndex: Interlocked.Read(ref textFrameSlotIndex),
        textFrameSegmentCount: Interlocked.Read(ref textFrameSegmentCount),
        textFrameRunCount: Interlocked.Read(ref textFrameRunCount),
        textFrameRecordCount: Interlocked.Read(ref textFrameRecordCount),
        textFrameByteCount: Interlocked.Read(ref textFrameByteCount),
        textFrameCapacity: Interlocked.Read(ref textFrameCapacity),
        textFrameBufferGeneration: Interlocked.Read(ref textFrameBufferGeneration),
        textFrameTopologyKey: Interlocked.Read(ref textFrameTopologyKey),
        textFrameLastUseSerial: Interlocked.Read(ref textFrameLastUseSerial),
        textFramePrepared: Interlocked.CompareExchange(ref textFramePrepared, 0u, 0u),
        imageEvictionCount: Interlocked.Read(ref imageEvictionCount),
        imageRetirementCount: Interlocked.Read(ref imageRetirementCount),
        allocatorBytes: Interlocked.Read(ref allocatorBytes),
        dirtyChunkCount: Interlocked.Read(ref dirtyChunkCount),
        reusedChunkCount: Interlocked.Read(ref reusedChunkCount),
        uploadBytes: Interlocked.Read(ref uploadBytes),
        drawCount: Interlocked.Read(ref drawCount),
        pipelineChangeCount: Interlocked.Read(ref pipelineChangeCount),
        descriptorChangeCount: Interlocked.Read(ref descriptorChangeCount),
        passCount: Interlocked.Read(ref passCount),
        barrierCount: Interlocked.Read(ref barrierCount),
        damageCount: Interlocked.Read(ref damageCount),
        damageArea: Interlocked.Read(ref damageArea),
        surfaceRecoveryCount: Interlocked.Read(ref surfaceRecoveryCount),
        deviceRecoveryCount: Interlocked.Read(ref deviceRecoveryCount),
        validationErrorCount: Interlocked.Read(ref validationErrorCount),
        resultCount: Interlocked.Read(ref resultCount),
        resultFailureCount: Interlocked.Read(ref resultFailureCount),
        layerPoolByteBudget: Interlocked.Read(ref layerPoolByteBudget),
        layerPoolResidentBytes: Interlocked.Read(ref layerPoolResidentBytes),
        layerPoolTargetCount: Interlocked.Read(ref layerPoolTargetCount),
        layerPoolLeasedCount: Interlocked.Read(ref layerPoolLeasedCount),
        layerPoolCreateCount: Interlocked.Read(ref layerPoolCreateCount),
        layerPoolReuseCount: Interlocked.Read(ref layerPoolReuseCount),
        layerPoolEvictionCount: Interlocked.Read(ref layerPoolEvictionCount),
        layerPoolPressureEventCount: Interlocked.Read(ref layerPoolPressureEventCount),
        layerPoolPressureFailureCount: Interlocked.Read(ref layerPoolPressureFailureCount),
        layerPoolFailureCount: Interlocked.Read(ref layerPoolFailureCount),
        layerPoolPassCount: Interlocked.Read(ref layerPoolPassCount),
        layerPoolCompositeCount: Interlocked.Read(ref layerPoolCompositeCount),
      }
    }
  }

  internal func AddRebuild(value uint64) { Interlocked.Add(ref rebuildCount, value) }
  internal func AddLayout(value uint64) { Interlocked.Add(ref layoutCount, value) }
  internal func AddPlanCompile(value uint64) { Interlocked.Add(ref planCompileCount, value) }
  internal func AddUpload(value uint64) { Interlocked.Add(ref uploadCount, value) }
  internal func AddRecord(value uint64) { Interlocked.Add(ref recordCount, value) }
  internal func AddSubmit(value uint64) { Interlocked.Add(ref submitCount, value) }
  internal func AddPresent(value uint64) { Interlocked.Add(ref presentCount, value) }
  internal func AddReadback(value uint64) { Interlocked.Add(ref readbackCount, value) }
  internal func AddManagedAllocatedBytes(value uint64) { Interlocked.Add(ref managedAllocatedBytes, value) }
  internal func SetHeapBudgetAvailable(value uint32) {
    Interlocked.Exchange(ref heapBudgetAvailable, value)
  }
  internal func SetHeapBudgetSampleCurrent(value uint32) {
    Interlocked.Exchange(ref heapBudgetSampleCurrent, value)
  }
  internal func SetHeapBudget(value uint64) { Interlocked.Exchange(ref heapBudget, value) }
  internal func SetDriverHeapUsage(value uint64) {
    Interlocked.Exchange(ref driverHeapUsage, value)
  }
  internal func AddVulkanObjectAllocation(value uint64) { Interlocked.Add(ref vulkanObjectAllocationCount, value) }
  internal func AddVulkanDeviceMemoryAllocation(value uint64) { Interlocked.Add(ref vulkanDeviceMemoryAllocationCount, value) }
  internal func AddUploadBytes(value uint64) { Interlocked.Add(ref uploadBytes, value) }
  internal func SetImageByteBudget(value uint64) {
    Interlocked.Exchange(ref imageByteBudget, value)
  }
  internal func SetImageResidentBytes(value uint64) {
    Interlocked.Exchange(ref imageResidentBytes, value)
  }
  internal func SetImageLiveObjectCount(value uint64) {
    Interlocked.Exchange(ref imageLiveObjectCount, value)
  }
  internal func SetImagePeakResidentBytes(value uint64) {
    while true {
      let current = Interlocked.Read(ref imagePeakResidentBytes)
      if value <= current || Interlocked.CompareExchange(ref imagePeakResidentBytes, value, current) == current {
        return
      }
    }
  }
  internal func SetImagePeakLiveObjectCount(value uint64) {
    while true {
      let current = Interlocked.Read(ref imagePeakLiveObjectCount)
      if value <= current || Interlocked.CompareExchange(ref imagePeakLiveObjectCount, value, current) == current {
        return
      }
    }
  }
  internal func SetTextAtlasCount(value uint64) {
    Interlocked.Exchange(ref textAtlasCount, value)
  }
  internal func SetTextAtlasByteBudget(value uint64) {
    Interlocked.Exchange(ref textAtlasByteBudget, value)
  }
  internal func SetTextAtlasResidentBytes(value uint64) {
    Interlocked.Exchange(ref textAtlasResidentBytes, value)
  }
  internal func SetTextAtlasLiveObjectCount(value uint64) {
    Interlocked.Exchange(ref textAtlasLiveObjectCount, value)
  }
  internal func SetTextAtlasPeakCount(value uint64) {
    while true {
      let current = Interlocked.Read(ref textAtlasPeakCount)
      if value <= current || Interlocked.CompareExchange(ref textAtlasPeakCount, value, current) == current {
        return
      }
    }
  }
  internal func SetTextAtlasPeakByteBudget(value uint64) {
    while true {
      let current = Interlocked.Read(ref textAtlasPeakByteBudget)
      if value <= current || Interlocked.CompareExchange(ref textAtlasPeakByteBudget, value, current) == current {
        return
      }
    }
  }
  internal func SetTextAtlasPeakResidentBytes(value uint64) {
    while true {
      let current = Interlocked.Read(ref textAtlasPeakResidentBytes)
      if value <= current || Interlocked.CompareExchange(ref textAtlasPeakResidentBytes, value, current) == current {
        return
      }
    }
  }
  internal func SetTextAtlasPeakLiveObjectCount(value uint64) {
    while true {
      let current = Interlocked.Read(ref textAtlasPeakLiveObjectCount)
      if value <= current || Interlocked.CompareExchange(ref textAtlasPeakLiveObjectCount, value, current) == current {
        return
      }
    }
  }
  internal func AddTextAtlasRecordedUploadBytes(value uint64) {
    Interlocked.Add(ref textAtlasRecordedUploadBytes, value)
  }
  internal func AddTextAtlasEviction(value uint64) { Interlocked.Add(ref textAtlasEvictionCount, value) }
  internal func AddTextAtlasRetirement(value uint64) { Interlocked.Add(ref textAtlasRetirementCount, value) }
  internal func SetClipMaskAtlasStats(stats VulkanClipMaskAtlasStats) {
    Interlocked.Exchange(ref clipMaskAtlasByteBudget, uint64(stats.ByteBudget))
    Interlocked.Exchange(ref clipMaskAtlasResidentBytes, uint64(stats.ResidentBytes))
    Interlocked.Exchange(ref clipMaskAtlasRegionCount, uint64(stats.RegionCount))
    Interlocked.Exchange(ref clipMaskAtlasFreePlacementCount, uint64(stats.FreePlacementCount))
    Interlocked.Exchange(ref clipMaskAtlasActiveLayerCount, uint64(stats.ActiveLayerCount))
    Interlocked.Exchange(ref clipMaskAtlasMaximumLayerCount, uint64(stats.MaximumLayerCount))
    Interlocked.Exchange(ref clipMaskAtlasRetiredGenerationCount, uint64(stats.RetiredGenerationCount))
    Interlocked.Exchange(ref clipMaskAtlasEvictionCount, stats.EvictionCount)
    Interlocked.Exchange(ref clipMaskAtlasPressureEventCount, stats.PressureEventCount)
    Interlocked.Exchange(ref clipMaskAtlasPressureFailureCount, stats.PressureFailureCount)
  }
  internal func ClearClipMaskAtlasCurrentState() {
    Interlocked.Exchange(ref clipMaskAtlasResidentBytes, 0uL)
    Interlocked.Exchange(ref clipMaskAtlasRegionCount, 0uL)
    Interlocked.Exchange(ref clipMaskAtlasFreePlacementCount, 0uL)
    Interlocked.Exchange(ref clipMaskAtlasActiveLayerCount, 0uL)
    Interlocked.Exchange(ref clipMaskAtlasMaximumLayerCount, 0uL)
    Interlocked.Exchange(ref clipMaskAtlasRetiredGenerationCount, 0uL)
  }
  internal func SetClipMaskFrameStats(stats VulkanClipMaskFrameStats,
    totals VulkanClipMaskFrameTotals) {
      Interlocked.Exchange(ref clipFrameWrittenBytes, totals.WrittenBytes)
      Interlocked.Exchange(ref clipFrameSkippedBytes, totals.SkippedBytes)
      Interlocked.Exchange(ref clipFrameMappedWrites, totals.MappedWrites)
      Interlocked.Exchange(ref clipFrameFlushes, totals.Flushes)
      Interlocked.Exchange(ref clipFrameRetainedReuse, totals.RetainedReuse)
      Interlocked.Exchange(ref clipFrameSlotIndex, uint64(stats.SlotIndex < 0 ? 0 : stats.SlotIndex))
      Interlocked.Exchange(ref clipFrameDrawCount, uint64(stats.DrawCount < 0 ? 0 : stats.DrawCount))
      Interlocked.Exchange(ref clipFrameMaskCount, uint64(stats.MaskCount < 0 ? 0 : stats.MaskCount))
      Interlocked.Exchange(ref clipFrameChainCount, uint64(stats.ClipChainCount < 0 ? 0 : stats.ClipChainCount))
      Interlocked.Exchange(ref clipFrameLayerCount, uint64(stats.LayerCount < 0 ? 0 : stats.LayerCount))
      Interlocked.Exchange(ref clipFrameByteCount, uint64(stats.ByteCount))
      Interlocked.Exchange(ref clipFrameCapacity, uint64(stats.Capacity))
      Interlocked.Exchange(ref clipFrameBufferGeneration, stats.BufferGeneration)
      Interlocked.Exchange(ref clipFrameLastUseSerial, stats.LastUseSerial)
      Interlocked.Exchange(ref clipFrameRetentionEligible, stats.RetentionEligible ? 1u : 0u)
      Interlocked.Exchange(ref clipFrameRetained, stats.Retained ? 1u : 0u)
      Interlocked.Exchange(ref clipFrameRetentionValid, stats.RetentionValid ? 1u : 0u)
    }
  internal func SetTextFrameStats(stats VulkanTextFrameStats) {
    Interlocked.Exchange(ref textFrameWrittenBytes, uint64(stats.TotalWrittenBytes))
    Interlocked.Exchange(ref textFrameSkippedBytes, uint64(stats.TotalSkippedBytes))
    Interlocked.Exchange(ref textFrameDirtySegmentCount, stats.TotalDirtySegmentCount)
    Interlocked.Exchange(ref textFrameUploadRangeCount, stats.TotalUploadRangeCount)
    Interlocked.Exchange(ref textFrameFullUploadCount, stats.TotalFullUploads)
    Interlocked.Exchange(ref textFrameMappedWrites, stats.TotalMappedWrites)
    Interlocked.Exchange(ref textFrameFlushes, stats.TotalFlushes)
    Interlocked.Exchange(ref textFrameRetainedReuse, stats.TotalRetainedReuse)
    Interlocked.Exchange(ref textFrameSlotIndex, uint64(stats.SlotIndex < 0 ? 0 : stats.SlotIndex))
    Interlocked.Exchange(ref textFrameSegmentCount, uint64(stats.SegmentCount < 0 ? 0 : stats.SegmentCount))
    Interlocked.Exchange(ref textFrameRunCount, uint64(stats.RunCount < 0 ? 0 : stats.RunCount))
    Interlocked.Exchange(ref textFrameRecordCount, uint64(stats.RecordCount < 0 ? 0 : stats.RecordCount))
    Interlocked.Exchange(ref textFrameByteCount, uint64(stats.ByteCount))
    Interlocked.Exchange(ref textFrameCapacity, uint64(stats.Capacity))
    Interlocked.Exchange(ref textFrameBufferGeneration, stats.BufferGeneration)
    Interlocked.Exchange(ref textFrameTopologyKey, stats.TopologyKey)
    Interlocked.Exchange(ref textFrameLastUseSerial, stats.LastUseSerial)
    Interlocked.Exchange(ref textFramePrepared, stats.Prepared ? 1u : 0u)
  }
  internal func SetPathAtlasStats(stats VulkanPathResourcesStats, liveObjectCount uint64) {
    Interlocked.Exchange(ref pathAtlasByteBudget, uint64(stats.WordCapacity) * 4uL)
    Interlocked.Exchange(ref pathAtlasResidentWords, uint64(stats.LiveWordCount))
    Interlocked.Exchange(ref pathAtlasFreeWords, uint64(stats.FreeWordCount))
    Interlocked.Exchange(ref pathAtlasPathCount, uint64(stats.PathCount))
    Interlocked.Exchange(ref pathAtlasActiveReferenceCount, uint64(stats.ActiveReferenceCount))
    Interlocked.Exchange(ref pathAtlasLiveObjectCount, liveObjectCount)
    Interlocked.Exchange(ref pathAtlasEvictionCount, stats.EvictionCount)
    Interlocked.Exchange(ref pathAtlasRetiredWords, stats.RetiredWordCount)
    Interlocked.Exchange(ref pathAtlasReuseCount, stats.ReuseCount)
    Interlocked.Exchange(ref pathAtlasPressureEventCount, stats.PressureEventCount)
    Interlocked.Exchange(ref pathAtlasPressureFailureCount, stats.PressureFailureCount)
  }
  internal func ClearPathAtlasCurrentState() {
    Interlocked.Exchange(ref pathAtlasResidentWords, 0uL)
    Interlocked.Exchange(ref pathAtlasFreeWords, 0uL)
    Interlocked.Exchange(ref pathAtlasPathCount, 0uL)
    Interlocked.Exchange(ref pathAtlasActiveReferenceCount, 0uL)
    Interlocked.Exchange(ref pathAtlasLiveObjectCount, 0uL)
  }
  internal func AddImageEviction(value uint64) { Interlocked.Add(ref imageEvictionCount, value) }
  internal func AddImageRetirement(value uint64) { Interlocked.Add(ref imageRetirementCount, value) }
  internal func AddImageUploadChunk(value uint64) { Interlocked.Add(ref imageUploadChunkCount, value) }
  internal func AddImageUploadDeferred(value uint64) { Interlocked.Add(ref imageUploadDeferredCount, value) }
  internal func AddImageUploadCompleted(value uint64) { Interlocked.Add(ref imageUploadCompletedCount, value) }
  internal func AddDraw(value uint64) { Interlocked.Add(ref drawCount, value) }
  internal func AddPipelineChange(value uint64) { Interlocked.Add(ref pipelineChangeCount, value) }
  internal func AddDescriptorChange(value uint64) { Interlocked.Add(ref descriptorChangeCount, value) }
  internal func AddPass(value uint64) { Interlocked.Add(ref passCount, value) }
  internal func AddBarrier(value uint64) { Interlocked.Add(ref barrierCount, value) }
  internal func AddDamage(count uint64, area uint64) {
    Interlocked.Add(ref damageCount, count)
    Interlocked.Add(ref damageArea, area)
  }
  internal func AddSurfaceRecovery(value uint64) { Interlocked.Add(ref surfaceRecoveryCount, value) }
  internal func AddDeviceRecovery(value uint64) { Interlocked.Add(ref deviceRecoveryCount, value) }
  internal func AddValidationError(value uint64) {
    Interlocked.Add(ref validationErrorCount, value)
  }
  internal func AddResult(failure bool) {
    Interlocked.Increment(ref resultCount)
    if failure {
      Interlocked.Increment(ref resultFailureCount)
    }
  }
  internal func SetLayerPoolByteBudget(value uint64) { Interlocked.Exchange(ref layerPoolByteBudget, value) }
  internal func SetLayerPoolResidentBytes(value uint64) { Interlocked.Exchange(ref layerPoolResidentBytes, value) }
  internal func SetLayerPoolTargetCount(value uint64) { Interlocked.Exchange(ref layerPoolTargetCount, value) }
  internal func SetLayerPoolLeasedCount(value uint64) { Interlocked.Exchange(ref layerPoolLeasedCount, value) }
  internal func AddLayerPoolCreate(value uint64) { Interlocked.Add(ref layerPoolCreateCount, value) }
  internal func AddLayerPoolReuse(value uint64) { Interlocked.Add(ref layerPoolReuseCount, value) }
  internal func AddLayerPoolCommandReuse(value uint64) {
    Interlocked.Add(ref layerPoolReuseCount, value)
  }
  internal func AddLayerPoolEviction(value uint64) { Interlocked.Add(ref layerPoolEvictionCount, value) }
  internal func AddLayerPoolPressure(value uint64) { Interlocked.Add(ref layerPoolPressureEventCount, value) }
  internal func AddLayerPoolPressureFailure(value uint64) { Interlocked.Add(ref layerPoolPressureFailureCount, value) }
  internal func AddLayerPoolFailure(value uint64) { Interlocked.Add(ref layerPoolFailureCount, value) }
  internal func AddLayerPoolPass(value uint64) { Interlocked.Add(ref layerPoolPassCount, value) }
  internal func AddLayerPoolComposite(value uint64) { Interlocked.Add(ref layerPoolCompositeCount, value) }
  internal func SetManagedAllocatedBytes(value uint64) { Interlocked.Exchange(ref managedAllocatedBytes, value) }
  internal func SetVulkanObjectCount(value uint64) { Interlocked.Exchange(ref vulkanObjectCount, value) }
  internal func SetVulkanObjectAllocationCount(value uint64) {
    Interlocked.Exchange(ref vulkanObjectAllocationCount, value)
  }
  internal func SetVulkanDeviceMemoryAllocationCount(value uint64) {
    Interlocked.Exchange(ref vulkanDeviceMemoryAllocationCount, value)
  }
  internal func SetVulkanDeviceMemoryBytes(value uint64) { Interlocked.Exchange(ref vulkanDeviceMemoryBytes, value) }
  internal func SetCacheBytes(value uint64) { Interlocked.Exchange(ref cacheBytes, value) }
  internal func SetAllocatorBytes(value uint64) { Interlocked.Exchange(ref allocatorBytes, value) }
  internal func SetDirtyChunkCount(value uint64) { Interlocked.Exchange(ref dirtyChunkCount, value) }
  internal func SetReusedChunkCount(value uint64) { Interlocked.Exchange(ref reusedChunkCount, value) }

  internal func AddVulkanObjects(value uint64) {
    Interlocked.Add(ref vulkanObjectCount, value)
  }

  internal func RemoveVulkanObjects(value uint64) {
    while true {
      let current = Interlocked.Read(ref vulkanObjectCount)
      let next = if value >= current { 0uL } else { current - value }
      if Interlocked.CompareExchange(ref vulkanObjectCount, next, current) == current {
        return
      }
    }
  }

  internal func AddVulkanDeviceMemoryBytes(value uint64) {
    Interlocked.Add(ref vulkanDeviceMemoryBytes, value)
  }

  internal func RemoveVulkanDeviceMemoryBytes(value uint64) {
    while true {
      let current = Interlocked.Read(ref vulkanDeviceMemoryBytes)
      let next = if value >= current { 0uL } else { current - value }
      if Interlocked.CompareExchange(ref vulkanDeviceMemoryBytes, next, current) == current {
        return
      }
    }
  }
}
