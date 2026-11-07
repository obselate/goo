package GooStarter

import Goo
import System
import System.Collections.Generic

shared class StarterTheme {
    public let Padding Edges = 24
    public let Gap Length = 12
    public let ButtonPadding Edges = 10
    public let Radius Length = 10
    public let FontSize Length = 24
    public let Background Color = Color.Rgb(24, 31, 43)
    public let Accent Color = Color.Rgb(74, 125, 255)
    public let Foreground Color = Color.White
    public let LightBackground Color = Color.White
    public let LightForeground Color = Color.Black
}

class Counter : Cell {
    private var count int32
    private let context Context[SystemTheme] = Context[SystemTheme]()

    init(value int32 = 0) {
        count = value
    }

    override func Build() Blob {
        let dark = context.Window.Preferences.Theme != SystemTheme.Light
        return Container{
            Width: Percent(100),
            Height: Percent(100),
            Padding: StarterTheme.Padding,
            Gap: StarterTheme.Gap,
            BackgroundColor: if dark {
                StarterTheme.Background
            } else {
                StarterTheme.LightBackground
            },
            Text{
                Content: "Count: $count",
                FontSize: StarterTheme.FontSize,
                Color: if dark {
                    StarterTheme.Foreground
                } else {
                    StarterTheme.LightForeground
                }
            },
            Button{
                Padding: StarterTheme.ButtonPadding,
                BorderRadius: StarterTheme.Radius,
                BackgroundColor: StarterTheme.Accent,
                OnClick: () -> {
                    count++
                },
                Text{Content: "Add one", Color: StarterTheme.Foreground},
            },
        }
    }
}

func Main() {
    Window.ConfigureApplication("Goo starter", "1.0.0", "com.example.goostarter")
    Window{
        Title: "Goo starter",
        Width: 360,
        Height: 220,
        Root: Counter(),
        Scenes: Dictionary[string, Func[Cell]]{["default"] = () -> Counter(), ["incremented"] = () -> Counter(5)}
    }.Run()
}
