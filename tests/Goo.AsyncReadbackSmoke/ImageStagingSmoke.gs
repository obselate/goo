package GooAsyncReadbackSmoke

import System
import System.IO
import Goo

class ImageStagingProvider : ImageSourceProvider {
  private var source ImageSource
  private var version uint64
  private var disposed bool

  init(initial ImageSource) {
    source = initial
    version = 1uL
  }

  public prop ContentVersion uint64{ get -> version }
  public event ContentChanged Action

  public func Acquire() ImageSourceLease -> source.Acquire()

  internal func Replace(next ImageSource) {
    if disposed {
      next.Dispose()
      throw ObjectDisposedException("ImageStagingProvider")
    }
    if version == UInt64.MaxValue {
      next.Dispose()
      throw InvalidOperationException("Image staging provider version overflow")
    }
    let prior = source
    source = next
    version = version + 1uL
    try {
      let changed = ContentChanged
      changed?.Invoke()
    } finally {
      prior.Dispose()
    }
  }

  internal func DisposeSource() {
    if disposed {
      return
    }
    disposed = true
    source.Dispose()
  }
}

class ImageStagingCell : Cell {
  private let provider ImageStagingProvider

  init(sourceProvider ImageStagingProvider) {
    provider = sourceProvider
  }

  override func Build() Blob -> Container {
    Width: 96,
    Height: 96,
    BackgroundColor: Color.Rgb(12, 20, 32),
    Children: {
      Image{
        Width: 96,
        Height: 96,
        Source: provider,
        Fit: ImageFit.Fill,
      },
    },
  }
}

func ImageStagingSource(width int32, height int32, red uint8,
  green uint8, blue uint8) ImageSource{
    let pixels = [width * height * 4]uint8
    var offset int32 = 0
    while offset < pixels.Length {
      pixels[offset] = red
      pixels[offset + 1] = green
      pixels[offset + 2] = blue
      pixels[offset + 3] = uint8(255)
      offset = offset + 4
    }
    return ImageSource(width, height, pixels)
  }

func ImageStagingChunkedSource() ImageSource {
  const width int32 = 2048
  const height int32 = 2304
  const splitRow int32 = 2048
  let pixels = [width * height * 4]uint8
  var pixel int32 = 0
  while pixel < width * height {
    let offset = pixel * 4
    if pixel / width < splitRow {
      pixels[offset] = uint8(48)
      pixels[offset + 1] = uint8(96)
      pixels[offset + 2] = uint8(224)
    } else {
      pixels[offset] = uint8(240)
      pixels[offset + 1] = uint8(192)
      pixels[offset + 2] = uint8(48)
    }
    pixels[offset + 3] = uint8(255)
    pixel = pixel + 1
  }
  return ImageSource(width, height, pixels)
}

func ImageStagingSettle(window Window) {
  var frame int32 = 0
  while frame < 8 {
    WindowReadbackTestFixture.ForceRender(window, 0.0166666666666667)
    frame = frame + 1
  }
  WindowReadbackTestFixture.DrainWindowQueue(window, 10000)
  WindowReadbackTestFixture.ForceRender(window, 0.0166666666666667)
}

func ImageStagingVerify(window Window, expectedRed uint8,
  expectedGreen uint8, expectedBlue uint8) VulkanImageResourceStats{
    ImageStagingSettle(window)
    let metrics = WindowReadbackTestFixture.Metrics(window)
    let readback = PrimitiveReadback(window, metrics)
    PrimitiveRequirePixelNear(readback.Pixels, readback.Width, metrics,
      48.0, 48.0, expectedRed, expectedGreen, expectedBlue, 2,
      "image_staging_center")
    let stats = WindowReadbackTestFixture.ImageResourceStats(window)
    Require(stats.LiveCount == 1
        && stats.Upload.ActiveRanges == 0
        && stats.Upload.SubmittedRanges == 0
        && stats.Upload.UsedBytes == 0uL,
      "Image staging upload lifecycle did not settle")
    return stats
  }

