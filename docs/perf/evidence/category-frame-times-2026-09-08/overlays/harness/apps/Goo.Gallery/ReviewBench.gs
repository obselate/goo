package GooGallery

import System
import System.Diagnostics
import System.IO
import System.Threading
import Goo

func ReviewRequire(condition bool, message string) {
  if !condition {
    throw InvalidOperationException(message)
  }
}

func ReviewDelta(after uint64, before uint64) uint64 ->
  after >= before ? after - before : 0uL

func ReviewMax(left uint64, right uint64) uint64 ->
  left > right ? left : right

func ReviewSignedDelta(after int64, before int64) int64 ->
  after >= before ? after - before : 0L

func ReviewSelectedState() int32 {
  let value = Environment.GetEnvironmentVariable("GOO_GALLERY_REVIEW_STATE")
  if value == nil || value!!.Length == 0 {
    return -1
  }
  if value!! == "opening" || value!! == "0" { return 0 }
  if value!! == "6" || value!! == "shader-3d-world" { return 1 }
  if value!! == "7" || value!! == "shader-radial-light" { return 2 }
  if value!! == "8" || value!! == "shader-dither" { return 3 }
  throw ArgumentOutOfRangeException("GOO_GALLERY_REVIEW_STATE")
}

func ReviewPace16Ms() bool ->
  Environment.GetEnvironmentVariable("GOO_GALLERY_REVIEW_PACE16MS") == "1"

func ReviewPrintGcConfiguration() {
  let values = GC.GetConfigurationVariables()
  for pair in values {
    Console.WriteLine("gallery-review-gc-config," + pair.Key.ToString()
      + "=" + pair.Value.ToString())
  }
}

class ReviewTimestampCapture {
  private let capacity int32
  private let frames []uint64
  private let nanoseconds []int64
  private let scopeCounts []int32
  private let droppedScopeCounts []int32
  private let counts []int32
  private var enabled bool
  private var overflow bool

  prop Overflow bool { get -> overflow }

  init(sampleCapacity int32) {
    capacity = sampleCapacity + 16
    frames = [capacity * 4]uint64
    nanoseconds = [capacity * 4]int64
    scopeCounts = [capacity * 4]int32
    droppedScopeCounts = [capacity * 4]int32
    counts = [4]int32
    enabled = false
    overflow = false
  }

  func Start() {
    var stage int32 = 0
    while stage < 4 {
      counts[stage] = 0
      stage = stage + 1
    }
    overflow = false
    enabled = true
  }

  func Stop() {
    enabled = false
  }

  func Accept(snapshot VulkanDiagnosticTimestampSnapshot) {
    if !enabled {
      return
    }
    let stage = int32(snapshot.stage)
    if stage < 0 || stage >= 4 {
      return
    }
    let count = counts[stage]
    if count >= capacity {
      overflow = true
      return
    }
    let index = stage * capacity + count
    frames[index] = snapshot.frame
    nanoseconds[index] = int64(snapshot.elapsedNanoseconds)
    scopeCounts[index] = snapshot.scopeCount
    droppedScopeCounts[index] = snapshot.droppedScopeCount
    counts[stage] = count + 1
  }

  func Resolve(stage int32, expected []uint64, output []int64,
    scopes []int32, dropped []int32, valid []bool, outputOffset int32) int32 {
    ReviewRequire(stage >= 0 && stage < 4, "Invalid timestamp stage")
    var outputCount int32 = 0
    var expectedIndex int32 = 0
    while expectedIndex < expected.Length {
      var matches int32 = 0
      var value int64 = 0L
      var scopeValue int32 = 0
      var droppedValue int32 = 0
      var captureIndex int32 = 0
      while captureIndex < counts[stage] {
        let index = stage * capacity + captureIndex
        if frames[index] == expected[expectedIndex] {
          matches = matches + 1
          value = nanoseconds[index]
          scopeValue = scopeCounts[index]
          droppedValue = droppedScopeCounts[index]
        }
        captureIndex = captureIndex + 1
      }
      ReviewRequire(matches <= 1, "Duplicate timestamp snapshot for a sampled frame")
      let outputIndex = outputOffset + expectedIndex
      output[outputIndex] = if matches == 1 { value } else { 0L }
      scopes[outputIndex] = if matches == 1 { scopeValue } else { 0 }
      dropped[outputIndex] = if matches == 1 { droppedValue } else { 0 }
      valid[outputIndex] = matches == 1 && value > 0L && scopeValue > 0 && droppedValue == 0
      if matches == 1 {
        outputCount = outputCount + 1
      }
      expectedIndex = expectedIndex + 1
    }
    return outputCount
  }
}

