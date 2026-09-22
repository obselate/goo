# Goo agent plugin

Standalone G# Goo authoring guidance and twelve stdio MCP tools. The plugin requires [uv](https://docs.astral.sh/uv/), which manages its required Python runtime and locked environment. Goo applications require the .NET 10 SDK, the platform requirements in the main Goo README, and Goo.DevTools 0.6.5. The server uses the official MCP Python SDK.

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

Install the runtime CLI with `dotnet tool install --global Goo.DevTools --version 0.6.5`.
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

Git and network access are required while Codex downloads the marketplace.
Codex installs the portable package, discovers its `goo-authoring` skill, and
starts its MCP server from the installed plugin path. Start a new Codex session
after installation. No manual MCP configuration, checkout mutation, directory
change, or absolute path is required.

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

Pass `repository` to documentation/starter tools or set `GOO_SOURCE_ROOT` to use a current checkout. `goo_context` reports whether the source is a bundle or checkout, its revision, dirty state, and compiler pin. Search ignores conversational stop words, splits symbol names, and reports exact or relaxed term coverage plus document hashes. An empty result applies only to the selected documents. `goo_starter` reports its SDK, Goo package, compiler pin, source hashes, generated hashes, and available lint/build commands. Checkout-backed builds select the pinned compiler. Its generated project includes a source Watch item but launches with `--no-watch`.

## Refresh and verify

Refresh the bundle with `python3 scripts/sync_docs.py /path/to/goo-checkout`.
Validate the MCP workflow with:

```sh
GOO_CLI=/absolute/path/to/Goo.DevTools.Cli.dll uv run --locked python scripts/verify.py
```

For OMP, run `omp plugin doctor goo-agent-plugin`. Reinstall or refresh the
plugin through the host plugin manager after changing its source, then start a
new session. Skill-only changes can be loaded in OMP with `/reload-plugins`.
