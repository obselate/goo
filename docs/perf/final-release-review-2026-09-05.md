# Final 0.5.0 release review

## Scope

Reviewed the in-repository Goo and Goo.Svg libraries, Gallery shaders, tools, templates, and tests. The review includes the FailedIdleFixture and WindowReadbackFixture sources injected through test props. The approved public API snapshot and XML documentation remain required contracts. A content-based search found 1,579 external Goo consumer files across sibling projects. External consumers are not API design constraints or release gates for this pre-1.0 library.

The bounded code review covered drag/drop dispatch and ownership, Blob, ShaderEffect and ShaderEffectProgram, style comparison and traversal, Vulkan window lifetime and readback, all 12 Gallery fragment shaders, canonical core fragment shaders, and release scripts. It does not claim an exhaustive proof of the entire renderer.

## Release reconciliation

The local checkpoint and origin/main had diverged. The final candidate merges published 0.4.2 history and retains its macOS Resources layout, install-name filtering, portability-enumeration checks, native Slang support, DevTools SDL deduplication, and Linux license allowance. The 0.5.0 deployment-target checks, shader containers, timeline lifetime work, and runtime regression gates remain.

Removed the temporary cross-host Gallery shader artifact mechanism. The pinned macOS compiler already supported native compilation, making the artifact validator and conditional project path redundant.

## Verified API and visual checks

- Shader playback rejects finite double values that overflow the shader float representation, before mutating retained state.
- Pointer callback exceptions retain their original stack after a reentrant drag reset. The callback and cleanup remain single-shot.
- The full Core Release suite passed 317 tests with warnings as errors.
- Native Gallery captures at 1120 x 760 logical pixels, with 1x and 1.5x output scaling (1120 x 760 and 1680 x 1140 raster sizes), show readable dark terminal glass, visible backdrop transmission, clean rounded corners, and liquid refraction at the panel boundary. All four runtime logs are empty. This is a visual review of these two scenes, not a claim about every size or driver.

## Shader corrections

- Lava now emits clip coverage in alpha and uses premultiplied source-over blending in both lazy and prewarmed pipeline paths. A rounded clip must preserve the destination outside the shape.
- Aurora, Corridor, Iridescent Silk, and CRT use ordered smoothstep bounds. Their descending ramps are expressed as one minus an ascending ramp, following the [Khronos SmoothStep contract](https://registry.khronos.org/SPIR-V/specs/unified1/GLSL.std.450.html).
- CRT carries coverage from its separated color samples and bloom samples, preserving the blue fringe across a transparent source edge.
- Volumetric output clamps premultiplied RGB to the final alpha.
- The fragment correctness gate is included in Linux CI. Terminal and liquid glass materials retain their reviewed appearance.

## Final local verification

Passed 317 Core tests, 12 API/documentation tests, 10 SVG tests, all 12 Gallery shader builds, 18 canonical shader checks, strict repository lint, and unchanged API regeneration. Queue wake, timeline completion, upload metrics, pipeline identity, effect replacement/recovery, and liquid alpha gates pass with validation enabled.

The Ubuntu 24 timeline gate covers deferred submission without a serial hole and exceptional abandonment after a real swapchain image acquisition. The corrected runtime consumes the acquired binary semaphore through the serialized queue worker, observes its shared timeline completion, redraws, reads back pixels, and closes both windows with cleanup complete. The identical runtime passes with Vulkan Validation Layers 1.4.357. Ubuntu's packaged 1.3.275 layer reports a false `vkDestroySemaphore` error after a successful `VkSwapchainPresentFenceInfoEXT` fence poll because that layer version does not associate the maintenance present fence with presentation state. The [upstream correction](https://github.com/KhronosGroup/Vulkan-ValidationLayers/commit/8882963cfc0e3dbdff21bf4f913f05b52757d300) shipped before version 1.3.290.

CI now pins LunarG's Ubuntu validation-layer package at API version 1.4.313, verifies its checksum, and checks the exact loaded library path. All 14 portable native checks pass on Ubuntu 24 with that package. The final library also passes a fresh package build and NativeAOT package-consumer execution. The original pre-hardening runtime passes with the newer layer too, confirming that the CI failure and the acquisition hardening are separate issues.

The new fragment gate passes on NVIDIA and headless lavapipe, with zero validation errors and complete resource cleanup. Restoring the old Lava shader fails the clip-destination assertion. Restoring the old CRT bundle fails the sampled-alpha assertion.

The [verification summary](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/final-release-2026-09-05/verification.json), [file hashes](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/final-release-2026-09-05/files.json), and [raw archive](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/final-release-2026-09-05/verification.tar.gz) retain the checks and four native glass captures. Expected negative controls and intermediate failed build/lint attempts are distinct from final passing results.

## Follow-up boundary

Playing-effect demand discovery still scans the mounted tree. Replacing it with maintained demand counts would require lifecycle bookkeeping and measured evidence. It is deferred rather than mixed into release cleanup. No unused public API was removed solely because in-repository callers were absent.

A non-device error while polling readback can leave the request pending and later close attempts failing. This uncommon error path needs separate fault injections for a timeline query failure and a host invalidation failure. Preserve resources until submission completion or successful device idle is known. Do not clear an in-flight request merely to remove the busy state. This hardening work is deferred. Ordinary success, not-ready, and device-loss recovery remain covered.

Physical Mac UAT remains deferred. Hosted macOS execution and package validation are release gates, not physical-hardware qualification.
