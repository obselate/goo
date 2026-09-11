package Goo

import System
import System.Diagnostics
import System.Threading

internal partial class VulkanWindowTarget {
  internal prop EmbeddedSubmitCompletionServiceReadyForTest bool{
    get -> queueStage == QueueStageSubmit
      && queueMailbox?.Phase == VulkanQueueMailboxPhase.SubmitComplete
      && runtime?.QueueWorker.HasOutstandingWork != true
  }
  internal prop EmbeddedPresentCompletionReadyForTest bool{
    get -> queueMailbox?.Phase == VulkanQueueMailboxPhase.PresentComplete
  }
}

internal class EmbeddedSmokeCell : Cell, IDisposable {
  internal var Builds int32
  internal var Disposals int32
  internal var Red bool

  public override func Build() Blob {
    Builds++
    return Container{
      Width: Length.Percent(100), Height: Length.Percent(100),
      BackgroundColor: Red ? Color.Rgb(180, 20, 30) : Color.Rgb(10, 40, 90),
    }
  }
  public func Dispose() { Disposals++ }
}

internal open class EmbeddedSmokeHost : EmbeddedWindowHost {
  private var native SdlHost?
  internal var Creates int32
  internal var Destroys int32
  internal var Wakes int32
  private var serviceableSubmissionWakes int32

  internal prop ServiceableSubmissionWakes int32{
    get -> Interlocked.CompareExchange(ref serviceableSubmissionWakes, 0, 0)
  }

  internal func CreateNative() {
    native = SdlHost("Goo embedded lifecycle", 64, 64, 0, 0, false,
      WindowState.Normal, true, false, false, true,
      (x int32, y int32) -> WindowHitResult.Normal)
    native!!.Show()
  }
  internal func DestroyNative() {
    native?.Dispose()
    native = nil
  }
  protected override func RequestFrame() {
    if Window?.CaptureTargetForTest()?.EmbeddedSubmitCompletionServiceReadyForTest == true {
      Interlocked.Increment(ref serviceableSubmissionWakes)
    }
    Interlocked.Increment(ref Wakes)
  }
  protected override func LoadVulkanLibrary() bool -> native!!.LoadVulkanLibrary()
  protected override func GetVulkanGetInstanceProcAddr() nint -> native!!.GetVulkanGetInstanceProcAddr()
  protected override func UnloadVulkanLibrary() { native!!.UnloadVulkanLibrary() }
  protected override func GetVulkanInstanceExtensions() []string -> native!!.GetVulkanInstanceExtensions()
  protected override func GetNativeHandle() nint -> native!!.WindowHandle
  protected override func CreateVulkanSurface(instance nint, out surface uint64) bool {
    let result = native!!.CreateVulkanSurface(instance, out surface)
    if result { Creates++ }
    return result
  }
  protected override func DestroyVulkanSurface(instance nint, surface uint64) {
    native!!.DestroyVulkanSurface(instance, surface)
    Destroys++
  }
}

