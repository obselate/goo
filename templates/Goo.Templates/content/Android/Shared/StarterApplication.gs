package GooStarter

import Goo

shared class StarterTheme {
    public let Padding Edges = 24
    public let Gap Length = 12
    public let ButtonPadding Edges = 10
    public let Radius Length = 10
    public let FontSize Length = 24
    public let Background Color = Color.Rgb(24, 31, 43)
    public let Accent Color = Color.Rgb(74, 125, 255)
    public let Foreground Color = Color.White
}

public class StarterApplication {
    shared {
        public func CreateWindow() Window -> Window{Root: Counter{}}
    }
}

class Counter : Cell {
    private let count State[int32] = State[int32](0)

    override func Build() Blob -> Column{
        Width: Percent(100),
        Height: Percent(100),
        Padding: StarterTheme.Padding,
        Gap: StarterTheme.Gap,
        BackgroundColor: StarterTheme.Background,
        Text{Content: "Count: ${count.Value}", FontSize: StarterTheme.FontSize, Color: StarterTheme.Foreground},
        Button{
            Padding: StarterTheme.ButtonPadding,
            BorderRadius: StarterTheme.Radius,
            BackgroundColor: StarterTheme.Accent,
            OnClick: () -> {
                count.Value++
            },
            Text{Content: "Add one", Color: StarterTheme.Foreground},
        },
    }
}
