# Goo agent plugin

G# Goo authoring guidance and twelve stdio MCP tools. Requires .NET 10, the [Goo platform requirements](../../README.md#platforms), and Goo.DevTools 0.27.4. The server uses the official ModelContextProtocol .NET SDK inside Goo.DevTools. No Python or uv is needed.

| Tool | Purpose |
| --- | --- |
| `goo_context` | List documentation, source provenance, and runtime setup |
| `goo_search` | Search API and DevTools documentation |
| `goo_read` | Read bounded document ranges with content hashes |
| `goo_starter` | Return the official counter project and source |
| `goo_list` | List live processes and windows with project, pid, pipe, app and window filters |
| `goo_capabilities` | Read runtime capabilities and supported temporary style properties |
| `goo_snapshot` | Read a complete tree or bounded semantic query with session-scoped target handles |
| `goo_capture` | Return a real Vulkan screenshot as MCP image content |
| `goo_input` | Send opt-in pointer, wheel, keyboard, text, and reset events |
| `goo_inspect` | Enter, select, clear, or exit diagnostics inspection |
| `goo_style_override` | Apply one temporary runtime style override |
| `goo_style_reset` | Reset one property or all temporary overrides on one node |

## Install

Install the runtime CLI with `dotnet tool install --global Goo.DevTools --version 0.27.4`.
Confirm it is available:

```sh
goo list --json
```

### OMP

Link the package from the Goo checkout:

```sh
omp plugin link ./plugins/goo
```

The Agent Plugins manifests provide the `goo-authoring` skill and MCP server
without a generated local configuration. Start a new OMP session after linking.

### Codex

Install the Git-backed marketplace and plugin with a current Codex CLI:

```sh
codex plugin marketplace add obselate/goo
codex plugin add goo@obselate-goo
```

Codex requires Git and network access to download the marketplace. It installs
the portable package, finds `goo-authoring`, and starts the MCP server from the
plugin path. Start a new session after installation. The host runs the pinned
Goo.DevTools package through `dotnet tool exec`. No Python environment or manual
MCP configuration is needed.

## Use

Launch an app:

```sh
goo dev --project App.gsproj
```

Then:

1. Call `goo_context` to check the plugin and CLI.
2. Call `goo_list` to list processes and windows.
3. Use `goo_snapshot` or `goo_capture` to inspect the app.
4. Launch with `goo dev --input --project App.gsproj` when input
   automation is needed.

Runtime tools accept `project`, `pid`, `pipe`, `app`, `window`, `latest` and `wait` in seconds.
One match selects automatically. More than one match fails with the candidate list unless `latest` is true.
The plugin uses the selected runtime's capabilities. Do not retry a timed-out mutation.

See the [Goo authoring skill](skills/goo-authoring/SKILL.md) for query, input,
inspection, style, and watch details.

## Source checkout

To test a source checkout, build its CLI and set `GOO_CLI` in the server environment:

```sh
dotnet build tools/Goo.DevTools.Cli/Goo.DevTools.Cli.gsproj -c Release
export GOO_CLI=/absolute/path/to/goo/tools/Goo.DevTools.Cli/bin/Release/net10.0/Goo.DevTools.Cli.dll
```

Set `GOO_DEVTOOLS_DIR` in both the app and server environments only when testing
a custom descriptor directory. Pass a project path to runtime tools for
project-local discovery.

Pass `repository` to documentation and starter tools or set `GOO_SOURCE_ROOT` for a checkout. `goo_context` reports source hashes and revision. `goo_starter` returns files and build, lint and run commands. Run lint when available. When `lint` is `unavailable`, state that lint is skipped. Starter projects include a source Watch item and an SDK pin. Start them with `goo dev`.

## Refresh and verify

Refresh the bundle from the checkout root with `dotnet run --project tools/Goo.Repo -- docs`.
Build and verify from the repository root:

```sh
dotnet build tools/Goo.DevTools.Cli/Goo.DevTools.Cli.gsproj -c Release --nologo -m:4 -warnaserror
.github/scripts/with-headless-wayland.sh \
  dotnet tools/Goo.DevTools.Cli/bin/Release/net10.0/Goo.DevTools.Cli.dll \
  mcp --plugin-root plugins/goo --verify
```

For a local MCP host, use `dotnet` with the built CLI DLL followed by
`mcp --plugin-root /absolute/path/to/plugins/goo`. The portable manifest uses
the released package. Ship plugin changes with the Goo.DevTools release that
contains the matching server.

For OMP, run `omp plugin doctor goo-agent-plugin`. Reinstall or refresh the
plugin through the host plugin manager after changing its source, then start a
new session. Skill-only changes can be loaded in OMP with `/reload-plugins`.
