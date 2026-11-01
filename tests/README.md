# Tests

```sh
dotnet run --project tools/Goo.Repo -- doctor
dotnet run --project tools/Goo.Repo -- check --list
dotnet run --project tools/Goo.Repo -- check core
```

Use the [source setup](../CONTRIBUTING.md#source-setup) first. Goo.Repo owns the
commands and environment for these CI lanes.

| Lane | Checks |
| --- | --- |
| `api` | Full public API and XML documentation contracts, including Android |
| `core` | Core behavior, SVG parser, input, layout and native window behavior |
| `image` | PNG decoder and image cache |
| `devtools` | CLI build and command tests |
| `gestures` | Shared gesture recognizers |
| `spell-check` | Hunspell integration with `GOO_REQUIRE_HUNSPELL=1` |
| `lint` | SDK formatter check, linter self-tests and strict source lint |
| `metadata` | Onboarding and release metadata |
| `docs` | Non-mutating desktop generated-doc comparison |
| `docs-android` | Non-mutating Android generated-doc comparison |

`core` needs Linux, the native build tools and Vulkan validation layer shown by
`doctor`. It builds pinned SDL when needed, starts a private Wayland session, and
sets the same software Vulkan and native-library paths as CI. It cleans the
session when the tests finish. Do not run the core test project on your desktop.

`spell-check` needs `libhunspell-1.7-0` on Ubuntu. The `api` lane and Android docs
need the installed Android workload, SDK and Java 21. Docs commands never install workloads.

## Platform checks

The [CI workflow](../.github/workflows/ci.yml) also checks native payloads, package
consumers, Vulkan rendering, Android devices, and NativeAOT. These checks need
the pinned platform inputs. Run native checks on the target operating system.
Software Vulkan results are not hardware performance evidence.

`Goo.VulkanProof` contains retained text and image checks.
`Goo.AsyncReadbackSmoke` contains window, readback, shader, queue, timeline,
upload, image and clipping checks. Use CI for the full platform matrix.
