# Developing Goo DevTools

For installation and everyday use, see the [DevTools guide](README.md).
This page covers source builds and the inspector's implementation.

## Source builds

Follow the repository's [source setup](../../CONTRIBUTING.md#source-setup).
Run commands below from the repository root.

The CLI can run directly from source:

```sh
dotnet run --project tools/Goo.DevTools.Cli/Goo.DevTools.Cli.csproj -- doctor
```

To create its local tool package:

```sh
dotnet pack tools/Goo.DevTools.Cli/Goo.DevTools.Cli.csproj -c Release -o artifacts/devtools
```

The graphical inspector is a Goo application. Supply the same native runtime
paths described in the [Gallery source instructions](../../README.md#build-and-run-goo-gallery),
using `apps/Goo.DevTools/Goo.DevTools.gsproj` as the project instead.
For example, after extracting the released native assets on Linux:

```sh
dotnet run --project apps/Goo.DevTools/Goo.DevTools.gsproj -c Release -p:GooLinuxSdlPath="$PWD/artifacts/gallery-native/runtimes/linux-x64/native/libSDL3.so"
```

For fixture data without a running target, append `-- --sample` to the source
launch command, run `goo-devtools --sample`, or set `GOO_DEVTOOLS_SAMPLE=1`.
Without this option, an inspector with no live endpoint shows a disconnected
target.

The inspector references Goo through a project reference. Its tool package
includes the resolved managed and platform runtime assets. The CLI has no Goo
runtime dependency. Package versions are managed by the repository release
version configuration.

## Discovery and connection

Each diagnostics-enabled window publishes a JSON endpoint descriptor. Discovery
checks `GOO_DEVTOOLS_DIR`, the project's `.goo/devtools` directory, XDG runtime
directories, Windows local application data, and temporary Goo directories.
The descriptor schema and messages are documented in the [local protocol](protocol.md).

The CLI finds the inspector through `GOO_DEVTOOLS_INSPECTOR`, `goo-devtools` on
`PATH`, or repository build output.

`apps/Goo.DevTools/DiagnosticWire.gs` handles endpoint discovery and the pipe
connection. Reads run on a background worker. The inspector sends a
`goo.devtools/1` hello, requests snapshots, and polls snapshots at 100 ms
intervals. Queued messages are applied by the UI. The session accepts full and
delta snapshots, selection and hover updates, logs, events, and capture
responses. Unknown fields and capability names are ignored.

`apps/Goo.DevTools/DiagnosticsProtocol.gs` defines the diagnostic models and
transport interface, including disconnected and sample transports.

UI actions send `inspect.enter`, `inspect.exit`, `select`, `clear`, `override`,
`reset`, and `capture` requests. Log and event requests depend on the capabilities
advertised by the target. Capture polling continues until the target returns
`pending: false`.
