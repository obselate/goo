package GooAsyncReadbackSmoke

import System
import System.Diagnostics
import System.IO
import System.Threading
import Goo
import GooReadbackFixture

class PendingPathReadinessCell : Cell {
  private let clip VectorPath

  shared {
    let CoveredPath VectorPath = PathBuilder()
      .MoveTo(0.5, 0.0).LineTo(1.0, 0.5)
      .LineTo(0.5, 1.0).LineTo(0.0, 0.5).Close().Build()
    let UncoveredPath VectorPath = PathBuilder()
      .MoveTo(0.0, 0.0).LineTo(1.0, 0.0)
      .LineTo(0.5, 1.0).Close().Build()
  }

  init(path VectorPath) {
    clip = path
  }

  override func Build() Blob -> Container {
    Width: Length.Percent(100),
    Height: Length.Percent(100),
    ClipPath: clip,
    ClipPathFit: ShapeFit.Fill,
    BackgroundColor: Color.Rgb(48, 208, 112),
  }
}

class RoundedResizeFirstFrameCell : Cell {
  override func Build() Blob -> Container {
    Width: Length.Percent(100),
    Height: Length.Percent(100),
    BorderRadius: 24,
    OverflowX: Overflow.Hidden,
    OverflowY: Overflow.Hidden,
    BackgroundColor: Color.Rgb(220, 48, 64),
    Children: {
      Container{
        Width: Length.Percent(100),
        Height: Length.Percent(100),
        BackgroundColor: Color.Rgb(48, 208, 112),
      },
    },
  }
}

func RoundedResizeCaptureFirstFrame(window Window, metrics WindowMetrics)
VulkanReadbackResult{
  let staged = WindowReadbackTestFixture.Request(window,
    uint32(metrics.FramebufferWidth), uint32(metrics.FramebufferHeight))
  Require(staged == WindowReadbackRequestStatus.NotReady,
    "Rounded resize first frame was not staged: " + staged.ToString())
  WindowReadbackTestFixture.DrainWindowQueue(window, 10000)
  let accepted = WindowReadbackTestFixture.Request(window,
    uint32(metrics.FramebufferWidth), uint32(metrics.FramebufferHeight))
  Require(accepted == WindowReadbackRequestStatus.Accepted,
    "Rounded resize first frame readback was not accepted: " + accepted.ToString())
  ReadbackAwaitReadbackReady(window, 10000)
  let result = ReadbackTakeReadback(window)
  PrimitiveValidateResult(result, metrics)
  return result
}

func RoundedResizeRequireFirstFrame(result VulkanReadbackResult,
  metrics WindowMetrics, iteration int32) {
    PrimitiveRequirePixelNear(result.Pixels, result.Width, metrics,
      float64(metrics.LogicalWidth) * 0.5,
      float64(metrics.LogicalHeight) * 0.5,
      uint8(48), uint8(208), uint8(112), 8,
      "rounded_resize_child_" + iteration.ToString())
    PrimitiveRequirePixelNear(result.Pixels, result.Width, metrics,
      1.0, 1.0, uint8(12), uint8(20), uint8(32), 8,
      "rounded_resize_corner_" + iteration.ToString())
  }

func RoundedResizeClose(window Window) {
  if window.IsOpen {
    window.RequestClose()
    WindowReadbackTestFixture.Pump(window, 0.0)
    Require(!window.IsOpen, "Path readiness probe window did not close")
  }
}

