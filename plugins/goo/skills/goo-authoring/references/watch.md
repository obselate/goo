# G# watch modes and limits

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

## Verified local patches

On Linux x64 with .NET SDK 10.0.302, the locally rebuilt G# hot-reload runtime dispatches assembly `MetadataUpdateHandler` callbacks after applying deltas. Patched Goo queues mounted Cell rebuilds on each window's UI thread, including typed Cells with unchanged inputs and direct Cell wrappers. No new public API is required.

The local consumer selects the runtime through `GsharpHotReloadRuntimeAssemblyFullPath` and uses `Goo.0.5.0-hotreload-local.20260906`. These are local patches, not a claim about published SDK 0.4.1 or Goo 0.5.0. Check the consumer's resolved dependencies before promising this behavior.

Two successive method edits across two native windows passed with diagnostics enabled and disabled. PID, native handles, Cell instances, counter, editor text and selection remained unchanged, and captures showed the new label. A structural edit reported `GSHR1001` without an automatic restart. The G# hot-reload tests (13), Goo API-contract tests (12), and reconciliation/text-entry tests (7) passed. No run-versus-watch performance comparison was performed.

Reproduction: `tests/Goo.HotReloadSmoke/README.md` in the Goo checkout. Local evidence: `/home/xaz/Projects/goo-gsharp/artifacts/hot-reload/evidence/{no-devtools,devtools}`. These paths identify development evidence and need not exist on another machine.

## Released-package fallback

With published Gsharp.NET.Sdk 0.4.1 and Goo 0.5.0, a method edit applied but the retained UI stayed unchanged. The G# runtime did not dispatch metadata-update callbacks. An applied-method message alone therefore does not prove visible UI refresh.

If the user chooses restart-on-edit for this combination, add the following item if absent:

```xml
<ItemGroup>
  <Watch Include="**/*.gs" Exclude="bin/**;obj/**" />
</ItemGroup>
```

Run `dotnet clean App.gsproj`, then `GOO_DEVTOOLS=1 dotnet watch --no-hot-reload --project App.gsproj`. Clean before switching watch modes: the tested output directory otherwise retained a bootstrap reference without its runtime dependency. This fallback reopens windows and loses application state on each restart. It follows the same explicit watch-selection rule above.

The published-package integration run is `/tmp/goo-agent-e2e-k9flf08g/result.json`. All six MCP tools passed, a method delta applied without visible refresh, an added function produced `GSHR1001`, and restart-on-edit changed the PID and visible label. `scripts/verify.py` exercises this published-package scenario, not the local patched-runtime or performance comparison.

Goo endpoint descriptors can contain a UTF-8 BOM. Decode JSON accordingly. Runtime snapshots can contain `full: false` and only a delta; a new client must not assume every snapshot is a complete tree.
