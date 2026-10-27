package GooAsyncReadbackSmoke

import Goo
import System
import System.IO
import System.Numerics
import System.Text

class RoundedOverflowCoverageCell : Cell {
  private let replacementEffect ShaderEffect

  init(effect ShaderEffect) {
    replacementEffect = effect
  }

  private func BuildWindowChrome(left float64, hover bool, nested bool) Blob -> Container() {
    .Position: PositionType.Absolute, .Left: left, .Top: 16, .Width: 96, .Height: 64,
    .BorderRadius: 10, .Overflow: Overflow.Hidden, .BackgroundColor: Color.Rgb(24, 24, 24),
    Container() {
      .Width: Percent(100), .Height: Percent(100), .BorderRadius: 10,
      .Overflow: nested ? Overflow.Hidden : Overflow.Visible,
      Container{
        Position: PositionType.Absolute, Right: 0, Top: 0, Width: 36, Height: 36,
        BackgroundColor: hover ? Color.Rgb(255, 32, 128) : Color.Transparent,
      },
      Container{
        Position: PositionType.Absolute, Left: 0, Top: 0, Right: 0, Bottom: 0,
        BorderRadius: 10, BorderWidth: 1, BorderColor: Color.Rgb(160, 160, 160), ZIndex: 30,
      },
    },
  }

  private func BuildBackdropComparison(left float64, top float64, alpha int32,
    clipped bool, replacementOnly bool = false) Blob -> Container() {
    .Position: PositionType.Absolute, .Left: left, .Top: top, .Width: 96, .Height: 80,
    Container{
      Position: PositionType.Absolute, Left: 0, Top: 0, Width: 48, Height: 80,
      BackgroundColor: Color.Rgba(220, 80, 40, alpha),
    },
    Container{
      Position: PositionType.Absolute, Left: 48, Top: 0, Width: 48, Height: 80,
      BackgroundColor: Color.Rgba(40, 160, 240, alpha),
    },
    Container() {
      .Width: Percent(100), .Height: Percent(100), .BorderRadius: 10,
      .Overflow: clipped ? Overflow.Hidden : Overflow.Visible,
      Container{
        Position: PositionType.Absolute, Left: 12, Top: 12, Width: 72, Height: 28,
        BackdropBlur: replacementOnly ? 0 : 3,
        ShaderEffect: replacementOnly ? replacementEffect : nil,
        BackgroundColor: Color.Rgba(255, 255, 255, 26),
      },
      Container{
        Position: PositionType.Absolute, Left: 0, Top: 48, Width: 96, Height: 32,
        BlendMode: replacementOnly ? BlendMode.Normal : BlendMode.Multiply,
        BackgroundColor: Color.Rgba(0, 0, 0, 26),
      },
    },
  }

  override func Build() Blob -> Container() {
    .Width: Percent(100), .Height: Percent(100),
    Container{
      Position: PositionType.Absolute, Left: 16, Top: 16, Width: 96, Height: 64,
      BorderRadius: 10, Overflow: Overflow.Hidden, BackgroundColor: Color.Rgb(160, 160, 160),
    },
    BuildWindowChrome(128, false, false),
    BuildWindowChrome(240, true, false),
    BuildWindowChrome(352, true, true),
    Container() {
      .Position: PositionType.Absolute, .Left: 464, .Top: 16, .Width: 96, .Height: 64,
      .BorderRadius: 14, .Overflow: Overflow.Hidden,
      .Transform: PanelTransform{TranslateX: 4, TranslateY: 4},
      Container() {
        .Position: PositionType.Absolute, .Left: 24, .Top: 0, .Width: 96, .Height: 64,
        .BorderRadius: 10, .Overflow: Overflow.Hidden,
        Container{Width: Percent(100), Height: Percent(100), BackgroundColor: Color.Rgb(255, 32, 128)},
        Container{
          Position: PositionType.Absolute, Left: 0, Top: 0, Right: 0, Bottom: 0,
          BorderRadius: 10, BorderWidth: 1, BorderColor: Color.Rgb(160, 160, 160), ZIndex: 30,
        },
      },
    },
    BuildBackdropComparison(16, 112, 0, false),
    BuildBackdropComparison(128, 112, 0, true),
    BuildBackdropComparison(352, 112, 128, false),
    BuildBackdropComparison(464, 112, 128, true),
    BuildBackdropComparison(16, 208, 254, false),
    BuildBackdropComparison(128, 208, 254, true),
    BuildBackdropComparison(352, 208, 255, false),
    BuildBackdropComparison(464, 208, 255, true),
    BuildBackdropComparison(240, 112, 255, false, true),
    BuildBackdropComparison(240, 208, 255, true, true),
  }
}

