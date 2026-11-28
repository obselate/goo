package Goo

import System
import System.IO
import System.Text
import System.Text.Json

internal data struct VulkanCounterField(Id VulkanCounterId, JsonName string) { }

internal unsafe partial class VulkanDiagnostics {
  shared {
    private let FatalCounterFields []VulkanCounterField = []VulkanCounterField{
      VulkanCounterField(VulkanCounterId.RebuildCount, "rebuildCount"),
      VulkanCounterField(VulkanCounterId.LayoutCount, "layoutCount"),
      VulkanCounterField(VulkanCounterId.PlanCompileCount, "planCompileCount"),
      VulkanCounterField(VulkanCounterId.UploadCount, "uploadCount"),
      VulkanCounterField(VulkanCounterId.RecordCount, "recordCount"),
      VulkanCounterField(VulkanCounterId.SubmitCount, "submitCount"),
      VulkanCounterField(VulkanCounterId.PresentCount, "presentCount"),
      VulkanCounterField(VulkanCounterId.ReadbackCount, "readbackCount"),
      VulkanCounterField(VulkanCounterId.ManagedAllocatedBytes, "managedAllocatedBytes"),
      VulkanCounterField(VulkanCounterId.VulkanObjectCount, "vulkanObjectCount"),
      VulkanCounterField(VulkanCounterId.VulkanObjectAllocationCount, "vulkanObjectAllocationCount"),
      VulkanCounterField(VulkanCounterId.VulkanDeviceMemoryAllocationCount, "vulkanDeviceMemoryAllocationCount"),
      VulkanCounterField(VulkanCounterId.VulkanDeviceMemoryBytes, "vulkanDeviceMemoryBytes"),
      VulkanCounterField(VulkanCounterId.CacheBytes, "cacheBytes"),
      VulkanCounterField(VulkanCounterId.ImageResidentBytes, "imageResidentBytes"),
      VulkanCounterField(VulkanCounterId.ImageLiveObjectCount, "imageLiveObjectCount"),
      VulkanCounterField(VulkanCounterId.ImagePeakResidentBytes, "imagePeakResidentBytes"),
      VulkanCounterField(VulkanCounterId.ImagePeakLiveObjectCount, "imagePeakLiveObjectCount"),
      VulkanCounterField(VulkanCounterId.TextAtlasCount, "textAtlasCount"),
      VulkanCounterField(VulkanCounterId.TextAtlasResidentBytes, "textAtlasResidentBytes"),
      VulkanCounterField(VulkanCounterId.TextAtlasPeakCount, "textAtlasPeakCount"),
      VulkanCounterField(VulkanCounterId.TextAtlasPeakResidentBytes, "textAtlasPeakResidentBytes"),
      VulkanCounterField(VulkanCounterId.TextAtlasPeakLiveObjectCount, "textAtlasPeakLiveObjectCount"),
      VulkanCounterField(VulkanCounterId.TextAtlasRecordedUploadBytes, "textAtlasRecordedUploadBytes"),
      VulkanCounterField(VulkanCounterId.TextAtlasEvictionCount, "textAtlasEvictionCount"),
      VulkanCounterField(VulkanCounterId.TextAtlasRetirementCount, "textAtlasRetirementCount"),
      VulkanCounterField(VulkanCounterId.PathAtlasByteBudget, "pathAtlasByteBudget"),
      VulkanCounterField(VulkanCounterId.PathAtlasResidentWords, "pathAtlasResidentWords"),
      VulkanCounterField(VulkanCounterId.PathAtlasFreeWords, "pathAtlasFreeWords"),
      VulkanCounterField(VulkanCounterId.PathAtlasPathCount, "pathAtlasPathCount"),
      VulkanCounterField(VulkanCounterId.PathAtlasActiveReferenceCount, "pathAtlasActiveReferenceCount"),
      VulkanCounterField(VulkanCounterId.PathAtlasLiveObjectCount, "pathAtlasLiveObjectCount"),
      VulkanCounterField(VulkanCounterId.PathAtlasEvictionCount, "pathAtlasEvictionCount"),
      VulkanCounterField(VulkanCounterId.PathAtlasRetiredWords, "pathAtlasRetiredWords"),
      VulkanCounterField(VulkanCounterId.PathAtlasReuseCount, "pathAtlasReuseCount"),
      VulkanCounterField(VulkanCounterId.PathAtlasPressureEventCount, "pathAtlasPressureEventCount"),
      VulkanCounterField(VulkanCounterId.PathAtlasPressureFailureCount, "pathAtlasPressureFailureCount"),
      VulkanCounterField(VulkanCounterId.ClipFrameWrittenBytes, "clipFrameWrittenBytes"),
      VulkanCounterField(VulkanCounterId.ClipFrameSkippedBytes, "clipFrameSkippedBytes"),
      VulkanCounterField(VulkanCounterId.ClipFrameMappedWrites, "clipFrameMappedWrites"),
      VulkanCounterField(VulkanCounterId.ClipFrameFlushes, "clipFrameFlushes"),
      VulkanCounterField(VulkanCounterId.ClipFrameRetainedReuse, "clipFrameRetainedReuse"),
      VulkanCounterField(VulkanCounterId.ClipFrameSlotIndex, "clipFrameSlotIndex"),
      VulkanCounterField(VulkanCounterId.ClipFrameDrawCount, "clipFrameDrawCount"),
      VulkanCounterField(VulkanCounterId.ClipFrameMaskCount, "clipFrameMaskCount"),
      VulkanCounterField(VulkanCounterId.ClipFrameChainCount, "clipFrameChainCount"),
      VulkanCounterField(VulkanCounterId.ClipFrameLayerCount, "clipFrameLayerCount"),
      VulkanCounterField(VulkanCounterId.ClipFrameByteCount, "clipFrameByteCount"),
      VulkanCounterField(VulkanCounterId.ClipFrameCapacity, "clipFrameCapacity"),
      VulkanCounterField(VulkanCounterId.ClipFrameBufferGeneration, "clipFrameBufferGeneration"),
      VulkanCounterField(VulkanCounterId.ClipFrameLastUseSerial, "clipFrameLastUseSerial"),
      VulkanCounterField(VulkanCounterId.ClipFrameRetentionEligible, "clipFrameRetentionEligible"),
      VulkanCounterField(VulkanCounterId.ClipFrameRetained, "clipFrameRetained"),
      VulkanCounterField(VulkanCounterId.ClipFrameRetentionValid, "clipFrameRetentionValid"),
      VulkanCounterField(VulkanCounterId.LayerPoolResidentBytes, "layerPoolResidentBytes"),
      VulkanCounterField(VulkanCounterId.LayerPoolTargetCount, "layerPoolTargetCount"),
      VulkanCounterField(VulkanCounterId.LayerPoolLeasedCount, "layerPoolLeasedCount"),
      VulkanCounterField(VulkanCounterId.LayerPoolResolutionShift, "layerPoolResolutionShift"),
      VulkanCounterField(VulkanCounterId.LayerPoolCreateCount, "layerPoolCreateCount"),
      VulkanCounterField(VulkanCounterId.LayerPoolReuseCount, "layerPoolReuseCount"),
      VulkanCounterField(VulkanCounterId.LayerPoolEvictionCount, "layerPoolEvictionCount"),
      VulkanCounterField(VulkanCounterId.LayerPoolPressureEventCount, "layerPoolPressureEventCount"),
      VulkanCounterField(VulkanCounterId.LayerPoolPressureFailureCount, "layerPoolPressureFailureCount"),
      VulkanCounterField(VulkanCounterId.LayerPoolFailureCount, "layerPoolFailureCount"),
      VulkanCounterField(VulkanCounterId.LayerPoolPassCount, "layerPoolPassCount"),
      VulkanCounterField(VulkanCounterId.LayerPoolCompositeCount, "layerPoolCompositeCount"),
      VulkanCounterField(VulkanCounterId.ImageEvictionCount, "imageEvictionCount"),
      VulkanCounterField(VulkanCounterId.ImageRetirementCount, "imageRetirementCount"),
      VulkanCounterField(VulkanCounterId.AllocatorBytes, "allocatorBytes"),
      VulkanCounterField(VulkanCounterId.DirtyChunkCount, "dirtyChunkCount"),
      VulkanCounterField(VulkanCounterId.ReusedChunkCount, "reusedChunkCount"),
      VulkanCounterField(VulkanCounterId.UploadBytes, "uploadBytes"),
      VulkanCounterField(VulkanCounterId.DrawCount, "drawCount"),
      VulkanCounterField(VulkanCounterId.PipelineChangeCount, "pipelineChangeCount"),
      VulkanCounterField(VulkanCounterId.DescriptorChangeCount, "descriptorChangeCount"),
      VulkanCounterField(VulkanCounterId.PassCount, "passCount"),
      VulkanCounterField(VulkanCounterId.BarrierCount, "barrierCount"),
      VulkanCounterField(VulkanCounterId.DamageCount, "damageCount"),
      VulkanCounterField(VulkanCounterId.DamageArea, "damageArea"),
      VulkanCounterField(VulkanCounterId.SurfaceRecoveryCount, "surfaceRecoveryCount"),
      VulkanCounterField(VulkanCounterId.DeviceRecoveryCount, "deviceRecoveryCount"),
      VulkanCounterField(VulkanCounterId.ValidationErrorCount, "validationErrorCount"),
      VulkanCounterField(VulkanCounterId.ResultCount, "resultCount"),
      VulkanCounterField(VulkanCounterId.ResultFailureCount, "resultFailureCount"),
    }

    private let ImageUploadFields []VulkanCounterField = []VulkanCounterField{
      VulkanCounterField(VulkanCounterId.ImageUploadChunkCount, "imageUploadChunkCount"),
      VulkanCounterField(VulkanCounterId.ImageUploadDeferredCount, "imageUploadDeferredCount"),
      VulkanCounterField(VulkanCounterId.ImageUploadCompletedCount, "imageUploadCompletedCount"),
      VulkanCounterField(VulkanCounterId.ImagePressureFailureCount, "imagePressureFailureCount"),
      VulkanCounterField(VulkanCounterId.TextAtlasPressureFailureCount, "textAtlasPressureFailureCount"),
    }

    private let SnapshotCounterFields []VulkanCounterField = []VulkanCounterField{
      VulkanCounterField(VulkanCounterId.RebuildCount, "rebuildCount"),
      VulkanCounterField(VulkanCounterId.LayoutCount, "layoutCount"),
      VulkanCounterField(VulkanCounterId.PlanCompileCount, "planCompileCount"),
      VulkanCounterField(VulkanCounterId.UploadCount, "uploadCount"),
      VulkanCounterField(VulkanCounterId.RecordCount, "recordCount"),
      VulkanCounterField(VulkanCounterId.SubmitCount, "submitCount"),
      VulkanCounterField(VulkanCounterId.PresentCount, "presentCount"),
      VulkanCounterField(VulkanCounterId.ReadbackCount, "readbackCount"),
      VulkanCounterField(VulkanCounterId.ManagedAllocatedBytes, "managedAllocatedBytes"),
      VulkanCounterField(VulkanCounterId.HeapBudgetAvailable, "heapBudgetAvailable"),
      VulkanCounterField(VulkanCounterId.HeapBudgetSampleCurrent, "heapBudgetSampleCurrent"),
      VulkanCounterField(VulkanCounterId.HeapBudget, "heapBudget"),
      VulkanCounterField(VulkanCounterId.DriverHeapUsage, "driverHeapUsage"),
      VulkanCounterField(VulkanCounterId.HeapHeadroom, "heapHeadroom"),
      VulkanCounterField(VulkanCounterId.MemoryEvictionCount, "memoryEvictionCount"),
      VulkanCounterField(VulkanCounterId.MemoryAllocationRetryCount, "memoryAllocationRetryCount"),
      VulkanCounterField(VulkanCounterId.MemoryPressureCount, "memoryPressureCount"),
      VulkanCounterField(VulkanCounterId.VulkanObjectCount, "vulkanObjectCount"),
      VulkanCounterField(VulkanCounterId.VulkanObjectAllocationCount, "vulkanObjectAllocationCount"),
      VulkanCounterField(VulkanCounterId.VulkanDeviceMemoryAllocationCount, "vulkanDeviceMemoryAllocationCount"),
      VulkanCounterField(VulkanCounterId.VulkanDeviceMemoryBytes, "vulkanDeviceMemoryBytes"),
      VulkanCounterField(VulkanCounterId.CacheBytes, "cacheBytes"),
      VulkanCounterField(VulkanCounterId.ImageResidentBytes, "imageResidentBytes"),
      VulkanCounterField(VulkanCounterId.ImageLiveObjectCount, "imageLiveObjectCount"),
      VulkanCounterField(VulkanCounterId.ImagePeakResidentBytes, "imagePeakResidentBytes"),
      VulkanCounterField(VulkanCounterId.ImagePeakLiveObjectCount, "imagePeakLiveObjectCount"),
      VulkanCounterField(VulkanCounterId.TextAtlasCount, "textAtlasCount"),
      VulkanCounterField(VulkanCounterId.TextAtlasResidentBytes, "textAtlasResidentBytes"),
      VulkanCounterField(VulkanCounterId.TextAtlasLiveObjectCount, "textAtlasLiveObjectCount"),
      VulkanCounterField(VulkanCounterId.TextAtlasPeakCount, "textAtlasPeakCount"),
      VulkanCounterField(VulkanCounterId.TextAtlasPeakResidentBytes, "textAtlasPeakResidentBytes"),
      VulkanCounterField(VulkanCounterId.TextAtlasPeakLiveObjectCount, "textAtlasPeakLiveObjectCount"),
      VulkanCounterField(VulkanCounterId.TextAtlasRecordedUploadBytes, "textAtlasRecordedUploadBytes"),
      VulkanCounterField(VulkanCounterId.TextAtlasEvictionCount, "textAtlasEvictionCount"),
      VulkanCounterField(VulkanCounterId.TextAtlasRetirementCount, "textAtlasRetirementCount"),
      VulkanCounterField(VulkanCounterId.PathAtlasByteBudget, "pathAtlasByteBudget"),
      VulkanCounterField(VulkanCounterId.PathAtlasResidentWords, "pathAtlasResidentWords"),
      VulkanCounterField(VulkanCounterId.PathAtlasFreeWords, "pathAtlasFreeWords"),
      VulkanCounterField(VulkanCounterId.PathAtlasPathCount, "pathAtlasPathCount"),
      VulkanCounterField(VulkanCounterId.PathAtlasActiveReferenceCount, "pathAtlasActiveReferenceCount"),
      VulkanCounterField(VulkanCounterId.PathAtlasLiveObjectCount, "pathAtlasLiveObjectCount"),
      VulkanCounterField(VulkanCounterId.PathAtlasEvictionCount, "pathAtlasEvictionCount"),
      VulkanCounterField(VulkanCounterId.PathAtlasRetiredWords, "pathAtlasRetiredWords"),
      VulkanCounterField(VulkanCounterId.PathAtlasReuseCount, "pathAtlasReuseCount"),
      VulkanCounterField(VulkanCounterId.PathAtlasPressureEventCount, "pathAtlasPressureEventCount"),
      VulkanCounterField(VulkanCounterId.PathAtlasPressureFailureCount, "pathAtlasPressureFailureCount"),
      VulkanCounterField(VulkanCounterId.ClipFrameWrittenBytes, "clipFrameWrittenBytes"),
      VulkanCounterField(VulkanCounterId.ClipFrameSkippedBytes, "clipFrameSkippedBytes"),
      VulkanCounterField(VulkanCounterId.ClipFrameMappedWrites, "clipFrameMappedWrites"),
      VulkanCounterField(VulkanCounterId.ClipFrameFlushes, "clipFrameFlushes"),
      VulkanCounterField(VulkanCounterId.ClipFrameRetainedReuse, "clipFrameRetainedReuse"),
      VulkanCounterField(VulkanCounterId.ClipFrameSlotIndex, "clipFrameSlotIndex"),
      VulkanCounterField(VulkanCounterId.ClipFrameDrawCount, "clipFrameDrawCount"),
      VulkanCounterField(VulkanCounterId.ClipFrameMaskCount, "clipFrameMaskCount"),
      VulkanCounterField(VulkanCounterId.ClipFrameChainCount, "clipFrameChainCount"),
      VulkanCounterField(VulkanCounterId.ClipFrameLayerCount, "clipFrameLayerCount"),
      VulkanCounterField(VulkanCounterId.ClipFrameByteCount, "clipFrameByteCount"),
      VulkanCounterField(VulkanCounterId.ClipFrameCapacity, "clipFrameCapacity"),
      VulkanCounterField(VulkanCounterId.ClipFrameBufferGeneration, "clipFrameBufferGeneration"),
      VulkanCounterField(VulkanCounterId.ClipFrameLastUseSerial, "clipFrameLastUseSerial"),
      VulkanCounterField(VulkanCounterId.ClipFrameRetentionEligible, "clipFrameRetentionEligible"),
      VulkanCounterField(VulkanCounterId.ClipFrameRetained, "clipFrameRetained"),
      VulkanCounterField(VulkanCounterId.ClipFrameRetentionValid, "clipFrameRetentionValid"),
      VulkanCounterField(VulkanCounterId.TextFrameWrittenBytes, "textFrameWrittenBytes"),
      VulkanCounterField(VulkanCounterId.TextFrameSkippedBytes, "textFrameSkippedBytes"),
      VulkanCounterField(VulkanCounterId.TextFrameDirtySegmentCount, "textFrameDirtySegmentCount"),
      VulkanCounterField(VulkanCounterId.TextFrameUploadRangeCount, "textFrameUploadRangeCount"),
      VulkanCounterField(VulkanCounterId.TextFrameFullUploadCount, "textFrameFullUploadCount"),
      VulkanCounterField(VulkanCounterId.TextFrameMappedWrites, "textFrameMappedWrites"),
      VulkanCounterField(VulkanCounterId.TextFrameFlushes, "textFrameFlushes"),
      VulkanCounterField(VulkanCounterId.TextFrameRetainedReuse, "textFrameRetainedReuse"),
      VulkanCounterField(VulkanCounterId.TextFrameSlotIndex, "textFrameSlotIndex"),
      VulkanCounterField(VulkanCounterId.TextFrameSegmentCount, "textFrameSegmentCount"),
      VulkanCounterField(VulkanCounterId.TextFrameRunCount, "textFrameRunCount"),
      VulkanCounterField(VulkanCounterId.TextFrameRecordCount, "textFrameRecordCount"),
      VulkanCounterField(VulkanCounterId.TextFrameByteCount, "textFrameByteCount"),
      VulkanCounterField(VulkanCounterId.TextFrameCapacity, "textFrameCapacity"),
      VulkanCounterField(VulkanCounterId.TextFrameBufferGeneration, "textFrameBufferGeneration"),
      VulkanCounterField(VulkanCounterId.TextFrameTopologyKey, "textFrameTopologyKey"),
      VulkanCounterField(VulkanCounterId.TextFrameLastUseSerial, "textFrameLastUseSerial"),
      VulkanCounterField(VulkanCounterId.TextFramePrepared, "textFramePrepared"),
      VulkanCounterField(VulkanCounterId.TextLayoutCacheBytes, "textLayoutCacheBytes"),
      VulkanCounterField(VulkanCounterId.TextLayoutCacheEntries, "textLayoutCacheEntries"),
      VulkanCounterField(VulkanCounterId.TextLayoutCacheHits, "textLayoutCacheHits"),
      VulkanCounterField(VulkanCounterId.TextLayoutCacheMisses, "textLayoutCacheMisses"),
      VulkanCounterField(VulkanCounterId.TextLayoutCacheEvictions, "textLayoutCacheEvictions"),
      VulkanCounterField(VulkanCounterId.TextRunShapeCacheBytes, "textRunShapeCacheBytes"),
      VulkanCounterField(VulkanCounterId.TextRunShapeCacheEntries, "textRunShapeCacheEntries"),
      VulkanCounterField(VulkanCounterId.TextRunShapeCacheHits, "textRunShapeCacheHits"),
      VulkanCounterField(VulkanCounterId.TextRunShapeCacheMisses, "textRunShapeCacheMisses"),
      VulkanCounterField(VulkanCounterId.TextRunShapeCacheEvictions, "textRunShapeCacheEvictions"),
      VulkanCounterField(VulkanCounterId.LayerPoolResidentBytes, "layerPoolResidentBytes"),
      VulkanCounterField(VulkanCounterId.LayerPoolTargetCount, "layerPoolTargetCount"),
      VulkanCounterField(VulkanCounterId.LayerPoolLeasedCount, "layerPoolLeasedCount"),
      VulkanCounterField(VulkanCounterId.LayerPoolCreateCount, "layerPoolCreateCount"),
      VulkanCounterField(VulkanCounterId.LayerPoolReuseCount, "layerPoolReuseCount"),
      VulkanCounterField(VulkanCounterId.LayerPoolEvictionCount, "layerPoolEvictionCount"),
      VulkanCounterField(VulkanCounterId.LayerPoolPressureEventCount, "layerPoolPressureEventCount"),
      VulkanCounterField(VulkanCounterId.LayerPoolPressureFailureCount, "layerPoolPressureFailureCount"),
      VulkanCounterField(VulkanCounterId.LayerPoolFailureCount, "layerPoolFailureCount"),
      VulkanCounterField(VulkanCounterId.LayerPoolPassCount, "layerPoolPassCount"),
      VulkanCounterField(VulkanCounterId.LayerPoolCompositeCount, "layerPoolCompositeCount"),
      VulkanCounterField(VulkanCounterId.ImageEvictionCount, "imageEvictionCount"),
      VulkanCounterField(VulkanCounterId.ImageRetirementCount, "imageRetirementCount"),
      VulkanCounterField(VulkanCounterId.AllocatorBytes, "allocatorBytes"),
      VulkanCounterField(VulkanCounterId.DirtyChunkCount, "dirtyChunkCount"),
      VulkanCounterField(VulkanCounterId.ReusedChunkCount, "reusedChunkCount"),
      VulkanCounterField(VulkanCounterId.UploadBytes, "uploadBytes"),
      VulkanCounterField(VulkanCounterId.DrawCount, "drawCount"),
      VulkanCounterField(VulkanCounterId.PipelineChangeCount, "pipelineChangeCount"),
      VulkanCounterField(VulkanCounterId.DescriptorChangeCount, "descriptorChangeCount"),
      VulkanCounterField(VulkanCounterId.PassCount, "passCount"),
      VulkanCounterField(VulkanCounterId.BarrierCount, "barrierCount"),
      VulkanCounterField(VulkanCounterId.DamageCount, "damageCount"),
      VulkanCounterField(VulkanCounterId.DamageArea, "damageArea"),
      VulkanCounterField(VulkanCounterId.SurfaceRecoveryCount, "surfaceRecoveryCount"),
      VulkanCounterField(VulkanCounterId.DeviceRecoveryCount, "deviceRecoveryCount"),
      VulkanCounterField(VulkanCounterId.ValidationErrorCount, "validationErrorCount"),
      VulkanCounterField(VulkanCounterId.ResultCount, "resultCount"),
      VulkanCounterField(VulkanCounterId.ResultFailureCount, "resultFailureCount"),
    }
  }

