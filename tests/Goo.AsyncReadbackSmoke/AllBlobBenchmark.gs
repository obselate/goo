package GooAsyncReadbackSmoke

import Goo
import System
import System.Collections.Generic
import System.Diagnostics
import System.IO

class AllBlobKind {
  shared {
    const Container string = "container"
    const Text string = "text"
    const Image string = "image"
    const Shape string = "shape"
    const Button string = "button"
    const TextEntry string = "text-entry"
    const TextEditor string = "text-editor"
  }
}

class AllBlobMode {
  shared {
    const Unchanged string = "unchanged"
    const Sparse string = "sparse"
    const Full string = "full"
  }
}

class AllBlobLeafCell : Cell {
  private var kind string
  private var index int32
  private var opacity float64
  private var image ImageSource?
  private var path VectorPath
  private var controller TextEditorController?
  private var buildCount int64

  prop BuildCount int64 { get -> buildCount }

  func Initialize(blobKind string, blobIndex int32, sharedImage ImageSource,
    sharedPath VectorPath, editorController TextEditorController?) {
      kind = blobKind
      index = blobIndex
      opacity = 1.0
      image = sharedImage
      path = sharedPath
      controller = editorController
    }

  func ToggleOpacity() {
    opacity = opacity == 1.0 ? 0.75 : 1.0
    Rebuild()
  }

  override func Build() Blob {
    buildCount = buildCount + 1L
    let row = index / 50
    let column = index % 50
    let left = float64(column) * 20.0
    let top = float64(row) * 32.0
    if kind == AllBlobKind.Container {
      return Container{
        Position: PositionType.Absolute,
        Left: left,
        Top: top,
        Width: 18.0,
        Height: 28.0,
        Opacity: opacity,
        BackgroundColor: Color.Rgb(52, 116, 196),
      }
    }
    if kind == AllBlobKind.Text {
      return Text("x") {
        Position = PositionType.Absolute,
        Left = left,
        Top = top,
        Width = 18.0,
        Height = 28.0,
        Opacity = opacity,
        FontSize = 12.0,
        LineHeight = 1.0,
        TextWrap = TextWrap.NoWrap,
        Color = Color.Rgb(224, 234, 246),
      }
    }
    if kind == AllBlobKind.Image {
      return Image{
        Position: PositionType.Absolute,
        Left: left,
        Top: top,
        Width: 18.0,
        Height: 28.0,
        Opacity: opacity,
        Source: image,
        Fit: ImageFit.Fill,
      }
    }
    if kind == AllBlobKind.Shape {
      return Shape{
        Position: PositionType.Absolute,
        Left: left,
        Top: top,
        Width: 18.0,
        Height: 28.0,
        Opacity: opacity,
        Path: path,
        Fit: ShapeFit.Fill,
        BackgroundColor: Color.Rgb(92, 182, 154),
      }
    }
    if kind == AllBlobKind.Button {
      return Button{
        Position: PositionType.Absolute,
        Left: left,
        Top: top,
        Width: 18.0,
        Height: 28.0,
        Opacity: opacity,
        BackgroundColor: Color.Rgb(166, 92, 202),
      }
    }
    if kind == AllBlobKind.TextEntry {
      return TextEntry{
        Position: PositionType.Absolute,
        Left: left,
        Top: top,
        Width: 18.0,
        Height: 28.0,
        Opacity: opacity,
        Value: "x",
        FontSize: 12.0,
        LineHeight: 1.0,
        TextWrap: TextWrap.NoWrap,
        BackgroundColor: Color.Rgb(20, 30, 44),
        Color: Color.Rgb(224, 234, 246),
      }
    }
    guard let currentController = controller else {
      throw InvalidOperationException("All Blob text editor controller is unavailable")
    }
    return TextEditor(currentController) {
      Position = PositionType.Absolute,
      Left = left,
      Top = top,
      Width = 18.0,
      Height = 28.0,
      Opacity = opacity,
      FontSize = 12.0,
      LineHeight = 1.0,
      TextWrap = TextWrap.NoWrap,
      BackgroundColor = Color.Rgb(20, 30, 44),
      Color = Color.Rgb(224, 234, 246),
      OverscanLines = 0,
    }
  }
}

class AllBlobRoot : Cell {
  shared {
    const Count int32 = 1000
  }