class ReviewStateSamples {
  internal let Name string
  internal let ShowcaseIndex int32
  internal let SampleCount int32
  internal let FrameIds []uint64
  internal let HostTicks []int64
  internal let ThreadAllocatedBytes []int64
  internal let DrawDeltas []uint64
  internal let PipelineDeltas []uint64
  internal let DescriptorDeltas []uint64
  internal let GpuNanoseconds []int64
  internal let GpuScopeCounts []int32
  internal let GpuDroppedScopeCounts []int32
  internal let GpuValid []bool
  internal let CpuStageTicks []int64
  internal let CpuStageBytes []int64
  internal let CpuStageCalls []int32
  internal let CpuProfileValid []bool
  internal var StartCounters VulkanDiagnosticCounterSnapshot
  internal var EndCounters VulkanDiagnosticCounterSnapshot
  internal var ProcessCpuTicks int64
  internal var TimestampSupported bool
  internal var UploadValidCount int32
  internal var MainValidCount int32
  internal var EffectsValidCount int32
  internal var OffscreenValidCount int32
  internal var PeakAllocatorBytes uint64
  internal var PeakDeviceBytes uint64
  internal var PeakCacheBytes uint64
  internal var PeakTextBytes uint64
  internal var PeakLayerBytes uint64
  internal var PeakImageBytes uint64
  internal var GcTotalMemoryStartBytes int64
  internal var GcTotalMemoryEndBytes int64
  internal var GcTotalMemoryAfterGcBytes int64
  internal var GcHeapSizeStartBytes int64
  internal var GcHeapSizeEndBytes int64
  internal var GcHeapSizeAfterGcBytes int64
  internal var GcCommittedStartBytes int64
  internal var GcCommittedEndBytes int64
  internal var GcCommittedAfterGcBytes int64
  internal var GcTotalAllocatedStartBytes int64
  internal var GcTotalAllocatedEndBytes int64
  internal var GcTotalAllocatedAfterGcBytes int64
  internal var CpuProfileValidCount int32
  internal var Ran bool

  init(stateName string, sampleCount int32, showcaseIndex int32 = -1) {
    Name = stateName
    ShowcaseIndex = showcaseIndex
    SampleCount = sampleCount
    FrameIds = [sampleCount]uint64
    HostTicks = [sampleCount]int64
    ThreadAllocatedBytes = [sampleCount]int64
    DrawDeltas = [sampleCount]uint64
    PipelineDeltas = [sampleCount]uint64
    DescriptorDeltas = [sampleCount]uint64
    GpuNanoseconds = [sampleCount * 4]int64
    GpuScopeCounts = [sampleCount * 4]int32
    GpuDroppedScopeCounts = [sampleCount * 4]int32
    GpuValid = [sampleCount * 4]bool
    let cpuStageCount = int32(FrameProfileStage.Count)
    CpuStageTicks = [sampleCount * cpuStageCount]int64
    CpuStageBytes = [sampleCount * cpuStageCount]int64
    CpuStageCalls = [sampleCount * cpuStageCount]int32
    CpuProfileValid = [sampleCount]bool
    ProcessCpuTicks = 0L
    TimestampSupported = false
    UploadValidCount = 0
    MainValidCount = 0
    EffectsValidCount = 0
    OffscreenValidCount = 0
    PeakAllocatorBytes = 0uL
    PeakDeviceBytes = 0uL
    PeakCacheBytes = 0uL
    PeakTextBytes = 0uL
    PeakLayerBytes = 0uL
    PeakImageBytes = 0uL
    GcTotalMemoryStartBytes = 0L
    GcTotalMemoryEndBytes = 0L
    GcTotalMemoryAfterGcBytes = 0L
    GcHeapSizeStartBytes = 0L
    GcHeapSizeEndBytes = 0L
    GcHeapSizeAfterGcBytes = 0L
    GcCommittedStartBytes = 0L
    GcCommittedEndBytes = 0L
    GcCommittedAfterGcBytes = 0L
    GcTotalAllocatedStartBytes = 0L
    GcTotalAllocatedEndBytes = 0L
    GcTotalAllocatedAfterGcBytes = 0L
    CpuProfileValidCount = 0
    Ran = false
  }

