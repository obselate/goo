package GooAsyncReadbackSmoke

import Goo
import System
import System.Diagnostics

func PerformanceLatencyWriteStats(prefix string, values []int64, count int32) {
  Console.WriteLine(prefix + ":"
    +" count=" + count.ToString()
    +" p50_ns=" + PerformancePercentileCount(values, count, 0.50).ToString()
    +" p95_ns=" + PerformancePercentileCount(values, count, 0.95).ToString()
    +" p99_ns=" + PerformancePercentileCount(values, count, 0.99).ToString()
    +" worst_ns=" + PerformanceMaxCount(values, count).ToString())
}

func RunPerformanceLatencyBenchmark(managedEntryTimestamp int64) {
  const WarmupFrames int32 = 300
  const InputSamples int32 = 2000
  let sampleCapacity = InputSamples + 1
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  Require(managedEntryTimestamp > 0L,
    "Retained performance latency managed-entry timestamp is invalid")

  let sampleSeen = [sampleCapacity]bool
  let sampleTokens = [sampleCapacity]uint64
  let sampleKinds = [sampleCapacity]int32
  let sampleStarts = [sampleCapacity]int64
  let sampleHandoffs = [sampleCapacity]int64
  let sampleCompletions = [sampleCapacity]int64
  let samplePresentIds = [sampleCapacity]uint64
  let sampleFenceObserved = [sampleCapacity]bool
  let inputExpectedKinds = [InputSamples]int32
  let inputExpectedStarts = [InputSamples]int64
  let inputHandoffNs = [InputSamples]int64
  let inputCompletionNs = [InputSamples]int64
  let pointerHandoffNs = [InputSamples]int64
  let pointerCompletionNs = [InputSamples]int64
  let keyHandoffNs = [InputSamples]int64
  let keyCompletionNs = [InputSamples]int64
  let textHandoffNs = [InputSamples]int64
  let textCompletionNs = [InputSamples]int64
  var callbackCount int32 = 0
  var totalCallbackCount int32 = 0
  var duplicateTokenCount int32 = 0
  var overwrittenTokenCount int32 = 0
  var missingTokenCount int32 = 0
  var outOfOrderTokenCount int32 = 0
  var invalidTokenCount int32 = 0
  var invalidTimestampCount int32 = 0
  var invalidPresentIdCount int32 = 0
  var wrongKindCount int32 = 0
  var wrongFenceCount int32 = 0
  var lastObservedToken uint64 = 0uL
  var pointerSampleCount int32 = 0
  var keySampleCount int32 = 0
  var textSampleCount int32 = 0
  var presentFenceSupported = false
  var startupWindowOpenTicks int64 = 0L
  var startupSubmitDelta uint64 = 0uL
  var startupPresentDelta uint64 = 0uL
  var warmSubmitDelta uint64 = 0uL
  var warmPresentDelta uint64 = 0uL
  var inputSubmitDelta uint64 = 0uL
  var inputPresentDelta uint64 = 0uL
  var settleFrameCount int32 = 0
  var closeVerified = false
  var window Window? = nil

  sampleStarts[0] = managedEntryTimestamp
  let sink = func(sample VulkanPresentationLatencyTestSample) {
    totalCallbackCount = totalCallbackCount + 1
    if sample.Token == 0uL || sample.Token > uint64(sampleCapacity) {
      invalidTokenCount = invalidTokenCount + 1
      return
    }
    let tokenIndex = int32(sample.Token - 1uL)
    if sampleSeen[tokenIndex] {
      duplicateTokenCount = duplicateTokenCount + 1
      overwrittenTokenCount = overwrittenTokenCount + 1
      return
    }
    sampleSeen[tokenIndex] = true
    sampleTokens[tokenIndex] = sample.Token
    sampleKinds[tokenIndex] = sample.Kind
    sampleStarts[tokenIndex] = sample.StartTimestamp
    sampleHandoffs[tokenIndex] = sample.HandoffTimestamp
    sampleCompletions[tokenIndex] = sample.CompletionObservedTimestamp
    samplePresentIds[tokenIndex] = sample.PresentId
    sampleFenceObserved[tokenIndex] = sample.PresentFenceObserved
    callbackCount = callbackCount + 1
    if lastObservedToken != 0uL && sample.Token < lastObservedToken {
      outOfOrderTokenCount = outOfOrderTokenCount + 1
    }
    if sample.Token > lastObservedToken {
      lastObservedToken = sample.Token
    }
    if tokenIndex > 0
      && sample.StartTimestamp != inputExpectedStarts[tokenIndex - 1]{
        invalidTimestampCount = invalidTimestampCount + 1
      }
    if tokenIndex == 0 {
      if sample.Kind != 0
        || sample.StartTimestamp != managedEntryTimestamp{
          wrongKindCount = wrongKindCount + 1
        }
    } else {
      let inputIndex = tokenIndex - 1
      if sample.Kind != inputExpectedKinds[inputIndex] {
        wrongKindCount = wrongKindCount + 1
      }
    }
    if sample.PresentFenceObserved != presentFenceSupported {
      wrongFenceCount = wrongFenceCount + 1
    }
    if sample.HandoffTimestamp < sample.StartTimestamp
      || sample.CompletionObservedTimestamp < sample.HandoffTimestamp
      || sample.CompletionObservedTimestamp == 0L {
        invalidTimestampCount = invalidTimestampCount + 1
      }
    let handoffTicks = sample.HandoffTimestamp - sample.StartTimestamp
    let completionTicks = sample.CompletionObservedTimestamp - sample.StartTimestamp
    if tokenIndex > 0 {
      let inputIndex = tokenIndex - 1
      let handoffNs = TicksToNanoseconds(handoffTicks)
      let completionNs = TicksToNanoseconds(completionTicks)
      inputHandoffNs[inputIndex] = handoffNs
      inputCompletionNs[inputIndex] = completionNs
      if sample.Kind == 1 {
        pointerHandoffNs[pointerSampleCount] = handoffNs
        pointerCompletionNs[pointerSampleCount] = completionNs
        pointerSampleCount = pointerSampleCount + 1
      } else if sample.Kind == 2 {
        keyHandoffNs[keySampleCount] = handoffNs
        keyCompletionNs[keySampleCount] = completionNs
        keySampleCount = keySampleCount + 1
      } else if sample.Kind == 3 {
        textHandoffNs[textSampleCount] = handoffNs
        textCompletionNs[textSampleCount] = completionNs
        textSampleCount = textSampleCount + 1
      }
    }
  }

  try {
    let root = PerformanceThreeWindowRoot(
      PerformanceThreeWindowRoot.ManifestSeed, 0,
      PerformanceThreeWindowRoot.PrimaryWidth, PerformanceThreeWindowRoot.PrimaryHeight)
    root.EnableLatencyMutations()
    let opened = Window{
      Title: "Goo Retained performance latency",
      Width: PerformanceThreeWindowRoot.PrimaryWidth,
      Height: PerformanceThreeWindowRoot.PrimaryHeight,
      VSync: false,
      Root: root,
    }
    window = opened
    startupWindowOpenTicks = Stopwatch.GetTimestamp()
    opened.Open()
    presentFenceSupported = WindowReadbackTestFixture.PresentFenceSupported(opened)
    WindowReadbackTestFixture.SetPresentationLatencySink(opened, sink)
    WindowReadbackTestFixture.BeginPresentationLatency(opened, 1uL, 0,
      managedEntryTimestamp)
    let startupBefore = WindowReadbackTestFixture.DiagnosticCounters(opened)
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    let startupAfter = WindowReadbackTestFixture.DiagnosticCounters(opened)
    startupSubmitDelta = PerformanceDelta(startupAfter.submitCount, startupBefore.submitCount)
    startupPresentDelta = PerformanceDelta(startupAfter.presentCount, startupBefore.presentCount)
    Require(startupSubmitDelta == 1uL && startupPresentDelta == 1uL,
      "Retained performance latency startup did not submit and present exactly once")

    let startupMetrics = WindowReadbackTestFixture.Metrics(opened)
    Require(startupMetrics.LogicalWidth > 0
        && startupMetrics.LogicalHeight > 0
        && startupMetrics.FramebufferWidth > 0
        && startupMetrics.FramebufferHeight > 0,
      "Retained performance latency startup metrics were not positive")
    Require(WindowReadbackTestFixture.CellMounted(root) && root.Invariant(),
      "Retained performance latency startup root is not mounted or invariant")

    var startupSettleIndex int32 = 0
    while !sampleSeen[0] && startupSettleIndex < 16 {
      WindowReadbackTestFixture.ForceRender(opened, 0.0)
      startupSettleIndex = startupSettleIndex + 1
    }
    Require(sampleSeen[0],
      "Retained performance latency startup present-fence completion was not observed")
    let startupReadback = PrimitiveReadback(opened, startupMetrics)
    PrimitiveRequirePixelDifferent(startupReadback.Pixels, startupReadback.Width,
      startupMetrics, 120.0, 144.0, uint8(8), uint8(13), uint8(22), 8,
      "latency_startup_control")

    Require(root.Control.Focus(),
      "Retained performance latency control did not accept focus")
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    let warmBefore = WindowReadbackTestFixture.DiagnosticCounters(opened)
    var warmIndex int32 = 0
    while warmIndex < WarmupFrames {
      WindowReadbackTestFixture.ForceRender(opened, 0.0)
      warmIndex = warmIndex + 1
    }
    let warmAfter = WindowReadbackTestFixture.DiagnosticCounters(opened)
    warmSubmitDelta = PerformanceDelta(warmAfter.submitCount, warmBefore.submitCount)
    warmPresentDelta = PerformanceDelta(warmAfter.presentCount, warmBefore.presentCount)
    Require(warmSubmitDelta == uint64(WarmupFrames)
        && warmPresentDelta == uint64(WarmupFrames),
      "Retained performance latency warmup submit or present delta was not exact")

    let controlBounds = root.Control.BorderBox
    let pointerX = controlBounds.X + controlBounds.Width * 0.5
    let pointerY = controlBounds.Y + controlBounds.Height * 0.5
    let inputBefore = WindowReadbackTestFixture.DiagnosticCounters(opened)
    var sampleIndex int32 = 0
    while sampleIndex < InputSamples {
      let kind = sampleIndex % 3 + 1
      if kind == 2 || kind == 3 {
        Require(root.FocusEntry(),
          "Retained performance latency entry did not accept focus")
      }
      let start = Stopwatch.GetTimestamp()
      let token = uint64(sampleIndex) + 2uL
      inputExpectedKinds[sampleIndex] = kind
      inputExpectedStarts[sampleIndex] = start
      WindowReadbackTestFixture.BeginPresentationLatency(opened, token, kind, start)
      let countersBefore = WindowReadbackTestFixture.DiagnosticCounters(opened)
      let pointerBefore = root.PointerCount
      let keyBefore = root.KeyCount
      let textBefore = root.TextCount
      let generationBefore = root.Generation
      let callbackBefore = root.CallbackOrder
      if kind == 1 {
        WindowReadbackTestFixture.InputQueuePointerPress(opened, pointerX, pointerY)
        WindowReadbackTestFixture.InputQueuePointerRelease(opened, pointerX, pointerY)
      } else if kind == 2 {
        WindowReadbackTestFixture.InputQueueKeyPress(opened, Key.A)
        WindowReadbackTestFixture.InputQueueKeyRelease(opened, Key.A)
      } else {
        WindowReadbackTestFixture.QueueText(opened, "x")
      }
      WindowReadbackTestFixture.ForceRender(opened, 0.0)
      let countersAfter = WindowReadbackTestFixture.DiagnosticCounters(opened)
      let submitDelta = PerformanceDelta(countersAfter.submitCount, countersBefore.submitCount)
      let presentDelta = PerformanceDelta(countersAfter.presentCount, countersBefore.presentCount)
      Require(submitDelta == 1uL && presentDelta == 1uL,
        "Retained performance latency input frame did not submit and present exactly once")
      inputSubmitDelta = inputSubmitDelta + submitDelta
      inputPresentDelta = inputPresentDelta + presentDelta
      if kind == 1 {
        Require(root.PointerCount == pointerBefore + 1
            && root.KeyCount == keyBefore
            && root.TextCount == textBefore
            && root.CallbackOrder == callbackBefore + 1,
          "Retained performance latency pointer input callback was not isolated")
      } else if kind == 2 {
        Require(root.PointerCount == pointerBefore
            && root.KeyCount == keyBefore + 1
            && root.TextCount == textBefore
            && root.CallbackOrder == callbackBefore + 1,
          "Retained performance latency key input callback was not isolated: pointer="
          +root.PointerCount.ToString() + "/" + pointerBefore.ToString()
          +" key=" + root.KeyCount.ToString() + "/" + keyBefore.ToString()
          +" text=" + root.TextCount.ToString() + "/" + textBefore.ToString()
          +" order=" + root.CallbackOrder.ToString() + "/" + callbackBefore.ToString()
          +" generation=" + root.Generation.ToString() + "/" + generationBefore.ToString())
      } else {
        Require(root.PointerCount == pointerBefore
            && root.KeyCount == keyBefore
            && root.TextCount == textBefore + 1
            && root.CallbackOrder == callbackBefore + 1,
          "Retained performance latency text input callback was not isolated")
      }
      Require(root.Generation == generationBefore + 1,
        "Retained performance latency input did not cause the rendered mutation")
      sampleIndex = sampleIndex + 1
    }
    let inputAfter = WindowReadbackTestFixture.DiagnosticCounters(opened)
    Require(PerformanceDelta(inputAfter.submitCount, inputBefore.submitCount)
      == uint64(InputSamples)
        && PerformanceDelta(inputAfter.presentCount, inputBefore.presentCount)
      == uint64(InputSamples),
      "Retained performance latency aggregate input submit or present delta was not exact")
    Require(inputSubmitDelta == uint64(InputSamples)
        && inputPresentDelta == uint64(InputSamples),
      "Retained performance latency measured input delta was not exact")

    while callbackCount < sampleCapacity && settleFrameCount < 16 {
      WindowReadbackTestFixture.ForceRender(opened, 0.0)
      settleFrameCount = settleFrameCount + 1
    }
    var priorPresentId uint64 = 0uL
    var priorHandoffTimestamp int64 = 0L
    var tokenIndex int32 = 0
    while tokenIndex < sampleCapacity {
      if !sampleSeen[tokenIndex] {
        missingTokenCount = missingTokenCount + 1
      } else {
        let expectedKind = if tokenIndex == 0 {
          0
        } else {
          inputExpectedKinds[tokenIndex - 1]
        }
        let expectedStart = if tokenIndex == 0 {
          managedEntryTimestamp
        } else {
          inputExpectedStarts[tokenIndex - 1]
        }
        Require(sampleTokens[tokenIndex] == uint64(tokenIndex) + 1uL
            && sampleKinds[tokenIndex] == expectedKind
            && sampleStarts[tokenIndex] == expectedStart
            && samplePresentIds[tokenIndex] > 0uL
            && sampleFenceObserved[tokenIndex] == presentFenceSupported,
          "Retained performance latency sample storage was overwritten")
        if samplePresentIds[tokenIndex] <= priorPresentId
          || sampleHandoffs[tokenIndex] < priorHandoffTimestamp{
            invalidPresentIdCount = invalidPresentIdCount + 1
          }
        priorPresentId = samplePresentIds[tokenIndex]
        priorHandoffTimestamp = sampleHandoffs[tokenIndex]
      }
      tokenIndex = tokenIndex + 1
    }
    Require(totalCallbackCount == sampleCapacity
        && callbackCount == sampleCapacity
        && missingTokenCount == 0
        && duplicateTokenCount == 0
        && overwrittenTokenCount == 0
        && invalidTokenCount == 0
        && invalidTimestampCount == 0
        && invalidPresentIdCount == 0
        && wrongKindCount == 0
        && wrongFenceCount == 0,
      "Retained performance latency token samples were incomplete, duplicated, or invalid")
    Require(pointerSampleCount == ((InputSamples + 2) / 3)
        && keySampleCount == ((InputSamples + 1) / 3)
        && textSampleCount == (InputSamples / 3),
      "Retained performance latency per-kind sample counts were incorrect")
    Require(root.PointerCount == pointerSampleCount
        && root.KeyCount == keySampleCount
        && root.TextCount == textSampleCount,
      "Retained performance latency callback counts did not match input samples")
    Require(PerformanceDelta(inputAfter.submitCount, inputBefore.submitCount)
      == uint64(InputSamples)
        && PerformanceDelta(inputAfter.presentCount, inputBefore.presentCount)
      == uint64(InputSamples),
      "Retained performance latency input submit or present totals changed after settlement")
    Require(root.Invariant(), "Retained performance latency root invariant failed after samples")

    WindowReadbackTestFixture.SetPresentationLatencySink(opened, nil)
    opened.RequestClose()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    closeVerified = !opened.IsOpen
    Require(closeVerified, "Retained performance latency window did not close")
    Require(WindowReadbackTestFixture.ResidentResourceBytes(opened) == 0uL,
      "Retained performance latency readback resources remain resident after close")
  } finally {
    if let active = window {
      WindowReadbackTestFixture.SetPresentationLatencySink(active, nil)
      if active.IsOpen {
        active.RequestClose()
        WindowReadbackTestFixture.ForceRender(active, 0.0)
      }
    }
  }

  let startupHandoffNs = TicksToNanoseconds(sampleHandoffs[0] - managedEntryTimestamp)
  let startupWindowHandoffNs = TicksToNanoseconds(sampleHandoffs[0] - startupWindowOpenTicks)
  let startupCompletionNs = TicksToNanoseconds(sampleCompletions[0] - managedEntryTimestamp)
  let startupWindowCompletionNs = TicksToNanoseconds(sampleCompletions[0] - startupWindowOpenTicks)
  let inputHandoffP50 = PerformancePercentileCount(inputHandoffNs, InputSamples, 0.50)
  let inputHandoffP95 = PerformancePercentileCount(inputHandoffNs, InputSamples, 0.95)
  let inputHandoffP99 = PerformancePercentileCount(inputHandoffNs, InputSamples, 0.99)
  let inputHandoffWorst = PerformanceMaxCount(inputHandoffNs, InputSamples)
  let handoffGateNs = 37333334L
  Require(inputHandoffP95 <= handoffGateNs,
    "Retained performance latency input handoff P95 exceeded two 60 Hz intervals plus 4 ms")

  Console.WriteLine("input-latency-smoke:"
    +" present_fence_support=" + presentFenceSupported.ToString()
    +" startup_sample_count=1"
    +" input_sample_count=" + InputSamples.ToString()
    +" callbacks_total=" + totalCallbackCount.ToString()
    +" callbacks_unique=" + callbackCount.ToString()
    +" duplicate_tokens=" + duplicateTokenCount.ToString()
    +" overwritten_tokens=" + overwrittenTokenCount.ToString()
    +" missing_tokens=" + missingTokenCount.ToString()
    +" completion_callbacks_out_of_order=" + outOfOrderTokenCount.ToString()
    +" invalid_tokens=" + invalidTokenCount.ToString()
    +" settle_frames=" + settleFrameCount.ToString()
    +" startup_submit_delta=" + startupSubmitDelta.ToString()
    +" startup_present_delta=" + startupPresentDelta.ToString()
    +" warm_submit_delta=" + warmSubmitDelta.ToString()
    +" warm_present_delta=" + warmPresentDelta.ToString()
    +" input_submit_delta=" + inputSubmitDelta.ToString()
    +" input_present_delta=" + inputPresentDelta.ToString()
    +" close=" + closeVerified.ToString())
  Console.WriteLine("performance-latency-startup:"
    +" managed_entry_to_present_handoff_ns=" + startupHandoffNs.ToString()
    +" window_open_to_present_handoff_ns=" + startupWindowHandoffNs.ToString())
  if presentFenceSupported {
    Console.WriteLine("performance-latency-startup-completion:"
      +" managed_entry_to_present_completion_observed_upper_ns=" + startupCompletionNs.ToString()
      +" window_open_to_present_completion_observed_upper_ns=" + startupWindowCompletionNs.ToString())
  }
  Console.WriteLine("performance-latency-input:"
    +" input_injection_to_present_handoff_p50_ns=" + inputHandoffP50.ToString()
    +" input_injection_to_present_handoff_p95_ns=" + inputHandoffP95.ToString()
    +" input_injection_to_present_handoff_p99_ns=" + inputHandoffP99.ToString()
    +" input_injection_to_present_handoff_worst_ns=" + inputHandoffWorst.ToString()
    +" input_handoff_p95_gate_ns=" + handoffGateNs.ToString()
    +" input_handoff_p95_gate=true")
  if presentFenceSupported {
    Console.WriteLine("performance-latency-input-completion:"
      +" input_injection_to_present_completion_observed_upper_p50_ns="
      +PerformancePercentileCount(inputCompletionNs, InputSamples, 0.50).ToString()
      +" input_injection_to_present_completion_observed_upper_p95_ns="
      +PerformancePercentileCount(inputCompletionNs, InputSamples, 0.95).ToString()
      +" input_injection_to_present_completion_observed_upper_p99_ns="
      +PerformancePercentileCount(inputCompletionNs, InputSamples, 0.99).ToString()
      +" input_injection_to_present_completion_observed_upper_worst_ns="
      +PerformanceMaxCount(inputCompletionNs, InputSamples).ToString())
  }
  PerformanceLatencyWriteStats("input_injection_to_present_handoff_kind1", pointerHandoffNs,
    pointerSampleCount)
  PerformanceLatencyWriteStats("input_injection_to_present_handoff_kind2", keyHandoffNs,
    keySampleCount)
  PerformanceLatencyWriteStats("input_injection_to_present_handoff_kind3", textHandoffNs,
    textSampleCount)
  if presentFenceSupported {
    PerformanceLatencyWriteStats("input_injection_to_present_completion_observed_upper_kind1",
      pointerCompletionNs, pointerSampleCount)
    PerformanceLatencyWriteStats("input_injection_to_present_completion_observed_upper_kind2",
      keyCompletionNs, keySampleCount)
    PerformanceLatencyWriteStats("input_injection_to_present_completion_observed_upper_kind3",
      textCompletionNs, textSampleCount)
  }
  Console.WriteLine("performance-latency-callbacks:"
    +" pointer_callback_count=" + pointerSampleCount.ToString()
    +" key_callback_count=" + keySampleCount.ToString()
    +" text_callback_count=" + textSampleCount.ToString()
    +" pointer_sample_count=" + pointerSampleCount.ToString()
    +" key_sample_count=" + keySampleCount.ToString()
    +" text_sample_count=" + textSampleCount.ToString())
}
