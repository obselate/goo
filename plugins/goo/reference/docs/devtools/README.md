# Goo DevTools

```sh
dotnet tool install --global Goo.DevTools --version 0.27.7
goo dev --project MyApp.gsproj --input --inspector
```

One package provides the `goo` CLI and graphical inspector. `goo dev` enables diagnostics and hot reload. Add `--no-watch` only when the app must not watch source files.

## Inspect an app

```sh
goo list
goo snapshot --project MyApp.gsproj
goo capture --project MyApp.gsproj --output frame.png
goo input click --project MyApp.gsproj --node-id 12
goo inspector --project MyApp.gsproj
```

Use a node ID from the selected window's snapshot. Input requires `goo dev --input` or both `GOO_DEVTOOLS=1` and `GOO_DEVTOOLS_INPUT=1` in the app environment.

All targeting commands accept `--project`, `--pid`, `--pipe`, `--app`, `--window`, `--latest` and `--wait SECONDS`. One match is selected automatically. Several matches fail with a list. Select a window or use `--latest`.

```sh
goo snapshot --pid 12345 --window main --json
goo snapshot --pid 12345 --compact
goo capture --pid 12345 --output frame.png --json
```

`--json` writes success and errors to stdout. Capture requires a file path with `--json`. Without it, capture writes image bytes to stdout when `--output` is omitted or `-`.

Exit codes: `0` success, `1` operation failure, `2` invalid arguments and `130` cancellation. Text errors go to stderr. JSON errors include `code`, `phase` and `mayHaveApplied`. If an input result says it may have applied, inspect the app before another action.

## Get help

```sh
goo --help
goo help input
goo input --help
goo doctor --project MyApp.gsproj
```

`goo doctor` prints fix commands for missing prerequisites. See the generated [CLI reference](cli.md) for every option.

## Run with environment values

```sh
goo dev --project MyApp.gsproj --env MODE=local --env LOG_LEVEL=debug
```

Use `--configuration Release` for project launches. An explicit child command controls its own configuration:

```sh
goo dev -- dotnet run --project MyApp.gsproj --configuration Release
```

## Raw protocol

```sh
goo attach --pid 12345 --once --command capabilities --payload '{}' --json
```

`attach` is the advanced raw protocol interface. Use `snapshot`, `capture` and `input` for common operations. See the [protocol](protocol.md) and [contributor guide](development.md).
