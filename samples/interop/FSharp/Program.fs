open System
open Goo
open Goo.Widgets.Data
open Goo.Widgets.Layout

module Counter =
    let view count (increment: Action) : Blob =
        let root = Container(Padding = Edges(Length.Pixels 24.), Gap = Length.Pixels 12.)
        root.Add(Text(Content = $"Count: {count}"))
        let button =
            Button(Padding = Edges(Length.Pixels 10.), BorderRadius = Length.Pixels 10.,
                TransitionMs = 150., Hover = Style(BackgroundColor = Color.Rgb(74, 125, 255)),
                OnClick = increment)
        button.Add(Text(Content = "Add one"))
        root.Add(button)
        root

    let create () =
        let mutable count = 0
        let increment = Action(fun () -> count <- count + 1)
        { new Cell() with
            override _.Build() = view count increment }

let listView (names: string array) (save: Action) =
    let root = Container(Width = Length.Pixels 320., MaxWidth = Length.Percent 100.,
        Padding = Edges(Length.Pixels 12.), Gap = Length.Pixels 8.)
    root.Add(Text(Content = "Account"))
    for name in names do
        root.Add(Text(Key = name, Content = name))
    let button = Button(OnClick = save)
    button.Add(Text(Content = "Save"))
    root.Add(button)
    root

[<Struct>]
type AccountInput = { Name: string }
type AccountCell() =
    inherit Cell<AccountInput>()
    let mutable edits = 0
    let increment = Action(fun () -> edits <- edits + 1)
    override _.Build(input: AccountInput) =
        let button = Button(OnClick = increment)
        button.Add(Text(Content = $"{input.Name}: {edits}"))
        button

type EqualColumn() =
    interface LayoutAlgorithm with
        member _.Measure(context, available) =
            let mutable width, height = 0., 0.
            for i in 0 .. context.ChildCount - 1 do
                let child = context.MeasureChild(i, available)
                width <- max width child.Width
                height <- height + child.Height
            LayoutSize(Width = min width available.Width, Height = min height available.Height)
        member _.Arrange(context, finalSize) =
            let height = if context.ChildCount = 0 then 0. else finalSize.Height / float context.ChildCount
            for i in 0 .. context.ChildCount - 1 do
                context.ArrangeChild(i, ElementRect(Y = float i * height, Width = finalSize.Width, Height = height))

type Examples(sample: string) =
    inherit Cell()
    let mutable isOpen = false
    let close = Action(fun () -> isOpen <- false)
    let openDialog = Action(fun () -> isOpen <- true)
    let setOpen = Action<bool>(fun value -> isOpen <- value)
    let column = EqualColumn()
    let items = if sample = "virtual" then Array.init 10_000 (sprintf "Item %05d") else [||]
    static let itemKey = Func<string, string>(id)
    static let buildRow = Func<string, Blob>(fun value -> Text(Content = value))
    static let counterFactory = Func<Cell>(Counter.create)
    let names = [| "Ada"; "Grace"; "Linus" |]
    let save = Action(fun () -> printfn "Save")
    override _.Build() : Blob =
        match sample with
        | "list" -> listView names save
        | "input" -> Cell.Mount<AccountInput, AccountCell>("account", { Name = "Ada" })
        | "virtual" -> VirtualLists.Rows(items, 24., itemKey, buildRow)
        | "variants" ->
            let basic =
                Style(Padding = Edges(Length.Pixels 10.), BorderRadius = Length.Pixels 10.,
                    BackgroundColor = Color.Rgb(24, 31, 43))
            let root = Container(Gap = Length.Pixels 12.)
            let baseButton = Button(BasedOn = basic)
            baseButton.Add(Text(Content = "Base"))
            root.Add(baseButton)
            let primary = Button(BasedOn = basic, BackgroundColor = Color.Rgb(74, 125, 255))
            primary.Add(Text(Content = "Primary"))
            root.Add(primary)
            root
        | "layout" ->
            let root = Container(Height = Length.Pixels 200., Layout = column)
            root.Add(Text(Content = "One"))
            root.Add(Text(Content = "Two"))
            root
        | "dialog" ->
            let dialog = ModalDialog(Open = isOpen, Content = Text(Content = "Save account?"),
                Padding = Nullable 20., OnOpenChange = setOpen,
                OnCancel = close, OnConfirm = close)
            let root = Container()
            let button = Button(OnClick = openDialog)
            button.Add(Text(Content = "Open dialog"))
            root.Add(button)
            root.Add(Cell.Mount<ModalDialog, ModalDialogHost>("dialog", dialog))
            root
        | _ -> Cell.Mount<Cell>(counterFactory, "counter")

let hitTest (handle: ElementHandle) point =
    match handle.TryGetTextPositionAt(point, TextCoordinateSpace.Window) with
    | true, position -> ValueSome position
    | false, _ -> ValueNone

let pickFile (window: Window) = task {
    let! result = window.ShowFileDialogAsync(FileDialogKind.OpenFile)
    return result
}

[<EntryPoint>]
let main args =
    let sample = args |> Array.tryHead |> Option.defaultValue "counter"
    let window = Window(Title = "F# interop", Width = 640, Height = 480, Root = Examples(sample))
    let focused = Action<bool>(fun value -> printfn "Focused: %b" value)
    window.add_FocusChanged focused
    window.remove_FocusChanged focused
    if Array.contains "--check" args then
        let counter = Counter.create()
        ((counter.Build() :?> Container).Children[1] :?> Button).OnClick.Invoke()
        if ((counter.Build() :?> Container).Children[0] :?> Text).Content <> "Count: 1" then
            invalidOp "Counter failed."
        let list = listView [| "Ada"; "Grace" |] (Action ignore)
        if list.Children.Count <> 4 then invalidOp "List failed."
        if (list.Children[1] :?> Text).Key <> "Ada" then invalidOp "Row key failed."
        if (list.Children[3] :?> Button).Children.Count <> 1 then invalidOp "Button children failed."
        printfn "F# interop checks passed."
    else window.Run()
    0
