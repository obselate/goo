package GooGallery

import Goo

class NativeGlassCell : Cell {
    internal var Window Window?
    private var solid bool
    private var name string = "Untitled studio"

    override func Build() Blob -> Container{
        Width: Percent(100),
        Height: Percent(100),
        Padding: 28,
        Gap: 18,
        Color: "#eceded",
        FontFamily: GalleryTheme.ElementFontFamily,
        FontSize: 14,
        Text{Content: "GOO / INK", Color: "#b8bfc9", FontSize: 12},
        Text{Content: "Desktop glass", FontFamily: GalleryTheme.GalleryFontFamily, FontSize: 28},
        Text{Content: "Move this window over another app to see the native blur.", Color: "#b8bfc9"},
        Container{
            Padding: 20,
            Gap: 12,
            BorderRadius: 10,
            BorderWidth: 1,
            BorderColor: Color.Parse("#333947"),
            BackgroundColor: Color.Parse("#11141b").WithAlpha(0.92),
            Text{Content: "Workspace name", FontWeight: 500},
            TextEntry{
                Value: name,
                Height: 34,
                Padding: Edges{Left: 10, Right: 10},
                BackgroundColor: "#090b10",
                BorderColor: Color.Parse("#6b7385"),
                BorderWidth: 1,
                BorderRadius: 6,
                Focus: Style{BorderColor: Color.Parse("#6fa6de")},
                OnChange: (value string) -> {
                    name = value
                },
            },
            Text{Content: "Text and controls stay sharp over the desktop material.", Color: "#9099a8", FontSize: 12},
        },
        Container{
            FlexDirection: FlexDirection.Row,
            Gap: 10,
            Button{
                Height: 34,
                Padding: Edges{Left: 14, Right: 14},
                BorderRadius: 6,
                BackgroundColor: "#478ad1",
                Color: "#090b10",
                OnClick: () -> SetSolid(false),
                Text{Content: "Native glass", FontWeight: 600},
            },
            Button{
                Height: 34,
                Padding: Edges{Left: 14, Right: 14},
                BorderRadius: 6,
                BorderWidth: 1,
                BorderColor: Color.Parse("#6b7385"),
                BackgroundColor: "#11141b",
                OnClick: () -> SetSolid(true),
                Text{Content: "Solid surface", FontWeight: 600},
            },
        },
        Text{
            Content: solid ? "Solid Ink surface": (
                Window?.BackdropAvailable == true ? "Native compositor blur available": "Native blur unavailable. Solid fallback active."
            ),
            Color: "#b8bfc9",
            FontSize: 12,
        },
    }

    private func SetSolid(value bool) {
        solid = value
        if let window = Window {
            window.Backdrop = value ? WindowBackdrop.None: WindowBackdrop.Blur
            window.Background = Color.Parse("#090b10").WithAlpha(value ? 1.0: 0.78)
        }
    }
}

class NativeGlassWindow {
    shared {
        internal func Run() {
            let root = NativeGlassCell{}
            let window = Window{
                Title: "Goo Ink - native desktop glass",
                Width: 660,
                Height: 430,
                MinWidth: 520,
                MinHeight: 400,
                Backdrop: WindowBackdrop.Blur,
                BackdropFallbackColor: "#090b10",
                Background: Color.Parse("#090b10").WithAlpha(0.78),
                Root: root,
            }
            root.Window = window
            window.Open()
            root.Rebuild()
            var available = window.BackdropAvailable
            window.SetInterval(
                () -> {
                    if available != window.BackdropAvailable {
                        available = window.BackdropAvailable
                        root.Rebuild()
                    }
                },
                1000.0
            )
            window.Run()
        }
    }
}
