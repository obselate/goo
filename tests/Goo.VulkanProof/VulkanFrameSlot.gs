package Goo.VulkanProof

import System
import Goo

internal unsafe class VulkanFrameSlot : IDisposable {
  private let device VkDevice
  private let dispatch VkDeviceDispatch
  private let commandBuffer VkCommandBuffer
  private var acquireSemaphore VkSemaphore
  private var submissionFence VkFence
  private var acquirePrepared bool
  private var acquired bool
  private var submitPrepared bool
  private var inFlight bool
  private var submissionFailed bool
  private var submissionSerial uint64
  private var lastCompletedSerial uint64
  private var disposed bool

  internal prop CommandBuffer VkCommandBuffer{ get -> commandBuffer }
  internal prop AcquireSemaphore VkSemaphore{ get -> acquireSemaphore }
  internal prop SubmissionFence VkFence{ get -> submissionFence }
  internal prop InFlight bool{ get -> inFlight }
  internal prop SubmissionSerial uint64{ get -> submissionSerial }
  internal prop NextSubmissionSerial uint64{ get -> submissionSerial + 1uL }
  internal prop LastCompletedSerial uint64{ get -> lastCompletedSerial }

  internal init(nativeDevice VkDevice, nativeDispatch VkDeviceDispatch, suppliedCommandBuffer VkCommandBuffer) {
    if nativeDevice == nint(0) {
      throw ArgumentException("Vulkan device is null", "nativeDevice")
    }
    if suppliedCommandBuffer == nint(0) {
      throw ArgumentException("Vulkan command buffer is null", "suppliedCommandBuffer")
    }
    this.device = nativeDevice
    this.dispatch = nativeDispatch
    this.commandBuffer = suppliedCommandBuffer
    Create()
  }

  private func Create() {
    try {
      var semaphoreCreateInfo = VkSemaphoreCreateInfo{}
      semaphoreCreateInfo.sType = VkConstants.VK_STRUCTURE_TYPE_SEMAPHORE_CREATE_INFO
      let createSemaphore = dispatch.vkCreateSemaphore
      let semaphoreResult = createSemaphore(device, &semaphoreCreateInfo, nil, &acquireSemaphore)
      if semaphoreResult != VkConstants.VK_SUCCESS || acquireSemaphore == 0uL {
        throw InvalidOperationException("vkCreateSemaphore failed for VulkanFrameSlot")
      }

      var fenceCreateInfo = VkFenceCreateInfo{}
      fenceCreateInfo.sType = VkConstants.VK_STRUCTURE_TYPE_FENCE_CREATE_INFO
      fenceCreateInfo.flags = uint32(VkConstants.VK_FENCE_CREATE_SIGNALED_BIT)
      let createFence = dispatch.vkCreateFence
      let fenceResult = createFence(device, &fenceCreateInfo, nil, &submissionFence)
      if fenceResult != VkConstants.VK_SUCCESS || submissionFence == 0uL {
        throw InvalidOperationException("vkCreateFence failed for VulkanFrameSlot")
      }
    } catch (error Exception) {
      if submissionFence != 0uL {
        let destroyFence = dispatch.vkDestroyFence
        destroyFence(device, submissionFence, nil)
        submissionFence = 0uL
      }
      if acquireSemaphore != 0uL {
        let destroySemaphore = dispatch.vkDestroySemaphore
        destroySemaphore(device, acquireSemaphore, nil)
        acquireSemaphore = 0uL
      }
      throw error
    }
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
      let waitForFences = dispatch.vkWaitForFences
      let waitResult = waitForFences(device, 1u, &submissionFence, VkConstants.VK_TRUE, VkConstants.VK_WHOLE_SIZE)
      if waitResult != VkConstants.VK_SUCCESS {
        return waitResult
      }
      lastCompletedSerial = submissionSerial
      inFlight = false
    }
    let resetCommandBuffer = dispatch.vkResetCommandBuffer
    let resetResult = resetCommandBuffer(commandBuffer, VkCommandBufferResetFlags(0u))
    if resetResult == VkConstants.VK_SUCCESS {
      acquirePrepared = true
    }
    return resetResult
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
    }
    return acquireResult
  }

  internal func PrepareSubmit(recordingComplete bool) VkResult {
    if disposed {
      throw ObjectDisposedException("VulkanFrameSlot")
    }
    if submissionFailed {
      throw InvalidOperationException("VulkanFrameSlot submission failed")
    }
    if !acquired || submitPrepared || inFlight {
      throw InvalidOperationException("VulkanFrameSlot is not ready to prepare submission")
    }
    if !recordingComplete {
      return VkConstants.VK_NOT_READY
    }
    let resetFences = dispatch.vkResetFences
    let resetResult = resetFences(device, 1u, &submissionFence)
    if resetResult == VkConstants.VK_SUCCESS {
      submitPrepared = true
    }
    return resetResult
  }

  internal func MarkSubmitted(submitResult VkResult) VkResult {
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
      acquired = false
      submitPrepared = false
      submissionSerial++
      inFlight = true
    } else {
      acquired = false
      submitPrepared = false
      submissionFailed = true
    }
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

  public func Dispose() {
    if disposed {
      return
    }
    if acquired || submitPrepared {
      throw InvalidOperationException("VulkanFrameSlot has unconsumed acquired work")
    }
    if inFlight {
      let getFenceStatus = dispatch.vkGetFenceStatus
      let status = getFenceStatus(device, submissionFence)
      if status != VkConstants.VK_SUCCESS {
        throw InvalidOperationException("VulkanFrameSlot submission is still in flight")
      }
      lastCompletedSerial = submissionSerial
      inFlight = false
    }
    disposed = true
    if acquireSemaphore != 0uL {
      let destroySemaphore = dispatch.vkDestroySemaphore
      destroySemaphore(device, acquireSemaphore, nil)
      acquireSemaphore = 0uL
    }
    if submissionFence != 0uL {
      let destroyFence = dispatch.vkDestroyFence
      destroyFence(device, submissionFence, nil)
      submissionFence = 0uL
    }
  }
}
