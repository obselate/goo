# Tests

Run the [source setup](../CONTRIBUTING.md#source-setup) before local checks. The
CI workflow is the source of truth for complete cross-platform verification.

## Managed checks

```sh
dotnet test tests/Goo.ApiContractTests/Goo.ApiContractTests.gsproj -c Release
dotnet test tests/Goo.CoreBehaviorTests/Goo.CoreBehaviorTests.gsproj -c Release
dotnet test tests/Goo.ImageLoadingTests/Goo.ImageLoadingTests.gsproj -c Release
dotnet test tests/Goo.DevTools.Cli.Tests/Goo.DevTools.Cli.Tests.gsproj -c Release
```

## Vulkan checks

These projects require the platform setup and native assets used by CI:

```sh
dotnet build tests/Goo.VulkanAbiSmoke/Goo.VulkanAbiSmoke.gsproj -c Release
dotnet build tests/Goo.VulkanProof/Goo.VulkanProof.gsproj -c Release
dotnet build tests/Goo.AsyncReadbackSmoke/Goo.AsyncReadbackSmoke.gsproj -c Release
```

`Goo.VulkanProof` contains the retained text and image proof lanes.
`Goo.AsyncReadbackSmoke` contains the current window, readback, shader, queue,
timeline, upload, image, and clipping lanes. Their exact environment variables
and launch commands are defined in [CI](../.github/workflows/ci.yml).

SVG parser tests are part of `Goo.CoreBehaviorTests`. To compare corpus pixels
before and after a parser change, build `Goo.AsyncReadbackSmoke` at each revision
and run it on the same display and driver:

```sh
GOO_SVG_CORPUS_OUTPUT=/tmp/svg-before dotnet tests/Goo.AsyncReadbackSmoke/bin/Release/net10.0/Goo.AsyncReadbackSmoke.dll
GOO_SVG_CORPUS_OUTPUT=/tmp/svg-after GOO_SVG_CORPUS_BASELINE=/tmp/svg-before dotnet tests/Goo.AsyncReadbackSmoke/bin/Release/net10.0/Goo.AsyncReadbackSmoke.dll
```

The check renders all three SVG fixtures at four animation samples and compares
every RGBA byte. It also prints each framebuffer size and SHA-256 hash.

## Other platform checks

| Project | Purpose |
| --- | --- |
| `Goo.AudioSmoke` | SDL audio behavior and unavailable-device handling |
| `Goo.ImageLoadingSmoke` | Packaged NativeAOT image loading |
| `Goo.PackageSmoke` | Clean NuGet consumer and packaged runtime assets |
| `Goo.AndroidSmoke` | Android packaging, lifecycle, rendering, and input |
| `Goo.AndroidSmoke.Desktop` | Desktop host for the shared Android scene |

Native tests must run on the target operating system. Do not treat software
Vulkan results as hardware performance evidence.
