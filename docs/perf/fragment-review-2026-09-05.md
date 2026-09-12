# Fragment shader review, 2026-09-05

Historical review. See the [implemented non-UAT follow-up](non-uat-followup-2026-09-05.md) for the alpha fixes, dense-path optimization, GPU measurements, and remaining UAT scope. Findings below describe the reviewed baseline.

## Scope and binding proof

Consumer scope follows `docs/perf/evidence/checkpoint-review-2026-09-05/consumer-scope.md`: all in-repo projects plus compile-excluded injected fixtures and ignored extended tests were searched. External consumers were searched by the checkpoint audit but are not design constraints.

Reviewed every fragment in both requested inventories:

- Gallery: `aurora`, `chrome_sdf`, `corridor`, `crt`, `dither`, `iridescent_silk`, `liquid_glass`, `radial_light`, `ripple`, `terminal_glass`, `volumetric`, and `wolfenstein`.
- Production-source counterparts: `analytic_blend`, `analytic_border`, `analytic_linear4`, `analytic_radial4`, `analytic_sampled_image`, `analytic_shadow`, `analytic_solid`, `clip_mask`, `lava`, `path_band`, and `solid_quad`.

`apps/Goo.Gallery/Goo.Gallery.gsproj:18-29` compiles all 12 gallery fragments. `apps/Goo.Gallery/Services/GalleryShaderPrograms.gs:19-70` loads and exposes 11 of them, while `apps/Goo.Gallery/GlassMaterialWindow.gs:455-460` loads `liquid_glass` and another `terminal_glass` instance. All 12 are reachable.

`tools/Goo.ShaderGen/Program.cs:11-13,1020-1036` defines the test shader directory as generator input and the Goo Vulkan directory as production output, with exact expected source and artifact names. All 18 generated SPIR-V files under `tests/Goo.VulkanProof/Generated/Shaders` byte-match their current `Goo/Shaders/Vulkan` counterparts by SHA-256. `Goo/Rendering/Vulkan/VulkanSharedPrimitiveState.gs:614-631` loads the production analytic artifacts.

The ABI is explicit at `Goo/Shaders/Authoring/goo_effect.slang:162-175`. Goo maps local `uv` into the source rectangle, samples source and backdrop at that mapped coordinate, calls the effect with local `uv`, then applies clip coverage and element opacity. `docs/api/rendering.md:61` defines both sampled colors and the return value as premultiplied linear. It also states that backdrop aliases source when backdrop capture is disabled. The glass shaders sample an in-window captured backdrop with an authored 24-pixel outset. They cannot sample the operating-system desktop.

## Ranked findings

### 1. Actual bug: sampled images return straight RGB to a premultiplied blend

**Proof:** `Goo/Rendering/Vulkan/VulkanImageResources.Upload.gs:145-159` explicitly converts incoming premultiplied RGBA bytes back to straight RGB before upload. `Goo/Rendering/Vulkan/VulkanImageResources.Create.gs:131-141` stores those bytes in `VK_FORMAT_R8G8B8A8_SRGB`, so texture sampling yields straight linear RGB plus alpha. `tests/Goo.VulkanProof/Shaders/analytic_sampled_image.frag.slang:14-18` multiplies RGB by element opacity but never by `sampleColor.a`. `Goo/Rendering/Vulkan/VulkanPipelineFactory.gs:166-173` uses `ONE, ONE_MINUS_SRC_ALPHA`, which requires premultiplied shader output. The generated and production SPIR-V for this fragment have identical SHA-256 `d2cca91ab6b81d3ad525840394d29ae712838b46372f642dc3b28a81fd325518`. Read-only `spirv-dis` inspection of the production artifact confirms that RGB is multiplied by only the opacity scalar while alpha is multiplied by sampled alpha and opacity. This is the code loaded by `VulkanSharedPrimitiveState.gs:614-631`, so the defect is present in the runtime artifact rather than only its source counterpart.

