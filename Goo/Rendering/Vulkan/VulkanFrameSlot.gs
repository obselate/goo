package Goo

import System

internal unsafe partial class VulkanFrameSlot : IDisposable {
  private let device VkDevice
  private let dispatch VkDeviceDispatch
  private let commandBuffer VkCommandBuffer
  private let objectAccounting VulkanObjectAccounting?
  private let sharedLease VulkanSharedLease
  private var acquireSemaphore VkSemaphore
  private var acquirePrepared bool
  private var acquired bool
  private var acquireWaitPending bool
  private var submitPrepared bool
  private var inFlight bool
  private var submissionFailed bool
  private var submissionSerial uint64
  private var lastCompletedSerial uint64
  private var globalSubmissionSerial uint64
  private var lastCompletedGlobalSubmissionSerial uint64
  private var disposed bool

  internal prop CommandBuffer VkCommandBuffer{ get -> commandBuffer }
  internal prop AcquireSemaphore VkSemaphore{ get -> acquireSemaphore }
  internal prop SubmitWaitSemaphore VkSemaphore { get -> if acquireWaitPending { acquireSemaphore } else { 0uL } }
  internal prop InFlight bool{ get -> inFlight }
  internal prop SubmissionSerial uint64{ get -> submissionSerial }
  internal prop NextSubmissionSerial uint64{ get -> submissionSerial + 1uL }
  internal prop LastCompletedSerial uint64{ get -> lastCompletedSerial }
  internal prop GlobalSubmissionSerial uint64{ get -> globalSubmissionSerial }
  internal prop HasAbandonableAcquiredWork bool{
    get -> acquired && !inFlight && !submissionFailed
  }
  internal prop LastCompletedGlobalSubmissionSerial uint64{
    get -> lastCompletedGlobalSubmissionSerial
  }

  internal init(nativeDevice VkDevice, nativeDispatch VkDeviceDispatch,
    suppliedCommandBuffer VkCommandBuffer, nativeObjectAccounting VulkanObjectAccounting?,
    nativeSharedLease VulkanSharedLease) {
      if nativeDevice == nint(0) {
        throw ArgumentException("Vulkan device is null", "nativeDevice")
      }
      if suppliedCommandBuffer == nint(0) {
        throw ArgumentException("Vulkan command buffer is null", "suppliedCommandBuffer")
      }
      if nativeSharedLease == nil {
        throw ArgumentNullException("nativeSharedLease")
      }
      this.device = nativeDevice
      this.dispatch = nativeDispatch
      this.commandBuffer = suppliedCommandBuffer
      objectAccounting = nativeObjectAccounting
      sharedLease = nativeSharedLease
      Create()
    }

  private func Create() {
    acquireSemaphore = VulkanSynchronizationFactory.CreateSemaphore(
      device,
      dispatch,
      objectAccounting)
  }

  internal func PrepareAcquire() VkResult {
    if disposed {
      throw ObjectDisposedException("VulkanFrameSlot")
    }
    if submissionFailed {
      throw InvalidOperationException("VulkanFrameSlot submission failed")
    }
    if acquirePrepared || acquired || submitPrepared {
      throw InvalidOperationException("VulkanFrameSlot has prepared work")
    }
    if inFlight {
      let status = PollForCompletion()
      if status != VkConstants.VK_SUCCESS {
        return status
      }
    }
    let resetCommandBuffer = dispatch.vkResetCommandBuffer
    let resetResult = resetCommandBuffer(commandBuffer, VkCommandBufferResetFlags(0u))
    if resetResult == VkConstants.VK_SUCCESS {
      acquirePrepared = true
    }
    return resetResult
  }

  internal func PollForCompletion() VkResult {
    if disposed {
      throw ObjectDisposedException("VulkanFrameSlot")
    }
    if acquired || submitPrepared {
      throw InvalidOperationException("VulkanFrameSlot has unconsumed acquired work")
    }
    if !inFlight {
      return VkConstants.VK_SUCCESS
    }
    let result = sharedLease.PollGraphicsSubmission(globalSubmissionSerial)
    if result == VkConstants.VK_SUCCESS {
      lastCompletedSerial = submissionSerial
      lastCompletedGlobalSubmissionSerial = globalSubmissionSerial
      inFlight = false
    }
    return result
  }

  internal func MarkAcquired(acquireResult VkResult) VkResult {
    if disposed {
      throw ObjectDisposedException("VulkanFrameSlot")
    }
    if submissionFailed {
      throw InvalidOperationException("VulkanFrameSlot submission failed")
    }
    if !acquirePrepared || acquired || submitPrepared || inFlight {
      throw InvalidOperationException("VulkanFrameSlot is not ready to mark image acquisition")
    }
    acquirePrepared = false
    if acquireResult == VkConstants.VK_SUCCESS || acquireResult == VkConstants.VK_SUBOPTIMAL_KHR {
      acquired = true
      acquireWaitPending = true
    }
    return acquireResult
  }

