package Goo

import System

internal unsafe sealed class VulkanProductionReadbackCapture : IDisposable {
  private let pool VulkanReadbackPool
  private var request VulkanAsyncReadback? = nil
  private let defaultRegion VulkanReadbackRegion
  private var lastRequestAllocatedBytes uint64
  private var lastSubmissionSerial uint64
  private var disposed bool

  internal init(resources VulkanReadbackResources, region VulkanReadbackRegion) {
    pool = resources.Pool
    request = resources.Request
    defaultRegion = region
  }

  internal prop SubmissionSerial uint64{ get -> lastSubmissionSerial }
  internal prop LastRequestAllocatedBytes uint64{ get -> lastRequestAllocatedBytes }

  internal func Request(frame SceneFrame, clearColor VkClearColorValue,
    textScaleX float32 = 1.0F, textScaleY float32 = 1.0F) VkResult ->
  Request(frame, clearColor, defaultRegion, textScaleX, textScaleY)

  internal func Request(frame SceneFrame, clearColor VkClearColorValue,
    region VulkanReadbackRegion, textScaleX float32,
    textScaleY float32) VkResult{
      EnsureOpen()
      if request == nil {
        request = pool.Acquire()
      }
      guard let activeRequest = request else {
        return VkConstants.VK_NOT_READY
      }
      if activeRequest.State != VulkanReadbackState.Idle {
        throw InvalidOperationException("Vulkan production readback capture is busy")
      }
      let allocatedBefore = GC.GetAllocatedBytesForCurrentThread()
      try {
        let result = activeRequest.Request(frame, clearColor, region,
          textScaleX, textScaleY)
        lastSubmissionSerial = activeRequest.SubmissionSerial
        if result == VkConstants.VK_ERROR_DEVICE_LOST {
          activeRequest.AbandonAfterDeviceLoss()
          pool.AbandonAfterDeviceLoss()
        }
        return result
      } finally {
        let allocatedAfter = GC.GetAllocatedBytesForCurrentThread()
        lastRequestAllocatedBytes = uint64(allocatedAfter - allocatedBefore)
      }
    }

  internal func Poll() VkResult {
    EnsureOpen()
    guard let activeRequest = request else {
      return VkConstants.VK_NOT_READY
    }
    return activeRequest.PollCompletion()
  }

  internal func Take() VulkanReadbackResult? {
    EnsureOpen()
    guard let activeRequest = request else {
      return nil
    }
    guard let result = activeRequest.Result else {
      return nil
    }
    pool.Release(activeRequest)
    request = nil
    return result
  }

  public func Dispose() {
    if disposed {
      return
    }
    pool.Dispose()
    request = nil
    disposed = true
  }

  private func EnsureOpen() {
    if disposed {
      throw ObjectDisposedException("VulkanProductionReadbackCapture")
    }
  }
}

internal partial class VulkanWindowTarget {
  internal prop ImageResourcesForProof VulkanImageResources? { get -> imageResources }
  internal prop TextAtlasesForProof VulkanTextAtlasSet? { get -> textAtlas }
  internal prop PathResourcesForProof VulkanPathResources? { get -> pathResources }
  internal prop MemoryAllocatorForProof VulkanMemoryAllocator? { get -> memoryAllocator }
  internal prop ResourceGenerationForProof uint64{ get -> runtime?.Generation ?? 0uL }

  internal func CompletedSubmissionSerialForProof() uint64 ->
  CompletedGlobalSubmissionSerial()

  internal func AcceptedSubmissionSerialForProof() uint64 {
    let first = frameSlots.Slot(0u)?.GlobalSubmissionSerial ?? 0uL
    let second = frameSlots.Slot(1u)?.GlobalSubmissionSerial ?? 0uL
    return if first > second { first } else { second }
  }

