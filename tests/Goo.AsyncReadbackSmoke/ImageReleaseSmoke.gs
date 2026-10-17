package GooAsyncReadbackSmoke

import Goo
import System
import System.Diagnostics
import System.IO
import System.Threading

class ImageReleaseCell : Cell {
  private var source ImageSource?

  func Show(next ImageSource?) {
    source = next
    Rebuild()
  }

  override func Build() Blob {
    guard let shown = source else {
      return Container() {.Width: 96,.Height: 96,.BackgroundColor: Color.Rgb(12, 20, 32) }
    }
    return Container() {.Width: 96,.Height: 96,.BackgroundColor: Color.Rgb(12, 20, 32),
      Image{
        Width: 96,
        Height: 96,
        Source: shown,
        Fit: ImageFit.Fill,
      },
    }
  }
}

func ImageReleasePumpUntilEmpty(window Window) VulkanImageResourceStats {
  let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 5L
  var stats = WindowReadbackTestFixture.ImageResourceStats(window)
  while stats.LiveCount != 0 && Stopwatch.GetTimestamp() < deadline {
    WindowReadbackTestFixture.Pump(window, 0.0166666666666667)
    Thread.Sleep(1)
    stats = WindowReadbackTestFixture.ImageResourceStats(window)
  }
  return stats
}

func RunImageReleaseSmoke() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let root = ImageReleaseCell()
  let first = ImageStagingSource(64, 64, uint8(224), uint8(48), uint8(32))
  let second = ImageStagingSource(64, 64, uint8(32), uint8(208), uint8(72))
  let capturedError = StringWriter()
  let originalError = Console.Error
  var window Window? = nil
  try {
    let opened = Window{
      Title: "Goo image release gate",
      Width: 96,
      Height: 96,
      VSync: false,
      Root: root,
    }
    window = opened
    Console.SetError(capturedError)
    opened.Open()
    root.Show(first)
    ImageStagingVerify(opened, uint8(224), uint8(48), uint8(32))

    root.Show(nil)
    ImageStagingSettle(opened)
    Require(WindowReadbackTestFixture.ImageResourceStats(opened).LiveCount == 1,
      "An image source that is not disposed lost its texture")
    first.Dispose()
    let idle = ImageReleasePumpUntilEmpty(opened)
    Require(idle.LiveCount == 0 && idle.ResidentBytes == 0uL,
      "A disposed image source kept its texture while the window was idle")

    root.Show(second)
    ImageStagingVerify(opened, uint8(32), uint8(208), uint8(72))
    second.Dispose()
    let mounted = ImageStagingVerify(opened, uint8(32), uint8(208), uint8(72))
    Require(mounted.LiveCount == 1,
      "A disposed image source lost its texture while an element draws it")
    root.Show(nil)
    let unmounted = ImageReleasePumpUntilEmpty(opened)
    Require(unmounted.LiveCount == 0 && unmounted.ResidentBytes == 0uL,
      "A disposed image source kept its texture after its element was removed")

    opened.RequestClose()
    opened.Run()
    Require(!opened.IsOpen, "Image release gate window did not close")
  } finally {
    Console.SetError(originalError)
    if let active = window {
      if active.IsOpen {
        active.RequestClose()
        active.Run()
      }
    }
    first.Dispose()
    second.Dispose()
  }
  ReadbackValidateCommonDiagnostics(capturedError.ToString())
  Console.WriteLine("image-release-smoke: idle=1 mounted=1 unmounted=1")
}
