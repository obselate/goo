# Get started

Install [.NET SDK 10.0.403 or a later 10.0 SDK](https://dotnet.microsoft.com/download/dotnet/10.0).
Check with `dotnet --list-sdks`. Use Vulkan 1.3 with timeline semaphores,
synchronization2 and dynamic rendering. Linux requires native Wayland, not X11
or XWayland. Windows x64 and macOS arm64 are also supported.
See [platform requirements](platform-preflight.md).

```sh
dotnet new install Goo.Templates
dotnet tool install --global Goo.DevTools
dotnet new goo -n HelloGoo
cd HelloGoo
goo dev
```

The template restores the G# compiler from NuGet automatically.
`goo dev` runs the counter with hot reload.

## 1. Extract a function

A function can return a `Blob`, just like `Build`. Use one to name a piece of
UI that does not need its own state. Replace `Program.gs` with this complete program:

```gsharp
package LearnGoo

import Goo
import System

func ActionButton(count int32, onAdd Action) Blob -> Button{
    OnClick: onAdd,
    Text{Content: "Add one (count: $count)"},
}

class Counter : Cell {
    private var count int32

    override func Build() Blob -> Container{
        Width: Percent(100),
        Text{Content: "Count: $count"},
        ActionButton(count, () -> { count++ }),
    }
}

func Main() {
    Window.ConfigureApplication("Goo learning", "1.0.0", "com.example.goolearning")
    Window{Title: "Goo learning", Width: 360, Height: 220, Root: Counter{}}.Run()
}
```

The function receives the count and a callback. The `Counter` still owns the
state and the button's input callback. Goo rebuilds it after the callback, so
both labels update without a manual `Rebuild()`.

Restart `goo dev` after this structural edit. Click three times. Both labels
must show `3`.

## 2. Mount a child when it needs state

To show two independent counters, give each one its own Cell. Replace
`Program.gs` with this complete program:

```gsharp
package LearnGoo

import Goo
import System

func ActionButton(count int32, onAdd Action) Blob -> Button{
    OnClick: onAdd,
    Text{Content: "Add one (count: $count)"},
}

class Counter : Cell {
    private var count int32

    override func Build() Blob -> Container{
        Width: Percent(100),
        Text{Content: "Count: $count"},
        ActionButton(count, () -> { count++ }),
    }
}

class Counters : Cell {
    override func Build() Blob -> Container{
        Width: Percent(100),
        Cell.Mount[Counter](),
        Cell.Mount[Counter](),
    }
}

func Main() {
    Window.ConfigureApplication("Goo learning", "1.0.0", "com.example.goolearning")
    Window{Title: "Goo learning", Width: 360, Height: 220, Root: Counters{}}.Run()
}
```

Restart `goo dev`. Click the first button three times and the second once.
The first counter must show `3` and the second `1`.

`Mount` retains each child and its fields at its sibling position across builds.
Call `Mount`, not the child's `Build`, to use a child Cell. Use a key when
children can be inserted, removed or reordered.

Goo rebuilds the Cell that authored an input callback, even when a child renders it.
State changed outside input callbacks needs `Rebuild()` on the UI thread.
See [Cell inputs, identity and lifetime](api/cell.md) for those cases.

## 3. Continue by task

- Follow [Managing state](tutorials/managing-state.md) for shared state and reset actions.
- Use the [tutorials](tutorials/README.md) for forms, lists, themes, animation and drawing.
- Try [edit and inspect](edit-and-inspect.md).
- Read [native composition](native-authoring.md) and [shipping](shipping.md).
- Use the [SVG loader](svg.md) and [images guide](images.md) for assets.
- See the [app-author index](README.md) for the remaining guides.
