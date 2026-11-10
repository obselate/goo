package GooAsyncReadbackSmoke

import Goo
import GooReadbackFixture
import System
import System.Diagnostics
import System.IO
import System.Threading
import System.Text.Json

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
        && growth.ShrinkQualityRecovered
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

    var visibilityEvents = 0
    var inputActivities = 0
    var visible = true
    window.VisibilityChanged += value -> {
      visibilityEvents++
      visible = value
    }
    window.InputActivity += _ -> { inputActivities++ }
    for operation in []string{"hide", "show", "close"} {
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
      let presentGeneration = target.CurrentPresentGeneration
      let previousEvents = visibilityEvents
      let previousActivities = inputActivities
      Require(window.Hide() == WindowOperationResult.Accepted, "Queued Hide was rejected")
      Require(!window.IsVisible && !window.IsFocused && !visible && visibilityEvents == previousEvents + 1,
        "Queued Hide did not publish hidden state immediately")
      Require(window.SdlHostForTest()?.IsVisible == true, "Hide unmapped a window with an in-flight present")
      window.handleFocusChanged(true)
      Require(!window.IsFocused, "Pending Hide accepted a late focus gain")
      Require(target.CurrentPresentGeneration != 0uL, "Hide destroyed a queued swapchain")
      window.InputQueueKeyPressForTest(Key.A)
      window.InputQueueKeyReleaseForTest(Key.A)
      window.PushNativeMouseButtonForTest(20.0F, 20.0F, PointerButton.Primary, true)
      window.PushNativeMouseButtonForTest(20.0F, 20.0F, PointerButton.Primary, false)
      SdlRuntime.PumpEvents(Int32.MaxValue)
      window.PumpScheduled(0.0)
      Require(inputActivities == previousActivities && !window.IsFocused,
        "Queued Hide routed native input")
      if operation == "show" {
        Require(window.Show() == WindowOperationResult.Accepted && window.IsVisible && visible
            && visibilityEvents == previousEvents + 2 && window.IsFocused == window.ObservedNativeFocusForTest,
          "Show did not cancel a pending native hide")
      } else if operation == "close" {
        window.RequestClose()
        window.PumpScheduled(0.0)
        Require(window.IsOpen, "Close discarded an in-flight present")
      }
      WindowReadbackTestFixture.RuntimeReleaseHeldQueueCall()
      WindowReadbackTestFixture.DrainWindowQueue(window, 10000)
      if operation == "show" {
        WindowReadbackTestFixture.PollQueueCompletion(window)
        Require(target.CurrentPresentGeneration == presentGeneration,
          "Canceled Hide discarded the mapped swapchain")
      }
      window.PumpScheduled(0.0)
      if operation == "close" {
        Require(!window.IsOpen, "Close retained a pending native hide")
        break
      }
      if operation == "show" {
        Require(window.IsVisible && window.SdlHostForTest()?.IsVisible == true
            && visibilityEvents == previousEvents + 2,
          "Canceled native hide unmapped or remapped the window")
      } else {
        AwaitHiddenResources(window)
        Require(!window.IsVisible && window.SdlHostForTest()?.IsVisible == false
            && visibilityEvents == previousEvents + 1,
          "Native hide did not finish after the present drained")
        window.handleFocusChanged(true)
        Require(!window.IsFocused, "Completed Hide accepted a late focus gain")
        Require(window.Show() == WindowOperationResult.Accepted, "Queued Show was rejected")
      }
      WindowReadbackTestFixture.ForceRender(window, 0.0)
      RoundedResizeRequireFirstFrame(ClipCaptureReadback(window, metrics), metrics, 2)
    }
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
  Console.WriteLine("hide-resources-gate: hidden_swapchains=0 hidden_clip_layers=0 minimize=retained pending_capture=valid queued_present=safe public_hide=immediate show_cancel=verified close_pending=verified show_capture=identical validation=0")
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
    WindowReadbackTestFixture.Pump(hiddenWindow, 0.0)
    let metrics = WindowReadbackTestFixture.Metrics(hiddenWindow)
    RoundedResizeRequireFirstFrame(ClipCaptureReadback(hiddenWindow, metrics), metrics, 0)
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

func ValidateDeviceRecoveryDiagnostics(diagnostics string) {
  ReadbackValidateCommonDiagnostics(diagnostics, 1uL)
  for line in diagnostics.Split('\n') {
    if !line.StartsWith("{\"kind\":\"validation\",") { continue }
    using let message = JsonDocument.Parse(line)
    Require((message.RootElement.GetProperty("types").GetInt32() & 2) == 0,
      "Device recovery emitted a Vulkan validation message: " + line)
  }
}

