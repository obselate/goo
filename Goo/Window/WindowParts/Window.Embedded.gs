package Goo

import System
import System.Diagnostics
import System.Threading

internal class WindowOwnerThread {
  shared {
    private let gate object = Object()
    private var threadId int32
    private var windowCount int32

    internal func Acquire() int32 {
      lock gate {
        let current = Environment.CurrentManagedThreadId
        if windowCount != 0 && current != threadId {
          throw InvalidOperationException("All live Goo windows must share one owner thread")
        }
        threadId = current
        windowCount++
        return current
      }
    }

    internal func Release() {
      lock gate {
        windowCount--
        if windowCount == 0 { threadId = 0 }
      }
    }
  }
}

/// Hosts a Goo tree on its application's owner thread.
public partial class Window {
  private var embeddedHost EmbeddedWindowHost?
  private var ownerThreadId int32
  private var ownerThreadRegistered bool
  private var resumedFrame bool

  /// Attaches this window to an external viewport without creating a desktop window.
  /// The host attaches its native presentation surface separately and drives RenderFrame.
  public func Attach(externalHost EmbeddedWindowHost) Window {
    if externalHost == nil { throw ArgumentNullException("externalHost") }
    requireUiThread("Window.Attach")
    if IsOpen { throw InvalidOperationException("Window is already open") }
    ownerThreadId = WindowOwnerThread.Acquire()
    ownerThreadRegistered = true
    uiThreadBound = true
    try {
      let bridge = externalHost.Bind(this)
      embeddedHost = externalHost
      host = bridge
      prepare()
      configureHost(bridge)
      input.Attach(bridge)
      IsOpen = true
      queueNativeMetrics(bridge.LogicalWidth, bridge.LogicalHeight,
        bridge.FramebufferWidth, bridge.FramebufferHeight)
      consumeNativeMetrics()
      Window.RegisterLiveWindow(this)
      WindowDiagnostics.AttachIfEnabled(this)
      bridge.Wake()
      return this
    } catch (error Exception) {
      try { Close() } catch (cleanup Exception) { }
      throw error
    }
  }

  internal prop ExternallyDriven bool{ get -> embeddedHost != nil }

  internal prop EmbeddedPresentationAttached bool{ get -> windowTarget != nil }

  internal func RequireEmbeddedThread() { requireUiThread("EmbeddedWindowHost") }

  internal func AttachEmbeddedPresentation() {
    guard let externalHost = embeddedHost, let bridge = externalHost.Bridge else {
      throw InvalidOperationException("Window is not attached to an embedded host")
    }
    if windowTarget != nil { throw InvalidOperationException("Presentation surface is already attached") }
    let target = VulkanWindowTarget(bridge)
    try {
      if !target.Resize(bridge.FramebufferWidth, bridge.FramebufferHeight) {
        throw InvalidOperationException("Embedded presentation surface could not be sized")
      }
      windowTarget = target
      profiler.Sink = target.ProfileSink
      queueNativeMetrics(bridge.LogicalWidth, bridge.LogicalHeight,
        bridge.FramebufferWidth, bridge.FramebufferHeight)
      consumeNativeMetrics()
      requestRender()
    } catch (error Exception) {
      target.Dispose()
      throw error
    }
  }

  internal func DetachEmbeddedPresentation() {
    guard let target = windowTarget else { return }
    while target.QueueWorkPending {
      target.PollQueueCompletion()
      Thread.Yield()
    }
    target.Dispose()
    profiler.Sink = nil
    windowTarget = nil
    requestRender()
  }

  internal func PumpEmbedded(dt float64, suspended bool) {
    let simulationDt = if suspended || resumedFrame { 0.0 } else { dt }
    resumedFrame = false
    pumpCore(dt, false, !suspended && windowTarget != nil
        && framebufferWidth > 0 && framebufferHeight > 0, simulationDt)
  }

  internal func ResetEmbeddedClock() {
    schedulerLastTicks = float64(Stopwatch.GetTimestamp())
    schedulerSimulationBank = 0.0
    resumedFrame = true
    requestRender()
  }

  internal func EmbeddedFrameDelay(suspended bool) float64 {
    if !IsOpen { return Double.PositiveInfinity }
    if SchedulerHasImmediateService() || pendingMetrics || pendingRebuild != 0
      || pendingImageCompletion != 0 || pendingRetainedInvalidation != 0 || (dirty && Root != nil) {
        return 0.0
      }
    if suspended || windowTarget == nil || framebufferWidth <= 0 || framebufferHeight <= 0 {
      return Double.PositiveInfinity
    }
    if hasDemand() { return 0.0 }
    return input.NextTickDeadlineSeconds()
  }
}
