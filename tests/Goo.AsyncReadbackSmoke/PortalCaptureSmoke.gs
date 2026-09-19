package GooAsyncReadbackSmoke

import Goo
import GooReadbackFixture
import System
import System.IO

class PortalCaptureCell : Cell {
  override func Build() Blob -> Container() {
    .Width: Length.Percent(100),
    .Height: Length.Percent(100),
    .Position: PositionType.Relative,
    .BackgroundColor: Color.Rgb(12, 20, 32),
    Container() {
      .Position: PositionType.Absolute,
      .Left: 10,
      .Top: 10,
      .Width: 60,
      .Height: 60,
      .BackgroundColor: Color.Rgb(220, 180, 40),
      .Opacity: 0.5,
      .Overflow: Overflow.Hidden,
      .BorderStyle: BorderStyle.Solid,
      .BorderWidth: 3,
      .BorderColor: Color.Rgb(240, 220, 120),
      .Transform: PanelTransform{ Scale: 0.8 },
      .TransformOriginX: Length.Percent(0),
      .TransformOriginY: Length.Percent(0),
      Portal{
        ZIndex: 5,
        Width: 120,
        Height: 40,
        Transform: PanelTransform{ TranslateX: 40, TranslateY: 25 },
        TransformOriginX: Length.Percent(0),
        TransformOriginY: Length.Percent(0),
        Container{ Width: 120, Height: 40, BackgroundColor: Color.Rgb(30, 170, 80) },
      },
      Portal{
        ZIndex: 5,
        Width: 120,
        Height: 40,
        Transform: PanelTransform{ TranslateX: 40, TranslateY: 25 },
        TransformOriginX: Length.Percent(0),
        TransformOriginY: Length.Percent(0),
        Container{ Width: 120, Height: 40, BackgroundColor: Color.Rgb(40, 90, 210) },
      },
    },
    Container() {
      .Position: PositionType.Absolute,
      .Left: 20,
      .Top: 100,
      .Width: 120,
      .Height: 60,
      .Padding: 8,
      .Overflow: Overflow.Visible,
      .BorderStyle: BorderStyle.Solid,
      .BorderRadius: 18,
      .BorderTopWidth: 4,
      .BorderRightWidth: 8,
      .BorderBottomWidth: 10,
      .BorderLeftWidth: 6,
      .BorderTopColor: Color.Rgb(220, 50, 50),
      .BorderRightColor: Color.Rgb(40, 190, 80),
      .BorderBottomColor: Color.Rgb(40, 90, 220),
      .BorderLeftColor: Color.Rgb(230, 190, 40),
      .BackgroundColor: Color.Rgb(74, 78, 88),
      Container{
        Position: PositionType.Absolute,
        Left: 40,
        Top: -3,
        Width: 25,
        Height: 10,
        BackgroundColor: Color.Rgb(210, 70, 210),
      },
    },
    Container{
      Position: PositionType.Absolute,
      Left: 90,
      Top: 20,
      Width: 80,
      Height: 50,
      BackgroundColor: Color.Rgb(190, 45, 45),
    },
    Container() {
      .Position: PositionType.Absolute,
      .Left: 180,
      .Top: 100,
      .Width: 70,
      .Height: 60,
      .Padding: 8,
      .Overflow: Overflow.Hidden,
      .BorderStyle: BorderStyle.Solid,
      .BorderRadius: 18,
      .BorderTopWidth: 4,
      .BorderRightWidth: 8,
      .BorderBottomWidth: 10,
      .BorderLeftWidth: 6,
      .BorderTopColor: Color.Rgb(220, 50, 50),
      .BorderRightColor: Color.Rgb(40, 190, 80),
      .BorderBottomColor: Color.Rgb(40, 90, 220),
      .BorderLeftColor: Color.Rgb(230, 190, 40),
      .BackgroundColor: Color.Rgb(74, 78, 88),
      Container{
        Position: PositionType.Absolute,
        Left: -20,
        Top: -20,
        Width: 100,
        Height: 100,
        BackgroundColor: Color.Rgb(40, 200, 210),
      },
    },
  }
}

