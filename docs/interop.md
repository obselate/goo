# .NET language interop

Use Goo from .NET 10 with ordinary objects, delegates and generic calls. The compiled [C#](../samples/interop/CSharp/Program.cs), [F#](../samples/interop/FSharp/Program.fs) and [Visual Basic](../samples/interop/VisualBasic/Program.vb) samples include counter, list, variants, input, virtual, dialog and layout scenes. They pin Goo.Widgets 0.20.0.

To run a repository sample, first pack Goo into `artifacts/packages`, then run its project with `-- counter`.

## C#

```csharp
sealed class Counter : Cell
{
    private int count;
    public override Blob Build() => new Container
    {
        Children =
        [
            new Text { Content = $"Count: {count}" },
            new Button
            {
                OnClick = () => { count++; },
                Children = [new Text { Content = "Add one" }]
            }
        ]
    };
}
```

- Use .NET 10 and C# 14. Keep nullable analysis enabled.
- `Children = [..rows]` assigns a collection. `Children = { child }` adds children to the existing collection.
- Use ordinary `Action` delegates and `out var` for Try methods.
- Put `BasedOn` before style overrides. It copies styles, not children, callbacks, keys or handles.

## F#

```fsharp
module Counter =
    let view count (increment: Action) : Blob =
        let root = Container()
        root.Add(Text(Content = $"Count: {count}"))
        let button = Button(OnClick = increment)
        button.Add(Text(Content = "Add one"))
        root.Add(button)
        root

    let create () =
        let mutable count = 0
        let increment = Action(fun () -> count <- count + 1)
        { new Cell() with
            override _.Build() = view count increment }
```

Use `open System` and `open Goo`. Create callbacks outside `Build()`. Assign `Counter.create()` to `Window.Root`. For a child, retain its factory and mount with a stable key:

```fsharp
let counterFactory = Func<Cell>(Counter.create)
let counter = Cell.Mount<Cell>("counter", counterFactory)
```

- `Add` accepts derived Blobs. An annotated `Blob` return upcasts a `Container`.
- `Children` accepts `IList<Blob>`. Goo copies arrays into a mutable list. Convert an F# list with `ResizeArray<Blob>(children)`, or use `Add` to avoid temporary collections.
- An omitted out parameter becomes a tuple result.
- Goo's `Action` events use explicit add/remove accessors, not `.AddHandler`.
- Use named length and color methods in typed bindings to avoid `op_Implicit` warnings.
- Use `Nullable<T>` for nullable value types and pass optional CLR arguments by name.

## Visual Basic

```vb
Public Class Counter
    Inherits Cell
    Private count As Integer
    Public Overrides Function Build() As Blob
        Return New Container With {
            .Children = New List(Of Blob) From {
                New Text With {.Content = $"Count: {count}"},
                New Button With {
                    .OnClick = AddressOf Increment,
                    .Children = New List(Of Blob) From {
                        New Text With {.Content = "Add one"}}}
            }
        }
    End Function
    Private Sub Increment()
        count += 1
    End Sub
End Class
```

Use `AddRange` where G# uses spread syntax. Use ordinary delegates and `ByRef` variables for Try methods.

## PowerShell

```powershell
class Counter : Goo.Cell {
    [int] $Count
    hidden [Action] $Increment
    Counter() {
        $self = $this
        $this.Increment = { $self.Count++ }.GetNewClosure()
    }
    [Goo.Blob] Build() {
        $root = [Goo.Container]::new()
        $root.Children.Add([Goo.Text]@{ Content = "Count: $($this.Count)" })
        $button = [Goo.Button]@{ OnClick = $this.Increment }
        $button.Children.Add([Goo.Text]@{ Content = 'Add one' })
        $root.Children.Add($button)
        return $root
    }
}
```

Use PowerShell 7 on .NET 10, such as PowerShell 7.6.9. The [sample](../samples/interop/PowerShell/Start.ps1) restores Goo through a .NET project. It contains no C# application code.

```sh
dotnet build samples/interop/PowerShell/PowerShell.csproj -c Release
pwsh -NoProfile -File samples/interop/PowerShell/Start.ps1 --check
pwsh -NoProfile -File samples/interop/PowerShell/Start.ps1
```

PowerShell resolves base types when it parses a file. Load assemblies before dot-sourcing the file with Cell subclasses:

```powershell
$bin = Join-Path $PSScriptRoot 'bin/Release/net10.0'
foreach ($name in 'HexaGen.Runtime', 'Goo') {
    $null = [Reflection.Assembly]::LoadFrom("$bin/$name.dll")
}
. "$PSScriptRoot/Counter.ps1"
```

Keep native assets in the build output. For `Cell[T]`, dot-source the input type before the subclass file.

| Contract | PowerShell |
| --- | --- |
| Callbacks | Store typed delegates on the Cell. Capture `$self`, not the callback's `$this`. Call `.GetNewClosure()` before delegate conversion. |
| Init-only properties | Set them in a hashtable cast, such as `[Goo.Style]@{ Padding = 10 }`. |
| Structs | Read a copy, construct a changed value, then assign it back. A nested struct edit does not update its owner. |
| Numeric overloads | Use explicit types, such as `[Math]::Clamp([double]0.7, [double]0, [double]1)`. |
| Async | PowerShell has no `await`. Load resources before `Run()`. Do not block in `Build()` or handlers. |
| Names | Names are case-insensitive. Do not use names that differ only by case or a Cell field named `build`. |
| Callback output | Use `$null = $handle.Activate()` to keep `Action` handlers free of pipeline output. |

Core `Goo.Button` has no default activation keys. Goo.Widgets buttons bind Enter and Space. The [counter sample](../samples/interop/PowerShell/Counter.ps1) retains an `ElementHandle` and `KeyBinding[]` for a raw button. Enter calls `Activate()`. Space calls `BeginPress()` and `EndPress(true)` on release. `EndPress(false)` cancels. Use [KeyBindings](api/input.md#route-keyboard-and-focus-callbacks), not `OnKeyDown`, for commands.

## Shared contracts

| Contract | Rule |
| --- | --- |
| Child collections | Assign a fresh writable list or add to a new Blob. Do not mutate a retained tree. |
| State and identity | Mount child Cells. Keep keys stable when siblings move. See [Cell](api/cell.md) and [tree](api/tree.md). |
| Events | Goo rebuilds the Cell that authored an input callback. Other state changes need `Rebuild()` on the UI thread. |
| Background work | Return window changes through `Window.Post`. Goo installs no UI synchronization context. |
| Layout and style | See [layout](api/layout.md) and [style](api/style.md). |
| Virtual rows | Use a bounded viewport, immutable row values, stable keys and a retained builder delegate. |
| Dialogs | Mount `ModalDialogHost`. Do not dispose it inside `Build()`. |
| Lifetime | Dispose owner-bound native services on the owner's UI thread. See [window](api/window.md). |
