# Tests

Goo keeps a small set of focused projects. Each project owns one kind of evidence and can run independently from a clean checkout.

## Fast checks

Public API and documentation:

```sh
dotnet test tests/Goo.ApiContractTests/Goo.ApiContractTests.csproj -c Release
```

Framework behavior and allocation contracts:

```sh
dotnet test tests/Goo.CoreBehaviorTests/Goo.CoreBehaviorTests.csproj -c Release
```

Vulkan ABI and data-layout checks:

```sh
dotnet build tests/Goo.VulkanAbiSmoke/Goo.VulkanAbiSmoke.csproj -c Release
dotnet tests/Goo.VulkanAbiSmoke/bin/Release/net10.0/Goo.VulkanAbiSmoke.dll
```

Shader and text proof build:

```sh
dotnet build tests/Goo.VulkanProof/Goo.VulkanProof.gsproj -c Release
```

## Native presentation qualification

The default proof uses the production window, queue worker, timeline, and retirement
owners. It checks five accepted presentations, both frame slots, live prior-image
retirement, capabilities, timestamps, and teardown. Run these maintenance-specific
routes on a desktop where pending presentation retirement can be observed:

```sh
export VK_INSTANCE_LAYERS=VK_LAYER_KHRONOS_validation
dotnet tests/Goo.VulkanProof/bin/Release/net10.0/Goo.VulkanProof.dll
GOO_VK_READBACK=1 dotnet tests/Goo.VulkanProof/bin/Release/net10.0/Goo.VulkanProof.dll
GOO_VK_REQUIRE_EXT_MAINTENANCE=1 dotnet tests/Goo.VulkanProof/bin/Release/net10.0/Goo.VulkanProof.dll
GOO_VK_LIFECYCLE=1 GOO_VK_SKIP_DPI=1 GOO_VK_SKIP_MINIMIZE=1 \
  dotnet tests/Goo.VulkanProof/bin/Release/net10.0/Goo.VulkanProof.dll
GOO_VK_LIFECYCLE=1 GOO_VK_SKIP_DPI=1 GOO_VK_LIFECYCLE_X11=1 \
  dotnet tests/Goo.VulkanProof/bin/Release/net10.0/Goo.VulkanProof.dll
```

Readback retains fixed clear and quad pixels in a direct UNORM target. Lifecycle
checks real resize, retirement collection, close, and reopen under a held runtime
lease. The X11 flag selects a test-only native host for minimize/restore. Omit it
to qualify Wayland. Omit the skip flags to require actual display-scale movement
and minimize/restore. Skipped probes are reported as deferred. Software CI keeps
the separate production text, image, timeline, queue, and recovery routes.

## Native queue wake regression

The native queue wake regression check runs the normal window scheduler while
deliberately deferring the next frame. Both submit and present completions must
be processed before the frame deadline or idle timeout, and a held worker must
still allow a blocking wait:

```sh
dotnet build tests/Goo.AsyncReadbackSmoke/Goo.AsyncReadbackSmoke.gsproj -c Release
GOO_QUEUE_WAKE_SMOKE=1 dotnet tests/Goo.AsyncReadbackSmoke/bin/Release/net10.0/Goo.AsyncReadbackSmoke.dll
```

CI runs this gate in the portable Vulkan checks through the headless Wayland wrapper.
`PathIdentityTests` in the core behavior suite also checks allocation-free repeated
source lookup, structural equality under hash collisions, and mutable path revisions.

## Timeline completion

Run the shared graphics timeline completion gate with diagnostics:

```sh
dotnet build tests/Goo.AsyncReadbackSmoke/Goo.AsyncReadbackSmoke.gsproj -c Release
GOO_VK_DIAGNOSTICS=1 GOO_TIMELINE_COMPLETION_SMOKE=1 \
  dotnet tests/Goo.AsyncReadbackSmoke/bin/Release/net10.0/Goo.AsyncReadbackSmoke.dll
```

The gate checks that validation exception rollback and deferred enqueue consume no serial,
held-window and offscreen submissions receive consecutive accepted FIFO serials,
and poll or zero-time waits do not report held work complete. Shared GPU timeline
completion must still reconcile each CPU mailbox. The gate also validates offscreen
pixels and closes both windows without Vulkan validation, fatal, or object leaks.
Linux native CI runs it through the headless Wayland wrapper.

## Primitive upload metrics

`GOO_PRIMITIVE_METRICS_SMOKE=1` runs the native full, unchanged, sparse, abort,
effect-tail, and flush-call accounting gate in `Goo.AsyncReadbackSmoke`.
Linux native CI runs it through the headless Wayland wrapper.

`GOO_PRIMITIVE_UPLOAD_BENCHMARK=1` runs the fixed 1,000-box benchmark. Select
`GOO_PRIMITIVE_UPLOAD_WORKLOAD=unchanged|sparse|full` and configure the existing
`GOO_PRIMITIVE_UPLOAD_WARMUP` and `GOO_PRIMITIVE_UPLOAD_SAMPLES` counts. Output
includes frame P50/P95/P99/max, allocation measurements, and measured-interval
cumulative CPU-written, CPU-compared, CPU-write-operation, and submitted-transfer
counters.
See [counter definitions and commands](../docs/perf/primitive-upload-metrics.md).

