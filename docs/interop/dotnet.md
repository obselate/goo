# Any CLR language

```sh
dotnet run --project samples/interop/VisualBasic -- counter
```

Pack Goo into `artifacts/packages` before running the repository sample.

Goo is a CLR library. Use .NET 10, ordinary objects, delegates and generic calls. See the [VB sample](../../samples/interop/VisualBasic/Program.vb), [C# guide](csharp.md) and [F# guide](fsharp.md).

## Counter

<table>
<tr><th>G#</th><th>VB.NET</th></tr>
<tr><td><pre><code>class Counter : Cell {
    private var count int32
    override func Build() Blob -> Container{
        Text{Content: "Count: $count"},
        Button{
            OnClick: () -> {
                count++
                Rebuild()
            },
            Text{Content: "Add one"},
        },
    }
}</code></pre></td><td><pre><code>Public Class Counter
    Inherits Cell
    Private count As Integer
    Public Overrides Function Build() As Blob
        Return New Container With {
            .Children = New List(Of Blob) From {
                New Text With {.Content = $"Count: {count}"},
                New Button With {
                    .OnClick = AddressOf Increment,
                    .Children = New List(Of Blob) From {
                        New Text With {.Content = "Add one"}}
                }
            }
        }
    End Function
    Private Sub Increment()
        count += 1
        Rebuild()
    End Sub
End Class</code></pre></td></tr>
</table>

Subclass `Cell`, return a `Blob` from `Build()` and call `Rebuild()` after state changes. Assign the cell to `Window.Root`, then call `Run()`.

## Data list

<table>
<tr><th>G#</th><th>VB.NET</th></tr>
<tr><td><pre><code>let rows = names.Select(name ->
    Text{Key: name, Content: name})
let list = Container{
    Text{Content: "Account"},
    ...rows,
    Button{
        OnClick: save,
        Text{Content: "Save"},
    },
}</code></pre></td><td><pre><code>Dim rows = names.Select(Function(name)
    Return DirectCast(New Text With {
        .Key = name, .Content = name}, Blob)
End Function)
Dim children = New List(Of Blob) From {
    New Text With {.Content = "Account"}}
children.AddRange(rows)
children.Add(New Button With {
    .OnClick = save,
    .Children = New List(Of Blob) From {
        New Text With {.Content = "Save"}}})
Dim list = New Container With {.Children = children}</code></pre></td></tr>
</table>

VB uses `AddRange` where G# uses spread syntax. Keyed and unkeyed siblings can mix. Keys retain identity across moves, while unkeyed entries use their absolute sibling index.

## Shared API rules

```vb
Dim basic = New Button With {.Padding = 10}
Dim primary = New Button With {
    .BasedOn = basic,
    .BackgroundColor = Color.Rgb(74, 125, 255)}
Dim rows = VirtualLists.Rows(items, 24, itemKey, buildRow)
Dim viewport = New Container With {.Height = 240, .Children = New List(Of Blob) From {rows}}
```

`BasedOn` copies styles only. Virtual rows belong to `Goo.Widgets.Data.VirtualLists`, available in Goo.Widgets 0.5.0 or later.

| Contract | Rule |
| --- | --- |
| Children | Use an `IList<Blob>`. Writable lists are shared. Read-only lists are copied. C# can assign collection expressions and spreads. |
| Length | Use `Length.Pixels(value)` or `Length.Percent(value)`. |
| Input | Derive from `Cell(Of TInput)` and mount with `Cell.Mount(Of TInput, TCell)(key, input)`. The cell needs a public parameterless constructor. |
| Equality | Inputs use `EqualityComparer<T>.Default`. Override `ShouldRebuild` when reference equality is not suitable. |
| Modal | Mount `ModalDialogHost` with a `ModalDialog` input. Its host owns focus and portal behavior. |
| Try/out | VB passes a typed local by reference. C# uses `out`. F# can match a bool/value tuple. |
| Events | Store and remove the same delegate. F# uses `add_` and `remove_` accessors for Action events. |
| Animation | Use `TransitionMs` with state styles, or keep a cell-owned `Anim` value. |
| Layout | Implement `LayoutAlgorithm`. Callback contexts must not escape. Output sizes must be finite and nonnegative. |
| Async | Await `Task<T>` with the language's normal await syntax. Return UI work through `Window.TryPost` when needed. |
| Ownership | Dispose caller-owned resources. Goo disposes mounted cells that implement `IDisposable`. Do not dispose a retained child during `Build()`. |

The sample also accepts `list`, `variants`, `input`, `virtual`, `dialog` and `layout`. CI builds all three languages against the packed Goo package and runs `--check` without opening a native window.
