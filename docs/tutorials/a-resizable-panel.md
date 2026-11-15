# A resizable panel

Start with the [tutorial setup](../README.md#tutorial-setup). Replace `Program.gs` with this program, then run `goo dev`.

- `Value` reads the ratio retained by the Cell.
- `OnChange` updates it. Drag the divider or focus it and use arrow keys.

```gsharp
package Tutorial

import Goo
import Goo.Widgets
import Goo.Widgets.Actions
import Goo.Widgets.Layout

class Example : Cell {
    private var ratio float64 = .35

    override func Build() Blob {
        let theme = Theme.Read()
        return Column{
            BasedOn: theme.CanvasStyle,
            Width: Percent(100),
            Height: Percent(100),
            Padding: theme.Spacing * 6,
            Gap: theme.Spacing * 3,
            Cell.Mount[SplitPaneInput, SplitPane](
                "panes",
                SplitPaneInput{
                    Value: ratio,
                    MinimumFirst: theme.ControlHeight * 3,
                    MinimumSecond: theme.ControlHeight * 3,
                    First: Container{
                        BasedOn: theme.PanelStyle,
                        Width: Percent(100),
                        Height: Percent(100),
                        Padding: theme.Spacing * 3,
                        Text{Content: "Navigation"},
                    },
                    Second: Column{
                        Width: Percent(100),
                        Height: Percent(100),
                        Padding: theme.Spacing * 3,
                        Text{Content: "Workspace"},
                        ActionButton{
                            Content: "Reset split",
                            OnClick: () -> { ratio = .35 },
                        },
                    },
                    OnChange: (value float64) -> {
                        ratio = value
                    },
                }
            ),
        }
    }
}

func Main() {
    Application.Configure("A resizable panel", "1.0.0", "com.example.tutorial")
    let window = Window{Title: "A resizable panel", Size: LayoutSize(600, 320), Root: Example{}}
    Theme.Attach(window, Theme.Default)
    Application.Run(window)
}
```
