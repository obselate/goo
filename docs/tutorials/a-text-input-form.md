# A text input form

Start with the [tutorial setup](../README.md#tutorial-setup). Replace `Program.gs`, then run `goo dev`.

- `name` retains the field value. `OnChange` updates it.
- `OnSubmit` and Save both update the greeting.
- TextField supplies editing keys and Tab focus.

```gsharp
package Tutorial

import Goo
import Goo.Widgets
import Goo.Widgets.Actions
import Goo.Widgets.Inputs

class Example : Cell {
    private var name string = "Ada"
    private var greeting string = "Enter a name and select Save."

    override func Build() Blob {
        let theme = Theme.Read()
        return Column{
            BasedOn: theme.CanvasStyle,
            Width: Percent(100),
            Height: Percent(100),
            Padding: theme.Spacing * 6,
            Gap: theme.Spacing * 3,
            TextField{
                Width: Percent(100),
                Label: "Name",
                Value: name,
                OnChange: (value string) -> {
                    name = value
                },
                OnSubmit: (value string) -> {
                    greeting = "Hello, $value"
                },
            },
            ActionButton{Content: "Save", OnClick: () -> { greeting = "Hello, $name" }},
            Text{Content: greeting},
        }
    }
}

func Main() {
    Application.Configure("A text input form", "1.0.0", "com.example.tutorial")
    let window = Window{Title: "A text input form", Size: LayoutSize(400, 240), Root: Example{}}
    Theme.Attach(window, Theme.Default)
    Application.Run(window)
}
```