  func Record(index int32, hostTicks int64, allocatedBytes int64,
    counters VulkanDiagnosticCounterSnapshot) {
    HostTicks[index] = hostTicks
    ThreadAllocatedBytes[index] = allocatedBytes
    DrawDeltas[index] = ReviewDelta(counters.drawCount, StartCounters.drawCount)
    PipelineDeltas[index] = ReviewDelta(counters.pipelineChangeCount, StartCounters.pipelineChangeCount)
    DescriptorDeltas[index] = ReviewDelta(counters.descriptorChangeCount, StartCounters.descriptorChangeCount)
    PeakAllocatorBytes = ReviewMax(PeakAllocatorBytes, counters.allocatorBytes)
    PeakDeviceBytes = ReviewMax(PeakDeviceBytes, counters.vulkanDeviceMemoryBytes)
    PeakCacheBytes = ReviewMax(PeakCacheBytes, counters.cacheBytes)
    PeakTextBytes = ReviewMax(PeakTextBytes, counters.textAtlasResidentBytes)
    PeakLayerBytes = ReviewMax(PeakLayerBytes, counters.layerPoolResidentBytes)
    PeakImageBytes = ReviewMax(PeakImageBytes, counters.imageResidentBytes)
  }

  func GpuIndex(stage int32, index int32) int32 -> stage * SampleCount + index

  func CountValid(stage int32) int32 {
    var count int32 = 0
    var index int32 = 0
    while index < SampleCount {
      if GpuValid[GpuIndex(stage, index)] {
        count = count + 1
      }
      index = index + 1
    }
    return count
  }

  func CpuIndex(stage int32, index int32) int32 ->
    stage * SampleCount + index
}

func ReviewSmaps(state string, phase string) {
  let path = "/proc/self/smaps_rollup"
  if File.Exists(path) {
    Console.WriteLine("gallery-review-smaps,state=" + state + ",phase=" + phase + ",begin")
    Console.Write(File.ReadAllText(path))
    Console.WriteLine("gallery-review-smaps,state=" + state + ",phase=" + phase + ",end")
  } else {
    Console.WriteLine("gallery-review-smaps,state=" + state + ",phase=" + phase + ",available=0")
  }
  if phase == "after-close"
    && Environment.GetEnvironmentVariable("GOO_GALLERY_REVIEW_MEMORY_MAP") == "1"{
    let fullPath = "/proc/self/smaps"
    if File.Exists(fullPath) {
      Console.WriteLine("gallery-review-smaps-full,state=" + state + ",phase=" + phase + ",begin")
      Console.Write(File.ReadAllText(fullPath))
      Console.WriteLine("gallery-review-smaps-full,state=" + state + ",phase=" + phase + ",end")
    } else {
      Console.WriteLine("gallery-review-smaps-full,state=" + state + ",phase=" + phase + ",available=0")
    }
  }
}

internal data struct ReviewMemoryBoundary {
  internal var TotalMemoryBytes int64
  internal var HeapSizeBytes int64
  internal var CommittedBytes int64
  internal var TotalAllocatedBytes int64
}

func ReviewCaptureMemory() ReviewMemoryBoundary {
  let info = GC.GetGCMemoryInfo()
  return ReviewMemoryBoundary{
    TotalMemoryBytes: GC.GetTotalMemory(false),
    HeapSizeBytes: info.HeapSizeBytes,
    CommittedBytes: info.TotalCommittedBytes,
    TotalAllocatedBytes: GC.GetTotalAllocatedBytes(true),
  }
}

func ReviewPrintMemory(state string, phase string,
  memory ReviewMemoryBoundary, window Window?) {
  Console.WriteLine("gallery-review-memory,state=" + state + ",phase=" + phase
    + ",gc_total_memory_B=" + memory.TotalMemoryBytes.ToString()
    + ",gc_actual_B=" + memory.HeapSizeBytes.ToString()
    + ",gc_committed_B=" + memory.CommittedBytes.ToString()
    + ",gc_total_allocated_B=" + memory.TotalAllocatedBytes.ToString())
  ReviewSmaps(state, phase)
  ReviewPrintMemoryOwners(state, phase, window)
}

