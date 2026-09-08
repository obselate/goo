package GooAsyncReadbackSmoke

import System
import System.Diagnostics
import System.IO
import System.Threading
import Goo
import GooReadbackFixture

func ClipCaptureReadback(window Window, metrics WindowMetrics)
VulkanReadbackResult{
  let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 10L
  var status = WindowReadbackTestFixture.Request(window,
    uint32(metrics.FramebufferWidth), uint32(metrics.FramebufferHeight))
  while status == WindowReadbackRequestStatus.Busy
    || status == WindowReadbackRequestStatus.NotReady{
      if Stopwatch.GetTimestamp() >= deadline {
        throw InvalidOperationException(
          "Clip capture readback request did not become accepted")
      }
      WindowReadbackTestFixture.Pump(window, 0.0)
      Thread.Yield()
      status = WindowReadbackTestFixture.Request(window,
        uint32(metrics.FramebufferWidth), uint32(metrics.FramebufferHeight))
    }
  Require(status == WindowReadbackRequestStatus.Accepted,
    "Clip capture readback was not accepted: " + status.ToString())
  ReadbackAwaitReadbackReady(window, 10000)
  let result = ReadbackTakeReadback(window)
  PrimitiveValidateResult(result, metrics)
  return result
}

func RunClipCaptureSmoke() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let fontPath = Path.Combine(AppContext.BaseDirectory, "VendSans-VariableFont_wght.ttf")
  Require(File.Exists(fontPath), "Clip capture text font asset is missing")
  let font = FontSource("ReadbackGateFont", 400, false, File.ReadAllBytes(fontPath))
  font.Register()
  let root = RoundedOverflowCell{}
  let capturedError = StringWriter()
  let originalError = Console.Error
  var window Window? = nil
  try {
    let opened = Window{
      Title: "Goo clip capture submission gate",
      Width: 400,
      Height: 190,
      VSync: false,
      Root: root,
    }
    window = opened
    Console.SetError(capturedError)
    opened.Open()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    let metrics = WindowReadbackTestFixture.Metrics(opened)
    Require(RoundedOverflowCell.ClipOuter.IsMounted
        && RoundedOverflowCell.ClipInner.IsMounted,
      "Clip capture scene did not mount nested clip paths")

    let first = ClipCaptureReadback(opened, metrics)
    let growth = WindowReadbackTestFixture.VerifyClipMaskAtlasGrowth(opened)
    Require(growth.ActiveLayerCount == 8u
        && growth.MaximumLayerCount == 8u
        && growth.UniqueLayerMask == 255u
        && growth.IncrementalGrowth
        && growth.GenerationPreserved
        && growth.ImagePreserved
        && growth.Reacquired
        && growth.FailureObserved
        && growth.PressureFailureCount == 1uL,
      "Clip mask atlas growth and failure recovery did not qualify")
    let staged = WindowReadbackTestFixture.Request(opened,
      uint32(metrics.FramebufferWidth), uint32(metrics.FramebufferHeight))
    Require(staged == WindowReadbackRequestStatus.NotReady,
      "Clip capture second prerequisite frame was not staged: " + staged.ToString())
    WindowReadbackTestFixture.DrainWindowQueue(opened, 10000)

    let accepted = WindowReadbackTestFixture.Request(opened,
      uint32(metrics.FramebufferWidth), uint32(metrics.FramebufferHeight))
    Require(accepted == WindowReadbackRequestStatus.Accepted,
      "Clip capture second readback was not accepted: " + accepted.ToString())
    let submissionDeadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 2L
    while !WindowReadbackTestFixture.SubmissionReadyForReconcile(opened)
      && Stopwatch.GetTimestamp() < submissionDeadline{
        Thread.Yield()
      }
    Require(WindowReadbackTestFixture.SubmissionReadyForReconcile(opened),
      "Clip capture offscreen submit did not complete before reconciliation")

    WindowReadbackTestFixture.SetForceFullRedraw(opened, true)
    var frame int32 = 0
    while frame < 4 {
      WindowReadbackTestFixture.ForceRenderNonblocking(opened, 0.0)
      frame = frame + 1
    }

    ReadbackAwaitReadbackReady(opened, 10000)
    let second = ReadbackTakeReadback(opened)
    PrimitiveValidateResult(second, metrics)
    Require(first.Pixels.Length == second.Pixels.Length,
      "Clip capture repeated readback byte count changed")
    PrimitiveRequirePixelNear(second.Pixels, second.Width, metrics,
      290.0, 86.0, uint8(12), uint8(20), uint8(32), 8, "outer_clip_corner")
    PrimitiveRequirePixelNear(second.Pixels, second.Width, metrics,
      340.0, 130.0, uint8(236), uint8(196), uint8(72), 24,
      "transformed_leaf")
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    Require(WindowReadbackTestFixture.RequestCount(opened) == 2uL
        && WindowReadbackTestFixture.CompletionCount(opened) == 2uL,
      "Clip capture readback lifecycle counts are incorrect")

    opened.RequestClose()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    Require(!opened.IsOpen, "Clip capture window did not close")
  } finally {
    Console.SetError(originalError)
    if let active = window {
      if active.IsOpen {
        active.RequestClose()
        WindowReadbackTestFixture.ForceRender(active, 0.0)
      }
    }
    font.Dispose()
  }
  let diagnostics = capturedError.ToString()
  ReadbackValidateCommonDiagnostics(diagnostics)
  Require(!diagnostics.Contains("\"event\":325")
      && !diagnostics.Contains("\"event\":326"),
    "Clip capture emitted unsupported-scene diagnostics")
  Require(DiagnosticCounter(diagnostics, "readbackCount") == 2uL,
    "Clip capture diagnostics did not record two readbacks")
  Console.WriteLine("clip-capture-submission-gate: captures=2 atlas_layers=8 atlas_failure_recovered=1 submission_ready=1 live_frames=4 pixels=validated close=1")
}
