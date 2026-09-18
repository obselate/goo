# Goo agent plugin

Standalone G# Goo authoring guidance and twelve stdio MCP tools. Requires Python 3.11+, uv, and .NET 10 for applications. The server uses the official MCP Python SDK.

| Tool | Purpose |
| --- | --- |
| `goo_context` | List documentation, source provenance, and runtime setup |
| `goo_search` | Search API and DevTools documentation |
| `goo_read` | Read bounded document ranges with content hashes |
| `goo_starter` | Return the official counter project and source |
| `goo_targets` | Discover live processes and stable window IDs |
| `goo_capabilities` | Read runtime capabilities and supported temporary style properties |
| `goo_snapshot` | Read a complete tree or bounded semantic query with session-scoped target handles |
| `goo_capture` | Return a real Vulkan screenshot as MCP image content |
| `goo_input` | Send opt-in pointer, wheel, keyboard, text, and reset events |
| `goo_inspect` | Enter, select, clear, or exit diagnostics inspection |
| `goo_style_override` | Apply one temporary runtime style override |
| `goo_style_reset` | Reset one property or all temporary overrides on one node |

## Install

Install the runtime CLI with `dotnet tool install --global Goo.DevTools --version 0.6.1`.
Confirm it is available:

```sh
goo list --json
```

Run this once from the plugin directory:

```sh
python3 scripts/configure.py
```

Configure your MCP client to run:

```sh
uv run --project /absolute/path/to/plugins/goo --locked python /absolute/path/to/plugins/goo/scripts/server.py
```

Keep the plugin directory in place after installation. Run
`python3 scripts/configure.py` again if you move it. No API key or hosted model
service is required.

## Use

Launch an app:

```sh
goo dev --no-watch --project App.gsproj
```

Then:

1. Call `goo_context` to check the plugin and CLI.
2. Call `goo_targets` and select the process and window.
3. Use `goo_snapshot` or `goo_capture` to inspect the app.
4. Launch with `goo dev --input --no-watch --project App.gsproj` when input
   automation is needed.

Runtime tools require an explicit target. The plugin uses the capabilities reported
by that runtime. A timed-out mutation may have applied, so do not retry it
automatically. Application processes remain under the caller's control.

See the [Goo authoring skill](skills/goo-authoring/SKILL.md) for query, input,
inspection, style, and watch details.

## Source checkout

The installed CLI is the normal path. To test a Goo source checkout, build its CLI
and set `GOO_CLI` in the MCP server environment:

```sh
dotnet build tools/Goo.DevTools.Cli/Goo.DevTools.Cli.csproj -c Release
export GOO_CLI=/absolute/path/to/goo/tools/Goo.DevTools.Cli/bin/Release/net10.0/Goo.DevTools.Cli.dll
```

Set `GOO_DEVTOOLS_DIR` in both the app and server environments only when testing
a custom descriptor directory. Pass a project path to runtime tools for
project-local discovery.

## Refresh and verify

Refresh the bundle with `python3 scripts/sync_docs.py /path/to/goo-checkout`. Validate the MCP workflow with:

```sh
GOO_CLI=/absolute/path/to/Goo.DevTools.Cli.dll uv run --locked python scripts/verify.py
```

Also run `python3 scripts/configure.py --check`. Reinstall the local plugin and
start a new Codex thread after changing its skills or MCP tool definitions.