func ReviewPrintSummary(state ReviewStateSamples, pace bool) {
  let processCpuNanoseconds = state.ProcessCpuTicks * 100L
  let submitDelta = ReviewDelta(state.EndCounters.submitCount, state.StartCounters.submitCount)
  let presentDelta = ReviewDelta(state.EndCounters.presentCount, state.StartCounters.presentCount)
  let drawDelta = ReviewDelta(state.EndCounters.drawCount, state.StartCounters.drawCount)
  let pipelineDelta = ReviewDelta(state.EndCounters.pipelineChangeCount, state.StartCounters.pipelineChangeCount)
  let descriptorDelta = ReviewDelta(state.EndCounters.descriptorChangeCount, state.StartCounters.descriptorChangeCount)
  let managedAllocatedDelta = ReviewSignedDelta(state.GcTotalAllocatedEndBytes,
    state.GcTotalAllocatedStartBytes)
  Console.WriteLine("gallery-review-summary,state=" + state.Name
    + ",mode=forced_repaint,pace16ms=" + (pace ? "1" : "0")
    + ",warmup=120,measured=" + state.SampleCount.ToString()
    + ",completed_frames=" + presentDelta.ToString()
    + ",timestamp_supported=" + (state.TimestampSupported ? "1" : "0")
    + ",upload_valid=" + state.UploadValidCount.ToString()
    + ",main_valid=" + state.MainValidCount.ToString()
    + ",effects_valid=" + state.EffectsValidCount.ToString()
    + ",offscreen_valid=" + state.OffscreenValidCount.ToString()
    + ",submit_delta=" + submitDelta.ToString()
    + ",present_delta=" + presentDelta.ToString()
    + ",draw_delta=" + drawDelta.ToString()
    + ",pipeline_delta=" + pipelineDelta.ToString()
    + ",descriptor_delta=" + descriptorDelta.ToString()
    + ",process_cpu_ticks=" + state.ProcessCpuTicks.ToString()
    + ",process_cpu_ns=" + processCpuNanoseconds.ToString()
    + ",allocator_start_B=" + state.StartCounters.allocatorBytes.ToString()
    + ",allocator_end_B=" + state.EndCounters.allocatorBytes.ToString()
    + ",allocator_peak_B=" + state.PeakAllocatorBytes.ToString()
    + ",device_start_B=" + state.StartCounters.vulkanDeviceMemoryBytes.ToString()
    + ",device_end_B=" + state.EndCounters.vulkanDeviceMemoryBytes.ToString()
    + ",device_peak_B=" + state.PeakDeviceBytes.ToString()
    + ",cache_start_B=" + state.StartCounters.cacheBytes.ToString()
    + ",cache_end_B=" + state.EndCounters.cacheBytes.ToString()
    + ",cache_peak_B=" + state.PeakCacheBytes.ToString()
    + ",text_start_B=" + state.StartCounters.textAtlasResidentBytes.ToString()
    + ",text_end_B=" + state.EndCounters.textAtlasResidentBytes.ToString()
    + ",text_peak_B=" + state.PeakTextBytes.ToString()
    + ",layer_start_B=" + state.StartCounters.layerPoolResidentBytes.ToString()
    + ",layer_end_B=" + state.EndCounters.layerPoolResidentBytes.ToString()
    + ",layer_peak_B=" + state.PeakLayerBytes.ToString()
    + ",image_start_B=" + state.StartCounters.imageResidentBytes.ToString()
    + ",image_end_B=" + state.EndCounters.imageResidentBytes.ToString()
    + ",image_peak_B=" + state.PeakImageBytes.ToString()
    + ",managed_allocated_delta_B=" + managedAllocatedDelta.ToString()
    + ",gc_total_memory_start_B=" + state.GcTotalMemoryStartBytes.ToString()
    + ",gc_total_memory_end_B=" + state.GcTotalMemoryEndBytes.ToString()
    + ",gc_total_memory_after_gc_B=" + state.GcTotalMemoryAfterGcBytes.ToString()
    + ",gc_heap_size_start_B=" + state.GcHeapSizeStartBytes.ToString()
    + ",gc_heap_size_end_B=" + state.GcHeapSizeEndBytes.ToString()
    + ",gc_heap_size_after_gc_B=" + state.GcHeapSizeAfterGcBytes.ToString()
    + ",gc_committed_start_B=" + state.GcCommittedStartBytes.ToString()
    + ",gc_committed_end_B=" + state.GcCommittedEndBytes.ToString()
    + ",gc_committed_after_gc_B=" + state.GcCommittedAfterGcBytes.ToString()
    + ",gc_total_allocated_start_B=" + state.GcTotalAllocatedStartBytes.ToString()
    + ",gc_total_allocated_end_B=" + state.GcTotalAllocatedEndBytes.ToString()
    + ",gc_total_allocated_after_gc_B=" + state.GcTotalAllocatedAfterGcBytes.ToString()
    + ",cpu_profile_valid=" + state.CpuProfileValidCount.ToString())
  ReviewPrintCpuSummary(state)
}

func ReviewCpuNanoseconds(ticks int64) int64 ->
  int64(float64(ticks) * 1000000000.0 / float64(Stopwatch.Frequency))

