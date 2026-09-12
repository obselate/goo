package Goo

internal unsafe partial class VulkanImageResources {
  internal func DisposeAfterDeviceLoss() {
    if disposed {
      return
    }
    disposed = true
    try { DestroyGpuResources() } catch (cleanup Exception) { }
    try { DestroyStagingBuffer() } catch (cleanup Exception) { }
    try { uploadRing.Dispose() } catch (cleanup Exception) { }
    ClearLogicalResources()
    ClearCurrentReferences()
    var index int32 = 0
    while index < entries.Length {
      entries[index] = VulkanImageResourceEntry{}
      index++
    }
    liveCount = 0
    residentBytes = 0uL
    ClearDiagnosticImageState()
    generation = 0uL
    generationLastUseFence = 0uL
    highestCompletedFence = 0uL
    nextTouch = 0uL
    flushPrepared = false
  }
}
