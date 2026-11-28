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
  private var heapHeadroom uint64
  private var memoryEvictionCount uint64
  private var memoryAllocationRetryCount uint64
  private var memoryPressureCount uint64
  private var vulkanObjectCount uint64
  private var vulkanObjectAllocationCount uint64
  private var vulkanDeviceMemoryAllocationCount uint64
  private var vulkanDeviceMemoryBytes uint64
  private var cacheBytes uint64
  private var imageResidentBytes uint64
  private var imageLiveObjectCount uint64
  private var imagePeakResidentBytes uint64
  private var imagePeakLiveObjectCount uint64
  private var imageUploadChunkCount uint64
  private var imageUploadDeferredCount uint64
  private var imageUploadCompletedCount uint64
  private var imagePressureFailureCount uint64
  private var textAtlasPressureFailureCount uint64
  private var textAtlasCount uint64
  private var textAtlasResidentBytes uint64
  private var textAtlasLiveObjectCount uint64
  private var textAtlasPeakCount uint64
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
  private var textLayoutCacheBytes uint64
  private var textLayoutCacheEntries uint64
  private var textLayoutCacheHits uint64
  private var textLayoutCacheMisses uint64
  private var textLayoutCacheEvictions uint64
  private var textRunShapeCacheBytes uint64
  private var textRunShapeCacheEntries uint64
  private var textRunShapeCacheHits uint64
  private var textRunShapeCacheMisses uint64
  private var textRunShapeCacheEvictions uint64
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
  private var layerPoolResidentBytes uint64
  private var layerPoolTargetCount uint64
  private var layerPoolLeasedCount uint64
  private var layerPoolResolutionShift uint64
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
        rebuildCount: Interlocked.Read(in rebuildCount),
        layoutCount: Interlocked.Read(in layoutCount),
        planCompileCount: Interlocked.Read(in planCompileCount),
        uploadCount: Interlocked.Read(in uploadCount),
        recordCount: Interlocked.Read(in recordCount),
        submitCount: Interlocked.Read(in submitCount),
        presentCount: Interlocked.Read(in presentCount),
        readbackCount: Interlocked.Read(in readbackCount),
        managedAllocatedBytes: Interlocked.Read(in managedAllocatedBytes),
        heapBudgetAvailable: Interlocked.CompareExchange(ref heapBudgetAvailable, 0u, 0u),
        heapBudgetSampleCurrent: Interlocked.CompareExchange(ref heapBudgetSampleCurrent, 0u, 0u),
        heapBudget: Interlocked.Read(in heapBudget),
        driverHeapUsage: Interlocked.Read(in driverHeapUsage),
        heapHeadroom: Interlocked.Read(in heapHeadroom),
        memoryEvictionCount: Interlocked.Read(in memoryEvictionCount),
        memoryAllocationRetryCount: Interlocked.Read(in memoryAllocationRetryCount),
        memoryPressureCount: Interlocked.Read(in memoryPressureCount),
        vulkanObjectCount: Interlocked.Read(in vulkanObjectCount),
        vulkanObjectAllocationCount: Interlocked.Read(in vulkanObjectAllocationCount),
        vulkanDeviceMemoryAllocationCount: Interlocked.Read(in vulkanDeviceMemoryAllocationCount),
        vulkanDeviceMemoryBytes: Interlocked.Read(in vulkanDeviceMemoryBytes),
        cacheBytes: Interlocked.Read(in cacheBytes),
        imageResidentBytes: Interlocked.Read(in imageResidentBytes),
        imageLiveObjectCount: Interlocked.Read(in imageLiveObjectCount),
        imagePeakResidentBytes: Interlocked.Read(in imagePeakResidentBytes),
        imagePeakLiveObjectCount: Interlocked.Read(in imagePeakLiveObjectCount),
        imageUploadChunkCount: Interlocked.Read(in imageUploadChunkCount),
        imageUploadDeferredCount: Interlocked.Read(in imageUploadDeferredCount),
        imageUploadCompletedCount: Interlocked.Read(in imageUploadCompletedCount),
        imagePressureFailureCount: Interlocked.Read(in imagePressureFailureCount),
        textAtlasPressureFailureCount: Interlocked.Read(in textAtlasPressureFailureCount),
        textAtlasCount: Interlocked.Read(in textAtlasCount),
        textAtlasResidentBytes: Interlocked.Read(in textAtlasResidentBytes),
        textAtlasLiveObjectCount: Interlocked.Read(in textAtlasLiveObjectCount),
        textAtlasPeakCount: Interlocked.Read(in textAtlasPeakCount),
        textAtlasPeakResidentBytes: Interlocked.Read(in textAtlasPeakResidentBytes),
        textAtlasPeakLiveObjectCount: Interlocked.Read(in textAtlasPeakLiveObjectCount),
        textAtlasRecordedUploadBytes: Interlocked.Read(in textAtlasRecordedUploadBytes),
        textAtlasEvictionCount: Interlocked.Read(in textAtlasEvictionCount),
        textAtlasRetirementCount: Interlocked.Read(in textAtlasRetirementCount),
        pathAtlasByteBudget: Interlocked.Read(in pathAtlasByteBudget),
        pathAtlasResidentWords: Interlocked.Read(in pathAtlasResidentWords),
        pathAtlasFreeWords: Interlocked.Read(in pathAtlasFreeWords),
        pathAtlasPathCount: Interlocked.Read(in pathAtlasPathCount),
        pathAtlasActiveReferenceCount: Interlocked.Read(in pathAtlasActiveReferenceCount),
        pathAtlasLiveObjectCount: Interlocked.Read(in pathAtlasLiveObjectCount),
        pathAtlasEvictionCount: Interlocked.Read(in pathAtlasEvictionCount),
        pathAtlasRetiredWords: Interlocked.Read(in pathAtlasRetiredWords),
        pathAtlasReuseCount: Interlocked.Read(in pathAtlasReuseCount),
        pathAtlasPressureEventCount: Interlocked.Read(in pathAtlasPressureEventCount),
        pathAtlasPressureFailureCount: Interlocked.Read(in pathAtlasPressureFailureCount),
        clipMaskAtlasByteBudget: Interlocked.Read(in clipMaskAtlasByteBudget),
        clipMaskAtlasResidentBytes: Interlocked.Read(in clipMaskAtlasResidentBytes),
        clipMaskAtlasRegionCount: Interlocked.Read(in clipMaskAtlasRegionCount),
        clipMaskAtlasFreePlacementCount: Interlocked.Read(in clipMaskAtlasFreePlacementCount),
        clipMaskAtlasActiveLayerCount: Interlocked.Read(in clipMaskAtlasActiveLayerCount),
        clipMaskAtlasMaximumLayerCount: Interlocked.Read(in clipMaskAtlasMaximumLayerCount),
        clipMaskAtlasRetiredGenerationCount: Interlocked.Read(in clipMaskAtlasRetiredGenerationCount),
        clipMaskAtlasEvictionCount: Interlocked.Read(in clipMaskAtlasEvictionCount),
        clipMaskAtlasPressureEventCount: Interlocked.Read(in clipMaskAtlasPressureEventCount),
        clipMaskAtlasPressureFailureCount: Interlocked.Read(in clipMaskAtlasPressureFailureCount),
        clipFrameWrittenBytes: Interlocked.Read(in clipFrameWrittenBytes),
        clipFrameSkippedBytes: Interlocked.Read(in clipFrameSkippedBytes),
        clipFrameMappedWrites: Interlocked.Read(in clipFrameMappedWrites),
        clipFrameFlushes: Interlocked.Read(in clipFrameFlushes),
        clipFrameRetainedReuse: Interlocked.Read(in clipFrameRetainedReuse),
        clipFrameSlotIndex: Interlocked.Read(in clipFrameSlotIndex),
        clipFrameDrawCount: Interlocked.Read(in clipFrameDrawCount),
        clipFrameMaskCount: Interlocked.Read(in clipFrameMaskCount),
        clipFrameChainCount: Interlocked.Read(in clipFrameChainCount),
        clipFrameLayerCount: Interlocked.Read(in clipFrameLayerCount),
        clipFrameByteCount: Interlocked.Read(in clipFrameByteCount),
        clipFrameCapacity: Interlocked.Read(in clipFrameCapacity),
        clipFrameBufferGeneration: Interlocked.Read(in clipFrameBufferGeneration),
        clipFrameLastUseSerial: Interlocked.Read(in clipFrameLastUseSerial),
        clipFrameRetentionEligible: Interlocked.CompareExchange(ref clipFrameRetentionEligible, 0u, 0u),
        clipFrameRetained: Interlocked.CompareExchange(ref clipFrameRetained, 0u, 0u),
        clipFrameRetentionValid: Interlocked.CompareExchange(ref clipFrameRetentionValid, 0u, 0u),
        textFrameWrittenBytes: Interlocked.Read(in textFrameWrittenBytes),
        textFrameSkippedBytes: Interlocked.Read(in textFrameSkippedBytes),
        textFrameDirtySegmentCount: Interlocked.Read(in textFrameDirtySegmentCount),
        textFrameUploadRangeCount: Interlocked.Read(in textFrameUploadRangeCount),
        textFrameFullUploadCount: Interlocked.Read(in textFrameFullUploadCount),
        textFrameMappedWrites: Interlocked.Read(in textFrameMappedWrites),
        textFrameFlushes: Interlocked.Read(in textFrameFlushes),
        textFrameRetainedReuse: Interlocked.Read(in textFrameRetainedReuse),
        textFrameSlotIndex: Interlocked.Read(in textFrameSlotIndex),
        textFrameSegmentCount: Interlocked.Read(in textFrameSegmentCount),
        textFrameRunCount: Interlocked.Read(in textFrameRunCount),
        textFrameRecordCount: Interlocked.Read(in textFrameRecordCount),
        textFrameByteCount: Interlocked.Read(in textFrameByteCount),
        textFrameCapacity: Interlocked.Read(in textFrameCapacity),
        textFrameBufferGeneration: Interlocked.Read(in textFrameBufferGeneration),
        textFrameTopologyKey: Interlocked.Read(in textFrameTopologyKey),
        textFrameLastUseSerial: Interlocked.Read(in textFrameLastUseSerial),
        textFramePrepared: Interlocked.CompareExchange(ref textFramePrepared, 0u, 0u),
        textLayoutCacheBytes: Interlocked.Read(in textLayoutCacheBytes),
        textLayoutCacheEntries: Interlocked.Read(in textLayoutCacheEntries),
        textLayoutCacheHits: Interlocked.Read(in textLayoutCacheHits),
        textLayoutCacheMisses: Interlocked.Read(in textLayoutCacheMisses),
        textLayoutCacheEvictions: Interlocked.Read(in textLayoutCacheEvictions),
        textRunShapeCacheBytes: Interlocked.Read(in textRunShapeCacheBytes),
        textRunShapeCacheEntries: Interlocked.Read(in textRunShapeCacheEntries),
        textRunShapeCacheHits: Interlocked.Read(in textRunShapeCacheHits),
        textRunShapeCacheMisses: Interlocked.Read(in textRunShapeCacheMisses),
        textRunShapeCacheEvictions: Interlocked.Read(in textRunShapeCacheEvictions),
        imageEvictionCount: Interlocked.Read(in imageEvictionCount),
        imageRetirementCount: Interlocked.Read(in imageRetirementCount),
        allocatorBytes: Interlocked.Read(in allocatorBytes),
        dirtyChunkCount: Interlocked.Read(in dirtyChunkCount),
        reusedChunkCount: Interlocked.Read(in reusedChunkCount),
        uploadBytes: Interlocked.Read(in uploadBytes),
        drawCount: Interlocked.Read(in drawCount),
        pipelineChangeCount: Interlocked.Read(in pipelineChangeCount),
        descriptorChangeCount: Interlocked.Read(in descriptorChangeCount),
        passCount: Interlocked.Read(in passCount),
        barrierCount: Interlocked.Read(in barrierCount),
        damageCount: Interlocked.Read(in damageCount),
        damageArea: Interlocked.Read(in damageArea),
        surfaceRecoveryCount: Interlocked.Read(in surfaceRecoveryCount),
        deviceRecoveryCount: Interlocked.Read(in deviceRecoveryCount),
        validationErrorCount: Interlocked.Read(in validationErrorCount),
        resultCount: Interlocked.Read(in resultCount),
        resultFailureCount: Interlocked.Read(in resultFailureCount),
        layerPoolResidentBytes: Interlocked.Read(in layerPoolResidentBytes),
        layerPoolTargetCount: Interlocked.Read(in layerPoolTargetCount),
        layerPoolLeasedCount: Interlocked.Read(in layerPoolLeasedCount),
        layerPoolResolutionShift: Interlocked.Read(in layerPoolResolutionShift),
        layerPoolCreateCount: Interlocked.Read(in layerPoolCreateCount),
        layerPoolReuseCount: Interlocked.Read(in layerPoolReuseCount),
        layerPoolEvictionCount: Interlocked.Read(in layerPoolEvictionCount),
        layerPoolPressureEventCount: Interlocked.Read(in layerPoolPressureEventCount),
        layerPoolPressureFailureCount: Interlocked.Read(in layerPoolPressureFailureCount),
        layerPoolFailureCount: Interlocked.Read(in layerPoolFailureCount),
        layerPoolPassCount: Interlocked.Read(in layerPoolPassCount),
        layerPoolCompositeCount: Interlocked.Read(in layerPoolCompositeCount),
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
  internal func SetMemoryPolicy(headroom uint64, evictions uint64, retries uint64, pressure uint64) {
    Interlocked.Exchange(ref heapHeadroom, headroom)
    Interlocked.Exchange(ref memoryEvictionCount, evictions)
    Interlocked.Exchange(ref memoryAllocationRetryCount, retries)
    Interlocked.Exchange(ref memoryPressureCount, pressure)
  }
  internal func AddVulkanObjectAllocation(value uint64) { Interlocked.Add(ref vulkanObjectAllocationCount, value) }
  internal func AddVulkanDeviceMemoryAllocation(value uint64) { Interlocked.Add(ref vulkanDeviceMemoryAllocationCount, value) }
  internal func AddUploadBytes(value uint64) { Interlocked.Add(ref uploadBytes, value) }
  internal func SetImageResidentBytes(value uint64) {
    Interlocked.Exchange(ref imageResidentBytes, value)
  }
  internal func SetImageLiveObjectCount(value uint64) {
    Interlocked.Exchange(ref imageLiveObjectCount, value)
  }
  internal func SetImagePeakResidentBytes(value uint64) {
    while true {
      let current = Interlocked.Read(in imagePeakResidentBytes)
      if value <= current || Interlocked.CompareExchange(ref imagePeakResidentBytes, value, current) == current {
        return
      }
    }
  }
  internal func SetImagePeakLiveObjectCount(value uint64) {
    while true {
      let current = Interlocked.Read(in imagePeakLiveObjectCount)
      if value <= current || Interlocked.CompareExchange(ref imagePeakLiveObjectCount, value, current) == current {
        return
      }
    }
  }
  internal func SetTextAtlasCount(value uint64) {
    Interlocked.Exchange(ref textAtlasCount, value)
  }
  internal func SetTextAtlasResidentBytes(value uint64) {
    Interlocked.Exchange(ref textAtlasResidentBytes, value)
  }
  internal func SetTextAtlasLiveObjectCount(value uint64) {
    Interlocked.Exchange(ref textAtlasLiveObjectCount, value)
  }
  internal func SetTextAtlasPeakCount(value uint64) {
    while true {
      let current = Interlocked.Read(in textAtlasPeakCount)
      if value <= current || Interlocked.CompareExchange(ref textAtlasPeakCount, value, current) == current {
        return
      }
    }
  }
  internal func SetTextAtlasPeakResidentBytes(value uint64) {
    while true {
      let current = Interlocked.Read(in textAtlasPeakResidentBytes)
      if value <= current || Interlocked.CompareExchange(ref textAtlasPeakResidentBytes, value, current) == current {
        return
      }
    }
  }
  internal func SetTextAtlasPeakLiveObjectCount(value uint64) {
    while true {
      let current = Interlocked.Read(in textAtlasPeakLiveObjectCount)
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
  internal func SetTextCacheStats(layoutStats TextCacheStats, runStats TextCacheStats) {
    Interlocked.Exchange(ref textLayoutCacheBytes, uint64(layoutStats.Bytes < 0L ? 0L : layoutStats.Bytes))
    Interlocked.Exchange(ref textLayoutCacheEntries, uint64(layoutStats.Entries < 0 ? 0 : layoutStats.Entries))
    Interlocked.Exchange(ref textLayoutCacheHits, uint64(layoutStats.Hits < 0L ? 0L : layoutStats.Hits))
    Interlocked.Exchange(ref textLayoutCacheMisses, uint64(layoutStats.Misses < 0L ? 0L : layoutStats.Misses))
    Interlocked.Exchange(ref textLayoutCacheEvictions, uint64(layoutStats.Evictions < 0L ? 0L : layoutStats.Evictions))
    Interlocked.Exchange(ref textRunShapeCacheBytes, uint64(runStats.Bytes < 0L ? 0L : runStats.Bytes))
    Interlocked.Exchange(ref textRunShapeCacheEntries, uint64(runStats.Entries < 0 ? 0 : runStats.Entries))
    Interlocked.Exchange(ref textRunShapeCacheHits, uint64(runStats.Hits < 0L ? 0L : runStats.Hits))
    Interlocked.Exchange(ref textRunShapeCacheMisses, uint64(runStats.Misses < 0L ? 0L : runStats.Misses))
    Interlocked.Exchange(ref textRunShapeCacheEvictions, uint64(runStats.Evictions < 0L ? 0L : runStats.Evictions))
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
  internal func AddImagePressureFailure(value uint64) { Interlocked.Add(ref imagePressureFailureCount, value) }
  internal func AddTextAtlasPressureFailure(value uint64) { Interlocked.Add(ref textAtlasPressureFailureCount, value) }
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
  internal func SetLayerPoolResidentBytes(value uint64) { Interlocked.Exchange(ref layerPoolResidentBytes, value) }
  internal func SetLayerPoolTargetCount(value uint64) { Interlocked.Exchange(ref layerPoolTargetCount, value) }
  internal func SetLayerPoolLeasedCount(value uint64) { Interlocked.Exchange(ref layerPoolLeasedCount, value) }
  internal func SetLayerPoolResolutionShift(value uint64) { Interlocked.Exchange(ref layerPoolResolutionShift, value) }
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
      let current = Interlocked.Read(in vulkanObjectCount)
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
      let current = Interlocked.Read(in vulkanDeviceMemoryBytes)
      let next = if value >= current { 0uL } else { current - value }
      if Interlocked.CompareExchange(ref vulkanDeviceMemoryBytes, next, current) == current {
        return
      }
    }
  }
}
