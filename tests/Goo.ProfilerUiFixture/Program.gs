package GooProfilerUiFixture

import Goo
import System

class ProfilerScene : Cell {
    private let image ImageSource
    private var count int32

    init(source ImageSource) { image = source }

    override func Build() Blob -> Container{
        Width: Percent(100),
        Height: Percent(100),
        Padding: 24,
        Gap: 16,
        BackgroundColor: Color.Rgb(24, 31, 43),
        Text{Content: "Goo profiler fixture", FontSize: 24, Color: Color.White},
        Button{
            Key: "profiler-workload",
            Padding: 12,
            BackgroundColor: Color.Rgb(74, 125, 255),
            OnClick: () -> { count++ },
            Text{Content: "Render $count", Color: Color.White},
        },
        Image{Source: image, Width: 160 + count * 16, Height: 160 + count * 16},
    }
}

func Main() {
    let pixels = [64 * 64 * 4]uint8
    Array.Fill(pixels, uint8(255))
    using let image = ImageSource(64, 64, pixels)
    Window{Title: "Goo profiler fixture", Width: 640, Height: 480, Root: ProfilerScene(image)}.Run()
}
