# C#

```sh
dotnet run --project samples/interop/CSharp -- counter
```

Pack Goo into `artifacts/packages` before running the repository sample.

Use .NET 10 and C# 14. The [compiled sample](../../samples/interop/CSharp/Program.cs) also accepts `list`, `variants`, `input`, `virtual`, `dialog` and `layout`.

## Counter

<table>
<tr><th>G#</th><th>C#</th></tr>
<tr><td><pre><code>class Counter : Cell {
    private var count int32
    override func Build() Blob -> Container{
        Padding: 24,
        Gap: 12,
        Text{Content: "Count: $count"},
        Button{
            OnClick: () -> {
                count++
                Rebuild()
            },
            Text{Content: "Add one"},
        },
    }
}</code></pre></td><td><pre><code>sealed class Counter : Cell
{
    private int count;
    public override Blob Build() => new Container
    {
        Padding = 24,
        Gap = 12,
        Children =
        [
            new Text { Content = $"Count: {count}" },
            new Button
            {
                OnClick = () => { count++; Rebuild(); },
                Children = [new Text { Content = "Add one" }]
            }
        ]
    };
}</code></pre></td></tr>
</table>

Call `Rebuild()` after changing cell state. Set `Window.Root` to a cell, then call `Run()`.

## Data list

<table>
<tr><th>G#</th><th>C#</th></tr>
<tr><td><pre><code>let rows = names.Select(name ->
    Text{Key: name, Content: name})
let list = Container{
    Text{Content: "Account"},
    ...rows,
    Button{
        OnClick: save,
        Text{Content: "Save"},
    },
}</code></pre></td><td><pre><code>var rows = names.Select(name =>
    (Blob)new Text { Key = name, Content = name });
var list = new Container
{
    Children =
    [
        new Text { Content = "Account" },
        ..rows,
        new Button
        {
            OnClick = save,
            Children = [new Text { Content = "Save" }]
        }
    ]
};</code></pre></td></tr>
</table>

`Children` has an init setter. Both `Children = [..rows]` and `Children = { child }` work.

- Keyed and unkeyed siblings can mix. Keys must be unique among siblings.
- Keys retain identity across moves. Unkeyed entries use their absolute sibling index.
- Writable lists supplied to `Children` are shared. Read-only lists are copied.

## Variants

```csharp
var basic = new Style { Padding = 10, BorderRadius = 10 };
var primary = new Button
{
    BasedOn = basic,
    BackgroundColor = Color.Rgb(74, 125, 255),
    OnClick = save,
    Children = [new Text { Content = "Save" }]
};
```

`BasedOn` copies style declarations. Put it before overrides. It does not copy children, callbacks, keys or handles.

## Virtual rows and dialogs

```csharp
var rows = VirtualLists.Rows(items, 24, itemKey, buildRow);
var viewport = new Container { Height = 240, Children = [rows] };

var dialog = Cell.Mount<ModalDialog, ModalDialogHost>("dialog", new ModalDialog
{
    Open = open,
    Content = new Text { Content = "Save account?" },
    OnClose = Close, OnCancel = Close, OnConfirm = Close
});
```

Use `Goo.Widgets.Data.VirtualLists` from Goo.Widgets 0.5.0 or later. Rows use measured heights and need a bounded viewport.

- Keep row values immutable, keys stable and the builder delegate unchanged.
- Mount `Goo.Widgets.Layout.ModalDialogHost` for modal focus and portal behavior. `ModalDialog.Build()` alone creates an in-parent visual.

## Other CLR APIs

| Need | C# |
| --- | --- |
| Pixel or percentage length | `Length.Pixels(24)`, `Length.Percent(100)` |
| Typed input | Derive from `Cell<AccountInput>`. Override protected `Build(AccountInput input)`. Mount with `Cell.Mount<AccountInput, AccountCell>("account", input)`. |
| Input comparison | Use immutable records. The default comparison is `EqualityComparer<T>.Default`. |
| Try result | `handle.TryGetTextPositionAt(point, space, out var position)` |
| Callback | `OnClick = () => Save()` |
| Event lifetime | Store the delegate. Subscribe with `+=` and remove the same delegate with `-=`. |
| Transition | `TransitionMs = 150, Hover = new Style { BackgroundColor = Color.White }` |
| Custom layout | Implement `LayoutAlgorithm.Measure` and `Arrange`. Return finite, nonnegative sizes. Use `LayoutContext` only in the callback. |
| Async | `await window.ShowFileDialogAsync(FileDialogKind.OpenFile)` returns a status-bearing result. |

- Goo emits nullable reference annotations. Keep C# nullable analysis enabled.
- Goo blobs are classes, not records. Use an app-owned configuration record if non-style defaults need `with` updates.
- Mounted cells own their lifecycle. Implement `IDisposable` for cell-owned subscriptions or resources. Do not dispose a mounted dialog host inside `Build()`.
- `Cell.Animate` returns a cell-owned animation. `Window` is not `IDisposable`.
- Await uses normal .NET context rules. Use `Window.TryPost` when work must return to the UI thread.
