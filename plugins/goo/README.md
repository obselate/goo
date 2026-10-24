# Goo agent plugin

Standalone G# Goo authoring guidance and twelve stdio MCP tools. Goo applications and the plugin require the .NET 10 SDK, the platform requirements in the main Goo README, and Goo.DevTools 0.15.0. The server uses the official ModelContextProtocol .NET SDK inside Goo.DevTools. Python and uv are not required.

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

Install the runtime CLI with `dotnet tool install --global Goo.DevTools --version 0.15.0`.
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
after installation. The host runs the pinned Goo.DevTools package through
`dotnet tool exec`. No Python environment or manual MCP configuration is needed.

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
dotnet build tools/Goo.DevTools.Cli/Goo.DevTools.Cli.gsproj -c Release
export GOO_CLI=/absolute/path/to/goo/tools/Goo.DevTools.Cli/bin/Release/net10.0/Goo.DevTools.Cli.dll
```

Set `GOO_DEVTOOLS_DIR` in both the app and server environments only when testing
a custom descriptor directory. Pass a project path to runtime tools for
project-local discovery.

Pass `repository` to documentation/starter tools or set `GOO_SOURCE_ROOT` to use a current checkout. `goo_context` reports bundle file hashes or checkout revision and dirty state, plus the compiler pin. Search ignores conversational stop words, splits symbol names, and reports exact or relaxed term coverage plus document hashes. An empty result applies only to the selected documents. `goo_starter` reports its SDK, Goo package, compiler pin, source hashes, generated hashes, and available lint/build commands. Checkout-backed builds select the pinned compiler. Its generated project includes a source Watch item but launches with `--no-watch`.

## Refresh and verify

Refresh the bundle from a Goo checkout with `dotnet run --project tools/Goo.SyncDocs/Goo.SyncDocs.gsproj -c Release -- /path/to/goo-checkout`.
Build and verify from the repository root:

```sh
dotnet build tools/Goo.DevTools.Cli/Goo.DevTools.Cli.gsproj -c Release --nologo -m:4 -warnaserror
XDG_CACHE_HOME="$(mktemp -d)" .github/scripts/with-headless-wayland.sh \
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
