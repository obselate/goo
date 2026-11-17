# PowerShell

Build a cross-platform GUI for an administration script with PowerShell 7 and Goo. The same module can target Windows, Linux and macOS. WinForms and WPF are Windows-only.

The [log viewer sample](https://github.com/obselate/goo/tree/main/samples/interop/PowerShell/) uses [PowerShell 7.6.10](https://github.com/PowerShell/PowerShell/releases/tag/v7.6.10), which runs on **.NET 10.0.15**, the [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0), Goo **0.31.0** and Goo.Widgets **0.22.2**. PowerShell 7.7 uses .NET 11. Use the 7.6 release line for this .NET 10 example.

## 1. Setup and the first window

From the repository root, with packed Goo packages in `artifacts/packages`:

```powershell
dotnet restore samples/interop/PowerShell/PowerShell.csproj -r linux-x64 --configfile samples/interop/NuGet.Config
dotnet build samples/interop/PowerShell/PowerShell.csproj -c Release -r linux-x64 --no-restore
pwsh -NoProfile -File samples/interop/PowerShell/Start.ps1
pwsh -NoProfile -File samples/interop/PowerShell/Start.ps1 --check
```

Use `win-x64` on Windows or `osx-arm64` on Apple Silicon. See [platform prerequisites](platform-preflight.md). Linux was tested. Windows and macOS were not verified for this module.

The [dependency-only project](https://github.com/obselate/goo/blob/main/samples/interop/PowerShell/PowerShell.csproj) has no C# source. It targets `net10.0`, sets `CopyLocalLockFileAssemblies`, and pins Goo.Widgets to `[0.22.2]`. The repository supplies `GooReleaseVersion`. Outside the repository, set that property to `0.31.0`. Restore Goo and its native assets through NuGet rather than downloading individual DLLs.

Build for a runtime identifier. This copies its native libraries beside the assemblies in `GooLog/lib`. A build without a runtime identifier leaves native libraries under `runtimes`, where the PowerShell host does not resolve all of them.

The module consists of a manifest and a script module:

```text
PowerShell/
  Start.ps1
  PowerShell.csproj
  GooLog/
    GooLog.psd1
    GooLog.psm1
    lib/
```

The [manifest](https://github.com/obselate/goo/blob/main/samples/interop/PowerShell/GooLog/GooLog.psd1) loads Goo before PowerShell parses the module's Cell subclasses:

```powershell
RequiredAssemblies = @('lib/HexaGen.Runtime.dll', 'lib/Goo.dll', 'lib/Goo.Widgets.dll')
```

`Start.ps1` imports the module at parse time:

```powershell
using module './GooLog/GooLog.psd1'
```

The module uses `using namespace Goo` and the required Widgets namespaces. Its exported `Show-GooLog` function creates a `Window`, sets `Root` to a new `LogView`, and calls `[Application]::Run($window)`. That call owns the UI loop and returns when the window closes. It does not start a background PowerShell pipeline.

## 2. Cells and state

The [script module](https://github.com/obselate/goo/blob/main/samples/interop/PowerShell/GooLog/GooLog.psm1) defines `LogView : Goo.Cell`. Its `Build()` method returns a fresh Blob tree. State is held in Cell fields such as `Message`, `Lines` and `DialogOpen`.

The constructor retains typed callbacks. For example:

```powershell
$self = $this
$this.ChangeMessage = { param($value) $self.Message = $value }.GetNewClosure()
$this.AppendMessage = { $self.AddLine($self.Message) }.GetNewClosure()
```

`ChangeMessage` is an `Action[string]` field. `AppendMessage` is an `Action` field. Assignment converts each scriptblock to its declared delegate type. `GetNewClosure()` retains the local `$self` after the constructor returns. Create these delegates once, not during each `Build()`.

Goo rebuilds automatically after its input, timer and posted callbacks. Change the fields in those callbacks. Do not call `Rebuild()` or manage a rebuild timer. Replace `Lines` when it changes. Do not change a Blob after returning it from `Build()`.

## 3. Composition and identity

Add children to a new container with `Children.Add()`. Suppress return values from other methods when they are not part of the view.

The root mounts the typed list Cell with a stable key:

```powershell
$root.Children.Add([Cell]::Mount[string[], LogRows]('log-rows', $this.Lines))
```

`LogRows : Goo.Cell[string[]]` implements `Build([string[]] $lines)`. Goo supplies the current array and retains the mounted Cell. Keep the same array until the data changes. Use domain IDs as keys when siblings can move, not their display indexes.

## 4. Input, events and focus

The sample uses `Theme.TextField`, not a custom text editor. It sets `Controlled`, `Value`, `OnChange` and `OnSubmit`. Enter appends the current message. The Append button uses the same operation. Empty or whitespace-only messages are ignored.

Retain an `ElementHandle` in the Cell. The root's `KeyBinding[]` binds physical key `L` with `KeyModifiers.Primary` to `InputHandle.Focus()`. This is Ctrl+L on Windows and Linux, and Command+L on macOS. Bind commands through `KeyBindings`, not `OnKeyDown`. Standard text editing and Tab traversal remain Goo's responsibility.

Goo.Widgets buttons supply Enter and Space activation. A raw `Goo.Button` needs explicit activation bindings. Prefer the widget.

Use typed delegates for .NET events too. Retain the exact delegate instance if it must later be removed. Never run a blocking command in an input callback.

## 5. Styling and layout

The sample uses one `Theme.GitHubDark` palette. Before `Application.Run`, it attaches that palette to the window and selects dark mode. This also themes widget internals and modal dialogs:

```powershell
[Theme]::Attach($window, [Theme]::GitHubDark)
[Theme]::SetMode($window, [ThemeMode]::Dark)
```

The root starts with `BasedOn = $theme.CanvasStyle`, then sets its layout overrides. Later declarations win.

| Value | PowerShell form |
| --- | --- |
| Percentage | `[Length]::Percent(100)` |
| Pixels | `[Length]::Pixels(16)` or a numeric assignment to a Length property |
| Padding on all sides | A numeric assignment to `Padding`, converted to `Edges` |
| Gap | A numeric assignment to `Gap`, converted to Length |
| RGB color | `[Color]::Rgb(13, 17, 23)` |
| Widget to tree | `[Blob]$field` or `[Blob]$append`, inside `Build()` |

The window is 780 by 560 at startup. The root fills it with percentage width and height. The field fills the available width. The list uses `FlexGrow = 1` and `MinHeight = 0`, so it scrolls in the remaining space while the input and buttons stay visible.

Widget conversion and virtual-list creation need an owned Goo build context. Calling `LogView.Build()` directly from a shell is not a render test. It can throw `Context requires an owned build or virtual callback`.

## 6. Virtual lists

`LogRows` retains a `Func[string,string]` key selector and a `Func[string,Blob]` row builder. Its build calls the CLR helper:

```powershell
$list = [VirtualLists]::Rows[string]($lines, 32, $this.RowKey, $this.RowBuilder, $false, $null, $null)
$list.FlexGrow = 1
$list.MinHeight = 0
$list.Scrollbar = [Theme]::GitHubDark.Scrollbar
$list.ScrollbarVisibilityY = [ScrollbarVisibility]::Always
```

The helper is in `Goo.Widgets.Data`. The `32` is an initial row-height estimate. Rows can wrap and be measured. The sample keeps at most 500 log entries. Each line has a unique sequence prefix, so equal text messages still have different keys. Only the visible rows and overscan are mounted.

Do not place the list inside a container that scrolls the whole window. Do not format or filter the whole log in `Build()`.

## 7. Dialogs and Widgets

Clear logs opens a Goo.Widgets `ModalDialog`. The root mounts it through its typed host:

```powershell
$root.Children.Add([Cell]::Mount[ModalDialog, ModalDialogHost]('clear-dialog', $dialog))
```

The input value sets `Open`, `Content`, `OnOpenChange`, `OnCancel` and `OnConfirm`. Keep logs closes the dialog without changing the data. Clear logs replaces the array with an empty array and closes the dialog. The widget supplies the scrim, modal focus scope and keyboard handling.

Use the theme's `Button`, `PrimaryButton` and `TextField` values. Cast these widget values to `Blob` inside `Build()`. Set `ActionButton.Content` for button text. `Goo.Text` uses `Content` for text and `Color` for its text color.

## 8. Threading and PowerShell runspaces

Run the window on the same PowerShell pipeline that creates its Cells and delegates. In this arrangement, the verified execution model is:

| Code | Thread and runspace |
| --- | --- |
| `Build`, Goo input callbacks and scriptblock delegates | The UI thread and the launching PowerShell runspace |
| Cell `After`, `Every` and `Post` callbacks | The same UI thread and runspace |
| `Start-ThreadJob` body | A worker thread with a separate PowerShell runspace |
| A scriptblock delegate passed to `Task.Run` | Fails when that worker has no PowerShell runspace |

`GetNewClosure()` captures values. It does not create a runspace, move work to the UI thread or make a Cell thread-safe. Do not assign the UI runspace to arbitrary worker threads.

The sample uses this data-only handoff:

1. The Collect logs callback starts one `ThreadJob`. It passes the Cell's `Lifetime` cancellation token, not a Cell or a UI delegate.
2. The worker checks the token and returns up to 120 strings.
3. A Cell `Every(100, ...)` callback checks `Job.State`. It does not wait for the job.
4. After completion, it stops the polling timer and calls `Receive-Job -ErrorAction Stop`.
5. It captures the result in an `Action` and calls `Cell.Post` from a Cell method. The posted callback replaces `Lines` and updates `Status`. Goo rebuilds automatically.
6. It removes the completed job. On unmount, the timer stops and Goo cancels `Lifetime`. After the UI loop exits, `Show-GooLog` removes any remaining job.

Use `Start-ThreadJob` for work that needs PowerShell commands. Do not pass UI scriptblock delegates to `Task.Run` or use worker code to change Cell fields. The `--check` path verifies the missing-runspace failure. The sample passes data back through the job's output, not through a captured UI delegate.

Keep `Wait-Job`, synchronous I/O and task waits out of callbacks and `Build()`. The sample only receives results after the worker has finished. Its timer stops when the job is done, so the window has no permanent polling loop. Check the bool returned by `Post`. A rejected post is not an applied result.

## 9. Shipping

PowerShell has no NativeAOT deployment model. Do not trim the PowerShell host or its dynamically loaded Goo assemblies. Distribute a module folder and require PowerShell 7.6.10 on the target machine.

Build a separate bundle for each supported runtime identifier. Include the complete `GooLog` folder, including `lib`, native files and license notices. For example, after building the Linux bundle:

```powershell
Import-Module ./GooLog/GooLog.psd1
Show-GooLog
```

The target does not need the .NET SDK. PowerShell supplies the managed runtime. It still needs the native platform dependencies in [platform prerequisites](platform-preflight.md).

| Target | Bundle contents and verification |
| --- | --- |
| Linux x64 | Goo and dependency DLLs, `libSDL3.so`, `libgoo-harfbuzz.so`, `libgoo-harfbuzz-gpu.so`, and notices. Module import, window, input, dialog, scrolling and background results were tested on NVIDIA GeForce RTX 3080. |
| Windows x64 | Build with `-r win-x64`. Keep the dependency DLLs, `SDL3.dll`, `goo-harfbuzz.dll`, `goo-harfbuzz-gpu.dll`, and notices. Not verified for this module. |
| macOS ARM64 | Build with `-r osx-arm64` and retain the supplied dylibs, including MoltenVK. Not verified for this module. |

Do not ship `PowerShell.csproj`, `obj`, PDBs or the empty dependency-only `PowerShell.dll`. Keep Goo's dependency and native libraries together. Sign the scripts and manifest if the deployment policy requires signing.

## 10. PowerShell-specific pitfalls

- Use `.psm1` plus `.psd1`, explicit exports and approved verbs such as `Show-GooLog` and `Test-GooLog`.
- Set `$ErrorActionPreference = 'Stop'` in the entry script, module and worker. Handle job failures when receiving their output.
- Base classes must exist when PowerShell parses a class declaration. The manifest's `RequiredAssemblies` loads Goo before it parses `GooLog.psm1`. An `Add-Type` or `Import-Module` statement earlier in the same file does not run before that file is parsed. For a separate file with more Cell subclasses, load Goo first, then dot-source that file.
- `using module` exposes module-defined classes at parse time. `Import-Module` is enough for callers that only use exported functions. `using namespace` shortens names. It does not load assemblies.
- Start a new `pwsh` process after changing class definitions. `Remove-Module` does not unload PowerShell classes or Goo assemblies.
- Use `[Action]`, `[Action[string]]` and `[Func[string,Blob]]` rather than passing untyped scriptblocks to overloaded APIs.
- Keep callback closures in fields. Do not capture a changing loop variable in row callbacks.
- PowerShell class local names cannot shadow a property name, even with different letter case. Use `$receivedLines`, not `$lines`, in a class with a `Lines` field.
- PowerShell unwraps pipeline output. Use explicit `[string[]]` arrays at list boundaries. Suppress unused .NET return values with `$null =`.
- `--check` verifies callbacks, blank input, clearing, bounded unique log keys, style conversions and the worker-runspace failure. It does not replace a real render and interaction check.