func ReviewPrintCpuSummary(state ReviewStateSamples) {
  let stageCount = int32(FrameProfileStage.Count)
  var timeLine = "gallery-review-cpu-summary,state=" + state.Name
    + ",valid=" + state.CpuProfileValidCount.ToString()
  var byteLine = "gallery-review-cpu-alloc-summary,state=" + state.Name
    + ",valid=" + state.CpuProfileValidCount.ToString()
  var stageIndex int32 = 0
  while stageIndex < stageCount {
    var totalTicks int64 = 0L
    var totalBytes int64 = 0L
    var sampleIndex int32 = 0
    while sampleIndex < state.SampleCount {
      if state.CpuProfileValid[sampleIndex] {
        let sourceIndex = state.CpuIndex(stageIndex, sampleIndex)
        totalTicks = totalTicks + state.CpuStageTicks[sourceIndex]
        totalBytes = totalBytes + state.CpuStageBytes[sourceIndex]
      }
      sampleIndex = sampleIndex + 1
    }
    let denominator = if state.CpuProfileValidCount > 0 { state.CpuProfileValidCount } else { 1 }
    let name = ReviewCpuStageName(stageIndex)
    timeLine = timeLine + "," + name + "_ns_per_frame="
      + (ReviewCpuNanoseconds(totalTicks) / int64(denominator)).ToString()
    byteLine = byteLine + "," + name + "_alloc_B_per_frame="
      + (totalBytes / int64(denominator)).ToString()
    stageIndex = stageIndex + 1
  }
  Console.WriteLine(timeLine)
  Console.WriteLine(byteLine)
}

func ReviewPrintRaw(states []ReviewStateSamples) {
  Console.WriteLine("gallery-review-raw,state,index,frame_id,host_wall_ticks,current_thread_allocated_delta_B,draw_delta,pipeline_delta,descriptor_delta,upload_ns,upload_scope_count,upload_dropped_scope_count,upload_valid,main_ns,main_scope_count,main_dropped_scope_count,main_valid,effects_ns,effects_scope_count,effects_dropped_scope_count,effects_valid,offscreen_ns,offscreen_scope_count,offscreen_dropped_scope_count,offscreen_valid")
  var stateIndex int32 = 0
  while stateIndex < states.Length {
    let state = states[stateIndex]
    if state.Ran {
      var index int32 = 0
      while index < state.SampleCount {
        let upload = state.GpuIndex(0, index)
        let main = state.GpuIndex(1, index)
        let effects = state.GpuIndex(2, index)
        let offscreen = state.GpuIndex(3, index)
        Console.WriteLine("gallery-review-raw," + state.Name + "," + index.ToString()
          + "," + state.FrameIds[index].ToString()
          + "," + state.HostTicks[index].ToString()
          + "," + state.ThreadAllocatedBytes[index].ToString()
          + "," + state.DrawDeltas[index].ToString()
          + "," + state.PipelineDeltas[index].ToString()
          + "," + state.DescriptorDeltas[index].ToString()
          + "," + state.GpuNanoseconds[upload].ToString()
          + "," + state.GpuScopeCounts[upload].ToString()
          + "," + state.GpuDroppedScopeCounts[upload].ToString()
          + "," + (state.GpuValid[upload] ? "1" : "0")
          + "," + state.GpuNanoseconds[main].ToString()
          + "," + state.GpuScopeCounts[main].ToString()
          + "," + state.GpuDroppedScopeCounts[main].ToString()
          + "," + (state.GpuValid[main] ? "1" : "0")
          + "," + state.GpuNanoseconds[effects].ToString()
          + "," + state.GpuScopeCounts[effects].ToString()
          + "," + state.GpuDroppedScopeCounts[effects].ToString()
          + "," + (state.GpuValid[effects] ? "1" : "0")
          + "," + state.GpuNanoseconds[offscreen].ToString()
          + "," + state.GpuScopeCounts[offscreen].ToString()
          + "," + state.GpuDroppedScopeCounts[offscreen].ToString()
          + "," + (state.GpuValid[offscreen] ? "1" : "0"))
        index = index + 1
      }
    }
    stateIndex = stateIndex + 1
  }
}

func ReviewPrintCpuRaw(states []ReviewStateSamples) {
  let stageCount = int32(FrameProfileStage.Count)
  var header = "gallery-review-cpu-raw,state,index,frame_id,valid"
  var stageIndex int32 = 0
  while stageIndex < stageCount {
    let name = ReviewCpuStageName(stageIndex)
    header = header + "," + name + "_ns," + name + "_alloc_B," + name + "_calls"
    stageIndex = stageIndex + 1
  }
  Console.WriteLine(header)
  var stateIndex int32 = 0
  while stateIndex < states.Length {
    let state = states[stateIndex]
    if state.Ran {
      var sampleIndex int32 = 0
      while sampleIndex < state.SampleCount {
        var line = "gallery-review-cpu-raw," + state.Name + ","
          + sampleIndex.ToString() + "," + state.FrameIds[sampleIndex].ToString()
          + "," + (state.CpuProfileValid[sampleIndex] ? "1" : "0")
        stageIndex = 0
        while stageIndex < stageCount {
          let sourceIndex = state.CpuIndex(stageIndex, sampleIndex)
          line = line + "," + ReviewCpuNanoseconds(state.CpuStageTicks[sourceIndex]).ToString()
            + "," + state.CpuStageBytes[sourceIndex].ToString()
            + "," + state.CpuStageCalls[sourceIndex].ToString()
          stageIndex = stageIndex + 1
        }
        Console.WriteLine(line)
        sampleIndex = sampleIndex + 1
      }
    }
    stateIndex = stateIndex + 1
  }
}

