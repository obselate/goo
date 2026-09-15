package GooAsyncReadbackSmoke

import Goo
import System
import System.IO
import System.Numerics

class LiquidGlassAlphaCell : Cell {
  private let effect ShaderEffect

  init(value ShaderEffect) {
    effect = value
  }

  override func Build() Blob -> Container() {.Width: Length.Percent(100),.Height: Length.Percent(100),.Position: PositionType.Relative,.BackgroundColor: Color.Transparent,
    Container{
        Position: PositionType.Absolute,
        Left: 0,
        Top: 0,
        Width: 43,
        Height: 64,
        BackgroundColor: Color.Rgb(255, 24, 8),
      },
      Container{
        Position: PositionType.Absolute,
        Left: 0,
        Top: 64,
        Width: 192,
        Height: 64,
        BackgroundColor: Color.Rgb(255, 24, 8),
      },
      Container{
        Position: PositionType.Absolute,
        Left: 32,
        Top: 16,
        Width: 128,
        Height: 96,
        BackgroundColor: Color.Transparent,
        ShaderEffect: effect,
    },
  }
}

func RunLiquidGlassAlphaSmoke() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let shaderPath = Path.Combine(AppContext.BaseDirectory, "liquid_glass.frag.goo-effect")
  Require(File.Exists(shaderPath), "Liquid glass effect asset is missing")
  let effect = ShaderEffect(ShaderEffectProgram.Load(shaderPath), true, 24.0F)
  effect.SetParameter(2, Vector4(0.0F, 0.0F, 0.0F, -1.0F))
  effect.SetParameter(3, Vector4(0.0F, 0.0F, 0.0F, 0.78F))
  effect.SetParameter(4, Vector4(0.0F, 0.0F, 0.0F, 1.0F))
  let capturedError = StringWriter()
  let originalError = Console.Error
  var window Window? = nil
  try {
    let opened = Window{
      Title: "Goo liquid glass alpha gate",
      Width: 192,
      Height: 128,
      VSync: false,
      Root: LiquidGlassAlphaCell(effect),
      Background: Color.Transparent,
    }
    window = opened
    Console.SetError(capturedError)
    opened.Open()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
    let metrics = WindowReadbackTestFixture.Metrics(opened)
    let frame = PrimitiveReadback(opened, metrics)
    let edge = PrimitiveLogicalPixel(frame.Pixels, frame.Width, metrics, 32.0, 40.0)
    Require(int32(edge[0]) >= 166 && int32(edge[0]) <= 178
        && int32(edge[1]) <= 22 && int32(edge[2]) <= 12 && edge[3] == uint8(255),
      "Liquid glass alpha edge color is invalid: " + PrimitivePixelText(edge))
    let discontinuity = PrimitiveLogicalPixel(frame.Pixels, frame.Width, metrics, 34.0, 40.0)
    Require(int32(discontinuity[0]) >= 124 && int32(discontinuity[0]) <= 134
        && int32(discontinuity[1]) <= 16 && int32(discontinuity[2]) <= 12
        && discontinuity[3] == uint8(255),
      "Liquid glass alpha discontinuity is invalid: "
      +PrimitivePixelText(discontinuity))
    let transparent = PrimitiveLogicalPixel(frame.Pixels, frame.Width, metrics, 44.0, 40.0)
    Require(int32(transparent[0]) <= 1 && int32(transparent[1]) <= 1
        && int32(transparent[2]) <= 1 && int32(transparent[3]) >= 195
        && int32(transparent[3]) <= 203,
      "Liquid glass transparent backdrop output is invalid: "
      +PrimitivePixelText(transparent))
    for x in 32 ... 64 {
      let opaque = PrimitiveLogicalPixel(frame.Pixels, frame.Width, metrics,
        float64(x), 88.0)
      Require(int32(opaque[0]) >= 244 && int32(opaque[0]) <= 250
          && int32(opaque[1]) >= 20 && int32(opaque[1]) <= 26
          && int32(opaque[2]) >= 4 && int32(opaque[2]) <= 10
          && opaque[3] == uint8(255),
        "Liquid glass opaque backdrop changed at x=" + x.ToString()
        +": " + PrimitivePixelText(opaque))
    }
    opened.RequestClose()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    Require(!opened.IsOpen, "Liquid glass alpha gate window did not close")
    Require(WindowReadbackTestFixture.ResidentResourceBytes(opened) == 0uL,
      "Liquid glass alpha gate resources remain resident after close")
    Console.SetError(originalError)
    ReadbackValidateCommonDiagnostics(capturedError.ToString())
    Console.WriteLine("liquid-glass-alpha-smoke: edge=" + PrimitivePixelText(edge)
      +" discontinuity=" + PrimitivePixelText(discontinuity)
      +" transparent=" + PrimitivePixelText(transparent)
      +" opaque=247/23/7/255 validation=0 cleanup=1")
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
