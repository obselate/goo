package Goo

import System.Threading
import System.Diagnostics

internal class VulkanQueueMailboxPhase {
  shared {
    internal const Idle int32 = 0
    internal const SubmitQueued int32 = 1
    internal const SubmitRunning int32 = 2
    internal const SubmitComplete int32 = 3
    internal const PresentQueued int32 = 4
    internal const PresentRunning int32 = 5
    internal const PresentComplete int32 = 6
  }
}

internal unsafe sealed class VulkanQueueMailbox {
  private let host VulkanSurfaceHost?
  private var phase int32
  private var submitResult VkResult = VkConstants.VK_NOT_READY
  private var presentResult VkResult = VkConstants.VK_NOT_READY
  private var syntheticDrainResult VkResult = VkConstants.VK_NOT_READY
  private var syntheticDrainPerformed bool
  private const ExternalSemaphoreCapacity int32 = 64
  private let waitInfos []VkSemaphoreSubmitInfo = [ExternalSemaphoreCapacity + 1]VkSemaphoreSubmitInfo
  private let signalInfos []VkSemaphoreSubmitInfo = [2]VkSemaphoreSubmitInfo
  private let waitPins []object? = [ExternalSemaphoreCapacity]object?
  private var externalWaitCount int32
  private var presentDamageRegion VulkanDamageRegion

  internal var SubmitCommandBuffer VkCommandBuffer
  internal var SubmitWaitSemaphore VkSemaphore
  internal var SubmitSignalSemaphore VkSemaphore
  internal var SubmitTimeline VkSemaphore
  internal var SubmitSerial uint64
  internal var SubmitHasWait bool
  internal var SubmitHasSignal bool
  internal var PresentSwapchain VkSwapchainKHR
  internal var PresentImageIndex uint32
  internal var PresentWaitSemaphore VkSemaphore
  internal var PresentFence VkFence
  internal var PresentFenceEnabled bool
  internal var TraceId string?
  internal var TraceContext FrameTraceContext

  internal prop TraceRecorder FrameRecorder? {
    get {
      let current = FrameRecorder.Current
      return if current != nil && current.TraceId == TraceId { current } else { nil }
    }
  }

  internal init(nativeHost VulkanSurfaceHost?) {
    host = nativeHost
  }

  internal prop Phase int32{
    get -> Interlocked.CompareExchange(ref phase, 0, 0)
  }

  internal prop SubmitResult VkResult{ get -> submitResult }
  internal prop PresentResult VkResult{ get -> presentResult }
  internal prop SyntheticDrainPerformed bool{ get -> syntheticDrainPerformed }
  internal prop SyntheticDrainResult VkResult{ get -> syntheticDrainResult }

  internal func NotifyCompletion() { host?.Wake() }

  internal func PrepareSubmit(commandBuffer VkCommandBuffer, waitSemaphore VkSemaphore,
    signalSemaphore VkSemaphore) {
      if externalWaitCount != 0 { System.Array.Clear(waitPins, 0, externalWaitCount) }
      externalWaitCount = 0
      SubmitCommandBuffer = commandBuffer
      SubmitWaitSemaphore = waitSemaphore
      SubmitSignalSemaphore = signalSemaphore
      SubmitTimeline = 0uL
      SubmitSerial = 0uL
      SubmitHasWait = waitSemaphore != 0uL
      SubmitHasSignal = signalSemaphore != 0uL
    }

  internal func AddExternalWait(semaphore VkSemaphore, value uint64, pin object) {
    if Phase != VulkanQueueMailboxPhase.Idle { throw System.InvalidOperationException("External waits require an idle mailbox") }
    for index in 0 ... externalWaitCount {
      if waitInfos[index + 1].semaphore == semaphore {
        waitInfos[index + 1].value = System.Math.Max(waitInfos[index + 1].value, value)
        return
      }
    }
    if externalWaitCount == ExternalSemaphoreCapacity { throw System.InvalidOperationException("External semaphore capacity reached") }
    waitInfos[externalWaitCount + 1] = VkSemaphoreSubmitInfo{
      sType: VkConstants.VK_STRUCTURE_TYPE_SEMAPHORE_SUBMIT_INFO,
      semaphore: semaphore,
      value: value,
      stageMask: VkConstants.VK_PIPELINE_STAGE_2_ALL_COMMANDS_BIT,
    }
    waitPins[externalWaitCount] = pin
    externalWaitCount++
  }

  internal func PreparePresent(swapchain VkSwapchainKHR, imageIndex uint32,
    waitSemaphore VkSemaphore, fence VkFence, fenceEnabled bool, damageRegion VulkanDamageRegion) {
      PresentSwapchain = swapchain
      PresentImageIndex = imageIndex
      PresentWaitSemaphore = waitSemaphore
      PresentFence = fence
      PresentFenceEnabled = fenceEnabled
      presentDamageRegion = damageRegion
    }

