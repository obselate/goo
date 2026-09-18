# Goo DevTools

Goo DevTools helps you inspect a running application's UI tree, properties,
layout, logs, and events, and save screenshots. Diagnostics are local and enabled
when you launch an app through `goo dev`.

## Install

Install the [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
and meet Goo's [platform requirements](../../README.md#platforms), then install:

```sh
dotnet tool install --global Goo.DevTools --version 0.5.4
dotnet tool install --global Goo.DevTools.App --version 0.5.4
```

`Goo.DevTools` provides the `goo` CLI. `Goo.DevTools.App` provides the
`goo-devtools` graphical inspector. The CLI also works on its own for launching
apps, streaming diagnostic events, and capturing screenshots.

## Run and inspect your app

From your application directory:

```sh
goo dev --inspector
```

This starts the app with diagnostics enabled, watches for code changes, and opens
the inspector when the app is ready. No application code changes are needed.
Use the inspector to browse the UI tree and examine the selected element.

To select a project explicitly:

```sh
goo dev --inspector --project HelloGoo/HelloGoo.gsproj
```

You can also supply a launch command:

```sh
goo dev --inspector -- dotnet run --project HelloGoo/HelloGoo.gsproj
```

Add `--no-watch` to run without watching for changes. Some edits require a process
restart. Follow the restart prompt from `dotnet watch` when an edit cannot be
applied while the app is running.

For a new project, start with the [quick start](../../README.md#quick-start).

To allow an agent to inspect and interact with the app, launch with `--input`:

```sh
goo dev --input --no-watch --project HelloGoo/HelloGoo.gsproj
```

This enables both diagnostics and input in the launched app. No environment
variables or application code changes are needed. The `--input` option requires
a CLI build from this checkout until its next release.

## Inspect an app that is already running

List live endpoints without connecting:

```sh
goo list --json
goo list --pid 12345 --project HelloGoo/HelloGoo.gsproj --json
```

The returned `window` field is a stable window ID. Pass it to `--window` to
select a window even when several windows share a title. `--window` also accepts
an unambiguous title substring. Use the same `--project` on subsequent commands
when the descriptors are stored in the application's `.goo/devtools` directory.
The `list` command requires a CLI build from this checkout until its next release.

If the app was launched with diagnostics enabled, open the inspector separately:

```sh
goo-devtools
```

It connects to the newest live target. To select a process explicitly:

```sh
goo attach --pid 12345 --inspector
```

If that process has several windows, add `--latest` to select its newest window.
For terminal output or scripts, use:

```sh
goo attach --latest
goo attach --pid 12345 --latest --json
```

When launching from an IDE or another command, set `GOO_DEVTOOLS=1` in the app's
launch environment to enable diagnostics.

## Save a screenshot

```sh
goo capture --latest --output frame.png
```

Use `--pid 12345` to target a particular process instead. Add `--latest` if it has
several windows.

## Troubleshooting

Run `goo doctor` to check the SDK, project, and inspector installation.

- **No target appears:** start the app with `goo dev`, or set `GOO_DEVTOOLS=1`
  before launching it. Keep the app running while you inspect or capture it.
- **Inspector not found:** install `Goo.DevTools.App` and ensure `goo-devtools`
  is on `PATH`. For a custom installation, set `GOO_DEVTOOLS_INSPECTOR` to its
  executable or DLL.
- **Several windows match:** select one with `--window` or use `--latest`.
- **Tools cannot find an app launched elsewhere:** set `GOO_DEVTOOLS_DIR` to the
  same directory in both the app and tool launch environments.

## IDE integration

See the setup guides for [VS Code](../../integrations/vscode/README.md) and
[Rider](../../integrations/rider/README.md).

For work on DevTools itself, see [development](development.md) and the
[local protocol](protocol.md).

For AI agents, the [Goo plugin](../../plugins/goo/README.md) exposes documentation,
starter generation, live target discovery, full snapshots, screenshots, and
separately opted-in application input as MCP tools.
