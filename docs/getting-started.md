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
    private let count State[int32] = State[int32](0)

    override func Build() Blob -> Column{
        Width: Percent(100),
        Text{Content: "Count: ${count.Value}"},
        ActionButton(count.Value, () -> { count.Value++ }),
    }
}

func Main() {
    Application.Configure("Goo learning", "1.0.0", "com.example.goolearning")
    Application.Run(Window{Title: "Goo learning", Size: LayoutSize(360, 220), Root: Counter{}})
}
```

The function receives the count and a callback. `Counter` owns the `State`
value. Goo tracks the read in `Build` and updates both labels when the value
changes. No `Rebuild()` call is needed.

Restart `goo dev` after this structural edit. Click three times. Both labels
must show `3`.

## 2. Add a child when it needs state

Keep `ActionButton` and `Counter`. Add a component value and this parent:

```gsharp
data struct CounterView {
    var Key string?
}

func operator implicit(value CounterView) Blob -> Cell.Mount[Counter](value.Key)

class Counters : Cell {
    override func Build() Blob -> Column{
        Width: Percent(100),
        CounterView{},
        CounterView{},
    }
}
```

Change the window's `Root` to `Counters{}`.

Restart `goo dev`. Click the first button three times and the second once.
The first counter must show `3` and the second `1`.

Goo retains each child and its state at its sibling position across builds.
Write the child as a value, not a call to its `Build`. Use a key when children
can be inserted, removed or reordered.

A changed `State` value rebuilds the Cells that read it in `Build`. Goo also
handles its input, timer, post and async callbacks. Plain state changed in an
external model event needs `Rebuild()` on the UI thread.
See [Cell inputs, identity and lifetime](api/cell.md).

## State

Both actions can change the same state. Add this child beside `ActionButton` in `Counter.Build`:

```gsharp
Button{
    OnClick: () -> { count.Value = 0 },
    Text{Content: "Reset"},
},
```

Click Add three times, then Reset. Both labels must show zero.

See the [tutorial catalog](README.md#tutorials), [hot reload exercise](devtools/README.md#edit-a-running-app), [tree composition](api/tree.md) and [shipping](shipping.md).
