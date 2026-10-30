# Goo app best practices

Read this before you write or review Goo app code. These rules override threading, structure and list code in older samples.

## Rules

| # | Rule | Pass condition |
| --- | --- | --- |
| 1 | Never block the UI thread. | No `.Result`, `.Wait()`, `.GetAwaiter().GetResult()`, `Thread.Sleep`, synchronous file, network or process I/O in `Build`, handlers, timers or posted actions. |
| 2 | Use `go` and `scope` for background work. | No `Task.Run`, `Thread`, `ThreadPool` or `ContinueWith` in app code. |
| 3 | Separate models, views and controllers. | Models hold data and domain logic. Views build Blobs from a model. The view Cell handles input and calls the model. See App structure. |
| 4 | Put I/O and long work in services. | File, network, process, parse and heavy compute code is in `Services/` and runs in `go` children. Views and models do no I/O. |
| 5 | Reuse components. | A visual pattern that occurs twice is one component. Use Goo.Widgets controls before you write a new control. |
| 6 | Use theme tokens. | Views contain no color, font, radius or spacing literals. All values come from one theme. |
| 7 | Change Cell state and call `Rebuild()` only on the UI thread. | Every background result returns through `window.TryPost`. |
| 8 | Bind background work to the Cell and the window. | The Cell implements `IDisposable` and cancels its token. The token links `window.Closed`. |
| 9 | Drop stale results. | A generation number guards every posted result. |
| 10 | Virtualize every list sized by data. | No `for` loop over data rows inside `Build`. |
| 11 | Keep `Build` cheap. | No sort, filter, group, parse or format of a whole collection in `Build`. |
| 12 | Rebuild the smallest Cell that changed. | Each region is its own Cell. High-rate data is coalesced. |
| 13 | Idle draws no frames. | At rest the profile shows no rebuild, layout, render or present. |
| 14 | Measure before you report done. | Frame `p99` stays below budget under the heaviest interaction. |
| 15 | Attach the editing key bindings. | The app root and every `ModalDialog` set `KeyBindings: WidgetKeyBindings.Editing(window.PlatformInput)`. Text input uses `TextField` or `TextArea`. See Keyboard and text input. |

## App structure

| Folder | Contents | Rules |
| --- | --- | --- |
| `Models/` | Domain data, state and logic. View inputs as `data struct` types. | Domain types do not import `Goo`. No I/O. A model can be tested without a window. |
| `Views/` | One Cell for each screen or region. | `Build` reads the model and Cell fields and returns a Blob. Handlers call model or service methods. No domain logic and no I/O. |
| `Components/` | Cells and Blob factories that more than one view uses, and the app theme. | Data comes in through `Cell[TInput]` inputs or parameters. Components hold no app state. |
| `Services/` | File, network, process, platform and persistence access, and heavy compute. | Called from `go` children. A service returns results and never touches a Cell. |
| `Program.gs` | Window setup and the root Cell. | No view code. |

- The view Cell is the controller for its region. It owns UI state such as selection and scroll, handles input, calls the model, starts `go` work and calls `Rebuild()`.
- When a screen has many state transitions, put them in a model class with methods, for example `SearchModel.Apply(query)`. The Cell then only connects input to model calls.
- A form model owns one `CanSubmit` value. The submit button `Disabled` state and the Enter (`OnSubmit`) handler of every field read only that value. Do not write the submit condition twice.
- Data flow: a service result returns through `window.TryPost`, the model changes on the UI thread, the Cell rebuilds, the view builds from the model.
- Pass a child view only the model values it shows, as a `data struct` input. Goo then rebuilds the child only when those values change.
- Before you write a component, search Goo.Widgets and the app's `Components/`. Change an existing component when it is close. Do not copy it.

## Threads

| Runs on the UI thread | No UI-thread guarantee |
| --- | --- |
| `Build`, input handlers, layout, render | `go f()`, `go { ... }` |
| `window.Post` and `window.TryPost` actions | Code after `await` |
| `window.SetTimeout` and `window.SetInterval` callbacks | G# `after(d)` and `tick(d)` |
| `Anim.Completed` callbacks | |

