# Goo agent plugin

G# Goo authoring guidance and MCP tools for desktop and Android apps. Requires .NET 10, the [platform requirements](../../docs/platform-preflight.md#platforms), and Goo.DevTools 0.30.0.

## Install

Install the runtime CLI:

```sh
dotnet tool install --global Goo.DevTools
goo list --json
```

### OMP

Link the package from the Goo checkout:

```sh
omp plugin link ./plugins/goo
```

Start a new session after linking.

### Codex

```sh
codex plugin marketplace add obselate/goo
codex plugin add goo@obselate-goo
```

Requires Git and network access. Start a new session after installation.

### Claude Code

```sh
claude plugin marketplace add obselate/goo
claude plugin install goo@obselate-goo
```

Requires Git and network access. Start a new session after installation. Claude Code uses the same `skills/` directory and starts the MCP server through `.mcp.json`.

## Use

```sh
goo dev --project App.gsproj
```

Follow the [Goo authoring skill](skills/goo-authoring/SKILL.md).
For source builds and bundle checks, see [contributor instructions](../../CONTRIBUTING.md#devtools-and-plugin).

## Troubleshoot

For OMP, run `omp plugin doctor goo-agent-plugin`. Refresh or reinstall the plugin through the host plugin manager, then start a new session. OMP can reload skill-only changes with `/reload-plugins`.
