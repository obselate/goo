open System
open System.Collections.Generic
open Goo
open Goo.Widgets.Data
open Goo.Widgets.Layout

type Counter() as this =
    inherit Cell()
    let mutable count = 0
    override _.Build() =
        Container(Padding = Edges(Length.Pixels 24.), Gap = 12.,
            Children = ResizeArray<Blob>([
                Text(Content = $"Count: {count}") :> Blob
                Button(Padding = Edges(Length.Pixels 10.), BorderRadius = Length.Pixels 10.,
                    TransitionMs = 150., Hover = Style(BackgroundColor = Color.Rgb(74, 125, 255)),
                    OnClick = (fun () -> count <- count + 1; this.Rebuild()),
                    Children = ResizeArray<Blob>([Text(Content = "Add one") :> Blob])) :> Blob
            ]))

let listView (data: seq<string>) =
    let rows = data |> Seq.map (fun value -> Text(Key = value, Content = value) :> Blob)
    Container(Width = Length.Pixels 320., MaxWidth = Length.Percent 100., Padding = Edges(Length.Pixels 12.), Gap = 8.,
        Children = ResizeArray<Blob>(seq {
            yield Text(Content = "Account") :> Blob
            yield! rows
            yield Button(OnClick = (fun () -> printfn "Save"),
                Children = ResizeArray<Blob>([Text(Content = "Save") :> Blob])) :> Blob
        }))

type AccountInput = { Name: string }
type AccountCell() as this =
    inherit Cell<AccountInput>()
    let mutable edits = 0
    override _.Build(input: AccountInput) =
        Button(OnClick = (fun () -> edits <- edits + 1; this.Rebuild()),
            Children = ResizeArray<Blob>([Text(Content = $"{input.Name}: {edits}") :> Blob]))

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

type Examples(sample: string) as this =
    inherit Cell()
    let mutable isOpen = false
    let close() = isOpen <- false; this.Rebuild()
    let items = if sample = "virtual" then Array.init 10_000 (sprintf "Item %05d") else [||]
    static let itemKey = Func<string, string>(id)
    static let buildRow = Func<string, Blob>(fun value -> Text(Content = value))
    override _.Build() : Blob =
        match sample with
        | "list" -> listView ["Ada"; "Grace"; "Linus"]
        | "input" -> Cell.Mount<AccountInput, AccountCell>("account", { Name = "Ada" })
        | "virtual" -> VirtualLists.Rows(items, 24., itemKey, buildRow)
        | "variants" ->
            let basic =
                Style(Padding = Edges(Length.Pixels 10.), BorderRadius = Length.Pixels 10.,
                    BackgroundColor = Color.Rgb(24, 31, 43))
            Container(Gap = 12., Children = ResizeArray<Blob>([
                Button(BasedOn = basic, Children = ResizeArray<Blob>([Text(Content = "Base") :> Blob])) :> Blob
                Button(BasedOn = basic, BackgroundColor = Color.Rgb(74, 125, 255),
                    Children = ResizeArray<Blob>([Text(Content = "Primary") :> Blob])) :> Blob
            ]))
        | "layout" -> Container(Height = Length.Pixels 200., Layout = EqualColumn(),
            Children = ResizeArray<Blob>([Text(Content = "One") :> Blob; Text(Content = "Two") :> Blob]))
        | "dialog" ->
            let dialog = ModalDialog(Open = isOpen, Content = Text(Content = "Save account?"),
                Padding = Nullable 20., OnClose = Action close, OnCancel = Action close, OnConfirm = Action close)
            Container(Children = ResizeArray<Blob>([
                Button(OnClick = (fun () -> isOpen <- true; this.Rebuild()),
                    Children = ResizeArray<Blob>([Text(Content = "Open dialog") :> Blob])) :> Blob
                Cell.Mount<ModalDialog, ModalDialogHost>("dialog", dialog)
            ]))
        | _ -> Cell.Mount<Counter>("counter")

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
        let counter = Counter()
        ((counter.Build() :?> Container).Children[1] :?> Button).OnClick.Invoke()
        if ((counter.Build() :?> Container).Children[0] :?> Text).Content <> "Count: 1" then
            invalidOp "Counter failed."
        if (listView ["Ada"; "Grace"]).Children.Count <> 4 then invalidOp "Spread failed."
        printfn "F# interop checks passed."
    else window.Run()
    0
