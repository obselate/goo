package GooAsyncReadbackSmoke

import Goo
import System
import System.Globalization
import System.IO
import System.Text

class PixelEdgeCell : Cell {
  private func Bevel() Blob -> Container{
    BorderWidth: 1, Padding: 1,
    BorderColor: Edges[Color](Color.Black, Color.Rgb(255, 0, 0), Color.Rgb(255, 0, 0), Color.Black),
    BoxShadows: []BoxShadow{
      BoxShadow{Inset: true, OffsetX: 1, OffsetY: 1, Color: Color.Black},
      BoxShadow{Inset: true, OffsetX: -1, OffsetY: -1, Color: Color.Rgb(255, 0, 0)},
    },
    Text{Content: "Abc", FontSize: 13, Color: Color.Black, TextWrap: TextWrap.NoWrap},
  }

  override func Build() Blob -> Container() {
    .Width: Percent(100), .Height: Percent(100), .BackgroundColor: Color.White,
    Container{
      Position: PositionType.Absolute, Left: 10, Top: 10, Width: 80, Height: 40,
      BackgroundColor: Color.White,
      BoxShadows: []BoxShadow{
        BoxShadow{Inset: true, OffsetX: 1, OffsetY: 1, Color: Color.Black},
        BoxShadow{Inset: true, OffsetX: -1, OffsetY: -1, Color: Color.Black},
      },
    },
    Container{
      Position: PositionType.Absolute, Left: 100, Top: 10, Width: 95, Height: 40,
      FlexDirection: FlexDirection.Row,
      Container{Width: Percent(24), BorderWidth: 1, BorderColor: Color.Black},
      Container{FlexGrow: 1, BorderWidth: 1, BorderColor: Color.Black},
    },
    Container{
      Position: PositionType.Absolute, Left: 100, Top: 60, FlexDirection: FlexDirection.Row,
      Container{BorderWidth: 1, BorderColor: Color.Black, Container{Width: 22.8, Height: 20}},
      Container{BorderWidth: 1, BorderColor: Color.Black, Container{Width: 30.4, Height: 20}},
    },
    Container{
      Position: PositionType.Absolute, Left: 10, Top: 60, FlexDirection: FlexDirection.Row, Gap: 3.3,
      Bevel(), Bevel(),
    },
    Container{
      Position: PositionType.Absolute, Left: 100, Top: 95, Width: 90, Height: 20, Layout: PixelEdgeArrangement(),
      Container{Width: 30, Height: 20, BorderWidth: 1, BorderColor: Color.Black},
    },
  }
}

class PixelEdgeArrangement : LayoutAlgorithm {
  public func Measure(context LayoutContext, available LayoutSize) LayoutSize -> available

  public func Arrange(context LayoutContext, finalSize LayoutSize) {
    context.ArrangeChild(0, ElementRect{X: 22.8, Y: 0, Width: 30, Height: 20})
  }
}

func PixelEdgeRects(node Node, scale float64, depth int32, output StringBuilder) {
  output.Append(' ', depth * 2).Append(node.Kind.ToString())
    .Append(" x=").Append((float64(node.Rect.X) * scale).ToString(CultureInfo.InvariantCulture))
    .Append(" y=").Append((float64(node.Rect.Y) * scale).ToString(CultureInfo.InvariantCulture))
    .Append(" w=").Append((float64(node.Rect.W) * scale).ToString(CultureInfo.InvariantCulture))
    .Append(" h=").Append((float64(node.Rect.H) * scale).ToString(CultureInfo.InvariantCulture))
    .Append('\n')
  for child in node.Children { PixelEdgeRects(child, scale, depth + 1, output) }
}

func PixelEdgeDevice(value float32, scale float64) int32 -> int32(Math.Round(float64(value) * scale))

func PixelEdgeRow(frame VulkanReadbackResult, y int32, first int32, last int32) string {
  let row = StringBuilder()
  for x in first ... last {
    if x > first { row.Append(' ') }
    row.Append(frame.Pixels[PrimitivePixelIndex(frame.Width, x, y)].ToString())
  }
  return row.ToString()
}

func PixelEdgePartialColumns(frame VulkanReadbackResult, y int32, first int32, last int32) int32 {
  var partial = 0
  for x in first ... last {
    let index = PrimitivePixelIndex(frame.Width, x, y)
    for channel in 0 ... 3 {
      let value = frame.Pixels[index + channel]
      if value != uint8(0) && value != uint8(255) {
        partial++
        break
      }
    }
  }
  return partial
}

