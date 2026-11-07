# Edit and inspect

From the [starter app](getting-started.md) directory:

```sh
goo dev
```

This is the development loop. It enables diagnostics and hot reload.
The template includes watched G# inputs and pins .NET SDK 10.
Keep it running while you edit. Use a second terminal for inspection:

```sh
goo snapshot
goo capture --output capture.png
goo inspector
```

One running app is selected automatically. The inspector is included in
`Goo.DevTools`. No second tool install is needed.

## Try a method edit

1. Click three times, then change `Count: $count` to `Total: $count` in `Program.gs`.
2. Wait for `G# hot reload: applied ... method update(s)`.
3. Click once. The label shows `Total: 4` in the same process.

Method edits apply in the same process. The window uses them on the next event,
such as a click.
The `dotnet watch: No managed code changes to apply` line is expected. The G# hot reload line is authoritative.

Structural changes require a restart and report `GSHR1001`. Press `Ctrl+R`
to restart. Existing objects do not rerun field initializers, constructors or
startup code. See the [watch reference](../plugins/goo/skills/goo-authoring/references/watch.md)
for edit limits.

## Select an app explicitly

```sh
goo list
goo snapshot --project HelloGoo.gsproj
goo inspector --pid PID --window ID
```

When several apps match, choose a project, process or window. Use `--latest`
to select the newest match. Run `goo help snapshot` for all selection options.
