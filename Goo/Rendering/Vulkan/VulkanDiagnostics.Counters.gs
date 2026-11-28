package Goo

import System.Threading

internal class VulkanDiagnosticCounters {
  private let values []uint64 = [int32(VulkanCounterId.Count)]uint64

  internal prop Snapshot VulkanDiagnosticCounterSnapshot{
    get {
      let copy = [values.Length]uint64
      for index in 0 ... values.Length {
        copy[index] = Interlocked.Read(in values[index])
      }
      return VulkanDiagnosticCounterSnapshot(copy)
    }
  }

  internal func Add(id VulkanCounterId, delta uint64) {
    Interlocked.Add(ref values[int32(id)], delta)
  }

  internal func Set(id VulkanCounterId, value uint64) {
    Interlocked.Exchange(ref values[int32(id)], value)
  }

  internal func SetPeak(id VulkanCounterId, value uint64) {
    let slot = int32(id)
    while true {
      let current = Interlocked.Read(in values[slot])
      if value <= current || Interlocked.CompareExchange(ref values[slot], value, current) == current {
        return
      }
    }
  }

  internal func SetMemoryPolicy(headroom uint64, evictions uint64, retries uint64, pressure uint64) {
    Set(VulkanCounterId.HeapHeadroom, headroom)
    Set(VulkanCounterId.MemoryEvictionCount, evictions)
    Set(VulkanCounterId.MemoryAllocationRetryCount, retries)
    Set(VulkanCounterId.MemoryPressureCount, pressure)
  }

  internal func SetClipMaskFrameStats(stats VulkanScissorTableStats, totals VulkanScissorTableTotals) {
    Set(VulkanCounterId.ClipFrameWrittenBytes, totals.WrittenBytes)
    Set(VulkanCounterId.ClipFrameSkippedBytes, totals.SkippedBytes)
    Set(VulkanCounterId.ClipFrameMappedWrites, totals.MappedWrites)
    Set(VulkanCounterId.ClipFrameFlushes, totals.Flushes)
    Set(VulkanCounterId.ClipFrameRetainedReuse, totals.RetainedReuse)
    Set(VulkanCounterId.ClipFrameSlotIndex, uint64(stats.SlotIndex < 0 ? 0 : stats.SlotIndex))
    Set(VulkanCounterId.ClipFrameDrawCount, uint64(stats.DrawCount < 0 ? 0 : stats.DrawCount))
    Set(VulkanCounterId.ClipFrameMaskCount, uint64(stats.MaskCount < 0 ? 0 : stats.MaskCount))
    Set(VulkanCounterId.ClipFrameChainCount, uint64(stats.ClipChainCount < 0 ? 0 : stats.ClipChainCount))
    Set(VulkanCounterId.ClipFrameLayerCount, uint64(stats.RecordCount < 0 ? 0 : stats.RecordCount))
    Set(VulkanCounterId.ClipFrameByteCount, uint64(stats.ByteCount))
    Set(VulkanCounterId.ClipFrameCapacity, uint64(stats.Capacity))
    Set(VulkanCounterId.ClipFrameBufferGeneration, stats.BufferGeneration)
    Set(VulkanCounterId.ClipFrameLastUseSerial, stats.LastUseSerial)
    Set(VulkanCounterId.ClipFrameRetentionEligible, stats.RetentionEligible ? 1uL : 0uL)
    Set(VulkanCounterId.ClipFrameRetained, stats.Retained ? 1uL : 0uL)
    Set(VulkanCounterId.ClipFrameRetentionValid, stats.RetentionValid ? 1uL : 0uL)
  }

  internal func SetTextFrameStats(stats VulkanTextFrameStats) {
    Set(VulkanCounterId.TextFrameWrittenBytes, uint64(stats.TotalWrittenBytes))
    Set(VulkanCounterId.TextFrameSkippedBytes, uint64(stats.TotalSkippedBytes))
    Set(VulkanCounterId.TextFrameDirtySegmentCount, stats.TotalDirtySegmentCount)
    Set(VulkanCounterId.TextFrameUploadRangeCount, stats.TotalUploadRangeCount)
    Set(VulkanCounterId.TextFrameFullUploadCount, stats.TotalFullUploads)
    Set(VulkanCounterId.TextFrameMappedWrites, stats.TotalMappedWrites)
    Set(VulkanCounterId.TextFrameFlushes, stats.TotalFlushes)
    Set(VulkanCounterId.TextFrameRetainedReuse, stats.TotalRetainedReuse)
    Set(VulkanCounterId.TextFrameSlotIndex, uint64(stats.SlotIndex < 0 ? 0 : stats.SlotIndex))
    Set(VulkanCounterId.TextFrameSegmentCount, uint64(stats.SegmentCount < 0 ? 0 : stats.SegmentCount))
    Set(VulkanCounterId.TextFrameRunCount, uint64(stats.RunCount < 0 ? 0 : stats.RunCount))
    Set(VulkanCounterId.TextFrameRecordCount, uint64(stats.RecordCount < 0 ? 0 : stats.RecordCount))
    Set(VulkanCounterId.TextFrameByteCount, uint64(stats.ByteCount))
    Set(VulkanCounterId.TextFrameCapacity, uint64(stats.Capacity))
    Set(VulkanCounterId.TextFrameBufferGeneration, stats.BufferGeneration)
    Set(VulkanCounterId.TextFrameTopologyKey, stats.TopologyKey)
    Set(VulkanCounterId.TextFrameLastUseSerial, stats.LastUseSerial)
    Set(VulkanCounterId.TextFramePrepared, stats.Prepared ? 1uL : 0uL)
  }

