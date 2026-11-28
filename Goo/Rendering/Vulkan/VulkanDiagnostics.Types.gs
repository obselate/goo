package Goo

internal class VulkanDiagnosticEventIds {
  shared {
    const None uint64 = 0uL
    const RuntimeStart uint64 = 1uL
    const RuntimeInstance uint64 = 2uL
    const RuntimeDevice uint64 = 3uL
    const RuntimeDeviceLost uint64 = 4uL
    const RuntimeRecovery uint64 = 5uL
    const WindowCreate uint64 = 100uL
    const WindowDestroy uint64 = 101uL
    const SurfaceCreate uint64 = 110uL
    const SwapchainCreate uint64 = 120uL
    const SwapchainDestroy uint64 = 121uL
    const SwapchainAcquire uint64 = 122uL
    const SwapchainPresent uint64 = 123uL
    const ResourceCreate uint64 = 200uL
    const ResourceUpload uint64 = 201uL
    const ResourceRetire uint64 = 202uL
    const ResourceEvict uint64 = 203uL
    const PipelineCreate uint64 = 220uL
    const PipelineDestroy uint64 = 221uL
    const FrameBegin uint64 = 300uL
    const FrameEnd uint64 = 301uL
    const EventWait uint64 = 310uL
    const StatePropagation uint64 = 311uL
    const Reconciliation uint64 = 312uL
    const Layout uint64 = 313uL
    const PlanCompile uint64 = 314uL
    const DamageBuild uint64 = 315uL
    const UploadStage uint64 = 316uL
    const CommandRecord uint64 = 317uL
    const MainPass uint64 = 318uL
    const EffectsPass uint64 = 319uL
    const OffscreenPass uint64 = 320uL
    const Submit uint64 = 321uL
    const PresentWait uint64 = 322uL
    const Readback uint64 = 323uL
    const GpuTimestamp uint64 = 324uL
    const SceneUnsupported uint64 = 325uL
    const SceneUnsupportedDropped uint64 = 326uL
    const LayerPass uint64 = 327uL
    const LayerComposite uint64 = 328uL
    const LayerCreate uint64 = 329uL
    const LayerReuse uint64 = 330uL
    const LayerEvict uint64 = 331uL
    const LayerPressure uint64 = 332uL
    const LayerFailure uint64 = 333uL
    const LayerCommandReuse uint64 = 334uL
    const ClipMaskPressure uint64 = 335uL
    const GpuFrame uint64 = 336uL
    const ClipPass uint64 = 337uL
    const PrimitiveUploadStage uint64 = 338uL
    const ImagePressure uint64 = 339uL
    const VulkanResult uint64 = 400uL
    const ValidationMessage uint64 = 401uL
    const FatalSnapshot uint64 = 402uL
    const StartupOrigin uint64 = 500uL
    const SdlWindowCreate uint64 = 501uL
    const VulkanLibrary uint64 = 502uL
    const SharedResources uint64 = 503uL
    const PipelineCacheLoad uint64 = 504uL
    const PerWindowRenderer uint64 = 505uL
    const FirstSceneCompile uint64 = 506uL
    const FirstSubmit uint64 = 507uL
    const FirstSuccessfulPresent uint64 = 508uL
    const LiveMemory uint64 = 509uL
  }
}

internal class VulkanDiagnosticCategories {
  shared {
    const Runtime uint64 = 1uL
    const Window uint64 = 2uL
    const Allocator uint64 = 3uL
    const Resource uint64 = 4uL
    const Pipeline uint64 = 5uL
    const FramePlan uint64 = 6uL
    const Text uint64 = 7uL
    const Image uint64 = 8uL
    const Path uint64 = 9uL
    const Recovery uint64 = 10uL
    const Timing uint64 = 11uL
    const Result uint64 = 12uL
    const Validation uint64 = 13uL
    const Fatal uint64 = 14uL
  }
}