  private let kind string
  private let mode string
  private let keys []string
  private let cells []AllBlobLeafCell?
  private let image ImageSource
  private let path VectorPath
  private let controllers []TextEditorController?
  private var rootBuildCount int64
  private var mutationCount int64

  prop RootBuildCount int64 { get -> rootBuildCount }
  prop MutationCount int64 { get -> mutationCount }

  init(blobKind string, mutationMode string) {
    kind = blobKind
    mode = mutationMode
    keys = [Count]string
    cells = [Count]AllBlobLeafCell?
    controllers = [Count]TextEditorController?
    image = ImageSource(1, 1, []uint8{ 72u, 152u, 224u, 255u })
    let pathBuilder = PathBuilder()
    pathBuilder.MoveTo(0.5, 0.0).LineTo(1.0, 1.0).LineTo(0.0, 1.0).Close()
    path = pathBuilder.Build()
    var index int32 = 0
    while index < Count {
      keys[index] = "all-blob-" + index.ToString()
      if kind == AllBlobKind.TextEditor {
        controllers[index] = TextEditorController(TextDocument("x"))
      }
      index = index + 1
    }
  }

  func Advance(frame int32) int32 {
    if mode == AllBlobMode.Unchanged { return 0 }
    if mode == AllBlobMode.Sparse {
      Toggle(frame * 17 % Count)
      mutationCount = mutationCount + 1L
      return 1
    }
    var index int32 = 0
    while index < Count {
      Toggle(index)
      index = index + 1
    }
    mutationCount = mutationCount + int64(Count)
    return Count
  }

  func LeafBuildCount() int64 {
    var result int64 = 0L
    var index int32 = 0
    while index < Count {
      guard let cell = cells[index] else {
        throw InvalidOperationException("All Blob leaf is not mounted")
      }
      result = result + cell.BuildCount
      index = index + 1
    }
    return result
  }

  private func Toggle(index int32) {
    guard let cell = cells[index] else {
      throw InvalidOperationException("All Blob leaf is not mounted")
    }
    cell.ToggleOpacity()
  }

  override func Build() Blob {
    rootBuildCount = rootBuildCount + 1L
    let children = List[Blob](Count)
    var index int32 = 0
    while index < Count {
      let leafIndex = index
      let editorController = controllers[index]
      children.Add(Cell.MountSeeded[AllBlobLeafCell](keys[index],
        (cell AllBlobLeafCell) -> {
          cell.Initialize(kind, leafIndex, image, path, editorController)
          cells[leafIndex] = cell
        }, nil))
      index = index + 1
    }
    return Container{
      Width: 1000,
      Height: 640,
      Position: PositionType.Relative,
      BackgroundColor: Color.Rgb(10, 15, 24),
      Children: children,
    }
  }

  func DisposeOwnedResources() {
    image.Dispose()
    for controller in controllers {
      controller?.Dispose()
    }
  }
}

class AllBlobTimestampCapture {
  private let capacity int32
  private let frames []uint64
  private let nanoseconds []int64
  private let scopeCounts []int32
  private let droppedScopeCounts []int32
  private let counts []int32
  private var enabled bool
  private var overflow bool

  prop Overflow bool { get -> overflow }
  prop DroppedScopeCount int32 {
    get {
      var result int32 = 0
      for value in droppedScopeCounts { result = result + value }
      return result
    }
  }

  init(sampleCapacity int32) {
    capacity = sampleCapacity + 16
    frames = [capacity * 4]uint64
    nanoseconds = [capacity * 4]int64
    scopeCounts = [capacity * 4]int32
    droppedScopeCounts = [capacity * 4]int32
    counts = [4]int32
  }

  func Start() { enabled = true }
  func Stop() { enabled = false }

