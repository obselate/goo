package GooAsyncReadbackSmoke

import System
import System.Diagnostics
import System.IO
import System.Threading
import Goo
import GooReadbackFixture

class PaddingEdgeOverflowCell : Cell {
  shared {
    let Root ElementHandle = ElementHandle{}
    let ReferenceBox ElementHandle = ElementHandle{}
    let OverflowBox ElementHandle = ElementHandle{}
    let RectOverflowBox ElementHandle = ElementHandle{}
    let MixedXOverflowBox ElementHandle = ElementHandle{}
    let MixedYOverflowBox ElementHandle = ElementHandle{}
  }

  override func Build() Blob -> Container {
    Width: Length.Percent(100),
    Height: Length.Percent(100),
    Handle: PaddingEdgeOverflowCell.Root,
    Position: PositionType.Relative,
    BackgroundColor: Color.Rgb(12, 20, 32),
    Children: {
      Container{
        Position: PositionType.Absolute,
        Left: 8,
        Top: 8,
        Width: 48,
        Height: 48,
        Handle: PaddingEdgeOverflowCell.ReferenceBox,
        BorderWidth: 1,
        BorderColor: Color.White,
        BorderRadius: 12,
        BackgroundColor: Color.Rgb(220, 40, 48),
      },
      Container{
        Position: PositionType.Absolute,
        Left: 72,
        Top: 8,
        Width: 48,
        Height: 48,
        Handle: PaddingEdgeOverflowCell.OverflowBox,
        BorderWidth: 1,
        BorderColor: Color.White,
        BorderRadius: 12,
        Overflow: Overflow.Hidden,
        BackgroundColor: Color.Rgb(220, 40, 48),
        Children: {
          Container{
            Position: PositionType.Absolute,
            Left: 0,
            Top: 0,
            Width: Length.Percent(100),
            Height: Length.Percent(100),
            BackgroundColor: Color.Rgb(220, 40, 48),
          },
        },
      },
      Container{
        Position: PositionType.Absolute,
        Left: 136,
        Top: 8,
        Width: 48,
        Height: 48,
        BorderWidth: 1,
        BorderColor: Color.White,
        BackgroundColor: Color.Rgb(220, 40, 48),
      },
      Container{
        Position: PositionType.Absolute,
        Left: 200,
        Top: 8,
        Width: 48,
        Height: 48,
        Handle: PaddingEdgeOverflowCell.RectOverflowBox,
        BorderWidth: 1,
        BorderColor: Color.White,
        Overflow: Overflow.Hidden,
        BackgroundColor: Color.Rgb(220, 40, 48),
        Children: {
          Container{
            Position: PositionType.Absolute,
            Left: -1,
            Top: -1,
            Width: 48,
            Height: 48,
            BackgroundColor: Color.Rgb(220, 40, 48),
          },
        },
      },
      Container{
        Position: PositionType.Absolute,
        Left: 8,
        Top: 72,
        Width: 48,
        Height: 48,
        BorderWidth: 1,
        BorderColor: Color.White,
        BackgroundColor: Color.Rgb(220, 40, 48),
      },
      Container{
        Position: PositionType.Absolute,
        Left: 72,
        Top: 72,
        Width: 48,
        Height: 48,
        Handle: PaddingEdgeOverflowCell.MixedXOverflowBox,
        BorderWidth: 1,
        BorderColor: Color.White,
        OverflowX: Overflow.Hidden,
        OverflowY: Overflow.Visible,
        BackgroundColor: Color.Rgb(220, 40, 48),
        Children: {
          Container{
            Position: PositionType.Absolute,
            Left: -1,
            Top: -1,
            Width: 48,
            Height: 48,
            BackgroundColor: Color.Rgb(220, 40, 48),
          },
        },
      },
      Container{
        Position: PositionType.Absolute,
        Left: 136,
        Top: 72,
        Width: 48,
        Height: 48,
        BorderWidth: 1,
        BorderColor: Color.White,
        BackgroundColor: Color.Rgb(220, 40, 48),
      },
      Container{
        Position: PositionType.Absolute,
        Left: 200,
        Top: 72,
        Width: 48,
        Height: 48,
        Handle: PaddingEdgeOverflowCell.MixedYOverflowBox,
        BorderWidth: 1,
        BorderColor: Color.White,
        OverflowX: Overflow.Visible,
        OverflowY: Overflow.Hidden,
        BackgroundColor: Color.Rgb(220, 40, 48),
        Children: {
          Container{
            Position: PositionType.Absolute,
            Left: -1,
            Top: -1,
            Width: 48,
            Height: 48,
            BackgroundColor: Color.Rgb(220, 40, 48),
          },
        },
      },
    },
  }
}

