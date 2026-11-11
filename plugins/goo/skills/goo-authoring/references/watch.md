# G# watch modes and limits

See [DevTools](../../../reference/docs/devtools/README.md#edit-a-running-app) for the edit workflow.

## Run with hot reload

```sh
goo dev --project App.gsproj
```

This enables diagnostics and hot reload. Measure published apps for performance acceptance.

## Which edits need restart

- Supported method-body edits can update text, layout, styles and logic evaluated by `Build` without reopening the native window, provided emitted metadata shape remains supported. Changes to lambdas or generated code can also change metadata shape, so inspect the actual result.
- Current G# rejects added/removed types or members, changed signatures, and new metadata references with `GSHR1001` (restart required). Press `Ctrl+R` to restart. A full process restart reopens windows and resets in-memory state.
- Applied code does not rerun startup, static initialization, constructors or mount-time seeds on existing objects. Changed initial values require recreating the affected objects or restarting. Retained state keeps its old values. Native options applied only during window creation require recreating that window unless an explicit live-update path exists.
- Current G# emits metadata and IL deltas, not Portable PDB deltas. Restart when changed sequence points or local-variable layout require accurate debugger stepping.

Supported method edits preserve the window, not every child when component identity changes. Check the visible edit and retained state.

## Watched inputs

Add this project item if source files are not already watched:

```xml
<ItemGroup>
  <Watch Include="**/*.gs" Exclude="bin/**;obj/**" />
</ItemGroup>
```