  internal func BeginSubmit() bool {
    if Interlocked.CompareExchange(
      ref phase, VulkanQueueMailboxPhase.SubmitQueued, VulkanQueueMailboxPhase.Idle)
    != VulkanQueueMailboxPhase.Idle{
      return false
    }
    syntheticDrainResult = VkConstants.VK_NOT_READY
    syntheticDrainPerformed = false
    return true
  }

  internal func BeginPresent() bool -> Interlocked.CompareExchange(
    ref phase, VulkanQueueMailboxPhase.PresentQueued, VulkanQueueMailboxPhase.SubmitComplete)
  == VulkanQueueMailboxPhase.SubmitComplete

  internal func CancelSubmit() bool -> Interlocked.CompareExchange(ref phase, VulkanQueueMailboxPhase.Idle,
    VulkanQueueMailboxPhase.SubmitQueued) == VulkanQueueMailboxPhase.SubmitQueued

  internal func ResetSubmitCompletion() {
    Interlocked.CompareExchange(ref phase, VulkanQueueMailboxPhase.Idle,
      VulkanQueueMailboxPhase.SubmitComplete)
  }

  internal func RetryPresent() {
    Interlocked.CompareExchange(ref phase, VulkanQueueMailboxPhase.SubmitComplete,
      VulkanQueueMailboxPhase.PresentQueued)
  }

  internal func TakeSubmitCompletion(out result VkResult) bool {
    if Interlocked.CompareExchange(
      ref phase, VulkanQueueMailboxPhase.SubmitComplete, VulkanQueueMailboxPhase.SubmitComplete)
    != VulkanQueueMailboxPhase.SubmitComplete{
      result = VkConstants.VK_NOT_READY
      return false
    }
    result = submitResult
    return true
  }

  internal func TakePresentCompletion(out result VkResult) bool {
    if Interlocked.CompareExchange(
      ref phase, VulkanQueueMailboxPhase.Idle, VulkanQueueMailboxPhase.PresentComplete)
    != VulkanQueueMailboxPhase.PresentComplete{
      result = VkConstants.VK_NOT_READY
      return false
    }
    result = presentResult
    return true
  }

  internal func RunSubmit(dispatch VkDeviceDispatch, queue VkQueue) {
    if Interlocked.CompareExchange(
      ref phase, VulkanQueueMailboxPhase.SubmitRunning, VulkanQueueMailboxPhase.SubmitQueued)
    != VulkanQueueMailboxPhase.SubmitQueued{
      return
    }
    if VulkanSharedRuntime.TakeTestGraphicsSubmissionFailure() {
      syntheticDrainResult = VulkanSharedRuntime.DrainTestGraphicsSubmissionFailure()
      syntheticDrainPerformed = true
      submitResult = if syntheticDrainResult == VkConstants.VK_SUCCESS {
        VkConstants.VK_ERROR_DEVICE_LOST
      } else {
        syntheticDrainResult
      }
      Interlocked.Exchange(ref phase, VulkanQueueMailboxPhase.SubmitComplete)
      return
    }
    waitInfos[0] = VkSemaphoreSubmitInfo{
      sType: VkConstants.VK_STRUCTURE_TYPE_SEMAPHORE_SUBMIT_INFO,
      semaphore: SubmitWaitSemaphore,
      stageMask: VkConstants.VK_PIPELINE_STAGE_2_ALL_COMMANDS_BIT,
    }
    signalInfos[0] = VkSemaphoreSubmitInfo{
      sType: VkConstants.VK_STRUCTURE_TYPE_SEMAPHORE_SUBMIT_INFO,
      semaphore: SubmitTimeline,
      value: SubmitSerial,
      stageMask: VkConstants.VK_PIPELINE_STAGE_2_ALL_COMMANDS_BIT,
    }
    if SubmitHasSignal {
      signalInfos[1] = VkSemaphoreSubmitInfo{}
      signalInfos[1].sType = VkConstants.VK_STRUCTURE_TYPE_SEMAPHORE_SUBMIT_INFO
      signalInfos[1].semaphore = SubmitSignalSemaphore
      signalInfos[1].stageMask = VkConstants.VK_PIPELINE_STAGE_2_ALL_COMMANDS_BIT
    }
    var commandInfo = VkCommandBufferSubmitInfo{}
    commandInfo.sType = VkConstants.VK_STRUCTURE_TYPE_COMMAND_BUFFER_SUBMIT_INFO
    commandInfo.commandBuffer = SubmitCommandBuffer
    var submitInfo = VkSubmitInfo2{}
    submitInfo.sType = VkConstants.VK_STRUCTURE_TYPE_SUBMIT_INFO_2
    submitInfo.waitSemaphoreInfoCount = uint32(externalWaitCount) + if SubmitHasWait { 1u } else { 0u }
    let hasCommand = SubmitCommandBuffer != nint(0)
    submitInfo.commandBufferInfoCount = if hasCommand { 1u } else { 0u }
    submitInfo.pCommandBufferInfos = if hasCommand { &commandInfo } else { nil }
    submitInfo.signalSemaphoreInfoCount = if SubmitHasSignal { 2u } else { 1u }
    let queueSubmit = dispatch.vkQueueSubmit2
    let recorder = TraceRecorder
    let start = if recorder != nil { Stopwatch.GetTimestamp() } else { 0L }
    fixed waits *VkSemaphoreSubmitInfo = waitInfos {
      fixed signals *VkSemaphoreSubmitInfo = signalInfos {
        submitInfo.pWaitSemaphoreInfos = if SubmitHasWait { waits } else { waits + 1 }
        submitInfo.pSignalSemaphoreInfos = signals
        submitResult = queueSubmit(queue, 1u, &submitInfo, 0uL)
      }
    }
    if let current = TraceRecorder {
      current.Duration(VulkanDiagnosticEventIds.Submit, VulkanDiagnosticCategories.Timing,
        TraceContext, start, Stopwatch.GetTimestamp(), result: int32(submitResult), source: "vkQueueSubmit2")
    }
    Interlocked.Exchange(ref phase, VulkanQueueMailboxPhase.SubmitComplete)
  }