  internal func WriteDevice(writer TextWriter, name string = "", order string = "", rejected string = "", fallback string = "") string {
    let selection = if name == "" { "" } else {
      ",\"name\":\"" + JsonEncodedText.Encode(name).ToString()
        + "\",\"order\":\"" + JsonEncodedText.Encode(order).ToString()
        + "\",\"rejected\":\"" + JsonEncodedText.Encode(rejected).ToString()
        + "\",\"fallback\":\"" + JsonEncodedText.Encode(fallback).ToString() + "\""
    }
    let deviceName = Hex(fatalDeviceName, 0, uint32(FatalNameCapacity))
    writer.WriteLine("{\"kind\":\"device\",\"instanceApiVersion\":${fatalInstanceApiVersion},\"physicalApiVersion\":${fatalPhysicalApiVersion},\"driverVersion\":${fatalDriverVersion},\"vendorId\":${fatalVendorId},\"deviceId\":${fatalDeviceId},\"deviceType\":${fatalDeviceType},\"timelineSemaphore\":${fatalTimelineSemaphore},\"synchronization2\":${fatalSynchronization2},\"dynamicRendering\":${fatalDynamicRendering},\"debugUtilsAvailable\":${fatalDebugUtilsAvailable},\"instanceExtensionCount\":${fatalInstanceExtensionCount},\"deviceExtensionCount\":${fatalDeviceExtensionCount},\"deviceNameHex\":\"${deviceName}\"${selection}}")
    return deviceName
  }

