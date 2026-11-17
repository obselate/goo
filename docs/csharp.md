# Goo from C#

The [checked sample](../samples/interop/CSharp/Program.cs) uses .NET 10 and C# 14.
The excerpts below come from that file. Names such as `AppTheme`, `items` and
`Save` refer to its fields and methods.

## 1. Setup and the first window

Install the .NET 10 SDK. The sample is checked with SDK 10.0.403. A JIT build
needs the .NET 10 runtime. A self-contained publish includes it.
Check [platform requirements](platform-preflight.md) before running.

The [project](../samples/interop/CSharp/CSharp.csproj) enables nullable analysis,
implicit usings and warnings as errors:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net10.0</TargetFramework>
    <LangVersion>14</LangVersion>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Goo" Version="$(GooReleaseVersion)" />
    <PackageReference Include="Goo.Widgets" Version="[0.22.2]" />
  </ItemGroup>
</Project>
```

The repository sets `GooReleaseVersion` to `0.31.0`. In a standalone project,
replace that property reference with `0.31.0` and use NuGet.org. The repository's
`NuGet.Config` instead resolves Goo from `artifacts/packages` after a source pack.

Use file-scoped namespaces and ordinary C# object initializers. `Program.Main`
creates the window, attaches the widget theme and starts the event loop:

```csharp
var window = new Window
{
    Title = "C# interop",
    Size = new LayoutSize(640, 480),
    Root = new Examples(args.FirstOrDefault() ?? "counter")
};
Goo.Widgets.Theme.Attach(window);
Goo.Widgets.Theme.SetMode(window, Goo.Widgets.ThemeMode.Dark);
Application.Run(window);
```

From the repository root, with the local Goo package available:

```sh
dotnet run --project samples/interop/CSharp/CSharp.csproj -c Release -- counter
dotnet run --project samples/interop/CSharp/CSharp.csproj -c Release -- --check
```

Other scene names are `list`, `input`, `variants`, `virtual`, `dialog`, `load` and `layout`.

## 2. Cells and state

Derive a sealed class from `Cell`. `Build()` returns a fresh `Blob` tree.
Keep values read by `Build` in retained `State<T>` fields. The counter declares:

```csharp
private readonly State<int> count = new(0);
private readonly ElementHandle addButton = new();
```

Its text reads `count.Value`. Its button callback writes it:

```csharp
OnClick = () => count.Value++,
```

Goo rebuilds the Cells that read the changed state. Do not call `Rebuild()` after
an input callback, post, timer or awaited Goo callback. Do not write state,
schedule work or perform I/O in `Build`. Trees freeze after Goo receives them.

Use an ordinary field for a service or model when needed. Goo also handles plain
field changes made in its callbacks. `State<T>` permits more precise reader
tracking. See [Cell state and lifetime](api/cell.md).

## 3. Composition and identity

Collection expressions assign children. Spread a small sequence with `..rows`:

```csharp
var rows = data.Select(value => (Blob)new Text { Key = value, Content = value });
return new Container
{
    BasedOn = AppTheme.Panel,
    MaxWidth = Length.Percent(100),
    Children = [new Text { Content = "Account" }, ..rows,
        Cell.Mount<AccountInput, AccountCell>("account", new("Ada"))]
};
```

`Children = [child]` assigns a collection. `Children = { child }` adds to the new
Blob's existing collection. Both appear in the sample. Neither permits changing
a tree after mount.

Use records for immutable typed inputs:

```csharp
public sealed record AccountInput(string Name);
```

`AccountCell : Cell<AccountInput>` overrides `protected Build(AccountInput input)`.
`Cell.Mount` retains the child and passes its input. Record equality lets Goo
compare inputs. Replace changed collections rather than mutating them in place.
Use a stable domain key when siblings can move, not their current index.

The sample uses a primary constructor for `Examples(string sample)` because it
only selects the scene. Constructors do not start UI work. `Host` and handles
become useful when mounted. Use `Mounted()` for work that needs the first layout.

## 4. Input, handles and focus

Use Goo.Widgets `TextField` for single-line editing. It provides selection,
clipboard, undo, IME and Tab traversal:

```csharp
new TextField
{
    Label = "Name", Value = name.Value, Handle = field,
    OnChange = value => name.Value = value, OnSubmit = _ => Save()
},
```

The `input` scene retains `field` as an `ElementHandle`. The Focus name callback
calls `field.Focus()`. Its container owns the save shortcut:

```csharp
KeyBindings = [new(Key.S, KeyModifiers.Primary, Save)],
```

`Primary` is Command on macOS and Ctrl elsewhere. Bind commands with
`KeyBindings`, not a replacement text editor in `OnKeyDown`. Focus follows tree
order through enabled Tab stops.

Core `Goo.Button` has no default activation keys. The counter binds Enter to
`addButton.Activate()`, Space press to `BeginPress()`, and its paired release to
`EndPress(true)`. Goo.Widgets buttons supply their activation bindings. Use
`OnClick` for the command, so pointer and keyboard activation share it.

Try methods use normal C# `out var`. The sample's `HitTest` returns a nullable
`TextPosition` when `TryGetTextPositionAt` fails. See [input](api/input.md).

## 5. Styling and layout

Keep colors and metrics in one theme. `AppTheme` retains reusable `Style` values.
Attach the Widgets theme too, so widget text, surfaces and focus rings agree.
Put `BasedOn` before local overrides:

```csharp
new Button { BasedOn = AppTheme.Button, Padding = Length.Em(1), BackgroundColor = AppTheme.Background,
    Children = [new Text { Content = "Override" }] }
