# Changelog

## Unreleased

- Removed the four-stop rendering limit for linear and radial gradients. Longer gradients use GPU buffer storage with binary stop lookup, preserving alpha, opacity, and hard color edges.
- Fixed custom titlebar double-click maximize/restore and live resizing of idle windows on Wayland in Goo's bundled SDL runtime.

## 0.5.0 - 2026-09-05

### Added

- Added sparse in-app drag and drop through `Blob.DragSource` and `Blob.DropTarget`, with Copy/Move negotiation, transformed and clipped target discovery, cancellation, and deterministic payload cleanup.
- Added immutable `VectorAsset`, `VectorNode`, `VectorPaint`, and `VectorStroke` APIs shared by authored, runtime SVG, and compiled vector content.
- Added backend-neutral `ShaderEffectProgram` containers and `.goo-effect` build artifacts.
- Added generic `Cell.Animate` overloads and `Motion.Tween`.

### Changed

- Changed `ShaderEffect` construction from raw fragment SPIR-V bytes to a validated `ShaderEffectProgram`. Load build output with `ShaderEffectProgram.Load` and pass the program to `ShaderEffect`.
- Changed `TextEditor` construction to take only its `TextEditorController`; the controller now supplies the document. Consolidated editor operations under `TextEditorController.Execute(TextCommand)` and moved presentation-layer record types behind keyed layer methods.
- Sealed `Anim<T>` and reorganized platform hosting behind internal per-platform services without adding a public backend selector.
- Unified vector rendering around immutable document nodes while retaining `VectorPath` for individual paths.

### Fixed

- Fixed sampled-image premultiplied alpha, liquid-glass dispersed coverage, transformed and clipped input routing, queue wake and isolation, effect-only replacement, pending-readback close, and failure cleanup.
- Fixed clipped Lava blending, CRT coverage at transparent edges, undefined Gallery falloff math, and volumetric premultiplied output. Shader playback rejects values that overflow GPU time, and reentrant drag failures preserve the original callback stack.
- Fixed repeated shared-path identity lookup so the measured 1,000-Shape workload allocates 2,032 B/frame instead of 1,282,032 B/frame.
- Fixed deferred graphics submission so acquired frames retain their recorded work, and exceptional frame abandonment now consumes the acquire semaphore before reuse.

### Performance

- Shared identical shader programs by byte identity, centralized GPU timeline completion, and reused eligible offscreen layer targets. These changes reduce native-object pressure and preserve resource lifetime without a broad frame-time claim.
- Reduced the measured EvenOdd overflow fallback by 34.96% at 33 contours and 35.64% at 65 contours on the qualified RTX 3080 workload. The 65-contour case remains above a 16.67 ms frame budget.
- Reduced the measured 1,000-Container full-update host-frame P50 from 3.012 to 2.694 ms through retained style payload identity checks, with allocation unchanged.

### Verification

- Passed 317 core behavior tests, 12 public API and documentation tests, strict repository lint, generated shader consistency, Release builds, and focused native Vulkan lifecycle, input, image, vector, clip, effect, queue, and readback gates.
- Current evidence and hardware limits are recorded in [`docs/perf/linux-release-qualification.md`](docs/perf/linux-release-qualification.md).

## 0.4.2 - 2026-09-02

### Added

- Added an Apple Silicon Goo Gallery app bundle for macOS 15 or newer.
- Added a checksum-verified unsigned installer that installs Goo Gallery under the current user account, removes quarantine only from the installed app, and launches it.
- Added pinned macOS arm64 SDL, MoltenVK, and HarfBuzz native payload builds with NativeAOT runtime verification.

## 0.4.1 - 2026-09-01

### Added

- Added ordered reusable style composition through `Style.BasedOn`.
- Added multi-listener window state, focus, and key notification events.
- Added a repo-local strict G# linter and enforced it in CI.
- Added persistent Vulkan pipeline caching and compatible primitive draw batching.

### Changed

- Made typed cells build from their immutable input snapshot and exposed that snapshot to derived cells.
- Made virtualized collections use explicit fixed item extents for deterministic placement and scroll range.
- Centralized style field behavior and defaults in generated metadata.
- Reduced dirty-cell queue work, retained-scene allocations, Vulkan command recording, and primitive staging overhead.

### Fixed

- Fixed best-effort cleanup ownership across reconciliation and the complete window close sequence.
- Fixed routed keyboard and focus callback semantics and default-action cancellation.
- Fixed Vulkan pipeline cache validation and retirement behavior.
- Embedded Goo debug symbols in the assembly so NuGet no longer rejects the G# portable PDB checksum.

### Performance

- Reduced scheduling for 1,000 dirty sibling cells from 1,088.133 to 341.695 microseconds, a 68.6% reduction, with unchanged managed allocation and without the rejected HashSet candidate's approximately 22.2 KiB retained capacity.
- Reduced stable primitive scene compilation by approximately 20% while keeping the compiler at 0 B/op before and after.
- Reduced compatible analytic draw calls by 92.8% to 99.0% across the sparse-box, topology, and small-animation workloads. Main-pass GPU P50 improved by 25.0%, 6.5%, and 16.7% respectively. No stable allocation improvement was measured.
- Reduced 13-pipeline creation from 2.824 seconds uncached to 5.235 milliseconds warm with the NVIDIA implicit disk cache disabled, a 99.8% reduction and 539x speedup. The explicit cache used approximately 1.13 MiB.

