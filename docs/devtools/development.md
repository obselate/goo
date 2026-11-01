# Develop Goo DevTools

```sh
dotnet run --project tools/Goo.Repo -- check devtools
dotnet run --project tools/Goo.DevTools.Cli -c Release -- dev --project MyApp.gsproj --input --inspector
```

The CLI build includes the inspector. `Goo.DevTools` is the only tool package.

## Run the inspector from source

```sh
dotnet run --project apps/Goo.DevTools -c Release -- --project MyApp.gsproj
```

The source app accepts the same target selection flags as `goo inspector`. `--help` and `--version` exit before creating a window. Unknown arguments fail before UI startup.

For fixture data, set `GOO_DEVTOOLS_SAMPLE=1` in the inspector process environment. No target is needed in sample mode.

## Verify changes

```sh
dotnet run --project tools/Goo.Repo -- check devtools
dotnet run --project tools/Goo.Repo -- check lint
```

Run GUI checks in a private headless compositor. See [contributing](../../CONTRIBUTING.md). Do not run input tests on the user's desktop.

## Source map

| Path | Responsibility |
| --- | --- |
| `tools/Goo.DevTools.Cli/CommandLine.gs` | Command options, parser, help and generated reference |
| `tools/Goo.DevTools.Cli/Discovery.gs` | Endpoint discovery and target selection, shared with the inspector |
| `tools/Goo.DevTools.Cli/CliApplication.gs` | Launch, snapshot, capture, input and protocol commands |
| `apps/Goo.DevTools/Program.gs` | Inspector argument validation and startup |
| `apps/Goo.DevTools/DiagnosticWire.gs` | Inspector protocol transport |

`GOO_DEVTOOLS_DIR` selects a runtime descriptor directory. `GOO_DEVTOOLS_INSPECTOR` can select a custom inspector executable or DLL. The CLI uses its bundled inspector by default.
