package GooAsyncReadbackSmoke

import Goo
import System
import System.IO

class ImageBudgetPressureCell : Cell {
  private let sources []ImageSource

  init(imageSources []ImageSource) {
    sources = imageSources
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

func RunImageBudgetPressureSmoke() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let sources = [100]ImageSource
  var index int32 = 0
  while index < sources.Length {
    sources[index] = ImageStagingSource(1024, 768, uint8(index * 2), uint8(255 - index * 2), uint8(96))
    index = index + 1
  }
  let capturedError = StringWriter()
  let originalError = Console.Error
  var window Window? = nil
  var summary = ""
  try {
    let opened = Window{
      Title: "Goo image budget pressure gate",
      Width: 960,
      Height: 720,
      VSync: false,
      Root: ImageBudgetPressureCell(sources),
    }
    window = opened
    Console.SetError(capturedError)
    opened.Open()
    var round int32 = 0
    while round < 8 {
      ImageStagingSettle(opened)
      round = round + 1
    }
    let stats = WindowReadbackTestFixture.ImageResourceStats(opened)
    let counters = WindowReadbackTestFixture.DiagnosticCounters(opened)
    Require(stats.ResidentBytes <= stats.ResidentByteBudget && stats.LiveCount > 0 && stats.LiveCount < sources.Length,
      "Image budget pressure did not keep a partial resident set: live=" + stats.LiveCount.ToString()
      +" resident=" + stats.ResidentBytes.ToString() + " budget=" + stats.ResidentByteBudget.ToString())
    Require(counters.imagePressureFailureCount > 0uL, "Image budget pressure was not reported")
    summary = "image-budget-pressure-smoke: live=" + stats.LiveCount.ToString()
      +" pressure=" + counters.imagePressureFailureCount.ToString()
      +" evictions=" + counters.imageEvictionCount.ToString()
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
