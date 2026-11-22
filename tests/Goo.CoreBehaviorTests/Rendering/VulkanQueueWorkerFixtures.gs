package Goo

import System
import System.Diagnostics
import System.Runtime.CompilerServices
import System.Runtime.InteropServices
import System.Threading
import System.Threading.Tasks

internal class ThrowingQueueWakeHost : VulkanSurfaceHost {
  private var throwNext int32 = 1
  private var throws int32
  private var wakes int32

  internal prop Throws int32{ get -> Interlocked.CompareExchange(ref throws, 0, 0) }
  internal prop Wakes int32{ get -> Interlocked.CompareExchange(ref wakes, 0, 0) }

  public prop LogicalWidth int32{ get -> 1 }
  public prop LogicalHeight int32{ get -> 1 }
  public prop FramebufferWidth int32{ get -> 1 }
  public prop FramebufferHeight int32{ get -> 1 }
  public prop Transparent bool{ get -> false }
  public prop VSync bool{ get -> true }
  public prop WindowHandle nint{ get -> nint(0) }
  public prop PreferRequestedFramebufferExtent bool{ get -> false }
  public prop AllowInheritedCompositeAlpha bool{ get -> false }

  public func Wake() {
    if Interlocked.Exchange(ref throwNext, 0) != 0 {
      Interlocked.Increment(ref throws)
      throw InvalidOperationException("queue wake failure probe")
    }
    Interlocked.Increment(ref wakes)
  }
  public func RefreshDisplayPacing(reset bool) { }
  public func LoadVulkanLibrary() bool -> false
  public func RetainVulkanLibrary() Action -> () -> { }
  public func GetVulkanGetInstanceProcAddr() nint -> nint(0)
  public func UnloadVulkanLibrary() { }
  public func GetVulkanInstanceExtensions() []string -> []string {}
  public func CreateVulkanSurface(instance nint, out surface uint64) bool {
    surface = 0uL
    return false
  }
  public func DestroyVulkanSurface(instance nint, surface uint64) { }
}

internal unsafe class VulkanQueueWorkerFixtures {
  shared {
    private let submitReleased ManualResetEventSlim = ManualResetEventSlim(true)

    @UnmanagedCallersOnly(CallConvs = []Type{typeof(CallConvCdecl)})
    private func Submit(queue VkQueue, count uint32, info *VkSubmitInfo2, fence VkFence) VkResult {
      submitReleased.Wait()
      return VkConstants.VK_SUCCESS
    }

    @UnmanagedCallersOnly(CallConvs = []Type{typeof(CallConvCdecl)})
    private func Present(queue VkQueue, info *VkPresentInfoKHR) VkResult -> VkConstants.VK_SUCCESS
  }

  internal func StopTimesOutOnlyDuringPresent() bool {
    let boundMs = 100
    let dispatch = VkDeviceDispatch{
      vkQueueSubmit2: cast[unmanaged[Cdecl](VkQueue, uint32, *VkSubmitInfo2, VkFence) -> VkResult](nint(&Submit)),
      vkQueuePresentKHR: cast[unmanaged[Cdecl](VkQueue, *VkPresentInfoKHR) -> VkResult](nint(&Present)),
    }
    using let submitWorker = VulkanQueueWorker(nint(1), dispatch, 1uL)
    let submit = VulkanQueueMailbox(nil)
    submit.PrepareSubmit(nint(0), 0uL, 0uL)
    VulkanQueueWorker.HoldSubmitForMailboxForTest(submit)
    submitReleased.Reset()
    var stopped = false
    let stopSubmit = Thread(() -> { stopped = submitWorker.Stop(boundMs) })
    stopSubmit.IsBackground = true
    try {
      if !submit.BeginSubmit() || !submitWorker.EnqueueSubmit(submit, (serial uint64) -> { })
        || !VulkanQueueWorker.WaitForHeldQueueCallForTest(5000) { return false }
      stopSubmit.Start()
      if !SpinWait.SpinUntil(() -> !stopSubmit.IsAlive
        || (int32(stopSubmit.ThreadState) & int32(System.Threading.ThreadState.WaitSleepJoin)) != 0, 5000) {
        return false
      }
      if stopSubmit.Join(boundMs * 3) {
        throw InvalidOperationException("Stop returned before the held submit was released")
      }
    } finally {
      submitReleased.Set()
      VulkanQueueWorker.ReleaseHeldQueueCallForTest()
    }
    if !stopSubmit.Join(5000) || !stopped || submitWorker.HasOutstandingWork
      || submit.Phase != VulkanQueueMailboxPhase.SubmitComplete || submit.SubmitResult != VkConstants.VK_SUCCESS {
      return false
    }

    using let presentWorker = VulkanQueueWorker(nint(1), dispatch, 1uL)
    let present = VulkanQueueMailbox(nil)
    present.FailSubmit(VkConstants.VK_SUCCESS)
    present.PreparePresent(0uL, 0u, 0uL, 0uL, false)
    VulkanQueueWorker.HoldPresentForMailboxForTest(present)
    try {
      if !present.BeginPresent() || !presentWorker.EnqueuePresent(present)
        || !VulkanQueueWorker.WaitForHeldQueueCallForTest(5000) { return false }
      let stopPresent = Task.Run[bool](() -> {
        let elapsed = Stopwatch.StartNew()
        return !presentWorker.Stop(boundMs) && elapsed.ElapsedMilliseconds >= boundMs - 10
      })
      return stopPresent.Wait(5000) && stopPresent.Result && presentWorker.HasOutstandingWork
    } finally {
      VulkanQueueWorker.ReleaseHeldQueueCallForTest()
    }
  }

  internal func WakeFailureDrainsFollowingMailboxAndQuiesces() bool {
    let host = ThrowingQueueWakeHost()
    using let worker = VulkanQueueWorker(nint(1), VkDeviceDispatch{}, 1uL)
    worker.MarkFaulted()
    let first = worker.CreateMailbox(host)
    let second = worker.CreateMailbox(host)
    first.PrepareSubmit(nint(0), 0uL, 0uL)
    second.PrepareSubmit(nint(0), 0uL, 0uL)
    if !first.BeginSubmit() || !second.BeginSubmit() { return false }
    if !worker.EnqueueSubmit(first, (serial uint64) -> {
      if serial == 0uL { throw InvalidOperationException("serial") }
    }) || !worker.EnqueueSubmit(second, (serial uint64) -> {
      if serial == 0uL { throw InvalidOperationException("serial") }
    }) {
      return false
    }
    let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 10
    while (first.Phase != VulkanQueueMailboxPhase.SubmitComplete
        || second.Phase != VulkanQueueMailboxPhase.SubmitComplete
        || worker.HasOutstandingWork) && Stopwatch.GetTimestamp() < deadline{
          Thread.Sleep(1)
        }
    if first.Phase != VulkanQueueMailboxPhase.SubmitComplete
      || second.Phase != VulkanQueueMailboxPhase.SubmitComplete
      || first.SubmitResult != VkConstants.VK_ERROR_DEVICE_LOST
      || second.SubmitResult != VkConstants.VK_ERROR_DEVICE_LOST
      || worker.HasOutstandingWork{
        return false
      }
    worker.QuiesceAfterDeviceLoss()
    return host.Throws == 1 && host.Wakes == 1
  }
}