**Impact:** Any translucent texel contributes too much color over existing content and can form bright fringes. For example, alpha 0.5 straight red must emit linear red 0.5, but the shader emits 1.0. The image route invokes `VerifyVulkanImageReadback` at `tests/Goo.VulkanProof/Program.gs:3058-3069`, and its half-alpha expected pixel at `VulkanImageE2E.gs:89` describes the premultiplied result. That assertion conflicts with the current source and disassembled runtime artifact. The unchanged native image route was then run on the private Wayland compositor with the reviewed artifact. It exited 134 at `Program.gs:3064` with `Vulkan sampled image readback pixels are invalid` and zero Vulkan validation errors. This corroborates the source and SPIR-V finding. [Command, artifact hashes, disassembly, and failure log](https://github.com/obselate/goo/tree/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/post-checkpoint-2026-09-05/shader-alpha-proof) preserve the reproduction. The shader remains unchanged by this review.

**Action:** Emit `float4(sampleColor.rgb * alpha, alpha)`, then add a readback assertion over a non-black opaque destination so source-over RGB is checked rather than only transparent-target storage.

### 2. Unmeasured GPU scalability risk: complex path fill fallback is quadratic per fragment

**Proof:** `Goo/Rendering/Vulkan/VulkanPathBandEncoder.gs:9,142-146` caps band count at 32, but does not cap curves assigned to one band. `tests/Goo.VulkanProof/Shaders/path_band.frag.slang:749-863` stores only 32 fractional roots. On overflow it calls `accumulateHorizontalEvenOddOrdered`, whose outer loop runs `count * 2` times and rescans all `count` curves at lines 621-662. The vertical path duplicates the same fallback at lines 692-733 and 904-1037. This is bounded by authored path size and buffer validation, but has O(count squared) shader work for a dense band.

**Impact:** A valid complex path concentrated in one band can stall a large covered region. This is a production path renderer, not gallery-only code. No measurement in the reviewed evidence establishes a safe worst-case curve count or GPU time.

**Action:** Add a dense single-band path GPU timing case first. If it crosses the frame budget, split dense bands further or encode ordered crossings on CPU so fragment work remains linear.

### 3. Unmeasured GPU cost: glass blur uses 17 and 39 backdrop fetches per covered fragment

**Proof:** `apps/Goo.Gallery/Shaders/terminal_glass.frag.slang:76-89` performs one center fetch plus 16 loop fetches. `apps/Goo.Gallery/Shaders/liquid_glass.frag.slang:18-28,89-105` calls a three-fetch chromatic sampler once plus 12 more times, for 39 fetches. Their source also contains per-tap trigonometric, square-root, and exponential expressions, although the compiler can fold or unroll loop-invariant constants. `apps/Goo.Gallery/GlassMaterialWindow.gs:459-460` applies them as backdrop effects to large panels.

**Impact:** The loops are statically bounded and this is not a correctness defect. Cost scales with covered pixels, including pixels where the center is visually clear. No per-material GPU result was found, so an optimization claim would be unsupported.

**Action:** Measure Main and Effects GPU timestamps at representative window sizes. If needed, use a fixed precomputed direction and weight table and reduce or spatially gate taps without changing the accepted material.

### 4. Conditional actual bug: liquid-glass dispersion combines RGB and alpha from different samples

**Proof:** `apps/Goo.Gallery/Shaders/liquid_glass.frag.slang:18-28` returns red from one displaced sample, green and alpha from the center, and blue from the opposite sample. Lines 106-113 then divide that mixed RGB by center alpha. The final clamp at lines 144-147 restores the numerical premultiplied bound, but it cannot restore the correct color when displaced samples have different alpha.

**Impact:** At alpha discontinuities inside the captured in-window backdrop, a low-alpha center can amplify color from a high-alpha displaced neighbor, producing saturated colored fringes. Opaque backdrops are unaffected. This does not provide desktop refraction because only Goo's captured backdrop is bound.

**Action:** Premultiply each dispersed channel against a matching alpha contribution and derive a correspondingly filtered alpha, or suppress dispersion where the three sampled alphas diverge.

### 5. Unverified AA consistency candidate: duplicated glass SDF code has divergent coverage

**Proof:** Both glass fragments duplicate `roundedRectDistance` at `liquid_glass.frag.slang:3-9` and `terminal_glass.frag.slang:10-16`. Liquid uses the fixed-width `saturate(0.5 - distance)` at line 59. Terminal uses derivative-aware coverage from `fwidth(distance)` at lines 53-57. `VulkanPrimitiveRenderer.Emit.gs:638-640` emits shader-effect layers with an identity transform and physical bounds, and the scene layer uses `TransformIndex: -1`. The current path therefore does not establish a transformed-scale defect.

**Impact:** No current visual defect is proven. The duplicate implementations have drifted and can produce different diagonal-corner coverage, but only a native pixel comparison can show whether that difference is material.

**Action:** Capture matched liquid and terminal corner masks at fractional DPI before changing either formula. Consolidate or align coverage only if that comparison proves a defect.

### 6. Intentional approximation: CRT sampling and mask frequency are locked to 640 by 360

**Proof:** `apps/Goo.Gallery/Shaders/crt.frag.slang:24-55` derives chromatic offsets, bloom offsets, scanlines, phosphor columns, and noise cells from a constant `640x360`. The shader already has access to the source texture and could query its dimensions, as both glass shaders do.

**Impact:** This is not an ABI or memory-safety bug. It intentionally fixes the artwork's raster character, but the apparent pixel size and blur radius change with panel size and DPI. That makes the result resolution-dependent rather than consistently CRT-like.

**Action:** Decide whether fixed virtual resolution is part of the material contract. If not, use texture dimensions or an explicit virtual-resolution parameter and document which space controls each effect.

## Reviewed areas with no finding

The common gallery retained-source expressions remain within the premultiplied bound after their final alpha multiplication. Ripple's `lerp` is a convex blend of two premultiplied samples and is therefore premultiplied, although it is an artistic crossfade rather than source-over. Analytic solid, gradient, shadow, and border radii differ in local normalization code, but the scene compiler clamps every corner to half the minimum dimension at `VulkanSceneCompiler.Paint.gs:1203-1207`, making adjacent sums valid for renderer-produced records. The remaining production fragments use bounded validated storage access and premultiplied packed colors in the reviewed paths.
