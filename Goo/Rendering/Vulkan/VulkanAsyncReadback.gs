package Goo

import System
import System.Diagnostics
import System.Runtime.InteropServices

internal unsafe sealed class VulkanAsyncReadback : IDisposable {
  private let target VulkanOffscreenTarget
  private let sharedLease VulkanSharedLease
  private let generation uint64
  private var state VulkanReadbackState
  private var region VulkanReadbackRegion
  private var result VulkanReadbackResult? = nil
  private var submissionSerial uint64
  private var cpuCopyStartTicks int64
  private var cpuCopyEndTicks int64
  private var disposed bool

  internal prop State VulkanReadbackState{ get -> state }
  internal prop Generation uint64{ get -> generation }
  internal prop SubmissionSerial uint64{ get -> submissionSerial }
  internal prop StagingByteSize VkDeviceSize{ get -> target.StagingByteSize }
  internal prop TargetResourceByteSize VkDeviceSize{ get -> target.ResourceByteSize }
  internal prop Extent VkExtent2D{ get -> target.Extent }
  internal prop Region VulkanReadbackRegion{ get -> region }
  internal prop IsPending bool{ get -> state == VulkanReadbackState.Pending }
  internal prop SubmissionPendingReconcile bool{
    get -> state == VulkanReadbackState.Pending
      && target.SubmissionPendingReconcile
  }
  internal prop SubmissionReadyForReconcile bool{
    get -> state == VulkanReadbackState.Pending
      && target.SubmissionReadyForReconcile
  }
  internal prop TargetPending bool{
    get -> state == VulkanReadbackState.Pending || target.State == VulkanOffscreenState.Pending
  }
  internal prop DeviceLossDetected bool{ get -> target.DeviceLossDetected }
  internal prop GpuTimingAvailable bool{ get -> target.GpuTimingAvailable }
  internal prop GpuSceneReplayNanoseconds uint64{ get -> target.GpuSceneReplayNanoseconds }
  internal prop GpuCopyNanoseconds uint64{ get -> target.GpuCopyNanoseconds }
  internal prop Result VulkanReadbackResult? {
    get {
      return if state != VulkanReadbackState.Complete { nil } else { result }
    }
  }

  internal init(nativeTarget VulkanOffscreenTarget, nativeSharedLease VulkanSharedLease,
    expectedGeneration uint64) {
      if nativeTarget == nil {
        throw ArgumentNullException("nativeTarget")
      }
      if expectedGeneration == 0uL {
        throw ArgumentOutOfRangeException("expectedGeneration")
      }
      if nativeSharedLease == nil {
        throw ArgumentNullException("nativeSharedLease")
      }
      if nativeTarget.ResourceGeneration != expectedGeneration {
        throw ArgumentOutOfRangeException("expectedGeneration")
      }
      if nativeSharedLease.Generation != expectedGeneration {
        throw ArgumentOutOfRangeException("nativeSharedLease")
      }
      target = nativeTarget
      sharedLease = nativeSharedLease
      generation = expectedGeneration
      state = VulkanReadbackState.Idle
      region = VulkanReadbackPlan.Full(target.Extent).Region
    }

  internal func Request(frame SceneFrame, clearColor VkClearColorValue,
    requestedRegion VulkanReadbackRegion, textScaleX float32,
    textScaleY float32) VkResult{
      EnsureOpen()
      if frame == nil {
        throw ArgumentNullException("frame")
      }
      if state == VulkanReadbackState.Pending {
        throw InvalidOperationException("Vulkan readback is already pending")
      }
      let plan = VulkanReadbackPlan.Create(requestedRegion, target.Extent)
      if plan.ByteSize > target.StagingByteSize || plan.ByteSize > uint64(Int32.MaxValue) {
        throw ArgumentOutOfRangeException("requestedRegion")
      }
      let prepare = target.PrepareSubmit(requestedRegion)
      if prepare != VkConstants.VK_SUCCESS {
        MarkDeviceLossIfDetected()
        state = VulkanReadbackState.Failed
        return prepare
      }
      try {
        target.RecordScene(frame, clearColor, textScaleX, textScaleY)
        let submit = target.Submit()
        if submit == VkConstants.VK_ERROR_DEVICE_LOST || target.DeviceLossDetected {
          sharedLease.MarkDeviceLost()
        }
        if submit == VkConstants.VK_SUCCESS {
          region = requestedRegion
          submissionSerial = target.PendingSubmissionSerial
          result = nil
          state = VulkanReadbackState.Pending
        } else {
          state = VulkanReadbackState.Failed
        }
        return submit
      } catch (error Exception) {
        MarkDeviceLossIfDetected()
        if target.State != VulkanOffscreenState.Pending {
          try { target.AbortPrepared() } catch (cleanup Exception) { }
        }
        state = VulkanReadbackState.Failed
        throw error
      }
    }

  internal func Request(frame SceneFrame, clearColor VkClearColorValue) VkResult -> Request(frame, clearColor, VulkanReadbackPlan.Full(target.Extent).Region, 1.0F, 1.0F)

