package GooAsyncReadbackSmoke

import Goo
import GooReadbackFixture
import System

class KeyedOrderSmokeCell : Cell {
  internal var Order string = "rgb"
  internal var Leading bool

  override func Build() Blob {
    let root = Container{ Width: Percent(100), Height: Percent(100), BackgroundColor: Color.Black }
    if Leading { root.Add(Container{ Width: 1, Height: 1 }) }
    for key in Order {
      let offset = key == 'r' ? 0 : key == 'g' ? 20 : 40
      root.Add(Container{
        Key: key.ToString(), Position: PositionType.Absolute,
        Left: offset, Top: offset, Width: 60, Height: 60,
        BackgroundColor: key == 'r' ? Color.Rgb(255, 0, 0) : key == 'g' ? Color.Rgb(0, 255, 0) : Color.Rgb(0, 0, 255),
      })
    }
    return root
  }
}

func KeyedOrderTop(pixels []uint8, width uint32, metrics WindowMetrics, at float64) char {
  let pixel = PrimitiveLogicalPixel(pixels, width, metrics, at, at)
  return pixel[0] > uint8(128) ? 'r' : pixel[1] > uint8(128) ? 'g' : pixel[2] > uint8(128) ? 'b' : '-'
}

func RunKeyedOrderSmoke() {
  let cell = KeyedOrderSmokeCell{}
  let window = Window{ Title: "Goo keyed order smoke", Size: LayoutSize(120, 120),  VSync: false, Root: cell }
  window.Open()
  try {
    for i in 0 ... 20 { WindowReadbackTestFixture.Pump(window, 0.0) }
    let metrics = WindowReadbackTestFixture.Metrics(window)
    for leading in []bool{false, true} {
      cell.Leading = leading
      for order in []string{"rgb", "gbr", "rgb", "grb", "bgr"} {
        cell.Order = order
        cell.Rebuild()
        for i in 0 ... 20 { WindowReadbackTestFixture.Pump(window, 0.0) }
        let frame = ClipCaptureReadback(window, metrics)
        let index = (key char) -> order.IndexOf(key)
        let upper = (a char, b char) -> index(a) > index(b) ? a : b
        let expected = "${upper('r', 'g')}${upper(upper('r', 'g'), 'b')}${upper('g', 'b')}"
        let actual = "${KeyedOrderTop(frame.Pixels, frame.Width, metrics, 30.0)}"
          + "${KeyedOrderTop(frame.Pixels, frame.Width, metrics, 50.0)}"
          + "${KeyedOrderTop(frame.Pixels, frame.Width, metrics, 70.0)}"
        Require(actual == expected, "Keyed order $order (leading=$leading) painted $actual, expected $expected")
      }
    }
  } finally {
    window.RequestClose()
    WindowReadbackTestFixture.Pump(window, 0.0)
    WindowReadbackTestFixture.DrainWindowQueue(window, 10000)
  }
  Require(!window.IsOpen, "Keyed order smoke window did not close")
  Console.WriteLine("keyed-order-smoke: first=1 last=1 middle=1 close=1")
}
