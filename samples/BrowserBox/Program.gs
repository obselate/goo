package BrowserBox

import Goo
import Goo.Wasm
import System

shared class BoxTheme {
  let Background Color = Color.Rgb(24, 31, 43)
  let Accent Color = Color.Rgb(74, 125, 255)
  let Active Color = Color.Rgb(45, 185, 125)
  let Border Color = Color.Rgb(210, 225, 255)
  let Width Length = 240
  let Height Length = 160
  let Radius Length = 28
  let BorderWidth Edges = 4
}

class Box : Cell {
  private let active State[bool] = State[bool](false)

  override func Build() Blob -> Container{
    Width: Percent(100),
    Height: Percent(100),
    AlignItems: AlignItems.Center,
    JustifyContent: JustifyContent.Center,
    BackgroundColor: BoxTheme.Background,
    Button{
      Width: BoxTheme.Width,
      Height: BoxTheme.Height,
      FlexShrink: 0,
      BackgroundColor: if active.Value { BoxTheme.Active } else { BoxTheme.Accent },
      BorderRadius: BoxTheme.Radius,
      BorderWidth: BoxTheme.BorderWidth,
      BorderColor: BoxTheme.Border,
      OnClick: () -> { active.Value = !active.Value },
    },
  }
}

func Main() { Start() }

async func Start() void {
  try {
    let window = Window{Title: "Goo WebGPU Box", Root: Box{}}
    let host = await BrowserWindowHost.AttachAsync(window, "goo")
    Console.WriteLine("GOO_BROWSER_READY")
  } catch (error Exception) {
    Console.Error.WriteLine(error.ToString())
    rethrow
  }
}
