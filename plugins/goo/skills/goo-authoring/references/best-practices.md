# Goo app best practices

These app rules override threading, structure and list code in older samples.

## Rules

| # | Rule |
| --- | --- |
| 1 | Never block the UI thread, including handlers, timers, posted actions and `Build`. No synchronous I/O, waits or sleeps. |
| 2 | Use `go` and `scope`, not `Task.Run`, `Thread`, `ThreadPool` or `ContinueWith`. See Threads. |
| 3 | Separate models, views and controllers. See App structure. |
| 4 | Put I/O, parsing and heavy compute in services called from `go` children. |
| 5 | Reuse a component for every repeated visual pattern. Prefer Goo.Widgets controls. |
| 6 | Use one theme for colors, fonts, radii and spacing. No literals in views. |
| 7 | Change Cell state and call `Rebuild()` only on the UI thread. Post background results. |
| 8 | Bind background work to Cell disposal and `window.Closed`. |
| 9 | Accept results only for the current request and mounted owner. See Background work. |
| 10 | Virtualize large or unbounded data lists. Measure worst-case mounts and frame cost for small bounded lists. |
| 11 | Do not sort, filter, group, parse or format whole collections in `Build`. See Rebuild and Build cost. |
| 12 | Rebuild the smallest changed Cell. Coalesce high-rate data. |
| 13 | Avoid unnecessary idle frames. See Verify. |
| 14 | Measure the heaviest interaction. Frame `p99` must stay below budget. |
| 15 | Use standard text controls and built-in editing keys. See Keyboard and text input. |

## App structure

| Folder | Contents | Rules |
| --- | --- | --- |
| `Models/` | Domain data, state and logic. View inputs as `data struct` types. | Domain types do not import `Goo`. No I/O. A model can be tested without a window. |
| `Views/` | One Cell for each screen or region. | `Build` reads the model and Cell fields and returns a Blob. Handlers call model or service methods. No domain logic and no I/O. |
| `Components/` | Cells and Blob factories that more than one view uses, and the app theme. | Data comes in through `Cell[TInput]` inputs or parameters. Components hold no app state. |
| `Services/` | File, network, process, platform and persistence access, and heavy compute. | Called from `go` children. A service returns results and never touches a Cell. |
| `Program.gs` | Window setup and the root Cell. | No view code. |

- When a screen has many state transitions, put them in a model class with methods, for example `SearchModel.Apply(query)`. The Cell then only connects input to model calls.
- A form model owns one `CanSubmit` value. The submit button `Disabled` state and the Enter (`OnSubmit`) handler of every field read only that value. Do not write the submit condition twice.
- Pass a child view only the model values it shows, as a `data struct` input. Goo then rebuilds the child only when those values change.
- Before you write a component, search Goo.Widgets and the app's `Components/`. Change an existing component when it is close. Do not copy it.

## Threads

| Runs on the UI thread | No UI-thread guarantee |
| --- | --- |
| `Build`, input handlers, layout, render | `go f()`, `go { ... }` |
| `window.Post` actions | Code after `await` |
| `window.SetTimeout` and `window.SetInterval` callbacks | G# `after(d)` and `tick(d)` |
| `Anim.Completed` callbacks | |

- Frame budget is `1000 / refresh rate` ms: 16.7 ms at 60 Hz, 6.9 ms at 144 Hz. All UI-thread work in a frame shares it.
- Goo installs no `SynchronizationContext`. Code after `await` can run on any thread. Post UI changes through `window.Post`.
- Check the bool returned by `window.Post` when work must not be lost and handle rejection. Queue acceptance does not guarantee execution if teardown starts later.
- `Rebuild()` does not switch threads. It throws if called during `Build`.
- `scope` waits for its children at its end. Normal exit does not cancel them. Pass a token.
- A function that contains `scope` becomes suspending. A call from a synchronous boundary blocks and reports `GS0558`. Never join child work in a UI callback.
- An unhandled exception in a free `go` child stops the process. A child inside `scope` reports its failure through the scope. Catch failures in every background entry point.

## Background work