  internal func SetTextCacheStats(layoutStats TextCacheStats, runStats TextCacheStats) {
    Set(VulkanCounterId.TextLayoutCacheBytes, uint64(layoutStats.Bytes < 0L ? 0L : layoutStats.Bytes))
    Set(VulkanCounterId.TextLayoutCacheEntries, uint64(layoutStats.Entries < 0 ? 0 : layoutStats.Entries))
    Set(VulkanCounterId.TextLayoutCacheHits, uint64(layoutStats.Hits < 0L ? 0L : layoutStats.Hits))
    Set(VulkanCounterId.TextLayoutCacheMisses, uint64(layoutStats.Misses < 0L ? 0L : layoutStats.Misses))
    Set(VulkanCounterId.TextLayoutCacheEvictions, uint64(layoutStats.Evictions < 0L ? 0L : layoutStats.Evictions))
    Set(VulkanCounterId.TextRunShapeCacheBytes, uint64(runStats.Bytes < 0L ? 0L : runStats.Bytes))
    Set(VulkanCounterId.TextRunShapeCacheEntries, uint64(runStats.Entries < 0 ? 0 : runStats.Entries))
    Set(VulkanCounterId.TextRunShapeCacheHits, uint64(runStats.Hits < 0L ? 0L : runStats.Hits))
    Set(VulkanCounterId.TextRunShapeCacheMisses, uint64(runStats.Misses < 0L ? 0L : runStats.Misses))
    Set(VulkanCounterId.TextRunShapeCacheEvictions, uint64(runStats.Evictions < 0L ? 0L : runStats.Evictions))
  }

  internal func SetPathAtlasStats(stats VulkanPathResourcesStats, liveObjectCount uint64) {
    Set(VulkanCounterId.PathAtlasByteBudget, uint64(stats.WordCapacity) * 4uL)
    Set(VulkanCounterId.PathAtlasResidentWords, uint64(stats.LiveWordCount))
    Set(VulkanCounterId.PathAtlasFreeWords, uint64(stats.FreeWordCount))
    Set(VulkanCounterId.PathAtlasPathCount, uint64(stats.PathCount))
    Set(VulkanCounterId.PathAtlasActiveReferenceCount, uint64(stats.ActiveReferenceCount))
    Set(VulkanCounterId.PathAtlasLiveObjectCount, liveObjectCount)
    Set(VulkanCounterId.PathAtlasEvictionCount, stats.EvictionCount)
    Set(VulkanCounterId.PathAtlasRetiredWords, stats.RetiredWordCount)
    Set(VulkanCounterId.PathAtlasReuseCount, stats.ReuseCount)
    Set(VulkanCounterId.PathAtlasPressureEventCount, stats.PressureEventCount)
    Set(VulkanCounterId.PathAtlasPressureFailureCount, stats.PressureFailureCount)
  }

  internal func ClearPathAtlasCurrentState() {
    Set(VulkanCounterId.PathAtlasResidentWords, 0uL)
    Set(VulkanCounterId.PathAtlasFreeWords, 0uL)
    Set(VulkanCounterId.PathAtlasPathCount, 0uL)
    Set(VulkanCounterId.PathAtlasActiveReferenceCount, 0uL)
    Set(VulkanCounterId.PathAtlasLiveObjectCount, 0uL)
  }

  internal func SetLayerPoolStats(residentBytes uint64, targetCount uint64,
    leasedCount uint64, resolutionShift uint64) {
      Set(VulkanCounterId.LayerPoolResidentBytes, residentBytes)
      Set(VulkanCounterId.LayerPoolTargetCount, targetCount)
      Set(VulkanCounterId.LayerPoolLeasedCount, leasedCount)
      Set(VulkanCounterId.LayerPoolResolutionShift, resolutionShift)
    }

  internal func AddDamage(count uint64, area uint64) {
    Add(VulkanCounterId.DamageCount, count)
    Add(VulkanCounterId.DamageArea, area)
  }

  internal func AddResult(failure bool) {
    Add(VulkanCounterId.ResultCount, 1uL)
    if failure {
      Add(VulkanCounterId.ResultFailureCount, 1uL)
    }
  }
}
