package Goo

internal unsafe partial class VulkanFrameSlot {
  internal func DisposeAfterDeviceLoss() {
    if disposed {
      return
    }
    disposed = true
    acquirePrepared = false
    acquired = false
    submitPrepared = false
    inFlight = false
    submissionFailed = true
    if acquireSemaphore != VkSemaphore.Null {
      let staleSemaphore = acquireSemaphore
      acquireSemaphore = VkSemaphore.Null
      let destroySemaphore = dispatch.vkDestroySemaphore
      try { destroySemaphore(device, staleSemaphore, nil) } catch (cleanup Exception) { }
      if let accounting = objectAccounting {
        try { accounting.Release() } catch (cleanup Exception) { }
      }
    }
  }
}
