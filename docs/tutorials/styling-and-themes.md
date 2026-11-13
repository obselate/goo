# Styling and themes

Start with the [tutorial setup](../README.md#tutorial-setup). Replace `Program.gs`, then run `goo dev`.

Put `BasedOn` before overrides. Theme changes update subscribed controls.

```gsharp
package Tutorial

import Goo
import Goo.Widgets
import Goo.Widgets.Actions

class Example : Cell {
    private let dark State[bool] = State[bool](false)

    override func Build() Blob {
        let theme = Theme.Read()
        return Column{
            BasedOn: theme.CanvasStyle,
            Width: Percent(100),
            Height: Percent(100),
            Padding: theme.Spacing * 6,
            Gap: theme.Spacing * 3,
            Container{
                BasedOn: theme.PanelStyle,
                Padding: theme.Spacing * 4,
                Text{Content: "Theme tokens", FontSize: theme.H2FontSize},
            },
            ActionButton{
                Content: "Switch theme",
                OnClick: () -> {
                    dark.Value = !dark.Value
                    Theme.SetMode(Host, if dark.Value { ThemeMode.Dark } else { ThemeMode.Light })
                },
            },
        }
    }
}

func Main() {
    Application.Configure("Styling and themes", "1.0.0", "com.example.tutorial")
    let window = Window{Title: "Styling and themes", Size: LayoutSize(400, 220), Root: Example{}}
    Theme.Attach(window, Theme.Default)
    Application.Run(window)
}
```
