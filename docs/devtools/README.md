# Goo DevTools

Inspect a running app's UI tree, properties, layout, logs and events, and save
screenshots. `goo dev` enables local diagnostics.

## Install

Install the [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
and meet Goo's [platform requirements](../../README.md#platforms), then install:

```sh
dotnet tool install --global Goo.DevTools --version 0.22.2
dotnet tool install --global Goo.DevTools.App --version 0.22.2
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

Or supply a launch command:

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
variables or application code changes are needed.

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

## Record and exchange profiler traces

Open **Profiler**, press **Record**, exercise the target, then press **Stop**.
The target must advertise `profiler.trace.v1`. Missing measurements stay
unavailable. GPU stage values are elapsed times, not CPU-aligned execution slices.

- Frame bars turn red for process-wide GC pauses of at least 2 ms.
- Phase details keep elapsed time and GC-exclusive elapsed time separate.
  Nested scopes overlap. GC pause time is process-wide, not thread CPU time.
- Phase summaries show p50, p99 and max for each row's last 240 scopes.
  Percentiles use complete scopes in the selected range. Totals and max use the
  selected portion of boundary scopes. CapWait measures native event wait while
  a capped window waits for its next frame. Idle waits are excluded.
- Enable **Types (10 s)** before recording to capture allocation types.
  The **Types** tab reports runtime allocation samples and sampled bytes, not
  exact object counts. Capture retains at most 500 types and stops on timeout
  or recording stop. The protocol accepts `allocationSeconds` from 2 to 60.

NativeAOT supports type samples when the app enables EventSource:

```xml
<EventSourceSupport>true</EventSourceSupport>
```

Set this property in the app project. Goo does not enable it for all apps.
If it is off, capture reports `unavailable: EventSourceSupport is off`.

**Export** saves the whole stopped trace, not only the selected range. Enter a
JSON file path or use **Browse**, then press **Export** in the file row. The file
is UTF-8 Chrome trace JSON and opens in `chrome://tracing` or
[Perfetto](https://ui.perfetto.dev). A successful save replaces the destination
atomically. A failed save leaves the previous file intact.

**Import** uses the same path row and works without a running target. Goo exports
retain exact integer timestamps, nullable measurements, completion and gap state,
correlation IDs, resource details, and sampling metadata. Reimport restores these
details rather than reconstructing them from rounded Chrome timestamps.

Other Chrome files support process/thread names (`M`), complete durations (`X`),
paired thread-local begin/end events (`B`/`E`), instants (`i`/`I`), numeric counter
series (`C`), and flows (`s`/`t`/`f`). Fractional and negative counters are kept.
Unknown events remain generic and are reported. Imported events do not become
native Goo frame phases. Crossing duration slices are separated into named
tracks on export so they do not imply invalid nesting.

Imports require a nonempty regular file and are bounded to 256 MiB, 524,288 events,
JSON depth 32, 4,096-character labels, and 32,768-character Chrome events. Paired
begin/end arguments may total 65,536 characters. The retained trace uses the
existing 128 MiB budget.
Timestamps and durations must be finite and fit the bounded integer timeline.
Unmatched begin/end events and invalid input are rejected without replacing the
current trace. Traces contain measurement metadata, not image or font contents.

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
