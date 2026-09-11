package Goo

import System
import System.Diagnostics
import System.Threading

internal class ThrowingQueueWakeHost : VulkanSurfaceHost {
  private var throwNext int32 = 1
  private var throws int32
  private var wakes int32

  internal prop Throws int32{ get -> Interlocked.CompareExchange(ref throws, 0, 0) }
  internal prop Wakes int32{ get -> Interlocked.CompareExchange(ref wakes, 0, 0) }

  public prop LogicalWidth int32{ get -> 1 }
  public prop LogicalHeight int32{ get -> 1 }
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
