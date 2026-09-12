# Shader-effect recovery, 2026-09-05

The remaining shader-effect verification failure is resolved. The full ShaderEffect smoke and both FailedIdle recovery modes pass with Vulkan validation enabled on the RTX 3080.

## Correctness fix

VulkanOffscreenTarget.AbandonAfterDeviceLoss discarded native handles while decrementing Goo accounting. Its pooled readback target still owned a query pool, staging buffer, image view, image, command buffer, and command pool when the shared runtime destroyed the device. Vulkan validation reported VUID-vkDestroyDevice-device-00378, which Goo recorded as fatal -13 / 401.

The target now destroys those native children and releases its allocator allocations before device destruction. Cleanup does not wait on the lost graphics timeline. Each handle is cleared before its best-effort teardown, following the existing layer-target cleanup pattern.

## Measurement correction

The test's zero-allocation interval included mutation setup and pixel readback. Those operations may create legitimate resources. The retained check now establishes allocation-free renders on both frame slots, with a bounded 32-attempt limit, then measures two unchanged completed submissions. The parameter-mutation counter endpoint is also taken before readback. Pixel, input, ownership, retained upload, resize, DPI, recovery, and close assertions remain.

## Fractional-DPI capture correction

Normal presentation already supplied the framebuffer scale to the retained text shader. Asynchronous readback replayed the physically scaled scene with a hard-coded text scale of 1.0, so DevTools captures at 1.5x showed correctly scaled primitives and logical-size text. Readback now snapshots the compiled frame's text scale and passes it through the asynchronous target. A synthetic 176x120 logical, 264x180 framebuffer gate measured the marker at x=81 before the fix and rejected it; the corrected build passed the required physical x range of 110 through 149. The presentation path is unchanged. [Fractional-DPI capture evidence](https://github.com/obselate/goo/tree/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/glass-refinement-2026-09-05/dpi-capture).

## Verification

- AsyncReadbackSmoke and FailedIdle Release builds pass with zero warnings and errors.
- ShaderEffectSmoke passes with device_recovery=1, parameter_alloc_B=0, warm_vk_objects=0, warm_device_memory=0, and close=1.
- FailedIdle normal and presentation-maintenance-disabled modes pass with stage_timestamps=1 and zero final tracked image/layer resources.
- All three final logs contain no VUID, Vulkan Validation Error, or unhandled exception.
- Strict project lint uses the existing GL0005/GL0006 exclusions.

[Evidence and source patch](https://github.com/obselate/goo/tree/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/glass-refinement-2026-09-05), including the original failure, corrected gate results, build logs, and exact task-start source backups. This fix changes lost-device teardown and diagnostic measurement boundaries, not normal-frame rendering or the benchmark baseline.