- Frame budget is `1000 / refresh rate` ms: 16.7 ms at 60 Hz, 6.9 ms at 144 Hz. All UI-thread work in a frame shares it.
- Goo installs no `SynchronizationContext`. Code after `await` can run on any thread. Post UI changes through `window.TryPost`.
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
            window.TryPost(() -> {
                if id == generation {
                    rows = sorted
                    status = ""
                    Rebuild()
                }
            })
        } catch (error OperationCanceledException) {
        } catch (error Exception) {
            let message = error.Message
            window.TryPost(() -> {
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

- `Catalog`, `Item`, `Batch` and `Score` are app types. `SearchAsync` takes the token.
- Create the window, set `window.Root = SearchView(window, catalog)`, then call `window.Run()`.
- Goo disposes a mounted `IDisposable` Cell when it leaves the tree. `Dispose` increments `generation`, so results queued before unmount are dropped.
- The input handler rebuilds its own Cell, so `Search` does not call `Rebuild()`.

Fan out with `scope` inside the `go` child, never in a handler:

```gsharp
private func Rank(batches IReadOnlyList[Batch], id int32) {
    try {
        let output = chan[Score](batches.Count)
        scope {
            for batch in batches {
                go ScoreBatch(batch, output)
            }
        }
        let scores = List[Score](batches.Count)
        for i in 0 ... batches.Count {
            scores.Add(<-output)
        }
        window.TryPost(() -> {
            if id == generation {
                ranked = scores
                Rebuild()
            }
        })
    } catch (error OperationCanceledException) {
    } catch (error Exception) {
        let message = error.Message
        window.TryPost(() -> {
            if id == generation {
                status = message
                Rebuild()
            }
        })
    }
}
```

Start it with `go Rank(batches, generation)`. Start one child per batch, not per item. For CPU work, use about `Environment.ProcessorCount` batches.

| Do not write | Write |
| --- | --- |
| `await Task.Run(() -> Compute(x))` | `go ComputeAndPost(x, window)`, with `TryPost` inside `ComputeAndPost` |
| `Task.Run(async () -> await LoadAsync())` | `go Load(token)` |
| `Task.WhenAll(a, b)` | Start `go A()` and `go B()` on separate lines in a `scope` inside a `go` child |
| `Thread(...)`, `ThreadPool.QueueUserWorkItem` | `go` |
| `task.ContinueWith(t -> ...)` | `await` inside a `go` child, then `TryPost` |
| `x.GetAwaiter().GetResult()` in UI code | `go` and post the result |
| `Thread.Sleep(ms)` in UI code | `window.SetTimeout(callback, ms)` |
| `System.Threading.Timer` or `tick(d)` that touches Cells | `window.SetInterval(callback, ms)` |

## Rebuild and Build cost

- `Build` runs on every rebuild. Treat it as the hot path.
- Mount each region as its own Cell. A change rebuilds only that Cell.
- Compute sorted, filtered or grouped data when the source changes. Store it in a field. Compute large results in a `go` child.
- Replace a changed list. Do not mutate it in place. Typed inputs do not see in-place changes.
- Store the row builder in a field, as in `buildRow` above. A lambda that captures only `this` stays equal across builds, but a new closure over locals or parameters makes rows build again.
- For high-rate sources (sockets, progress, logs), store the latest value and apply it from `window.SetInterval` at 10 Hz or less. Dispose the timer when the source is idle.
- Animate paint with `AnimateValue`. It skips `Build` and layout. `Animate(initial)` rebuilds the Cell on every tick.
- Remove idle frame sources: a focused caret blinks, an interval runs, a shader background redraws. Unfocus at start, stop intervals, cap shader frame rate.

## Keyboard and text input

Goo has no default editing keys. Without `WidgetKeyBindings.Editing`, a text field accepts typed characters, and nothing else works: no Backspace, Delete, arrows, Home, End, selection, copy, cut, paste, undo, redo, Enter submit, Escape or Tab focus traversal.

| Need | Use |
| --- | --- |
| Single-line text | `TextField` (core `TextEntry`) |
| Multiline text | `TextArea` (core `TextEditor`) |
| Editing, clipboard, undo, Tab traversal | `KeyBindings: WidgetKeyBindings.Editing(window.PlatformInput)` on the app root |
| Dialog content | The same `KeyBindings` on each `ModalDialog` |
| App shortcuts, for example Ctrl+S | `KeyBinding` on the root or the region that owns the command |
| Submit on Enter | `OnSubmit` of a single-line field. It reads the form `CanSubmit`. |

- Never build a text input from `Text`, `Label` or a `Container` with `OnKeyDown` or `OnTextInput`. It loses selection, clipboard, undo, IME and screen reader support.
- Never prevent default on a key that the editing bindings use. That blocks the binding.
- Keyboard focus moves in tree order through enabled nodes with `TabStop`. There is no `TabIndex`. Order the tree as the user reads it.
- `DataGrid`, `TreeView` and `ComboBox` are one Tab stop each. Arrows move inside them. Enter and Space activate.
- Not supported: middle-click primary-selection paste, a text context menu, and line selection by triple-click in `TextField` (it selects all).

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

- Use a plain `for` loop only for a small set fixed at authoring time: tabs, toolbar buttons, form fields.
- The key is a stable domain ID. Never use the list index.
- Give the virtual element a bounded height: `FlexGrow` in a sized parent, or a fixed `Height`.
- Do not put a virtual element inside a container that scrolls as a whole.
- Off-screen rows unmount. Keep row state (expanded, selected, edits) in the owner, keyed by ID.
- Cap logs and history. `VirtualRows` updates in place when rows leave the start and arrive at the end.
- Set `followEnd` from consumer state on each build. Clear it when the reader scrolls back.
- `DataGrid` checks all array rows when the rows array changes. Keep the same array between data changes. For large sources, use the indexed inputs `RowAt`, `RowCount`, `RowIndex` and `RowVersion`.
- Positions are `float32`. Placement drifts beyond 16,777,216 px of content.
- `JumpTo` is immediate. `ScrollTo` animates containers and is immediate in text editors. `ElementHandle.ScrollToItem(key)` jumps to a virtual row.

## Verify

```sh
GOO_FRAME_PROFILE=1 goo dev --no-watch --project App.gsproj
```

- Run GUI apps only in a private headless or nested compositor. In a Goo checkout, prefix the command with `.github/scripts/with-headless-wayland.sh`.
- After 60 warmup frames Goo prints `p50`, `p99` and `max` for the frame and each phase every 240 frames.
- Load real-size data, for example 100,000 rows. Scroll the largest list, type in search, start a load. Frame `p99` stays below budget. Virtual row mount counts stay flat while you scroll.
- Idle prints no console report, because a report needs 240 frames. Check idle with a trace: Record 10 s with no input. Rebuild, layout, render and present stay at zero.
- For a trace, add `--inspector`, open the Profiler tab, select Record, run the workload, select Stop.
- A high `build` phase means expensive Cell builds. A high `reconcile` phase can also come from style resolution or diff work. Check `build`, `style_resolve` and `diff` before you change the rebuild scope.
- Test every text field with the keyboard only: type, Backspace, Delete, Left, Right, Ctrl+Left, Ctrl+Right, Ctrl+Backspace, Home, End, Shift+arrows, Ctrl+A, Ctrl+C, Ctrl+X, Ctrl+V, Ctrl+Z, Ctrl+Shift+Z, Enter, Tab and Shift+Tab. On macOS use Cmd for select all, clipboard, undo and redo, and Option for word movement and word delete. Repeat in each dialog.

Find violations before review:

```sh
rg -n --glob '*.gs' 'Task\.Run|Thread\(|ThreadPool|ContinueWith|GetAwaiter\(\)\.GetResult|\.Wait\(\)|Thread\.Sleep|System\.Threading\.Timer'
rg -n --glob '**/Views/**/*.gs' 'Color\.(Rgb|Parse)|"#[0-9a-fA-F]{6}|File\.|Directory\.|HttpClient|Process\.Start'
rg -q --glob '*.gs' 'TextField|TextArea|TextEntry|TextEditor' && ! rg -q --glob '*.gs' 'WidgetKeyBindings\.Editing' && echo 'Text input without editing key bindings'
```

Each hit in app code is a defect. Fix threading hits with the table in Background work. Fix structure hits with App structure.
