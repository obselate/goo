# Non-UAT follow-up, 2026-09-05

Implemented sampled-image premultiplication, liquid-glass dispersed coverage, a measured dense-path fallback reduction, and in-app drag/drop. Terminal and liquid glass retain their sampling quality. All changes remain local and uncommitted.

## Shader correctness

- Sampled images now multiply RGB by sampled alpha and opacity before clipping and premultiplied blending. Native readback covers half-transparent content over both transparent and opaque nonblack destinations. Nearest and linear sampling, retained resources, rehydration, and cleanup pass with zero validation errors.
- Liquid glass combines the alpha coverage of its red, green, and blue refraction taps. The old bundle fails the new boundary assertion. The fixed bundle passes it. All 32 opaque control pixels and all 21 transparent control pixels are unchanged. A separate opaque 640x480 capture matches byte for byte.
- Both production and generated SPIR-V mirrors are updated through the canonical generator. All 18 shader checks pass.

See [shader evidence](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/non-uat-2026-09-05/shader-fixes/report.md).

## Dense paths and glass GPU cost

The retained EvenOdd overflow fallback sorts only fractional coverage roots. Fully covered roots contribute through total parity. This reduces redundant work in the ordered horizontal and vertical fallback, including the clip-mask variant. It remains quadratic in fractional roots.

The workload uses actual encoded nested contours and asserts the number of fractional roots at the selected physical pixel. Control and candidate captures match exactly for 1, 31, 33, and 65 contours. A larger-viewport case checks scaling. This is a targeted fragment-shader result, not a general Goo or CPU speed claim.

Final performance measurements use validation and implicit Vulkan layers disabled, confirmed by a loader preflight. All 63 fresh timing processes pass: 45 path runs and 18 glass runs. Each uses 300 warmup frames and 1,000 completed samples matched to GPU timestamp frame IDs, with zero dropped scopes. Values below are pooled percentiles over three processes per case. The earlier validation-enabled run is retained as correctness and historical evidence, not authoritative performance evidence.

| 256x256 path contours | Control Main P50 (ms) | Candidate Main P50 (ms) | Change |
| --- | ---: | ---: | ---: |
| 1 | 0.034816 | 0.036864 | +5.88% |
| 31 | 0.743424 | 0.743424 | +0.00% |
| 33 | 7.307264 | 4.752384 | -34.96% |
| 65 | 27.334656 | 17.592320 | -35.64% |

The one-contour case costs 2.048 us more. The 31-contour pooled P50 is unchanged. The 65-contour case still exceeds a 16.67 ms frame budget. At 1024x1024, the 33-contour candidate has Main P50/P95/P99 of 13.640/15.755/17.985 ms. Larger dense paths still need an algorithmic redesign if they become a product workload.

| Material | Window | Main P50 (ms) | Effects P50/P95/P99 (ms) |
| --- | --- | ---: | --- |
| liquid | 640x480 | 0.047 | 0.031/0.032/0.033 |
| liquid | 1120x760 | 0.114 | 0.077/0.079/0.083 |
| liquid | 1920x1080 | 0.269 | 0.185/0.188/0.189 |
| terminal | 640x480 | 0.038 | 0.022/0.023/0.024 |
| terminal | 1120x760 | 0.089 | 0.052/0.053/0.054 |
| terminal | 1920x1080 | 0.201 | 0.120/0.123/0.123 |

Main includes Effects, so those durations must not be added. These measurements cover one material panel with a 24-pixel inset over a deterministic opaque background. They do not justify reducing either material's sampling quality on this GPU. See the [authoritative GPU report](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/non-uat-2026-09-05/gpu-layers-off/report.md) for individual runs, P95/P99, provenance, and limits.

## In-app drag/drop

The public surface is `DragData`, `DragSource`, `DropTarget`, their event/result types, and two Blob properties. A source starts after a four-logical-pixel threshold on an otherwise unclaimed primary press. Target discovery is independent of pointer capture and falls back through accepting ancestors. Modifier changes, layout changes, descriptor replacement, and release trigger acceptance evaluation.

Cancellation covers Escape, focus loss, window close, removal, disable, and callback failure. Successful drop callbacks can remove the participating nodes. Session cleanup releases payload references without disposing application-owned data. Existing pointer capture and prevented events retain priority. The Gallery magnet example uses the primitive and preserves keyboard movement with accessibility actions.

Metadata stays sparse. Blob and Node retained allocation is unchanged. Each Window adds 48 bytes. The target hit path is lazy, and a warmed idle coordinator allocates zero bytes across 1,000 drains.

See the [current input API](../api/input.md), [architecture record](../architecture/drag-drop-proposal-2026-09-05.md), and [drag/drop verification](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/non-uat-2026-09-05/drag-drop/report.md). Native platform drag/drop, drag ghosts, autoscroll, and generic keyboard target traversal remain outside this implementation.

## Integrated verification

- Core behavior: 317/317 pass, including eight focused drag/drop regression groups.
- API and documentation contracts: 12/12 pass. Generated API pages are current.
- Native validation-enabled gates: queue wake, queue isolation, shader-effect replacement/recovery, pending-readback close, clip capture, liquid-glass alpha, and vector quality pass.
- Vulkan image readback, generated/production shader consistency, Gallery Release build, AsyncReadbackSmoke Release build, and repository strict G# lint pass. Lint uses the existing GL0005/GL0006 exclusions.
- The pre-task source patch still reverses cleanly in check-only mode, confirming earlier uncommitted source fixes remain intact.

Subjective glass appearance, corner AA, and CRT design choices remain UAT work. Physical-Mac qualification remains deferred.

## Evidence provenance

The [evidence index](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/non-uat-2026-09-05/README.md) links the final verification logs, raw benchmark archives, environment, source/artifact hashes, and checksum manifest.

The test host is Linux on a Ryzen 7 3700X and RTX 3080 with NVIDIA 610.57.04. Native runs use an isolated KWin virtual display at 3840x2160, scale 1. Source baseline is `80b72f8fcba26b91a3d3d4e1d0a173833751fc60` plus the preserved prior uncommitted work and this implementation.

The original validation-enabled GPU report contains a transcription error in its full terminal bundle hash. The actual saved bundle SHA-256 is `f25adebefb6563663fec681f4027e40a395bdced41ece691b6d4b8a8a8614758`. The historical archive is preserved unchanged. A first validation-off script attempt stopped on this incorrect hash before native execution, then the assertion was corrected against the file. Only the completed, corrected validation-off run qualifies as final timing evidence.
