package GooReadbackFixture

import Goo

class RoundedOverflowCell : Cell {
  shared {
    let Root ElementHandle = ElementHandle{}
    let HorizontalViewport ElementHandle = ElementHandle{}
    let HorizontalContent ElementHandle = ElementHandle{}
    let HorizontalStripe ElementHandle = ElementHandle{}
    let VerticalViewport ElementHandle = ElementHandle{}
    let VerticalContent ElementHandle = ElementHandle{}
    let VerticalStripe ElementHandle = ElementHandle{}
    let RoundedHidden ElementHandle = ElementHandle{}
    let RoundedText ElementHandle = ElementHandle{}
    let RoundedImage ElementHandle = ElementHandle{}
    let RoundedScroll ElementHandle = ElementHandle{}
    let RoundedScrollContent ElementHandle = ElementHandle{}
    let RoundedScrollStripe ElementHandle = ElementHandle{}
    let ClipOuter ElementHandle = ElementHandle{}
    let ClipInner ElementHandle = ElementHandle{}
    let TransformLeaf ElementHandle = ElementHandle{}
    let SharedImageSource ImageSource = ImageSource(2, 2, []uint8{
      248, 72, 72, 255,
      72, 224, 128, 255,
      72, 128, 232, 255,
      236, 196, 72, 255,
    })
    let OuterClipPath VectorPath = PathBuilder().MoveTo(0.5, 0.0).LineTo(1.0, 0.5).LineTo(0.5, 1.0).LineTo(0.0, 0.5).Close().Build()
    let InnerClipPath VectorPath = PathBuilder().MoveTo(0.5, 0.0).LineTo(1.0, 1.0).LineTo(0.0, 1.0).Close().Build()
  }

  override func Build() Blob -> Container() {.Width: Length.Percent(100),.Height: Length.Percent(100),.Handle: RoundedOverflowCell.Root,.Position: PositionType.Relative,.BackgroundColor: Color.Rgb(12, 20, 32),
    Container() {.Position: PositionType.Absolute,.Left: 8,.Top: 8,.Width: 120,.Height: 48,.OverflowX: Overflow.Scroll,.OverflowY: Overflow.Visible,.Handle: RoundedOverflowCell.HorizontalViewport,.BackgroundColor: Color.Rgb(18, 32, 52),
      Container() {.Position: PositionType.Absolute,.Width: 240,.Height: 72,.Handle: RoundedOverflowCell.HorizontalContent,.BackgroundColor: Color.Rgb(52, 196, 112),
        Container{
                Position: PositionType.Absolute,
                Left: 128,
                Width: 112,
                Height: 48,
                Handle: RoundedOverflowCell.HorizontalStripe,
                BackgroundColor: Color.Rgb(72, 128, 224),
              },
            },
          },
    Container() {.Position: PositionType.Absolute,.Left: 144,.Top: 8,.Width: 120,.Height: 48,.OverflowX: Overflow.Visible,.OverflowY: Overflow.Scroll,.Handle: RoundedOverflowCell.VerticalViewport,.BackgroundColor: Color.Rgb(36, 52, 76),
      Container() {.Position: PositionType.Absolute,.Width: 160,.Height: 144,.Handle: RoundedOverflowCell.VerticalContent,.BackgroundColor: Color.Rgb(228, 160, 64),
        Container{
                Position: PositionType.Absolute,
                Top: 80,
                Width: 120,
                Height: 64,
                Handle: RoundedOverflowCell.VerticalStripe,
                BackgroundColor: Color.Rgb(196, 88, 200),
              },
            },
          },
    Container() {.Position: PositionType.Absolute,.Left: 280,.Top: 8,.Width: 112,.Height: 48,.BackgroundColor: Color.Rgb(26, 50, 76),
      Text{
            Position: PositionType.Absolute,
            Left: 6,
            Top: 10,
            Content: "Readback",
            FontFamily: "ReadbackGateFont",
            FontSize: 22,
            Color: Color.White,
          },
        },
    Container() {.Position: PositionType.Absolute,.Left: 8,.Top: 84,.Width: 124,.Height: 96,.BorderRadius: 20,.Overflow: Overflow.Hidden,.Handle: RoundedOverflowCell.RoundedHidden,.BackgroundColor: Color.Rgb(228, 64, 72),
      Text{
            Position: PositionType.Absolute,
            Left: 16,
            Top: 14,
            Width: 82,
            Height: 28,
            Handle: RoundedOverflowCell.RoundedText,
            Content: "Clip",
            FontFamily: "ReadbackGateFont",
            FontSize: 18,
            Color: Color.White,
          },
          Image{
            Position: PositionType.Absolute,
            Left: 78,
            Top: 48,
            Width: 42,
            Height: 42,
            Handle: RoundedOverflowCell.RoundedImage,
            Source: RoundedOverflowCell.SharedImageSource,
            Fit: ImageFit.Fill,
          },
          Container{
            Position: PositionType.Absolute,
            Left: 116,
            Top: 78,
            Width: 84,
            Height: 46,
            BackgroundColor: Color.Rgb(72, 224, 128),
          },
        },
    Container() {.Position: PositionType.Absolute,.Left: 148,.Top: 84,.Width: 124,.Height: 96,.BorderRadius: 20,.Overflow: Overflow.Scroll,.Handle: RoundedOverflowCell.RoundedScroll,.BackgroundColor: Color.Rgb(24, 48, 72),
      Container() {.Position: PositionType.Absolute,.Width: 248,.Height: 96,.Handle: RoundedOverflowCell.RoundedScrollContent,.BackgroundColor: Color.Rgb(52, 196, 112),
        Container{
                Position: PositionType.Absolute,
                Left: 138,
                Width: 110,
                Height: 96,
                Handle: RoundedOverflowCell.RoundedScrollStripe,
                BackgroundColor: Color.Rgb(72, 128, 224),
              },
            },
          },
    Container() {.Position: PositionType.Absolute,.Left: 288,.Top: 84,.Width: 104,.Height: 96,.Handle: RoundedOverflowCell.ClipOuter,.ClipPath: RoundedOverflowCell.OuterClipPath,.ClipPathFit: ShapeFit.Fill,.BackgroundColor: Color.Rgb(32, 96, 144),
      Container() {.Position: PositionType.Absolute,.Left: 8,.Top: 8,.Width: 88,.Height: 80,.Handle: RoundedOverflowCell.ClipInner,.ClipPath: RoundedOverflowCell.InnerClipPath,.ClipPathFit: ShapeFit.Fill,.BackgroundColor: Color.Rgb(160, 64, 192),
        Container{
                Position: PositionType.Absolute,
                Left: 20,
                Top: 18,
                Width: 44,
                Height: 34,
                Handle: RoundedOverflowCell.TransformLeaf,
                Transform: PanelTransform{ Rotate: 18, ScaleX: 0.9, ScaleY: 1.1 },
                BackgroundColor: Color.Rgb(236, 196, 72),
              },
            },
          },
        }
}
