# Visual Basic

Use ordinary VB classes, object initializers and delegates. Goo owns state tracking, rebuilds and renderer selection.

The [sample](https://github.com/obselate/goo/blob/main/samples/interop/VisualBasic/Program.vb) contains all VB excerpts below. Keep its imports, containing classes and `SampleTheme` when copying an excerpt. Run these scenes: `counter`, `list`, `input`, `virtual`, `variants`, `layout`, `dialog` and `async`.

## 1. Setup

Use the .NET 10 SDK. The sample uses SDK 10.0.403, targets `net10.0`, and pins Goo.Widgets 0.22.2. A framework-dependent build needs the .NET 10 runtime and Goo's [native platform dependencies](platform-preflight.md). It does not need Windows Forms or WPF.

For a standalone project:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net10.0</TargetFramework>
    <OptionStrict>On</OptionStrict>
    <OptionExplicit>On</OptionExplicit>
    <OptionInfer>On</OptionInfer>
    <RootNamespace>GooVisualBasic</RootNamespace>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Goo" Version="0.31.0" />
    <PackageReference Include="Goo.Widgets" Version="[0.22.2]" />
  </ItemGroup>
</Project>
```

Put the entry point in a `Module`. The sample's `Main(args As String())` creates the first window:

```vb
Dim sample = If(args.FirstOrDefault(), "counter")
Dim window = New Window With {
    .Title = $"Visual Basic: {sample}",
    .Size = New LayoutSize(640, 480),
    .Root = New Examples(sample)
}
Goo.Widgets.Theme.Attach(window, Goo.Widgets.Theme.Default)
Goo.Widgets.Theme.SetMode(window, Goo.Widgets.ThemeMode.Dark)
```

Call `Application.Run(window)` from `Main`. Attach the Widgets theme before opening the window, so its controls match the core view's dark palette. Do not choose a renderer. Start with `Imports Goo`, `Imports System.Collections.Generic` and `Imports System.Linq`. The Widgets namespaces used here are `Goo.Widgets.Data` and `Goo.Widgets.Layout`.

From this repository, first pack Goo into `artifacts/packages`. The sample resolves Goo from that feed:

```sh
dotnet run --project samples/interop/VisualBasic -- counter
```

## 2. Cells and state

`Counter` is a `NotInheritable Class` that inherits `Cell`. Keep observable state in a `ReadOnly State(Of T)` field. The field is read-only, not its `Value`:

```vb
Private ReadOnly count As New State(Of Integer)(0)

Private Sub Increment()
    count.Value += 1
End Sub
```

Its `Public Overrides Function Build() As Blob` returns a fresh tree:

```vb
Return New Container With {
    .Gap = SampleTheme.Spacing,
    .Children = New List(Of Blob) From {
        New Text With {.Content = $"Count: {count.Value}"},
        New Button With {
            .BasedOn = SampleTheme.ButtonStyle,
            .Handle = buttonHandle, .KeyBindings = bindings,
            .OnClick = AddressOf Increment,
            .Children = New List(Of Blob) From {New Text With {.Content = "Add one"}}
        }
    }
}
```

Reading `count.Value` subscribes this Cell. Clicking the button changes the value and Goo rebuilds its readers. Do not call `Build` or `Rebuild` to refresh the screen. Do not write state during `Build`.

A returned Blob and its reachable declarations freeze. Do not change them later or cache a tree as a refresh mechanism.

## 3. Composition

Use `With` for member values and `From` for children. VB has no collection spread. The small `list` scene uses `AddRange` before returning its tree:

```vb
Dim rows = data.Select(Function(value) DirectCast(New Text With {.Key = value, .Content = value}, Blob))
Dim children = New List(Of Blob) From {New Text With {.Content = "Account"}}
children.AddRange(rows)
children.Add(New Button With {
    .BasedOn = SampleTheme.ButtonStyle, .OnClick = Sub() Console.WriteLine("Save"),
    .Children = New List(Of Blob) From {New Text With {.Content = "Save"}}
})
```

Keys identify items, not positions. Use stable domain IDs when siblings can move. Names are unique keys only in this small example.

Mount child Cells instead of calling their `Build` methods. The `input` scene retains an immutable input and mounts a typed child:

```vb
Private Shared ReadOnly account As New AccountInput("Ada")
```

```vb
Return Cell.Mount(Of AccountInput, AccountCell)("account", account)
```

`AccountCell` inherits `Cell(Of AccountInput)` and overrides `Protected Function Build(input As AccountInput) As Blob`. It keeps its own `State(Of Integer)` for edits. The mount key preserves that Cell. Goo compares typed inputs by equality. Retain unchanged reference inputs, or give value-like input classes suitable equality.

For a parameterless child, the counter scene uses `Cell.Mount(Of Counter)("counter")`.

## 4. Input and focus

Use `AddressOf` for a named handler. Use a `Sub` lambda for an action and a `Function` lambda when Goo expects a result. Retain handles and key bindings in fields, not in `Build`:

```vb
Private ReadOnly buttonHandle As New ElementHandle()
Private ReadOnly bindings As KeyBinding() = {
    New KeyBinding With {.Key = Key.Enter, .OnPress = Sub() buttonHandle.Activate()},
    New KeyBinding With {
        .Key = Key.Space,
        .OnPress = Sub() buttonHandle.BeginPress(),
        .OnRelease = Sub() buttonHandle.EndPress(True)
    }
}

Protected Overrides Sub Mounted()
    buttonHandle.Focus()
End Sub
```

The raw `Goo.Button` above needs explicit activation bindings. Goo.Widgets buttons provide Enter and Space behavior. `EndPress(False)` cancels a held press. Focus loss or removal cancels pending key releases.

Use `KeyBindings` for commands, not low-level key callbacks. Use standard text controls for editing and Tab traversal. VB consumes CLR events with `AddHandler` and `RemoveHandler`, as shown for `Window.FocusChanged` in `Main`.

## 5. Styling and layout

Keep colors, fonts and spacing in one theme. Use explicit conversions when a length is not plain layout units:

```vb
Public Shared ReadOnly Background As Color = Color.Rgb(24, 31, 43)
Public Shared ReadOnly Foreground As Color = Color.Rgb(236, 240, 248)
Public Shared ReadOnly Accent As Color = Color.Rgb(74, 125, 255)
Public Shared ReadOnly ButtonStyle As New Style With {
    .Padding = 12, .BorderRadius = 8, .BackgroundColor = Accent
}
Public Shared ReadOnly PageStyle As New Style With {
    .Width = Length.Percent(100), .Height = Length.Percent(100),
    .Padding = 24, .Gap = 12, .FontSize = 18,
    .BackgroundColor = Background, .Color = Foreground
}
```

These are members of `SampleTheme`. Numeric lengths use Goo layout units. `Length.Pixels(320)` and `Length.Percent(100)` in `ListView` make its width and maximum width explicit. Use `Color.Rgb` instead of relying on string conversions.

Put `BasedOn` first. Later declarations override it, as in the `variants` scene. Use `BasedOn` to reuse a Style, not object copying.

The `layout` scene gives each label a share of the row:

```vb
Return New Container With {
    .FlexDirection = FlexDirection.Row, .Gap = SampleTheme.Spacing,
    .Children = New List(Of Blob) From {
        New Text With {.Content = "One", .FlexGrow = 1, .MinWidth = 0},
        New Text With {.Content = "Two", .FlexGrow = 1, .MinWidth = 0}
    }
}
```

Use flex growth and zero minimum sizes for regions that must fit. Use fixed sizes for control metrics or real bounds, not whole-page positioning. See [layout](api/layout.md) and [style](api/style.md).

## 6. Virtual lists

The `virtual` scene creates 10,000 row values in its constructor, not in `Build`. It retains both delegates:

```vb
Private Shared ReadOnly itemKey As Func(Of String, String) = Function(value) value
Private Shared ReadOnly buildRow As Func(Of String, Blob) =
    Function(value) New Text With {.Content = value, .Height = SampleTheme.RowHeight}
```

The scene returns a bounded virtual viewport:

```vb
Dim rows = VirtualLists.Rows(items, SampleTheme.RowHeight, itemKey, buildRow)
rows.FlexGrow = 1
rows.MinHeight = 0
rows.ScrollbarY = SampleTheme.ScrollbarStyle
rows.ScrollbarVisibilityY = ScrollbarVisibility.Always
Return rows
```

`SampleTheme.ScrollbarStyle` supplies the visible thumb. Do not wrap the virtual element in another scrolling container. Replace changed data instead of mutating it in place. Keep edits and selection in the owner, keyed by row ID, because off-screen rows unmount. Sort and filter when data changes, not in `Build`.

## 7. Dialogs and widgets

Use Goo.Widgets controls before creating equivalent controls yourself. The `dialog` scene reads a `State(Of Boolean)` field and mounts `ModalDialogHost`:

```vb
Dim dialog = New ModalDialog With {
    .Open = isOpen.Value, .Content = New Text With {.Content = "Save account?"},
    .Padding = SampleTheme.DialogPadding,
    .OnOpenChange = Sub(value) isOpen.Value = value,
    .OnCancel = AddressOf CloseDialog, .OnConfirm = AddressOf CloseDialog
}
```

Include `Cell.Mount(Of ModalDialog, ModalDialogHost)("dialog", dialog)` in the parent's children. `OpenDialog` writes `True` to `isOpen.Value`. `CloseDialog` writes `False`. Goo applies the new input and owns the overlay, focus scope and host lifetime. Do not create a second window or dispose the host inside `Build`.

For native file picking, await `Window.ShowFileDialogAsync(FileDialogKind.OpenFile)` and handle cancellation. The sample's `PickFile` helper shows its `Task(Of FileDialogResult)` signature.

## 8. Threading

`Build`, Goo input callbacks and posted actions run on the UI thread. An ordinary `Await` in a Goo callback resumes there. Keep service methods `Async Function ... As Task` or `Task(Of T)`. Use `Async Sub` only at an event or `Action` boundary.

The `async` scene binds its button to `AddressOf Refresh`. It deliberately leaves the UI context to show how to post a result back:

```vb
Private Async Sub Refresh()
    Dim token = Latest("refresh")
    status.Value = "Loading"
    Try
        Await Task.Delay(500, token).ConfigureAwait(False)
        Post(Sub()
                 If token.IsCancellationRequested Then Return
                 status.Value = Microsoft.VisualBasic.Strings.StrReverse("ydaeR")
             End Sub)
    Catch ex As OperationCanceledException When token.IsCancellationRequested
    End Try
End Sub
```

`Latest` cancels the previous refresh and links work to the Cell lifetime. Check cancellation inside the posted action before writing state. `Post` returns `False` after unmount or when the window rejects posts. Handle rejection when delivery is required. This disposable status update can be dropped during teardown.

Do not use `ConfigureAwait(False)` when the continuation directly reads or writes UI state. Never block a callback with `.Wait()`, `.Result` or synchronous I/O. VB has no G# `go` or `scope`. Use asynchronous .NET services, and schedule CPU-bound service work off the UI thread. Use `Post` for callbacks from background producers.

## 9. Shipping

NativeAOT works for this VB app on Linux x64 with SDK 10.0.403, Goo 0.31.0 and Goo.Widgets 0.22.2. Publishing also trims the app. The checked native executable runs every scene, including `Microsoft.VisualBasic.Strings.StrReverse` in the refresh callback. It needs no installed .NET runtime. No trimming or AOT warnings were emitted for this sample.

```sh
dotnet publish samples/interop/VisualBasic -c Release -r linux-x64 \
  -p:PublishAot=true -o publish/vb
./publish/vb/VisualBasic --check
./publish/vb/VisualBasic async
```

Use the target platform's NativeAOT compiler and linker prerequisites. This result does not cover every VB runtime API or every runtime identifier. Avoid late binding and reflection-based discovery in trimmed code. Check warnings from your own dependencies. Keep Goo's native payload and platform libraries as described in [shipping](shipping.md).

For a dependency that needs the JIT, use a self-contained publish for its target RID instead of AOT. Single-file publishing and ReadyToRun are separate .NET publish choices, not requirements imposed by VB.

## 10. VB-specific pitfalls

VB can consume C# init-only properties in `With` initializers, but cannot declare init-only setters, records or `with` expressions, so define VB-owned immutable inputs with constructor-set read-only properties:

```vb
Public NotInheritable Class AccountInput
    Public ReadOnly Property Name As String

    Public Sub New(name As String)
        Me.Name = name
    End Sub
End Class
```

| Feature or boundary | VB approach |
| --- | --- |
| Strict typing | Keep `Option Strict On`, `Option Explicit On` and `Option Infer On`. Inferred locals remain statically typed. Avoid `Object` and late binding. |
| Names | Use PascalCase for types and members, camelCase for fields and parameters, and `NotInheritable` for concrete Cells. VB is case-insensitive, so `build` conflicts with `Build`. |
| Root namespace | VB prepends `RootNamespace` to declared namespaces. Keep it explicit. Use `Global.Goo` to disambiguate a conflicting namespace. |
| Collection spreads | Build a `List(Of Blob) From {...}`, then call `AddRange` before returning it. G# component syntax and C# collection expressions are not VB syntax. |
| Ref structs and pointers | VB cannot declare or use ref-struct locals such as `Span(Of T)`, or write unsafe pointer code. Use array or class-based API overloads. If an API exposes only ref structs or pointers, put that boundary in a C# or G# library. |
| Nullable values | `TextPosition?` is `Nullable(Of TextPosition)`. VB has no C# nullable-reference analysis. Observe reference argument contracts explicitly. |
| Try methods | Declare a local for a `ByRef` result. The sample's `HitTest` passes `position` to `TryGetTextPositionAt`. There is no inline C# `out var`. |
| Delegates and events | Use `Sub` for `Action`, `Function` for `Func`, `AddressOf` for a method, and `AddHandler`/`RemoveHandler` for CLR events. Keep virtual-row delegates stable. |
| Async entry points | Use synchronous `Sub Main` for `Application.Run`. Keep `Async Sub` at callback boundaries and await `Task`-returning service methods. |

See the [Cell API](api/cell.md) for lifecycle and state rules, and the [input API](api/input.md) for focus and keyboard routing.
