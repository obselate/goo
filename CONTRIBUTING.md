# Contributing

Everyone is welcome to contribute to Goo.

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

Independent builds may run in parallel when their outputs are isolated. On Linux,
set `GOO_BUILD_LOCK` when shared outputs need serialization. Goo.Repo owns
`flock --close` for that lock. Do not wrap it in the same lock.

Gallery builds and custom shader projects also need the pinned Slang and Vulkan
SDKs. Run `doctor` for the install command. See [custom shaders](docs/platform-preflight.md#custom-shaders).
For NativeAOT, install the target platform's
[prerequisites](https://learn.microsoft.com/dotnet/core/deploying/native-aot/).
Publish on the target OS with an explicit RID. NativeAOT is the preferred desktop
release mode. Trimmed JIT is not a qualified release profile.

The Goo package defaults NativeAOT apps to `IlcFoldIdenticalMethodBodies=true`.
Apps can override this property. Identical methods can share addresses and
stack-trace names. Globalization remains an explicit app setting.

Apps that do not read dependency XML docs at runtime can set
`PublishReferencesDocumentationFiles=false`. This is optional, not a repository
default. Do not delete XML files by name. Keep notices, licenses and feature data.

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
CI also runs platform package and rendering checks. See [tests](tests/README.md).

Limit formatting fixes to the intended files. Do not bulk-format core source.
GL0005 is a manual review advisory because syntax cannot identify intentional
fail-fast assertions. See [code conventions](CONVENTIONS.md).

For advisory consumer size and runtime measurements, run `Goo.Investigation performance`
with `--output NEW_DIRECTORY --rid RID --package-version VERSION --package-source FEED`.
Use `--publish-only` for publish output without a display. Full runs need a private
Wayland session and Vulkan. Results are advisory, not timing or memory gates.

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

- Open an issue to agree on behavior, API or architecture changes. Small docs-only changes may use a focused PR directly.
- Link the agreed issue when there is one and use the pull request template.
- Keep changes focused. Include tests and docs for changed behavior or API.
- Include generated docs. CI checks them and does not commit them for you.
- Add one `changelog.d/<branch-or-pr>.md` file. Use a lowercase name with hyphens
  instead of branch slashes. Do not edit `CHANGELOG.md` for pending changes.

```md
## Fixed

- Keep queued diagnostics connections alive when a probe disconnects.
```

Use one section: `Added`, `Changed`, `Fixed` or `Removed`. Write each bullet on
one line. Release preparation joins fragments in filename order within each
section and deletes them. Release PRs consume fragments instead of adding one.

AI policy:

Code generated by AI is welcome, just the same as hand-written code is.

While AI code is welcome, I would prefer (and there is a higher chance of me reading it) if the issue text is written by **you**.

This gives you the chance to explain and understand the code you are submitting and it keeps me from reading overly verbose explanations that may not even make sense.