  internal func PrepareSubmit() VkResult {
    if disposed {
      throw ObjectDisposedException("VulkanFrameSlot")
    }
    if submissionFailed {
      throw InvalidOperationException("VulkanFrameSlot submission failed")
    }
    if !acquired || submitPrepared || inFlight {
      throw InvalidOperationException("VulkanFrameSlot is not ready to prepare submission")
    }
    submitPrepared = true
    return VkConstants.VK_SUCCESS
  }

  internal func MarkSubmitted(submitResult VkResult, submittedGlobalSerial uint64) VkResult {
    if disposed {
      throw ObjectDisposedException("VulkanFrameSlot")
    }
    if submissionFailed {
      throw InvalidOperationException("VulkanFrameSlot submission failed")
    }
    if !submitPrepared || acquirePrepared || !acquired || inFlight {
      throw InvalidOperationException("VulkanFrameSlot has no prepared submission")
    }
    if submitResult == VkConstants.VK_SUCCESS {
      if submittedGlobalSerial == 0uL {
        throw ArgumentOutOfRangeException("submittedGlobalSerial")
      }
      acquired = false
      submitPrepared = false
      submissionSerial++
      globalSubmissionSerial = submittedGlobalSerial
      inFlight = true
    } else {
      acquired = false
      submitPrepared = false
      submissionFailed = true
    }
    acquireWaitPending = false
    return submitResult
  }

  internal func AbortPrepared() {
    if disposed {
      throw ObjectDisposedException("VulkanFrameSlot")
    }
    if submissionFailed || acquired || submitPrepared || inFlight {
      throw InvalidOperationException("VulkanFrameSlot submission is in flight")
    }
    acquirePrepared = false
  }

  internal func PrepareAcquiredImageReplay() VkResult {
    if disposed { throw ObjectDisposedException("VulkanFrameSlot") }
    if submissionFailed || acquirePrepared || acquired || submitPrepared {
      throw InvalidOperationException("VulkanFrameSlot cannot replay acquired work")
    }
    let completed = PollForCompletion()
    if completed != VkConstants.VK_SUCCESS { return completed }
    let reset = dispatch.vkResetCommandBuffer(commandBuffer, VkCommandBufferResetFlags(0u))
    if reset == VkConstants.VK_SUCCESS { acquired = true }
    return reset
  }

  internal func AbandonAcquiredForSwapchainRetirement() VkResult {
    if disposed {
      throw ObjectDisposedException("VulkanFrameSlot")
    }
    if submissionFailed || !acquired || inFlight {
      throw InvalidOperationException("VulkanFrameSlot has no abandonable acquired work")
    }
    let drainResult = if acquireWaitPending { sharedLease.DrainAcquiredSemaphore(acquireSemaphore) }
      else { VkConstants.VK_SUCCESS }
    if drainResult != VkConstants.VK_SUCCESS {
      return drainResult
    }
    acquired = false
    acquireWaitPending = false
    acquirePrepared = false
    submitPrepared = false
    return VkConstants.VK_SUCCESS
  }

  internal func WaitForCompletion() VkResult {
    if disposed {
      throw ObjectDisposedException("VulkanFrameSlot")
    }
    if acquired || submitPrepared {
      throw InvalidOperationException("VulkanFrameSlot has unconsumed acquired work")
    }
    if !inFlight {
      return VkConstants.VK_SUCCESS
    }
    let result = sharedLease.WaitGraphicsSubmission(
      globalSubmissionSerial, VkConstants.VK_WHOLE_SIZE)
    if result == VkConstants.VK_SUCCESS {
      lastCompletedSerial = submissionSerial
      lastCompletedGlobalSubmissionSerial = globalSubmissionSerial
      inFlight = false
    }
    return result
  }

  public func Dispose() {
    if disposed {
      return
    }
    if acquired || submitPrepared {
      throw InvalidOperationException("VulkanFrameSlot has unconsumed acquired work")
    }
    if inFlight {
      let status = sharedLease.PollGraphicsSubmission(globalSubmissionSerial)
      if status != VkConstants.VK_SUCCESS {
        throw InvalidOperationException("VulkanFrameSlot submission is still in flight")
      }
      lastCompletedSerial = submissionSerial
      lastCompletedGlobalSubmissionSerial = globalSubmissionSerial
      inFlight = false
    }
    disposed = true
    if acquireSemaphore != 0uL {
      let destroySemaphore = dispatch.vkDestroySemaphore
      destroySemaphore(device, acquireSemaphore, nil)
      if let accounting = objectAccounting {
        accounting.Release()
      }
      acquireSemaphore = 0uL
    }
  }
}
