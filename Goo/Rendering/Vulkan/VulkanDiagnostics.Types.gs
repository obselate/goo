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
    const SurfaceDestroy uint64 = 111uL
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
    const DescriptorUpdate uint64 = 230uL
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

internal data struct VulkanDiagnosticFatalExtensionRecord {
  var extensionKind uint32
  var hash uint32
  var length uint32
  var offset uint32
  var truncated uint32
}

internal data struct VulkanDiagnosticCounterSnapshot {
  var rebuildCount uint64
  var layoutCount uint64
  var planCompileCount uint64
  var uploadCount uint64
  var recordCount uint64
  var submitCount uint64
  var presentCount uint64
  var readbackCount uint64
  var managedAllocatedBytes uint64
  var heapBudgetAvailable uint32
  var heapBudgetSampleCurrent uint32
  var heapBudget uint64
  var driverHeapUsage uint64
  var vulkanObjectCount uint64
  var vulkanObjectAllocationCount uint64
  var vulkanDeviceMemoryAllocationCount uint64
  var vulkanDeviceMemoryBytes uint64
  var cacheBytes uint64
  var imageByteBudget uint64
  var imageResidentBytes uint64
  var imageLiveObjectCount uint64
  var imagePeakResidentBytes uint64
  var imagePeakLiveObjectCount uint64
  var imageUploadChunkCount uint64
  var imageUploadDeferredCount uint64
  var imageUploadCompletedCount uint64
  var textAtlasCount uint64
  var textAtlasByteBudget uint64
  var textAtlasResidentBytes uint64
  var textAtlasLiveObjectCount uint64
  var textAtlasPeakCount uint64
  var textAtlasPeakByteBudget uint64
  var textAtlasPeakResidentBytes uint64
  var textAtlasPeakLiveObjectCount uint64
  var textAtlasRecordedUploadBytes uint64
  var textAtlasEvictionCount uint64
  var textAtlasRetirementCount uint64
  var pathAtlasByteBudget uint64
  var pathAtlasResidentWords uint64
  var pathAtlasFreeWords uint64
  var pathAtlasPathCount uint64
  var pathAtlasActiveReferenceCount uint64
  var pathAtlasLiveObjectCount uint64
  var pathAtlasEvictionCount uint64
  var pathAtlasRetiredWords uint64
  var pathAtlasReuseCount uint64
  var pathAtlasPressureEventCount uint64
  var pathAtlasPressureFailureCount uint64
  var clipMaskAtlasByteBudget uint64
  var clipMaskAtlasResidentBytes uint64
  var clipMaskAtlasRegionCount uint64
  var clipMaskAtlasFreePlacementCount uint64
  var clipMaskAtlasActiveLayerCount uint64
  var clipMaskAtlasMaximumLayerCount uint64
  var clipMaskAtlasRetiredGenerationCount uint64
  var clipMaskAtlasEvictionCount uint64
  var clipMaskAtlasPressureEventCount uint64
  var clipMaskAtlasPressureFailureCount uint64
  var clipFrameWrittenBytes uint64
  var clipFrameSkippedBytes uint64
  var clipFrameMappedWrites uint64
  var clipFrameFlushes uint64
  var clipFrameRetainedReuse uint64
  var clipFrameSlotIndex uint64
  var clipFrameDrawCount uint64
  var clipFrameMaskCount uint64
  var clipFrameChainCount uint64
  var clipFrameLayerCount uint64
  var clipFrameByteCount uint64
  var clipFrameCapacity uint64
  var clipFrameBufferGeneration uint64
  var clipFrameLastUseSerial uint64
  var clipFrameRetentionEligible uint32
  var clipFrameRetained uint32
  var clipFrameRetentionValid uint32
  var textFrameWrittenBytes uint64
  var textFrameSkippedBytes uint64
  var textFrameDirtySegmentCount uint64
  var textFrameUploadRangeCount uint64
  var textFrameFullUploadCount uint64
  var textFrameMappedWrites uint64
  var textFrameFlushes uint64
  var textFrameRetainedReuse uint64
  var textFrameSlotIndex uint64
  var textFrameSegmentCount uint64
  var textFrameRunCount uint64
  var textFrameRecordCount uint64
  var textFrameByteCount uint64
  var textFrameCapacity uint64
  var textFrameBufferGeneration uint64
  var textFrameTopologyKey uint64
  var textFrameLastUseSerial uint64
  var textFramePrepared uint32
  var imageEvictionCount uint64
  var imageRetirementCount uint64
  var allocatorBytes uint64
  var dirtyChunkCount uint64
  var reusedChunkCount uint64
  var uploadBytes uint64
  var drawCount uint64
  var pipelineChangeCount uint64
  var descriptorChangeCount uint64
  var passCount uint64
  var barrierCount uint64
  var damageCount uint64
  var damageArea uint64
  var surfaceRecoveryCount uint64
  var deviceRecoveryCount uint64
  var validationErrorCount uint64
  var resultCount uint64
  var resultFailureCount uint64
  var layerPoolByteBudget uint64
  var layerPoolResidentBytes uint64
  var layerPoolTargetCount uint64
  var layerPoolLeasedCount uint64
  var layerPoolCreateCount uint64
  var layerPoolReuseCount uint64
  var layerPoolEvictionCount uint64
  var layerPoolPressureEventCount uint64
  var layerPoolPressureFailureCount uint64
  var layerPoolFailureCount uint64
  var layerPoolPassCount uint64
  var layerPoolCompositeCount uint64
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
  var ByteBudget uint64
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
  var extensionCount uint32
  var extensionDropped uint32
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
