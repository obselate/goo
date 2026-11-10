package GooAsyncReadbackSmoke

import Goo
import System
import System.Globalization
import System.IO
import System.Text

class BorderSnapCell : Cell {
  override func Build() Blob -> Container() {
    .Width: Percent(100), .Height: Percent(100), .BackgroundColor: Color.White,
    Container{
      Position: PositionType.Absolute, Left: 10, Top: 10, Width: 30, Height: 20,
      BorderWidth: 1, Padding: 1, BorderColor: Color.Black,
      BoxShadows: []BoxShadow{
        BoxShadow{Inset: true, OffsetX: 1, OffsetY: 1, Color: Color.Black},
        BoxShadow{Inset: true, OffsetX: -1, OffsetY: -1, Color: Color.Black},
      },
    },
    Container{
      Position: PositionType.Absolute, Left: 50, Top: 10, Width: 30, Height: 20,
      BorderWidth: 1, BorderColor: Color.Rgb(255, 0, 0), Overflow: Overflow.Hidden,
      Container{Width: Percent(100), Height: Percent(100), BackgroundColor: Color.Black},
    },
    Container{
      Position: PositionType.Absolute, Left: 90, Top: 10, Width: 30, Height: 20,
      OutlineWidth: 1, OutlineColor: Color.Black,
    },
  }
}

func BorderSnapDevice(value float32, scale float64) int32 -> int32(Math.Round(float64(value) * scale))

func BorderSnapRow(frame VulkanReadbackResult, y int32, first int32, last int32, channel int32) string {
  let row = StringBuilder()
  for x in first ... last {
    if x > first { row.Append(' ') }
    row.Append(frame.Pixels[PrimitivePixelIndex(frame.Width, x, y) + channel].ToString())
  }
  return row.ToString()
}

func BorderSnapPartialColumns(frame VulkanReadbackResult, y int32, first int32, last int32) int32 {
  var partial = 0
  for x in first ... last {
    let value = frame.Pixels[PrimitivePixelIndex(frame.Width, x, y)]
    if value != uint8(0) && value != uint8(255) { partial++ }
  }
  return partial
}

