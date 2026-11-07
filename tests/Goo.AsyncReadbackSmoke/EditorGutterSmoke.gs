package GooAsyncReadbackSmoke

import Goo
import GooReadbackFixture
import System

class EditorGutterSmokeCell : Cell {
  let controller TextEditorController

  init(controller TextEditorController) {
    this.controller = controller
  }

  override func Build() Blob -> TextEditor(controller) {
    Width = 240,
    Height = 100,
    FontSize = 20,
    TextWrap = TextWrap.Wrap,
    ShowLineNumbers = true,
    LineNumberColor = Color.Rgb(80, 220, 100),
    Color = Color.Rgb(240, 60, 60),
    BackgroundColor = Color.Rgb(20, 24, 28),
  }
}

func EditorGutterHasColor(pixels []uint8, width uint32, metrics WindowMetrics,
  fromX int32, toX int32, green bool) bool{
    for y in 2 ... 38 {
      for x in fromX ... toX {
        let pixel = PrimitiveLogicalPixel(pixels, width, metrics, float64(x), float64(y))
        if green {
          if int32(pixel[1]) > 130 && int32(pixel[1]) > int32(pixel[0]) + 40
            && int32(pixel[1]) > int32(pixel[2]) + 40 { return true }
        } else if int32(pixel[0]) > 130 && int32(pixel[0]) > int32(pixel[1]) + 40
          && int32(pixel[0]) > int32(pixel[2]) + 40 { return true }
      }
    }
    return false
  }

func RunEditorGutterSmoke() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let document = TextDocument("")
  using let controller = TextEditorController(document)
  let cell = EditorGutterSmokeCell(controller)
  let window = Window{ Title: "Goo editor gutter smoke", Width: 280, Height: 140,
    VSync: false, Root: cell }
  window.Open()
  try {
    for i in 0 ... 20 { WindowReadbackTestFixture.Pump(window, 0.0) }
    let metrics = WindowReadbackTestFixture.Metrics(window)
    let empty = ClipCaptureReadback(window, metrics)
    Require(EditorGutterHasColor(empty.Pixels, empty.Width, metrics, 0, 20, true),
      "Empty editor gutter number was not rendered")
    document.Apply(TextChange(TextRange(0, 0), "abc"))
    cell.Rebuild()
    for i in 0 ... 20 { WindowReadbackTestFixture.Pump(window, 0.0) }
    let filled = ClipCaptureReadback(window, metrics)
    Require(EditorGutterHasColor(filled.Pixels, filled.Width, metrics, 0, 20, true),
      "Editor gutter number was not retained")
    Require(EditorGutterHasColor(filled.Pixels, filled.Width, metrics, 20, 120, false),
      "Editor content text was not rendered beside gutter")
  } finally {
    window.RequestClose()
    WindowReadbackTestFixture.Pump(window, 0.0)
    WindowReadbackTestFixture.DrainWindowQueue(window, 10000)
  }
  Require(!window.IsOpen, "Editor gutter smoke window did not close")
  Console.WriteLine("editor-gutter-smoke: empty=1 number=1 content=1 close=1")
}
