package GooPrimitiveFixture

import Goo

class PrimitiveSmokeCell : Cell {
  shared {
    let Root ElementHandle = ElementHandle{}
    let SolidBox ElementHandle = ElementHandle{}
    let RoundedBox ElementHandle = ElementHandle{}
    let SolidBorderBox ElementHandle = ElementHandle{}
    let DashedBorderBox ElementHandle = ElementHandle{}
    let DottedBorderBox ElementHandle = ElementHandle{}
    let LinearGradientBox ElementHandle = ElementHandle{}
    let RadialGradientBox ElementHandle = ElementHandle{}
    let TransformOuter ElementHandle = ElementHandle{}
    let TransformInner ElementHandle = ElementHandle{}
    let ScrollViewport ElementHandle = ElementHandle{}
    let ClipOuter ElementHandle = ElementHandle{}
    let ClipInner ElementHandle = ElementHandle{}
    let ScrollLeaf ElementHandle = ElementHandle{}
    let HiddenLeaf ElementHandle = ElementHandle{}
    let OpacityLeaf ElementHandle = ElementHandle{}
    let BackStack ElementHandle = ElementHandle{}
    let FrontStack ElementHandle = ElementHandle{}
  }

  override func Build() Blob -> Container() {.Width: Percent(100),.Height: Percent(100),.Handle: PrimitiveSmokeCell.Root,.Position: PositionType.Relative,.BackgroundColor: Color.Rgb(12, 20, 32),
    Container{
        Position: PositionType.Absolute,
        Left: 10,
        Top: 10,
        Width: 74,
        Height: 38,
        Handle: PrimitiveSmokeCell.SolidBox,
        BackgroundColor: Color.Rgb(42, 112, 188),
      },
      Container{
        Position: PositionType.Absolute,
        Left: 94,
        Top: 10,
        Width: 74,
        Height: 38,
        Handle: PrimitiveSmokeCell.RoundedBox,
        BorderRadius: 12,
        BackgroundColor: Color.Rgb(82, 176, 112),
      },
      Container{
        Position: PositionType.Absolute,
        Left: 178,
        Top: 10,
        Width: 74,
        Height: 38,
        Handle: PrimitiveSmokeCell.SolidBorderBox,
        BorderStyle: BorderStyle.Solid,
        BorderWidth: Edges{Top: 2, Right: 3, Bottom: 4, Left: 5},
        BorderColor: Edges[Color]{Top: Color.Rgb(232, 96, 72), Right: Color.Rgb(96, 224, 128), Bottom: Color.Rgb(72, 144, 232), Left: Color.Rgb(224, 184, 72)},
      },
      Container{
        Position: PositionType.Absolute,
        Left: 262,
        Top: 10,
        Width: 60,
        Height: 38,
        Handle: PrimitiveSmokeCell.DashedBorderBox,
        BorderStyle: BorderStyle.Dashed,
        BorderWidth: Edges{Top: 3, Right: 3, Bottom: 3, Left: 3},
        BorderColor: Edges[Color]{Top: Color.Rgb(232, 96, 72), Right: Color.Rgb(96, 224, 128), Bottom: Color.Rgb(72, 144, 232), Left: Color.Rgb(224, 184, 72)},
      },
      Container{
        Position: PositionType.Absolute,
        Left: 332,
        Top: 10,
        Width: 60,
        Height: 38,
        Handle: PrimitiveSmokeCell.DottedBorderBox,
        BorderStyle: BorderStyle.Dotted,
        BorderWidth: Edges{Top: 3, Right: 3, Bottom: 3, Left: 3},
        BorderColor: Edges[Color]{Top: Color.Rgb(232, 96, 72), Right: Color.Rgb(96, 224, 128), Bottom: Color.Rgb(72, 144, 232), Left: Color.Rgb(224, 184, 72)},
      },
      Container{
        Position: PositionType.Absolute,
        Left: 10,
        Top: 60,
        Width: 120,
        Height: 52,
        Handle: PrimitiveSmokeCell.LinearGradientBox,
        BackgroundGradient: LinearGradient(90.0, []GradientStop{
          GradientStop{ Offset: 0.0, Color: Color.Rgb(24, 68, 132) },
          GradientStop{ Offset: 0.33, Color: Color.Rgb(46, 126, 196) },
          GradientStop{ Offset: 0.66, Color: Color.Rgb(88, 172, 210) },
          GradientStop{ Offset: 1.0, Color: Color.Rgb(38, 92, 152) },
        }),
      },
      Container{
        Position: PositionType.Absolute,
        Left: 140,
        Top: 60,
        Width: 120,
        Height: 52,
        Handle: PrimitiveSmokeCell.RadialGradientBox,
        BackgroundGradient: RadialGradient(0.5, 0.5, 0.5, []GradientStop{
          GradientStop{ Offset: 0.0, Color: Color.Rgb(232, 178, 78) },
          GradientStop{ Offset: 1.0, Color: Color.Rgb(128, 54, 92) },
        }),
      },
      Container() {.Position: PositionType.Absolute,.Left: 270,.Top: 60,.Width: 80,.Height: 60,.Handle: PrimitiveSmokeCell.TransformOuter,.Transform: PanelTransform{ TranslateX: 4, TranslateY: 2 },.BackgroundColor: Color.Rgb(24, 42, 72),
      Container() {.Width: 52,.Height: 36,.Handle: PrimitiveSmokeCell.TransformInner,.Transform: PanelTransform{ TranslateX: 6, TranslateY: 5 },.BackgroundColor: Color.Rgb(52, 116, 188),
        Container{
                Width: 24,
                Height: 20,
                BackgroundColor: Color.Rgb(196, 224, 88),
              },
            },
          },
    Container() {.Position: PositionType.Absolute,.Left: 10,.Top: 136,.Width: 92,.Height: 54,.Handle: PrimitiveSmokeCell.ScrollViewport,.Overflow: Overflow.Scroll,.BackgroundColor: Color.Rgb(18, 32, 52),
      Container() {.Width: 180,.Height: 46,.Handle: PrimitiveSmokeCell.ClipOuter,.Overflow: Overflow.Hidden,.BackgroundColor: Color.Rgb(24, 48, 72),
        Container() {.Width: 164,.Height: 38,.Handle: PrimitiveSmokeCell.ClipInner,.Overflow: Overflow.Hidden,.BackgroundColor: Color.Rgb(32, 64, 88),
          Container{
                    Width: 28,
                    Height: 24,
                    Handle: PrimitiveSmokeCell.ScrollLeaf,
                    BackgroundColor: Color.Rgb(52, 196, 112),
            },
          },
        },
      },
      Container{
        Position: PositionType.Absolute,
        Left: 116,
        Top: 146,
        Width: 24,
        Height: 24,
        Handle: PrimitiveSmokeCell.HiddenLeaf,
        Visibility: Visibility.Hidden,
        BackgroundColor: Color.Rgb(220, 48, 48),
      },
      Container{
        Position: PositionType.Absolute,
        Left: 148,
        Top: 146,
        Width: 24,
        Height: 24,
        Handle: PrimitiveSmokeCell.OpacityLeaf,
        Opacity: 0.5,
        BackgroundColor: Color.Rgb(232, 196, 48),
      },
      Container{
        Position: PositionType.Absolute,
        Left: 198,
        Top: 140,
        Width: 56,
        Height: 52,
        Handle: PrimitiveSmokeCell.BackStack,
        ZIndex: -1,
        BackgroundColor: Color.Rgb(36, 76, 208),
      },
      Container{
        Position: PositionType.Absolute,
        Left: 204,
        Top: 144,
        Width: 44,
        Height: 44,
        Handle: PrimitiveSmokeCell.FrontStack,
        ZIndex: 1,
        BackgroundColor: Color.Rgb(220, 48, 48),
      },
    }
}
