# Drag and drop a list

Start with the [tutorial setup](../README.md#tutorial-setup). Replace `Program.gs`, then run `goo dev`.

## Reorder rows
Drop a row onto another row to move it before that row.

```gsharp
package Tutorial

import Goo
import Goo.Widgets
import System.Collections.Generic

class Example : Cell {
    private var items []string = []string{"Plan", "Build", "Review", "Ship"}

    override func Build() Blob {
        let theme = Theme.Read()
        return Container{
            BasedOn: theme.CanvasStyle,
            Width: Percent(100),
            Height: Percent(100),
            Padding: theme.Spacing * 6,
            Gap: theme.Spacing * 3,
            Text{Content: "Drag a row onto another row", FontSize: theme.HeadingFontSize},
            BuildRow(items[0]),
            BuildRow(items[1]),
            BuildRow(items[2]),
            BuildRow(items[3]),
        }
    }

    private func BuildRow(item string) Blob {
        let theme = Theme.Read()
        return Container{
            Key: item,
            Padding: theme.Spacing * 3,
            BorderWidth: Edges{Bottom: theme.BorderWidth},
            BorderColor: theme.BorderColor,
            DragSource: DragSource((_ DragStartEvent) -> DragData(item, DragEffect.Move)),
            DropTarget: DropTarget(
                (event DragEvent) -> if event.Data.Value is string { DragEffect.Move } else { DragEffect.None },
                (event DragEvent) -> {
                    if event.Kind == DragEventKind.Drop && event.Data.Value is string source && source != item {
                        let next = List[string](items)
                        next.Remove(source)
                        next.Insert(next.IndexOf(item), source)
                        items = next.ToArray()
                    }
                }
            ),
            Text{Content: item},
        }
    }
}

func Main() {
    Window.ConfigureApplication("Drag and drop a list", "1.0.0", "com.example.tutorial")
    let window = Window{Title: "Drag and drop a list", Width: 480, Height: 320, Root: Example{}}
    Theme.Attach(window, Theme.Default)
    window.Run()
}
```
