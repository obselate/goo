package GooAsyncReadbackSmoke

import Goo
import System
import System.Collections.Generic
import System.Diagnostics

data struct PrimitiveUploadBox {
  internal var Left float64
  internal var Top float64
  internal var Width float64
  internal var Height float64
  internal var Radius float64
  internal var Color Color
}

class PrimitiveUploadCell : Cell {
  shared {
    const BoxCount int32 = 1000
    const Columns int32 = 25
    const Rows int32 = 40
  }

  private let boxes []PrimitiveUploadBox

  init() {
    boxes = [BoxCount]PrimitiveUploadBox
    var index int32 = 0
    while index < BoxCount {
      let row = index / Columns
      let column = index % Columns
      let color = Color.Rgb(
        24 + (index % 8) * 12,
        56 + (column % 5) * 18,
        112 + (row % 6) * 16)
      boxes[index] = PrimitiveUploadBox{
        Left: float64(column) * 40.0,
        Top: float64(row) * 16.0,
        Width: 40.0,
        Height: 16.0,
        Radius: index % 2 == 0 ? 0.0 : 3.0,
        Color: color,
      }
      index = index + 1
    }
  }

  internal func Mutate(index int32) {
    boxes[index].Color = Color.Rgb(231, 93, 41)
    Rebuild()
  }

  override func Build() Blob {
    let children = List[Blob](BoxCount)
    var index int32 = 0
    while index < BoxCount {
      let box = boxes[index]
      children.Add(Container{
        Position: PositionType.Absolute,
        Left: box.Left,
        Top: box.Top,
        Width: box.Width,
        Height: box.Height,
        BorderRadius: box.Radius,
        BackgroundColor: box.Color,
      })
      index = index + 1
    }
    return Container{
      Width: float64(Columns) * 40.0,
      Height: float64(Rows) * 16.0,
      Position: PositionType.Relative,
      BackgroundColor: Color.Transparent,
      Children: children,
    }
  }
}
