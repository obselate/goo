package GooAsyncReadbackSmoke

import Goo
import System
import System.IO

class TransparentWindowCell : Cell {
  private var bright bool

  func Toggle() {
    bright = !bright
    Rebuild()
  }

  override func Build() Blob -> Container() {.Width: 96,.Height: 96,
    Container() {.Width: 48,.Height: 48,
      .BackgroundColor: bright ? Color.Rgba(255, 255, 255, 128) : Color.Rgba(32, 96, 224, 128),
    },
  }
}

func RunTransparentWindowSmoke() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let root = TransparentWindowCell()
  let window = Window{ Title: "Goo transparent window gate", Width: 96, Height: 96,
    VSync: false, Transparent: true, Background: Color.Transparent, Root: root }
  let capturedError = StringWriter()
  let originalError = Console.Error
  try {
    Console.SetError(capturedError)
    window.Open()
    var frame int32 = 0
    while frame < 8 {
      WindowReadbackTestFixture.ForceRender(window, 0.0166666666666667)
      root.Toggle()
      frame = frame + 1
    }
    window.RequestClose()
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    Require(!window.IsOpen, "Transparent window gate did not close")
  } finally {
    Console.SetError(originalError)
    if window.IsOpen {
      window.RequestClose()
      WindowReadbackTestFixture.ForceRender(window, 0.0)
    }
  }
  ReadbackValidateCommonDiagnostics(capturedError.ToString())
  Console.WriteLine("transparent-window-smoke: frames=8 close=1")
}
