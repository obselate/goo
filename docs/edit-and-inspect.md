# Edit and inspect

For Gsharp.NET.Sdk 0.4.1150 and Goo/Goo.DevTools/Goo.DevTools.App 0.7.35.
Use the [second-Cell exercise](getting-started.md). Replace `Learn.gsproj` below
with your generated project filename.

## Choose the development loop

Use `dotnet run` for a normal launch. Watch is optional and has no established
performance parity with normal execution.

For watch, add this item inside the existing project file:

```xml
<ItemGroup>
  <Watch Include="**/*.gs" Exclude="bin/**;obj/**" />
</ItemGroup>
```

Start with diagnostics enabled:

```sh
GOO_DEVTOOLS=1 dotnet watch --project Learn.gsproj -- run
```

These commands use POSIX shell syntax.

## Try a method edit, then restart

1. Click three times, then change `Count: $count` to `Total: $count`.
2. Wait for the method update, then inspect the label. On these packages, the
   rendered label stayed unchanged until the next input-triggered rebuild.
   Another click showed `Total: 4` with the existing child state.
3. Press `Ctrl+R` in the watch terminal to rebuild and restart. The window
   reopens with `Total: 0`.

### Edit limits

- Method-body edits can apply without recreating the process, but an applied
  delta does not guarantee an immediate UI refresh.
- Structural changes require restart. Adding a function reported `GSHR1001`.
  Existing objects do not rerun field initializers, constructors or startup code.
- For lambda metadata changes, debugger limits and older results, see the
  [watch reference](../plugins/goo/skills/goo-authoring/references/watch.md).

## Use restart-on-edit when needed

Stop watch before changing modes. Clean its output, then disable hot reload:

```sh
dotnet clean Learn.gsproj
GOO_DEVTOOLS=1 dotnet watch --no-hot-reload --project Learn.gsproj -- run
```

Each source edit rebuilds and restarts the app, resetting its fields.

## Attach DevTools

Install both tools using the [DevTools guide](devtools/README.md#install).
Keep the diagnostics-enabled app running, then open another terminal:

```sh
goo list --json
goo attach --latest --inspector
```

The inspector shows the running tree and resolved properties. Reconnect after
a restart. For explicit process/window selection, captures and IDE integration,
use the [DevTools guide](devtools/README.md).
