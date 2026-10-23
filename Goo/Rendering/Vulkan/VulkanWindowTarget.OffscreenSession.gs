package Goo

import System
import System.Threading

internal unsafe partial class VulkanWindowTarget {
  private init(source VulkanWindowTarget, shared VulkanSharedLease) {
    host = source.host
    diagnosticWindowHandle = source.diagnosticWindowHandle
    validateGraphicsSubmission = (serial uint64) -> { ValidateGraphicsSubmission(serial) }
    sceneCompiler = VulkanSceneCompiler()
    presentationRetirement = VulkanPresentationRetirement(64u, 8u)
    retiredSwapchains = VulkanRetiredSwapchainSet(8)
    runtime = shared
    ApplySharedRuntime(shared)
    clipMaskFormatSupport = source.clipMaskFormatSupport
  }

  internal func CreateOffscreenSession(closed CancellationToken) OffscreenRenderSessionResult {
    guard let active = runtime else {
      return OffscreenRenderSessionResult{ Status: OffscreenRenderStatus.NotReady }
    }
    if active.DeviceLost || active.Terminal {
      return OffscreenRenderSessionResult{ Status: OffscreenRenderStatus.DeviceLost }
    }
    var shared VulkanSharedLease?
    try {
      shared = VulkanSharedRuntime.TryAcquire()
      guard let lease = shared else {
        return OffscreenRenderSessionResult{ Status: OffscreenRenderStatus.NotReady }
      }
      let target = VulkanWindowTarget(this, lease)
      return OffscreenRenderSessionResult{ Status: OffscreenRenderStatus.Success,
        Session: OffscreenRenderSession(target, closed) }
    } catch (error Exception) {
      shared?.Release()
      return OffscreenRenderSessionResult{
        Status: active.DeviceLost ? OffscreenRenderStatus.DeviceLost : OffscreenRenderStatus.Failed,
        Error: error.Message }
    }
  }
}