func RunImageStagingSmoke() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  const initialCapacity uint64 = 65536uL
  const maximumCapacity uint64 = 16777216uL
  let provider = ImageStagingProvider(
    ImageStagingSource(4, 4, uint8(224), uint8(48), uint8(32)))
  let root = ImageStagingCell(provider)
  let capturedError = StringWriter()
  let originalError = Console.Error
  var window Window? = nil
  try {
    let opened = Window{
      Title: "Goo image staging growth gate",
      Width: 96,
      Height: 96,
      VSync: false,
      Root: root,
    }
    window = opened
    Console.SetError(capturedError)
    opened.Open()
    let tiny = ImageStagingVerify(opened,
      uint8(224), uint8(48), uint8(32))
    Require(tiny.Upload.Capacity == initialCapacity,
      "Tiny image did not retain the initial staging capacity")

    provider.Replace(ImageStagingSource(640, 360,
      uint8(32), uint8(208), uint8(72)))
    let medium = ImageStagingVerify(opened,
      uint8(32), uint8(208), uint8(72))
    Require(medium.Upload.Capacity >= 921600uL
        && medium.Upload.Capacity > tiny.Upload.Capacity
        && medium.Upload.Capacity <= maximumCapacity,
      "Medium image did not grow staging capacity to demand")

    provider.Replace(ImageStagingChunkedSource())
    WindowReadbackTestFixture.ForceRenderNonblocking(opened, 0.0166666666666667)
    WindowReadbackTestFixture.DrainWindowQueue(opened, 10000)
    let pending = WindowReadbackTestFixture.ImageResourceStats(opened)
    Require(pending.Upload.Capacity == maximumCapacity
        && pending.Upload.ActiveRanges > 0,
      "Large image did not retain an incomplete first upload chunk")
    let metrics = WindowReadbackTestFixture.Metrics(opened)
    let staged = WindowReadbackTestFixture.Request(opened,
      uint32(metrics.FramebufferWidth), uint32(metrics.FramebufferHeight))
    Require(staged == WindowReadbackRequestStatus.NotReady,
      "Image staging unpublished frame was not staged: " + staged.ToString())
    WindowReadbackTestFixture.DrainWindowQueue(opened, 10000)
    let accepted = WindowReadbackTestFixture.Request(opened,
      uint32(metrics.FramebufferWidth), uint32(metrics.FramebufferHeight))
    Require(accepted == WindowReadbackRequestStatus.Accepted,
      "Image staging unpublished readback was not accepted: " + accepted.ToString())
    ReadbackAwaitReadbackReady(opened, 10000)
    let early = ReadbackTakeReadback(opened)
    PrimitiveValidateResult(early, metrics)
    PrimitiveRequirePixelNear(early.Pixels, early.Width, metrics,
      48.0, 48.0, uint8(32), uint8(208), uint8(72), 2,
      "image_staging_unpublished")
    let large = ImageStagingVerify(opened,
      uint8(48), uint8(96), uint8(224))
    Require(large.Upload.Capacity == maximumCapacity
        && large.Upload.Capacity >= medium.Upload.Capacity,
      "Large image did not use the bounded staging capacity")
    let finalReadback = PrimitiveReadback(opened, metrics)
    PrimitiveRequirePixelNear(finalReadback.Pixels, finalReadback.Width, metrics,
      48.0, 92.0, uint8(240), uint8(192), uint8(48), 3,
      "image_staging_final_chunk")

    opened.RequestClose()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    Require(!opened.IsOpen, "Image staging gate window did not close")
    Require(WindowReadbackTestFixture.ResidentResourceBytes(opened) == 0uL,
      "Image staging gate resources remain resident after close")
  } finally {
    Console.SetError(originalError)
    if let active = window {
      if active.IsOpen {
        active.RequestClose()
        WindowReadbackTestFixture.ForceRender(active, 0.0)
      }
    }
    provider.DisposeSource()
  }
  let diagnostics = capturedError.ToString()
  ReadbackValidateCommonDiagnostics(diagnostics)
  Require(!diagnostics.Contains("\"event\":325")
      && !diagnostics.Contains("\"event\":326"),
    "Image staging gate emitted unsupported-scene diagnostics")
  Console.WriteLine("image-staging-smoke: tiny=65536 medium=grown large=16777216 chunks=2 unpublished=1 pixels=5 close=1")
}
