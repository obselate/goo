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

Typed clients can add `--require-capabilities NAME[,NAME]` and `--require-override-property NAME` to `attach --once`. The CLI validates the selected runtime hello on that connection and sends no request when a requirement is missing or malformed. Requiring an override property also requires `runtime-overrides.describe`.

`goo --version --json` reports the CLI version and agent feature contract. Unknown options and values on presence-only flags fail before launch. Arguments after `--` are passed to the child unchanged. JSON errors include `code`, `phase`, `mayHaveApplied`, CLI version, and available runtime handshake state. Do not retry an input or another state-changing request when its acknowledgement is missing and `mayHaveApplied` is true.

On SIGINT or SIGTERM, `goo dev` stops only the child process tree that it started and bounds cleanup. It does not stop unrelated Goo applications.
