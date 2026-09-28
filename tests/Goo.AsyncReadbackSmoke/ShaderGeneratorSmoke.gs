package GooAsyncReadbackSmoke

import Goo
import System
import System.IO
import System.Numerics

data struct GeneratorValues {
  internal var Red float32
  internal var Green float32
}

class ShaderGeneratorCell : Cell {
  private let effect ShaderEffect
  private let data ShaderEffectData
  private var published bool

  shared {
    let Target ElementHandle = ElementHandle{}
  }

  internal var ClickCount int32

  init(effect ShaderEffect, data ShaderEffectData) {
    this.effect = effect
    this.data = data
  }

  override func Build() Blob {
    if !published {
      let values = []float32{ 0.8F, 0.2F }
      data.Publish[float32](values.AsSpan())
      values[0] = 0.0F
      values[1] = 0.0F
      published = true
    }
    return Container() {
      .Width: Percent(100),
      .Height: Percent(100),
      .Position: PositionType.Relative,
      .BackgroundColor: Color.Rgb(12, 20, 32),
      Container() {
        .Position: PositionType.Absolute,
        .Left: 20,
        .Top: 20,
        .Width: 64,
        .Height: 64,
        .ShaderEffect: effect,
        Button {
          Handle: ShaderGeneratorCell.Target,
          Width: Percent(100),
          Height: Percent(100),
          BackgroundColor: Color.Rgb(20, 40, 240),
          OnClick: func() { ClickCount++ },
        },
      },
      Container() {
        .Position: PositionType.Absolute,
        .Left: 100,
        .Top: 20,
        .Width: 60,
        .Height: 60,
        .Overflow: Overflow.Hidden,
        .Opacity: 0.5,
        Container {
          Position: PositionType.Absolute,
          Left: -10,
          Top: 0,
          Width: 90,
          Height: 60,
          Transform: PanelTransform{ TranslateX: 20 },
          BackgroundColor: Color.Rgb(20, 40, 240),
          ShaderEffect: effect,
        },
      },
      Container() {
        .Position: PositionType.Absolute,
        .Left: 20,
        .Top: 100,
        .Width: 40,
        .Height: 40,
        .Overflow: Overflow.Hidden,
        .BlendMode: BlendMode.Screen,
        .ShaderEffect: effect,
        Container {
          Position: PositionType.Absolute,
          Left: 0,
          Top: 0,
          Width: 80,
          Height: 40,
          BackgroundColor: Color.Rgb(20, 40, 240),
        },
      },
    }
  }
}

func RunShaderGeneratorSmoke() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let shaderPath = Path.Combine(AppContext.BaseDirectory, "generator_effect.frag.goo-effect")
  Require(File.Exists(shaderPath), "Generator effect asset is missing")
  let effect = ShaderEffect(ShaderEffectProgram.Load(shaderPath), false)
  let data = ShaderEffectData(BitConverter.GetBytes(0.0F))
  Require(effect.SetData(0, data), "Generator effect rejected retained data")
  Require(effect.SetParameter(0, Vector4(1.0F, 0.0F, 0.0F, 0.0F)),
    "Generator effect rejected its parameter")
  let cell = ShaderGeneratorCell(effect, data)
  let capturedError = StringWriter()
  let originalError = Console.Error
  var window Window? = nil
  try {
    let opened = Window {
      Title: "Goo generator effect gate",
      Width: 200,
      Height: 160,
      VSync: false,
      Root: cell,
    }
    window = opened
    Console.SetError(capturedError)
    opened.Open()
    let before = WindowReadbackTestFixture.DiagnosticCounters(opened)
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    let after = WindowReadbackTestFixture.DiagnosticCounters(opened)
    let recorded = ShaderEffectDelta(after.recordCount, before.recordCount)
    Require(recorded > 0uL
        && ShaderEffectDelta(after.layerPoolPassCount, before.layerPoolPassCount) == 2uL * recorded,
      "Generator effect added a source layer beyond opacity and blend groups")
    let metrics = WindowReadbackTestFixture.Metrics(opened)
    let first = PrimitiveReadback(opened, metrics)
    let direct = PrimitiveLogicalPixel(first.Pixels, first.Width, metrics, 52.0, 52.0)
    Require(direct[0] > uint8(190) && direct[1] > uint8(80)
        && direct[0] > direct[1] && direct[2] < uint8(20),
      "First-frame typed float publication did not reach GPU: " + PrimitivePixelText(direct))
    Require(ShaderGeneratorCell.Target.IsMounted,
      "Generator effect removed its input target")
    WindowReadbackTestFixture.InputQueuePointerMove(opened, 52.0, 52.0)
    WindowReadbackTestFixture.InputQueuePointerPress(opened, 52.0, 52.0)
    WindowReadbackTestFixture.InputQueuePointerRelease(opened, 52.0, 52.0)
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    Require(cell.ClickCount == 1, "Generator effect changed its input target")
    let grouped = PrimitiveLogicalPixel(first.Pixels, first.Width, metrics, 130.0, 50.0)
    let clipped = PrimitiveLogicalPixel(first.Pixels, first.Width, metrics, 170.0, 50.0)
    Require(grouped[0] > uint8(100) && grouped[0] < direct[0]
        && grouped[2] < uint8(32),
      "Generator effect ignored transform or group opacity: " + PrimitivePixelText(grouped))
    Require(clipped[0] < uint8(30) && clipped[1] < uint8(40),
      "Generator effect escaped parent clip: " + PrimitivePixelText(clipped))
    let blended = PrimitiveLogicalPixel(first.Pixels, first.Width, metrics, 30.0, 120.0)
    let ownClipped = PrimitiveLogicalPixel(first.Pixels, first.Width, metrics, 70.0, 120.0)
    Require(blended[0] > uint8(190) && blended[1] > uint8(80),
      "Generator effect did not compose its blend layer: " + PrimitivePixelText(blended))
    Require(ownClipped[0] < uint8(30) && ownClipped[1] < uint8(40),
      "Generator effect escaped its own overflow clip: " + PrimitivePixelText(ownClipped))

    let structured = []GeneratorValues{ GeneratorValues{ Red: 0.25F, Green: 0.75F } }
    data.Publish[GeneratorValues](structured.AsSpan())
    structured[0] = GeneratorValues{}
    WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
    let second = PrimitiveReadback(opened, metrics)
    let updated = PrimitiveLogicalPixel(second.Pixels, second.Width, metrics, 52.0, 52.0)
    Require(updated[0] < direct[0] && updated[1] > direct[1]
        && updated[0] > uint8(90) && updated[1] > uint8(180),
      "Typed struct publication did not reach GPU: " + PrimitivePixelText(updated))
    opened.RequestClose()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    Require(!opened.IsOpen && WindowReadbackTestFixture.ResidentResourceBytes(opened) == 0uL,
      "Generator effect resources remain after close")
    Console.SetError(originalError)
    ReadbackValidateCommonDiagnostics(capturedError.ToString())
    Console.WriteLine("shader-generator-smoke: first-frame=1 typed-float=1 typed-struct=1"
      +" source-layer=0 clip=1 transform=1 opacity=1 blend=1 input=1 close=1")
  } finally {
    Console.SetError(originalError)
    if let active = window {
      if active.IsOpen {
        active.RequestClose()
        WindowReadbackTestFixture.ForceRender(active, 0.0)
      }
    }
    data.Dispose()
  }
}