## All Blob benchmark

`GOO_ALL_BLOB_BENCHMARK=1` runs an optional 1,000-cell retained benchmark for
`container`, `text`, `image`, `shape`, `button`, `text-entry`, or `text-editor`.
Select the kind with `GOO_ALL_BLOB_KIND` and select `unchanged`, `sparse`, or
`full` with `GOO_ALL_BLOB_MODE`. Configure up to 300 warm frames with
`GOO_ALL_BLOB_WARMUP` and up to 2,000 measured frames with
`GOO_ALL_BLOB_SAMPLES`.

The root builds once. Each measured update changes only leaf opacity between
1.0 and 0.75: zero leaves for unchanged, one leaf for sparse, and all 1,000
leaves for full. The output reports host frame wall time, managed allocation,
process and managed-memory samples, Goo allocation counters, and Vulkan
timestamp stages. Main is the outer render-pass scope and upload is separate.
Effects and offscreen scopes can nest inside main, so stage times must not be
summed. Two cold update frames are measured after the initial untimed render
and before warmup. These are not application startup or first-paint times.
Allocation output includes P50, P95, and P99. On Linux, a post-GC snapshot pairs
managed retained bytes with RSS and PSS from one `/proc/self/smaps_rollup` read.
This diagnostic benchmark is not run automatically by CI.

## Pipeline identity

Run the native pipeline identity gate with diagnostics:

```sh
dotnet build tests/Goo.AsyncReadbackSmoke/Goo.AsyncReadbackSmoke.gsproj -c Release
GOO_VK_DIAGNOSTICS=1 GOO_PIPELINE_IDENTITY_SMOKE=1 \
  dotnet tests/Goo.AsyncReadbackSmoke/bin/Release/net10.0/Goo.AsyncReadbackSmoke.dll
```

The gate checks that separately loaded identical shader programs share a pipeline,
distinct bytes remain distinct under hash collisions, effect parameters and data stay
independent, rendered pixels remain correct, and close/reopen releases resources.
Linux native CI runs it through the headless Wayland wrapper.

## Project map

| Project | Purpose |
| --- | --- |
| `Goo.ApiContractTests` | Approved public API and generated XML documentation |
| `Goo.CoreBehaviorTests` | Cells, reconciliation, layout, style, motion, input, text, accessibility, and allocation behavior |
| `Goo.VulkanAbiSmoke` | Vulkan bindings, text-provider ABI, retained path encoding, and upload contracts |
| `Goo.AsyncReadbackSmoke` | Vulkan pixels, clipping, effects, input, pacing, windowing, and performance workloads |
| `Goo.FailedIdleSmoke` | Multi-window lifecycle, surface loss, device loss, recovery, and terminal failure behavior |
| `Goo.PackageSmoke` | Clean NuGet consumer, packaged native assets, and public runtime behavior |
| `Goo.VulkanProof` | Low-level shader, text, image, path, and readback proofs |

## Linux requirements

Windowed Vulkan checks require:

- Linux x86-64, kernel 6.6 or newer
- glibc 2.27 or newer
- Wayland 1.18 or newer
- Vulkan 1.3
- `VK_KHR_swapchain`
- Timeline semaphores, synchronization2, and dynamic rendering
- `R16G16B16A16_SINT` uniform texel-buffer support
- Khronos validation layers for validation runs

Surface and swapchain maintenance extensions select the asynchronous
presentation-retirement path when available. The compatibility path does not
require them.

`Goo.VulkanProof` keeps maintenance-specific fast-path proofs; the package
compatibility smoke is the runtime support gate when those extensions are
absent.

## Package verification

The complete package flow is defined in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml). It:

1. Builds pinned Linux x64 and macOS arm64 native payloads.
2. Builds Goo and verification projects with warnings as errors.
3. Runs portable Vulkan proofs and the M1 MoltenVK window smoke.
4. Runs API and behavior tests.
5. Packs Goo and the SVG compiler with all runtime assets.
6. Publishes clean managed and NativeAOT package consumers.
7. Stages signed macOS and Linux bundles.
8. Validates native dependencies, checksums, and the bundle size limit.

That workflow is the authoritative source for native environment variables and exact release commands.

## Linux compatibility

[`qualify-linux-runtime.sh`](../.github/scripts/qualify-linux-runtime.sh) runs
the packaged consumer, resolves every native dependency, and optionally runs
real multi-window Vulkan rendering under a headless Wayland compositor:

```sh
DOTNET=/opt/dotnet/dotnet \
GOO_EXPECT_KERNEL_PREFIX=6.6 \
GOO_EXPECT_GLIBC=2.39 \
GOO_COMPAT_WINDOW_SMOKE=1 \
VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.json \
.github/scripts/qualify-linux-runtime.sh artifacts/linux-x64
```

The current boundary evidence is recorded in
[`linux-compatibility.json`](linux-compatibility.json). Distribution names are
test-fixture details, not support claims.

## Evidence rules

- Run Release builds with warnings treated as errors.
- Use a clean package cache for package-consumer checks.
- Enable Khronos validation for Vulkan correctness claims.
- Do not describe software Vulkan results as hardware performance evidence.
- Record hardware, driver, runtime, warmup, and sample counts for performance results.
