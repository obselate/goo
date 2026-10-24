# G# watch modes and limits

See [Edit and inspect](https://github.com/obselate/goo/blob/main/docs/edit-and-inspect.md)
for the app-author workflow and current refresh limit.

## Choose run or watch

Default to `dotnet watch` only when comparable measurements for the actual project show no application performance or resource-use difference versus `dotnet run`. If overhead is measured or parity is unknown, explicitly offer watch and state that tradeoff before selecting it. Keep using `dotnet run` until the user chooses watch. An existing explicit choice remains valid; do not ask again.

For inspection, use `GOO_DEVTOOLS=1 dotnet run --project App.gsproj` or `goo dev --no-watch --project App.gsproj`. Once watch is selected, use `GOO_DEVTOOLS=1 dotnet watch --project App.gsproj` or `goo dev --project App.gsproj`. The latter enables watching by default. Preserve the project's configuration and runtime choices.

The existing reload tests establish correctness, not performance parity. Do not infer zero overhead from a stable PID, unchanged UI state, or idle CPU alone. If comparing modes, hold build configuration, runtime, diagnostics, workload and warmup constant. Compare application CPU, memory/allocations and frame/input latency at idle and under load. Report watcher/build-process CPU and memory separately from application costs, including edit/rebuild spikes. Describe measurement uncertainty rather than claiming exact zero overhead. Use normal run or the intended published executable for performance acceptance measurements unless watch itself is the subject.

## Which edits need restart

- Supported method-body edits can update text, layout, styles and logic evaluated by `Build` without reopening the native window, provided emitted metadata shape remains supported. Changes to lambdas or generated code can also change metadata shape, so inspect the actual result.
- Current G# rejects added/removed types or members, changed signatures, and new metadata references with `GSHR1001` (restart required). Press `Ctrl+R` to restart. A full process restart reopens windows and resets in-memory state.
- Applied code does not rerun startup, static initialization, constructors or mount-time seeds on existing objects. Changed initial values require recreating the affected objects or restarting. Retained state keeps its old values. Native options applied only during window creation require recreating that window unless an explicit live-update path exists.
- Current G# emits metadata and IL deltas, not Portable PDB deltas. Restart when changed sequence points or local-variable layout require accurate debugger stepping.

The guarantee is supported method edits without window reopening, not arbitrary code edits or preservation of every child when the application changes component identity. Verify the actual consumer, edit and state before extending results to other SDK versions, configurations, platforms or project-reference graphs.

## Watched inputs

Add this project item if source files are not already watched:

```xml
<ItemGroup>
  <Watch Include="**/*.gs" Exclude="bin/**;obj/**" />
</ItemGroup>
```

For restart-on-edit, run `dotnet clean App.gsproj`, then
`GOO_DEVTOOLS=1 dotnet watch --no-hot-reload --project App.gsproj`.
Clean before switching modes to remove mode-specific bootstrap output.
Each restart reopens windows and resets application state.

Goo endpoint descriptors can contain a UTF-8 BOM. Decode JSON accordingly. Raw runtime snapshots can contain `full: false` and only a delta. Request `payload: {"full":true}` for a complete tree. The MCP `goo_snapshot` tool does this on every call.
