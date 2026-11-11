# Live G# hot reload

This fixture checks:

- Two Build edits update two native windows without changing process or Cell identity.
- Counter, editor text and selection stay intact.
- A structural edit reports `GSHR1001` without restarting.

Run with and without diagnostics.

Build the modified G# runtime:

```sh
dotnet build /path/to/gsharp/src/Sdk/Gsharp.HotReload.Runtime/Gsharp.HotReload.Runtime.csproj -c Release
```

From the Goo checkout, build and pack the modified framework with a unique local
package version and the pinned platform payloads described in CONTRIBUTING.md:

```sh
dotnet pack Goo/Goo.gsproj -c Release -o artifacts/hot-reload \
  -p:PackageVersion=0.30.0-hotreload-local.1 \
  -p:GooLinuxSdlPath=/path/to/linux/libSDL3.so \
  -p:GooWindowsSdlPath=/path/to/windows/SDL3.dll \
  -p:GooMacOsArm64NativeRoot=/path/to/osx-arm64/native
.github/scripts/with-headless-wayland.sh \
  dotnet run --project tools/Goo.Investigation -c Release -- hot-reload \
  --runtime /path/to/gsharp/out/bin/Release/Gsharp.HotReload.Runtime/Gsharp.HotReload.Runtime.dll \
  --packages artifacts/hot-reload --goo-version 0.30.0-hotreload-local.1
```

Repeat the final command with `--diagnostics` to capture both windows as PNGs.
The runner copies the fixture into a temporary directory and retains its logs,
state snapshots and result.json. It does not edit the original fixture or
replace the installed SDK. Use a new package version after repacking changed
code to avoid NuGet cache reuse.

The generated consumer uses SDK 0.5.212 with
`GsharpHotReloadRuntimeAssemblyFullPath` pointing at the rebuilt runtime. This
overrides the runtime payload only, keeping compiler and MSBuild inputs stable.

