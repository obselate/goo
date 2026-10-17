# After the counter

Use the [version baseline](README.md#version-baseline) and start with the
[template counter](../README.md#quick-start).

## 1. Separate a second Cell

SVG loading is included in Goo; no separate SVG package is needed.

Replace `Program.gs` with the complete program below. It separates the parent's
count from the child's click count and retains one parsed asset:

```gsharp
package LearnGoo

import Goo
import Goo.Svg
import System

class CounterActions : Cell, IDisposable {
    private var clicks int32
    private let icon VectorAsset = Svg.Parse("<svg viewBox='0 0 16 16'><path fill='#4a7dff' d='M7 0h2v7h7v2H9v7H7V9H0V7h7z'/></svg>")
    public var OnAdd Action?

    public init() {
        Console.WriteLine("CounterActions created")
    }

    override func Build() Blob -> Button{
        Padding: 10,
        Gap: 8,
        BackgroundColor: Color.Rgb(45, 54, 70),
        OnClick: () -> {
            clicks++
            OnAdd?.Invoke()
        },
        Container{Width: 24, Height: 24, icon.Render(),},
        Text{Content: "Add one ($clicks clicks)", Color: Color.White},
    }

    public func Dispose() {
        Console.WriteLine("CounterActions disposed")
    }
}

class Counter : Cell {
    private var count int32

    override func Build() Blob -> Container{
        Width: Percent(100),
        Height: Percent(100),
        Padding: 24,
        Gap: 12,
        BackgroundColor: Color.Rgb(24, 31, 43),
        Text{Content: "Count: $count", FontSize: 24, Color: Color.White},
        Cell.Mount[CounterActions](nil, actions -> {
            actions.OnAdd = () -> {
                count++
                Rebuild()
            }
        }),
    }
}

func Main() {
    Window.ConfigureApplication("Goo learning", "1.0.0", "com.example.goolearning")
    Window{Title: "Goo learning", Width: 420, Height: 240, Root: Counter{}}.Run()
}
```

Run the app:

```sh
dotnet run
```

## 2. Read the fields and callback

- `private var clicks int32` is a typed, mutable field, initially zero.
- `private let icon VectorAsset = ...` is a typed retained field. Class fields
  need their declared type. The parser runs when the child is constructed, not
  on each `Build`. `VectorAsset` is immutable and needs no `Dispose` call.
- The parent supplies an `Action?` callback through the mount's configuration.
  The child owns `clicks`, while the parent owns `count`.
- Goo input dispatch rebuilds the child that owns the button. The callback also
  changes the parent, so it calls the parent's `Rebuild()` explicitly.

Click three times. Both labels must show `3`. Rebuilding the parent must not
print another `CounterActions created` or reset the child's click count.

## 3. Follow the lifetime

`Cell.Mount` retains the child at its sibling position. `nil` selects an unkeyed
mount. Give a key to a child that can be inserted, removed or reordered.
See [Cell identity and mounting](api/cell.md#mount-parameterless-cells).

`Build()` returns a fresh description, not a new lifetime for retained fields.
Goo calls `IDisposable.Dispose` when the mounted child is removed or its window
closes. Close the window normally and check for `CounterActions disposed`.
Do not call a child's `Build()` to mount it.

## 4. Continue by task

1. Read [Cell inputs and rebuilds](api/cell.md#build-input-cells), then
   [native composition](native-authoring.md).
2. Try [edit and inspect](edit-and-inspect.md).
3. Use the [SVG loader](svg.md) for file/stream loading and
   [images guide](images.md) for asset handling.
4. Add [widgets and controlled inputs](https://github.com/obselate/goo-widgets/blob/main/docs/usage.md).
5. Follow [shipping](shipping.md). Use the [app-author index](README.md) for the
   remaining task and API guides.
