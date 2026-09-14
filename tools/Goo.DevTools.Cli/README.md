# Goo DevTools CLI

`Goo.DevTools` installs the `goo` command for starting Goo applications with diagnostics, finding local endpoints, attaching to a target, requesting captures, and checking the local setup.

## Install

```sh
dotnet tool install --global Goo.DevTools
```

## Use

```sh
goo dev --inspector --watch -- dotnet run --project App.gsproj
goo attach --latest
goo capture --latest --output frame.png
goo doctor
```

The graphical inspector is a separate tool. Install `Goo.DevTools.App` to get `goo-devtools` and use `goo dev --inspector`.

See the [Goo DevTools guide](../../docs/devtools/README.md) and [development guide](../../docs/devtools/development.md).

`goo input <event> --pid PID --window NAME` exercises separately opted-in windows. Enable `GOO_DEVTOOLS_INPUT=1` together with `GOO_DEVTOOLS=1` in the target app. See the [input protocol](../../docs/devtools/protocol.md#application-input) for coordinates, node IDs, modifiers, capture cancellation, acknowledgement, and error handling.
