package GooAsyncReadbackSmoke

import Goo
import Goo.Svg
import System
import System.IO
import System.Numerics

class FragmentCorrectnessCell : Cell {
  private let crtEffect ShaderEffect
  internal var PixelOffset float64
  internal var IconSize float64 = 24
  private let outline VectorPath = Svg.Parse("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 -960 960 960'><path d='M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm280-80h280v-560H480v560Z'/></svg>").PathForNode(1)

  init(effect ShaderEffect) {
    crtEffect = effect
  }

  override func Build() Blob -> Container() {.Width: Percent(100),.Height: Percent(100),.Position: PositionType.Relative,.BackgroundColor: Color.Transparent,
    Shape{
      Position: PositionType.Absolute, Left: 16, Top: 16, Width: IconSize, Height: IconSize,
      Path: outline, BackgroundColor: Color.White,
      Transform: PanelTransform{TranslateX: PixelOffset, TranslateY: IconSize + PixelOffset},
    },
    Container() {.Position: PositionType.Absolute,.Left: 160,.Top: 16,.Width: 640,.Height: 96,.BackgroundColor: Color.Transparent,.ShaderEffect: crtEffect,
      Container{
            Position: PositionType.Absolute,
            Left: 0,
            Top: 0,
            Width: 320,
            Height: 96,
            BackgroundColor: Color.Rgb(8, 32, 248),
      },
    },
  }
}

func RunFragmentCorrectnessSmoke() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let shaderPath = Path.Combine(AppContext.BaseDirectory, "crt.frag.goo-effect")
  Require(File.Exists(shaderPath), "CRT effect asset is missing")
  let crtEffect = ShaderEffect(ShaderEffectProgram.Load(shaderPath), false)
  crtEffect.SetParameter(2, Vector4(1.0F, 0.0F, 1.0F, 0.0F))
  let capturedError = StringWriter()
  let originalError = Console.Error
  var window Window? = nil
  try {
    let cell = FragmentCorrectnessCell(crtEffect)
    let opened = Window{
      Title: "Goo fragment correctness gate",
      Width: 816,
      Height: 128,
      VSync: false,
      Root: cell,
      Background: Color.Transparent,
    }
    window = opened
    Console.SetError(capturedError)
    opened.Open()
    WindowReadbackTestFixture.ForceRender(opened, 0.0, 10.0)
    WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667, 10.0)
    let metrics = WindowReadbackTestFixture.Metrics(opened)
    let scale = float64(metrics.FramebufferWidth) / float64(metrics.LogicalWidth)
    cell.PixelOffset = 0.5 / scale
    cell.IconSize = 24.0 / scale
    cell.Rebuild()
    WindowReadbackTestFixture.ForceRender(opened, 0.0, 10.0)
    var accepted = WindowReadbackTestFixture.Request(opened,
      uint32(metrics.FramebufferWidth), uint32(metrics.FramebufferHeight))
    if accepted == WindowReadbackRequestStatus.NotReady {
      WindowReadbackTestFixture.DrainWindowQueue(opened, 10000)
      accepted = WindowReadbackTestFixture.Request(opened,
        uint32(metrics.FramebufferWidth), uint32(metrics.FramebufferHeight))
    }
    Require(accepted == WindowReadbackRequestStatus.Accepted,
      "Fragment correctness readback was not accepted: " + accepted.ToString())
    ReadbackAwaitReadbackReady(opened, 10000)
    let frame = ReadbackTakeReadback(opened)
    PrimitiveValidateResult(frame, metrics)
    for point in []Point{
      Point{X: 3, Y: 19}, Point{X: 3, Y: 5}, Point{X: 21, Y: 19}, Point{X: 21, Y: 5},
      Point{X: 5, Y: 3}, Point{X: 19, Y: 3}, Point{X: 5, Y: 21}, Point{X: 19, Y: 21},
    } {
      let join = PrimitiveLogicalPixel(frame.Pixels, frame.Width, metrics,
        16.0 + cell.PixelOffset + point.X / scale, 16.0 + cell.PixelOffset + point.Y / scale)
      Require(join[3] >= uint8(96), "Path contour join has missing coverage at "
        + point.X.ToString() + "/" + point.Y.ToString() + ": " + PrimitivePixelText(join))
    }
    let crtOpaque = PrimitiveLogicalPixel(frame.Pixels, frame.Width, metrics, 476.0, 64.0)
    Require(crtOpaque[2] >= uint8(240) && crtOpaque[3] == uint8(255),
      "CRT opaque source output is invalid: " + PrimitivePixelText(crtOpaque))
    var crtCoverageFound = false
    for x in 480 ... 482 {
      let sample = PrimitiveLogicalPixel(frame.Pixels, frame.Width, metrics, float64(x), 64.0)
      if sample[2] >= uint8(100) && sample[3] >= uint8(64) { crtCoverageFound = true }
    }
    Require(crtCoverageFound, "CRT dispersed color has no matching sampled alpha coverage")
    let crtTransparent = PrimitiveLogicalPixel(frame.Pixels, frame.Width, metrics, 488.0, 64.0)
    Require(crtTransparent[0] <= uint8(2) && crtTransparent[1] <= uint8(2)
        && crtTransparent[2] <= uint8(2) && crtTransparent[3] <= uint8(2),
      "CRT transparent margin is invalid: " + PrimitivePixelText(crtTransparent))
    var crtSamples = ""
    for x in 474 ... 490 {
      let sample = PrimitiveLogicalPixel(frame.Pixels, frame.Width, metrics, float64(x), 64.0)
      if crtSamples.Length > 0 { crtSamples += "," }
      crtSamples += x.ToString() + "=" + PrimitivePixelText(sample)
    }
    Console.WriteLine("fragment-correctness-smoke: crt=" + crtSamples)
    opened.RequestClose()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    Require(!opened.IsOpen, "Fragment correctness gate window did not close")
    Require(WindowReadbackTestFixture.ResidentResourceBytes(opened) == 0uL,
      "Fragment correctness gate resources remain resident after close")
    Console.SetError(originalError)
    ReadbackValidateCommonDiagnostics(capturedError.ToString())
    Console.WriteLine(
      "fragment-correctness-cleanup: crt=" + crtSamples + " validation=0 cleanup=1")
  } finally {
    Console.SetError(originalError)
    if let active = window {
      if active.IsOpen {
        active.RequestClose()
        WindowReadbackTestFixture.ForceRender(active, 0.0)
      }
    }
  }
}
