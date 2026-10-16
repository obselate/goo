# Edit and inspect

Measured 2026-10-16 on Linux x64, .NET SDK 10.0.401,
Gsharp.NET.Sdk 0.4.1150 and Goo/Goo.Svg/Goo.DevTools/Goo.DevTools.App 0.7.35.
Use the [second-Cell exercise](getting-started.md). Commands below call its
project `Learn.gsproj`. Substitute your generated project filename.

## Choose the development loop

Use `dotnet run` for a normal launch. Watching is optional. No run-versus-watch
CPU, memory or latency comparison was made, so this guide makes no performance
parity claim.

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

The environment-variable syntax here is for a POSIX shell. Put forwarded MSBuild
switches after `-- run`, not in the watch options. Otherwise watch interprets
`-p` as its project option.

## Try a method edit, then restart

1. Click the button three times. Both labels should show `3`.
2. Change the parent's label from `Count: $count` to `Total: $count`. Keep its
   fields, methods and signatures unchanged.
3. Wait for the G# hot-reload result, not just the .NET watch message.
4. Inspect or capture the window. G# reported `applied 1 method update(s)` for
   `Counter.Build`, but the displayed label and DevTools snapshot still said
   `Count: 3`. The PID stayed unchanged. An applied delta is **not proof of an
   automatically refreshed UI** on this package set.
5. Click once more. The measured run now showed `Total: 4` and `4 clicks`, in
   the same process with the same mounted node IDs. The edited body took effect
   on that input-triggered rebuild. Child state survived.
6. Press `Ctrl+R` in the watch terminal. This rebuilds and restarts the app.
   The label must now say `Total: 0`. The process changes and local state resets.

### Edit limits

| Edit | Current contract and observation |
| --- | --- |
| Method body, such as the label above | A delta applied in the same process. Automatic UI refresh did not occur in this run. Restart for a reliable visible result |
| Added function | Reported `GSHR1001`, requiring a restart. This is not a hot-reloadable edit |
| Added/removed types or members, changed signatures or new metadata references | Structural changes require restart. Lambdas can change generated metadata, so check the actual result |
| Field initializer, constructor, startup code or window creation options | Existing objects are not recreated by a method update. Restart to apply new initial state or startup options |
| Debugger sequence points or local-variable layout | G# does not emit Portable PDB deltas. Restart for accurate stepping after these edits |

The broader compiler limits and separately labeled older/local-patch evidence
are in the [watch reference](../plugins/goo/skills/goo-authoring/references/watch.md).
Do not extend one package/platform result to another configuration.

## Use restart-on-edit when needed

Stop watch before changing modes. Clean its output, then disable hot reload:

```sh
dotnet clean Learn.gsproj
GOO_DEVTOOLS=1 dotnet watch --no-hot-reload --project Learn.gsproj -- run
```

Every source edit now rebuilds and restarts the process. In the measured run,
`Count: 3` became `Total: 0` in a new PID and window. This is a visible edit loop
with reset fields, not retained application state or a hot-reload fix.

The state checks used an isolated KWin virtual Wayland session to keep native
focus deterministic. On the shared desktop, loss of native focus prevented
injected clicks from invoking the button. A successful input acknowledgement
alone did not establish that a callback ran.

## Attach DevTools

Install both tools as described in the [DevTools guide](devtools/README.md#install).
While the app is running, open a second terminal:

```sh
goo list --json
```

Copy that app's `pid` and stable `window` from the response. Use those actual
values, not values from another app or an earlier process:

```sh
goo attach --pid 3702326 --window window-3702326-1 --inspector
```

The numbers above identify the measured run only. The CLI completed its
handshake and launched the 0.7.35 inspector. The inspector can browse the target's
UI tree and resolved properties without adding application code. Diagnostics
must be enabled at launch. Attaching cannot enable a non-diagnostic process.

For a bounded full-tree check or a presented PNG, use your current target:

```sh
goo attach --pid 3702326 --window window-3702326-1 --once --json --payload '{"full":true}'
goo capture --pid 3702326 --window window-3702326-1 --output before.png
```

Both commands succeeded in the measured run. The snapshot contained the parent
`Counter`, child `CounterActions`, button and text. The PNG showed the SVG plus
and the two labels. Re-discover the target after every restart. Stop diagnostics
when no longer needed. For selection, IDE setup and discovery troubleshooting,
use the existing [DevTools guide](devtools/README.md).