func RunPixelEdgeSmoke() {
  let output = Environment.GetEnvironmentVariable("GOO_PIXEL_EDGE_OUTPUT") ?? ""
  let capturedError = StringWriter()
  let originalError = Console.Error
  Console.SetError(capturedError)
  var failures = 0
  let scales = (Environment.GetEnvironmentVariable("GOO_PIXEL_EDGE_UI_SCALES") ?? "1,1.25,1.5,2").Split(',')
  for text in scales {
    let scale = Single.Parse(text, CultureInfo.InvariantCulture)
    let opened = Window{
      Title: "Goo pixel edge gate", Size: LayoutSize(float64(int32(200.0F * scale)) / float64(scale), float64(int32(120.0F * scale)) / float64(scale)),
      UiScale: scale, VSync: false, Decorated: false, Background: Color.White, Root: PixelEdgeCell(),
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
      let device = metrics.DisplayScaleX * float64(scale)
      let tag = "display=" + metrics.DisplayScaleX.ToString(CultureInfo.InvariantCulture)
        + " ui=" + scale.ToString(CultureInfo.InvariantCulture)
      let root = opened.Tree!!
      let rects = StringBuilder()
      PixelEdgeRects(root, device, 0, rects)
      Console.WriteLine("pixel-edge-rects " + tag + " framebuffer=" + metrics.FramebufferWidth.ToString()
        + "x" + metrics.FramebufferHeight.ToString() + "\n" + rects.ToString())
      if output != "" {
        let _ = Directory.CreateDirectory(output)
        WriteImage(frame, Path.Combine(output, "pixel-edge-" + Math.Round(device * 100.0).ToString() + ".ppm"))
      }
      let shadow = root.Children[0].Rect
      let shadowRow = PixelEdgeDevice(shadow.Y + shadow.H / 2.0F, device)
      let shadowLeft = PixelEdgeDevice(shadow.X, device)
      let shadowRight = PixelEdgeDevice(shadow.X + shadow.W, device) - 1
      let dock = root.Children[1].Rect
      let dockRow = PixelEdgeDevice(dock.Y + dock.H / 2.0F, device)
      let dockLeft = PixelEdgeDevice(dock.X, device)
      let dockRight = PixelEdgeDevice(dock.X + dock.W, device) - 1
      let content = root.Children[2].Rect
      let contentRow = PixelEdgeDevice(content.Y + content.H / 2.0F, device)
      let contentRight = PixelEdgeDevice(content.X + content.W, device) + 2
      let bevel = root.Children[3].Rect
      let bevelRow = PixelEdgeDevice(bevel.Y, device) + PixelEdgeDevice(2.5F, device)
      let bevelLeft = PixelEdgeDevice(bevel.X, device)
      let bevelRight = PixelEdgeDevice(bevel.X + bevel.W, device) + 2
      let arranged = root.Children[4].Rect
      let arrangedRow = PixelEdgeDevice(arranged.Y + arranged.H / 2.0F, device)
      let arrangedLeft = PixelEdgeDevice(arranged.X, device)
      let arrangedRight = PixelEdgeDevice(arranged.X + arranged.W, device)
      Console.WriteLine("pixel-edge-shadow " + tag + " row=" + shadowRow.ToString() + " x="
        + (shadowLeft - 1).ToString() + ".. " + PixelEdgeRow(frame, shadowRow, shadowLeft - 1, shadowLeft + 4)
        + " | x=" + (shadowRight - 3).ToString() + ".. " + PixelEdgeRow(frame, shadowRow, shadowRight - 3, shadowRight + 2))
      Console.WriteLine("pixel-edge-dock " + tag + " row=" + dockRow.ToString() + " x=" + dockLeft.ToString()
        + ".. " + PixelEdgeRow(frame, dockRow, dockLeft, dockRight + 1))
      Console.WriteLine("pixel-edge-content " + tag + " row=" + contentRow.ToString() + " x=" + dockLeft.ToString()
        + ".. " + PixelEdgeRow(frame, contentRow, dockLeft, contentRight))
      Console.WriteLine("pixel-edge-bevel " + tag + " row=" + bevelRow.ToString() + " x=" + bevelLeft.ToString()
        + ".. " + PixelEdgeRow(frame, bevelRow, bevelLeft, bevelRight))
      Console.WriteLine("pixel-edge-arranged " + tag + " row=" + arrangedRow.ToString() + " x=" + arrangedLeft.ToString()
        + ".. " + PixelEdgeRow(frame, arrangedRow, arrangedLeft, arrangedRight))
      let leftEdge = frame.Pixels[PrimitivePixelIndex(frame.Width, shadowLeft, shadowRow)]
      let rightEdge = frame.Pixels[PrimitivePixelIndex(frame.Width, shadowRight, shadowRow)]
      let outside = frame.Pixels[PrimitivePixelIndex(frame.Width, shadowLeft - 1, shadowRow)]
      let dockPartial = PixelEdgePartialColumns(frame, dockRow, dockLeft, dockRight + 1)
      let contentPartial = PixelEdgePartialColumns(frame, contentRow, dockLeft, contentRight)
      let bevelPartial = PixelEdgePartialColumns(frame, bevelRow, bevelLeft, bevelRight)
      let arrangedPartial = PixelEdgePartialColumns(frame, arrangedRow, arrangedLeft, arrangedRight)
      Console.WriteLine("pixel-edge-result " + tag + " inset_left=" + leftEdge.ToString()
        + " inset_right=" + rightEdge.ToString() + " outside=" + outside.ToString()
        + " dock_partial_columns=" + dockPartial.ToString() + " content_partial_columns=" + contentPartial.ToString()
        + " bevel_partial_columns=" + bevelPartial.ToString() + " arranged_partial_columns=" + arrangedPartial.ToString())
      if leftEdge != uint8(0) || rightEdge != uint8(0) || outside != uint8(255)
        || dockPartial != 0 || contentPartial != 0 || arrangedPartial != 0
        || (bevelPartial != 0 && device == Math.Floor(device)) {
          failures++
        }
    } finally {
      if opened.IsOpen {
        opened.RequestClose()
        WindowReadbackTestFixture.ForceRender(opened, 0.0)
      }
    }
  }
  Console.SetError(originalError)
  ReadbackValidateCommonDiagnostics(capturedError.ToString())
  Require(failures == 0, "Pixel edge gate found partial coverage at integer device edges in "
    + failures.ToString() + " scale(s)")
}
