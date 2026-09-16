package GooAsyncReadbackSmoke

import Goo
import System
import System.IO
import System.Text

func WriteImage(result VulkanReadbackResult, path string) {
  using let stream = File.Create(path)
  let header = Encoding.ASCII.GetBytes("P6\n" + result.Width.ToString()
    +" " + result.Height.ToString() + "\n255\n")
  stream.Write(header, 0, header.Length)
  let pixels = result.Pixels
  let row = [int32(result.Width) * 3]uint8
  for y in 0 ... int32(result.Height) {
    for x in 0 ... int32(result.Width) {
      let source = (y * int32(result.Width) + x) * 4
      row[x * 3] = pixels[source]
      row[x * 3 + 1] = pixels[source + 1]
      row[x * 3 + 2] = pixels[source + 2]
    }
    stream.Write(row, 0, row.Length)
  }
}

class ImageFileCell : Cell {
  private var source ImageSource
  private var visible bool = true

  init(image ImageSource) { source = image }

  func Hide() { visible = false
    Rebuild() }
  func Remount(image ImageSource) { source = image
    visible = true
    Rebuild() }

  override func Build() Blob {
    var child Blob = Container{}
    if visible { child = Image{ Source: source, Width: 96, Height: 96, Fit: ImageFit.Fill } }
    return Container() {.Width: 96,.Height: 96,.BackgroundColor: Color.Rgb(0, 0, 0), child,
    }
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
      if capturePath.Length > 0 { WriteImage(frame, capturePath) }
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
  for name in []string {"local-rgb.jpg", "local-progressive.jpg", "local-cmyk.jpg", "local-transparent.gif", "local-animated.gif"} {
    RunOtherImageFile(name)
  }
}

func RunOtherImageFile(name string) {
  using let cache = ImageSourceCache()
  let path = Path.Combine(AppContext.BaseDirectory, name)
  using let first = cache.LoadAsync(path).GetAwaiter().GetResult()
  using let second = cache.LoadAsync(path).GetAwaiter().GetResult()
  let root = ImageFileCell(first)
  let window = Window{Title: "Goo " + name, Width: 96, Height: 96, VSync: false, Root: root}
  let capturedError = StringWriter()
  let originalError = Console.Error
  try {
    Console.SetError(capturedError)
    window.Open()
    ImageStagingSettle(window)
    first.Dispose()
    cache.Dispose()
    ImageStagingSettle(window)
    let metrics = WindowReadbackTestFixture.Metrics(window)
    let mounted = PrimitiveReadback(window, metrics)
    RequireOtherImagePixels(mounted, metrics, name)
    root.Hide()
    ImageStagingSettle(window)
    root.Remount(second)
    ImageStagingSettle(window)
    second.Dispose()
    let remounted = PrimitiveReadback(window, metrics)
    RequireOtherImagePixels(remounted, metrics, name)
    if let capturePath = Environment.GetEnvironmentVariable("GOO_IMAGE_FILE_CAPTURE") {
      if capturePath.Length > 0 { WriteImage(remounted, capturePath + "-" + name + ".png") }
    }
    window.RequestClose()
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    Require(!window.IsOpen && WindowReadbackTestFixture.ResidentResourceBytes(window) == 0uL,
      "Image resources remained after close: " + name)
  } finally {
    Console.SetError(originalError)
    if window.IsOpen { window.RequestClose()
      WindowReadbackTestFixture.ForceRender(window, 0.0) }
  }
  ReadbackValidateCommonDiagnostics(capturedError.ToString())
  Console.WriteLine("image-file-smoke: " + name + " pixels=verified disposed_mount=verified remount=verified close=verified")
}

func RequireOtherImagePixels(frame VulkanReadbackResult, metrics WindowMetrics, name string) {
  if name.EndsWith(".gif") {
    PrimitiveRequirePixelNear(frame.Pixels, frame.Width, metrics, 48.0, 72.0,
      uint8(30), uint8(190), uint8(90), 3, name + "_first_frame")
    PrimitiveRequirePixelNear(frame.Pixels, frame.Width, metrics, 8.0, 8.0,
      uint8(0), uint8(0), uint8(0), 3, name + "_transparency")
  } else {
    PrimitiveRequirePixelNear(frame.Pixels, frame.Width, metrics, 48.0, 48.0,
      uint8(220), uint8(60), uint8(30), 6, name + "_rgb")
  }
}
