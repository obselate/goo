# Live G# hot reload

This test opens two native Goo windows with a nested typed Cell and a direct
Cell wrapper. It seeds a counter, editor text and selection, edits the nested
Build method twice, and checks that both windows update while preserving the
process ID, native window handles, Cell instances and editor state. A structural
edit must report GSHR1001 without restarting. Run with and without diagnostics.

Build the modified G# runtime:

```sh
dotnet build /path/to/gsharp/src/Sdk/Gsharp.HotReload.Runtime/Gsharp.HotReload.Runtime.csproj -c Release
```

From the Goo checkout, build and pack the modified framework with a unique local
package version and the pinned platform payloads described in CONTRIBUTING.md:

```sh
dotnet pack Goo/Goo.gsproj -c Release -o artifacts/hot-reload \
  -p:PackageVersion=0.5.0-hotreload-local.20260906 \
  -p:GooLinuxSdlPath=/path/to/linux/libSDL3.so \
  -p:GooWindowsSdlPath=/path/to/windows/SDL3.dll \
  -p:GooMacOsArm64NativeRoot=/path/to/osx-arm64/native
python3 tests/Goo.HotReloadSmoke/verify.py \
  --runtime /path/to/gsharp/out/bin/Release/Gsharp.HotReload.Runtime/Gsharp.HotReload.Runtime.dll \
  --packages artifacts/hot-reload --goo-version 0.5.0-hotreload-local.20260906
```

Repeat the final command with `--diagnostics` to capture both windows as PNGs.
The runner copies the fixture into a temporary directory and retains its logs,
state snapshots and result.json. It does not edit the original fixture or
replace the installed SDK. Use a new package version after repacking changed
code to avoid NuGet cache reuse.

The generated consumer uses SDK 0.4.591 with
`GsharpHotReloadRuntimeAssemblyFullPath` pointing at the rebuilt runtime. This
overrides the runtime payload only, keeping compiler and MSBuild inputs stable.
The released SDK 0.4.1 does not contain the new callback dispatch, and the
released Goo 0.5.0 does not contain the new all-window rebuild path.

Verified on Linux x64, .NET SDK 10.0.302: two edits in each mode preserved both
native windows and all asserted state. This does not qualify structural edits,
re-execution of static initializers, debugger sequence-point remapping, or other
platforms.
