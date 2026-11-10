# PowerShell 7

```sh
dotnet build samples/interop/PowerShell/PowerShell.csproj -c Release
pwsh -NoProfile -File samples/interop/PowerShell/Start.ps1 --check
pwsh -NoProfile -File samples/interop/PowerShell/Start.ps1
```

Pack Goo into `artifacts/packages` first. Use PowerShell 7 on .NET 10, such as PowerShell 7.6.9. The [sample](../../samples/interop/PowerShell/Start.ps1) uses PowerShell classes and delegates. Its .NET project restores Goo and copies the runtime assemblies. It contains no C# application code.

## Counter

<table>
<tr><th>G#</th><th>PowerShell</th></tr>
<tr><td><pre><code>class Counter : Cell {
    private var count int32
    override func Build() Blob -> Container{
        Text{Content: "Count: $count"},
        Button{
            OnClick: () -> { count++ },
            Text{Content: "Add one"},
        },
    }
}</code></pre></td><td><pre><code>class Counter : Goo.Cell {
    [int] $Count
    hidden [Action] $Increment
    Counter() {
        $self = $this
        $this.Increment = { $self.Count++ }.GetNewClosure()
    }
    [Goo.Blob] Build() {
        $root = [Goo.Container]::new()
        $root.Children.Add([Goo.Text]@{
            Content = "Count: $($this.Count)"
        })
        $button = [Goo.Button]@{ OnClick = $this.Increment }
        $button.Children.Add([Goo.Text]@{ Content = 'Add one' })
        $root.Children.Add($button)
        return $root
    }
}</code></pre></td></tr>
</table>

Goo rebuilds the Cell that authored an input callback. Call `Rebuild()` for state changed outside input dispatch. Assign the Cell to `Window.Root`, then call `Run()`.

## Data list

<table>
<tr><th>G#</th><th>PowerShell</th></tr>
<tr><td><pre><code>let rows = names.Select(name ->
    Text{Key: name, Content: name})
let list = Container{
    Text{Content: "Account"},
    ...rows,
    Button{
        OnClick: save,
        Text{Content: "Save"},
    },
}</code></pre></td><td><pre><code>$list = [Goo.Container]::new()
$list.Children.Add([Goo.Text]@{ Content = 'Account' })
foreach ($name in $names) {
    $list.Children.Add([Goo.Text]@{
        Key = $name
        Content = $name
    })
}
$button = [Goo.Button]@{ OnClick = $save }
$button.Children.Add([Goo.Text]@{ Content = 'Save' })
$list.Children.Add($button)</code></pre></td></tr>
</table>

Use direct loops for small lists. For large lists, use Goo.Widgets virtual rows. See [shared child identity and API rules](dotnet.md#shared-api-rules).

## Load assemblies before class files

```powershell
$bin = Join-Path $PSScriptRoot 'bin/Release/net10.0'
foreach ($name in 'HexaGen.Runtime', 'Goo') {
    $null = [Reflection.Assembly]::LoadFrom("$bin/$name.dll")
}
. "$PSScriptRoot/Counter.ps1"
```

PowerShell resolves class base types when it parses a file. Put `Cell` subclasses in a separate file and dot-source it after loading the assemblies. Keep Goo's native assets in the build output. Goo loads its bundled patched SDL without an application dependency manifest.

For `Cell[T]`, define `T` in an earlier file. Dot-source that file before the file containing the subclass:

```powershell
. "$PSScriptRoot/RowInput.ps1"
. "$PSScriptRoot/RowView.ps1"
$child = [Goo.Cell]::Mount[RowInput, RowView]('row', $input)
```

## Keep handler closures

```powershell
$self = $this
$this.Increment = { $self.Count++ }.GetNewClosure()
```

Store typed delegates on the Cell. Capture `$self`, not the callback's `$this`. Call `.GetNewClosure()` before converting the scriptblock to `Action` or `Action[T]`. This keeps local values after the method returns and keeps delegate identity stable across builds.

## Choose activation keys

Core `Goo.Button` has no default activation keys. Goo.Widgets buttons bind Enter and Space. For a raw button, retain an `ElementHandle` on the Cell and assign it to `Button.Handle`:

```powershell
$this.ButtonHandle = [Goo.ElementHandle]::new()
$self = $this
$this.Bindings = [Goo.KeyBinding[]]@(
    [Goo.KeyBinding]@{
        Key = 'Enter'
        Action = { $null = $self.ButtonHandle.Activate() }.GetNewClosure()
    }
    [Goo.KeyBinding]@{
        Key = 'Space'
        Action = { $null = $self.ButtonHandle.BeginPress() }.GetNewClosure()
        OnRelease = { $null = $self.ButtonHandle.EndPress($true) }.GetNewClosure()
    }
)
$button = [Goo.Button]@{
    Handle = $this.ButtonHandle
    KeyBindings = $this.Bindings
    OnClick = $this.Increment
}
```

Declare the fields as `[Goo.ElementHandle]` and `[Goo.KeyBinding[]]`. The hashtable cast creates each `KeyBinding` struct and converts its handlers to `Action`. Enter activates on key down. Space shows a held press and activates on release. `EndPress($false)` cancels. Use `KeyBindings` for commands, not `OnKeyDown`. See [keyboard routing and focus](../api/input.md#route-keyboard-and-focus-callbacks).

## PowerShell rules

| Contract | PowerShell |
| --- | --- |
| Init-only style properties | Use `[Goo.Style]@{ Padding = 10 }` or `[Goo.Button]@{ Padding = 10 }`. Do not set an init-only property after construction. |
| Structs | Read a copy, construct a changed value, then assign it back. For example, `$color = $input.Color`, then `$input.Color = $color.WithAlpha(0.5)`. Changing a nested struct property does not update its owner. |
| Numeric overloads | `[Math]::Clamp(0.7, 0, 1)` selects an integer overload. Write `[Math]::Clamp([double]0.7, [double]0, [double]1)`. |
| Async | PowerShell has no `await`. Use synchronous resource loads before `Run()`. Do not block in `Build()` or input handlers. |
| Names | Member names are case-insensitive. Do not use names that differ only by case, or a field named `build` in a Cell subclass. |
| Typed input | Define `Cell[T]` input types in an earlier file. Replace input values when they change. |
| Callback return values | Use `$null = $handle.Activate()` and similar calls in `Action` handlers. Keep callbacks free of unintended pipeline output. |

CI builds the packed sample and runs `--check` without a native window. The check builds the tree, invokes its counter callback and checks the keyboard binding shape.