```

`BasedOn` copies style declarations, not children, keys, handles or callbacks.
Later declarations win.

| Value | C# form |
| --- | --- |
| Pixels | Numeric values convert to `Length`. The sample uses `Padding = 24` and `Gap = 12`. |
| Relative lengths | `Length.Percent(100)` fills the parent axis. `Length.Em(1)` follows the element's font size. |
| Padding | A single numeric value converts to uniform `Edges`. |
| Colors | `Color.Rgb(24, 31, 43)` and `Color.Parse("#4a7dff")` are used in `AppTheme`. |
| Flexible regions | Set `FlexGrow = 1` and `MinHeight = 0` for a list inside a sized parent. |

Prefer flex layout to fixed content sizes. See [layout](api/layout.md) and
[style](api/style.md).

## 6. Virtual collections

The `virtual` scene retains 10,000 items and static key and row-builder delegates.
Do not create or sort the collection in `Build`. Build only the visible rows:

```csharp
var list = VirtualLists.Rows(items, 24, ItemKey, BuildRow);
list.FlexGrow = 1;
list.MinHeight = 0;
list.ScrollbarVisibility = ScrollbarVisibility.Always;
return new Container { BasedOn = AppTheme.Panel, Children = [list] };
```

Import `Goo.Widgets.Data`. The second argument estimates row height. The key
identifies the item, not its position. Give the list a bounded viewport and do
not wrap it in another scrolling container. Off-screen rows unmount. Keep
selection and edits in the owner, keyed by item ID.

## 7. Dialogs and Widgets

Import `Goo.Widgets.Layout`. Keep open state in the owning Cell and mount the
modal host with a stable key:

```csharp
Cell.Mount<ModalDialog, ModalDialogHost>("dialog", new ModalDialog
{
    Open = open, Content = new Text { Content = "Save account?" }, Padding = 20,
    OnOpenChange = value => open = value, OnCancel = Close, OnConfirm = Close
})
```

`Close` sets `open` to false. The host owns modal focus, button keys and Escape.
`OnCancel` and `OnConfirm` are separate actions. Mount the host even while closed.
Do not create and dispose a host in each `Build`.

The sample also compiles `PickFile(Window window)`, which awaits
`ShowFileDialogAsync(FileDialogKind.OpenFile)`. Native file dialogs use the host
OS. See [native dialogs](desktop-integration.md#native-dialogs).

## 8. Threading and background work

`Build`, input callbacks and posted actions run on the UI thread. A continuation
awaited in a Goo callback returns there. Keep callbacks nonblocking. Use
`async void` only at an `Action` event boundary. Other asynchronous methods
should return `Task` or `Task<T>`.

The `load` scene uses this handler:

```csharp
private async void Load()
{
    var token = Latest("load");
    status.Value = "Loading";
    try
    {
        var result = await Task.Run(() => ReadRuntime(token), token);
        if (!token.IsCancellationRequested)
            status.Value = result;
    }
    catch (OperationCanceledException) when (token.IsCancellationRequested) { }
    catch (Exception error) { status.Value = error.Message; }
}
```

For real I/O, await the service's asynchronous API directly. Use `Task.Run` for
synchronous work that must leave the UI thread. Pass `Lifetime`, or `Latest(name)`
for a replaceable request. Goo cancels these tokens when the Cell unmounts.
Check cancellation before applying a result. Catch failures at the event boundary.

`ReadRuntime` runs in the background. It posts a status update through Goo:

```csharp
Post(() => status.Value = "Reading runtime");
```

Do not write Cell state directly from background work. `Post` returns false when
the Cell cannot accept work, and queued work can be dropped during teardown.
Dropping this optional status is safe. Use `Window.InvokeAsync` when the caller
needs to await a UI action. Never use `.Wait()` or `.Result` in UI code.

## 9. Shipping with NativeAOT

C# supports trimmed JIT and NativeAOT. Install the platform's
[NativeAOT build tools](https://learn.microsoft.com/dotnet/core/deploying/native-aot/),
then publish on the target OS. This is the sample's Linux NativeAOT check:

```sh
dotnet publish samples/interop/CSharp/CSharp.csproj -c Release -r linux-x64 \
  -p:PublishAot=true -p:TrimmerSingleWarn=false -p:ILLinkTreatWarningsAsErrors=true \
  -p:IlcTreatWarningsAsErrors=true -o artifacts/csharp-nativeaot
./artifacts/csharp-nativeaot/CSharp counter
```

The sample publishes with zero trim or AOT warnings. Do not suppress warnings to
make a publish pass. Check every scene and its input after publishing.
For trimmed JIT, replace `-p:PublishAot=true` with
`-p:PublishTrimmed=true --self-contained true`.

Distribute the entire publish directory, including native libraries and license
notices. Self-contained does not include GPU drivers or OS services. Do not
select a renderer in application code. Goo owns renderer selection.
See [shipping](shipping.md) for platform targets and packaging.

## 10. C# pitfalls

| Pitfall | Use instead |
| --- | --- |
| Calling a child `Build()` by hand | `Cell.Mount` retains identity, state and lifetime. |
| Mutating a Blob after return | Build a fresh declaration tree. Retain data and handles, not mounted Blobs. |
| Applying `BasedOn` last | Set it first, then override individual declarations. |
| Treating a record's array as immutable | Replace the array when its contents change. Record equality does not compare array elements. |
| Assuming callbacks use reflection | Pass ordinary typed delegates. No `dynamic` or reflection bridge is needed. |
| Setting state from `Task.Run` | Use `Cell.Post`, or apply the awaited result on the UI thread. |
| Blocking an event with `.Result` | Await its task and handle cancellation and exceptions. |
| Constructing `Virtual` without a source | Use `VirtualLists.Rows`, or provide a core `VirtualSource`. |
| Expecting core buttons to bind Enter and Space | Bind their activation explicitly, or use a Widgets button. |
