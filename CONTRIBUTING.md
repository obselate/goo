# Contributing

```sh
git clone https://github.com/obselate/goo.git
cd goo
dotnet run --project tools/Goo.Repo -- doctor
dotnet run --project tools/Goo.Repo -- build
dotnet run --project tools/Goo.Repo -- check --list
dotnet run --project tools/Goo.Repo -- check core
```

## Source setup

Install Git and the .NET 10 SDK selected by `global.json`. The G# SDK restores its compiler and formatter from NuGet. No bootstrap or global tool is needed. Package consumers and templates have their own SDK pins.

`doctor` checks prerequisites without changing the machine and prints fix commands. `build` uses checked-in SPIR-V and native text payloads. Gallery and custom shaders need the pinned [shader tools](docs/platform-preflight.md#custom-shaders).

On Linux, `check core` builds pinned SDL if needed and runs private Wayland with software Vulkan and the validation layer. It does not use your desktop. Set `GOO_WAYLAND_COMPOSITOR=kwin` for local KWin checks. Software Vulkan is not hardware performance evidence. Run native checks on their target OS.

Isolate outputs for parallel builds. Set `GOO_BUILD_LOCK` to serialize shared outputs. Goo.Repo owns `flock --close` for that lock. Do not wrap it in the same lock. Run GUI checks through `.github/scripts/with-headless-wayland.sh`, never on the user's desktop.

For application publishing, NativeAOT prerequisites and supported trimmed JIT output, see [Shipping](docs/shipping.md).

## Checks

```sh
dotnet run --project tools/Goo.Repo -- check gestures
dotnet run --project tools/Goo.Repo -- check lint
dotnet run --project tools/Goo.Repo -- docs --check
```

| Command | Work |
| --- | --- |
| `doctor` | Read-only prerequisite checks and fix commands |
| `build` | Release framework build |
| `check --list` | Named CI lanes |
| `check <lane>` | Focused CI command and environment |
| `docs` | Generate desktop API pages and plugin reference |
| `docs --check` | Compare generated desktop docs without changing tracked files |
| `docs --android` | Generate Android API pages |
| `docs --android --check` | Compare generated Android docs |
| `pack` | Build or fetch pinned Linux and Windows SDL inputs, then pack Goo |

| Lane | Checks |
| --- | --- |
| `api` | Full public API and XML contracts, including Android |
| `core` | Core behavior, SVG, input, layout and native windows |
| `image` | PNG decoder and image cache |
| `devtools` | CLI build and command tests |
| `gestures` | Shared gesture recognizers |
| `spell-check` | Hunspell with `GOO_REQUIRE_HUNSPELL=1` |
| `lint` | SDK formatter check, linter self-tests and strict source lint |
| `metadata` | Onboarding and release metadata |
| `docs` | Desktop generated-doc comparison |
| `docs-android` | Android generated-doc comparison |

Run only checks affected by the change. Each command accepts `--help`. API and Android docs checks need the Android workload, SDK and Java 21. Docs commands never install workloads. Hunspell checks need `libhunspell-1.7-0` on Ubuntu. The [CI workflow](.github/workflows/ci.yml) owns the full native, package, rendering, Android and NativeAOT matrix.

| Change | Local check |
| --- | --- |
| Public or CLI docs | `dotnet run --project tools/Goo.Repo -- check docs` |
| Android docs | `dotnet run --project tools/Goo.Repo -- check docs-android` |
| Changelog or metadata | `dotnet run --project tools/Goo.Repo -- check metadata` |
| Public API or XML | `dotnet test tests/Goo.ApiContractTests/Goo.ApiContractTests.gsproj -c Release -p:TreatWarningsAsErrors=true`, then `check docs` |
| G# source | `dotnet run --project tools/Goo.Repo -- check lint`, then build each touched project |
| Release preparation | Follow [Releasing Goo](.github/RELEASING.md) |

Limit formatting to changed files. Do not bulk-format core source. GL0005 is a manual review advisory. See [code conventions](CONVENTIONS.md). For advisory consumer measurements, use `Goo.Investigation performance --help`.

### Windows qualification

On a signed-in Windows 11 desktop with a current Vulkan driver, run the published bundle's `run-windows-qualification.ps1`. Do not use SSH, a service or a disconnected session. It opens real windows.

- Run one frame benchmark and seven behavior lanes: primitive, window, multi-window, native-backdrop, native-popup, native-popup-menu and clipboard.
- Return the complete `results-YYYYMMDD-HHMMSS` directory. It contains system and adapter data, executable hash, lane exits, Vulkan facts, diagnostic counters, frame timings and allocation measurements.
- These are qualification requirements, not Goo's minimum Windows version.

### Android qualification

Use the Android jobs and scripts in the [CI workflow](.github/workflows/ci.yml) for native host, document, menu and accessibility checks. Run them on the required emulator or Vulkan device. Record device model, API level, ABI, package revision, command and result. Package/ABI checks alone do not prove device behavior.

Build pinned Android text payloads with NDK `27.2.12479018`, Meson, Ninja,
Python 3 and archive tools:

```sh
bash .github/scripts/build-text-native-android.sh android-arm64 Goo/Runtime/Vulkan/android-arm64 "$ANDROID_NDK_HOME"
bash .github/scripts/build-text-native-android.sh android-x64 Goo/Runtime/Vulkan/android-x64 "$ANDROID_NDK_HOME"
dotnet build tests/Goo.AndroidSmoke/Goo.AndroidSmoke.gsproj -c Release -p:AndroidSdkDirectory="$ANDROID_HOME" -p:JavaSdkDirectory="$JAVA_HOME"
dotnet run --project tools/Goo.RepositoryChecks -c Release -- android tests/Goo.AndroidSmoke/bin/Release/net10.0-android/org.goo.androidsmoke-Signed.apk
dotnet run --project tools/Goo.RepositoryChecks -c Release -- android tests/Goo.AndroidSmoke/bin/Release/net10.0-android/org.goo.androidsmoke.aab
"$ANDROID_HOME/build-tools/36.0.0/zipalign" -c -P 16 -v 4 tests/Goo.AndroidSmoke/bin/Release/net10.0-android/org.goo.androidsmoke-Signed.apk
adb install -r tests/Goo.AndroidSmoke/bin/Release/net10.0-android/org.goo.androidsmoke-Signed.apk
```

The package checker verifies payload provenance, ABI, dependencies and page alignment.
For one ABI, pass `--abi arm64-v8a` or `--abi x86_64`. APK alignment is separate from AAB checks.

| Device check | Command and result |
| --- | --- |
| Accessibility | `.github/scripts/run-android-accessibility.sh APK` uses pinned API 36 UiAutomation and Linux KVM. Logs and a capture go to `artifacts/android-accessibility-36/logs`. It does not test TalkBack speech. |
| Input | `adb shell am start -S -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -p org.goo.androidsmoke --ez goo.input_smoke true`, then `adb logcat -d -s GooInputSmoke:I`. Wait for `PASS`. |
| Gestures | `adb shell am instrument -w -r org.goo.androidsmoke/org.goo.androidsmoke.GestureChecks`. Wait for `GOO_GESTURES_PASS`. |
| Popups | Launch with `--ez goo.popup_smoke true`, then read `adb logcat -d -s GooPopupSmoke:I`. Wait for `PASS`. |
| Native menus | `adb shell am start -n org.goo.androidsmoke/.MainActivity --ez goo.native_menu_smoke true`. Open Actions and Select, then press Back on cancellation. Read `adb logcat -s GooNativeMenus` for `passed`. |

On a compatible device, also check first-frame text/images, taps, touch scrolling,
selection/composition, password privacy, rotation, background/resume and Surface
replacement. Increment the counter before replacing only the Surface and check
that its value remains. Record untested combinations.

## Generated documentation

```sh
dotnet run --project tools/Goo.Repo -- docs
dotnet run --project tools/Goo.Repo -- docs --android
```

Edit guides in `tools/Goo.ApiDocs/Guides` and member descriptions in source XML comments. Do not edit generated pages. The generator checks member mappings and parses and formats examples. Compile runnable examples against the current package.

Commit generated docs with source changes, including release PRs. Desktop docs need no Android tools. Run `docs --android` only when Android API docs change.

## DevTools and plugin

```sh
dotnet build apps/Goo.DevTools -c Release
dotnet run --project tools/Goo.Repo -- check devtools
dotnet run --project tools/Goo.Repo -- docs
```

The CLI build includes the inspector. For a source inspector, use the target flags from `goo inspector`. `--help` and `--version` exit before window creation. With no matching app, it opens disconnected for trace import.

| Setting | Use |
| --- | --- |
| `GOO_CLI` | CLI command used by the plugin host. Point it at the built CLI for source work. |
| `GOO_DEVTOOLS_SAMPLE=1` | Inspector fixture data without a target. |
| `GOO_DEVTOOLS_DIR` | Custom runtime descriptor directory. Set it for both the app and plugin server. |
| `GOO_DEVTOOLS_INSPECTOR` | Custom inspector executable or DLL. The CLI uses the bundled inspector by default. |

Verify the plugin in private headless Wayland:

```sh
.github/scripts/with-headless-wayland.sh dotnet run --project tools/Goo.DevTools.Cli -c Release -- mcp --plugin-root plugins/goo --verify
```

Ship the plugin with its matching Goo.DevTools version. Refresh its bundled references with `Goo.Repo docs`.

| Source | Responsibility |
| --- | --- |
| `tools/Goo.DevTools.Cli/CommandLine.gs` | Options, parser, help and CLI reference |
| `tools/Goo.DevTools.Cli/Discovery.gs` | Discovery and target selection |
| `tools/Goo.DevTools.Cli/CliApplication.gs` | Launch and runtime commands |
| `apps/Goo.DevTools/Program.gs` | Inspector validation and startup |
| `apps/Goo.DevTools/DiagnosticWire.gs` | Inspector transport |

For renderer-only suppression modes, see [GPU experiments](docs/devtools/gpu-experiments.md).

## Submitting changes

- Agree on behavior, API or architecture changes in an issue. Small docs-only changes can use a focused PR.
- Link the issue and use the pull request template.
- Keep the diff focused and check changed behavior. Include required API docs and generated output.
- Add a `changelog.d/<branch-or-pr>.md` fragment for release-note changes. Use lowercase names with hyphens. PR CI warns if it is missing. `check metadata` does not validate fragments.
- Do not edit `CHANGELOG.md` for pending changes. Breaking changes and exact adaptation steps go in the fragment. Do not create migration pages.

```md
## Fixed

- Keep queued diagnostics connections alive when a probe disconnects.
```

Use `Added`, `Changed`, `Fixed` or `Removed` headings and one line per bullet. `release --write` validates and joins fragments, then deletes them. Release PRs consume fragments instead of adding one.

AI-generated code is accepted. Write the issue in your own words and explain the behavior you understand.