func RunRoundedOverflowCoverageSmoke() {
  let capturedError = StringWriter()
  let originalError = Console.Error
  let shaderPath = Path.Combine(AppContext.BaseDirectory, "control_effect.frag.goo-effect")
  Require(File.Exists(shaderPath), "Replacement effect asset is missing")
  let replacementEffect = ShaderEffect(ShaderEffectProgram(File.ReadAllBytes(shaderPath), true), false)
  replacementEffect.SetParameter(0, Vector4(1.0F, 1.0F, 1.0F, 0.0F))
  let opened = Window{
    Title: "Goo rounded overflow gate", Width: 608, Height: 304,
    VSync: false, Decorated: false, Transparent: true,
    Root: RoundedOverflowCoverageCell(replacementEffect), Background: Color.Transparent,
  }
  Console.SetError(capturedError)
  try {
    opened.Open()
    WindowReadbackTestFixture.ForceRender(opened, 0.0, 10.0)
    WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667, 10.0)
    let metrics = WindowReadbackTestFixture.Metrics(opened)
    ReadbackRequestReadbackUntilAccepted(opened,
      uint32(metrics.FramebufferWidth), uint32(metrics.FramebufferHeight))
    ReadbackAwaitReadbackReady(opened, 10000)
    let frame = ReadbackTakeReadback(opened)
    PrimitiveValidateResult(frame, metrics)
    let scale = float64(metrics.FramebufferWidth) / float64(metrics.LogicalWidth)
    let output = Environment.GetEnvironmentVariable("GOO_ROUNDED_OVERFLOW_OUTPUT") ?? ""
    if output != "" {
      let _ = Directory.CreateDirectory(output)
      let prefix = Path.Combine(output, "rounded-overflow-" + Math.Round(scale * 100.0).ToString())
      File.WriteAllBytes(prefix + ".rgba", frame.Pixels)
      let cyan = [int32(frame.Width * frame.Height) * 3]uint8
      for index in 0 ... int32(frame.Width * frame.Height) {
        let alpha = int32(frame.Pixels[index * 4 + 3])
        cyan[index * 3] = frame.Pixels[index * 4]
        cyan[index * 3 + 1] = uint8(Math.Min(255, int32(frame.Pixels[index * 4 + 1]) + 255 - alpha))
        cyan[index * 3 + 2] = uint8(Math.Min(255, int32(frame.Pixels[index * 4 + 2]) + 255 - alpha))
      }
      using let stream = File.Create(prefix + "-cyan.ppm")
      let header = Encoding.ASCII.GetBytes("P6\n" + frame.Width.ToString() + " " + frame.Height.ToString() + "\n255\n")
      stream.Write(header, 0, header.Length)
      stream.Write(cyan, 0, cyan.Length)
      Console.WriteLine("rounded-overflow-capture: path=" + prefix + " width="
        + frame.Width.ToString() + " height=" + frame.Height.ToString())
    }
    var samples = 0
    var alphaError = 0
    var colorError = 0
    let originX = int32(Math.Round(16.0 * scale))
    let originY = int32(Math.Round(16.0 * scale))
    let size = int32(Math.Round(96.0 * scale))
    let corner = int32(Math.Ceiling(12.0 * scale))
    for y in 0 ... corner {
      for x in size - corner ... size {
        let reference = PrimitivePixelIndex(frame.Width, originX + x, originY + y)
        let alpha = int32(frame.Pixels[reference + 3])
        if alpha <= 2 || alpha >= 192 { continue }
        samples += 1
        for panel in 1 ... 4 {
          let sample = PrimitivePixelIndex(frame.Width,
            originX + int32(Math.Round(float64(panel) * 112.0 * scale)) + x, originY + y)
          alphaError = Math.Max(alphaError, Math.Abs(int32(frame.Pixels[sample + 3]) - alpha))
          for channel in 0 ... 3 {
            colorError = Math.Max(colorError,
              Math.Abs(int32(frame.Pixels[sample + channel]) - int32(frame.Pixels[reference + channel])))
          }
        }
      }
    }
    Console.WriteLine("rounded-overflow-smoke: scale=" + scale.ToString() + " samples=" + samples.ToString()
      + " alpha_error=" + alphaError.ToString() + " color_error=" + colorError.ToString())
    Require(samples >= 3, "Rounded overflow gate did not sample the outer antialias edge")
    Require(alphaError <= 2, "Rounded overflow changed transparent outer coverage")
    Require(colorError <= 4, "Rounded overlay border left a color fringe at the outer edge")
    let inside = PrimitiveLogicalPixel(frame.Pixels, frame.Width, metrics, 548.0, 48.0)
    Require(inside[0] >= uint8(240) && inside[3] >= uint8(250),
      "Transformed nonmatching ancestor clip removed interior content")
    let outside = PrimitiveLogicalPixel(frame.Pixels, frame.Width, metrics, 572.0, 48.0)
    Require(outside[3] <= uint8(2), "Transformed nonmatching ancestor clip leaked content")
    let comparisonOrigins = []Point{
      Point{X: 16, Y: 112}, Point{X: 352, Y: 112},
      Point{X: 16, Y: 208}, Point{X: 352, Y: 208},
    }
    let backdropSamples = []Point{
      Point{X: 47, Y: 24}, Point{X: 48, Y: 24}, Point{X: 49, Y: 24},
      Point{X: 24, Y: 58}, Point{X: 72, Y: 58}, Point{X: 24, Y: 44},
    }
    var backdropError = 0
    for origin in comparisonOrigins {
      for point in backdropSamples {
        let reference = PrimitiveLogicalPixel(frame.Pixels, frame.Width, metrics,
          origin.X + point.X, origin.Y + point.Y)
        let clipped = PrimitiveLogicalPixel(frame.Pixels, frame.Width, metrics,
          origin.X + point.X + 112.0, origin.Y + point.Y)
        for channel in 0 ... 4 {
          backdropError = Math.Max(backdropError,
            Math.Abs(int32(reference[channel]) - int32(clipped[channel])))
        }
      }
    }
    let unblurred = PrimitiveLogicalPixel(frame.Pixels, frame.Width, metrics, 63.0, 252.0)
    let blurred = PrimitiveLogicalPixel(frame.Pixels, frame.Width, metrics, 63.0, 232.0)
    Require(unblurred[3] == uint8(254), "Near-opaque backdrop did not retain alpha 254/255")
    Require(Math.Abs(int32(unblurred[0]) - int32(blurred[0])) >= 10,
      "Backdrop comparison did not exercise blur across the color boundary")
    let unchanged = PrimitiveLogicalPixel(frame.Pixels, frame.Width, metrics, 88.0, 252.0)
    let multiplied = PrimitiveLogicalPixel(frame.Pixels, frame.Width, metrics, 88.0, 266.0)
    Require(int32(unchanged[2]) - int32(multiplied[2]) >= 4,
      "Backdrop comparison did not exercise Multiply")
    Console.WriteLine("rounded-overflow-backdrop: maximum_error=" + backdropError.ToString())
    Require(backdropError <= 3, "Rounded overflow changed blur, blend, or backdrop alpha")
    let replacementReference = PrimitiveLogicalPixel(frame.Pixels, frame.Width, metrics, 288.0, 136.0)
    let replacementClipped = PrimitiveLogicalPixel(frame.Pixels, frame.Width, metrics, 288.0, 232.0)
    Require(replacementReference[3] == uint8(26) && replacementClipped[3] == uint8(26),
      "Rounded overflow did not preserve an alpha-reducing replacement effect: "
        + PrimitivePixelText(replacementReference) + "/" + PrimitivePixelText(replacementClipped))
    for channel in 0 ... 3 {
      Require(Math.Abs(int32(replacementReference[channel]) - int32(replacementClipped[channel])) <= 3,
        "Rounded overflow changed a replacement effect color")
    }
  } finally {
    if opened.IsOpen {
      opened.RequestClose()
      WindowReadbackTestFixture.ForceRender(opened, 0.0)
    }
    Console.SetError(originalError)
  }
  Require(WindowReadbackTestFixture.ResidentResourceBytes(opened) == 0uL,
    "Rounded overflow gate resources remain resident after close")
  ReadbackValidateCommonDiagnostics(capturedError.ToString())
}
