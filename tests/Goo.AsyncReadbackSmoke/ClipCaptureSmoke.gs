package GooAsyncReadbackSmoke

import Goo
import GooReadbackFixture
import System
import System.Diagnostics
import System.IO
import System.Threading

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
    WindowReadbackTestFixture.Pump(opened, 0.0)
    let metrics = WindowReadbackTestFixture.Metrics(opened)
    Require(RoundedOverflowCell.ClipOuter.IsMounted
        && RoundedOverflowCell.ClipInner.IsMounted,
      "Clip capture scene did not mount nested clip paths")

    let first = ClipCaptureReadback(opened, metrics)
    let growth = WindowReadbackTestFixture.VerifyClipMaskAtlasGrowth(opened)
    Require(growth.ActiveLayerCount == 32u
        && growth.MaximumLayerCount == 32u
        && growth.UniqueLayerMask == uint32.MaxValue
        && growth.IncrementalGrowth
        && growth.ResolutionReduced
        && growth.ScreenMappingPreserved
        && growth.ResizeGenerationPreserved
        && growth.PressureGenerationPreserved
        && growth.PressureFailureCount == 1uL
        && growth.CompletedRegionsReclaimed,
      "Clip mask atlas growth and failure recovery did not qualify")
    ReadbackRequestReadbackUntilAccepted(opened,
      uint32(metrics.FramebufferWidth), uint32(metrics.FramebufferHeight))
    let submissionDeadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 2L
    while !WindowReadbackTestFixture.SubmissionReadyForReconcile(opened)
      && Stopwatch.GetTimestamp() < submissionDeadline{
        Thread.Yield()
      }
    Require(WindowReadbackTestFixture.SubmissionReadyForReconcile(opened),
      "Clip capture offscreen submit did not complete before reconciliation")
    Require(WindowReadbackTestFixture.Resize(opened, metrics.LogicalWidth, metrics.LogicalHeight,
        metrics.FramebufferWidth + 1, metrics.FramebufferHeight + 1),
      "Clip capture resize did not reconcile the pending submission")

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
    WindowReadbackTestFixture.DrainWindowQueue(opened, 10000)
    Require(WindowReadbackTestFixture.RequestCount(opened) == 2uL
        && WindowReadbackTestFixture.CompletionCount(opened) == 2uL,
      "Clip capture readback lifecycle counts are incorrect")

    opened.RequestClose()
    WindowReadbackTestFixture.Pump(opened, 0.0)
    Require(!opened.IsOpen, "Clip capture window did not close")
  } finally {
    Console.SetError(originalError)
    if let active = window {
      if active.IsOpen {
        active.RequestClose()
        WindowReadbackTestFixture.DrainWindowQueue(active, 10000)
        WindowReadbackTestFixture.Pump(active, 0.0)
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
  Console.WriteLine("clip-capture-submission-gate: captures=2 atlas_layers=32 atlas_resolution_reduced=1 atlas_completed_reclaimed=1 submission_ready=1 live_frames=4 pixels=validated close=1")
  RunRenderBudgetPressureSmoke()
}

func AwaitHiddenResources(window Window) {
  guard let target = WindowReadbackTestFixture.CaptureTarget(window) else {
    throw InvalidOperationException("Hidden target is unavailable")
  }
  let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 10L
  while target.RetirementWorkPending && Stopwatch.GetTimestamp() < deadline {
    WindowReadbackTestFixture.PollQueueCompletion(window)
    Thread.Yield()
  }
  Require(!target.RetirementWorkPending && target.CurrentPresentGeneration == 0uL,
    "Hide retained the swapchain")
  let atlas = target.ClipAtlasStatsForTest()
  Require(atlas.ActiveLayerCount == 0u && atlas.ResidentBytes == 0uL,
    "Hide retained clip atlas layers")
}

func RunHideResourcesSmoke() {
  let capturedError = StringWriter()
  let originalError = Console.Error
  let window = Window{
    Title: "Goo hidden resource lifetime gate",
    Width: 300,
    Height: 170,
    VSync: false,
    Background: Color.Rgb(12, 20, 32),
    Root: RoundedResizeFirstFrameCell{},
  }
  try {
    Console.SetError(capturedError)
    window.Open()
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    let metrics = WindowReadbackTestFixture.Metrics(window)
    let before = ClipCaptureReadback(window, metrics)
    guard let target = WindowReadbackTestFixture.CaptureTarget(window) else {
      throw InvalidOperationException("Visible target is unavailable")
    }
    let generation = target.CurrentPresentGeneration
    let layers = target.ClipAtlasStatsForTest().ActiveLayerCount
    Require(layers > 0u, "Visible clip atlas has no layers")
    window.State = WindowState.Minimized
    WindowReadbackTestFixture.PollQueueCompletion(window)
    Require(target.CurrentPresentGeneration == generation
        && target.ClipAtlasStatsForTest().ActiveLayerCount == layers,
      "Minimize released visible resources")
    window.State = WindowState.Normal
    ReadbackRequestReadbackUntilAccepted(window,
      uint32(metrics.FramebufferWidth), uint32(metrics.FramebufferHeight))
    Require(window.Hide() == WindowOperationResult.Accepted, "Hide was rejected")
    AwaitHiddenResources(window)
    let hiddenCounts = DiagnosticExcerpt(capturedError.ToString(), "swapchain")
    Require(DiagnosticField(hiddenCounts, "swapchainLiveCount") == 0uL
        && DiagnosticField(hiddenCounts, "swapchainLiveImageCount") == 0uL
        && DiagnosticField(hiddenCounts, "swapchainRetiredCount") == 0uL
        && DiagnosticField(hiddenCounts, "swapchainRetiredImageCount") == 0uL
        && DiagnosticField(hiddenCounts, "swapchainEstimatedPayloadBytes") == 0uL,
      "Hide retained swapchain diagnostics: " + hiddenCounts)
    ReadbackAwaitReadbackReady(window, 10000)
    let pending = ReadbackTakeReadback(window)
    RoundedResizeRequireFirstFrame(pending, metrics, 0)
    Require(window.Show() == WindowOperationResult.Accepted, "Show was rejected")
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    let after = ClipCaptureReadback(window, metrics)
    let shownCounts = DiagnosticExcerpt(capturedError.ToString(), "swapchain")
    Require(DiagnosticField(shownCounts, "swapchainLiveCount") == 1uL
        && DiagnosticField(shownCounts, "swapchainLiveImageCount") > 0uL,
      "Show did not restore swapchain diagnostics: " + shownCounts)
    RoundedResizeRequireFirstFrame(after, metrics, 1)
    Require(before.Pixels.Length == after.Pixels.Length, "Show changed capture dimensions")
    for index in 0 ... before.Pixels.Length {
      Require(before.Pixels[index] == after.Pixels[index], "Show changed captured pixels")
    }

    WindowReadbackTestFixture.RuntimeHoldNextQueuePresent(window)
    WindowReadbackTestFixture.ForceRenderNonblocking(window, 0.0)
    let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 10L
    var held = false
    while Stopwatch.GetTimestamp() < deadline {
      WindowReadbackTestFixture.PollQueueCompletion(window)
      if WindowReadbackTestFixture.RuntimeWaitForHeldQueueCall(window, 10) {
        held = true
        break
      }
      Thread.Yield()
    }
    Require(held, "Present queue work was not held")
    Require(window.Hide() == WindowOperationResult.Accepted, "Queued Hide was rejected")
    Require(target.CurrentPresentGeneration != 0uL, "Hide destroyed a queued swapchain")
    WindowReadbackTestFixture.RuntimeReleaseHeldQueueCall()
    WindowReadbackTestFixture.DrainWindowQueue(window, 10000)
    AwaitHiddenResources(window)
    Require(window.Show() == WindowOperationResult.Accepted, "Queued Show was rejected")
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    RoundedResizeRequireFirstFrame(ClipCaptureReadback(window, metrics), metrics, 2)
  } finally {
    WindowReadbackTestFixture.RuntimeReleaseHeldQueueCall()
    if window.IsOpen {
      window.RequestClose()
      WindowReadbackTestFixture.DrainWindowQueue(window, 10000)
      WindowReadbackTestFixture.Pump(window, 0.0)
    }
    Console.SetError(originalError)
  }
  ReadbackValidateCommonDiagnostics(capturedError.ToString())
  Console.WriteLine("hide-resources-gate: hidden_swapchains=0 hidden_clip_layers=0 minimize=retained pending_capture=valid queued_present=safe show_capture=identical validation=0")
}

func RunHiddenDeviceRecoverySmoke() {
  let capturedError = StringWriter()
  let originalError = Console.Error
  let hiddenWindow = Window{
    Title: "Goo hidden device recovery",
    Width: 300,
    Height: 170,
    VSync: false,
    Background: Color.Rgb(12, 20, 32),
    Root: RoundedResizeFirstFrameCell{},
  }
  let newWindow = Window{
    Title: "Goo new window device recovery",
    Width: 300,
    Height: 170,
    VSync: false,
    Background: Color.Rgb(12, 20, 32),
    Root: RoundedResizeFirstFrameCell{},
  }
  try {
    Console.SetError(capturedError)
    hiddenWindow.Open()
    WindowReadbackTestFixture.ForceRender(hiddenWindow, 0.0)
    guard let hiddenTarget = WindowReadbackTestFixture.CaptureTarget(hiddenWindow),
      let oldRuntime = hiddenTarget.RecoveryRuntime() else {
      throw InvalidOperationException("Hidden window runtime is unavailable")
    }
    let oldGeneration = oldRuntime.Generation
    Require(hiddenWindow.Hide() == WindowOperationResult.Accepted
        && !hiddenWindow.IsVisible, "Recovery window did not hide")
    AwaitHiddenResources(hiddenWindow)
    VulkanSharedRuntime.FailNextGraphicsSubmissionForTest()
    let pending = hiddenWindow.RenderOffscreenAsync(ReadbackSmokeCell{},
      OffscreenRenderOptions(64.0F, 64.0F, 64u, 64u, Color.Black, 16777216L),
      CancellationToken.None)
    let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 10L
    while !pending.IsCompleted && Stopwatch.GetTimestamp() < deadline {
      WindowReadbackTestFixture.PollQueueCompletion(hiddenWindow)
      Thread.Yield()
    }
    Require(pending.IsCompleted
        && pending.GetAwaiter().GetResult().Status == OffscreenRenderStatus.DeviceLost
        && oldRuntime.DeviceLost, "Hidden window did not detect the injected device loss")
    newWindow.Open()
    WindowReadbackTestFixture.ForceRender(newWindow, 0.0)
    guard let newTarget = WindowReadbackTestFixture.CaptureTarget(newWindow),
      let recoveredRuntime = newTarget.RecoveryRuntime() else {
      throw InvalidOperationException("New window runtime is unavailable")
    }
    Require(recoveredRuntime.Generation > oldGeneration
        && hiddenTarget.RecoveryRuntime()?.Generation == recoveredRuntime.Generation,
      "New and hidden windows did not acquire the recovered device")
    Require(!hiddenWindow.IsVisible, "Recovery showed the hidden window")
    RoundedResizeRequireFirstFrame(ClipCaptureReadback(newWindow,
      WindowReadbackTestFixture.Metrics(newWindow)),
      WindowReadbackTestFixture.Metrics(newWindow), 0)
    Require(hiddenWindow.Show() == WindowOperationResult.Accepted, "Recovered window did not show")
    WindowReadbackTestFixture.ForceRender(hiddenWindow, 0.0)
    RoundedResizeRequireFirstFrame(ClipCaptureReadback(hiddenWindow,
      WindowReadbackTestFixture.Metrics(hiddenWindow)),
      WindowReadbackTestFixture.Metrics(hiddenWindow), 0)
  } finally {
    newWindow.Close()
    hiddenWindow.Close()
    Console.SetError(originalError)
  }
  ReadbackValidateCommonDiagnostics(capturedError.ToString())
  Console.WriteLine("hidden-device-recovery: new_window=presented hidden_window=restored pixels=validated")
}

class RenderBudgetPressureCell : Cell {
  override func Build() Blob -> Container() {.Width: Percent(100),.Height: Percent(100),.BackgroundColor: Color.Rgb(12, 20, 32),.ClipPath: RoundedOverflowCell.OuterClipPath,.ClipPathFit: ShapeFit.Fill,
    Container() {.Width: Percent(100),.Height: Percent(100),.Opacity: 0.9,.ClipPath: RoundedOverflowCell.InnerClipPath,.ClipPathFit: ShapeFit.Fill,.BackgroundColor: Color.Rgb(32, 96, 144),
      Container() {.Width: Percent(100),.Height: Percent(100),.Opacity: 0.9,.ClipPath: RoundedOverflowCell.OuterClipPath,.ClipPathFit: ShapeFit.Fill,.BackgroundColor: Color.Rgb(160, 64, 192),
        Container() {.Width: Percent(100),.Height: Percent(100),.Opacity: 0.9,.ClipPath: RoundedOverflowCell.InnerClipPath,.ClipPathFit: ShapeFit.Fill,.BackgroundColor: Color.Rgb(236, 196, 72),
          Container{ Width: Percent(100), Height: Percent(100), Opacity: 0.9, BackgroundColor: Color.Rgb(52, 196, 112) },
        },
      },
    },
  }
}

class RenderBudgetSiblingCell : Cell {
  private var nested bool
  func UseNested() {
    nested = true
    Rebuild()
  }
  
  override func Build() Blob -> if nested {
    Cell.Mount[RenderBudgetPressureCell]()
  } else {
    Container() {.Width: Percent(100),.Height: Percent(100),
    Container() {.Position: PositionType.Absolute,.Width: Percent(100),.Height: Percent(100),.Opacity: 0.9,.BackgroundColor: Color.Rgb(32, 96, 144),
      Container{ Width: Percent(75), Height: Percent(75), BackgroundColor: Color.Rgb(52, 196, 112) },
    },
    Container() {.Position: PositionType.Absolute,.Width: Percent(100),.Height: Percent(100),.Opacity: 0.9,.BackgroundColor: Color.Rgb(32, 96, 144),
      Container{ Width: Percent(75), Height: Percent(75), BackgroundColor: Color.Rgb(52, 196, 112) },
    },
    Container() {.Position: PositionType.Absolute,.Width: Percent(100),.Height: Percent(100),.Opacity: 0.9,.BackgroundColor: Color.Rgb(32, 96, 144),
      Container{ Width: Percent(75), Height: Percent(75), BackgroundColor: Color.Rgb(52, 196, 112) },
    },
    Container() {.Position: PositionType.Absolute,.Width: Percent(100),.Height: Percent(100),.Opacity: 0.9,.BackgroundColor: Color.Rgb(32, 96, 144),
      Container{ Width: Percent(75), Height: Percent(75), BackgroundColor: Color.Rgb(52, 196, 112) },
    },
  }
  }
}

func RunRenderBudgetPressureSmoke() {
  let root = RenderBudgetSiblingCell{}
  let window = Window{ Title: "Goo render budget pressure gate",
    Width: 400, Height: 190, VSync: false, Root: root }
  try {
    window.Open()
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    WindowReadbackTestFixture.DrainWindowQueue(window, 10000)
    let metrics = WindowReadbackTestFixture.Metrics(window)
    guard let target = WindowReadbackTestFixture.CaptureTarget(window) else {
      throw InvalidOperationException("Render budget target is unavailable")
    }
    let pixels = uint64(metrics.FramebufferWidth) * uint64(metrics.FramebufferHeight)
    target.SetRenderBudgetsForTest(pixels * 8uL, pixels)
    WindowReadbackTestFixture.SetForceFullRedraw(window, true)
    let siblingPasses = target.DiagnosticCountersSnapshotForTest().layerPoolPassCount
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    Require(target.LayerBypassCountForTest() == 0uL
        && target.DiagnosticCountersSnapshotForTest().layerPoolPassCount >= siblingPasses + 4uL,
      "Sibling layers that fit concurrently were drawn without layers")
    WindowReadbackTestFixture.DrainWindowQueue(window, 10000)
    root.UseNested()
    target.SetRenderBudgetsForTest(pixels * 4uL, pixels)
    WindowReadbackTestFixture.SetForceFullRedraw(window, true)
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    let frame = ClipCaptureReadback(window, metrics)
    Require(frame.Pixels.Length > 0 && window.IsOpen,
      "Render budget pressure did not complete a frame")
    Require(target.DiagnosticCountersSnapshotForTest().layerPoolPressureFailureCount > 0uL
        && target.ClipAtlasStatsForTest().PressureFailureCount > 0uL,
      "Render budget scene did not exceed both budgets")
    let sample = (int32(frame.Height) * 3 / 4 * int32(frame.Width) + int32(frame.Width) / 2) * 4
    Require(frame.Pixels[sample + 1] > frame.Pixels[sample]
        && frame.Pixels[sample + 1] > frame.Pixels[sample + 2],
      "Render budget frame did not contain the green layer content")
    let pressureGeneration = target.ClipAtlasStatsForTest().Generation
    for frameIndex in 0 ... 4 {
      WindowReadbackTestFixture.ForceRender(window, 0.0)
      Require(target.ClipAtlasStatsForTest().Generation == pressureGeneration,
        "Steady clip budget pressure replaced the atlas generation")
    }
    WindowReadbackTestFixture.DrainWindowQueue(window, 10000)
    target.SetRenderBudgetsForTest(536870912uL, 67108864uL)
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    ClipCaptureReadback(window, metrics)
  } finally {
    window.Close()
  }
  Console.WriteLine("render-budget-pressure: clip_resolution=reduced layers=direct frame=completed recovery=completed")
}
