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
                Rebuild()
            },
            Text{Content: "Add one"},
        },
    }
}</code></pre></td><td><pre><code>type Counter() as this =
    inherit Cell()
    let mutable count = 0
    override _.Build() =
        Container(Children = ResizeArray&lt;Blob>([
            Text(Content = $"Count: {count}") :> Blob
            Button(
                OnClick = (fun () ->
                    count &lt;- count + 1
                    this.Rebuild()),
                Children = ResizeArray&lt;Blob>([
                    Text(Content = "Add one") :> Blob
                ])) :> Blob
        ]))</code></pre></td></tr>
</table>

Constructor property assignment works for Goo's init properties. Call `Rebuild()` after changing cell state.

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
}</code></pre></td><td><pre><code>let rows =
    names |> Seq.map (fun name ->
        Text(Key = name, Content = name) :> Blob)
let list =
    Container(Children = ResizeArray&lt;Blob>(seq {
        yield Text(Content = "Account") :> Blob
        yield! rows
        yield Button(
            OnClick = (fun () -> save()),
            Children = ResizeArray&lt;Blob>([
                Text(Content = "Save") :> Blob
            ])) :> Blob
    }))</code></pre></td></tr>
</table>

`yield!` spreads a sequence. `ResizeArray<Blob>` supplies the mutable `IList<Blob>` that `Children` accepts.
Upcast child values with `:> Blob` when building the list.

- Keyed and unkeyed siblings can mix. Keys must be unique among siblings.
- Keys retain identity across moves. Unkeyed entries use their absolute sibling index.
- Writable child lists are shared. Read-only child lists are copied.

## Variants and lengths

```fsharp
let basic = Style(Padding = Edges(Length.Pixels 10.))
let primary =
    Button(BasedOn = basic, BackgroundColor = Color.Rgb(74, 125, 255),
        Children = ResizeArray<Blob>([Text(Content = "Save") :> Blob]))
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
let viewport = Container(Height = Length.Pixels 240., Children = ResizeArray<Blob>([rows :> Blob]))

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
| Input comparison | Use immutable records. The default comparison is `EqualityComparer<T>.Default`. |
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