class ReviewWorkloadControlPoints {
  private let x [5]float64
  private let y [5]float64
  private var count int32

  prop Count int32 { get -> count }

  init(accessibility GallerySmokeAccessibility, route int32) {
    x = [5]float64{}
    y = [5]float64{}
    count = 0
    if route == 0 {
      AddExact(accessibility, "@dev")
      AddExact(accessibility, "@wayland")
      AddExact(accessibility, "@gsharp")
    } else if route == 1 {
      AddContaining(accessibility, "Orientation:")
    } else if route == 2 {
      AddExact(accessibility, "All Categories")
      AddExact(accessibility, "Forms & Inputs")
      AddExact(accessibility, "Selection")
      AddExact(accessibility, "Buttons")
      AddExact(accessibility, "Display & Feedback")
    }
  }

  private func AddPoint(node AccessibilityNode) {
    ReviewRequire(count < x.Length, "Gallery review workload control point capacity exceeded")
    let bounds = node.Bounds
    x[count] = bounds.X + bounds.Width * 0.5
    y[count] = bounds.Y + bounds.Height * 0.5
    count = count + 1
  }

  private func AddExact(accessibility GallerySmokeAccessibility, name string) {
    guard let node = accessibility.FindExact(name) else {
      throw InvalidOperationException("Gallery review workload control not found: " + name)
    }
    AddPoint(node)
  }

  private func AddContaining(accessibility GallerySmokeAccessibility, name string) {
    guard let node = accessibility.FindContaining(name) else {
      throw InvalidOperationException("Gallery review workload control not found: " + name)
    }
    AddPoint(node)
  }

  func QueueNext(window Window, sampleIndex int32) {
    if count <= 0 {
      return
    }
    let index = sampleIndex % count
    WindowReadbackTestFixture.InputQueuePointerPress(window, x[index], y[index])
    WindowReadbackTestFixture.InputQueuePointerRelease(window, x[index], y[index])
  }
}

