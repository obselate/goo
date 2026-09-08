package GooGallery

import System
import System.Diagnostics
import System.Threading
import Goo

class GalleryCategoryFrameTimesAccessibility : AccessibilityAdapter {
  private var tree AccessibilityTree?
  private let ready ManualResetEventSlim

  init(signal ManualResetEventSlim) {
    ready = signal
  }

  public func Update(next AccessibilityTree) {
    tree = next
    if FindExact("All Categories") != nil
      && FindExact("Forms & Inputs") != nil
      && FindExact("Selection") != nil
      && FindExact("Buttons") != nil
      && FindExact("Display & Feedback") != nil
      && MatchesComponentCategory(0){
        ready.Set()
      }
  }

  internal func FindExact(name string) AccessibilityNode? {
    guard let current = tree else { return nil }
    guard let root = current.Root else { return nil }
    return findExact(root, name)
  }

  internal func Contains(name string) bool {
    guard let current = tree else { return false }
    guard let root = current.Root else { return false }
    return contains(root, name)
  }

  internal func MatchesComponentCategory(category int32) bool {
    let forms = Contains("Text Inputs & Steppers")
    let selection = Contains("Switches, checks & radios")
    let buttons = Contains("Buttons, actions & identity")
    let display = Contains("Range, progress & feedback")
    if category == 0 {
      return forms && selection && buttons && display
    }
    if category == 1 {
      return forms && !selection && !buttons && !display
    }
    if category == 2 {
      return !forms && selection && !buttons && !display
    }
    if category == 3 {
      return !forms && !selection && buttons && !display
    }
    return !forms && !selection && !buttons && display
  }

  internal func ComponentMatrix() string ->
  "forms=" + Contains("Text Inputs & Steppers").ToString()
  +",selection=" + Contains("Switches, checks & radios").ToString()
  +",buttons=" + Contains("Buttons, actions & identity").ToString()
  +",display=" + Contains("Range, progress & feedback").ToString()

  private func findExact(node AccessibilityNode, name string) AccessibilityNode? {
    if String.Equals(node.Name, name, StringComparison.OrdinalIgnoreCase) {
      return node
    }
    for child in node.Children {
      if let found = findExact(child, name) {
        return found
      }
    }
    return nil
  }

  private func contains(node AccessibilityNode, name string) bool {
    if node.Name.IndexOf(name, StringComparison.OrdinalIgnoreCase) >= 0
      || node.Value.IndexOf(name, StringComparison.OrdinalIgnoreCase) >= 0{
      return true
    }
    for child in node.Children {
      if contains(child, name) {
        return true
      }
    }
    return false
  }
}

func CategoryFrameTimesRequire(condition bool, message string) {
  if !condition {
    throw InvalidOperationException(message)
  }
}

func CategoryFrameTimesTicksToNanoseconds(ticks int64) int64 ->
int64(float64(ticks) * 1000000000.0 / float64(Stopwatch.Frequency))

func CategoryFrameTimesPercentile(values []int64, percentile float64) int64 {
  let sorted = [values.Length]int64
  Array.Copy(values, sorted, values.Length)
  Array.Sort(sorted)
  let raw = int32(Math.Ceiling(float64(sorted.Length) * percentile)) - 1
  let index = if raw < 0 { 0 } else if raw >= sorted.Length { sorted.Length - 1 } else { raw }
  return sorted[index]
}

func CategoryFrameTimesWriteStats(prefix string, values []int64) {
  Console.WriteLine(prefix
    +" count=" + values.Length.ToString()
    +" p50_ns=" + CategoryFrameTimesPercentile(values, 0.50).ToString()
    +" p95_ns=" + CategoryFrameTimesPercentile(values, 0.95).ToString()
    +" p99_ns=" + CategoryFrameTimesPercentile(values, 0.99).ToString()
    +" worst_ns=" + CategoryFrameTimesPercentile(values, 1.0).ToString())
}

func CategoryFrameTimesDelta(after uint64, before uint64) uint64 ->
after >= before ? after - before : uint64.MaxValue

