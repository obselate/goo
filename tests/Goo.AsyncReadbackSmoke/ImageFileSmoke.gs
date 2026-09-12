package GooAsyncReadbackSmoke

import System
import System.IO
import Goo

class ImageFileCell : Cell {
  private let source ImageSource

  init(image ImageSource) { source = image }

  override func Build() Blob -> Container {
    Width: 96, Height: 96, BackgroundColor: Color.Rgb(0, 0, 0),
    Children: { Image{ Source: source, Width: 96, Height: 96, Fit: ImageFit.Fill } },
  }
}

func RunImageFileSmoke() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1", "Vulkan diagnostics are required")
  using let cache = ImageSourceCache()
  using let source = cache.LoadAsync(Path.Combine(AppContext.BaseDirectory, "local-rgba.png")).GetAwaiter().GetResult()
  let window = Window{ Title: "Goo local PNG gate", Width: 96, Height: 96, VSync: false, Root: ImageFileCell(source) }
  let capturedError = StringWriter()
  let originalError = Console.Error
  try {
    Console.SetError(capturedError)
    window.Open()
    ImageStagingSettle(window)
    source.Dispose()
    cache.Dispose()
    ImageStagingSettle(window)
    let metrics = WindowReadbackTestFixture.Metrics(window)
    let frame = PrimitiveReadback(window, metrics)
    if let capturePath = Environment.GetEnvironmentVariable("GOO_IMAGE_FILE_CAPTURE") {
      if capturePath.Length > 0 { VectorQualityWriteImage(frame, capturePath) }
    }
    PrimitiveRequirePixelNear(frame.Pixels, frame.Width, metrics, 12.0, 12.0,
      uint8(224), uint8(48), uint8(32), 3, "local_png_red")
    // Expected sRGB after the renderer blends half-alpha green over black in linear light.
    PrimitiveRequirePixelNear(frame.Pixels, frame.Width, metrics, 84.0, 12.0,
      uint8(21), uint8(152), uint8(51), 3, "local_png_linear_alpha")
    PrimitiveRequirePixelNear(frame.Pixels, frame.Width, metrics, 12.0, 84.0,
      uint8(48), uint8(96), uint8(224), 3, "local_png_blue")
    PrimitiveRequirePixelNear(frame.Pixels, frame.Width, metrics, 84.0, 84.0,
      uint8(240), uint8(192), uint8(48), 3, "local_png_yellow")
    window.RequestClose()
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    Require(!window.IsOpen && WindowReadbackTestFixture.ResidentResourceBytes(window) == 0uL,
      "Local PNG resources remained after close")
  } finally {
    Console.SetError(originalError)
    if window.IsOpen {
      window.RequestClose()
      WindowReadbackTestFixture.ForceRender(window, 0.0)
    }
  }
  ReadbackValidateCommonDiagnostics(capturedError.ToString())
  Console.WriteLine("image-file-smoke: png_pixels=4 alpha=verified cache_disposed=1 source_disposed=1 close=1")
}
