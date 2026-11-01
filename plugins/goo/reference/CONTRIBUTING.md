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

Install Git and the .NET 10 SDK selected by `global.json`. The G# SDK restores
its compiler and formatter from NuGet. No bootstrap or global tool is needed.
The root `global.json` declares the authoring version. Standalone package
consumers and template content keep their own SDK pin.

`doctor` checks desktop prerequisites without changing the machine. Each missing
piece has a fix command. Android and Gallery shader tools are optional checks.
`build` uses the checked-in SPIR-V and native text payloads.

On Linux, `check core` builds the pinned SDL payload if needed. It starts a private
Wayland session and uses software Vulkan with the validation layer, just like CI.
It never uses your desktop. Native checks must run on their target operating system.
Software Vulkan does not measure hardware performance.
Set `GOO_WAYLAND_COMPOSITOR=kwin` to select KWin for local checks.

Build and check commands take `~/scratch/goo-build.lock` when that file exists.
The lock covers child builds and tests. Do not wrap Goo.Repo in the same lock.

Gallery builds and custom shader projects also need the pinned Slang and Vulkan
SDKs. Run `doctor` for the install command. See [custom shaders](README.md#custom-shaders).
For NativeAOT, install the target platform's
[prerequisites](https://learn.microsoft.com/dotnet/core/deploying/native-aot/).
Publish on the target OS with an explicit RID. NativeAOT is the preferred desktop
release mode. Trimmed JIT is not a qualified release profile.

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
| `check <lane>` | The same focused command and environment used by CI |
| `docs` | Generate desktop API pages and plugin reference |
| `docs --check` | Generate to a temporary directory and compare without changing tracked files |
| `docs --android` | Generate Android API pages with an installed Android workload, SDK and Java 21 |
| `docs --android --check` | Compare Android pages without changing tracked files |
| `pack` | Build or fetch pinned Linux and Windows SDL inputs, then pack Goo |

Every command accepts `--help`. `check api` builds Android and runs the full API
baseline and XML contracts. It needs the Android workload, SDK and Java 21.
CI also runs platform package and rendering checks. See [tests](https://github.com/obselate/goo/blob/main/tests/README.md).

Limit formatting fixes to the intended files. Do not bulk-format core source.
GL0005 is a manual review advisory because syntax cannot identify intentional
fail-fast assertions. See [code conventions](https://github.com/obselate/goo/blob/main/CONVENTIONS.md).

## Generated documentation

```sh
dotnet run --project tools/Goo.Repo -- docs
dotnet run --project tools/Goo.Repo -- docs --check
```

Commit generated docs with the source change in every PR, including release PRs.
Do not edit generated pages directly. Desktop docs do not need Android tools and
never install workloads. Run `docs --android` only when Android API docs change.

Edit guides in `tools/Goo.ApiDocs/Guides`. Write member descriptions in source XML
comments. The generator checks member mappings and parses and formats code examples.
Compile runnable examples against the current package to check their behavior.

## Submitting changes

- Open an issue to agree on scope.
- Link it in the pull request and use the pull request template.
- Keep changes focused. Include tests and docs for changed behavior or API.
- Include generated docs. CI checks them and does not commit them for you.

AI-generated code is welcome. Write issue text yourself so it explains the problem
and the intended change in your own words.
