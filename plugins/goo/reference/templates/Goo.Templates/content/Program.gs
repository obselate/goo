package GooStarter

import Goo

data struct CounterInput {
  var Title string
  var Accent Color
}

open class CounterCell : Cell[CounterInput] {
  shared {
    let Card Style = Style{
      Padding: 24,
      Gap: 12,
      BorderRadius: 16,
      BackgroundColor: Color.Rgb(20, 27, 39),
    }
    let Action Style = Style{
      Padding: 10,
      BorderRadius: 10,
    }
  }

  private var count int32

  protected override func Build(input CounterInput) Blob -> Container {
    BasedOn: Card,
    Width: Length.Percent(100),
    Height: Length.Percent(100),
    Children: {
      Text{
        Content: input.Title + ": " + count.ToString(),
        FontSize: 24,
        Color: Color.White,
      },
      Button{
        BasedOn: Action,
        BackgroundColor: input.Accent,
        OnClick: () -> { count++ },
        Children: {
          Text{ Content: "Add one", Color: Color.White },
        },
      },
    },
  }
}

class MainCell : Cell {
  override func Build() Blob -> Container { Children: {
    Cell.Mount[CounterInput, CounterCell]("counter", CounterInput{
      Title: "Count",
      Accent: Color.Rgb(74, 125, 255),
    }),
  } }
}

func Main() {
  Window.ConfigureApplication("Goo starter", "1.0.0", "com.example.goostarter")
  let window = Window{ Title: "Goo starter", Width: 360, Height: 220, Root: MainCell{} }
  window.StateChanged += (state) -> {
    if state == WindowState.Maximized { window.Title = "Goo starter - maximized" }
  }
  window.Run()
}
