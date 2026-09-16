# Goo DevTools CLI

`Goo.DevTools` installs the `goo` command for starting Goo applications with diagnostics, finding local endpoints, attaching to a target, requesting captures, and checking the local setup.

## Install

```sh
dotnet tool install --global Goo.DevTools
```

## Use

```sh
goo dev --inspector --watch -- dotnet run --project App.gsproj
goo dev --input --no-watch --project App.gsproj
goo attach --latest
goo list --json
goo capture --latest --output frame.png
goo doctor
```

The graphical inspector is a separate tool. Install `Goo.DevTools.App` to get `goo-devtools` and use `goo dev --inspector`.

See the [Goo DevTools guide](../../docs/devtools/README.md) and [development guide](../../docs/devtools/development.md).

`goo dev --input` enables diagnostics and input in the launched app. Add `--no-watch` to run without watching. `goo input <event> --pid PID --window ID` then exercises that window. Prefer `--target HANDLE` from a snapshot for pointer and wheel input. Numeric `--node` IDs are window-local compatibility identifiers. Text and key events route to focus and do not accept either target form. When launching outside the CLI, set `GOO_DEVTOOLS_INPUT=1` together with `GOO_DEVTOOLS=1`. See the [input protocol](../../docs/devtools/protocol.md#application-input) for targeting, coordinates, modifiers, capture cancellation, acknowledgement, and error handling.

`goo list --json` returns live targets without connecting. Filter with `--pid` or add `--project` for project-local descriptors. Pass the returned `window` ID to `--window` to distinguish windows with the same title. One-shot `attach --once` returns a failing exit code for rejected requests and bounds the connection/request with `--wait`.