  internal func PollCompletion() VkResult {
    EnsureOpen()
    if state == VulkanReadbackState.Complete {
      return VkConstants.VK_SUCCESS
    }
    if state != VulkanReadbackState.Pending {
      return VkConstants.VK_NOT_READY
    }
    let completion = target.PollCompletion()
    if completion == VkConstants.VK_NOT_READY {
      return completion
    }
    if completion != VkConstants.VK_SUCCESS {
      if completion == VkConstants.VK_ERROR_DEVICE_LOST
        || target.DeviceLossDetected || sharedLease.DeviceLost{
          sharedLease.MarkDeviceLost()
          state = VulkanReadbackState.Abandoned
          AbandonAfterDeviceLoss()
          return VkConstants.VK_ERROR_DEVICE_LOST
        }
      return completion
    }
    let bytes = [int32(target.ReadbackByteSize)]uint8
    cpuCopyStartTicks = Stopwatch.GetTimestamp()
    Marshal.Copy(nint(target.ReadbackPointer), bytes, 0, bytes.Length)
    cpuCopyEndTicks = Stopwatch.GetTimestamp()
    result = VulkanReadbackResult(
      bytes,
      region.Width,
      region.Height,
      region.Width * 4u,
      target.TargetFormat,
      generation,
      submissionSerial)
    state = VulkanReadbackState.Complete
    return VkConstants.VK_SUCCESS
  }

  internal func PollTargetCompletionForClose() VkResult {
    EnsureOpen()
    if state != VulkanReadbackState.Pending {
      return VkConstants.VK_SUCCESS
    }
    let completion = target.PollCompletion()
    if completion == VkConstants.VK_NOT_READY || completion == VkConstants.VK_TIMEOUT {
      return completion
    }
    if completion == VkConstants.VK_ERROR_DEVICE_LOST
      || target.DeviceLossDetected || sharedLease.DeviceLost{
        sharedLease.MarkDeviceLost()
        state = VulkanReadbackState.Abandoned
        AbandonAfterDeviceLoss()
        return VkConstants.VK_ERROR_DEVICE_LOST
      }
    return if completion != VkConstants.VK_SUCCESS { completion } else { VkConstants.VK_SUCCESS }
  }

  internal func Reset() {
    EnsureOpen()
    if state == VulkanReadbackState.Abandoned {
      throw InvalidOperationException("Vulkan readback was abandoned after device loss")
    }
    if state == VulkanReadbackState.Pending {
      throw InvalidOperationException("Vulkan readback is still pending")
    }
    if target.State != VulkanOffscreenState.Idle
      && target.State != VulkanOffscreenState.Complete{
        throw InvalidOperationException("Vulkan readback target is not reusable")
      }
    state = VulkanReadbackState.Idle
    result = nil
    submissionSerial = 0uL
    cpuCopyStartTicks = 0L
    cpuCopyEndTicks = 0L
    region = VulkanReadbackPlan.Full(target.Extent).Region
  }

  internal func AbandonAfterDeviceLoss() {
    if disposed {
      return
    }
    sharedLease.MarkDeviceLost()
    state = VulkanReadbackState.Abandoned
    result = nil
    cpuCopyStartTicks = 0L
    cpuCopyEndTicks = 0L
    target.AbandonAfterDeviceLoss()
    sharedLease.AbandonAfterDeviceLoss()
    disposed = true
  }

  internal func ConfirmDeviceIdleForTeardown() {
    if disposed {
      return
    }
    target.ConfirmDeviceIdleForTeardown()
  }

  internal func DrainAndDispose() {
    if disposed {
      return
    }
    if state == VulkanReadbackState.Pending || target.State == VulkanOffscreenState.Pending {
      try { target.Dispose() } catch (error Exception) {
        MarkDeviceLossIfDetected()
        state = VulkanReadbackState.Abandoned
        throw error
      }
    } else {
      try { target.Dispose() } catch (error Exception) {
        MarkDeviceLossIfDetected()
        state = VulkanReadbackState.Abandoned
        throw error
      }
    }
    disposed = true
    sharedLease.Release()
    state = VulkanReadbackState.Abandoned
    result = nil
    cpuCopyStartTicks = 0L
    cpuCopyEndTicks = 0L
  }

  public func Dispose() {
    if disposed {
      return
    }
    if state == VulkanReadbackState.Pending || target.State == VulkanOffscreenState.Pending {
      throw InvalidOperationException("Vulkan readback must be drained or abandoned before dispose")
    }
    try { target.Dispose() } catch (error Exception) {
      MarkDeviceLossIfDetected()
      state = VulkanReadbackState.Abandoned
      throw error
    }
    disposed = true
    sharedLease.Release()
    state = VulkanReadbackState.Abandoned
    result = nil
    cpuCopyStartTicks = 0L
    cpuCopyEndTicks = 0L
  }

  internal prop CpuCopyStartTicks int64{ get -> cpuCopyStartTicks }
  internal prop CpuCopyEndTicks int64{ get -> cpuCopyEndTicks }

  private func MarkDeviceLossIfDetected() {
    if target.DeviceLossDetected {
      sharedLease.MarkDeviceLost()
    }
  }

  private func EnsureOpen() {
    if disposed {
      throw ObjectDisposedException("VulkanAsyncReadback")
    }
  }
}
