# Goo agent plugin

Standalone G# Goo authoring guidance and eight stdio MCP tools. Requires Python 3.11+, uv, and .NET 10 for applications. The server uses the official MCP Python SDK.

| Tool | Purpose |
| --- | --- |
| `goo_context` | List documentation, source provenance, and runtime setup |
| `goo_search` | Search API and DevTools documentation |
| `goo_read` | Read bounded document ranges with content hashes |
| `goo_starter` | Return the official counter project and source |
| `goo_targets` | Discover live processes and stable window IDs |
| `goo_snapshot` | Read a complete tree with node IDs, state, accessibility, and layout |
| `goo_capture` | Return a real Vulkan screenshot as MCP image content |
| `goo_input` | Send opt-in pointer, wheel, keyboard, text, and reset events |

## Runtime setup

Discovery requires the new `goo list` command. Until the next CLI release, build it from this checkout and set `GOO_CLI` in the MCP server environment:

```sh
dotnet build tools/Goo.DevTools.Cli/Goo.DevTools.Cli.csproj -c Release
export GOO_CLI=/absolute/path/to/goo/tools/Goo.DevTools.Cli/bin/Release/net10.0/Goo.DevTools.Cli.dll
```

Published Goo 0.5.4 provides the full snapshot and input runtime used by the integration check. `GOO_CLI` can select an executable or a built CLI DLL. Set `GOO_DEVTOOLS_DIR` in both the app and server environments for a custom descriptor directory. For project-local discovery, pass the app project file or directory as `project` to all runtime tools.

Run any MCP client against:

```sh
uv run --project /absolute/path/to/plugins/goo --locked python /absolute/path/to/plugins/goo/scripts/server.py
```

The local MCP manifest uses the absolute source path. Keep that source folder available after installation. On another machine or after moving it, run `python3 scripts/configure.py` before installing or reinstalling. Set `GOO_CLI` in its server environment if needed. The tested Codex build did not expand plugin-root placeholders in MCP arguments. No API key or hosted model service is required.

## Agent workflow

Launch an app with `GOO_DEVTOOLS=1 dotnet run --project App.gsproj`, or `goo dev --no-watch --project App.gsproj`. Watching is opt-in until comparable project measurements establish performance parity. See the skill's [watch guidance](skills/goo-authoring/references/watch.md).

Call `goo_targets` and select the intended PID and stable window ID. Runtime tools require an explicit PID and reject ambiguous window selection. Discovery reads descriptors without attaching. It excludes exited processes. A window ID distinguishes windows that share a title.

`goo_snapshot` requests `full: true` on every call. Its `payload.added` contains the full current tree, with stable IDs for nodes that remain mounted. It fails on runtimes that return an incomplete tree. Raw protocol clients must request full snapshots themselves.

For automation, also set `GOO_DEVTOOLS_INPUT=1` in the app. `goo_input` uses the existing input capability and normal hit testing, focus, event routing, and Cell updates. Supply `node_id` from the selected window snapshot or logical `x`/`y` coordinates. Text goes to the focused editor. Await each event, finish pointer gestures, and inspect the resulting snapshot and image. A timed-out action may have applied and must not be retried automatically. Input is marked as state-changing and can trigger application behavior. Inspection tools remain read-only.

Application processes remain under the caller's control. The plugin does not launch apps, enable input in running apps, or pick the latest unrelated process.

## Documentation and verification

Pass `repository` to documentation/starter tools or set `GOO_SOURCE_ROOT` to use a current checkout. Its document list is discovered from current files, so a renamed or added guide does not depend on the bundled manifest. Bundled guides and the starter have commit and per-file SHA-256 provenance in `reference/manifest.json`. The generated starter includes a source Watch item but its launch command uses `--no-watch`.

Refresh the bundle with `python3 scripts/sync_docs.py /path/to/goo-checkout`. Validate the MCP workflow with:

```sh
GOO_CLI=/absolute/path/to/Goo.DevTools.Cli.dll uv run --locked python scripts/verify.py
```

The check builds a temporary package consumer, discovers its project-local window, verifies repeated full snapshots and stable IDs, rejects input without permission, drives click/pointer/keyboard changes, resets input, captures before/after PNGs, and checks stale-target errors and discovery after process exit. It also exercises current-checkout document additions/removals and path rejection. Evidence is saved in a printed temporary directory. Hot reload is checked separately by `tests/Goo.HotReloadSmoke/verify.py` in the Goo checkout.

Reinstall the local plugin after changing its source. Start a new Codex thread to load updated skills and MCP tool definitions.
