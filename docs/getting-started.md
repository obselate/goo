# Get started

Create the [starter counter](../README.md#use) first. See [platform requirements](platform-preflight.md) if it does not start.

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

Keep `ActionButton` and `Counter`. Add this parent:

```gsharp
class Counters : Cell {
    override func Build() Blob -> Container{
        Width: Percent(100),
        Cell.Mount[Counter](),
        Cell.Mount[Counter](),
    }
}
```

Change the window's `Root` to `Counters{}`.

Restart `goo dev`. Click the first button three times and the second once.
The first counter must show `3` and the second `1`.

`Mount` retains each child and its fields at its sibling position across builds.
Call `Mount`, not the child's `Build`, to use a child Cell. Use a key when
children can be inserted, removed or reordered.

Goo rebuilds the Cell that authored an input callback, even when a child renders it.
State changed outside input callbacks needs `Rebuild()` on the UI thread.
See [Cell inputs, identity and lifetime](api/cell.md) for those cases.

## State

Both actions can change the same Cell field. Add this child beside `ActionButton` in `Counter.Build`:

```gsharp
Button{
    OnClick: () -> { count = 0 },
    Text{Content: "Reset"},
},
```

Click Add three times, then Reset. Both labels must show zero.

See the [tutorial catalog](README.md#tutorials), [hot reload exercise](devtools/README.md#edit-a-running-app), [tree composition](api/tree.md) and [shipping](shipping.md).