func PaddingEdgeRequirePair(pixels []uint8, width uint32, metrics WindowMetrics,
  referenceX float64, referenceY float64, overflowX float64, overflowY float64,
  x float64, y float64, name string) {
    let reference = PrimitiveLogicalPixel(pixels, width, metrics,
      referenceX + x, referenceY + y)
    let overflow = PrimitiveLogicalPixel(pixels, width, metrics,
      overflowX + x, overflowY + y)
    let difference = Math.Abs(int32(reference[0]) - int32(overflow[0]))
    +Math.Abs(int32(reference[1]) - int32(overflow[1]))
    +Math.Abs(int32(reference[2]) - int32(overflow[2]))
    if difference > 36 || reference[3] < uint8(240) || overflow[3] < uint8(240) {
      throw InvalidOperationException("Padding-edge border sample " + name
        +" differs: reference=" + PrimitivePixelText(reference)
        +" overflow=" + PrimitivePixelText(overflow))
    }
  }

func PaddingEdgeValidateScale(result VulkanReadbackResult, metrics WindowMetrics,
  name string) {
    let pixels = result.Pixels
    let width = result.Width
    PrimitiveRequirePixelNear(pixels, width, metrics,
      73.0, 9.0, uint8(12), uint8(20), uint8(32), 1,
      name + "_rounded_outside_top_left")
    PrimitiveRequirePixelNear(pixels, width, metrics,
      118.0, 9.0, uint8(12), uint8(20), uint8(32), 1,
      name + "_rounded_outside_top_right")
    PaddingEdgeRequirePair(pixels, width, metrics, 8.0, 8.0, 72.0, 8.0,
      3.5, 3.5, name + "_rounded_top_left")
    PaddingEdgeRequirePair(pixels, width, metrics, 8.0, 8.0, 72.0, 8.0,
      44.5, 3.5, name + "_rounded_top_right")
    PaddingEdgeRequirePair(pixels, width, metrics, 8.0, 8.0, 72.0, 8.0,
      44.5, 44.5, name + "_rounded_bottom_right")
    PaddingEdgeRequirePair(pixels, width, metrics, 8.0, 8.0, 72.0, 8.0,
      3.5, 44.5, name + "_rounded_bottom_left")
    PaddingEdgeRequirePair(pixels, width, metrics, 8.0, 8.0, 72.0, 8.0,
      24.0, 1.0, name + "_rounded_top")
    PaddingEdgeRequirePair(pixels, width, metrics, 8.0, 8.0, 72.0, 8.0,
      46.5, 24.0, name + "_rounded_right")
    PaddingEdgeRequirePair(pixels, width, metrics, 8.0, 8.0, 72.0, 8.0,
      24.0, 46.5, name + "_rounded_bottom")
    PaddingEdgeRequirePair(pixels, width, metrics, 8.0, 8.0, 72.0, 8.0,
      1.0, 24.0, name + "_rounded_left")
    PaddingEdgeRequirePair(pixels, width, metrics, 136.0, 8.0, 200.0, 8.0,
      24.0, 1.0, name + "_rect_top")
    PaddingEdgeRequirePair(pixels, width, metrics, 136.0, 8.0, 200.0, 8.0,
      46.5, 24.0, name + "_rect_right")
    PaddingEdgeRequirePair(pixels, width, metrics, 136.0, 8.0, 200.0, 8.0,
      24.0, 46.5, name + "_rect_bottom")
    PaddingEdgeRequirePair(pixels, width, metrics, 136.0, 8.0, 200.0, 8.0,
      1.0, 24.0, name + "_rect_left")
    PaddingEdgeRequirePair(pixels, width, metrics, 8.0, 72.0, 72.0, 72.0,
      46.5, 24.0, name + "_mixed_x_right")
    PaddingEdgeRequirePair(pixels, width, metrics, 8.0, 72.0, 72.0, 72.0,
      1.0, 24.0, name + "_mixed_x_left")
    PaddingEdgeRequirePair(pixels, width, metrics, 136.0, 72.0, 200.0, 72.0,
      24.0, 1.0, name + "_mixed_y_top")
    PaddingEdgeRequirePair(pixels, width, metrics, 136.0, 72.0, 200.0, 72.0,
      24.0, 46.5, name + "_mixed_y_bottom")
  }

