package GooStarter

import Goo

class Counter : Cell {
    private var count int32

    override func Build() Blob -> Container{
        Width: Length.Percent(100),
        Height: Length.Percent(100),
        Padding: 24,
        Gap: 12,
        BackgroundColor: Color.Rgb(24, 31, 43),
        Text{Content: "Count: $count", FontSize: 24, Color: Color.White},
        Button{
            Padding: 10,
            BorderRadius: 10,
            BackgroundColor: Color.Rgb(74, 125, 255),
            OnClick: () -> {
                count++
            },
            Text{Content: "Add one", Color: Color.White},
        },
    }
}

func Main() {
    Window.ConfigureApplication("Goo starter", "1.0.0", "com.example.goostarter")
    Window{Title: "Goo starter", Width: 360, Height: 220, Root: Counter{}}.Run()
}