  private func OptionalBudgetValue(available uint32, value uint64) string -> if available == 0u { "null" } else { value.ToString() }

  private func FlushLiveSnapshot(writer TextWriter, snapshot VulkanDiagnosticLiveSnapshot) {
    writer.WriteLine("{\"kind\":\"live\",\"event\":${snapshot.eventId},\"ticks\":${snapshot.ticks},\"originKind\":\"window_open\",\"originTicks\":${originTicks},\"frequency\":${originFrequency},\"managedAllocatedBytes\":${snapshot.managedAllocatedBytes},\"privateBytes\":${snapshot.privateBytes},\"workingSetBytes\":${snapshot.workingSetBytes},\"vulkanObjectCount\":${snapshot.vulkanObjectCount},\"vulkanDeviceMemoryBytes\":${snapshot.vulkanDeviceMemoryBytes},\"heapAllocated\":${snapshot.heapAllocated},\"driverHeapUsage\":${snapshot.driverHeapUsage},\"heapBudget\":${snapshot.heapBudget},\"allocatorBytes\":${snapshot.allocatorBytes},\"cacheBytes\":${snapshot.cacheBytes}}")
  }

  private func Hex(buffer [] ? uint8, offset int32, length uint32) string {
    guard let bytes = buffer else {
      return ""
    }
    let count = int32(length)
    return if count <= 0 { "" } else { Convert.ToHexStringLower(bytes, offset, count) }
  }