func PaddingEdgeReadback(window Window, metrics WindowMetrics) VulkanReadbackResult {
  let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 10L
  var status = WindowReadbackTestFixture.Request(window,
    uint32(metrics.FramebufferWidth), uint32(metrics.FramebufferHeight))
  while status == WindowReadbackRequestStatus.Busy
    || status == WindowReadbackRequestStatus.NotReady{
      if Stopwatch.GetTimestamp() >= deadline {
        throw InvalidOperationException(
          "Padding-edge readback request did not become accepted")
      }
      WindowReadbackTestFixture.Pump(window, 0.0)
      Thread.Yield()
      status = WindowReadbackTestFixture.Request(window,
        uint32(metrics.FramebufferWidth), uint32(metrics.FramebufferHeight))
    }
  Require(status == WindowReadbackRequestStatus.Accepted,
    "Padding-edge readback was not accepted: " + status.ToString())
  ReadbackAwaitReadbackReady(window, 10000)
  let result = ReadbackTakeReadback(window)
  PrimitiveValidateResult(result, metrics)
  return result
}

func RunPaddingEdgeOverflowSmoke() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let capturedError = StringWriter()
  let originalError = Console.Error
  var window Window? = nil
  try {
    let opened = Window{
      Title: "Goo padding-edge overflow gate",
      Width: 256,
      Height: 128,
      VSync: false,
      Root: PaddingEdgeOverflowCell{},
    }
    window = opened
    Console.SetError(capturedError)
    opened.Open()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    var frame int32 = 0
    while frame < 8 {
      WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
      frame = frame + 1
    }
    let integerMetrics = WindowReadbackTestFixture.Metrics(opened)
    Require(integerMetrics.LogicalWidth == 256 && integerMetrics.LogicalHeight == 128,
      "Padding-edge integer metrics are incorrect")
    Require(PaddingEdgeOverflowCell.Root.IsMounted
        && PaddingEdgeOverflowCell.ReferenceBox.IsMounted
        && PaddingEdgeOverflowCell.OverflowBox.IsMounted
        && PaddingEdgeOverflowCell.RectOverflowBox.IsMounted
        && PaddingEdgeOverflowCell.MixedXOverflowBox.IsMounted
        && PaddingEdgeOverflowCell.MixedYOverflowBox.IsMounted,
      "Padding-edge scene did not mount")
    let integerResult = PaddingEdgeReadback(opened, integerMetrics)
    PaddingEdgeValidateScale(integerResult, integerMetrics, "integer")

    Require(WindowReadbackTestFixture.Resize(opened, 256, 128, 320, 160),
      "Padding-edge fractional resize was rejected")
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    frame = 0
    while frame < 4 {
      WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
      frame = frame + 1
    }
    let fractionalMetrics = WindowReadbackTestFixture.Metrics(opened)
    Require(Math.Abs(fractionalMetrics.DisplayScaleX - 1.25) < 0.001
        && Math.Abs(fractionalMetrics.DisplayScaleY - 1.25) < 0.001,
      "Padding-edge fractional metrics are incorrect")
    let fractionalResult = PaddingEdgeReadback(opened, fractionalMetrics)
    PaddingEdgeValidateScale(fractionalResult, fractionalMetrics, "fractional")
    Require(WindowReadbackTestFixture.RequestCount(opened) == 2uL
        && WindowReadbackTestFixture.CompletionCount(opened) == 2uL,
      "Padding-edge readback lifecycle counts are incorrect")
    opened.RequestClose()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    Require(!opened.IsOpen, "Padding-edge gate window did not close")
    Require(WindowReadbackTestFixture.ResidentResourceBytes(opened) == 0uL,
      "Padding-edge readback resources remain resident after close")
  } finally {
    Console.SetError(originalError)
    if let active = window {
      if active.IsOpen {
        active.RequestClose()
        WindowReadbackTestFixture.ForceRender(active, 0.0)
      }
    }
  }
  let diagnostics = capturedError.ToString()
  ReadbackValidateCommonDiagnostics(diagnostics)
  Require(!diagnostics.Contains("\"event\":325")
      && !diagnostics.Contains("\"event\":326"),
    "Padding-edge gate emitted unsupported-scene diagnostics")
  Console.WriteLine("padding-edge-overflow-smoke: paths=rounded,rect,mixed_x,mixed_y"
    +" scales=1,1.25 samples=36 readbacks=2 close=1")
}
