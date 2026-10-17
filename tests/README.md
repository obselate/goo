# Tests

Run the [source setup](../CONTRIBUTING.md#source-setup) before local checks. The
CI workflow is the source of truth for complete cross-platform verification.

## Managed checks

```sh
dotnet test tests/Goo.ApiContractTests/Goo.ApiContractTests.csproj -c Release
dotnet test tests/Goo.CoreBehaviorTests/Goo.CoreBehaviorTests.csproj -c Release
dotnet test tests/Goo.ImageLoadingTests/Goo.ImageLoadingTests.csproj -c Release
dotnet test tests/Goo.Svg.Tests/Goo.Svg.Tests.csproj -c Release
dotnet test tests/Goo.DevTools.Cli.Tests/Goo.DevTools.Cli.Tests.csproj -c Release
```

## Vulkan checks

These projects require the platform setup and native assets used by CI:

```sh
dotnet build tests/Goo.VulkanAbiSmoke/Goo.VulkanAbiSmoke.csproj -c Release
dotnet build tests/Goo.VulkanProof/Goo.VulkanProof.gsproj -c Release
dotnet build tests/Goo.AsyncReadbackSmoke/Goo.AsyncReadbackSmoke.gsproj -c Release
```

`Goo.VulkanProof` contains the retained text and image proof lanes.
`Goo.AsyncReadbackSmoke` contains the current window, readback, shader, queue,
timeline, upload, image, and clipping lanes. Their exact environment variables
and launch commands are defined in [CI](../.github/workflows/ci.yml).

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
