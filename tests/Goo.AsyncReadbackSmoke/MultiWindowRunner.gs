package GooAsyncReadbackSmoke

import Goo
import System
import System.Diagnostics
import System.Threading

func PerformanceCloseWindow(window Window) {
  window.RequestClose()
  let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 2L
  while window.IsOpen {
    WindowReadbackTestFixture.PollQueueCompletion(window)
    window.Pump(0.0)
    Require(
      Stopwatch.GetTimestamp() < deadline || !window.IsOpen,
      "Retained performance window close did not settle")
    Thread.Yield()
  }
}

func PerformanceThreeWindowSelectRoot(index int32,
  first PerformanceThreeWindowRoot,
  second PerformanceThreeWindowRoot,
  third PerformanceThreeWindowRoot) PerformanceThreeWindowRoot{
    if index == 0 { return first }
    if index == 1 { return second }
    return third
  }

func PerformanceThreeWindowSelectWindow(index int32,
  first Window, second Window, third Window) Window{
    if index == 0 { return first }
    if index == 1 { return second }
    return third
  }

func RunPerformanceThreeWindowBenchmark() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let warmup = EnvironmentCount("GOO_PERF_WARMUP", 300, 300)
  let samples = EnvironmentCount("GOO_PERF_SAMPLES", 2000, 2000)
  Require(samples > 0, "GOO_PERF_SAMPLES must be positive")
  let firstRoot = PerformanceThreeWindowRoot(
    PerformanceThreeWindowRoot.ManifestSeed, 0,
    PerformanceThreeWindowRoot.PrimaryWidth, PerformanceThreeWindowRoot.PrimaryHeight)
  let secondRoot = PerformanceThreeWindowRoot(
    PerformanceThreeWindowRoot.ManifestSeed, 1,
    PerformanceThreeWindowRoot.SecondaryWidth, PerformanceThreeWindowRoot.SecondaryHeight)
  let thirdRoot = PerformanceThreeWindowRoot(
    PerformanceThreeWindowRoot.ManifestSeed, 2,
    PerformanceThreeWindowRoot.SecondaryWidth, PerformanceThreeWindowRoot.SecondaryHeight)
  let frameNs = [samples]int64
  let frameAllocations = [samples]int64
  let gpuNs = [samples]int64
  let expectedGpuFrames = [samples]uint64
  let expectedGpuWindows = [samples]int32
  let gpuCaptureCapacity = samples * 2 + 8
  let capturedGpuFrames = [gpuCaptureCapacity]uint64
  let capturedGpuWindows = [gpuCaptureCapacity]int32
  let capturedGpuElapsed = [gpuCaptureCapacity]int64
  let capturedGpuMatched = [gpuCaptureCapacity]bool
  var capturedGpuCount int32 = 0
  var gpuCaptureOverflow = false
  var firstTarget VulkanWindowTarget? = nil
  var secondTarget VulkanWindowTarget? = nil
  var thirdTarget VulkanWindowTarget? = nil
  var actualLogicalWidth0 int32 = 0
  var actualLogicalHeight0 int32 = 0
  var actualFramebufferWidth0 int32 = 0
  var actualFramebufferHeight0 int32 = 0
  var actualLogicalWidth1 int32 = 0
  var actualLogicalHeight1 int32 = 0
  var actualFramebufferWidth1 int32 = 0
  var actualFramebufferHeight1 int32 = 0
  var actualLogicalWidth2 int32 = 0
  var actualLogicalHeight2 int32 = 0
  var actualFramebufferWidth2 int32 = 0
  var actualFramebufferHeight2 int32 = 0
  let process = Process.GetCurrentProcess()
  var first Window? = nil
  var second Window? = nil
  var third Window? = nil
  var firstCounters VulkanDiagnosticCounterSnapshot{}
  var baselineFirst VulkanDiagnosticCounterSnapshot{}
  var firstFinal VulkanDiagnosticCounterSnapshot{}
  var firstScene VulkanSceneRetentionTestSnapshot{}
  var secondScene VulkanSceneRetentionTestSnapshot{}
  var thirdScene VulkanSceneRetentionTestSnapshot{}
  var firstPrimitive VulkanPrimitiveFrameRetentionTestSnapshot{}
  var secondPrimitive VulkanPrimitiveFrameRetentionTestSnapshot{}
  var thirdPrimitive VulkanPrimitiveFrameRetentionTestSnapshot{}
  var firstText VulkanTextFrameRetentionTestSnapshot{}
  var secondText VulkanTextFrameRetentionTestSnapshot{}
  var thirdText VulkanTextFrameRetentionTestSnapshot{}
  var firstSlot0 = false
  var firstSlot1 = false
  var secondSlot0 = false
  var secondSlot1 = false
  var thirdSlot0 = false
  var thirdSlot1 = false
  var firstTextSlot0 = false
  var firstTextSlot1 = false
  var secondTextSlot0 = false
  var secondTextSlot1 = false
  var thirdTextSlot0 = false
  var thirdTextSlot1 = false
  var timestampSupported = false
  var collectGpu = false
  var gpuCount int32 = 0
  var selectedIndex int32 = 0
  var lastSelectedIndex int32 = 0
  var fairness0 int32 = 0
  var fairness1 int32 = 0
  var fairness2 int32 = 0
  var focusRotations int32 = 0
  var focusLossSubmitCount int32 = 0
  var cleanSubmitDelta uint64 = 0uL
  var cleanPresentDelta uint64 = 0uL
  var managedLiveStart uint64 = 0uL
  var managedLiveEnd uint64 = 0uL
  var managedLivePeak uint64 = 0uL
  var managedRetainedStart uint64 = 0uL
  var managedRetainedEnd uint64 = 0uL
  var workingSetStart uint64 = 0uL
  var workingSetEnd uint64 = 0uL
  var workingSetPeak uint64 = 0uL
  var privateMemoryStart uint64 = 0uL
  var privateMemoryEnd uint64 = 0uL
  var privateMemoryPeak uint64 = 0uL
  var privateDirtyStart uint64 = 0uL
  var privateDirtyEnd uint64 = 0uL
  var allocatorPeak uint64 = 0uL
  var vulkanMemoryPeak uint64 = 0uL
  var cachePeak uint64 = 0uL
  var imagePeak uint64 = 0uL
  var textAtlasPeak uint64 = 0uL
  var resourcePeak uint64 = 0uL
  var gen0Before int32 = 0
  var gen1Before int32 = 0
  var gen2Before int32 = 0
  var gen0After int32 = 0
  var gen1After int32 = 0
  var gen2After int32 = 0
  var pauseTicksBefore int64 = 0L
  var pauseTicksAfter int64 = 0L
  var firstCloseVerified = false
  var remainingLivenessVerified = false
  var finalZeroResources = false
  var finalCloseVerified = false
  var window0SubmitDelta uint64 = 0uL
  var window1SubmitDelta uint64 = 0uL
  var window2SubmitDelta uint64 = 0uL
  var window0PresentDelta uint64 = 0uL
  var window1PresentDelta uint64 = 0uL
  var window2PresentDelta uint64 = 0uL
  var window0LivenessVerified = false
  var window1LivenessVerified = false
  var window2LivenessVerified = false
  var window0CloseVerified = false
  var window1CloseVerified = false
  var window2CloseVerified = false
  var resourceCurrent uint64 = 0uL
  var resourceEnd uint64 = 0uL
  try {
    let openedFirst = Window{
      Title: "Goo Retained performance three-window A",
      Width: PerformanceThreeWindowRoot.PrimaryWidth,
      Height: PerformanceThreeWindowRoot.PrimaryHeight,
      VSync: false,
      Root: firstRoot,
    }
    let openedSecond = Window{
      Title: "Goo Retained performance three-window B",
      Width: PerformanceThreeWindowRoot.SecondaryWidth,
      Height: PerformanceThreeWindowRoot.SecondaryHeight,
      VSync: false,
      Root: secondRoot,
    }
    let openedThird = Window{
      Title: "Goo Retained performance three-window C",
      Width: PerformanceThreeWindowRoot.SecondaryWidth,
      Height: PerformanceThreeWindowRoot.SecondaryHeight,
      VSync: false,
      Root: thirdRoot,
    }
    first = openedFirst
    second = openedSecond
    third = openedThird
    openedFirst.Open()
    openedSecond.Open()
    openedThird.Open()
    WindowReadbackTestFixture.ForceRender(openedFirst, 0.0)
    WindowReadbackTestFixture.ForceRender(openedSecond, 0.0)
    WindowReadbackTestFixture.ForceRender(openedThird, 0.0)
    firstTarget = WindowReadbackTestFixture.CaptureTarget(openedFirst)
    secondTarget = WindowReadbackTestFixture.CaptureTarget(openedSecond)
    thirdTarget = WindowReadbackTestFixture.CaptureTarget(openedThird)
    Require(firstTarget != nil && secondTarget != nil && thirdTarget != nil,
      "Retained performance three-window target capture failed")
    let firstResizeSucceeded = WindowReadbackTestFixture.Resize(openedFirst,
      firstRoot.Width, firstRoot.Height, firstRoot.Width, firstRoot.Height)
    let secondResizeSucceeded = WindowReadbackTestFixture.Resize(openedSecond,
      secondRoot.Width, secondRoot.Height, secondRoot.Width, secondRoot.Height)
    let thirdResizeSucceeded = WindowReadbackTestFixture.Resize(openedThird,
      thirdRoot.Width, thirdRoot.Height, thirdRoot.Width, thirdRoot.Height)
    Require(firstResizeSucceeded && secondResizeSucceeded
        && thirdResizeSucceeded,
      "Retained performance three-window manifest resize failed")
    WindowReadbackTestFixture.ForceRender(openedFirst, 0.0)
    WindowReadbackTestFixture.ForceRender(openedSecond, 0.0)
    WindowReadbackTestFixture.ForceRender(openedThird, 0.0)
    firstTarget = WindowReadbackTestFixture.CaptureTarget(openedFirst)
    secondTarget = WindowReadbackTestFixture.CaptureTarget(openedSecond)
    thirdTarget = WindowReadbackTestFixture.CaptureTarget(openedThird)
    Require(firstTarget != nil && secondTarget != nil && thirdTarget != nil,
      "Retained performance three-window resized target capture failed")
    let firstMetrics = WindowReadbackTestFixture.Metrics(openedFirst)
    let secondMetrics = WindowReadbackTestFixture.Metrics(openedSecond)
    let thirdMetrics = WindowReadbackTestFixture.Metrics(openedThird)
    let firstExtent = WindowReadbackTestFixture.TargetFramebufferExtent(firstTarget)
    let secondExtent = WindowReadbackTestFixture.TargetFramebufferExtent(secondTarget)
    let thirdExtent = WindowReadbackTestFixture.TargetFramebufferExtent(thirdTarget)
    actualLogicalWidth0 = firstMetrics.LogicalWidth
    actualLogicalHeight0 = firstMetrics.LogicalHeight
    actualFramebufferWidth0 = firstMetrics.FramebufferWidth
    actualFramebufferHeight0 = firstMetrics.FramebufferHeight
    actualLogicalWidth1 = secondMetrics.LogicalWidth
    actualLogicalHeight1 = secondMetrics.LogicalHeight
    actualFramebufferWidth1 = secondMetrics.FramebufferWidth
    actualFramebufferHeight1 = secondMetrics.FramebufferHeight
    actualLogicalWidth2 = thirdMetrics.LogicalWidth
    actualLogicalHeight2 = thirdMetrics.LogicalHeight
    actualFramebufferWidth2 = thirdMetrics.FramebufferWidth
    actualFramebufferHeight2 = thirdMetrics.FramebufferHeight
    Require(firstMetrics.LogicalWidth == firstRoot.Width
        && firstMetrics.LogicalHeight == firstRoot.Height
        && firstMetrics.FramebufferWidth == firstRoot.Width
        && firstMetrics.FramebufferHeight == firstRoot.Height
        && firstExtent.Width == firstRoot.Width
        && firstExtent.Height == firstRoot.Height,
      "Retained performance three-window first metrics or extent did not match manifest: "
      +"logical=" + firstMetrics.LogicalWidth.ToString() + "x" + firstMetrics.LogicalHeight.ToString()
      +" framebuffer=" + firstMetrics.FramebufferWidth.ToString() + "x" + firstMetrics.FramebufferHeight.ToString()
      +" target_extent=" + firstExtent.Width.ToString() + "x" + firstExtent.Height.ToString()
      +" expected=" + firstRoot.Width.ToString() + "x" + firstRoot.Height.ToString())
    Require(secondMetrics.LogicalWidth == secondRoot.Width
        && secondMetrics.LogicalHeight == secondRoot.Height
        && secondMetrics.FramebufferWidth == secondRoot.Width
        && secondMetrics.FramebufferHeight == secondRoot.Height
        && secondExtent.Width == secondRoot.Width
        && secondExtent.Height == secondRoot.Height,
      "Retained performance three-window second metrics or extent did not match manifest: "
      +"logical=" + secondMetrics.LogicalWidth.ToString() + "x" + secondMetrics.LogicalHeight.ToString()
      +" framebuffer=" + secondMetrics.FramebufferWidth.ToString() + "x" + secondMetrics.FramebufferHeight.ToString()
      +" target_extent=" + secondExtent.Width.ToString() + "x" + secondExtent.Height.ToString()
      +" expected=" + secondRoot.Width.ToString() + "x" + secondRoot.Height.ToString())
    Require(thirdMetrics.LogicalWidth == thirdRoot.Width
        && thirdMetrics.LogicalHeight == thirdRoot.Height
        && thirdMetrics.FramebufferWidth == thirdRoot.Width
        && thirdMetrics.FramebufferHeight == thirdRoot.Height
        && thirdExtent.Width == thirdRoot.Width
        && thirdExtent.Height == thirdRoot.Height,
      "Retained performance three-window third metrics or extent did not match manifest: "
      +"logical=" + thirdMetrics.LogicalWidth.ToString() + "x" + thirdMetrics.LogicalHeight.ToString()
      +" framebuffer=" + thirdMetrics.FramebufferWidth.ToString() + "x" + thirdMetrics.FramebufferHeight.ToString()
      +" target_extent=" + thirdExtent.Width.ToString() + "x" + thirdExtent.Height.ToString()
      +" expected=" + thirdRoot.Width.ToString() + "x" + thirdRoot.Height.ToString())
    WindowReadbackTestFixture.SetFocus(openedFirst, true)
    WindowReadbackTestFixture.SetFocus(openedSecond, false)
    WindowReadbackTestFixture.SetFocus(openedThird, false)
    Require(openedFirst.IsFocused && !openedSecond.IsFocused
        && !openedThird.IsFocused,
      "Retained performance three-window initial logical focus is incorrect")
    Require(WindowReadbackTestFixture.CellMounted(firstRoot)
        && WindowReadbackTestFixture.CellMounted(secondRoot)
        && WindowReadbackTestFixture.CellMounted(thirdRoot),
      "Retained performance three-window roots are not mounted")
    window0LivenessVerified = openedFirst.IsOpen
    window1LivenessVerified = openedSecond.IsOpen
    window2LivenessVerified = openedThird.IsOpen
    var warmIndex int32 = 0
    while warmIndex < warmup {
      WindowReadbackTestFixture.PumpNativeEvents()
      firstRoot.Advance(warmIndex)
      WindowReadbackTestFixture.ForceRender(openedFirst, 0.0166666666666667)
      secondRoot.Advance(warmIndex)
      WindowReadbackTestFixture.ForceRender(openedSecond, 0.0166666666666667)
      thirdRoot.Advance(warmIndex)
      WindowReadbackTestFixture.ForceRender(openedThird, 0.0166666666666667)
      warmIndex = warmIndex + 1
    }
    var settlePass int32 = 0
    while settlePass < 16 {
      WindowReadbackTestFixture.PumpNativeEvents()
      if WindowReadbackTestFixture.HasDemand(openedFirst) {
        WindowReadbackTestFixture.ForceRender(openedFirst, 0.0)
      }
      if WindowReadbackTestFixture.HasDemand(openedSecond) {
        WindowReadbackTestFixture.ForceRender(openedSecond, 0.0)
      }
      if WindowReadbackTestFixture.HasDemand(openedThird) {
        WindowReadbackTestFixture.ForceRender(openedThird, 0.0)
      }
      WindowReadbackTestFixture.DrainWindowQueue(openedFirst, 2000)
      WindowReadbackTestFixture.DrainWindowQueue(openedSecond, 2000)
      WindowReadbackTestFixture.DrainWindowQueue(openedThird, 2000)
      settlePass = settlePass + 1
    }
    Require(!WindowReadbackTestFixture.HasDemand(openedFirst)
        && !WindowReadbackTestFixture.HasDemand(openedSecond)
        && !WindowReadbackTestFixture.HasDemand(openedThird),
      "Retained performance three-window settlement retained pending demand")
    timestampSupported = WindowReadbackTestFixture.TimestampSupported(openedFirst)
      && WindowReadbackTestFixture.TimestampSupported(openedSecond)
      && WindowReadbackTestFixture.TimestampSupported(openedThird)
    WindowReadbackTestFixture.SetMainPassTimestampSink(openedFirst,
      func(snapshot VulkanDiagnosticTimestampSnapshot) {
        if collectGpu {
          if capturedGpuCount < capturedGpuFrames.Length {
            capturedGpuFrames[capturedGpuCount] = snapshot.frame
            capturedGpuWindows[capturedGpuCount] = 0
            capturedGpuElapsed[capturedGpuCount] =
            int64(snapshot.elapsedNanoseconds)
            capturedGpuCount = capturedGpuCount + 1
          } else {
            gpuCaptureOverflow = true
          }
        }
      })
    WindowReadbackTestFixture.SetMainPassTimestampSink(openedSecond,
      func(snapshot VulkanDiagnosticTimestampSnapshot) {
        if collectGpu {
          if capturedGpuCount < capturedGpuFrames.Length {
            capturedGpuFrames[capturedGpuCount] = snapshot.frame
            capturedGpuWindows[capturedGpuCount] = 1
            capturedGpuElapsed[capturedGpuCount] =
            int64(snapshot.elapsedNanoseconds)
            capturedGpuCount = capturedGpuCount + 1
          } else {
            gpuCaptureOverflow = true
          }
        }
      })
    WindowReadbackTestFixture.SetMainPassTimestampSink(openedThird,
      func(snapshot VulkanDiagnosticTimestampSnapshot) {
        if collectGpu {
          if capturedGpuCount < capturedGpuFrames.Length {
            capturedGpuFrames[capturedGpuCount] = snapshot.frame
            capturedGpuWindows[capturedGpuCount] = 2
            capturedGpuElapsed[capturedGpuCount] =
            int64(snapshot.elapsedNanoseconds)
            capturedGpuCount = capturedGpuCount + 1
          } else {
            gpuCaptureOverflow = true
          }
        }
      })
    firstCounters = WindowReadbackTestFixture.DiagnosticCounters(openedFirst)
    baselineFirst = firstCounters
    firstFinal = firstCounters
    firstScene = WindowReadbackTestFixture.SceneRetention(openedFirst)
    secondScene = WindowReadbackTestFixture.SceneRetention(openedSecond)
    thirdScene = WindowReadbackTestFixture.SceneRetention(openedThird)
    firstPrimitive = WindowReadbackTestFixture.PrimitiveFrameRetention(openedFirst)
    secondPrimitive = WindowReadbackTestFixture.PrimitiveFrameRetention(openedSecond)
    thirdPrimitive = WindowReadbackTestFixture.PrimitiveFrameRetention(openedThird)
    firstText = WindowReadbackTestFixture.TextFrameRetention(openedFirst)
    secondText = WindowReadbackTestFixture.TextFrameRetention(openedSecond)
    thirdText = WindowReadbackTestFixture.TextFrameRetention(openedThird)
    managedRetainedStart = PerformanceManagedRetained()
    managedLiveStart = PerformanceManagedLive()
    workingSetStart = PerformanceProcessWorkingSet(process)
    privateMemoryStart = PerformanceProcessPrivateMemory(process)
    privateDirtyStart = PerformancePrivateDirty()
    allocatorPeak = firstCounters.allocatorBytes
    vulkanMemoryPeak = firstCounters.vulkanDeviceMemoryBytes
    cachePeak = firstCounters.cacheBytes
    imagePeak = firstCounters.imagePeakResidentBytes
    textAtlasPeak = firstCounters.textAtlasPeakResidentBytes
    resourcePeak = WindowReadbackTestFixture.TargetResidentResourceBytes(firstTarget)
    +WindowReadbackTestFixture.TargetResidentResourceBytes(secondTarget)
    +WindowReadbackTestFixture.TargetResidentResourceBytes(thirdTarget)
    gen0Before = GC.CollectionCount(0)
    gen1Before = GC.CollectionCount(1)
    gen2Before = GC.CollectionCount(2)
    pauseTicksBefore = GC.GetTotalPauseDuration().Ticks
    managedLivePeak = managedLiveStart
    workingSetPeak = workingSetStart
    privateMemoryPeak = privateMemoryStart
    collectGpu = true
    var sampleIndex int32 = 0
    while sampleIndex < samples {
      WindowReadbackTestFixture.PumpNativeEvents()
      selectedIndex = (sampleIndex / 60) % 3
      let focusTransition = sampleIndex > 0 && sampleIndex % 60 == 0
      var focusLossIndex int32 = -1
      if focusTransition {
        focusLossIndex = lastSelectedIndex
        focusRotations = focusRotations + 1
      }
      let selectedRoot = PerformanceThreeWindowSelectRoot(selectedIndex,
        firstRoot, secondRoot, thirdRoot)
      let selectedWindow = PerformanceThreeWindowSelectWindow(selectedIndex,
        openedFirst, openedSecond, openedThird)
      let selectedControlBefore = selectedRoot.Control.BorderBox
      let selectedPointerBefore = selectedRoot.PointerCount
      let selectedKeyBefore = selectedRoot.KeyCount
      let selectedTextBefore = selectedRoot.TextCount
      let selectedCallbackBefore = selectedRoot.CallbackOrder
      let selectedCleanFirst = selectedIndex != 0
      let selectedCleanSecond = selectedIndex != 1
      let selectedCleanThird = selectedIndex != 2
      let firstSubmissionsBefore = WindowReadbackTestFixture.FrameSubmissions(openedFirst)
      let secondSubmissionsBefore = WindowReadbackTestFixture.FrameSubmissions(openedSecond)
      let thirdSubmissionsBefore = WindowReadbackTestFixture.FrameSubmissions(openedThird)
      let globalBefore = WindowReadbackTestFixture.DiagnosticCounters(openedFirst)
      var stableFirst = firstSubmissionsBefore
      var stableSecond = secondSubmissionsBefore
      var stableThird = thirdSubmissionsBefore
      var selectedGlobalBefore = globalBefore
      var expectedGlobalFrames uint64 = 1uL
      let allocatedBefore = GC.GetAllocatedBytesForCurrentThread()
      let start = Stopwatch.GetTimestamp()
      if focusTransition {
        let focusLossWindow = PerformanceThreeWindowSelectWindow(focusLossIndex,
          openedFirst, openedSecond, openedThird)
        WindowReadbackTestFixture.SetFocus(focusLossWindow, false)
        WindowReadbackTestFixture.SetFocus(selectedWindow, true)
        let focusLossDemand = WindowReadbackTestFixture.HasDemand(focusLossWindow)
        Require(selectedWindow.IsFocused && !focusLossWindow.IsFocused,
          "Retained performance three-window focus rotation state is incorrect")
        var focusGlobalAfter = globalBefore
        if focusLossDemand {
          let focusGlobalBefore = WindowReadbackTestFixture.DiagnosticCounters(openedFirst)
          WindowReadbackTestFixture.ForceRender(focusLossWindow, 0.0)
          focusGlobalAfter = WindowReadbackTestFixture.DiagnosticCounters(openedFirst)
          Require(focusGlobalAfter.submitCount
            == focusGlobalBefore.submitCount + 1uL
              && focusGlobalAfter.presentCount
            == focusGlobalBefore.presentCount + 1uL,
            "Retained performance three-window focus-loss render did not submit and present once")
        }
        let focusFirst = WindowReadbackTestFixture.FrameSubmissions(openedFirst)
        let focusSecond = WindowReadbackTestFixture.FrameSubmissions(openedSecond)
        let focusThird = WindowReadbackTestFixture.FrameSubmissions(openedThird)
        let focusFirstSlot0Changed = focusFirst.Slot0Serial
        != firstSubmissionsBefore.Slot0Serial
        let focusFirstSlot1Changed = focusFirst.Slot1Serial
        != firstSubmissionsBefore.Slot1Serial
        let focusSecondSlot0Changed = focusSecond.Slot0Serial
        != secondSubmissionsBefore.Slot0Serial
        let focusSecondSlot1Changed = focusSecond.Slot1Serial
        != secondSubmissionsBefore.Slot1Serial
        let focusThirdSlot0Changed = focusThird.Slot0Serial
        != thirdSubmissionsBefore.Slot0Serial
        let focusThirdSlot1Changed = focusThird.Slot1Serial
        != thirdSubmissionsBefore.Slot1Serial
        if focusLossDemand {
          if focusLossIndex == 0 {
            Require((focusFirstSlot0Changed && !focusFirstSlot1Changed)
                || (!focusFirstSlot0Changed && focusFirstSlot1Changed),
              "Retained performance three-window first focus-loss render did not change one slot")
            Require(!focusSecondSlot0Changed && !focusSecondSlot1Changed
                && !focusThirdSlot0Changed && !focusThirdSlot1Changed,
              "Retained performance three-window unaffected windows changed during first focus loss")
          } else if focusLossIndex == 1 {
            Require((focusSecondSlot0Changed && !focusSecondSlot1Changed)
                || (!focusSecondSlot0Changed && focusSecondSlot1Changed),
              "Retained performance three-window second focus-loss render did not change one slot")
            Require(!focusFirstSlot0Changed && !focusFirstSlot1Changed
                && !focusThirdSlot0Changed && !focusThirdSlot1Changed,
              "Retained performance three-window unaffected windows changed during second focus loss")
          } else {
            Require((focusThirdSlot0Changed && !focusThirdSlot1Changed)
                || (!focusThirdSlot0Changed && focusThirdSlot1Changed),
              "Retained performance three-window third focus-loss render did not change one slot")
            Require(!focusFirstSlot0Changed && !focusFirstSlot1Changed
                && !focusSecondSlot0Changed && !focusSecondSlot1Changed,
              "Retained performance three-window unaffected windows changed during third focus loss")
          }
          stableFirst = focusFirst
          stableSecond = focusSecond
          stableThird = focusThird
          selectedGlobalBefore = focusGlobalAfter
          expectedGlobalFrames = expectedGlobalFrames + 1uL
          focusLossSubmitCount = focusLossSubmitCount + 1
          if focusLossIndex == 0 {
            window0SubmitDelta = window0SubmitDelta + 1uL
            window0PresentDelta = window0PresentDelta + 1uL
          } else if focusLossIndex == 1 {
            window1SubmitDelta = window1SubmitDelta + 1uL
            window1PresentDelta = window1PresentDelta + 1uL
          } else {
            window2SubmitDelta = window2SubmitDelta + 1uL
            window2PresentDelta = window2PresentDelta + 1uL
          }
        } else if focusLossIndex == 0 {
          Require(!focusFirstSlot0Changed && !focusFirstSlot1Changed,
            "Retained performance three-window clean first focus-loss window changed a frame slot")
          Require(!focusSecondSlot0Changed && !focusSecondSlot1Changed
              && !focusThirdSlot0Changed && !focusThirdSlot1Changed,
            "Retained performance three-window unaffected windows changed during clean first focus loss")
        } else if focusLossIndex == 1 {
          Require(!focusSecondSlot0Changed && !focusSecondSlot1Changed,
            "Retained performance three-window clean second focus-loss window changed a frame slot")
          Require(!focusFirstSlot0Changed && !focusFirstSlot1Changed
              && !focusThirdSlot0Changed && !focusThirdSlot1Changed,
            "Retained performance three-window unaffected windows changed during clean second focus loss")
        } else {
          Require(!focusThirdSlot0Changed && !focusThirdSlot1Changed,
            "Retained performance three-window clean third focus-loss window changed a frame slot")
          Require(!focusFirstSlot0Changed && !focusFirstSlot1Changed
              && !focusSecondSlot0Changed && !focusSecondSlot1Changed,
            "Retained performance three-window unaffected windows changed during clean third focus loss")
        }
      }
      Require(selectedWindow.IsFocused,
        "Retained performance three-window selected window was not focused")
      selectedRoot.Advance(warmup + sampleIndex)
      Require(WindowReadbackTestFixture.CellDirty(selectedRoot),
        "Retained performance three-window selected root was not dirtied")
      let pointerX = selectedControlBefore.X + selectedControlBefore.Width * 0.5
      let pointerY = selectedControlBefore.Y + selectedControlBefore.Height * 0.5
      WindowReadbackTestFixture.InputQueuePointerPress(selectedWindow, pointerX, pointerY)
      WindowReadbackTestFixture.InputQueuePointerRelease(selectedWindow, pointerX, pointerY)
      Require(selectedRoot.FocusEntry(),
        "Retained performance three-window entry did not accept focus")
      WindowReadbackTestFixture.InputQueueKeyPress(selectedWindow, Key.A)
      WindowReadbackTestFixture.InputQueueKeyRelease(selectedWindow, Key.A)
      WindowReadbackTestFixture.QueueText(selectedWindow, "x")
      var end int64 = 0L
      var allocatedAfter int64 = allocatedBefore
      var submitAttempt int32 = 0
      var globalAfter = selectedGlobalBefore
      while submitAttempt < 1000
        && (globalAfter.submitCount == selectedGlobalBefore.submitCount
            || globalAfter.presentCount == selectedGlobalBefore.presentCount) {
              let globalAttemptBefore = WindowReadbackTestFixture.DiagnosticCounters(openedFirst)
              WindowReadbackTestFixture.ForceRenderNonblocking(selectedWindow,
                submitAttempt == 0 ? 0.0166666666666667 : 0.0)
              end = Stopwatch.GetTimestamp()
              allocatedAfter = GC.GetAllocatedBytesForCurrentThread()
              WindowReadbackTestFixture.DrainWindowQueue(selectedWindow, 2000)
              globalAfter = WindowReadbackTestFixture.DiagnosticCounters(openedFirst)
              if globalAfter.submitCount == globalAttemptBefore.submitCount
                || globalAfter.presentCount == globalAttemptBefore.presentCount{
                  WindowReadbackTestFixture.PumpNativeEvents()
                }
              submitAttempt = submitAttempt + 1
            }
      Require(globalAfter.submitCount == selectedGlobalBefore.submitCount + 1uL,
        "Retained performance three-window measured frame did not submit exactly once")
      Require(globalAfter.presentCount == selectedGlobalBefore.presentCount + 1uL,
        "Retained performance three-window measured frame did not present exactly once")
      Require(globalAfter.submitCount == globalBefore.submitCount
        +expectedGlobalFrames
          && globalAfter.presentCount == globalBefore.presentCount
        +expectedGlobalFrames,
        "Retained performance three-window measured global delta is incorrect")
      expectedGpuFrames[sampleIndex] =
      WindowReadbackTestFixture.DiagnosticFrameId(selectedWindow)
      expectedGpuWindows[sampleIndex] = selectedIndex
      let firstSubmissionsAfter = WindowReadbackTestFixture.FrameSubmissions(openedFirst)
      let secondSubmissionsAfter = WindowReadbackTestFixture.FrameSubmissions(openedSecond)
      let thirdSubmissionsAfter = WindowReadbackTestFixture.FrameSubmissions(openedThird)
      if selectedIndex == 0 {
        let slot0Changed = firstSubmissionsAfter.Slot0Serial
        != stableFirst.Slot0Serial
        let slot1Changed = firstSubmissionsAfter.Slot1Serial
        != stableFirst.Slot1Serial
        Require((slot0Changed && !slot1Changed)
            || (!slot0Changed && slot1Changed),
          "Retained performance three-window selected first window did not change one frame slot")
        window0SubmitDelta = window0SubmitDelta + 1uL
        window0PresentDelta = window0PresentDelta + 1uL
      } else if selectedIndex == 1 {
        let slot0Changed = secondSubmissionsAfter.Slot0Serial
        != stableSecond.Slot0Serial
        let slot1Changed = secondSubmissionsAfter.Slot1Serial
        != stableSecond.Slot1Serial
        Require((slot0Changed && !slot1Changed)
            || (!slot0Changed && slot1Changed),
          "Retained performance three-window selected second window did not change one frame slot")
        window1SubmitDelta = window1SubmitDelta + 1uL
        window1PresentDelta = window1PresentDelta + 1uL
      } else {
        let slot0Changed = thirdSubmissionsAfter.Slot0Serial
        != stableThird.Slot0Serial
        let slot1Changed = thirdSubmissionsAfter.Slot1Serial
        != stableThird.Slot1Serial
        Require((slot0Changed && !slot1Changed)
            || (!slot0Changed && slot1Changed),
          "Retained performance three-window selected third window did not change one frame slot")
        window2SubmitDelta = window2SubmitDelta + 1uL
        window2PresentDelta = window2PresentDelta + 1uL
      }
      if selectedCleanFirst {
        let unchanged = firstSubmissionsAfter.Slot0Serial
        == stableFirst.Slot0Serial
          && firstSubmissionsAfter.Slot1Serial
        == stableFirst.Slot1Serial
        Require(unchanged,
          "Retained performance three-window clean first window changed a frame slot")
        let cleanDelta = unchanged ? 0uL : 1uL
        cleanSubmitDelta = cleanSubmitDelta + cleanDelta
        cleanPresentDelta = cleanPresentDelta + cleanDelta
      }
      if selectedCleanSecond {
        let unchanged = secondSubmissionsAfter.Slot0Serial
        == stableSecond.Slot0Serial
          && secondSubmissionsAfter.Slot1Serial
        == stableSecond.Slot1Serial
        Require(unchanged,
          "Retained performance three-window clean second window changed a frame slot")
        let cleanDelta = unchanged ? 0uL : 1uL
        cleanSubmitDelta = cleanSubmitDelta + cleanDelta
        cleanPresentDelta = cleanPresentDelta + cleanDelta
      }
      if selectedCleanThird {
        let unchanged = thirdSubmissionsAfter.Slot0Serial
        == stableThird.Slot0Serial
          && thirdSubmissionsAfter.Slot1Serial
        == stableThird.Slot1Serial
        Require(unchanged,
          "Retained performance three-window clean third window changed a frame slot")
        let cleanDelta = unchanged ? 0uL : 1uL
        cleanSubmitDelta = cleanSubmitDelta + cleanDelta
        cleanPresentDelta = cleanPresentDelta + cleanDelta
      }
      if selectedIndex == 0 {
        Require(openedFirst.IsFocused && !openedSecond.IsFocused
            && !openedThird.IsFocused,
          "Retained performance three-window first focus state is incorrect")
      } else if selectedIndex == 1 {
        Require(openedSecond.IsFocused && !openedFirst.IsFocused
            && !openedThird.IsFocused,
          "Retained performance three-window second focus state is incorrect")
      } else {
        Require(openedThird.IsFocused && !openedFirst.IsFocused
            && !openedSecond.IsFocused,
          "Retained performance three-window third focus state is incorrect")
      }
      if selectedRoot.PointerCount != selectedPointerBefore + 1
        || selectedRoot.KeyCount != selectedKeyBefore + 1
        || selectedRoot.TextCount != selectedTextBefore + 1 {
          throw InvalidOperationException("Retained performance three-window input callback delta is incorrect")
        }
      Require(selectedRoot.CallbackOrder == selectedCallbackBefore + 3
          && selectedRoot.PointerOrder < selectedRoot.KeyOrder
          && selectedRoot.KeyOrder < selectedRoot.TextOrder,
        "Retained performance three-window callback order is incorrect")
      if selectedIndex == 0 {
        fairness0 = fairness0 + 1
      } else if selectedIndex == 1 {
        fairness1 = fairness1 + 1
      } else {
        fairness2 = fairness2 + 1
      }
      let firstPrimitiveAfter = WindowReadbackTestFixture.PrimitiveFrameRetention(openedFirst)
      let secondPrimitiveAfter = WindowReadbackTestFixture.PrimitiveFrameRetention(openedSecond)
      let thirdPrimitiveAfter = WindowReadbackTestFixture.PrimitiveFrameRetention(openedThird)
      let firstTextAfter = WindowReadbackTestFixture.TextFrameRetention(openedFirst)
      let secondTextAfter = WindowReadbackTestFixture.TextFrameRetention(openedSecond)
      let thirdTextAfter = WindowReadbackTestFixture.TextFrameRetention(openedThird)
      firstPrimitive = firstPrimitiveAfter
      secondPrimitive = secondPrimitiveAfter
      thirdPrimitive = thirdPrimitiveAfter
      firstText = firstTextAfter
      secondText = secondTextAfter
      thirdText = thirdTextAfter
      if selectedIndex == 0 {
        firstScene = WindowReadbackTestFixture.SceneRetention(openedFirst)
      } else if selectedIndex == 1 {
        secondScene = WindowReadbackTestFixture.SceneRetention(openedSecond)
      } else {
        thirdScene = WindowReadbackTestFixture.SceneRetention(openedThird)
      }
      if firstPrimitiveAfter.SlotIndex == 0 { firstSlot0 = true }
      if firstPrimitiveAfter.SlotIndex == 1 { firstSlot1 = true }
      if secondPrimitiveAfter.SlotIndex == 0 { secondSlot0 = true }
      if secondPrimitiveAfter.SlotIndex == 1 { secondSlot1 = true }
      if thirdPrimitiveAfter.SlotIndex == 0 { thirdSlot0 = true }
      if thirdPrimitiveAfter.SlotIndex == 1 { thirdSlot1 = true }
      if firstTextAfter.SlotIndex == 0 { firstTextSlot0 = true }
      if firstTextAfter.SlotIndex == 1 { firstTextSlot1 = true }
      if secondTextAfter.SlotIndex == 0 { secondTextSlot0 = true }
      if secondTextAfter.SlotIndex == 1 { secondTextSlot1 = true }
      if thirdTextAfter.SlotIndex == 0 { thirdTextSlot0 = true }
      if thirdTextAfter.SlotIndex == 1 { thirdTextSlot1 = true }
      frameNs[sampleIndex] = TicksToNanoseconds(end - start)
      frameAllocations[sampleIndex] = allocatedAfter - allocatedBefore
      let live = PerformanceManagedLive()
      let working = PerformanceProcessWorkingSet(process)
      let privateMemory = PerformanceProcessPrivateMemory(process)
      managedLiveEnd = live
      workingSetEnd = working
      privateMemoryEnd = privateMemory
      if live > managedLivePeak { managedLivePeak = live }
      if working > workingSetPeak { workingSetPeak = working }
      if privateMemory > privateMemoryPeak { privateMemoryPeak = privateMemory }
      let combinedAllocator = globalAfter.allocatorBytes
      let combinedVulkanMemory = globalAfter.vulkanDeviceMemoryBytes
      let combinedCache = globalAfter.cacheBytes
      let combinedImagePeak = globalAfter.imagePeakResidentBytes
      let combinedTextAtlasPeak = globalAfter.textAtlasPeakResidentBytes
      let combinedResources =
      WindowReadbackTestFixture.TargetResidentResourceBytes(firstTarget)
      +WindowReadbackTestFixture.TargetResidentResourceBytes(secondTarget)
      +WindowReadbackTestFixture.TargetResidentResourceBytes(thirdTarget)
      if combinedAllocator > allocatorPeak { allocatorPeak = combinedAllocator }
      if combinedVulkanMemory > vulkanMemoryPeak { vulkanMemoryPeak = combinedVulkanMemory }
      if combinedCache > cachePeak { cachePeak = combinedCache }
      if combinedImagePeak > imagePeak { imagePeak = combinedImagePeak }
      if combinedTextAtlasPeak > textAtlasPeak { textAtlasPeak = combinedTextAtlasPeak }
      if combinedResources > resourcePeak { resourcePeak = combinedResources }
      lastSelectedIndex = selectedIndex
      sampleIndex = sampleIndex + 1
    }
    firstFinal = WindowReadbackTestFixture.DiagnosticCounters(openedFirst)
    firstScene = WindowReadbackTestFixture.SceneRetention(openedFirst)
    secondScene = WindowReadbackTestFixture.SceneRetention(openedSecond)
    thirdScene = WindowReadbackTestFixture.SceneRetention(openedThird)
    var resolveIndex int32 = 0
    while resolveIndex < 2 {
      WindowReadbackTestFixture.PumpNativeEvents()
      WindowReadbackTestFixture.ForceRender(openedFirst, 0.0)
      WindowReadbackTestFixture.DrainWindowQueue(openedFirst, 2000)
      WindowReadbackTestFixture.ForceRender(openedSecond, 0.0)
      WindowReadbackTestFixture.DrainWindowQueue(openedSecond, 2000)
      WindowReadbackTestFixture.ForceRender(openedThird, 0.0)
      WindowReadbackTestFixture.DrainWindowQueue(openedThird, 2000)
      resolveIndex = resolveIndex + 1
    }
    if timestampSupported {
      var gpuResolveIndex int32 = 0
      while gpuResolveIndex < samples {
        var matches int32 = 0
        var capturedIndex int32 = 0
        while capturedIndex < capturedGpuCount {
          if !capturedGpuMatched[capturedIndex]
            && capturedGpuWindows[capturedIndex]
          == expectedGpuWindows[gpuResolveIndex]
            && capturedGpuFrames[capturedIndex]
          == expectedGpuFrames[gpuResolveIndex]{
            gpuNs[gpuResolveIndex] = capturedGpuElapsed[capturedIndex]
            capturedGpuMatched[capturedIndex] = true
            matches = matches + 1
          }
          capturedIndex = capturedIndex + 1
        }
        Require(matches == 1,
          "Retained performance three-window measured GPU frame did not match exactly once")
        gpuCount = gpuCount + 1
        gpuResolveIndex = gpuResolveIndex + 1
      }
      Require(gpuCount == samples,
        "Retained performance three-window did not resolve every measured GPU sample")
    }
    Require(!gpuCaptureOverflow,
      "Retained performance three-window GPU capture buffer overflowed")
    collectGpu = false
    WindowReadbackTestFixture.SetMainPassTimestampSink(openedFirst, nil)
    WindowReadbackTestFixture.SetMainPassTimestampSink(openedSecond, nil)
    WindowReadbackTestFixture.SetMainPassTimestampSink(openedThird, nil)
    Require(sampleIndex == samples,
      "Retained performance three-window sample count is incorrect")
    managedLiveEnd = PerformanceManagedLive()
    workingSetEnd = PerformanceProcessWorkingSet(process)
    privateMemoryEnd = PerformanceProcessPrivateMemory(process)
    privateDirtyEnd = PerformancePrivateDirty()
    managedRetainedEnd = PerformanceManagedRetained()
    gen0After = GC.CollectionCount(0)
    gen1After = GC.CollectionCount(1)
    gen2After = GC.CollectionCount(2)
    pauseTicksAfter = GC.GetTotalPauseDuration().Ticks
    if managedLiveEnd > managedLivePeak { managedLivePeak = managedLiveEnd }
    if workingSetEnd > workingSetPeak { workingSetPeak = workingSetEnd }
    if privateMemoryEnd > privateMemoryPeak { privateMemoryPeak = privateMemoryEnd }
    Require(firstRoot.Invariant() && secondRoot.Invariant() && thirdRoot.Invariant(),
      "Retained performance three-window root invariant failed")
    Require(cleanSubmitDelta == 0uL && cleanPresentDelta == 0uL,
      "Retained performance three-window clean windows submitted or presented")
    resourceCurrent = WindowReadbackTestFixture.TargetResidentResourceBytes(firstTarget)
    +WindowReadbackTestFixture.TargetResidentResourceBytes(secondTarget)
    +WindowReadbackTestFixture.TargetResidentResourceBytes(thirdTarget)
    PerformanceCloseWindow(openedFirst)
    window0CloseVerified = !openedFirst.IsOpen
    Require(window0CloseVerified && openedSecond.IsOpen && openedThird.IsOpen,
      "Retained performance three-window first close was not independent")
    Require(WindowReadbackTestFixture.TargetResidentResourceBytes(firstTarget)
      == 0uL,
      "Retained performance three-window first target retained resources after close")
    firstCloseVerified = window0CloseVerified
    let secondLiveBefore = WindowReadbackTestFixture.FrameSubmissions(openedSecond)
    let thirdLiveBefore = WindowReadbackTestFixture.FrameSubmissions(openedThird)
    secondRoot.Advance(warmup + samples + 1)
    WindowReadbackTestFixture.ForceRender(openedSecond, 0.0)
    WindowReadbackTestFixture.DrainWindowQueue(openedSecond, 2000)
    thirdRoot.Advance(warmup + samples + 1)
    WindowReadbackTestFixture.ForceRender(openedThird, 0.0)
    WindowReadbackTestFixture.DrainWindowQueue(openedThird, 2000)
    let secondLiveAfter = WindowReadbackTestFixture.FrameSubmissions(openedSecond)
    let thirdLiveAfter = WindowReadbackTestFixture.FrameSubmissions(openedThird)
    let secondSlotChanged = (secondLiveAfter.Slot0Serial
      != secondLiveBefore.Slot0Serial
        && secondLiveAfter.Slot1Serial == secondLiveBefore.Slot1Serial)
      || (secondLiveAfter.Slot0Serial == secondLiveBefore.Slot0Serial
          && secondLiveAfter.Slot1Serial != secondLiveBefore.Slot1Serial)
    let thirdSlotChanged = (thirdLiveAfter.Slot0Serial
      != thirdLiveBefore.Slot0Serial
        && thirdLiveAfter.Slot1Serial == thirdLiveBefore.Slot1Serial)
      || (thirdLiveAfter.Slot0Serial == thirdLiveBefore.Slot0Serial
          && thirdLiveAfter.Slot1Serial != thirdLiveBefore.Slot1Serial)
    window0LivenessVerified = window0LivenessVerified && window0CloseVerified
    window1LivenessVerified = secondSlotChanged && openedSecond.IsOpen
      && secondRoot.Invariant()
    window2LivenessVerified = thirdSlotChanged && openedThird.IsOpen
      && thirdRoot.Invariant()
    Require(window1LivenessVerified && window2LivenessVerified,
      "Retained performance three-window remaining windows are not live")
    remainingLivenessVerified = window1LivenessVerified
      && window2LivenessVerified
    PerformanceCloseWindow(openedSecond)
    window1CloseVerified = !openedSecond.IsOpen
    Require(window1CloseVerified
        && WindowReadbackTestFixture.TargetResidentResourceBytes(secondTarget)
      == 0uL,
      "Retained performance three-window second target did not close cleanly")
    PerformanceCloseWindow(openedThird)
    window2CloseVerified = !openedThird.IsOpen
    Require(window2CloseVerified
        && WindowReadbackTestFixture.TargetResidentResourceBytes(thirdTarget)
      == 0uL,
      "Retained performance three-window third target did not close cleanly")
    Require(!openedFirst.IsOpen && !openedSecond.IsOpen && !openedThird.IsOpen,
      "Retained performance three-window final close did not close all windows")
    finalCloseVerified = window0CloseVerified && window1CloseVerified
      && window2CloseVerified
    let resourceAfterFirstClose =
    WindowReadbackTestFixture.TargetResidentResourceBytes(firstTarget)
    let resourceAfterSecondClose =
    WindowReadbackTestFixture.TargetResidentResourceBytes(secondTarget)
    let resourceAfterThirdClose =
    WindowReadbackTestFixture.TargetResidentResourceBytes(thirdTarget)
    resourceEnd = resourceAfterFirstClose + resourceAfterSecondClose
    +resourceAfterThirdClose
    finalZeroResources = resourceAfterFirstClose == 0uL
      && resourceAfterSecondClose == 0uL
      && resourceAfterThirdClose == 0uL
    Require(finalZeroResources,
      "Retained performance three-window resources remain resident after close")
  } finally {
    collectGpu = false
    if let active = first {
      if active.IsOpen {
        PerformanceCloseWindow(active)
      }
    }
    if let active = second {
      if active.IsOpen {
        PerformanceCloseWindow(active)
      }
    }
    if let active = third {
      if active.IsOpen {
        PerformanceCloseWindow(active)
      }
    }
  }
  var finalPrimitive = firstPrimitive
  var finalText = firstText
  var finalScene = firstScene
  if lastSelectedIndex == 1 {
    finalPrimitive = secondPrimitive
    finalText = secondText
    finalScene = secondScene
  } else if lastSelectedIndex == 2 {
    finalPrimitive = thirdPrimitive
    finalText = thirdText
    finalScene = thirdScene
  }
  let gpu = PerformanceGpuStats(gpuNs, gpuCount)
  var allocationSum int64 = 0L
  var allocationIndex int32 = 0
  while allocationIndex < samples {
    allocationSum = allocationSum + frameAllocations[allocationIndex]
    allocationIndex = allocationIndex + 1
  }
  let allocationP50 = PerformancePercentileCount(frameAllocations, samples, 0.50)
  let allocationP95 = PerformancePercentileCount(frameAllocations, samples, 0.95)
  let allocationP99 = PerformancePercentileCount(frameAllocations, samples, 0.99)
  let allocationP999 = PerformancePercentileCount(frameAllocations, samples, 0.999)
  let allocationWorst = PerformanceMaxCount(frameAllocations, samples)
  let beforeRebuild = baselineFirst.rebuildCount
  let finalRebuild = firstFinal.rebuildCount
  let beforeLayout = baselineFirst.layoutCount
  let finalLayout = firstFinal.layoutCount
  let beforeUpload = baselineFirst.uploadCount
  let finalUpload = firstFinal.uploadCount
  let beforePlan = baselineFirst.planCompileCount
  let finalPlan = firstFinal.planCompileCount
  let beforeRecord = baselineFirst.recordCount
  let finalRecord = firstFinal.recordCount
  let beforeSubmit = baselineFirst.submitCount
  let finalSubmit = firstFinal.submitCount
  let beforePresent = baselineFirst.presentCount
  let finalPresent = firstFinal.presentCount
  let beforeDraw = baselineFirst.drawCount
  let finalDraw = firstFinal.drawCount
  let beforePass = baselineFirst.passCount
  let finalPass = firstFinal.passCount
  let beforeBarrier = baselineFirst.barrierCount
  let finalBarrier = firstFinal.barrierCount
  let beforeDamage = baselineFirst.damageCount
  let finalDamage = firstFinal.damageCount
  let beforeDamageArea = baselineFirst.damageArea
  let finalDamageArea = firstFinal.damageArea
  let submitDelta = PerformanceDelta(finalSubmit, beforeSubmit)
  let presentDelta = PerformanceDelta(finalPresent, beforePresent)
  let expectedSubmitDelta = uint64(samples) + uint64(focusLossSubmitCount)
  let expectedPresentDelta = expectedSubmitDelta
  Require(submitDelta == expectedSubmitDelta
      && presentDelta == expectedPresentDelta,
    "Retained performance three-window combined submit or present delta is incorrect")
  let window0Pointer = firstRoot.PointerCount
  let window1Pointer = secondRoot.PointerCount
  let window2Pointer = thirdRoot.PointerCount
  let window0Key = firstRoot.KeyCount
  let window1Key = secondRoot.KeyCount
  let window2Key = thirdRoot.KeyCount
  let window0Text = firstRoot.TextCount
  let window1Text = secondRoot.TextCount
  let window2Text = thirdRoot.TextCount
  let window0Callback = firstRoot.CallbackOrder
  let window1Callback = secondRoot.CallbackOrder
  let window2Callback = thirdRoot.CallbackOrder
  Require(firstSlot0 && firstSlot1 && secondSlot0 && secondSlot1
      && thirdSlot0 && thirdSlot1,
    "Retained performance three-window did not exercise primitive frame slots 0 and 1 for every window")
  Require(firstTextSlot0 && firstTextSlot1 && secondTextSlot0
      && secondTextSlot1 && thirdTextSlot0 && thirdTextSlot1,
    "Retained performance three-window did not exercise text frame slots 0 and 1 for every window")
  Console.WriteLine("performance: workload=three-window"
    +" seed=" + PerformanceThreeWindowRoot.ManifestSeed.ToString()
    +" windows=3"
    +" width0=" + PerformanceThreeWindowRoot.PrimaryWidth.ToString()
    +" height0=" + PerformanceThreeWindowRoot.PrimaryHeight.ToString()
    +" width1=" + PerformanceThreeWindowRoot.SecondaryWidth.ToString()
    +" height1=" + PerformanceThreeWindowRoot.SecondaryHeight.ToString()
    +" width2=" + PerformanceThreeWindowRoot.SecondaryWidth.ToString()
    +" height2=" + PerformanceThreeWindowRoot.SecondaryHeight.ToString()
    +" logical_width0=" + actualLogicalWidth0.ToString()
    +" logical_height0=" + actualLogicalHeight0.ToString()
    +" framebuffer_width0=" + actualFramebufferWidth0.ToString()
    +" framebuffer_height0=" + actualFramebufferHeight0.ToString()
    +" logical_width1=" + actualLogicalWidth1.ToString()
    +" logical_height1=" + actualLogicalHeight1.ToString()
    +" framebuffer_width1=" + actualFramebufferWidth1.ToString()
    +" framebuffer_height1=" + actualFramebufferHeight1.ToString()
    +" logical_width2=" + actualLogicalWidth2.ToString()
    +" logical_height2=" + actualLogicalHeight2.ToString()
    +" framebuffer_width2=" + actualFramebufferWidth2.ToString()
    +" framebuffer_height2=" + actualFramebufferHeight2.ToString()
    +" logical=" + firstRoot.LogicalCount.ToString()
    +" logical_edges=" + firstRoot.LogicalEdges.ToString()
    +" visible_edges=" + firstRoot.VisibleEdges.ToString()
    +" visible=" + firstRoot.VisibleCount.ToString()
    +" mounted=" + firstRoot.MountedCount.ToString()
    +" mounted_bound=" + firstRoot.MountedBound.ToString()
    +" mutations=" + firstRoot.MutationCount.ToString()
    +" warmup=" + warmup.ToString()
    +" samples=" + samples.ToString()
    +" cpu_p50_ns=" + Percentile(frameNs, 0.50).ToString()
    +" cpu_p95_ns=" + Percentile(frameNs, 0.95).ToString()
    +" cpu_p99_ns=" + Percentile(frameNs, 0.99).ToString()
    +" cpu_p999_ns=" + Percentile(frameNs, 0.999).ToString()
    +" cpu_worst_ns=" + Maximum(frameNs).ToString()
    +" managed_alloc_p50_B=" + allocationP50.ToString()
    +" managed_alloc_p95_B=" + allocationP95.ToString()
    +" managed_alloc_p99_B=" + allocationP99.ToString()
    +" managed_alloc_p999_B=" + allocationP999.ToString()
    +" managed_alloc_worst_B=" + allocationWorst.ToString()
    +" managed_alloc_total_B=" + allocationSum.ToString()
    +" managed_live_start_B=" + managedLiveStart.ToString()
    +" managed_live_end_B=" + managedLiveEnd.ToString()
    +" managed_live_peak_B=" + managedLivePeak.ToString()
    +" managed_retained_start_B=" + managedRetainedStart.ToString()
    +" managed_retained_end_B=" + managedRetainedEnd.ToString()
    +" working_set_start_B=" + workingSetStart.ToString()
    +" working_set_end_B=" + workingSetEnd.ToString()
    +" working_set_peak_B=" + workingSetPeak.ToString()
    +" private_memory_start_B=" + privateMemoryStart.ToString()
    +" private_memory_end_B=" + privateMemoryEnd.ToString()
    +" private_memory_peak_B=" + privateMemoryPeak.ToString()
    +" private_dirty_start_B=" + privateDirtyStart.ToString()
    +" private_dirty_end_B=" + privateDirtyEnd.ToString()
    +" allocator_current_B=" + firstFinal.allocatorBytes.ToString()
    +" allocator_peak_B=" + allocatorPeak.ToString()
    +" vk_memory_current_B=" + firstFinal.vulkanDeviceMemoryBytes.ToString()
    +" vk_memory_peak_B=" + vulkanMemoryPeak.ToString()
    +" image_current_B=" + firstFinal.imageResidentBytes.ToString()
    +" text_atlas_current_B=" + firstFinal.textAtlasResidentBytes.ToString()
    +" cache_current_B=" + firstFinal.cacheBytes.ToString()
    +" cache_peak_B=" + cachePeak.ToString()
    +" image_peak_B=" + imagePeak.ToString()
    +" text_atlas_peak_B=" + textAtlasPeak.ToString()
    +" resource_current_B=" + resourceCurrent.ToString()
    +" resource_peak_B=" + resourcePeak.ToString()
    +" resource_end_B=" + resourceEnd.ToString()
    +" gc_gen0_delta=" + (gen0After - gen0Before).ToString()
    +" gc_gen1_delta=" + (gen1After - gen1Before).ToString()
    +" gc_gen2_delta=" + (gen2After - gen2Before).ToString()
    +" gc_pause_ns=" + ((pauseTicksAfter - pauseTicksBefore) * 100L).ToString()
    +" managed_diagnostic_B=" + firstFinal.managedAllocatedBytes.ToString()
    +" vk_object_alloc_delta="
    +PerformanceDelta(firstFinal.vulkanObjectAllocationCount,
      baselineFirst.vulkanObjectAllocationCount).ToString()
    +" vk_device_alloc_delta="
    +PerformanceDelta(firstFinal.vulkanDeviceMemoryAllocationCount,
      baselineFirst.vulkanDeviceMemoryAllocationCount).ToString()
    +" warm_vk_object_alloc_delta="
    +PerformanceDelta(firstFinal.vulkanObjectAllocationCount,
      baselineFirst.vulkanObjectAllocationCount).ToString()
    +" warm_vk_device_alloc_delta="
    +PerformanceDelta(firstFinal.vulkanDeviceMemoryAllocationCount,
      baselineFirst.vulkanDeviceMemoryAllocationCount).ToString()
    +" rebuild_delta=" + PerformanceDelta(finalRebuild, beforeRebuild).ToString()
    +" layout_delta=" + PerformanceDelta(finalLayout, beforeLayout).ToString()
    +" upload_delta=" + PerformanceDelta(finalUpload, beforeUpload).ToString()
    +" plan_delta=" + PerformanceDelta(finalPlan, beforePlan).ToString()
    +" record_delta=" + PerformanceDelta(finalRecord, beforeRecord).ToString()
    +" draw_delta=" + PerformanceDelta(finalDraw, beforeDraw).ToString()
    +" pass_delta=" + PerformanceDelta(finalPass, beforePass).ToString()
    +" barrier_delta=" + PerformanceDelta(finalBarrier, beforeBarrier).ToString()
    +" submit_delta=" + submitDelta.ToString()
    +" present_delta=" + presentDelta.ToString()
    +" clean_submit_delta=" + cleanSubmitDelta.ToString()
    +" clean_present_delta=" + cleanPresentDelta.ToString()
    +" damage_delta=" + PerformanceDelta(finalDamage, beforeDamage).ToString()
    +" damage_area_delta=" + PerformanceDelta(finalDamageArea, beforeDamageArea).ToString()
    +" damage_x=" + finalScene.DamageX.ToString()
    +" damage_y=" + finalScene.DamageY.ToString()
    +" damage_width=" + finalScene.DamageWidth.ToString()
    +" damage_height=" + finalScene.DamageHeight.ToString()
    +" primitive_planned_transfer_B=" + finalPrimitive.TotalPlannedTransferBytes.ToString()
    +" primitive_skipped_transfer_B=" + finalPrimitive.TotalSkippedTransferBytes.ToString()
    +" primitive_dirty=" + finalPrimitive.TotalDirtyRecordCount.ToString()
    +" primitive_ranges=" + finalPrimitive.TotalUploadRangeCount.ToString()
    +" primitive_full_uploads=" + finalPrimitive.TotalFullUploads.ToString()
    +" primitive_cpu_write_operations=" + finalPrimitive.TotalCpuWriteOperations.ToString()
    +" primitive_native_flush_calls=" + finalPrimitive.TotalNativeFlushCalls.ToString()
    +" primitive_retained_reuse=" + finalPrimitive.TotalRetainedReuse.ToString()
    +" text_written_B=" + finalText.TotalWrittenBytes.ToString()
    +" text_skipped_B=" + finalText.TotalSkippedBytes.ToString()
    +" text_dirty=" + finalText.TotalDirtySegmentCount.ToString()
    +" text_ranges=" + finalText.TotalUploadRangeCount.ToString()
    +" text_full_uploads=" + finalText.TotalFullUploads.ToString()
    +" text_mapped_writes=" + finalText.TotalMappedWrites.ToString()
    +" text_flushes=" + finalText.TotalFlushes.ToString()
    +" text_retained_reuse=" + finalText.TotalRetainedReuse.ToString()
    +" gpu_supported=" + (timestampSupported ? "1" : "0")
    +" gpu_samples=" + gpu.Count.ToString()
    +" gpu_main_p50_ns=" + gpu.P50.ToString()
    +" gpu_main_p95_ns=" + gpu.P95.ToString()
    +" gpu_main_p99_ns=" + gpu.P99.ToString()
    +" gpu_main_p999_ns=" + gpu.P999.ToString()
    +" gpu_main_worst_ns=" + gpu.Worst.ToString()
    +" power_proxy=external"
    +" focus_rotations=" + focusRotations.ToString()
    +" focus_loss_submits=" + focusLossSubmitCount.ToString()
    +" fairness0=" + fairness0.ToString()
    +" fairness1=" + fairness1.ToString()
    +" fairness2=" + fairness2.ToString()
    +" window0_submit_delta=" + window0SubmitDelta.ToString()
    +" window1_submit_delta=" + window1SubmitDelta.ToString()
    +" window2_submit_delta=" + window2SubmitDelta.ToString()
    +" window0_present_delta=" + window0PresentDelta.ToString()
    +" window1_present_delta=" + window1PresentDelta.ToString()
    +" window2_present_delta=" + window2PresentDelta.ToString()
    +" pointer_count=" + (window0Pointer + window1Pointer + window2Pointer).ToString()
    +" key_count=" + (window0Key + window1Key + window2Key).ToString()
    +" text_count=" + (window0Text + window1Text + window2Text).ToString()
    +" callback_count=" + (window0Callback + window1Callback + window2Callback).ToString()
    +" window0_pointer=" + window0Pointer.ToString()
    +" window1_pointer=" + window1Pointer.ToString()
    +" window2_pointer=" + window2Pointer.ToString()
    +" window0_key=" + window0Key.ToString()
    +" window1_key=" + window1Key.ToString()
    +" window2_key=" + window2Key.ToString()
    +" window0_text=" + window0Text.ToString()
    +" window1_text=" + window1Text.ToString()
    +" window2_text=" + window2Text.ToString()
    +" window0_callback_order=" + window0Callback.ToString()
    +" window1_callback_order=" + window1Callback.ToString()
    +" window2_callback_order=" + window2Callback.ToString()
    +" window0_pointer_order=" + firstRoot.PointerOrder.ToString()
    +" window1_pointer_order=" + secondRoot.PointerOrder.ToString()
    +" window2_pointer_order=" + thirdRoot.PointerOrder.ToString()
    +" window0_key_order=" + firstRoot.KeyOrder.ToString()
    +" window1_key_order=" + secondRoot.KeyOrder.ToString()
    +" window2_key_order=" + thirdRoot.KeyOrder.ToString()
    +" window0_text_order=" + firstRoot.TextOrder.ToString()
    +" window1_text_order=" + secondRoot.TextOrder.ToString()
    +" window2_text_order=" + thirdRoot.TextOrder.ToString()
    +" slot0=" + ((firstSlot0 && secondSlot0 && thirdSlot0) ? "1" : "0")
    +" slot1=" + ((firstSlot1 && secondSlot1 && thirdSlot1) ? "1" : "0")
    +" both_slots=" + ((firstSlot0 && firstSlot1 && secondSlot0
        && secondSlot1 && thirdSlot0 && thirdSlot1) ? "1" : "0")
    +" text_both_slots=" + ((firstTextSlot0 && firstTextSlot1 && secondTextSlot0
        && secondTextSlot1 && thirdTextSlot0 && thirdTextSlot1) ? "1" : "0")
    +" first_close=" + (firstCloseVerified ? "1" : "0")
    +" remaining_liveness=" + (remainingLivenessVerified ? "1" : "0")
    +" resource_zero=" + (finalZeroResources ? "1" : "0")
    +" window0_liveness=" + (window0LivenessVerified ? "1" : "0")
    +" window1_liveness=" + (window1LivenessVerified ? "1" : "0")
    +" window2_liveness=" + (window2LivenessVerified ? "1" : "0")
    +" window0_close=" + (window0CloseVerified ? "1" : "0")
    +" window1_close=" + (window1CloseVerified ? "1" : "0")
    +" window2_close=" + (window2CloseVerified ? "1" : "0")
    +" close=" + (finalCloseVerified ? "1" : "0"))
}
