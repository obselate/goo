# Get started

Create the [starter counter](../README.md#use) first. See [platform requirements](platform-preflight.md) if it does not start.

## 1. Extract a component

A component is a `data struct` with a conversion to `Blob`. A stateless component returns its tree. Replace `Program.gs` with this complete program:

```gsharp
package LearnGoo

import Goo
import System

data struct CounterButton {
    var Count int32
    var OnAdd Action
    func Build() Blob -> Button{
        OnClick: OnAdd,
        Text{Content: "Add one (count: $Count)"},
    }
}

func operator implicit(value CounterButton) Blob -> value.Build()

data struct Counter {
    var Key string?
}

class CounterCell : Cell[Counter] {
    private var count int32

    protected override func Build(input Counter) Blob -> Column{
        Width: Percent(100),
        Text{Content: "Count: $count"},
        CounterButton{Count: count, OnAdd: () -> { count++ }},
    }
}

func operator implicit(value Counter) Blob -> Cell.Mount[Counter, CounterCell](value.Key, value)

func Main() {
    Application.Configure("Goo learning", "1.0.0", "com.example.goolearning")
    Application.Run(Window{Title: "Goo learning", Size: LayoutSize(360, 220), Root: CounterCell{}})
}
```

`CounterButton` receives the count and callback. `CounterCell` owns the state. Goo rebuilds it after the callback, so both labels update.

Restart `goo dev` after this structural edit. Click three times. Both labels must show `3`.

## 2. Compose children with their own state

Keep the component types. Add this parent:

```gsharp
class Counters : Cell {
    override func Build() Blob -> Column(){Counter{}, Counter{}}
}
```

Change the window's `Root` to `Counters{}`.

Restart `goo dev`. Click the first button three times and the second once. The first counter must show `3` and the second `1`.

The conversion calls `Mount`, which retains each child and its fields at its sibling position. Set `Key` when siblings can move, be inserted or be removed. Use `Name(){children}` when there are no member assignments, or `Name{Gap: 8, children}` when there are.

Goo handles rebuilds after its input, Cell post, timer and async callbacks, even when a child renders the callback. A changed `State[T]` value rebuilds the Cells that read it in `Build`. Call `Rebuild()` only for plain state changed outside Goo. See [Cell inputs, identity and lifetime](api/cell.md).

## State

Both actions can change the same Cell field. Add this child beside `CounterButton` in `CounterCell.Build`:

```gsharp
Button{
    OnClick: () -> { count = 0 },
    Text{Content: "Reset"},
},
```

Click Add three times, then Reset. Both labels must show zero.

See the [tutorial catalog](README.md#tutorials), [hot reload exercise](devtools/README.md#edit-a-running-app), [tree composition](api/tree.md) and [shipping](shipping.md).
