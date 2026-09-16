# Developing Goo DevTools

For installation and everyday use, see the [DevTools guide](README.md).
This page covers source builds and the CLI implementation.

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

The CLI has no Goo runtime dependency. Package versions are managed by the
repository release version configuration.

## Discovery and connection

Each diagnostics-enabled window publishes a JSON endpoint descriptor. Discovery
checks `GOO_DEVTOOLS_DIR`, the project's `.goo/devtools` directory, XDG runtime
directories, Windows local application data, and temporary Goo directories.
The descriptor schema and messages are documented in the [local protocol](protocol.md).

`Discovery.cs` finds descriptors and `ProtocolConnection.cs` owns the local pipe
connection. The CLI validates the `goo.devtools/1` handshake before streaming
events or sending requests. Capture polling continues until the target returns
`pending: false`.

## Hot reload integration

Goo handles the standard .NET metadata-update callbacks. `UpdateApplication`
queues rebuilds for all mounted Cells on each open window's UI thread, including
direct Cell wrappers and typed Cells whose inputs have not changed. Existing
Cells and native windows remain mounted. Diagnostics are optional.

This requires a G# runtime that dispatches `MetadataUpdateHandlerAttribute`
callbacks after applying deltas. The released G# SDK 0.4.1 does not dispatch
them. See the [local integration test](../../tests/Goo.HotReloadSmoke/README.md)
for the runtime override, package setup and state-preservation checks.
