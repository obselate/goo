# Contributing

Everyone is welcome to contribute to Goo.

## Source setup

Install the .NET 10 SDK and Git. A normal framework build uses the checked-in
SPIR-V and native HarfBuzz payloads:

```sh
git clone https://github.com/obselate/goo.git
cd goo
./bootstrap.sh --gsharp-only
dotnet build Goo/Goo.gsproj -c Release
```

On Windows, use `bootstrap.bat --gsharp-only`.

The G# SDK restores from NuGet through `Gsharp.NET.Sdk`. It is not a separate
system installation.

Install [Slang 2026.16](https://github.com/shader-slang/slang/releases/tag/v2026.16)
and [Vulkan SDK 1.4.357.0](https://vulkan.lunarg.com/sdk/home) when building Goo
Gallery, projects with `<GooShaderEffect>` items, or regenerating shaders. Set
`SLANG_SDK` and `VULKAN_SDK` to their SDK roots. ShaderEffect builds use
`slangc` and SPIRV-Tools 2026.3 `spirv-val`. Internal shader regeneration also
uses the SDK's `glslc` 2026.3.

Linux Vulkan runs also need a native Wayland session, a Vulkan 1.3 driver, and
a TrueType or OpenType sans-serif font. The CI dependency list in
[ci.yml](.github/workflows/ci.yml) is the authoritative Ubuntu 24.04 setup.
Windows builds have been tested on Windows 11 with current vendor Vulkan
drivers. A minimum supported Windows version has not yet been established.

For NativeAOT, install the target platform's [.NET NativeAOT
prerequisites](https://learn.microsoft.com/dotnet/core/deploying/native-aot/).
NativeAOT publishing must run on the target operating system.

## G# authoring tools

The current source uses upstream G# ADR-0180 mixed initializers and the ADR-0179
formatter. Build the pinned compiler and formatter before building this checkout:

```sh
./bootstrap.sh --gsharp-only
```

On Windows, use `bootstrap.bat --gsharp-only`.

The pin is upstream `947be9cb5f4467947ecb95dba06b461f9984d659`. The published
G# SDK 0.4.591 supplies the MSBuild tasks and runtime libraries. The source-built
compiler supplies the newer language support through `GsharpCompilerFullPath`.
App samples and code examples use the official four-space formatter with a
120-column layout budget. Core source retains its existing formatting.
See [native authoring](docs/native-authoring.md) for construction and spread rules.

## Verification

Run the focused managed checks for ordinary API or behavior changes:

```sh
dotnet build tools/Goo.Gslint/Goo.Gslint.csproj -c Release
dotnet tools/Goo.Gslint/bin/Release/net10.0/Goo.Gslint.dll \
  --strict --severity GL0001=none --severity GL0005=none --severity GL0006=none Goo tests
dotnet tools/Goo.Gslint/bin/Release/net10.0/Goo.Gslint.dll \
  --strict --severity GL0005=none --severity GL0006=none apps templates plugins/goo/reference/templates
dotnet test tests/Goo.ApiContractTests/Goo.ApiContractTests.csproj -c Release
dotnet test tests/Goo.CoreBehaviorTests/Goo.CoreBehaviorTests.csproj -c Release
```

Limit formatting fixes to app samples and examples; do not run a bulk formatter
over core source. Use `--fix` only on the intended files. GL0005 remains a manual review advisory because syntax
cannot distinguish intentional fail-fast assertions. Public API documentation
is enforced by `Goo.ApiContractTests`, which covers supplemented documentation
and avoids treating public test fixtures as product API.

Edit the explanatory input, window, tree, layout, and accessibility guides in
[`tools/Goo.ApiDocs/Guides`](tools/Goo.ApiDocs/Guides). Member descriptions belong
in source XML comments. Regenerate `docs/api` with
`dotnet run --project tools/Goo.ApiDocs/Goo.ApiDocs.csproj -c Release`; do not edit
generated pages directly. The generator validates all member mappings and parses/formats code
examples before replacing output pages. Compile runnable examples against the
current package to verify their types and behavior.

Vulkan, package, native payload, template, DevTools, and NativeAOT checks are
environment-specific. The CI workflow provisions the pinned shader tools,
builds both platform payloads, installs the locally packed template and .NET
tools, and exercises the clean package consumer. Use that workflow for release
parity instead of substituting system SDL or unpinned shader tools.

Packing `Goo` directly requires explicit compatible SDL paths:

```sh
dotnet pack Goo/Goo.gsproj -c Release \
  -p:GooLinuxSdlPath=/absolute/path/to/libSDL3.so \
  -p:GooWindowsSdlPath=/absolute/path/to/SDL3.dll
```

The pinned Windows SDL fetch and Linux SDL build are implemented in
[fetch-sdl-win-x64.sh](.github/scripts/fetch-sdl-win-x64.sh) and
[build-sdl-linux-x64.sh](.github/scripts/build-sdl-linux-x64.sh).

## Submitting changes

Please start with an issue and use the template that best fits your request. Goo
core is deliberately selective about what it contains. An issue lets us agree on
whether a change belongs in core and what the smallest solution is before code is
written. Direct pull requests are welcome, but they have a higher chance of being
declined when the scope has not been discussed.

When submitting a pull request:

- Link the issue.
- Use the pull request template.
- Keep the change focused on the agreed scope.
- Include tests and documentation when behavior or public API changes.

AI policy:

Code generated by AI is welcome, just the same as hand-written code is.

While AI code is welcome, I would prefer (and there is a higher chance of me reading it) if the issue text is written by **you**.

This gives you the chance to explain and understand the code you are submitting and it keeps me from reading overly verbose explanations that may not even make sense.
