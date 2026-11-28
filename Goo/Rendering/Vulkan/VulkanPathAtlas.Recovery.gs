package Goo

internal unsafe partial class VulkanPathAtlas {
  internal func DisposeAfterDeviceLoss() {
    if disposed {
      return
    }
    disposed = true
    try { DestroyStagingBuffer() } catch (cleanup Exception) { }
    try { DestroyDescriptorResources() } catch (cleanup Exception) { }
    try { DestroyAtlasBuffer() } catch (cleanup Exception) { }
    uploadCommandBuffer = VkCommandBuffer.Null
    uploadFence = 0uL
    uploadPending = false
    uploadRecorded = false
    uploadSubmitted = false
    uploaded = false
    uploadWordOffset = 0uL
    uploadWordCount = 0uL
    uploadByteOffset = 0uL
    uploadByteCount = 0uL
    uploadSequence = 0uL
    completedUploadSequence = 0uL
    flushPrepared = false
  }
}
