# Edit and inspect

Use the [version baseline](README.md#version-baseline) and the
[second-Cell exercise](getting-started.md). Replace `Learn.gsproj` below with
your generated project filename.

## Choose the development loop

Declare [watched inputs](../plugins/goo/skills/goo-authoring/references/watch.md#watched-inputs)
in the project file.

Start with diagnostics enabled:

```sh
GOO_DEVTOOLS=1 dotnet watch --project Learn.gsproj
```

These commands use POSIX shell syntax.

## Try a method edit

1. Click three times, then change `Count: $count` to `Total: $count`.
2. Wait for `applied 1 method update(s)`. The window still shows `Count: 3`.
3. Click once. It shows `Total: 4` and `4 clicks` in the same process.

Method edits apply in the same process. The window shows them on the next event,
such as a click. A fix is in progress.

### Edit limits

- Structural changes require restart and report `GSHR1001`. Press `Ctrl+R`
  to restart. Existing objects do not rerun field initializers, constructors or
  startup code.
- For lambda metadata changes, debugger limits and older results, see the
  [watch reference](../plugins/goo/skills/goo-authoring/references/watch.md).

## Use restart-on-edit when needed

Stop watch before changing modes. Clean its output, then disable hot reload:

```sh
dotnet clean Learn.gsproj
GOO_DEVTOOLS=1 dotnet watch --no-hot-reload --project Learn.gsproj
```

Each source edit rebuilds and restarts the app, resetting its fields.

## Attach DevTools

Follow [Inspect an app that is already running](devtools/README.md#inspect-an-app-that-is-already-running)
to attach the inspector. For a full-tree snapshot, use the current process and window:

```sh
goo attach --pid PID --window ID --once --json --payload '{"full":true}'
```

Run `goo list --json` again after each restart.
