package GooAsyncReadbackSmoke

import Goo
import System
import System.IO

class ScrollbarCell : Cell {
  shared {
    let Viewport ElementHandle = ElementHandle{}
  }

  private var visibility ScrollbarVisibility

  init() {
    visibility = ScrollbarVisibility.Always
  }

  internal func HideScrollbar() {
    visibility = ScrollbarVisibility.Hidden
    Rebuild()
  }

  override func Build() Blob -> Container() {.Width: Length.Percent(100),.Height: Length.Percent(100),.Position: PositionType.Relative,.BackgroundColor: Color.Rgb(8, 14, 24),
    Container() {.Handle: ScrollbarCell.Viewport,.Position: PositionType.Absolute,.Left: 20.0,.Top: 20.0,.Width: 100.0,.Height: 100.0,.OverflowX: Overflow.Hidden,.OverflowY: Overflow.Scroll,.ScrollbarVisibility: visibility,
      Container{
            Width: 100.0,
            Height: 300.0,
            FlexShrink: 0.0,
            BackgroundColor: Color.Rgb(24, 80, 160),
      },
    },
  }
}

func RunScrollbarSmoke() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let cell = ScrollbarCell{}
  let capturedError = StringWriter()
  let originalError = Console.Error
  var window Window? = nil
  try {
    let opened = Window{
      Title: "Goo Scrollbar gate",
      Width: 144,
      Height: 144,
      VSync: false,
      Root: cell,
    }
    window = opened
    Console.SetError(capturedError)
    opened.Open()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    let metrics = WindowReadbackTestFixture.Metrics(opened)
    let scrollRangeValue = ScrollbarCell.Viewport.ScrollRange
    Require(scrollRangeValue.X == 0.0 && scrollRangeValue.Y == 200.0,
      "Scrollbar range was not published")
    let initial = PrimitiveReadback(opened, metrics)
    let initialThumb = PrimitiveLogicalPixel(initial.Pixels, initial.Width, metrics, 116.0, 30.0)
    Require(int32(initialThumb[0]) > 150 && int32(initialThumb[1]) > 150
        && int32(initialThumb[2]) > 150,
      "Scrollbar Vulkan scrollbar thumb was not rendered: " + PrimitivePixelText(initialThumb))

    WindowReadbackTestFixture.InputQueuePointerPress(opened, 116.0, 30.0)
    WindowReadbackTestFixture.InputQueuePointerMove(opened, 116.0, 80.0)
    WindowReadbackTestFixture.InputQueuePointerRelease(opened, 116.0, 80.0)
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    let draggedOffset = ScrollbarCell.Viewport.ScrollOffset.Y
    Require(draggedOffset > 155.0 && draggedOffset < 157.0,
      "Scrollbar drag did not map to the immediate offset")
    let dragged = PrimitiveReadback(opened, metrics)
    let oldThumb = PrimitiveLogicalPixel(dragged.Pixels, dragged.Width, metrics, 116.0, 30.0)
    let movedThumb = PrimitiveLogicalPixel(dragged.Pixels, dragged.Width, metrics, 116.0, 80.0)
    Require(int32(oldThumb[2]) > int32(oldThumb[0]) + 60,
      "Scrollbar left stale pixels at its old position: " + PrimitivePixelText(oldThumb))
    Require(int32(movedThumb[0]) > 150 && int32(movedThumb[1]) > 150
        && int32(movedThumb[2]) > 150,
      "Scrollbar dragged scrollbar thumb was not rendered at its new position: " + PrimitivePixelText(movedThumb))

    cell.HideScrollbar()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    let hidden = PrimitiveReadback(opened, metrics)
    let hiddenThumb = PrimitiveLogicalPixel(hidden.Pixels, hidden.Width, metrics, 116.0, 80.0)
    Require(int32(hiddenThumb[2]) > int32(hiddenThumb[0]) + 60,
      "Scrollbar hidden scrollbar still rendered its thumb: " + PrimitivePixelText(hiddenThumb))
    Require(ScrollbarCell.Viewport.JumpTo(0.0, 200.0),
      "Scrollbar hidden scrollbar disabled programmatic scrolling")
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    Require(ScrollbarCell.Viewport.ScrollOffset.Y == 200.0,
      "Scrollbar hidden scrollbar did not preserve immediate scrolling")

    opened.RequestClose()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    Require(!opened.IsOpen, "Scrollbar gate window did not close")
    Require(WindowReadbackTestFixture.ResidentResourceBytes(opened) == 0uL,
      "Scrollbar resources remain resident after close")
    Console.SetError(originalError)
    ReadbackValidateCommonDiagnostics(capturedError.ToString())
    Console.WriteLine("Scrollbar_SCROLLBAR_GATE_PASS range=200 drag=" + draggedOffset.ToString("F2"))
  } finally {
    Console.SetError(originalError)
    if let active = window {
      if active.IsOpen {
        active.RequestClose()
        WindowReadbackTestFixture.ForceRender(active, 0.0)
      }
    }
  }
}
