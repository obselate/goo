package Goo

internal unsafe partial class VulkanSwapchainGeneration {
  internal func DisposeAfterDeviceLoss() {
    if disposed {
      return
    }
    if let recorder = FrameRecorder.Current { Profile(recorder, VulkanDiagnosticEventIds.SwapchainDestroy) }
    disposed = true
    let staleImageSet = imageSet
    imageSet = nil
    if let storage = staleImageSet {
      try { storage.DisposeAfterDeviceLoss() } catch (cleanup Exception) { }
    }
    if swapchain != 0uL {
      let staleSwapchain = swapchain
      swapchain = 0uL
      let destroySwapchain = dispatch.vkDestroySwapchainKHR
      try { destroySwapchain(device, staleSwapchain, nil) } catch (cleanup Exception) { }
      if let accounting = objectAccounting {
        try { accounting.Release() } catch (cleanup Exception) { }
      }
    }
  }
}