  internal func OpenProductionReadbackForProof(region VulkanReadbackRegion)
  VulkanProductionReadbackCapture{
    PollQueueCompletion()
    if disposed || frameFailed {
      throw InvalidOperationException("Vulkan production readback target is unavailable")
    }
    if frameBegun || queueStage != QueueStageIdle {
      throw InvalidOperationException("Vulkan production readback requires an idle window target")
    }
    if let activeRequest = readbackRequest {
      if activeRequest.State == VulkanReadbackState.Pending
        || activeRequest.State == VulkanReadbackState.Complete{
          throw InvalidOperationException("Vulkan window readback is busy")
        }
    }
    guard let activeRuntime = runtime else {
      throw InvalidOperationException("Vulkan shared runtime is unavailable")
    }
    if activeRuntime.DeviceLost || activeRuntime.Terminal {
      throw InvalidOperationException("Vulkan shared runtime is unavailable")
    }
    guard let currentGeneration = generation else {
      throw InvalidOperationException("Vulkan swapchain generation is unavailable")
    }
    let plan = VulkanReadbackPlan.Create(region, currentGeneration.Extent)
    if plan.ResourceByteSize > ReadbackBudgetBytes {
      throw InvalidOperationException("Vulkan production readback exceeds the byte budget")
    }
    if !ReadbackFormatSupported(VkConstants.VK_FORMAT_R8G8B8A8_SRGB) {
      throw NotSupportedException("Vulkan production readback format is unavailable")
    }
    guard let currentAllocator = memoryAllocator,
    let currentImages = imageResources,
    let currentPaths = pathResources,
    let currentClipAtlas = clipMaskAtlas else {
      throw InvalidOperationException("Vulkan production readback resources are unavailable")
    }
    guard let readbackLease = VulkanSharedRuntime.TryAcquire() else {
      throw InvalidOperationException("Vulkan shared runtime lease is unavailable")
    }
    var createdTarget VulkanOffscreenTarget? = nil
    try {
      createdTarget = VulkanOffscreenTarget(
        device,
        dispatch,
        queue,
        currentAllocator,
        EnsureReadbackDispatch(),
        currentGeneration.Extent,
        plan.ByteSize,
        activeRuntime.GraphicsFamilyIndex,
        VkConstants.VK_FORMAT_R8G8B8A8_SRGB,
        currentImages,
        activeRuntime.Generation,
        activeRuntime.MaxStorageBufferRange,
        activeRuntime.ResourcePolicy,
        activeRuntime.PrimitiveState,
        currentPaths.Atlas,
        currentPaths,
        currentClipAtlas,
        textAtlas,
        objectAccounting,
        diagnostics,
        timestampState,
        activeRuntime.QueueWorker.CreateMailbox(nil),
        readbackLease)
    } catch (error Exception) {
      try { readbackLease.Release() } catch (cleanup Exception) { }
      throw error
    }
    guard let activeTarget = createdTarget else {
      readbackLease.Release()
      throw InvalidOperationException("Vulkan production readback target creation failed")
    }
    let resources = VulkanReadbackFactory.Create(activeTarget, readbackLease,
      activeRuntime.Generation, ReadbackBudgetBytes)
    try {
      return VulkanProductionReadbackCapture(resources, region)
    } catch (error Exception) {
      try { resources.Pool.Dispose() } catch (cleanup Exception) { }
      throw error
    }
  }
}

internal class VulkanProductionReadbackFixture {
  shared {
    internal func Open(window Window, width uint32, height uint32)
    VulkanProductionReadbackCapture{
      if width == 0u || height == 0u {
        throw ArgumentOutOfRangeException("width")
      }
      guard let target = WindowReadbackTestFixture.CaptureTarget(window) else {
        throw InvalidOperationException("Vulkan window target is unavailable")
      }
      return target.OpenProductionReadbackForProof(VulkanReadbackRegion{
        X: 0u,
        Y: 0u,
        Width: width,
        Height: height,
      })
    }

    internal func PollQueueCompletion(window Window) bool ->
    window.PollQueueCompletionForTest()

    internal func ImageResources(window Window) VulkanImageResources ? ->
    WindowReadbackTestFixture.CaptureTarget(window)?.ImageResourcesForProof

    internal func TextAtlases(window Window) VulkanTextAtlasSet ? ->
    WindowReadbackTestFixture.CaptureTarget(window)?.TextAtlasesForProof

    internal func MemoryAllocator(window Window) VulkanMemoryAllocator ? ->
    WindowReadbackTestFixture.CaptureTarget(window)?.MemoryAllocatorForProof

    internal func ResourceGeneration(window Window) uint64 ->
    WindowReadbackTestFixture.CaptureTarget(window)?.ResourceGenerationForProof ?? 0uL

    internal func CompletedSubmissionSerial(window Window) uint64 {
      guard let target = WindowReadbackTestFixture.CaptureTarget(window) else {
        return 0uL
      }
      return target.CompletedSubmissionSerialForProof()
    }

    internal func AcceptedSubmissionSerial(window Window) uint64 {
      guard let target = WindowReadbackTestFixture.CaptureTarget(window) else {
        return 0uL
      }
      return target.AcceptedSubmissionSerialForProof()
    }
  }
}