internal data struct VulkanDiagnosticTraceRecord {
  var run uint64
  var workload uint64
  var process uint64
  var window uint64
  var frame uint64
  var sample uint64
  var queue uint64
  var submission uint64
  var fence uint64
  var query uint64
  var eventId uint64
  var category uint64
  var severity uint64
  var result int32
  var value0 uint64
  var value1 uint64
  var requestedWidth uint32
  var requestedHeight uint32
}

internal data struct VulkanDiagnosticResultRecord {
  var ordinal uint64
  var eventId uint64
  var classification uint32
  var frame uint64
  var queue uint64
  var submission uint64
  var fence uint64
  var result int32
}

internal data struct VulkanDiagnosticValidationRecord {
  var severity uint32
  var types uint32
  var messageId int32
  var messageHash uint32
  var messageLength uint32
  var messageOffset uint32
  var messageTruncated uint32
}

internal enum VulkanCounterId {
  RebuildCount;
  LayoutCount;
  PlanCompileCount;
  UploadCount;
  RecordCount;
  SubmitCount;
  PresentCount;
  ReadbackCount;
  ManagedAllocatedBytes;
  HeapBudgetAvailable;
  HeapBudgetSampleCurrent;
  HeapBudget;
  DriverHeapUsage;
  HeapHeadroom;
  MemoryEvictionCount;
  MemoryAllocationRetryCount;
  MemoryPressureCount;
  VulkanObjectCount;
  VulkanObjectAllocationCount;
  VulkanDeviceMemoryAllocationCount;
  VulkanDeviceMemoryBytes;
  CacheBytes;
  ImageResidentBytes;
  ImageLiveObjectCount;
  ImagePeakResidentBytes;
  ImagePeakLiveObjectCount;
  ImageUploadChunkCount;
  ImageUploadDeferredCount;
  ImageUploadCompletedCount;
  ImagePressureFailureCount;
  TextAtlasPressureFailureCount;
  TextAtlasCount;
  TextAtlasResidentBytes;
  TextAtlasLiveObjectCount;
  TextAtlasPeakCount;
  TextAtlasPeakResidentBytes;
  TextAtlasPeakLiveObjectCount;
  TextAtlasRecordedUploadBytes;
  TextAtlasEvictionCount;
  TextAtlasRetirementCount;
  PathAtlasByteBudget;
  PathAtlasResidentWords;
  PathAtlasFreeWords;
  PathAtlasPathCount;
  PathAtlasActiveReferenceCount;
  PathAtlasLiveObjectCount;
  PathAtlasEvictionCount;
  PathAtlasRetiredWords;
  PathAtlasReuseCount;
  PathAtlasPressureEventCount;
  PathAtlasPressureFailureCount;
  ClipMaskAtlasByteBudget;
  ClipMaskAtlasResidentBytes;
  ClipMaskAtlasRegionCount;
  ClipMaskAtlasFreePlacementCount;
  ClipMaskAtlasActiveLayerCount;
  ClipMaskAtlasMaximumLayerCount;
  ClipMaskAtlasRetiredGenerationCount;
  ClipMaskAtlasEvictionCount;
  ClipMaskAtlasPressureEventCount;
  ClipMaskAtlasPressureFailureCount;
  ClipFrameWrittenBytes;
  ClipFrameSkippedBytes;
  ClipFrameMappedWrites;
  ClipFrameFlushes;
  ClipFrameRetainedReuse;
  ClipFrameSlotIndex;
  ClipFrameDrawCount;
  ClipFrameMaskCount;
  ClipFrameChainCount;
  ClipFrameLayerCount;
  ClipFrameByteCount;
  ClipFrameCapacity;
  ClipFrameBufferGeneration;
  ClipFrameLastUseSerial;
  ClipFrameRetentionEligible;
  ClipFrameRetained;
  ClipFrameRetentionValid;
  TextFrameWrittenBytes;
  TextFrameSkippedBytes;
  TextFrameDirtySegmentCount;
  TextFrameUploadRangeCount;
  TextFrameFullUploadCount;
  TextFrameMappedWrites;
  TextFrameFlushes;
  TextFrameRetainedReuse;
  TextFrameSlotIndex;
  TextFrameSegmentCount;
  TextFrameRunCount;
  TextFrameRecordCount;
  TextFrameByteCount;
  TextFrameCapacity;
  TextFrameBufferGeneration;
  TextFrameTopologyKey;
  TextFrameLastUseSerial;
  TextFramePrepared;
  TextLayoutCacheBytes;
  TextLayoutCacheEntries;
  TextLayoutCacheHits;
  TextLayoutCacheMisses;
  TextLayoutCacheEvictions;
  TextRunShapeCacheBytes;
  TextRunShapeCacheEntries;
  TextRunShapeCacheHits;
  TextRunShapeCacheMisses;
  TextRunShapeCacheEvictions;
  ImageEvictionCount;
  ImageRetirementCount;
  AllocatorBytes;
  DirtyChunkCount;
  ReusedChunkCount;
  UploadBytes;
  DrawCount;
  PipelineChangeCount;
  DescriptorChangeCount;
  PassCount;
  BarrierCount;
  DamageCount;
  DamageArea;
  SurfaceRecoveryCount;
  DeviceRecoveryCount;
  ValidationErrorCount;
  ResultCount;
  ResultFailureCount;
  LayerPoolResidentBytes;
  LayerPoolTargetCount;
  LayerPoolLeasedCount;
  LayerPoolResolutionShift;
  LayerPoolCreateCount;
  LayerPoolReuseCount;
  LayerPoolEvictionCount;
  LayerPoolPressureEventCount;
  LayerPoolPressureFailureCount;
  LayerPoolFailureCount;
  LayerPoolPassCount;
  LayerPoolCompositeCount;
  Count;
}