func RunReviewState(window Window, root GalleryCell, stateIndex int32,
  state ReviewStateSamples, capture ReviewTimestampCapture, process Process,
  profile ReviewProfile, pace bool, workload int32,
  accessibility GallerySmokeAccessibility) {
  Console.WriteLine("gallery-review-state,state=" + state.Name
    + ",phase=before-warmup,mode=forced_repaint")
  if state.ShowcaseIndex >= 0 {
    ReviewRequire(root.OpenShowcase(state.ShowcaseIndex),
      "Gallery review workload route selection failed")
    WindowReadbackTestFixture.ForceRender(window, 0.0)
  } else if stateIndex > 0 {
    let showcase = stateIndex + 5
    ReviewRequire(root.OpenShowcase(showcase), "Gallery review showcase selection failed")
    WindowReadbackTestFixture.ForceRender(window, 0.0)
  }
  let controls = ReviewWorkloadControlPoints(accessibility, workload)
  if workload >= 0 {
    window.AccessibilityAdapter = nil
  }
  var warmupIndex int32 = 0
  while warmupIndex < 120 {
    if pace {
      Thread.Sleep(16)
    }
    if workload >= 0 {
      controls.QueueNext(window, warmupIndex)
    }
    WindowReadbackTestFixture.ForceRender(window, 1.0 / 60.0)
    warmupIndex = warmupIndex + 1
  }
  Console.WriteLine("gallery-review-state,state=" + state.Name
    + ",phase=after-warmup,mode=forced_repaint")
  if workload == 3 {
    let owner = WindowReadbackTestFixture.MemoryOwnerCapacities(window)
    ReviewRequire(owner.ImageResidentBytes > 0uL,
      "Gallery image-upload control did not publish a Vulkan image")
  }
  state.TimestampSupported = WindowReadbackTestFixture.TimestampSupported(window)
  ReviewRequire(state.TimestampSupported, "Gallery review benchmark requires Vulkan timestamps")
  profile.Start()
  capture.Start()
  let startCounters = WindowReadbackTestFixture.DiagnosticCounters(window)
  state.StartCounters = startCounters
  let startMemory = ReviewCaptureMemory()
  state.GcTotalMemoryStartBytes = startMemory.TotalMemoryBytes
  state.GcHeapSizeStartBytes = startMemory.HeapSizeBytes
  state.GcCommittedStartBytes = startMemory.CommittedBytes
  state.GcTotalAllocatedStartBytes = startMemory.TotalAllocatedBytes
  ReviewPrintMemory(state.Name, "before-measurements", startMemory, window)
  state.PeakAllocatorBytes = startCounters.allocatorBytes
  state.PeakDeviceBytes = startCounters.vulkanDeviceMemoryBytes
  state.PeakCacheBytes = startCounters.cacheBytes
  state.PeakTextBytes = startCounters.textAtlasResidentBytes
  state.PeakLayerBytes = startCounters.layerPoolResidentBytes
  state.PeakImageBytes = startCounters.imageResidentBytes
  process.Refresh()
  let processCpuStart = process.TotalProcessorTime.Ticks
  var lastCounters = startCounters
  var sampleIndex int32 = 0
  while sampleIndex < state.SampleCount {
    if pace {
      Thread.Sleep(16)
    }
    let allocatedBefore = GC.GetAllocatedBytesForCurrentThread()
    let wallStart = Stopwatch.GetTimestamp()
    if workload >= 0 {
      controls.QueueNext(window, sampleIndex)
    }
    WindowReadbackTestFixture.ForceRender(window, 1.0 / 60.0)
    let wallEnd = Stopwatch.GetTimestamp()
    let allocatedAfter = GC.GetAllocatedBytesForCurrentThread()
    let afterCounters = WindowReadbackTestFixture.DiagnosticCounters(window)
    ReviewRequire(afterCounters.submitCount == lastCounters.submitCount + 1uL,
      "Gallery review frame did not submit exactly once")
    ReviewRequire(afterCounters.presentCount == lastCounters.presentCount + 1uL,
      "Gallery review frame did not present exactly once")
    let frameId = WindowReadbackTestFixture.DiagnosticFrameId(window)
    if sampleIndex > 0 {
      ReviewRequire(frameId > state.FrameIds[sampleIndex - 1],
        "Gallery review frame ids are not strictly ordered")
    }
    state.FrameIds[sampleIndex] = frameId
    state.Record(sampleIndex, wallEnd - wallStart,
      allocatedAfter - allocatedBefore,
      afterCounters)
    lastCounters = afterCounters
    sampleIndex = sampleIndex + 1
  }
  process.Refresh()
  state.ProcessCpuTicks = process.TotalProcessorTime.Ticks - processCpuStart
  state.EndCounters = lastCounters
  profile.Stop()
  let endMemory = ReviewCaptureMemory()
  state.GcTotalMemoryEndBytes = endMemory.TotalMemoryBytes
  state.GcHeapSizeEndBytes = endMemory.HeapSizeBytes
  state.GcCommittedEndBytes = endMemory.CommittedBytes
  state.GcTotalAllocatedEndBytes = endMemory.TotalAllocatedBytes
  ReviewPrintMemory(state.Name, "before-gc", endMemory, window)
  var resolveIndex int32 = 0
  while resolveIndex < 8 {
    if pace {
      Thread.Sleep(16)
    }
    WindowReadbackTestFixture.ForceRender(window, 1.0 / 60.0)
    resolveIndex = resolveIndex + 1
  }
  capture.Stop()
  ReviewRequire(!capture.Overflow, "Gallery review timestamp capture overflowed")
  capture.Resolve(0, state.FrameIds, state.GpuNanoseconds,
    state.GpuScopeCounts, state.GpuDroppedScopeCounts, state.GpuValid, 0)
  capture.Resolve(1, state.FrameIds, state.GpuNanoseconds,
    state.GpuScopeCounts, state.GpuDroppedScopeCounts, state.GpuValid, state.SampleCount)
  capture.Resolve(2, state.FrameIds, state.GpuNanoseconds,
    state.GpuScopeCounts, state.GpuDroppedScopeCounts, state.GpuValid, state.SampleCount * 2)
  capture.Resolve(3, state.FrameIds, state.GpuNanoseconds,
    state.GpuScopeCounts, state.GpuDroppedScopeCounts, state.GpuValid, state.SampleCount * 3)
  state.UploadValidCount = state.CountValid(0)
  state.MainValidCount = state.CountValid(1)
  state.EffectsValidCount = state.CountValid(2)
  state.OffscreenValidCount = state.CountValid(3)
  ReviewRequire(state.MainValidCount == state.SampleCount,
    "Gallery review requires one valid main GPU timestamp for each measured frame")
  state.CpuProfileValidCount = profile.Resolve(state.FrameIds, state.CpuStageTicks,
    state.CpuStageBytes, state.CpuStageCalls, state.CpuProfileValid)
  ReviewRequire(!profile.Overflow,
    "Gallery review CPU profile capture overflowed")
  ReviewRequire(state.CpuProfileValidCount == state.SampleCount,
    "Gallery review requires one valid CPU profile frame for each measured frame")
  Console.WriteLine("gallery-review-state,state=" + state.Name
    + ",phase=after-measurements,mode=forced_repaint,completed_frames="
    + ReviewDelta(lastCounters.presentCount, startCounters.presentCount).ToString())
  GC.Collect()
  GC.WaitForPendingFinalizers()
  GC.Collect()
  let afterGcMemory = ReviewCaptureMemory()
  state.GcTotalMemoryAfterGcBytes = afterGcMemory.TotalMemoryBytes
  state.GcHeapSizeAfterGcBytes = afterGcMemory.HeapSizeBytes
  state.GcCommittedAfterGcBytes = afterGcMemory.CommittedBytes
  state.GcTotalAllocatedAfterGcBytes = afterGcMemory.TotalAllocatedBytes
  ReviewPrintMemory(state.Name, "after-gc", afterGcMemory, window)
  ReviewPrintSummary(state, pace)
  state.Ran = true
}

