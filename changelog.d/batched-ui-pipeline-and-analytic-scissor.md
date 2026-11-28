## Changed

- Unified Vulkan UI primitive rendering (`SolidBox`, `RoundedBox`, `Shadow`, `PerEdgeBorder`, `LinearGradient`, `RadialGradient`, and `Image`) into a single batched `GooBatchedUi` pipeline (`PainterBatcher`) with inline screen-space gradient dithering, out-of-band `>4` gradient stop records, and deferred `set=0` image descriptor binding (#452).
- Replaced rasterized R8/RGBA8 `VulkanClipMaskAtlas` clip textures with an SSBO-backed analytic `VulkanScissorTable` and shared shader clip-chain evaluator, enabling rotated and non-axis-aligned overflow clips across live windows, scrollbars, text inputs, and `RenderOffscreenAsync` (#814).
- Introduced `VulkanGraphicsPipelineKey` and replaced the fixed 34-entry `ShaderEffect` pipeline array with pinned built-in backdrop effects and a bounded 64-entry fence-safe LRU pipeline cache.
- Switched `Goo.ShaderGen` HarfBuzz GLSL compilation to pinned `slangc 2026.16`, synced `goo_effect.glsl` with `goo_effect.slang`, and emitted a single checked `VulkanShaderAbi.Generated.gs` source of truth.