  internal func RunPresent(dispatch VkDeviceDispatch, queue VkQueue) {
    if Interlocked.CompareExchange(
      ref phase, VulkanQueueMailboxPhase.PresentRunning, VulkanQueueMailboxPhase.PresentQueued)
    != VulkanQueueMailboxPhase.PresentQueued{
      return
    }
    var fenceInfo = VkSwapchainPresentFenceInfoEXT{}
    var presentFence VkFence
    var swapchain = PresentSwapchain
    var imageIndex = PresentImageIndex
    var waitSemaphore = PresentWaitSemaphore
    var presentInfo = VkPresentInfoKHR{}
    presentInfo.sType = VkConstants.VK_STRUCTURE_TYPE_PRESENT_INFO_KHR
    if PresentFenceEnabled {
      presentFence = PresentFence
      fenceInfo.sType = VkConstants.VK_STRUCTURE_TYPE_SWAPCHAIN_PRESENT_FENCE_INFO_EXT
      fenceInfo.swapchainCount = 1u
      fenceInfo.pFences = &presentFence
      presentInfo.pNext = *void(&fenceInfo)
    }
    var rectangle = VkRectLayerKHR{
      offset: VkOffset2D{x: presentDamageRegion.X, y: presentDamageRegion.Y},
      extent: VkExtent2D{width: uint32(presentDamageRegion.Width), height: uint32(presentDamageRegion.Height)},
    }
    var region = VkPresentRegionKHR{rectangleCount: 1u, pRectangles: &rectangle}
    var regions = VkPresentRegionsKHR{
      sType: VkConstants.VK_STRUCTURE_TYPE_PRESENT_REGIONS_KHR,
      pNext: presentInfo.pNext,
      swapchainCount: 1u,
      pRegions: &region,
    }
    if !presentDamageRegion.IsEmpty { presentInfo.pNext = *void(&regions) }
    presentInfo.waitSemaphoreCount = 1u
    presentInfo.pWaitSemaphores = &waitSemaphore
    presentInfo.swapchainCount = 1u
    presentInfo.pSwapchains = &swapchain
    presentInfo.pImageIndices = &imageIndex
    let queuePresent = dispatch.vkQueuePresentKHR
    let recorder = TraceRecorder
    let start = if recorder != nil { Stopwatch.GetTimestamp() } else { 0L }
    presentResult = queuePresent(queue, &presentInfo)
    if let current = TraceRecorder {
      current.Duration(VulkanDiagnosticEventIds.SwapchainPresent, VulkanDiagnosticCategories.Timing,
        TraceContext, start, Stopwatch.GetTimestamp(), result: int32(presentResult), source: "vkQueuePresentKHR")
    }
    Interlocked.Exchange(ref phase, VulkanQueueMailboxPhase.PresentComplete)
  }

  internal func FailSubmit(result VkResult) {
    submitResult = result
    Interlocked.Exchange(ref phase, VulkanQueueMailboxPhase.SubmitComplete)
  }

  internal func FailPresent(result VkResult) {
    presentResult = result
    Interlocked.Exchange(ref phase, VulkanQueueMailboxPhase.PresentComplete)
  }
}