func RunReviewBench() {
  let sampleCount int32 = 500
  let root = GalleryCell{}
  let window = Window{
    Title: "Goo Gallery review benchmark",
    Width: 1440,
    Height: 900,
    Resizable: true,
    VSync: false,
    Background: GalleryTheme.Background,
    Root: root,
  }
  let process = Process.GetCurrentProcess()
  let capture = ReviewTimestampCapture(sampleCount)
  let accessibility = GallerySmokeAccessibility{}
  let workload = ReviewWorkloadRoute()
  let states = if workload >= 0 {
    []ReviewStateSamples{
      ReviewStateSamples(ReviewWorkloadName(workload), sampleCount,
        ReviewWorkloadShowcase(workload)),
    }
  } else {
    []ReviewStateSamples{
      ReviewStateSamples("opening", sampleCount),
      ReviewStateSamples("shader-3d-world", sampleCount),
      ReviewStateSamples("shader-radial-light", sampleCount),
      ReviewStateSamples("shader-dither", sampleCount),
    }
  }
  let selected = if workload >= 0 { -1 } else { ReviewSelectedState() }
  let pace = ReviewPace16Ms()
  ReviewPrintGcConfiguration()
  Console.WriteLine("gallery-review-memory-method,gc_total_allocated_scope=all_threads,boundary_output_allocates=1")
  try {
    root.AttachWindow(window)
    if workload >= 0 {
      window.AccessibilityAdapter = accessibility
    }
    ReviewPrintMemory("lifecycle", "before-open", ReviewCaptureMemory(), window)
    window.Open()
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    ReviewPrintMemory("lifecycle", "after-first-frame", ReviewCaptureMemory(), window)
    ReviewRequire(WindowReadbackTestFixture.TimestampSupported(window),
      "Gallery review benchmark requires Vulkan timestamps")
    WindowReadbackTestFixture.SetAllTimestampSink(window,
      (snapshot VulkanDiagnosticTimestampSnapshot) -> capture.Accept(snapshot))
    let target = WindowReadbackTestFixture.CaptureTarget(window)
    let profile = ReviewProfile(window, target?.ProfileSink, sampleCount)
    WindowReadbackTestFixture.SetFrameProfileSink(window, profile)
    var stateIndex int32 = 0
    while stateIndex < states.Length {
      if selected < 0 || selected == stateIndex {
        RunReviewState(window, root, stateIndex, states[stateIndex], capture, process,
          profile, pace, workload, accessibility)
      }
      stateIndex = stateIndex + 1
    }
    Console.WriteLine("gallery-review-clock,stopwatch_frequency=" + Stopwatch.Frequency.ToString()
      + ",selected_state=" + selected.ToString()
      + ",workload=" + (workload < 0 ? "default" : ReviewWorkloadName(workload)))
    ReviewPrintRaw(states)
    ReviewPrintCpuRaw(states)
  } finally {
    capture.Stop()
    WindowReadbackTestFixture.SetFrameProfileSink(window, nil)
    WindowReadbackTestFixture.SetAllTimestampSink(window, nil)
    if window.IsOpen {
      CloseCleanly(window)
    }
    ReviewPrintMemory("lifecycle", "after-close", ReviewCaptureMemory(), nil)
    root.Dispose()
  }
}
