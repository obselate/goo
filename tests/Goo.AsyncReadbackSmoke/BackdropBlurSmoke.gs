package GooAsyncReadbackSmoke

import Goo
import System
import System.IO

class BackdropBlurCell : Cell {
  override func Build() Blob -> Container() {.Width: Percent(100),.Height: Percent(100),.Position: PositionType.Relative,.BackgroundColor: Color.Transparent,
    Container{
      Position: PositionType.Absolute,
      Left: 0,
      Top: 0,
      Width: 84,
      Height: 128,
      BackgroundColor: Color.White,
    },
    Container{
      Position: PositionType.Absolute,
      Left: 84,
      Top: 0,
      Width: 108,
      Height: 128,
      BackgroundColor: Color.Black,
    },
    Container{
      Position: PositionType.Absolute,
      Left: 0,
      Top: 128,
      Width: 192,
      Height: 64,
      BackgroundColor: Color.Rgba(255, 24, 8, 128),
    },
    Container{
      Position: PositionType.Absolute,
      Left: 80,
      Top: 8,
      Width: 64,
      Height: 48,
      BorderRadius: 16,
      BackdropBlur: 6,
    },
    Container{
      Position: PositionType.Absolute,
      Left: 80,
      Top: 72,
      Width: 64,
      Height: 40,
      Opacity: 0.5,
      BackdropBlur: 6,
    },
    Container{
      Position: PositionType.Absolute,
      Left: 32,
      Top: 136,
      Width: 64,
      Height: 40,
      BackdropBlur: 8,
    },
  }
}

func RunBackdropBlurSmoke() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let capturedError = StringWriter()
  let originalError = Console.Error
  var window Window? = nil
  try {
    let opened = Window{
      Title: "Goo backdrop blur gate",
      Width: 192,
      Height: 192,
      VSync: false,
      Root: BackdropBlurCell{},
      Background: Color.Transparent,
    }
    window = opened
    Console.SetError(capturedError)
    opened.Open()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
    let metrics = WindowReadbackTestFixture.Metrics(opened)
    let frame = PrimitiveReadback(opened, metrics)
    let pixel = (x float64, y float64) -> PrimitiveLogicalPixel(frame.Pixels, frame.Width, metrics, x, y)
    let light = pixel(83.0, 32.0)
    let dark = pixel(84.0, 32.0)
    Require(int32(light[0]) < 235 && int32(dark[0]) > 40 && light[0] > dark[0]
        && light[3] == uint8(255) && dark[3] == uint8(255),
      "Backdrop blur did not blur the edge: " + PrimitivePixelText(light) + " " + PrimitivePixelText(dark))
    var previous = 255
    for x in 70 ... 110 {
      let value = int32(pixel(float64(x), 32.0)[0])
      Require(value <= previous, "Backdrop blur is not monotonic at x=" + x.ToString())
      previous = value
    }
    Require(PrimitiveNear(pixel(120.0, 32.0), uint8(0), uint8(0), uint8(0), 2),
      "Backdrop blur changed a far pixel: " + PrimitivePixelText(pixel(120.0, 32.0)))
    Require(PrimitiveNear(pixel(82.0, 10.0), uint8(255), uint8(255), uint8(255), 0)
        && PrimitiveNear(pixel(86.0, 10.0), uint8(0), uint8(0), uint8(0), 0),
      "Backdrop blur ignored BorderRadius: " + PrimitivePixelText(pixel(82.0, 10.0))
      +" " + PrimitivePixelText(pixel(86.0, 10.0)))
    Require(PrimitiveNear(pixel(83.0, 60.0), uint8(255), uint8(255), uint8(255), 0)
        && PrimitiveNear(pixel(84.0, 60.0), uint8(0), uint8(0), uint8(0), 0),
      "Backdrop blur painted outside its box: " + PrimitivePixelText(pixel(83.0, 60.0))
      +" " + PrimitivePixelText(pixel(84.0, 60.0)))
    let faded = pixel(84.0, 92.0)
    Require(faded[0] > uint8(0) && faded[0] < dark[0],
      "Backdrop blur ignored Opacity: " + PrimitivePixelText(faded) + " " + PrimitivePixelText(dark))
    let inside = pixel(64.0, 156.0)
    let outside = pixel(140.0, 156.0)
    Require(outside[3] > uint8(100) && outside[3] < uint8(160)
        && inside[0] == outside[0] && inside[1] == outside[1]
        && inside[2] == outside[2] && inside[3] == outside[3],
      "Backdrop blur changed a uniform translucent backdrop: " + PrimitivePixelText(inside)
      +" " + PrimitivePixelText(outside))
    opened.RequestClose()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    Require(!opened.IsOpen, "Backdrop blur gate window did not close")
    Require(WindowReadbackTestFixture.ResidentResourceBytes(opened) == 0uL,
      "Backdrop blur gate resources remain resident after close")
    Console.SetError(originalError)
    ReadbackValidateCommonDiagnostics(capturedError.ToString())
    Console.WriteLine("backdrop-blur-smoke: edge=" + PrimitivePixelText(light) + " " + PrimitivePixelText(dark)
      +" faded=" + PrimitivePixelText(faded) + " translucent=" + PrimitivePixelText(inside))
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