internal class EmbeddedHostSmoke {
  shared {
    private func Require(value bool, message string) {
      if !value { throw InvalidOperationException(message) }
    }

    private func Settle(host EmbeddedSmokeHost) {
      let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 10
      while Stopwatch.GetTimestamp() < deadline {
        host.RenderFrame(0.016)
        if Double.IsPositiveInfinity(host.NextFrameDelaySeconds) { return }
        Thread.Sleep(1)
      }
      throw InvalidOperationException("Embedded viewport did not become idle")
    }

    private func Capture(window Window, host EmbeddedSmokeHost, red bool) {
      let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 10
      var requested bool
      while Stopwatch.GetTimestamp() < deadline {
        host.RenderFrame(0.016)
        if !requested {
          requested = window.RequestDiagnosticsCapture() == WindowReadbackRequestStatus.Accepted
        }
        if requested {
          if let image = window.PollDiagnosticsCapture() {
            let expectedRed = red ? uint8(180) : uint8(10)
            Require(image.Width == 64u && image.Height == 64u,
              "Embedded capture lost framebuffer dimensions")
            let pixel = int32(image.RowBytes) * 32 + 32 * 4
            Require(Math.Abs(int32(image.Pixels[pixel]) - int32(expectedRed)) <= 2
                && image.Pixels[pixel + 3] == uint8(255),
              "Embedded capture did not preserve retained content")
            return
          }
        }
        Thread.Sleep(1)
      }
      throw InvalidOperationException("Embedded capture did not complete")
    }

    private func VerifyPendingInvalidation(window Window, host EmbeddedSmokeHost,
      root EmbeddedSmokeCell) {
        WindowReadbackTestFixture.RuntimeHoldNextQueuePresent(window)
        try {
          window.Post(() -> {
            root.Red = true
            root.Rebuild()
          })
          let heldDeadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 10
          var held bool
          while Stopwatch.GetTimestamp() < heldDeadline {
            host.RenderFrame(0.016)
            if WindowReadbackTestFixture.RuntimeWaitForHeldQueueCall(window, 10) {
              held = true
              break
            }
          }
          Require(held, "Embedded frame did not reach held presentation")
          window.Post(() -> {
            root.Red = false
            root.Rebuild()
          })
          host.RenderFrame(0.016)
          Require(root.Builds == 3 && window.RenderPending(),
            "Embedded dispatch did not retain a newer frame while presentation was pending")
          let previousFrame = window.DiagnosticFrameIdForTest()
          WindowReadbackTestFixture.RuntimeReleaseHeldQueueCall()
          let completedDeadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 10
          while window.CaptureTargetForTest()?.EmbeddedPresentCompletionReadyForTest != true
            && Stopwatch.GetTimestamp() < completedDeadline{
              Thread.Sleep(1)
            }
          Require(window.CaptureTargetForTest()?.EmbeddedPresentCompletionReadyForTest == true,
            "Embedded presentation did not complete")
          host.RenderFrame(0.016)
          Require(window.DiagnosticFrameIdForTest() > previousFrame,
            "Completion of an older frame discarded a newer embedded invalidation")
          Settle(host)
          Capture(window, host, false)
          Settle(host)
        } finally {
          WindowReadbackTestFixture.RuntimeReleaseHeldQueueCall()
        }
      }

    private func VerifyPendingSubmissionService(window Window, host EmbeddedSmokeHost,
      root EmbeddedSmokeCell) {
        Settle(host)
        let baselineBuilds = root.Builds
        let baselineServiceableWakes = host.ServiceableSubmissionWakes
        WindowReadbackTestFixture.RuntimeHoldNextQueueSubmit(window)
        try {
          WindowReadbackTestFixture.ForceRenderNonblocking(window, 0.0)
          Require(WindowReadbackTestFixture.RuntimeWaitForHeldQueueCall(window, 2000),
            "Embedded frame did not reach held submission")
          WindowReadbackTestFixture.RuntimeReleaseHeldQueueCall()
          let submitDeadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 10
          while host.ServiceableSubmissionWakes == baselineServiceableWakes
            && Stopwatch.GetTimestamp() < submitDeadline{
              Thread.Sleep(1)
            }
          Require(host.ServiceableSubmissionWakes > baselineServiceableWakes,
            "Queue worker woke the embedded host before clearing outstanding work")
          while window.CaptureTargetForTest()?.EmbeddedSubmitCompletionServiceReadyForTest
          != true && Stopwatch.GetTimestamp() < submitDeadline{
            Thread.Sleep(1)
          }
          Require(window.CaptureTargetForTest()?.EmbeddedSubmitCompletionServiceReadyForTest
            == true,
            "Embedded submission did not become serviceable")
          WindowReadbackTestFixture.RuntimeHoldNextQueuePresent(window)
          let frameBeforeService = window.DiagnosticFrameIdForTest()
          Require(host.ServicePendingSubmission(),
            "Embedded host did not consume completed submission")
          Require(window.DiagnosticFrameIdForTest() == frameBeforeService
              && root.Builds == baselineBuilds,
            "Submission service performed a frame pump")
          Require(WindowReadbackTestFixture.RuntimeWaitForHeldQueueCall(window, 2000),
            "Submission service did not enqueue presentation")
          root.Red = !root.Red
          root.Rebuild()
          WindowReadbackTestFixture.RuntimeReleaseHeldQueueCall()
          let presentDeadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 10
          while window.CaptureTargetForTest()?.EmbeddedPresentCompletionReadyForTest
          != true && Stopwatch.GetTimestamp() < presentDeadline{
            Thread.Sleep(1)
          }
          Require(window.CaptureTargetForTest()?.EmbeddedPresentCompletionReadyForTest == true,
            "Embedded presentation did not complete")
          Require(!host.ServicePendingSubmission()
              && window.CaptureTargetForTest()?.EmbeddedPresentCompletionReadyForTest == true,
            "Submission service consumed presentation completion")
          let frameBeforePump = window.DiagnosticFrameIdForTest()
          host.RenderFrame(0.016)
          Require(window.CaptureTargetForTest()?.EmbeddedPresentCompletionReadyForTest != true,
            "Normal embedded pump did not consume presentation completion")
          Require(root.Builds == baselineBuilds + 1
              && window.DiagnosticFrameIdForTest() > frameBeforePump,
            "Normal embedded pump did not render pending invalidation")
          Settle(host)
        } finally {
          WindowReadbackTestFixture.RuntimeReleaseHeldQueueCall()
        }
      }

    internal func Run() {
      let host = EmbeddedSmokeHost()
      let root = EmbeddedSmokeCell()
      let window = Window{ Root: root }
      try {
        host.Resize(32, 32, 64, 64)
        window.Attach(host)
        host.RenderFrame(0.0)
        let mounted = window.Tree
        Require(mounted != nil && root.Builds == 1, "Embedded Cell did not mount")
        Require(Double.IsPositiveInfinity(host.NextFrameDelaySeconds),
          "Detached viewport did not remain idle")
        let initialMetrics = window.CurrentWindowMetrics()
        Require(initialMetrics.LogicalWidth == 32 && initialMetrics.FramebufferWidth == 64
            && initialMetrics.DisplayScaleX == 2.0,
          "Embedded density did not use separate logical and framebuffer dimensions")
        host.CreateNative()
        host.AttachPresentation()
        Settle(host)
        Capture(window, host, false)
        Settle(host)
        VerifyPendingInvalidation(window, host, root)
        host.SetFocused(true)
        host.Suspend()
        host.RenderFrame(10.0)
        Require(!window.IsFocused && Double.IsPositiveInfinity(host.NextFrameDelaySeconds),
          "Suspended viewport retained focus or frame demand")
        host.DetachPresentation()
        Require(host.Destroys == 1 && !host.IsPresentationAttached,
          "Surface detach did not release Vulkan presentation")
        host.DestroyNative()
        Require(window.Tree == mounted && root.Disposals == 0,
          "Surface detach disposed or replaced the mounted Cell")
        window.Post(() -> {
          root.Red = true
          root.Rebuild()
        })
        host.RenderFrame(0.0)
        Require(root.Builds == 4 && window.Tree == mounted,
          "Suspended dispatch did not update the retained Cell")
        host.Resize(64, 64, 64, 64)
        host.CreateNative()
        host.AttachPresentation()
        host.Resume()
        Settle(host)
        Capture(window, host, true)
        Require(root.Builds == 4 && root.Disposals == 0 && host.Creates == 2,
          "Presentation recreation remounted application state")
        VerifyPendingSubmissionService(window, host, root)
        host.DetachPresentation()
        Require(host.Destroys == 2, "Replacement Vulkan surface was not released")
        host.DestroyNative()
        host.Dispose()
        Require(root.Disposals == 1 && !window.IsOpen,
          "Final host disposal did not dispose the retained Cell exactly once")
        Console.WriteLine("embedded-host: density=verified idle=verified pending_invalidation=verified pending_submission_service=verified suspend=verified surfaces=2 retained_state=verified pixels=verified")
      } finally {
        host.Dispose()
        host.DestroyNative()
      }
    }
  }
}