func RunPendingPathReadinessSmoke() {
  let submitted = Window{
    Title: "Goo submitted path readiness",
    Width: 180,
    Height: 120,
    VSync: false,
    Root: PendingPathReadinessCell(PendingPathReadinessCell.CoveredPath),
  }
  let covered = Window{
    Title: "Goo covered path probe",
    Width: 180,
    Height: 120,
    VSync: false,
    Root: PendingPathReadinessCell(PendingPathReadinessCell.CoveredPath),
  }
  let uncovered = Window{
    Title: "Goo uncovered path probe",
    Width: 180,
    Height: 120,
    VSync: false,
    Root: PendingPathReadinessCell(PendingPathReadinessCell.UncoveredPath),
  }
  try {
    submitted.Open()
    covered.Open()
    uncovered.Open()
    WindowReadbackTestFixture.UpdateTreeOnly(submitted, 0.0)
    WindowReadbackTestFixture.UpdateTreeOnly(covered, 0.0)
    WindowReadbackTestFixture.UpdateTreeOnly(uncovered, 0.0)

    WindowReadbackTestFixture.RuntimeHoldNextQueuePresent(submitted)
    WindowReadbackTestFixture.ForceRenderNonblocking(submitted, 0.0)
    let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 2L
    var held = false
    while Stopwatch.GetTimestamp() < deadline {
      WindowReadbackTestFixture.PollQueueCompletion(submitted)
      if WindowReadbackTestFixture.RuntimeWaitForHeldQueueCall(submitted, 10) {
        held = true
        break
      }
      Thread.Yield()
    }
    Require(held, "Submitted path upload did not reach the held present")
    let pending = WindowReadbackTestFixture.PathResources(submitted)
    Require(pending.UploadPending && pending.UploadSubmitted
        && pending.WordCount > pending.PublishedWordPrefix,
      "Submitted path upload was not pending publication")

    let coveredProbe = WindowReadbackTestFixture.CompilePathProbe(
      submitted, covered)
    Require(!coveredProbe.PathResourceDeferred
        && coveredProbe.PathClipCount == 1
        && coveredProbe.ClipMaskCount == 1,
      "Submitted path range was not renderable on the next compile")

    let uncoveredProbe = WindowReadbackTestFixture.CompilePathProbe(
      submitted, uncovered)
    Require(uncoveredProbe.PathResourceDeferred
        && uncoveredProbe.PathClipCount == 1
        && uncoveredProbe.ClipMaskCount == 0,
      "Uncovered path geometry did not defer the compile")
    let extended = WindowReadbackTestFixture.PathResources(submitted)
    Require(extended.UploadPending && extended.UploadSubmitted
        && extended.WordCount > extended.QueuedWordPrefix,
      "Uncovered path geometry was not outside the submitted range")
  } finally {
    WindowReadbackTestFixture.RuntimeReleaseHeldQueueCall()
    if submitted.IsOpen {
      WindowReadbackTestFixture.DrainWindowQueue(submitted, 10000)
    }
    RoundedResizeClose(uncovered)
    RoundedResizeClose(covered)
    RoundedResizeClose(submitted)
  }
}

func RunRoundedResizeFirstFrameSmoke() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let capturedError = StringWriter()
  let originalError = Console.Error
  var window Window? = nil
  try {
    Console.SetError(capturedError)
    RunPendingPathReadinessSmoke()
    let opened = Window{
      Title: "Goo rounded resize first frame gate",
      Width: 300,
      Height: 170,
      VSync: false,
      Background: Color.Rgb(12, 20, 32),
      Root: RoundedResizeFirstFrameCell{},
    }
    window = opened
    opened.Open()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    WindowReadbackTestFixture.ForceRender(opened, 0.0)

    let widths = []int32{ 244, 332, 276, 360 }
    let heights = []int32{ 142, 188, 154, 202 }
    var iteration int32 = 0
    while iteration < widths.Length {
      let width = widths[iteration]
      let height = heights[iteration]
      Require(WindowReadbackTestFixture.Resize(
          opened, width, height, width, height),
        "Rounded resize synthetic resize failed at " + iteration.ToString())
      WindowReadbackTestFixture.UpdateTreeOnly(opened, 0.0)
      let metrics = WindowReadbackTestFixture.Metrics(opened)
      Require(metrics.LogicalWidth == width && metrics.LogicalHeight == height
          && metrics.FramebufferWidth == width && metrics.FramebufferHeight == height,
        "Rounded resize metrics were incorrect at " + iteration.ToString())
      let result = RoundedResizeCaptureFirstFrame(opened, metrics)
      RoundedResizeRequireFirstFrame(result, metrics, iteration)
      iteration++
    }

    Require(WindowReadbackTestFixture.RequestCount(opened) == uint64(widths.Length)
        && WindowReadbackTestFixture.CompletionCount(opened) == uint64(widths.Length),
      "Rounded resize readback lifecycle counts are incorrect")
    opened.RequestClose()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    Require(!opened.IsOpen, "Rounded resize first frame window did not close")
    Require(WindowReadbackTestFixture.ResidentResourceBytes(opened) == 0uL,
      "Rounded resize readback resources remain resident after close")
  } finally {
    Console.SetError(originalError)
    if let active = window {
      if active.IsOpen {
        active.RequestClose()
        WindowReadbackTestFixture.ForceRender(active, 0.0)
      }
    }
  }
  ReadbackValidateCommonDiagnostics(capturedError.ToString())
  Console.WriteLine("rounded-resize-first-frame-gate: covered_submitted=1 uncovered_deferred=1 resizes=4 first_frames=4 children=visible corners=rounded close=1")
}