func RunPendingDeviceRecoverySmoke() {
  let capturedError = StringWriter()
  let originalError = Console.Error
  using let entered = ManualResetEventSlim(false)
  using let release = ManualResetEventSlim(false)
  let owner = Window{
    Title: "Goo pending recovery owner", Width: 300, Height: 170, VSync: false,
    Background: Color.Rgb(12, 20, 32), Root: RoundedResizeFirstFrameCell{},
  }
  let child = Window{
    Title: "Goo pending recovery child", Width: 300, Height: 170, VSync: false,
    Owner: owner, Background: Color.Rgb(12, 20, 32), Root: RoundedResizeFirstFrameCell{},
  }
  try {
    Console.SetError(capturedError)
    owner.Open()
    WindowReadbackTestFixture.Pump(owner, 0.0)
    let metrics = WindowReadbackTestFixture.Metrics(owner)
    RoundedResizeRequireFirstFrame(ClipCaptureReadback(owner, metrics), metrics, 0)
    WindowReadbackTestFixture.ForceRender(owner, 0.0)
    let ownerTarget = WindowReadbackTestFixture.CaptureTarget(owner)!!
    let oldRuntime = ownerTarget.RecoveryRuntime()!!
    VulkanWindowTarget.SecondaryStartupForTest = () -> {
      entered.Set()
      Require(release.Wait(10000), "Secondary startup was not released within 10 seconds")
    }
    child.Open()
    let childTarget = WindowReadbackTestFixture.CaptureTarget(child)!!
    let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 10L
    while !entered.IsSet && Stopwatch.GetTimestamp() < deadline {
      WindowReadbackTestFixture.Pump(child, 0.0)
      Thread.Yield()
    }
    Require(entered.IsSet && childTarget.StartupPending && !child.IsVisible,
      "Recovery child did not retain an unshown startup task")
    VulkanSharedRuntime.FailNextGraphicsSubmissionForTest()
    WindowReadbackTestFixture.ForceRenderNonblocking(owner, 0.0)
    let lossDeadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 10L
    while !oldRuntime.DeviceLost && Stopwatch.GetTimestamp() < lossDeadline {
      WindowReadbackTestFixture.PollQueueCompletion(owner)
      Thread.Yield()
    }
    Require(oldRuntime.DeviceLost, "Pending recovery did not detect the injected device loss")
    WindowReadbackTestFixture.ForceRenderNonblocking(owner, 0.0)
    Require(ownerTarget.RecoveryRuntime()?.Generation == oldRuntime.Generation && !child.IsVisible,
      "Recovery discarded an in-flight startup task")
    release.Set()
    VulkanWindowTarget.SecondaryStartupForTest = nil
    WindowReadbackTestFixture.ForceRender(owner, 0.0, 10.0, true)
    let recovered = ownerTarget.RecoveryRuntime()!!
    Require(recovered.Generation > oldRuntime.Generation
        && childTarget.RecoveryRuntime()?.Generation == recovered.Generation && !child.IsVisible,
      "Recovery did not preserve the unshown child on the recovered device")
    WindowReadbackTestFixture.ForceRender(child, 0.0, 10.0, true)
    Require(child.IsVisible && !childTarget.StartupPending,
      "Recovered child did not finish its first presentation")
    let childMetrics = WindowReadbackTestFixture.Metrics(child)
    RoundedResizeRequireFirstFrame(ClipCaptureReadback(child, childMetrics), childMetrics, 0)
    RoundedResizeRequireFirstFrame(ClipCaptureReadback(owner, metrics), metrics, 0)
  } finally {
    release.Set()
    VulkanWindowTarget.SecondaryStartupForTest = nil
    child.Close()
    owner.Close()
    Console.SetError(originalError)
  }
  ValidateDeviceRecoveryDiagnostics(capturedError.ToString())
  Console.WriteLine("pending-device-recovery: startup=drained owner=presented child=presented pixels=validated validation=0")
}

