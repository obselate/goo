package GooAsyncReadbackSmoke

import Goo
import System
import System.IO

class GpuExperimentCell : Cell {
  private let image ImageSource
  private let clip VectorPath = PathBuilder().MoveTo(0.5, 0.0).LineTo(1.0, 0.5)
    .LineTo(0.5, 1.0).LineTo(0.0, 0.5).Close().Build()

  init(source ImageSource) { image = source }

  override func Build() Blob -> Container() {
    .Width: Percent(100), .Height: Percent(100), .BackgroundColor: Color.Black,
    Text{
      Position: PositionType.Absolute, Left: 8, Top: 8, Width: 80, Height: 32,
      Content: "GPU", FontFamily: "ReadbackGateFont", FontSize: 24, Color: Color.White,
    },
    Image{
      Position: PositionType.Absolute, Left: 104, Top: 8, Width: 32, Height: 32,
      Source: image, Fit: ImageFit.Fill,
    },
    Container{
      Position: PositionType.Absolute, Left: 164, Top: 8, Width: 24, Height: 24,
      BackgroundColor: Color.Rgb(255, 0, 0),
      BoxShadow: BoxShadow{Color: Color.White, OffsetX: 24},
    },
    Container{
      Position: PositionType.Absolute, Left: 8, Top: 64, Width: 40, Height: 40,
      BackgroundColor: Color.Rgb(0, 0, 255), ClipPath: clip, ClipPathFit: ShapeFit.Fill,
    },
    Container() {
      .Position: PositionType.Absolute, .Left: 80, .Top: 64, .Width: 40, .Height: 40, .Opacity: 0.5,
      Container{Width: 40, Height: 40, BackgroundColor: Color.Rgb(255, 0, 0)},
      Container{
        Position: PositionType.Absolute, Left: 8, Top: 8, Width: 24, Height: 24,
        BackgroundColor: Color.Rgb(0, 255, 0),
      },
    },
  }
}

func RunGpuExperimentSmoke() {
  let expected = Environment.GetEnvironmentVariable("GOO_GPU_EXPERIMENT_EXPECTED") ?? "none"
  let fontPath = Path.Combine(AppContext.BaseDirectory, "VendSans-VariableFont_wght.ttf")
  let font = FontSource("ReadbackGateFont", 400, false, File.ReadAllBytes(fontPath))
  font.Register()
  using let image = ImageSource(1, 1, []uint8{0, 255, 0, 255})
  let window = Window{
    Title: "Goo GPU experiment gate", Width: 240, Height: 120, FramePacing: WindowFramePacing.Uncapped,
    Root: GpuExperimentCell(image), Background: Color.Black,
  }
  let errors = StringWriter()
  let originalError = Console.Error
  Console.SetError(errors)
  try {
    window.Open()
    for index in 0 ... 4 { WindowReadbackTestFixture.ForceRender(window, 0.0, 10.0) }
    let metrics = WindowReadbackTestFixture.Metrics(window)
    let frame = PrimitiveReadback(window, metrics)
    PrimitiveRequirePixelNear(frame.Pixels, frame.Width, metrics, 120.0, 24.0,
      uint8(0), uint8(expected == "no-images" ? 0 : 255), uint8(0), 4, "image suppression")
    let shadow = uint8(expected == "no-shadows" ? 0 : 255)
    PrimitiveRequirePixelNear(frame.Pixels, frame.Width, metrics, 200.0, 20.0,
      shadow, shadow, shadow, 4, "shadow suppression")
    PrimitiveRequirePixelNear(frame.Pixels, frame.Width, metrics, 28.0, 84.0,
      uint8(0), uint8(0), uint8(expected == "clip-clear-only" ? 0 : 255), 4, "clip generation")
    PrimitiveRequirePixelNear(frame.Pixels, frame.Width, metrics, 10.0, 66.0,
      uint8(0), uint8(0), uint8(expected == "no-clip-sampling" ? 255 : 0), 4, "clip sampling")
    PrimitiveRequirePixelNear(frame.Pixels, frame.Width, metrics, 100.0, 84.0,
      uint8(0), uint8(expected == "no-layers" ? 0 : 128), uint8(0), 4, "layer suppression")
    var textPixels int32 = 0
    for y in 8 ... 40 {
      for x in 8 ... 88 {
        let pixel = PrimitiveLogicalPixel(frame.Pixels, frame.Width, metrics, float64(x), float64(y))
        if pixel[0] > uint8(128) && pixel[1] > uint8(128) { textPixels++ }
      }
    }
    Require(expected == "no-text" ? textPixels == 0 : textPixels > 3, "text suppression differs")
    if let path = Environment.GetEnvironmentVariable("GOO_GPU_EXPERIMENT_CAPTURE") {
      File.WriteAllBytes(path, frame.Pixels)
    }
    window.RequestClose()
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    Require(!window.IsOpen && WindowReadbackTestFixture.ResidentResourceBytes(window) == 0uL,
      "GPU experiment resources remain after close")
  } finally {
    if window.IsOpen { window.Close() }
    Console.SetError(originalError)
  }
  ReadbackValidateCommonDiagnostics(errors.ToString())
  Console.WriteLine("gpu-experiment: mode=" + expected + " pixels=passed cleanup=passed")
}
