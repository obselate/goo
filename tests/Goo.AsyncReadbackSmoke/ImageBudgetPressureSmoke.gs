package GooAsyncReadbackSmoke

import Goo
import System
import System.IO

class ImageBudgetPressureCell : Cell {
  private var sources []ImageSource

  init(imageSources []ImageSource) {
    sources = imageSources
  }

  func Show(imageSources []ImageSource) {
    sources = imageSources
    Rebuild()
  }

  override func Build() Blob {
    let root = Container{Width: 960, Height: 720, BackgroundColor: Color.Rgb(12, 20, 32)}
    var index int32 = 0
    while index < sources.Length {
      root.Add(Image{Position: PositionType.Absolute, Left: float64((index % 10) * 96), Top: float64((index / 10) * 72),
        Width: 96, Height: 72, Source: sources[index], Fit: ImageFit.Fill})
      index = index + 1
    }
    return root
  }
}

func ImageBudgetPressureSources(count int32, width int32, height int32) []ImageSource {
  let sources = [count]ImageSource
  for index in 0 ... count {
    sources[index] = ImageStagingSource(width, height, uint8(index * 2), uint8(255 - index * 2), uint8(96))
  }
  return sources
}

func ImageBudgetPressureSettle(window Window) VulkanDiagnosticCounterSnapshot {
  for round in 0 ... 8 {
    ImageStagingSettle(window)
  }
  return WindowReadbackTestFixture.DiagnosticCounters(window)
}

func ImageBudgetPressureReload(cell ImageBudgetPressureCell, window Window, sources []ImageSource) {
  cell.Show([0]ImageSource)
  ImageStagingSettle(window)
  cell.Show(sources)
}

func ImageBudgetPressureCapture(window Window) WindowCapture {
  let deadline = Environment.TickCount64 + 10000L
  var request = window.RequestCapture()
  while (request == WindowCaptureRequestStatus.NotReady || request == WindowCaptureRequestStatus.Busy)
    && Environment.TickCount64 < deadline {
      window.Pump(1.0 / 60.0)
      request = window.RequestCapture()
    }
  Require(request == WindowCaptureRequestStatus.Accepted,
    "Capture under image pressure was not accepted: " + request.ToString())
  var capture WindowCapture? = nil
  while capture == nil && Environment.TickCount64 < deadline {
    capture = window.PollCapture()
    if capture == nil {
      window.Pump(1.0 / 60.0)
    }
  }
  guard let result = capture else { throw InvalidOperationException("Capture under image pressure timed out") }
  return result
}

