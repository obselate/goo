package WebView2Spike

import Goo

class SpikeView : Cell {
    private let host WebViewHost

    init(host WebViewHost) {
        this.host = host
    }

    override func Build() Blob -> Container{
        Width: Percent(100),
        Height: Percent(100),
        Padding: SpikeTheme.WindowPadding,
        Handle: host.Root,
        Container{
            Flex: 1,
            Padding: SpikeTheme.PanelPadding,
            BackgroundColor: SpikeTheme.Panel,
            Text{Content: "Goo content", Color: SpikeTheme.Label, FontSize: SpikeTheme.LabelSize},
            Container{
                Flex: 1,
                AlignItems: AlignItems.Center,
                JustifyContent: JustifyContent.Center,
                Container{
                    BorderWidth: SpikeTheme.BorderWidth,
                    BorderColor: SpikeTheme.Border,
                    Container{
                        Width: SpikeTheme.RegionWidth,
                        Height: SpikeTheme.RegionHeight,
                        BackgroundColor: SpikeTheme.RegionFill,
                        Handle: host.Region,
                        OnPointerMove: (e PointerEvent) -> host.PointerMoved(e.Position),
                        OnPointerDown: (e PointerEvent) -> host.PointerPressed(e.Button, e.Position),
                        OnPointerUp: (e PointerEvent) -> host.PointerReleased(e.Button, e.Position),
                        OnWheel: (e WheelEvent) -> host.Wheel(e.Delta.Y, e.Position),
                    },
                    Container{
                        Position: PositionType.Absolute,
                        Left: -SpikeTheme.BadgeWidth / 2.0,
                        Top: (SpikeTheme.RegionHeight - SpikeTheme.BadgeHeight) / 2.0,
                        Width: SpikeTheme.BadgeWidth,
                        Height: SpikeTheme.BadgeHeight,
                        BorderRadius: SpikeTheme.BadgeRadius,
                        Handle: host.Badge,
                        OnPointerDown: (e PointerEvent) -> host.BadgePressed(),
                    },
                },
            },
        },
    }
}