```gsharp
class SearchView : Cell, IDisposable {
    private let window Window
    private let catalog Catalog
    private let lifetime CancellationTokenSource = CancellationTokenSource()
    private let buildRow (Item) -> Blob
    private var search CancellationTokenSource?
    private var generation int32
    private var rows IReadOnlyList[Item] = []Item{}
    private var status string = ""

    init(window Window, catalog Catalog) {
        this.window = window
        this.catalog = catalog
        buildRow = item -> Text{Content: item.Name}
    }

    private func Search(query string) {
        search?.Cancel()
        search?.Dispose()
        let current = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token, window.Closed)
        search = current
        generation++
        status = "Searching"
        go Load(query, generation, current.Token)
    }

    private func Load(query string, id int32, token CancellationToken) {
        try {
            let found = await catalog.SearchAsync(query, token)
            let sorted = found.OrderBy(item -> item.Name).ToArray()
            window.Post(() -> {
                if id == generation {
                    rows = sorted
                    status = ""
                    Rebuild()
                }
            })
        } catch (error OperationCanceledException) {
        } catch (error Exception) {
            let message = error.Message
            window.Post(() -> {
                if id == generation {
                    status = message
                    Rebuild()
                }
            })
        }
    }

    public func Dispose() {
        generation++
        lifetime.Cancel()
        search?.Dispose()
        lifetime.Dispose()
    }

    override func Build() Blob -> Container{
        Height: Percent(100),
        Button{OnClick: () -> Search("goo"), Text{Content: "Search"}},
        Text{Content: status},
        Container{FlexGrow: 1.0, VirtualRows(rows, 32.0, item -> item.Id, buildRow)},
    }
}
```

- `Catalog` and `Item` are app types. `SearchAsync` takes the token.
- Create the window, set `window.Root = SearchView(window, catalog)`, then call `window.Run()`.
- Goo disposes a mounted `IDisposable` Cell when it leaves the tree. `Dispose` increments `generation`, so results queued before unmount are dropped.
- The input handler rebuilds its own Cell, so `Search` does not call `Rebuild()`.
- Start `scope` only inside a `go` child, never in a handler.
- Start one child per batch, about `Environment.ProcessorCount` batches for CPU work.

| Do not write | Write |
| --- | --- |
| `Thread.Sleep(ms)` in UI code | `window.SetTimeout(callback, ms)` |
| `System.Threading.Timer` or `tick(d)` that touches Cells | `window.SetInterval(callback, ms)` |

## Rebuild and Build cost

- `Build` runs on every rebuild. Treat it as the hot path.
- Mount each region as its own Cell. A change rebuilds only that Cell.
- Compute sorted, filtered or grouped data when the source changes. Store it in a field. Compute large results in a `go` child.
- Replace a changed list. Do not mutate it in place. Typed inputs do not see in-place changes.
- Store the row builder in a field, as in `buildRow` above. A lambda that captures only `this` stays equal across builds, but a new closure over locals or parameters makes rows build again.
- For high-rate sources (sockets, progress, logs), store the latest value and apply it at a measured interval that meets the latency and frame budgets. Start at 10 Hz when that is adequate. Dispose the timer when the source is idle.
- Animate paint with `AnimateValue`. It skips `Build` and layout. `Animate(initial)` rebuilds the Cell on every tick.
- Stop intervals when their sources are idle and cap continuous shader redraw rates. Preserve useful keyboard focus, caret behavior and active animations. Measure their intentional activity separately from idle work.

## Keyboard and text input

Core provides editing keys and Tab traversal, including in dialogs. Movement and deletion repeat. Clipboard and history do not.

| Need | Use |
| --- | --- |
| Single-line text | `TextField` (core `TextEntry`) |
| Multiline text | `TextArea` (core `TextEditor`) |
| Editing, clipboard, undo, Tab traversal | Built into core, including inside dialogs |
| App shortcuts, for example Ctrl+S | `KeyBinding` on the root or the region that owns the command |
| Submit on Enter | `OnSubmit` of a single-line field. It reads the form `CanSubmit`. |

- Never build a text input from `Text`, `Label` or a `Container` with `OnKeyDown` or `OnTextInput`. It loses selection, clipboard, undo, IME and screen reader support.
- Key press order: routed `OnKeyDown` handlers from the focused node up to the root, focused-node `KeyBindings`, built-in text editing, ancestor `KeyBindings`, then Tab focus traversal. Any routed handler can call `PreventDefault()` to block bindings and built-in defaults.
- A root `OnKeyDown` handler for app navigation keys must skip events while a text field has focus. Check `window.PlatformInput.Selection != nil`. Use a field's own `KeyBindings` to override editing. App-root Ctrl+A does not replace Select All. Existing root editing bindings do not run twice.
- Tab and Shift+Tab insert indentation and outdent in an editable multiline editor. Otherwise they move focus. Enter submits a single-line field and inserts a newline in an editable multiline editor. Escape cancels a drag, then composition, then a single-line edit.
- Keyboard focus moves in tree order through enabled nodes with `TabStop`. There is no `TabIndex`. Order the tree as the user reads it.
- `DataGrid`, `TreeView` and `ComboBox` are one Tab stop each. Arrows move inside them. Enter and Space activate.
- See the [input API](../../../reference/docs/api/input.md) for control-specific limits.