func RunPortalCaptureSmoke() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let capturedError = StringWriter()
  let originalError = Console.Error
  var window Window? = nil
  try {
    let opened = Window{
      Title: "Goo Portal capture gate",
      Width: 280,
      Height: 180,
      VSync: false,
      Root: PortalCaptureCell{},
    }
    window = opened
    Console.SetError(capturedError)
    opened.Open()
    WindowReadbackTestFixture.Pump(opened, 0.0)
    let metrics = WindowReadbackTestFixture.Metrics(opened)
    let result = ClipCaptureReadback(opened, metrics)
    PrimitiveRequirePixelNear(result.Pixels, result.Width, metrics,
      56.0, 30.0, uint8(40), uint8(90), uint8(210), 8,
      "portal_over_source_border")
    PrimitiveRequirePixelNear(result.Pixels, result.Width, metrics,
      110.0, 30.0, uint8(40), uint8(90), uint8(210), 8,
      "portal_over_foreground_outside_source")
    PrimitiveRequirePixelNear(result.Pixels, result.Width, metrics,
      50.0, 101.0, uint8(220), uint8(50), uint8(50), 16, "border_top")
    PrimitiveRequirePixelNear(result.Pixels, result.Width, metrics,
      137.0, 128.0, uint8(40), uint8(190), uint8(80), 16, "border_right")
    PrimitiveRequirePixelNear(result.Pixels, result.Width, metrics,
      90.0, 156.0, uint8(40), uint8(90), uint8(220), 16, "border_bottom")
    PrimitiveRequirePixelNear(result.Pixels, result.Width, metrics,
      22.0, 128.0, uint8(230), uint8(190), uint8(40), 16, "border_left")
    PrimitiveRequirePixelNear(result.Pixels, result.Width, metrics,
      75.0, 103.0, uint8(210), uint8(70), uint8(210), 16,
      "visible_child_over_border")
    PrimitiveRequirePixelNear(result.Pixels, result.Width, metrics,
      21.0, 101.0, uint8(12), uint8(20), uint8(32), 16, "rounded_corner")
    PrimitiveRequirePixelNear(result.Pixels, result.Width, metrics,
      215.0, 130.0, uint8(40), uint8(200), uint8(210), 16,
      "hidden_child_center")
    PrimitiveRequirePixelDifferent(result.Pixels, result.Width, metrics,
      188.0, 108.0, uint8(40), uint8(200), uint8(210), 48,
      "hidden_padding_corner")
    PrimitiveRequirePixelNear(result.Pixels, result.Width, metrics,
      205.0, 101.0, uint8(220), uint8(50), uint8(50), 16, "hidden_border_top")
    PrimitiveRequirePixelNear(result.Pixels, result.Width, metrics,
      247.0, 130.0, uint8(40), uint8(190), uint8(80), 16, "hidden_border_right")
    PrimitiveRequirePixelNear(result.Pixels, result.Width, metrics,
      215.0, 156.0, uint8(40), uint8(90), uint8(220), 16,
      "hidden_border_bottom")
    PrimitiveRequirePixelNear(result.Pixels, result.Width, metrics,
      182.0, 130.0, uint8(230), uint8(190), uint8(40), 16,
      "hidden_border_left")
    opened.RequestClose()
    WindowReadbackTestFixture.Pump(opened, 0.0)
    Require(!opened.IsOpen, "Portal capture window did not close")
  } finally {
    Console.SetError(originalError)
    if let active = window {
      if active.IsOpen {
        active.RequestClose()
        WindowReadbackTestFixture.DrainWindowQueue(active, 10000)
        WindowReadbackTestFixture.Pump(active, 0.0)
      }
    }
  }
  let diagnostics = capturedError.ToString()
  ReadbackValidateCommonDiagnostics(diagnostics)
  Require(!diagnostics.Contains("\"event\":325")
      && !diagnostics.Contains("\"event\":326"),
    "Portal capture emitted unsupported-scene diagnostics")
  Console.WriteLine("portal-capture-gate: overlay=validated rounded_asymmetric_border=validated visible_overflow=validated close=1")
}