func RunImageBudgetPressureSmoke() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let mebibyte = 1048576L
  let sources = ImageBudgetPressureSources(100, 1024, 768)
  let pooled = ImageBudgetPressureSources(64, 256, 256)
  let capturedError = StringWriter()
  let originalError = Console.Error
  var window Window? = nil
  var summary = ""
  try {
    let cell = ImageBudgetPressureCell(pooled[0..32])
    let opened = Window{
      Title: "Goo image budget pressure gate",
      Width: 960,
      Height: 720,
      VSync: false,
      Root: cell,
    }
    window = opened
    Console.SetError(capturedError)
    opened.Open()
    guard let target = WindowReadbackTestFixture.CaptureTarget(opened) else {
      throw InvalidOperationException("Image budget pressure target is unavailable")
    }
    ImageBudgetPressureSettle(opened)
    target.SetMemoryHeadroomForTest(0L)
    let pooledStart = WindowReadbackTestFixture.DiagnosticCounters(opened)
    cell.Show(pooled[32..64])
    let pooledSwapped = ImageBudgetPressureSettle(opened)
    let pooledEnd = ImageBudgetPressureSettle(opened)
    Require(pooledEnd.memoryAllocationRetryCount > pooledStart.memoryAllocationRetryCount
        && pooledEnd.memoryEvictionCount > pooledStart.memoryEvictionCount
        && pooledEnd.memoryEvictionCount <= pooledStart.memoryEvictionCount + 32uL
        && pooledEnd.memoryPressureCount == pooledSwapped.memoryPressureCount
        && pooledEnd.imagePressureFailureCount == pooledSwapped.imagePressureFailureCount,
      "Pooled image spans were not reused through eviction: retries="
      + (pooledEnd.memoryAllocationRetryCount - pooledStart.memoryAllocationRetryCount).ToString()
      +" evictions=" + (pooledEnd.memoryEvictionCount - pooledStart.memoryEvictionCount).ToString()
      +" steadyPressure=" + (pooledEnd.memoryPressureCount - pooledSwapped.memoryPressureCount).ToString())
    target.SetMemoryHeadroomForTest(nil)
    cell.Show([0]ImageSource)
    ImageBudgetPressureSettle(opened)
    for source in pooled {
      source.Dispose()
    }
    ImageBudgetPressureSettle(opened)

    target.SetMemoryHeadroomForTest(160L * mebibyte)
    let limitedStart = WindowReadbackTestFixture.DiagnosticCounters(opened)
    cell.Show(sources)
    let limited = ImageBudgetPressureSettle(opened)
    let limitedLive = WindowReadbackTestFixture.ImageResourceStats(opened).LiveCount
    Require(opened.IsOpen && limitedLive > 0 && limitedLive < sources.Length
        && limited.imagePressureFailureCount > limitedStart.imagePressureFailureCount,
      "Limited headroom did not keep a partial resident set: live=" + limitedLive.ToString())
    let limitedSteady = ImageBudgetPressureSettle(opened)
    Require(limitedSteady.memoryAllocationRetryCount == limited.memoryAllocationRetryCount
        && limitedSteady.imagePressureFailureCount == limited.imagePressureFailureCount,
      "Refused images retried without freed memory: retries="
      + (limitedSteady.memoryAllocationRetryCount - limited.memoryAllocationRetryCount).ToString())
    let pressureCapture = ImageBudgetPressureCapture(opened)
    Require(pressureCapture.Width == uint32(WindowReadbackTestFixture.Metrics(opened).FramebufferWidth)
        && WindowReadbackTestFixture.ImageResourceStats(opened).LiveCount == limitedLive,
      "Capture under image pressure changed the resident images: live="
      + WindowReadbackTestFixture.ImageResourceStats(opened).LiveCount.ToString())

    target.SetMemoryHeadroomForTest(nil)
    ImageBudgetPressureReload(cell, opened, sources)
    let unlimitedStart = ImageBudgetPressureSettle(opened)
    let unlimited = ImageBudgetPressureSettle(opened)
    Require(WindowReadbackTestFixture.ImageResourceStats(opened).LiveCount == sources.Length
        && unlimited.imagePressureFailureCount == unlimitedStart.imagePressureFailureCount,
      "Driver budget did not keep all images resident: live="
      + WindowReadbackTestFixture.ImageResourceStats(opened).LiveCount.ToString()
      +" pressure=" + (unlimited.imagePressureFailureCount - unlimitedStart.imagePressureFailureCount).ToString()
      +" headroom=" + unlimited.heapHeadroom.ToString())

    cell.Show(sources[0..50])
    ImageBudgetPressureSettle(opened)
    target.SetMemoryHeadroomForTest(-160L * mebibyte)
    let shrunk = ImageBudgetPressureSettle(opened)
    let shrunkLive = WindowReadbackTestFixture.ImageResourceStats(opened).LiveCount
    Require(opened.IsOpen && shrunkLive >= 50 && shrunkLive < sources.Length
        && shrunk.memoryEvictionCount > unlimited.memoryEvictionCount,
      "Budget shrink did not evict unreferenced images: live=" + shrunkLive.ToString())

    target.SetMemoryHeadroomForTest(nil)
    target.FailMemoryAllocationsForTest(1)
    ImageBudgetPressureReload(cell, opened, sources)
    let retried = ImageBudgetPressureSettle(opened)
    Require(WindowReadbackTestFixture.ImageResourceStats(opened).LiveCount == sources.Length
        && retried.memoryAllocationRetryCount > shrunk.memoryAllocationRetryCount
        && retried.memoryPressureCount == shrunk.memoryPressureCount,
      "One allocation failure was not recovered by eviction and retry")

    cell.Show(sources[0..50])
    ImageBudgetPressureSettle(opened)
    target.SetMemoryHeadroomForTest(-160L * mebibyte)
    ImageBudgetPressureSettle(opened)
    target.SetMemoryHeadroomForTest(nil)
    let failedStart = WindowReadbackTestFixture.DiagnosticCounters(opened)
    target.FailMemoryAllocationsForTest(2)
    ImageBudgetPressureReload(cell, opened, sources)
    ImageBudgetPressureSettle(opened)
    ImageBudgetPressureReload(cell, opened, sources)
    let failed = ImageBudgetPressureSettle(opened)
    Require(opened.IsOpen && WindowReadbackTestFixture.ImageResourceStats(opened).LiveCount == sources.Length
        && failed.memoryPressureCount > failedStart.memoryPressureCount,
      "Two allocation failures did not degrade to a pressure event and recover")
    summary = "image-budget-pressure-smoke: limited_live=" + limitedLive.ToString()
      +" shrunk_live=" + shrunkLive.ToString()
      +" evictions=" + failed.memoryEvictionCount.ToString()
      +" retries=" + failed.memoryAllocationRetryCount.ToString()
      +" pressure=" + failed.memoryPressureCount.ToString()
    opened.RequestClose()
    opened.Run()
    Require(!opened.IsOpen, "Image budget pressure gate window did not close")
  } finally {
    Console.SetError(originalError)
    if let active = window {
      if active.IsOpen {
        active.RequestClose()
        active.Run()
      }
    }
    for source in sources {
      source.Dispose()
    }
  }
  ReadbackValidateCommonDiagnostics(capturedError.ToString())
  Console.WriteLine(summary)
}