  private func AppendCounterFields(builder StringBuilder, snapshot VulkanDiagnosticCounterSnapshot,
    fields []VulkanCounterField, nullableBudget bool) {
      let budgetAvailable = snapshot[VulkanCounterId.HeapBudgetAvailable]
      for field in fields {
        builder.Append(",\"")
        builder.Append(field.JsonName)
        builder.Append("\":")
        if nullableBudget && (field.Id == VulkanCounterId.HeapBudget || field.Id == VulkanCounterId.DriverHeapUsage) {
          builder.Append(OptionalBudgetValue(uint32(budgetAvailable), snapshot[field.Id]))
        } else {
          builder.Append(snapshot[field.Id])
        }
      }
    }

  internal func FlushNdjson(writer TextWriter) {
    if !IsSealed {
      return
    }
    if let storage = trace {
      let total = TraceWriteCount
      let start = total > int64(storage.Length) ? total - int64(storage.Length) : 0L
      var index = start
      while index < total {
        let record = storage[int32(index % int64(storage.Length))]
        writer.WriteLine("{\"kind\":\"trace\",\"run\":${record.run},\"workload\":${record.workload},\"process\":${record.process},\"window\":${record.window},\"frame\":${record.frame},\"sample\":${record.sample},\"queue\":${record.queue},\"submission\":${record.submission},\"fence\":${record.fence},\"query\":${record.query},\"event\":${record.eventId},\"category\":${record.category},\"severity\":${record.severity},\"result\":${record.result},\"value0\":${record.value0},\"value1\":${record.value1},\"requestedWidth\":${record.requestedWidth},\"requestedHeight\":${record.requestedHeight}}")
        index++
      }
    }
    if let storage = results {
      let total = ResultWriteCount
      let start = total > int64(storage.Length) ? total - int64(storage.Length) : 0L
      var index = start
      while index < total {
        let record = storage[int32(index % int64(storage.Length))]
        writer.WriteLine("{\"kind\":\"result\",\"ordinal\":${record.ordinal},\"event\":${record.eventId},\"classification\":${record.classification},\"frame\":${record.frame},\"queue\":${record.queue},\"submission\":${record.submission},\"fence\":${record.fence},\"result\":${record.result}}")
        index++
      }
    }
    if let records = validation {
      if let bytes = validationText {
        let total = ValidationWriteCount
        let start = total > int64(records.Length) ? total - int64(records.Length) : 0L
        var index = start
        while index < total {
          let record = records[int32(index % int64(records.Length))]
          let byteCount = Math.Min(int32(record.messageLength), ValidationTextCapacity)
          let text = Hex(bytes, int32(record.messageOffset), uint32(Math.Max(0, byteCount)))
          writer.WriteLine("{\"kind\":\"validation\",\"severity\":${record.severity},\"types\":${record.types},\"messageId\":${record.messageId},\"messageHash\":${record.messageHash},\"messageLength\":${record.messageLength},\"messageTruncated\":${record.messageTruncated},\"messageHex\":\"${text}\"}")
          index++
        }
      }
    }
    let deviceName = WriteDevice(writer)
    if Fatal.captured {
      let snapshot = fatalCounters
      let physicalApiVersion = fatalPhysicalApiVersion
      let fatalBuilder = StringBuilder(2048)
      fatalBuilder.Append("{\"kind\":\"fatal\",\"code\":${fatalCode},\"value\":${fatalValue},\"traceAtCapture\":${fatalTraceWrite},\"validationAtCapture\":${fatalValidationWrite},\"resultAtCapture\":${fatalResultWrite},\"instanceApiVersion\":${fatalInstanceApiVersion},\"physicalApiVersion\":${physicalApiVersion},\"driverVersion\":${fatalDriverVersion},\"vendorId\":${fatalVendorId},\"deviceId\":${fatalDeviceId},\"deviceType\":${fatalDeviceType},\"timelineSemaphore\":${fatalTimelineSemaphore},\"synchronization2\":${fatalSynchronization2},\"dynamicRendering\":${fatalDynamicRendering},\"debugUtilsAvailable\":${fatalDebugUtilsAvailable},\"instanceExtensionCount\":${fatalInstanceExtensionCount},\"deviceExtensionCount\":${fatalDeviceExtensionCount},\"window\":${fatalWindow},\"surface\":${fatalSurface},\"swapchain\":${fatalSwapchain},\"frame\":${fatalFrame},\"generation\":${fatalGeneration},\"heapBudgetAvailable\":${fatalHeapBudgetAvailable},\"heapBudgetSampleCurrent\":${fatalHeapBudgetSampleCurrent},\"heapBudget\":${OptionalBudgetValue(fatalHeapBudgetAvailable, fatalHeapBudget)},\"driverHeapUsage\":${OptionalBudgetValue(fatalHeapBudgetAvailable, fatalDriverHeapUsage)},\"heapAllocated\":${fatalHeapAllocated},\"retiredBytes\":${fatalRetiredBytes},\"liveObjects\":${fatalLiveObjects},\"lastSubmission\":${fatalLastSubmission},\"lastQueue\":${fatalLastQueue},\"lastFence\":${fatalLastFence},\"lastResultEvent\":${fatalLastResultEvent},\"lastResult\":${fatalLastResult},\"deviceNameHex\":\"${deviceName}\"")
      AppendCounterFields(fatalBuilder, snapshot, FatalCounterFields, false)
      fatalBuilder.Append('}')
      writer.WriteLine(fatalBuilder.ToString())
    }
    if liveFirstPresent.ticks != 0uL {
      FlushLiveSnapshot(writer, liveFirstPresent)
    }
    if livePreTeardown.ticks != 0uL {
      FlushLiveSnapshot(writer, livePreTeardown)
    }
    let snapshot = counters.Snapshot
    let uploadBuilder = StringBuilder(256)
    uploadBuilder.Append("{\"kind\":\"image_upload\"")
    AppendCounterFields(uploadBuilder, snapshot, ImageUploadFields, false)
    uploadBuilder.Append('}')
    writer.WriteLine(uploadBuilder.ToString())

    let countersBuilder = StringBuilder(3072)
    countersBuilder.Append("{\"kind\":\"counters\"")
    AppendCounterFields(countersBuilder, snapshot, SnapshotCounterFields, true)
    countersBuilder.Append(",\"traceDropped\":${traceDropped},\"resultDropped\":${resultDropped},\"validationDropped\":${validationDropped},\"validationErrors\":${validationErrors},\"fatalCode\":${fatalCode},\"fatalValue\":${fatalValue}}")
    writer.WriteLine(countersBuilder.ToString())
  }
}