func RunBorderSnapSmoke() {
  let output = Environment.GetEnvironmentVariable("GOO_BORDER_SNAP_OUTPUT") ?? ""
  let capturedError = StringWriter()
  let originalError = Console.Error
  Console.SetError(capturedError)
  let opened = Window{
    Title: "Goo border snap gate", Width: 140, Height: 40,
    VSync: false, Decorated: false, Background: Color.White, Root: BorderSnapCell(),
  }
  try {
    opened.Open()
    WindowReadbackTestFixture.ForceRender(opened, 0.0, 10.0)
    WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667, 10.0)
    let metrics = WindowReadbackTestFixture.Metrics(opened)
    ReadbackRequestReadbackUntilAccepted(opened,
      uint32(metrics.FramebufferWidth), uint32(metrics.FramebufferHeight))
    ReadbackAwaitReadbackReady(opened, 10000)
    let frame = ReadbackTakeReadback(opened)
    let device = metrics.DisplayScaleX
    let tag = "display=" + device.ToString(CultureInfo.InvariantCulture)
      + " framebuffer=" + metrics.FramebufferWidth.ToString() + "x" + metrics.FramebufferHeight.ToString()
    if output != "" {
      let _ = Directory.CreateDirectory(output)
      WriteImage(frame, Path.Combine(output, "border-snap-" + Math.Round(device * 100.0).ToString() + ".ppm"))
    }
    let root = opened.Tree!!
    let bevel = root.Children[0]
    let clip = root.Children[1]
    let outline = root.Children[2]
    let row = BorderSnapDevice(bevel.Rect.Y + bevel.Rect.H / 2.0F, device)
    let bevelLeft = BorderSnapDevice(bevel.Rect.X, device)
    let bevelRight = BorderSnapDevice(bevel.Rect.X + bevel.Rect.W, device) - 1
    let clipLeft = BorderSnapDevice(clip.Rect.X, device)
    let clipRight = BorderSnapDevice(clip.Rect.X + clip.Rect.W, device) - 1
    let outlineLeft = BorderSnapDevice(outline.Rect.X, device)
    let outlineRight = BorderSnapDevice(outline.Rect.X + outline.Rect.W, device) - 1
    let paddingLeft = BoxGeometry.PaddingEdgeLeft(bevel) * float32(device)
    Console.WriteLine("border-snap-rects " + tag + " bevel_x=" + (float64(bevel.Rect.X) * device).ToString(CultureInfo.InvariantCulture)
      + " bevel_padding_x=" + paddingLeft.ToString(CultureInfo.InvariantCulture))
    Console.WriteLine("border-snap-bevel " + tag + " row=" + row.ToString() + " x=" + bevelLeft.ToString() + ".. "
      + BorderSnapRow(frame, row, bevelLeft, bevelLeft + 4, 0) + " | x=" + (bevelRight - 4).ToString() + ".. "
      + BorderSnapRow(frame, row, bevelRight - 4, bevelRight + 1, 0))
    Console.WriteLine("border-snap-clip " + tag + " row=" + row.ToString() + " x=" + clipLeft.ToString() + ".. R "
      + BorderSnapRow(frame, row, clipLeft, clipLeft + 4, 0) + " | x=" + (clipRight - 4).ToString() + ".. R "
      + BorderSnapRow(frame, row, clipRight - 4, clipRight + 1, 0))
    Console.WriteLine("border-snap-outline " + tag + " row=" + row.ToString() + " x=" + (outlineLeft - 3).ToString() + ".. "
      + BorderSnapRow(frame, row, outlineLeft - 3, outlineLeft + 2, 0) + " | x=" + (outlineRight - 2).ToString() + ".. "
      + BorderSnapRow(frame, row, outlineRight - 2, outlineRight + 3, 0))
    let border = Math.Max(1, int32(Math.Round(device, MidpointRounding.AwayFromZero)))
    let bevelInsetLeft = frame.Pixels[PrimitivePixelIndex(frame.Width, bevelLeft + border, row)]
    let bevelInsetRight = frame.Pixels[PrimitivePixelIndex(frame.Width, bevelRight - border, row)]
    let clipBorderLeft = frame.Pixels[PrimitivePixelIndex(frame.Width, clipLeft + border - 1, row)]
    let clipBorderRight = frame.Pixels[PrimitivePixelIndex(frame.Width, clipRight - border + 1, row)]
    let clipInsetLeft = frame.Pixels[PrimitivePixelIndex(frame.Width, clipLeft + border, row)]
    let clipInsetRight = frame.Pixels[PrimitivePixelIndex(frame.Width, clipRight - border, row)]
    let outlinePartial = BorderSnapPartialColumns(frame, row, outlineLeft - 3, outlineRight + 3)
    Console.WriteLine("border-snap-result " + tag + " border=" + border.ToString() + " bevel_inset_left=" + bevelInsetLeft.ToString()
      + " bevel_inset_right=" + bevelInsetRight.ToString() + " clip_border_red=" + clipBorderLeft.ToString() + "," + clipBorderRight.ToString()
      + " clip_inset_red=" + clipInsetLeft.ToString() + "," + clipInsetRight.ToString() + " outline_partial_columns=" + outlinePartial.ToString())
    Console.SetError(originalError)
    ReadbackValidateCommonDiagnostics(capturedError.ToString())
    Require(bevelInsetLeft == uint8(0) && bevelInsetRight == uint8(0),
      "Inset shadow line does not start at the snapped border edge at display scale " + device.ToString(CultureInfo.InvariantCulture))
    Require(clipBorderLeft == uint8(255) && clipBorderRight == uint8(255) && clipInsetLeft == uint8(0) && clipInsetRight == uint8(0),
      "Overflow clip does not start at the snapped border edge at display scale " + device.ToString(CultureInfo.InvariantCulture))
    Require(outlinePartial == 0,
      "Outline rendered " + outlinePartial.ToString() + " partial columns at display scale " + device.ToString(CultureInfo.InvariantCulture))
  } finally {
    if opened.IsOpen {
      opened.RequestClose()
      WindowReadbackTestFixture.ForceRender(opened, 0.0)
    }
  }
}
