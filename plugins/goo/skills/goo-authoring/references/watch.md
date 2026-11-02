# G# watch modes and limits

See [Edit and inspect](https://github.com/obselate/goo/blob/main/docs/edit-and-inspect.md)
for the app-author workflow and current refresh limit.

## Run with hot reload

```sh
goo dev --project App.gsproj
```

This enables diagnostics and hot reload. Use `goo dev --input --project App.gsproj` for requested input automation. Measure published applications for performance acceptance.

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

Goo endpoint descriptors can contain a UTF-8 BOM. Decode JSON accordingly. Raw runtime snapshots can contain `full: false` and only a delta. Request `payload: {"full":true}` for a complete tree. The MCP `goo_snapshot` tool does this on every call.
