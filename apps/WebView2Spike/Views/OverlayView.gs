package WebView2Spike

import Goo

class OverlayView : Cell {
    override func Build() Blob -> Container{
        Width: Percent(100),
        Height: Percent(100),
        AlignItems: AlignItems.Center,
        JustifyContent: JustifyContent.Center,
        BorderRadius: SpikeTheme.BadgeRadius,
        BackgroundColor: SpikeTheme.Overlay,
        Text{Content: "Goo overlay", Color: SpikeTheme.OverlayText, FontSize: SpikeTheme.LabelSize},
    }
}