func RunGalleryCategoryFrameTimes() {
  const CategoryCount int32 = 5
  const FirstCycleSamples int32 = 5
  const RepeatedCycles int32 = 20
  const RepeatedSamples int32 = CategoryCount * RepeatedCycles
  const TotalSamples int32 = FirstCycleSamples + RepeatedSamples
  const ReadyTimeoutMs int32 = 15000
  const SampleTimeoutMs int32 = 15000
  const TotalTimeoutSeconds int64 = 240L
  const IdleSettleMs int32 = 500
  const IdleMeasureMs int32 = 500

  CategoryFrameTimesRequire(
    Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")

  let labels = []string{
    "All Categories", "Forms & Inputs", "Selection", "Buttons", "Display & Feedback",
  }
  let categoryBounds = [CategoryCount]ElementRect
  let expectedDestinations = [TotalSamples]int32
  let starts = [TotalSamples]int64
  let handoffs = [TotalSamples]int64
  let completions = [TotalSamples]int64
  let presentIds = [TotalSamples]uint64
  let fenceObserved = [TotalSamples]bool
  let contentVerified = [TotalSamples]bool
  let repeatedHandoffs = [RepeatedSamples]int64
  let repeatedCompletions = [RepeatedSamples]int64
  let repeatedEdgeHandoffs = [RepeatedSamples]int64
  let repeatedEdgeCompletions = [RepeatedSamples]int64
  let firstCycleHandoffs = [FirstCycleSamples]int64
  let firstCycleCompletions = [FirstCycleSamples]int64

  using let accessibilityReady = ManualResetEventSlim(false)
  using let boundsCaptured = ManualResetEventSlim(false)
  using let sampleDone = ManualResetEventSlim(false)
  using let diagnosticsCaptured = ManualResetEventSlim(false)
  let accessibility = GalleryCategoryFrameTimesAccessibility(accessibilityReady)
  let root = GalleryCell{}
  let window = Window{
    Title: "Goo Gallery category frame times",
    Width: 1440,
    Height: 900,
    Decorated: false,
    Transparent: true,
    Resizable: false,
    VSync: true,
    Background: Color.Transparent,
    Root: root,
  }
  root.AttachWindow(window)
  window.AccessibilityAdapter = accessibility

  var callbackCount int32 = 0
  var duplicateCount int32 = 0
  var invalidCount int32 = 0
  var uiError string? = nil
  var workerError string? = nil
  var boundsValid = false
  var idleBefore VulkanDiagnosticCounterSnapshot
  var idleAfter VulkanDiagnosticCounterSnapshot
  var finalCounters VulkanDiagnosticCounterSnapshot
  var cleanupTarget VulkanWindowTarget? = nil
  var worker Thread? = nil
  var presentFenceSupported = false

  let sink = (sample VulkanPresentationLatencyTestSample) -> {
    if sample.Token == 0uL || sample.Token > uint64(TotalSamples) {
      invalidCount = invalidCount + 1
      sampleDone.Set()
      return
    }
    let index = int32(sample.Token - 1uL)
    if presentIds[index] != 0uL {
      duplicateCount = duplicateCount + 1
      sampleDone.Set()
      return
    }
    handoffs[index] = sample.HandoffTimestamp
    completions[index] = sample.CompletionObservedTimestamp
    presentIds[index] = sample.PresentId
    fenceObserved[index] = sample.PresentFenceObserved
    let destination = expectedDestinations[index]
    contentVerified[index] = root.CurrentShowcase() == 5
      && accessibility.MatchesComponentCategory(destination)
    if sample.StartTimestamp != starts[index]
      || sample.HandoffTimestamp < sample.StartTimestamp
      || sample.CompletionObservedTimestamp < sample.HandoffTimestamp
      || sample.PresentId == 0uL{
        invalidCount = invalidCount + 1
      }
    callbackCount = callbackCount + 1
    sampleDone.Set()
  }

  try {
    window.Open()
    CategoryFrameTimesRequire(root.OpenShowcase(5),
      "Category benchmark could not open the UI Component Gallery")
    presentFenceSupported = WindowReadbackTestFixture.PresentFenceSupported(window)
    WindowReadbackTestFixture.SetPresentationLatencySink(window, sink)
    let windowId = GallerySdlWindowId()
    let runDeadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * TotalTimeoutSeconds
    let benchmarkWorker = Thread(func() {
      try {
        if !accessibilityReady.Wait(ReadyTimeoutMs) {
          throw TimeoutException("Category tabs were not accessible before the ready timeout")
        }
        window.Post(func() {
          try {
            var index int32 = 0
            boundsValid = true
            while index < CategoryCount {
              if let node = accessibility.FindExact(labels[index]) {
                categoryBounds[index] = node.Bounds
                boundsValid = boundsValid
                  && node.Bounds.Width > 0.0 && node.Bounds.Height > 0.0
              } else {
                boundsValid = false
              }
              index = index + 1
            }
          } catch (error Exception) {
            uiError = error.ToString()
          }
          boundsCaptured.Set()
        })
        if !boundsCaptured.Wait(ReadyTimeoutMs) || !boundsValid {
          throw InvalidOperationException("Category tab bounds were not captured from the stable accessibility tree")
        }
        if uiError != nil {
          throw InvalidOperationException(uiError!!)
        }

        var sampleIndex int32 = 0
        while sampleIndex < TotalSamples {
          if Stopwatch.GetTimestamp() >= runDeadline {
            throw TimeoutException("Category benchmark exceeded its total timeout")
          }
          let edge = sampleIndex % CategoryCount
          let source = edge
          let destination = (edge + 1) % CategoryCount
          let currentSample = sampleIndex
          let token = uint64(currentSample) + 1uL
          sampleDone.Reset()
          window.Post(func() {
            try {
              if root.CurrentShowcase() != 5
                || !accessibility.MatchesComponentCategory(source){
                throw InvalidOperationException("Component category source mismatch for "
                  +labels[source] + "->" + labels[destination]
                  +" showcase=" + root.CurrentShowcase().ToString()
                  +" matrix=" + accessibility.ComponentMatrix())
              }
              let injectionTimestamp = Stopwatch.GetTimestamp()
              starts[currentSample] = injectionTimestamp
              expectedDestinations[currentSample] = destination
              GalleryPushClick(windowId, categoryBounds[destination])
              window.Post(func() {
                try {
                  WindowReadbackTestFixture.BeginPresentationLatency(
                    window, token, destination + 1, injectionTimestamp)
                } catch (error Exception) {
                  uiError = error.ToString()
                  sampleDone.Set()
                }
              })
            } catch (error Exception) {
              uiError = error.ToString()
              sampleDone.Set()
            }
          })
          if !sampleDone.Wait(SampleTimeoutMs) {
            throw TimeoutException("Timed out awaiting presentation completion for "
              +labels[source] + "->" + labels[destination])
          }
          if uiError != nil {
            throw InvalidOperationException(uiError!!)
          }
          if presentIds[currentSample] == 0uL || !contentVerified[currentSample] {
            throw InvalidOperationException("The marked presentation did not contain destination "
              +labels[destination] + " for " + labels[source] + "->" + labels[destination]
              +" showcase=" + root.CurrentShowcase().ToString()
              +" matrix=" + accessibility.ComponentMatrix())
          }
          let handoffNs = CategoryFrameTimesTicksToNanoseconds(
            handoffs[currentSample] - starts[currentSample])
          let completionNs = CategoryFrameTimesTicksToNanoseconds(
            completions[currentSample] - starts[currentSample])
          if currentSample < FirstCycleSamples {
            firstCycleHandoffs[currentSample] = handoffNs
            firstCycleCompletions[currentSample] = completionNs
          } else {
            let repeatedIndex = currentSample - FirstCycleSamples
            let cycle = repeatedIndex / CategoryCount
            repeatedHandoffs[repeatedIndex] = handoffNs
            repeatedCompletions[repeatedIndex] = completionNs
            repeatedEdgeHandoffs[edge * RepeatedCycles + cycle] = handoffNs
            repeatedEdgeCompletions[edge * RepeatedCycles + cycle] = completionNs
          }
          sampleIndex = sampleIndex + 1
        }

        Thread.Sleep(IdleSettleMs)
        diagnosticsCaptured.Reset()
        window.Post(func() {
          idleBefore = WindowReadbackTestFixture.DiagnosticCounters(window)
          diagnosticsCaptured.Set()
        })
        if !diagnosticsCaptured.Wait(ReadyTimeoutMs) {
          throw TimeoutException("Timed out capturing the pre-idle counters")
        }
        Thread.Sleep(IdleMeasureMs)
        diagnosticsCaptured.Reset()
        window.Post(func() {
          idleAfter = WindowReadbackTestFixture.DiagnosticCounters(window)
          finalCounters = idleAfter
          cleanupTarget = WindowReadbackTestFixture.CaptureTarget(window)
          WindowReadbackTestFixture.SetPresentationLatencySink(window, nil)
          diagnosticsCaptured.Set()
        })
        if !diagnosticsCaptured.Wait(ReadyTimeoutMs) {
          throw TimeoutException("Timed out capturing the post-idle counters")
        }
      } catch (error Exception) {
        workerError = error.ToString()
      }
      window.RequestClose()
    })
    worker = benchmarkWorker
    benchmarkWorker.IsBackground = true
    benchmarkWorker.Start()
    window.Run()
    CategoryFrameTimesRequire(benchmarkWorker.Join(30000),
      "Category benchmark worker did not exit after Window.Run")
  } finally {
    WindowReadbackTestFixture.SetPresentationLatencySink(window, nil)
    if window.IsOpen {
      window.RequestClose()
    }
    if let activeWorker = worker {
      if activeWorker.IsAlive {
        activeWorker.Join(30000)
      }
    }
  }

  CategoryFrameTimesRequire(workerError == nil,
    "Category benchmark worker failed: " + (workerError ?? "unknown"))
  CategoryFrameTimesRequire(!window.IsOpen, "Category benchmark window remained open")
  CategoryFrameTimesRequire(callbackCount == TotalSamples
      && duplicateCount == 0 && invalidCount == 0,
    "Category presentation samples were incomplete, duplicated, or invalid")
  CategoryFrameTimesRequire(root.CurrentShowcase() == 5
      && accessibility.MatchesComponentCategory(0),
    "Category benchmark did not return to the idle All Categories view")
  CategoryFrameTimesRequire(CategoryFrameTimesDelta(idleAfter.rebuildCount,
      idleBefore.rebuildCount) == 0uL
      && CategoryFrameTimesDelta(idleAfter.layoutCount, idleBefore.layoutCount) == 0uL
      && CategoryFrameTimesDelta(idleAfter.planCompileCount, idleBefore.planCompileCount) == 0uL
      && CategoryFrameTimesDelta(idleAfter.uploadCount, idleBefore.uploadCount) == 0uL
      && CategoryFrameTimesDelta(idleAfter.recordCount, idleBefore.recordCount) == 0uL
      && CategoryFrameTimesDelta(idleAfter.submitCount, idleBefore.submitCount) == 0uL
      && CategoryFrameTimesDelta(idleAfter.presentCount, idleBefore.presentCount) == 0uL,
    "Category benchmark did render work during the final idle interval")
  CategoryFrameTimesRequire(finalCounters.validationErrorCount == 0uL
      && finalCounters.resultFailureCount == 0uL
      && finalCounters.surfaceRecoveryCount == 0uL
      && finalCounters.deviceRecoveryCount == 0uL
      && finalCounters.pathAtlasPressureFailureCount == 0uL
      && finalCounters.clipMaskAtlasPressureFailureCount == 0uL
      && finalCounters.layerPoolPressureFailureCount == 0uL
      && finalCounters.layerPoolFailureCount == 0uL,
    "Category benchmark observed a validation, Vulkan result, recovery, or resource failure")
  let cleanupCounters = WindowReadbackTestFixture.TargetDiagnosticCounters(cleanupTarget)
  CategoryFrameTimesRequire(
    WindowReadbackTestFixture.TargetResidentResourceBytes(cleanupTarget) == 0uL
      && cleanupCounters.allocatorBytes == 0uL
      && cleanupCounters.vulkanDeviceMemoryBytes == 0uL
      && cleanupCounters.vulkanObjectCount == 0uL,
    "Category benchmark retained renderer resources after close")

  let runLabel = Environment.GetEnvironmentVariable("GOO_CATEGORY_FRAME_TIMES_LABEL")
    ?? "unlabeled"
  Console.WriteLine("category-frame-times: label=" + runLabel
    +" scheduler=Window.Run input=native_gallery_click"
    +" first_cycle_samples=" + FirstCycleSamples.ToString()
    +" repeated_cycles=" + RepeatedCycles.ToString()
    +" repeated_samples=" + RepeatedSamples.ToString()
    +" total_samples=" + TotalSamples.ToString()
    +" present_fence_support=" + presentFenceSupported.ToString()
    +" scanout_claim=none validation_failures=0 resource_failures=0 idle_close=1")
  CategoryFrameTimesWriteStats(
    "category-first-cycle-injection-to-presentation-handoff", firstCycleHandoffs)
  CategoryFrameTimesWriteStats("category-repeated-injection-to-presentation-handoff", repeatedHandoffs)
  var edge int32 = 0
  while edge < CategoryCount {
    let edgeValues = [RepeatedCycles]int64
    Array.Copy(repeatedEdgeHandoffs, edge * RepeatedCycles,
      edgeValues, 0, RepeatedCycles)
    CategoryFrameTimesWriteStats("category-edge-injection-to-presentation-handoff"
      +" source=" + labels[edge] + " destination=" + labels[(edge + 1) % CategoryCount],
      edgeValues)
    edge = edge + 1
  }
  if presentFenceSupported {
    CategoryFrameTimesWriteStats(
      "category-first-cycle-injection-to-presentation-completion-observed-upper-bound",
      firstCycleCompletions)
    CategoryFrameTimesWriteStats(
      "category-repeated-injection-to-presentation-completion-observed-upper-bound",
      repeatedCompletions)
    edge = 0
    while edge < CategoryCount {
      let edgeValues = [RepeatedCycles]int64
      Array.Copy(repeatedEdgeCompletions, edge * RepeatedCycles,
        edgeValues, 0, RepeatedCycles)
      CategoryFrameTimesWriteStats(
        "category-edge-injection-to-presentation-completion-observed-upper-bound"
        +" source=" + labels[edge] + " destination=" + labels[(edge + 1) % CategoryCount],
        edgeValues)
      edge = edge + 1
    }
  }
  var sampleIndex int32 = 0
  while sampleIndex < TotalSamples {
    let edgeIndex = sampleIndex % CategoryCount
    Console.WriteLine("category-sample"
      +" index=" + sampleIndex.ToString()
      +" phase=" +(if sampleIndex < FirstCycleSamples { "first-cycle" } else { "repeated" })
      +" source=" + labels[edgeIndex]
      +" destination=" + labels[(edgeIndex + 1) % CategoryCount]
      +" start_ticks=" + starts[sampleIndex].ToString()
      +" handoff_ticks=" + handoffs[sampleIndex].ToString()
      +" completion_observed_ticks=" + completions[sampleIndex].ToString()
      +" injection_to_handoff_ns="
      +CategoryFrameTimesTicksToNanoseconds(
        handoffs[sampleIndex] - starts[sampleIndex]).ToString()
      +" injection_to_completion_observed_ns="
      +CategoryFrameTimesTicksToNanoseconds(
        completions[sampleIndex] - starts[sampleIndex]).ToString()
      +" present_id=" + presentIds[sampleIndex].ToString()
      +" present_fence_observed=" + fenceObserved[sampleIndex].ToString()
      +" content_verified=" + contentVerified[sampleIndex].ToString())
    sampleIndex = sampleIndex + 1
  }
}