internal data struct VulkanDiagnosticCounterSnapshot {
  private let values [] ? uint64

  internal init(values [] ? uint64 = nil) {
    this.values = values
  }

  internal prop this[id VulkanCounterId] uint64{
    get -> if let arr = values { arr[int32(id)] } else { 0uL }
  }
}

internal data struct VulkanDiagnosticLiveSnapshot {
  var eventId uint64
  var ticks uint64
  var managedAllocatedBytes uint64
  var privateBytes uint64
  var workingSetBytes uint64
  var vulkanObjectCount uint64
  var vulkanDeviceMemoryBytes uint64
  var heapAllocated uint64
  var driverHeapUsage uint64
  var heapBudget uint64
  var allocatorBytes uint64
  var cacheBytes uint64
}

internal data struct VulkanDiagnosticTextAtlasContribution {
  var Id uint64
  var AtlasCount uint64
  var ResidentBytes uint64
  var LiveObjectCount uint64
}

internal data struct VulkanDiagnosticFatalSnapshot {
  var captured bool
  var code int32
  var value uint64
  var traceAtCapture uint64
  var validationAtCapture uint64
  var resultAtCapture uint64
  var instanceApiVersion uint32
  var physicalApiVersion uint32
  var driverVersion uint32
  var vendorId uint32
  var deviceId uint32
  var deviceType int32
  var timelineSemaphore uint32
  var synchronization2 uint32
  var dynamicRendering uint32
  var debugUtilsAvailable uint32
  var instanceExtensionCount uint32
  var deviceExtensionCount uint32
  var window uint64
  var surface uint64
  var swapchain uint64
  var frame uint64
  var generation uint64
  var heapBudgetAvailable uint32
  var heapBudgetSampleCurrent uint32
  var heapBudget uint64
  var driverHeapUsage uint64
  var heapAllocated uint64
  var retiredBytes uint64
  var liveObjects uint64
  var lastSubmission uint64
  var lastQueue uint64
  var lastFence uint64
  var lastResultEvent uint64
  var lastResult int32
  var counters VulkanDiagnosticCounterSnapshot
}
