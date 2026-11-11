# A virtual list

Start with the [tutorial setup](../README.md#tutorial-setup). Replace `Program.gs`, then run `goo dev`.

## Build rows near the viewport
Keep stable row keys and a cached builder in a bounded viewport.

```gsharp
package Tutorial

import Goo
import Goo.Widgets
import Goo.Widgets.Data
import System

class Example : Cell {
    private let items []string
    private let buildRow Func[string, Blob]

    init() {
        items = CreateItems()
        buildRow = BuildRow
    }

    override func Build() Blob {
        let theme = Theme.Read()
        let list = VirtualRows[string](items, theme.ControlHeight, ItemKey, buildRow)
        list.FlexGrow = 1
        list.MinHeight = 0
        return Container{
            BasedOn: theme.CanvasStyle,
            Width: Percent(100),
            Height: Percent(100),
            Padding: theme.Spacing * 6,
            Gap: theme.Spacing * 3,
            Text{Content: "100,000 rows", FontSize: theme.HeadingFontSize},
            list,
        }
    }
    private func ItemKey(item string) string -> item

    private func BuildRow(item string) Blob {
        let theme = Theme.Read()
        return Container{
            Height: theme.ControlHeight,
            JustifyContent: JustifyContent.Center,
            Padding: Edges{Left: theme.Spacing * 3},
            BorderWidth: Edges{Bottom: theme.BorderWidth},
            BorderColor: theme.BorderColor,
            Text{Content: item},
        }
    }

    private func CreateItems() []string {
        let rows = [100000]string
        for index in 0 ... rows.Length {
            rows[index] = "Record ${index + 1}"
        }
        return rows
    }
}

func Main() {
    Window.ConfigureApplication("A virtual list", "1.0.0", "com.example.tutorial")
    let window = Window{Title: "A virtual list", Width: 480, Height: 480, Root: Example{}}
    Theme.Attach(window, Theme.Default)
    window.Run()
}
```
