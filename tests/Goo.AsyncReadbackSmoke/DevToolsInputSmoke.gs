package GooAsyncReadbackSmoke

import Goo
import System

class DevToolsInputSmokeCell : Cell {
  private var count int32
  private var value string = ""
  private var columnWidth float64 = 160.0
  private var dragging bool

  override func Build() Blob -> Container() {.Width: Length.Percent(100),.Height: Length.Percent(100),.Padding: 24,.Gap: 12,.BackgroundColor: Color.Rgb(18, 24, 35),.Color: Color.Rgb(235, 240, 250),
    Text{Key: "title", Content: "DevTools input verification", FontSize: 24},
      Button() {.Key: "button",.Height: 40,.Width: 220,.BackgroundColor: Color.Rgb(35, 88, 150),.OnClick: () -> { count++ },
      Text{Content: "Activated " + count.ToString()}},
      TextEntry{Key: "entry", Width: 320, Height: 40, Value: value,
        BackgroundColor: Color.Rgb(32, 42, 57), OnChange: (next string) -> { value = next }},
      Text{Key: "value", Content: "Committed: " + value},
      Container() {.Key: "columns",.FlexDirection: FlexDirection.Row,.Height: 70,
      Container() {.Key: "column",.Width: columnWidth,.Height: 70,.BackgroundColor: Color.Rgb(40, 110, 92),
        Text{Content: "Width " + columnWidth.ToString()}},
        Container{Key: "resize", Width: 10, Height: 70, BackgroundColor: Color.Rgb(100, 180, 200),
          OnPointerDown: (event PointerEvent) -> { dragging = true
            event.Capture() },
          OnPointerMove: (event PointerEvent) -> {
            if dragging { columnWidth = Math.Clamp(columnWidth + event.Delta.X, 80.0, 400.0) }
          },
          OnPointerUp: (event PointerEvent) -> { dragging = false
            event.ReleaseCapture() },
          OnPointerCancel: (event PointerEvent) -> { dragging = false }}
    },
      Container() {.Key: "scroll",.Width: 360,.Height: 120,.OverflowY: Overflow.Scroll,.ScrollbarVisibility: ScrollbarVisibility.Always,.BackgroundColor: Color.Rgb(30, 40, 58),
      Container() {.Height: 600,.FlexShrink: 0, Text{Content: "Scrollable content", FontSize: 18}}},
        }}