  func Accept(snapshot VulkanDiagnosticTimestampSnapshot) {
    if !enabled { return }
    let stage = int32(snapshot.stage)
    if stage < 0 || stage >= 4 { return }
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

  func Resolve(stage int32, expectedFrames []uint64, output []int64) int32 {
    var outputCount int32 = 0
    var expectedIndex int32 = 0
    while expectedIndex < expectedFrames.Length {
      var matches int32 = 0
      var value int64 = 0L
      var captureIndex int32 = 0
      while captureIndex < counts[stage] {
        let index = stage * capacity + captureIndex
        if frames[index] == expectedFrames[expectedIndex] {
          Require(nanoseconds[index] > 0L && scopeCounts[index] > 0
              && droppedScopeCounts[index] == 0,
            "All Blob GPU timestamp sample is invalid")
          matches = matches + 1
          value = nanoseconds[index]
        }
        captureIndex = captureIndex + 1
      }
      Require(matches <= 1, "All Blob GPU timestamp sample is duplicated")
      if matches == 1 {
        output[outputCount] = value
        outputCount = outputCount + 1
      }
      expectedIndex = expectedIndex + 1
    }
    return outputCount
  }
}

func AllBlobKindValue() string {
  guard let value = Environment.GetEnvironmentVariable("GOO_ALL_BLOB_KIND") else {
    throw InvalidOperationException("GOO_ALL_BLOB_KIND is required")
  }
  if value == AllBlobKind.Container { return value }
  if value == AllBlobKind.Text { return value }
  if value == AllBlobKind.Image { return value }
  if value == AllBlobKind.Shape { return value }
  if value == AllBlobKind.Button { return value }
  if value == AllBlobKind.TextEntry { return value }
  if value == AllBlobKind.TextEditor { return value }
  throw InvalidOperationException("GOO_ALL_BLOB_KIND is invalid")
}

func AllBlobModeValue() string {
  guard let value = Environment.GetEnvironmentVariable("GOO_ALL_BLOB_MODE") else {
    throw InvalidOperationException("GOO_ALL_BLOB_MODE is required")
  }
  if value == AllBlobMode.Unchanged { return value }
  if value == AllBlobMode.Sparse { return value }
  if value == AllBlobMode.Full { return value }
  throw InvalidOperationException("GOO_ALL_BLOB_MODE is invalid")
}

func AllBlobMax(left uint64, right uint64) uint64 -> left > right ? left : right

func AllBlobSampleMemory(process Process, window Window,
  ref managedHeapPeak uint64, ref workingSetPeak uint64, ref privateMemoryPeak uint64,
  ref allocatorPeak uint64, ref vulkanPeak uint64, ref cachePeak uint64,
  ref imagePeak uint64, ref textPeak uint64) {
    managedHeapPeak = AllBlobMax(managedHeapPeak, PerformanceManagedLive())
    workingSetPeak = AllBlobMax(workingSetPeak, PerformanceProcessWorkingSet(process))
    privateMemoryPeak = AllBlobMax(privateMemoryPeak, PerformanceProcessPrivateMemory(process))
    let counters = WindowReadbackTestFixture.DiagnosticCounters(window)
    allocatorPeak = AllBlobMax(allocatorPeak, counters.allocatorBytes)
    vulkanPeak = AllBlobMax(vulkanPeak, counters.vulkanDeviceMemoryBytes)
    cachePeak = AllBlobMax(cachePeak, counters.cacheBytes)
    imagePeak = AllBlobMax(imagePeak, counters.imageResidentBytes)
    textPeak = AllBlobMax(textPeak, counters.textAtlasResidentBytes)
  }

func AllBlobMutationExpected(mode string, frames int32) int64 {
  if mode == AllBlobMode.Unchanged { return 0L }
  return if mode == AllBlobMode.Sparse { int64(frames) } else { int64(frames) * int64(AllBlobRoot.Count) }
}

data struct AllBlobLinuxSmapsSnapshot {
  var Available bool
  var RssBytes uint64
  var PssBytes uint64
}

func AllBlobSmapsValue(line string, prefix string) uint64 {
  var value = line.Substring(prefix.Length).Trim()
  let separator = value.IndexOf(" ")
  if separator >= 0 { value = value.Substring(0, separator) }
  return UInt64.Parse(value) * 1024uL
}

func AllBlobLinuxSmaps() AllBlobLinuxSmapsSnapshot {
  let path = "/proc/self/smaps_rollup"
  if !File.Exists(path) { return AllBlobLinuxSmapsSnapshot{} }
  let lines = File.ReadAllLines(path)
  var rss uint64 = 0uL
  var pss uint64 = 0uL
  for line in lines {
    if line.StartsWith("Rss:") {
      rss = AllBlobSmapsValue(line, "Rss:")
    } else if line.StartsWith("Pss:") {
      pss = AllBlobSmapsValue(line, "Pss:")
    }
  }
  return AllBlobLinuxSmapsSnapshot{
    Available: rss != 0uL && pss != 0uL,
    RssBytes: rss,
    PssBytes: pss,
  }
}

func RunAllBlobBenchmark() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let kind = AllBlobKindValue()
  let mode = AllBlobModeValue()
  let warmup = EnvironmentCount("GOO_ALL_BLOB_WARMUP", 300, 300)
  let samples = EnvironmentCount("GOO_ALL_BLOB_SAMPLES", 2000, 2000)
  Require(samples > 0, "GOO_ALL_BLOB_SAMPLES must be positive")
  let root = AllBlobRoot(kind, mode)
  let coldFrameNs = [2]int64
  let coldFrameAllocations = [2]int64
  let frameNs = [samples]int64
  let frameAllocations = [samples]int64
  let expectedFrames = [samples]uint64
  let uploadNs = [samples]int64
  let mainNs = [samples]int64
  let effectsNs = [samples]int64
  let offscreenNs = [samples]int64
  let timestamps = AllBlobTimestampCapture(samples)
  let process = Process.GetCurrentProcess()
  var window Window? = nil
  var timestampSupported bool = false
  var sawSlot0 bool = false
  var sawSlot1 bool = false
  var beforeCounters VulkanDiagnosticCounterSnapshot{}
  var endCounters VulkanDiagnosticCounterSnapshot{}
  var initialLeafBuildCount int64 = 0L
  var warmLeafBuildCount int64 = 0L
  var measuredLeafBuildCount int64 = 0L
  var coldLeafBuildCount int64 = 0L
  var coldMutationCount int64 = 0L
  var warmMutationCount int64 = 0L
  var measuredMutationCount int64 = 0L
  var managedHeapStart uint64 = 0uL
  var managedHeapEnd uint64 = 0uL
  var managedHeapPeak uint64 = 0uL
  var managedRetainedStart uint64 = 0uL
  var managedRetainedEnd uint64 = 0uL
  var postGcSmaps AllBlobLinuxSmapsSnapshot{}
  var workingSetStart uint64 = 0uL
  var workingSetEnd uint64 = 0uL
  var workingSetPeak uint64 = 0uL
  var privateMemoryStart uint64 = 0uL
  var privateMemoryEnd uint64 = 0uL
  var privateMemoryPeak uint64 = 0uL
  var allocatorPeak uint64 = 0uL
  var vulkanPeak uint64 = 0uL
  var cachePeak uint64 = 0uL
  var imagePeak uint64 = 0uL
  var textPeak uint64 = 0uL
  var residentBeforeClose uint64 = 0uL
  var cleanupBytes uint64 = 0uL
  var cleanupCounters VulkanDiagnosticCounterSnapshot{}
  var closed bool = false
  var measuredLoopWallNanoseconds int64 = 0L
  var processCpuNanoseconds int64 = 0L
  try {
    let opened = Window{
      Title: "Goo all Blob benchmark " + kind + " " + mode,
      Width: 1000,
      Height: 640,
      VSync: false,
      Root: root,
    }
    window = opened
    opened.Open()
    WindowReadbackTestFixture.SetAllTimestampSink(opened,
      (snapshot VulkanDiagnosticTimestampSnapshot) -> timestamps.Accept(snapshot))
    WindowReadbackTestFixture.ForceRender(opened, 0.0, 30.0)
    Require(WindowReadbackTestFixture.CellMounted(root),
      "All Blob benchmark root is not mounted")
    initialLeafBuildCount = root.LeafBuildCount()
    Require(root.RootBuildCount == 1L && initialLeafBuildCount == int64(AllBlobRoot.Count),
      "All Blob initial build count is incorrect")
    let coldBuildStart = root.LeafBuildCount()
    let coldMutationStart = root.MutationCount
    var coldIndex int32 = 0
    while coldIndex < 2 {
      WindowReadbackTestFixture.PumpNativeEvents()
      let countersBefore = WindowReadbackTestFixture.DiagnosticCounters(opened)
      let allocatedBefore = GC.GetAllocatedBytesForCurrentThread()
      let start = Stopwatch.GetTimestamp()
      root.Advance(coldIndex)
      WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
      WindowReadbackTestFixture.DrainWindowQueue(opened, 2000)
      let end = Stopwatch.GetTimestamp()
      let allocatedAfter = GC.GetAllocatedBytesForCurrentThread()
      let counters = WindowReadbackTestFixture.DiagnosticCounters(opened)
      Require(counters.submitCount == countersBefore.submitCount + 1uL
          && counters.presentCount == countersBefore.presentCount + 1uL,
        "All Blob cold frame did not submit and present exactly once")
      coldFrameNs[coldIndex] = TicksToNanoseconds(end - start)
      coldFrameAllocations[coldIndex] = allocatedAfter - allocatedBefore
      coldIndex = coldIndex + 1
    }
    coldLeafBuildCount = root.LeafBuildCount() - coldBuildStart
    coldMutationCount = root.MutationCount - coldMutationStart
    Require(coldLeafBuildCount == AllBlobMutationExpected(mode, 2)
        && coldMutationCount == AllBlobMutationExpected(mode, 2),
      "All Blob cold build or mutation count is incorrect")
    let warmBuildStart = root.LeafBuildCount()
    let warmMutationStart = root.MutationCount
    var warmIndex int32 = 0
    while warmIndex < warmup {
      WindowReadbackTestFixture.PumpNativeEvents()
      root.Advance(2 + warmIndex)
      WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
      warmIndex = warmIndex + 1
    }
    warmLeafBuildCount = root.LeafBuildCount() - warmBuildStart
    warmMutationCount = root.MutationCount - warmMutationStart
    Require(warmLeafBuildCount == AllBlobMutationExpected(mode, warmup)
        && warmMutationCount == AllBlobMutationExpected(mode, warmup),
      "All Blob warm build or mutation count is incorrect")
    timestampSupported = WindowReadbackTestFixture.TimestampSupported(opened)
    beforeCounters = WindowReadbackTestFixture.DiagnosticCounters(opened)
    managedRetainedStart = PerformanceManagedRetained()
    managedHeapStart = PerformanceManagedLive()
    workingSetStart = PerformanceProcessWorkingSet(process)
    privateMemoryStart = PerformanceProcessPrivateMemory(process)
    managedHeapPeak = managedHeapStart
    workingSetPeak = workingSetStart
    privateMemoryPeak = privateMemoryStart
    allocatorPeak = beforeCounters.allocatorBytes
    vulkanPeak = beforeCounters.vulkanDeviceMemoryBytes
    cachePeak = beforeCounters.cacheBytes
    imagePeak = beforeCounters.imageResidentBytes
    textPeak = beforeCounters.textAtlasResidentBytes
    let measuredBuildStart = root.LeafBuildCount()
    let measuredMutationStart = root.MutationCount
    process.Refresh()
    let processorTicksStart = process.TotalProcessorTime.Ticks
    let measuredLoopStart = Stopwatch.GetTimestamp()
    timestamps.Start()
    var sampleIndex int32 = 0
    while sampleIndex < samples {
      WindowReadbackTestFixture.PumpNativeEvents()
      let countersBefore = WindowReadbackTestFixture.DiagnosticCounters(opened)
      let allocatedBefore = GC.GetAllocatedBytesForCurrentThread()
      let start = Stopwatch.GetTimestamp()
      root.Advance(2 + warmup + sampleIndex)
      WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
      WindowReadbackTestFixture.DrainWindowQueue(opened, 2000)
      let end = Stopwatch.GetTimestamp()
      let allocatedAfter = GC.GetAllocatedBytesForCurrentThread()
      let counters = WindowReadbackTestFixture.DiagnosticCounters(opened)
      Require(counters.submitCount == countersBefore.submitCount + 1uL,
        "All Blob measured frame did not submit exactly once")
      Require(counters.presentCount == countersBefore.presentCount + 1uL,
        "All Blob measured frame did not present exactly once")
      frameNs[sampleIndex] = TicksToNanoseconds(end - start)
      frameAllocations[sampleIndex] = allocatedAfter - allocatedBefore
      expectedFrames[sampleIndex] = WindowReadbackTestFixture.DiagnosticFrameId(opened)
      if sampleIndex > 0 {
        Require(expectedFrames[sampleIndex] > expectedFrames[sampleIndex - 1],
          "All Blob measured frame ids are not strictly ordered")
      }
      let primitive = WindowReadbackTestFixture.PrimitiveFrameRetention(opened)
      if primitive.SlotIndex == 0 { sawSlot0 = true }
      if primitive.SlotIndex == 1 { sawSlot1 = true }
      endCounters = counters
      if (sampleIndex & 31) == 31 || sampleIndex + 1 == samples {
        AllBlobSampleMemory(process, opened, ref managedHeapPeak, ref workingSetPeak,
          ref privateMemoryPeak, ref allocatorPeak, ref vulkanPeak, ref cachePeak,
          ref imagePeak, ref textPeak)
      }
      sampleIndex = sampleIndex + 1
    }
    measuredLeafBuildCount = root.LeafBuildCount() - measuredBuildStart
    measuredMutationCount = root.MutationCount - measuredMutationStart
    measuredLoopWallNanoseconds = TicksToNanoseconds(
      Stopwatch.GetTimestamp() - measuredLoopStart)
    process.Refresh()
    processCpuNanoseconds = (process.TotalProcessorTime.Ticks - processorTicksStart) * 100L
    Require(measuredLeafBuildCount == AllBlobMutationExpected(mode, samples)
        && measuredMutationCount == AllBlobMutationExpected(mode, samples),
      "All Blob measured build or mutation count is incorrect")
    var resolveIndex int32 = 0
    while resolveIndex < 8 {
      WindowReadbackTestFixture.PumpNativeEvents()
      WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
      resolveIndex = resolveIndex + 1
    }
    timestamps.Stop()
    WindowReadbackTestFixture.SetAllTimestampSink(opened, nil)
    managedHeapEnd = PerformanceManagedLive()
    workingSetEnd = PerformanceProcessWorkingSet(process)
    privateMemoryEnd = PerformanceProcessPrivateMemory(process)
    managedHeapPeak = AllBlobMax(managedHeapPeak, managedHeapEnd)
    workingSetPeak = AllBlobMax(workingSetPeak, workingSetEnd)
    privateMemoryPeak = AllBlobMax(privateMemoryPeak, privateMemoryEnd)
    let drainCounters = WindowReadbackTestFixture.DiagnosticCounters(opened)
    allocatorPeak = AllBlobMax(allocatorPeak, drainCounters.allocatorBytes)
    vulkanPeak = AllBlobMax(vulkanPeak, drainCounters.vulkanDeviceMemoryBytes)
    cachePeak = AllBlobMax(cachePeak, drainCounters.cacheBytes)
    imagePeak = AllBlobMax(imagePeak, drainCounters.imageResidentBytes)
    textPeak = AllBlobMax(textPeak, drainCounters.textAtlasResidentBytes)
    managedRetainedEnd = PerformanceManagedRetained()
    postGcSmaps = AllBlobLinuxSmaps()
    residentBeforeClose = WindowReadbackTestFixture.ResidentResourceBytes(opened)
    guard let target = WindowReadbackTestFixture.CaptureTarget(opened) else {
      throw InvalidOperationException("All Blob benchmark target is unavailable")
    }
    Require(root.RootBuildCount == 1L,
      "All Blob benchmark rebuilt the parent cell")
    Require(sawSlot0 && sawSlot1,
      "All Blob benchmark did not exercise both frame slots")
    Require(!timestamps.Overflow && timestamps.DroppedScopeCount == 0,
      "All Blob timestamp capture overflowed or dropped a scope")
    opened.RequestClose()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    closed = !opened.IsOpen
    cleanupBytes = WindowReadbackTestFixture.TargetResidentResourceBytes(target)
    cleanupCounters = WindowReadbackTestFixture.TargetDiagnosticCounters(target)
    Require(closed && cleanupBytes == 0uL
        && cleanupCounters.allocatorBytes == 0uL
        && cleanupCounters.vulkanDeviceMemoryBytes == 0uL
        && cleanupCounters.vulkanObjectCount == 0uL,
      "All Blob benchmark did not close cleanly")
  } finally {
    timestamps.Stop()
    try {
      if let active = window {
        WindowReadbackTestFixture.SetAllTimestampSink(active, nil)
        if active.IsOpen {
          active.RequestClose()
          WindowReadbackTestFixture.ForceRender(active, 0.0)
        }
      }
    } finally {
      root.DisposeOwnedResources()
    }
  }
  let uploadCount = timestamps.Resolve(0, expectedFrames, uploadNs)
  let mainCount = timestamps.Resolve(1, expectedFrames, mainNs)
  let effectsCount = timestamps.Resolve(2, expectedFrames, effectsNs)
  let offscreenCount = timestamps.Resolve(3, expectedFrames, offscreenNs)
  if timestampSupported {
    Require(mainCount == samples,
      "All Blob benchmark did not resolve every main GPU sample")
  }
  let uploadGpu = PerformanceGpuStats(uploadNs, uploadCount)
  let mainGpu = PerformanceGpuStats(mainNs, mainCount)
  let effectsGpu = PerformanceGpuStats(effectsNs, effectsCount)
  let offscreenGpu = PerformanceGpuStats(offscreenNs, offscreenCount)
  var allocationTotal int64 = 0L
  var index int32 = 0
  while index < samples {
    allocationTotal = allocationTotal + frameAllocations[index]
    index = index + 1
  }
  let expectedGpu = timestampSupported ? samples : 0
  Console.WriteLine("all-blob-benchmark: kind=" + kind + " mode=" + mode
    +" count=" + AllBlobRoot.Count.ToString() + " warmup=" + warmup.ToString()
    +" samples=" + samples.ToString() + " frame_samples=" + samples.ToString()
    +" cold_observations=2"
    +" cold_cpu_0_ns=" + coldFrameNs[0].ToString()
    +" cold_cpu_1_ns=" + coldFrameNs[1].ToString()
    +" cold_cpu_min_ns=" + Math.Min(coldFrameNs[0], coldFrameNs[1]).ToString()
    +" cold_cpu_max_ns=" + Math.Max(coldFrameNs[0], coldFrameNs[1]).ToString()
    +" cold_managed_alloc_0_B=" + coldFrameAllocations[0].ToString()
    +" cold_managed_alloc_1_B=" + coldFrameAllocations[1].ToString()
    +" cold_managed_alloc_min_B="
    +Math.Min(coldFrameAllocations[0], coldFrameAllocations[1]).ToString()
    +" cold_managed_alloc_max_B="
    +Math.Max(coldFrameAllocations[0], coldFrameAllocations[1]).ToString()
    +" cold_leaf_build_count=" + coldLeafBuildCount.ToString()
    +" cold_mutation_count=" + coldMutationCount.ToString()
    +" root_build_count=" + root.RootBuildCount.ToString()
    +" initial_leaf_build_count=" + initialLeafBuildCount.ToString()
    +" warm_leaf_build_count=" + warmLeafBuildCount.ToString()
    +" measured_leaf_build_count=" + measuredLeafBuildCount.ToString()
    +" warm_mutation_count=" + warmMutationCount.ToString()
    +" measured_mutation_count=" + measuredMutationCount.ToString()
    +" cpu_p50_ns=" + PerformancePercentileCount(frameNs, samples, 0.50).ToString()
    +" cpu_p95_ns=" + PerformancePercentileCount(frameNs, samples, 0.95).ToString()
    +" cpu_p99_ns=" + PerformancePercentileCount(frameNs, samples, 0.99).ToString()
    +" cpu_max_ns=" + PerformanceMaxCount(frameNs, samples).ToString()
    +" cpu_scope=host-frame-wall"
    +" measured_loop_wall_ns=" + measuredLoopWallNanoseconds.ToString()
    +" process_cpu_ns=" + processCpuNanoseconds.ToString()
    +" managed_alloc_p50_B=" + PerformancePercentileCount(frameAllocations, samples, 0.50).ToString()
    +" managed_alloc_p95_B=" + PerformancePercentileCount(frameAllocations, samples, 0.95).ToString()
    +" managed_alloc_p99_B=" + PerformancePercentileCount(frameAllocations, samples, 0.99).ToString()
    +" managed_alloc_total_B=" + allocationTotal.ToString()
    +" alloc_B_frame=" + (allocationTotal / int64(samples)).ToString()
    +" working_set_start_B=" + workingSetStart.ToString()
    +" working_set_end_B=" + workingSetEnd.ToString()
    +" working_set_peak_B=" + workingSetPeak.ToString()
    +" private_memory_start_B=" + privateMemoryStart.ToString()
    +" private_memory_end_B=" + privateMemoryEnd.ToString()
    +" private_memory_peak_B=" + privateMemoryPeak.ToString()
    +" managed_heap_start_B=" + managedHeapStart.ToString()
    +" managed_heap_end_B=" + managedHeapEnd.ToString()
    +" managed_heap_peak_B=" + managedHeapPeak.ToString()
    +" managed_retained_post_gc_B=" + managedRetainedEnd.ToString()
    +" managed_retained_peak_B=" + AllBlobMax(managedRetainedStart, managedRetainedEnd).ToString()
    +" post_gc_managed_retained_B=" + managedRetainedEnd.ToString()
    +" post_gc_linux_rss_B=" + postGcSmaps.RssBytes.ToString()
    +" post_gc_linux_pss_B=" + postGcSmaps.PssBytes.ToString()
    +" post_gc_linux_smaps_available=" + (postGcSmaps.Available ? "1" : "0")
    +" post_gc_managed_source=GC.GetTotalMemory(true)"
    +" post_gc_linux_source=/proc/self/smaps_rollup"
    +" goo_allocator_start_B=" + beforeCounters.allocatorBytes.ToString()
    +" goo_allocator_end_B=" + endCounters.allocatorBytes.ToString()
    +" goo_allocator_peak_B=" + allocatorPeak.ToString()
    +" vk_allocated_start_B=" + beforeCounters.vulkanDeviceMemoryBytes.ToString()
    +" vk_allocated_end_B=" + endCounters.vulkanDeviceMemoryBytes.ToString()
    +" vk_allocated_peak_B=" + vulkanPeak.ToString()
    +" readback_pool_resident_before_close_B=" + residentBeforeClose.ToString()
    +" cache_start_B=" + beforeCounters.cacheBytes.ToString()
    +" cache_end_B=" + endCounters.cacheBytes.ToString()
    +" cache_peak_B=" + cachePeak.ToString()
    +" image_resident_start_B=" + beforeCounters.imageResidentBytes.ToString()
    +" image_resident_end_B=" + endCounters.imageResidentBytes.ToString()
    +" image_resident_peak_B=" + imagePeak.ToString()
    +" text_resident_start_B=" + beforeCounters.textAtlasResidentBytes.ToString()
    +" text_resident_end_B=" + endCounters.textAtlasResidentBytes.ToString()
    +" text_resident_peak_B=" + textPeak.ToString()
    +" gpu_supported=" + (timestampSupported ? "1" : "0")
    +" gpu_scope=main-pass gpu_excludes_present=1 gpu_main_may_include_effects=1"
    +" gpu_main_may_include_offscreen=1 gpu_stage_totals_comparable=0"
    +" gpu_main_samples=" + mainGpu.Count.ToString()
    +" gpu_main_p50_ns=" + mainGpu.P50.ToString()
    +" gpu_main_p99_ns=" + mainGpu.P99.ToString()
    +" gpu_main_dropped_samples=" + (expectedGpu - mainCount).ToString()
    +" gpu_upload_samples=" + uploadGpu.Count.ToString()
    +" gpu_upload_p50_ns=" + uploadGpu.P50.ToString()
    +" gpu_upload_p99_ns=" + uploadGpu.P99.ToString()
    +" gpu_effects_samples=" + effectsGpu.Count.ToString()
    +" gpu_effects_p50_ns=" + effectsGpu.P50.ToString()
    +" gpu_effects_p99_ns=" + effectsGpu.P99.ToString()
    +" gpu_offscreen_samples=" + offscreenGpu.Count.ToString()
    +" gpu_offscreen_p50_ns=" + offscreenGpu.P50.ToString()
    +" gpu_offscreen_p99_ns=" + offscreenGpu.P99.ToString()
    +" gpu_dropped_scope_count=" + timestamps.DroppedScopeCount.ToString()
    +" submit_delta=" + PerformanceDelta(endCounters.submitCount,
      beforeCounters.submitCount).ToString()
    +" present_delta=" + PerformanceDelta(endCounters.presentCount,
      beforeCounters.presentCount).ToString()
    +" slot0=" + (sawSlot0 ? "1" : "0")
    +" slot1=" + (sawSlot1 ? "1" : "0")
    +" both_slots=" + (sawSlot0 && sawSlot1 ? "1" : "0")
    +" close=" + (closed ? "1" : "0")
    +" readback_pool_cleanup_B=" + cleanupBytes.ToString()
    +" cleanup_allocator_B=" + cleanupCounters.allocatorBytes.ToString()
    +" cleanup_vk_allocated_B=" + cleanupCounters.vulkanDeviceMemoryBytes.ToString()
    +" cleanup_vulkan_objects=" + cleanupCounters.vulkanObjectCount.ToString()
    +" button_text_child=0")
}