## 0.4.0 - 2026-08-31

### Added

- Added Windows x64 package support, tested on Windows 11, with the pinned SDL 3
  runtime, shared Vulkan host, software-Vulkan regression coverage, and
  NativeAOT qualification tooling.
- Added the `Goo.Templates` application template, the `Goo.DevTools` CLI, the
  `Goo.DevTools.App` inspector, and VS Code and Rider integrations.
- Added renderer-driven ShaderEffect playback, computed layout transitions,
  non-throwing window dispatch, and window diagnostics.
- Added four bounded, retained `ShaderEffectData` inputs with copy or ownership-transfer publication and shader authoring helpers.
- Added ownership-transfer construction for immutable `ImageSource` pixels with final-retirement callbacks.

### Changed

- Migrated Goo-owned Vulkan shaders to the pinned Slang 2026.16 toolchain.
- Replaced the Showcase application with Goo Gallery.
- Added complete clean-machine setup, conditional tool, DevTools, publishing,
  NativeAOT, troubleshooting, contributor, and release documentation.

### Fixed

- Fixed transparent Vulkan swapchains, ShaderEffect playback demand,
  clip-mask atlas pressure, and Windows software-Vulkan presentation.

## 0.3.0 - 2026-08-28

Goo 0.3.0 moves production rendering to Vulkan, broadens the Linux native ABI
to glibc 2.27, and qualifies Linux 6.6 or newer.

### Changed

- Replaced the Skia renderer with a direct Vulkan 1.3 renderer for Linux Wayland.
- Moved production hosting, text, images, paths, effects, windowing, diagnostics, and recovery into Goo-owned G# code.
- Added retained scene compilation, bounded GPU resource caches, damage tracking, asynchronous readback, and multi-window scheduling.
- Added native HarfBuzz shaping and GPU text paint with registered fonts, fallback, color glyphs, text editing, and IME geometry.
- Added retained images, vector paths, rounded clipping, borders, gradients, shadows, blend modes, scrolling, and draggable scrollbars.
- Lowered the Linux native ABI floor to glibc 2.27 and qualified Linux 6.6 or newer.
- Made Vulkan surface and swapchain maintenance extensions optional with an idle-safe compatibility path.

### Added

- Build-time SVG compilation into retained GCV1 vector assets.
- Build-time Slang and GLSL ShaderEffect compilation with deterministic SPIR-V validation.
- Package and NativeAOT verification for the public API, native libraries, shaders, and clean consumers.

### Verification

- Linux x64 passes public API, framework behavior, package, Vulkan validation, lifecycle, and performance checks.
- Accepted Linux evidence is summarized in [`docs/perf/linux-release-qualification.md`](docs/perf/linux-release-qualification.md).

### Pending

- Windows x64 runtime qualification.
- Linux integrated-GPU qualification.
- A second real display-scale qualification.

## 0.2.0 - 2026-08-07

### Changed

- SkiaSharp and SkiaSharp.HarfBuzz upgraded from 3.116.0 to 4.151.1, moving
  Skia from m116 to m151.
- HarfBuzzSharp and HarfBuzzSharp.NativeAssets.Linux upgraded from 8.3.1.1 to
  14.2.1.2, moving HarfBuzz from 8.3.1 to 14.2.1.
- Removed the SkiaSharp 3.x duplicate Linux native alias cleanup from
  `Goo.targets`; SkiaSharp 4.x ships a single canonical `libSkiaSharp.so`.
- Internal path construction migrated from the deprecated mutable `SKPath`
  API to `SKPathBuilder`, ahead of SkiaSharp removing its compatibility
  shim. Uniform solid borders and inset box shadows now paint through
  `SKCanvas.DrawRoundRectDifference`, making rounded solid borders about
  3x faster and removing the shim's per-paint allocation overhead. Public
  API is unchanged.

## 0.1.0 - 2026-08-07

Goo 0.1.0 is the first public release of the retained, declarative UI framework
for G# and .NET 10.

### Included

- Declarative Blob trees with keyed Cell invalidation and retained reconciliation.
- Yoga layout, Skia rendering, shapes, images, text, and style transitions.
- Keyboard, pointer, focus, scroll, clipboard, and generic text or IME input.
- Stable element handles, accessibility semantics, and a UI-thread dispatcher.
- Passive styled text and a retained multiline text editor.
- XML documentation and generated per-area API reference pages.

### Release constraints

- The supported platform is `linux-x64` with glibc 2.35 or newer on a native
  Wayland session. X11 and XWayland are not supported.
- Windows, macOS, and Linux ARM64 are not supported by 0.1.0.
- Custom IME candidate presentation is application-owned in 0.1.0.

### Compatibility

- Target framework: .NET 10.
- G# SDK: 0.3.633.
- Package version: 0.1.0.
- License: MIT.