func RunZeroExtentDeviceRecoverySmoke() {
  let capturedError = StringWriter()
  let originalError = Console.Error
  let owner = Window{
    Title: "Goo zero extent recovery owner", Width: 300, Height: 170, VSync: false,
    Background: Color.Rgb(12, 20, 32), Root: RoundedResizeFirstFrameCell{},
  }
  let child = Window{
    Title: "Goo zero extent recovery child", Width: 300, Height: 170, VSync: false,
    Owner: owner, Background: Color.Rgb(12, 20, 32), Root: RoundedResizeFirstFrameCell{},
  }
  var childTarget VulkanWindowTarget?
  try {
    Console.SetError(capturedError)
    owner.Open()
    WindowReadbackTestFixture.Pump(owner, 0.0)
    let ownerMetrics = WindowReadbackTestFixture.Metrics(owner)
    RoundedResizeRequireFirstFrame(ClipCaptureReadback(owner, ownerMetrics), ownerMetrics, 0)
    child.Open()
    WindowReadbackTestFixture.ForceRender(child, 0.0, 10.0, true)
    let childMetrics = WindowReadbackTestFixture.Metrics(child)
    RoundedResizeRequireFirstFrame(ClipCaptureReadback(child, childMetrics), childMetrics, 0)
    childTarget = WindowReadbackTestFixture.CaptureTarget(child)!!
    let target = childTarget
    target.SetZeroSurfaceExtentForTest(true)
    target.VerifyZeroExtentRecreateForTest()
    let before = WindowReadbackTestFixture.FrameSubmissions(child)
    WindowReadbackTestFixture.ForceRenderNonblocking(child, 0.0)
    let deferred = WindowReadbackTestFixture.FrameSubmissions(child)
    Require(before.Slot0Serial == deferred.Slot0Serial && before.Slot1Serial == deferred.Slot1Serial,
      "Zero surface extent submitted a frame from the old swapchain")
    target.SetZeroSurfaceExtentForTest(false)
    WindowReadbackTestFixture.ForceRender(child, 0.0, 10.0, true)
    let ownerTarget = WindowReadbackTestFixture.CaptureTarget(owner)!!
    let oldGeneration = ownerTarget.RecoveryRuntime()!!.Generation
    VulkanWindowTarget.RecoveryStartupForTest = (rebuilding VulkanWindowTarget) -> {
      if rebuilding == target {
        rebuilding.SetZeroSurfaceExtentForTest(true)
        rebuilding.VerifyZeroExtentRecreateForTest()
      }
    }
    VulkanSharedRuntime.FailNextGraphicsSubmissionForTest()
    WindowReadbackTestFixture.ForceRender(owner, 0.0, 10.0, true)
    Require(ownerTarget.RecoveryRuntime()!!.Generation > oldGeneration
        && target.RecoveryRuntime()?.Generation == ownerTarget.RecoveryRuntime()?.Generation
        && child.IsOpen && int32(target.CurrentPresentMode) == -1,
      "Zero extent window prevented device recovery or created a swapchain")
    VulkanWindowTarget.RecoveryStartupForTest = nil
    target.SetZeroSurfaceExtentForTest(false)
    WindowReadbackTestFixture.ForceRender(child, 0.0, 10.0, true)
    RoundedResizeRequireFirstFrame(ClipCaptureReadback(child, childMetrics), childMetrics, 0)
    RoundedResizeRequireFirstFrame(ClipCaptureReadback(owner, ownerMetrics), ownerMetrics, 0)
  } finally {
    VulkanWindowTarget.RecoveryStartupForTest = nil
    childTarget?.SetZeroSurfaceExtentForTest(false)
    child.Close()
    owner.Close()
    Console.SetError(originalError)
  }
  ValidateDeviceRecoveryDiagnostics(capturedError.ToString())
  Console.WriteLine("zero-extent-device-recovery: current_extent=0x0 recovery=completed restore=presented pixels=validated validation=0")
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
  func UseNested(value bool = true) {
    nested = value
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
    Width: 1024, Height: 600, VSync: false, Root: root }
  try {
    window.Open()
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    WindowReadbackTestFixture.DrainWindowQueue(window, 10000)
    let metrics = WindowReadbackTestFixture.Metrics(window)
    guard let target = WindowReadbackTestFixture.CaptureTarget(window) else {
      throw InvalidOperationException("Render budget target is unavailable")
    }
    let pixels = int64(metrics.FramebufferWidth) * int64(metrics.FramebufferHeight)
    target.ResetRenderResourcesForTest(pixels * 12L)
    WindowReadbackTestFixture.SetForceFullRedraw(window, true)
    let siblingPasses = target.DiagnosticCountersSnapshotForTest().layerPoolPassCount
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    Require(target.LayerResolutionShiftForTest() == 0
        && target.DiagnosticCountersSnapshotForTest().layerPoolPassCount >= siblingPasses + 4uL,
      "Sibling layers that fit concurrently were drawn without layers")
    WindowReadbackTestFixture.DrainWindowQueue(window, 10000)
    root.UseNested()
    target.ResetRenderResourcesForTest(1073741824L)
    WindowReadbackTestFixture.SetForceFullRedraw(window, true)
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    WindowReadbackTestFixture.DrainWindowQueue(window, 10000)
    let exactBytes = target.DiagnosticCountersSnapshotForTest().layerPoolResidentBytes
    Require(exactBytes > 0uL && target.LayerResolutionShiftForTest() == 0,
      "Full-resolution layer budget measurement was unavailable")
    root.UseNested(false)
    Require(WindowReadbackTestFixture.Resize(window, 1024, 600,
      metrics.FramebufferWidth * 7 / 5, metrics.FramebufferHeight * 7 / 5),
      "Layer capacity budget seed resize failed")
    WindowReadbackTestFixture.SetForceFullRedraw(window, true)
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    WindowReadbackTestFixture.DrainWindowQueue(window, 10000)
    let seeded = target.DiagnosticCountersSnapshotForTest()
    Require(target.LayerResolutionShiftForTest() == 0 && seeded.layerPoolResidentBytes > exactBytes,
      "Layer capacity budget seed did not retain a larger target")
    root.UseNested()
    Require(WindowReadbackTestFixture.Resize(window, 1024, 600,
      metrics.FramebufferWidth, metrics.FramebufferHeight),
      "Layer capacity budget recovery resize failed")
    target.SetMemoryHeadroomForTest(int64(exactBytes) - int64(seeded.layerPoolResidentBytes))
    WindowReadbackTestFixture.SetForceFullRedraw(window, true)
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    let capacity = target.DiagnosticCountersSnapshotForTest()
    Require(target.LayerResolutionShiftForTest() == 0
        && capacity.layerPoolResidentBytes <= exactBytes
        && capacity.memoryEvictionCount > seeded.memoryEvictionCount,
      "Optional layer capacity reduced full-resolution rendering or bypassed exact-extent recovery")
    WindowReadbackTestFixture.DrainWindowQueue(window, 10000)
    target.ResetRenderResourcesForTest(pixels * 5L)
    WindowReadbackTestFixture.SetForceFullRedraw(window, true)
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    WindowReadbackTestFixture.DrainWindowQueue(window, 10000)
    Require(target.DiagnosticCountersSnapshotForTest().layerPoolPressureFailureCount > 0uL
        && target.ClipAtlasStatsForTest().PressureFailureCount > 0uL,
      "Render budget scene did not exceed both budgets")
    Require(target.LayerResolutionShiftForTest() > 0, "Render budget frame did not reduce layer resolution")
    Require(target.DiagnosticCountersSnapshotForTest().layerPoolResolutionShift
        == uint64(target.LayerResolutionShiftForTest()),
      "Render budget frame did not report the layer resolution shift")
    let pressureGeneration = target.ClipAtlasStatsForTest().Generation
    for frameIndex in 0 ... 4 {
      WindowReadbackTestFixture.ForceRender(window, 0.0)
      Require(target.ClipAtlasStatsForTest().Generation == pressureGeneration,
        "Steady clip budget pressure replaced the atlas generation")
    }
    WindowReadbackTestFixture.DrainWindowQueue(window, 10000)
    let frame = ClipCaptureReadback(window, metrics)
    Require(frame.Pixels.Length > 0 && window.IsOpen && target.LayerResolutionShiftForTest() > 0
        && frame.LayerResolutionShift > 0,
      "Render budget pressure did not complete a reduced-resolution frame")
    let sample = (int32(frame.Height) * 3 / 4 * int32(frame.Width) + int32(frame.Width) / 2) * 4
    Require(frame.Pixels[sample + 1] > frame.Pixels[sample]
        && frame.Pixels[sample + 1] > frame.Pixels[sample + 2],
      "Render budget frame did not contain the green layer content")
    let outside = (int32(frame.Height) * 9 / 10 * int32(frame.Width) + int32(frame.Width) / 10) * 4
    Require(frame.Pixels[outside + 1] <= frame.Pixels[outside]
        || frame.Pixels[outside + 1] <= frame.Pixels[outside + 2],
      "Nested layer content escaped its outer nonrectangular clip")
    target.ResetRenderResourcesForTest(nil)
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    ClipCaptureReadback(window, metrics)
  } finally {
    window.Close()
  }
  Console.WriteLine("render-budget-pressure: clip_resolution=reduced layers=reduced frame=completed recovery=completed")
}
