# F#

```sh
dotnet run --project samples/interop/FSharp -- counter
```

Pack Goo into `artifacts/packages` before running the repository sample.

The [compiled sample](../../samples/interop/FSharp/Program.fs) uses plain F# on .NET 10. It also accepts `list`, `variants`, `input`, `virtual`, `dialog` and `layout`.

## Counter

<table>
<tr><th>G#</th><th>F#</th></tr>
<tr><td><pre><code>class Counter : Cell {
    private var count int32
    override func Build() Blob -> Container{
        Text{Content: "Count: $count"},
        Button{
            OnClick: () -> {
                count++
            },
            Text{Content: "Add one"},
        },
    }
}</code></pre></td><td><pre><code>module Counter =
    let view count (increment: Action) : Blob =
        let root = Container()
        root.Add(Text(Content = $"Count: {count}"))
        let button = Button(OnClick = increment)
        button.Add(Text(Content = "Add one"))
        root.Add(button)
        root

    let create () =
        let mutable count = 0
        let increment = Action(fun () -&gt; count &lt;- count + 1)
        { new Cell() with
            override _.Build() = view count increment }</code></pre></td></tr>
</table>

Use `open System` and `open Goo`. The module separates the view from local state. The object expression implements `Cell` without a named subclass or `as this`. Create the callback once, outside `Build()`. `Add` changes only the new Blob tree.

Assign `Counter.create()` to `Window.Root`. For a child Cell, keep a factory outside `Build()` and mount it with a stable key:

```fsharp
let counterFactory = Func<Cell>(Counter.create)
let counter = Cell.Mount<Cell>(counterFactory, "counter")
```

The factory runs only for a new mount. Use distinct keys for different components mounted as `Cell`. Goo rebuilds the Cell that authored an input callback after it runs. Call `Rebuild()` for state changed outside input dispatch.

Core `Button` requires explicit activation keys. Goo.Widgets buttons bind Enter and Space. See [shared keyboard rules](dotnet.md#shared-api-rules).

## Data list

<table>
<tr><th>G#</th><th>F#</th></tr>
<tr><td><pre><code>let rows = names.Select(name ->
    Text{Key: name, Content: name})
let list = Container{
    Text{Content: "Account"},
    ...rows,
    Button{
        OnClick: save,
        Text{Content: "Save"},
    },
}</code></pre></td><td><pre><code>let listView (names: string array) (save: Action) =
    let root = Container()
    root.Add(Text(Content = "Account"))
    for name in names do
        root.Add(Text(Key = name, Content = name))
    let button = Button(OnClick = save)
    button.Add(Text(Content = "Save"))
    root.Add(button)
    root

let list = listView names save</code></pre></td></tr>
</table>

Use this for small, bounded data. Keep domain data outside `Build()`. Sort, filter and format collections when the data changes. Use virtual rows for large or unbounded data.

`Add` accepts derived Blobs without a cast, and an annotated `Blob` return or match result upcasts a `Container` without `:> Blob`. The code creates no temporary sequence, F# list or array. This follows the module, closure and object-expression style in [Angel D. Muñoz's Counter](https://github.com/AngelMunoz/Navs/blob/vnext/samples/GooSample/Counter.fs).

F# can also infer child upcasts from a collection's element type:

```fsharp
let children: Blob array = [|
    Text(Content = "Account")
    Button(Children = [| Text(Content = "Save") |])
|]
let list = Container(Children = children)
```

Arrays work with `Children: IList<Blob>`, but Goo copies them into a mutable list. A plain F# `Blob list` cannot be assigned to `Children`. Convert it with `ResizeArray<Blob>(children)` if needed. Prefer `Add` in hot builds to avoid these temporary collections.

See [shared child-list and identity rules](dotnet.md#shared-api-rules).

## Variants and lengths

```fsharp
let basic = Style(Padding = Edges(Length.Pixels 10.))
let primary =
    Button(BasedOn = basic, BackgroundColor = Color.Rgb(74, 125, 255),
        Children = [| Text(Content = "Save") |])
let width = Length.Percent 100.
let color = Color.Parse "#4a7dff"
```

`BasedOn` copies style declarations, not children or callbacks. Named length and color methods avoid `op_Implicit` warnings in typed F# bindings.

## Try methods and events

```fsharp
match handle.TryGetTextPositionAt(point, TextCoordinateSpace.Window) with
| true, position -> ValueSome position
| false, _ -> ValueNone

let focused = Action<bool>(fun value -> printfn "Focused: %b" value)
window.add_FocusChanged focused
window.remove_FocusChanged focused
```

F# turns an omitted out parameter into a tuple result. Goo's `Action` events need explicit add/remove accessors, not `.AddHandler`.

## Virtual rows and dialogs

```fsharp
let rows = VirtualLists.Rows(items, 24., itemKey, buildRow)
let viewport = Container(Height = Length.Pixels 240., Children = [| rows |])

let dialog =
    ModalDialog(Open = isOpen, Padding = Nullable 20.,
        Content = Text(Content = "Save account?"),
        OnCancel = Action close, OnConfirm = Action close)
Cell.Mount<ModalDialog, ModalDialogHost>("dialog", dialog)
```

Use `Goo.Widgets.Data.VirtualLists` from Goo.Widgets 0.5.0 or later. Keep row keys stable, values immutable and the builder delegate unchanged.

| Need | Plain F# |
| --- | --- |
| Typed input | Derive from `Cell<AccountInput>`. Override `Build(input: AccountInput)`. Mount with `Cell.Mount<AccountInput, AccountCell>("account", input)`. |
| Input comparison | Use immutable records. Small snapshots can use `[<Struct>]` records. The default comparison is `EqualityComparer<T>.Default`. |
| Nullable widget field | Assign `Nullable value`. This is not an F# optional argument. |
| Callback | Inline lambdas convert to `Action` and `Func`. Wrap named functions with the delegate type when needed. |
| Optional method argument | Omit it, or use `?options = None` for the file chooser options. |
| Transition | Assign `TransitionMs` and a `Hover` style. |
| Custom layout | Implement `LayoutAlgorithm`. Use `LayoutContext` only in `Measure` and `Arrange`. Return finite, nonnegative sizes. |
| Async | `task { return! window.ShowFileDialogAsync(FileDialogKind.OpenFile) }` |

- Mount `Goo.Widgets.Layout.ModalDialogHost` for modal focus and portal behavior. Do not `use`-dispose it inside `Build()`.
- Implement `IDisposable` on cells that own resources or event subscriptions. Remove the same delegate you added.
- `Cell.Animate` owns its animation lifetime. `Window` is not `IDisposable`.
- Use `Window.TryPost` to return background work to the UI thread.
- [FunGoo](https://github.com/AngelMunoz/FunGoo) is a community helper for child composition, fluent setters, conversions, `voption` results and nullable widget fields. Check its supported Goo versions before use.