## Virtualization

| Data | Use |
| --- | --- |
| Rows, fixed or variable height | `VirtualRows(items, estimatedHeight, key, builder)` |
| Same-size tiles or wrapped grid | `VirtualItems(items, width, height, key, builder)` |
| Table with columns, sort or selection | `DataGrid` |
| Hierarchy | `TreeView` (keep `Virtualize` true) |
| Filtered pick list | `SearchList`, `ComboBox` |
| Log or stream tail | `VirtualRows(items, h, key, builder, followEnd: following)` |
| Custom 2D placement | `Virtual(source)` with your own `VirtualSource` |

- Use a plain `for` loop for small author-time fixed sets or measured small bounded data sets. Virtualize large or unbounded data lists.
- The key is a stable domain ID. Never use the list index.
- Give the virtual element a bounded height: `FlexGrow` in a sized parent, or a fixed `Height`.
- Do not put a virtual element inside a container that scrolls as a whole.
- Off-screen rows unmount. Keep row state (expanded, selected, edits) in the owner, keyed by ID.
- Cap logs and history. `VirtualRows` updates in place when rows leave the start and arrive at the end.
- Set `followEnd` from consumer state on each build. Clear it when the reader scrolls back.
- `DataGrid` checks all array rows when the rows array changes. Keep the same array between data changes. For large sources, use the indexed inputs `RowAt`, `RowCount`, `RowIndex` and `RowVersion`.
- See the [layout API](../../../reference/docs/api/layout.md) for placement limits and scroll methods.

## Verify

```sh
GOO_FRAME_PROFILE=1 goo dev --project App.gsproj
```

- Run GUI apps only in a private headless or nested compositor. In a Goo checkout, prefix the command with `.github/scripts/with-headless-wayland.sh`.
- After 60 warmup frames, frame profiling reports `p50`, `p99` and `max` every 240 frames. It prints nothing when idle.
- Load real-size data, for example 100,000 rows. Scroll the largest list, type in search, start a load. Frame `p99` stays below budget. Virtual row mount counts stay flat while you scroll.
- Record a 10 s idle trace without input, caret, animation or changing content. Rebuild, layout, render and present stay at zero. Measure intentional activity separately.
- For a trace, add `--inspector`, open the Profiler tab, select Record, run the workload, select Stop.
- A high `build` phase means expensive Cell builds. A high `reconcile` phase can also come from style resolution or diff work. Check `build`, `style_resolve` and `diff` before you change the rebuild scope.
- Verify affected editing, submit and focus interactions. Carry unchanged host and control results forward. Rerun full editing checks when editing, focus or dialog routing changes: Type, Backspace, Delete, arrows, PageUp/PageDown, Home/End, Ctrl+Home/End, Ctrl+Left/Right, Ctrl+Backspace/Delete, Shift+movement, Ctrl+A/C/X/V/Z, Ctrl+Shift+Z, Ctrl+Y, Enter, KeypadEnter, Escape, Tab and Shift+Tab. Check IME, read-only, password and text direction. On macOS use Command for primary shortcuts and Option for word movement and deletion.

Search for possible violations before review:

```sh
rg -n --glob '*.gs' 'Task\.Run|Thread\(|ThreadPool|ContinueWith|GetAwaiter\(\)\.GetResult|\.Wait\(\)|Thread\.Sleep|System\.Threading\.Timer'
rg -n --glob '**/Views/**/*.gs' 'Color\.(Rgb|Parse)|"#[0-9a-fA-F]{6}|File\.|Directory\.|HttpClient|Process\.Start'
rg -n --glob '*.gs' 'WidgetKeyBindings\.Editing|OnKeyDown|OnTextInput'
```

Matches are leads for semantic review, not automatic defects. Keep deliberate field overrides.
