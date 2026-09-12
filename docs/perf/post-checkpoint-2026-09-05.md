# Post-checkpoint fixes and review, 2026-09-05

Historical checkpoint report. The subsequent [non-UAT follow-up](non-uat-followup-2026-09-05.md) implements the shader correctness fixes and in-app drag/drop, measures dense paths and glass, and records current verification.

Base checkpoint: `80b72f8fcba26b91a3d3d4e1d0a173833751fc60`. These changes remain local and uncommitted. The earlier benchmark archives are unchanged.

## Implemented

- **Effect-only replacement:** reconciliation and style resolution now use one internal `sameStyleEntry` comparator, including `ShaderEffect` reference identity. Existing payload value and identity rules remain intact. The focused core regression verifies replacement on the retained node. The native smoke replaces and restores the effect without changing geometry and checks rendered pixels.
- **Hit-test fixtures:** the five stale failures now explicitly make their asserted Container targets hittable. The transformed Shape has an input handler. Production hit policy is unchanged.
- **Teardown:** five identical frame-failure `finally` blocks call `FinishFailedFrame`, preserving diagnostic capture, validation capture, frame closure, and active-frame clearing in that order. Individually guarded recovery paths remain explicit. Four unreachable reusable-readback cleanup branches before acquisition are removed. Post-acquisition ownership, device-loss checks, and fractional-DPI prerequisite fields remain intact.

## Verification

The correctness phase passed all 309 core tests and all 12 API contract tests. The final retained source also passed the complete 309-test core suite, all 12 API contract tests, strict repository lint with its documented GL0005/GL0006 exclusions, and the rebuilt native replacement/restoration smoke. After teardown, the AsyncReadback and FailedIdle Release builds passed with zero warnings or errors. Six native validation gates passed:

| Gate | Verified behavior |
| --- | --- |
| Shader effect | Replacement and restoration pixels, backdrop/blend/clip, resize, DPI, device recovery, retained data, and close |
| Readback and close | Completed capture, resident resources released on close |
| Queue isolation | Held submit/present, sibling service, retry, convergence, close |
| Queue wake | Submit/present completion wakes a blocking wait independently of frame deadlines |
| Failed idle | Failure recovery and cleanup with swapchain maintenance |
| Failed idle, maintenance disabled | Recovery and cleanup without swapchain maintenance |

[Commands, build/test logs, and runtime hashes](https://github.com/obselate/goo/tree/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/post-checkpoint-2026-09-05) preserve the evidence. These runs do not qualify physical Mac hardware.

## Small performance candidates

Seven paired fresh-process runs measured each candidate separately. Both lanes in each pair used the same case order. Process order alternated. Each process used 500 warmup and 3,000 measured samples with tiered compilation and ReadyToRun disabled. Style samples contained 4,096 comparisons. Keyed samples timed one full reconciliation, with child count/order/content/identity and structural effects checked outside the measured interval.

| Operation | Baseline P50 | Candidate P50 | Allocation P50 |
| --- | ---: | ---: | ---: |
| Equal numeric entries, nil payload | 39.85 ns | 8.55 ns | 0 B / 0 B |
| Shared text payload | 54.08 ns | 8.54 ns | 0 B / 0 B |
| Distinct equal text payload | 56.86 ns | 57.80 ns | 0 B / 0 B |
| Stable keyed reconciliation, 1,000 children | 239.98 us | 234.49 us | 0 B / 0 B |

Values are medians of per-process P50 measurements. Style values are divided by the batch size. They are not pooled percentiles or whole-frame timings. Equal numeric and shared-text comparisons improved in all seven pairs. The extra reference check costs approximately 0.94 ns for distinct equal strings. The style shortcut is retained after the native comparison below. No allocation or retained-memory reduction is claimed.

The keyed experiment passed its timing screen, including a 3.67% median paired reduction for stable 1,000-child reconciliation. The difference of median P50 values is 5.49 us. It remains **rejected** for production because of the failure semantics below. The generated raw analyzer's performance-only `retain` result does not override this correctness decision.

The initial keyed-loop fusion has a correctness limitation: the existing prepass marks structural effects before any child diff. A fused loop can throw in an earlier child before discovering a later reorder. `Window.Frame.gs` preserves reconciliation effects after failure, so the timing of this flag is observable internally. Measure this candidate only as an experiment. Do not retain it without preserving failure semantics.

### Native Container/full comparison

Five fresh-process pairs ran the existing 1,000-Container full-mutation workload with 300 warmup and 2,000 measured frames per process on the private KWin compositor. Baseline and candidate used the same app binary and distinct frozen Goo assemblies. Validation was off for timing. The native runs were sequential, with alternating lane order, on a Ryzen 7 3700X and RTX 3080. The host was not otherwise isolated from desktop activity.

| Host-frame statistic | Baseline | Retained style shortcut | Median paired change |
| --- | ---: | ---: | ---: |
| P50 | 3.012 ms | 2.694 ms | -9.97% |
| P95 | 3.524 ms | 3.199 ms | -8.83% |
| P99 | 3.681 ms | 3.405 ms | -7.49% |
| Managed allocation P50/P99 | 504,160 B/frame | 504,160 B/frame | 0% |

Host-frame P50 and P95 improved in all five pairs. P99 improved in four of five pairs. All 20,000 measured frames had accepted Main GPU samples with zero drops. Every run passed build/mutation counts, frame-slot use, close, and resource-cleanup checks. GPU timestamps are preserved as observations, but this CPU change does not alter GPU work and supports no causal GPU speed claim. This is a Container/full result, not a new all-blob or sparse-update baseline.

[Method, candidate patches, raw results, and final retention decision](https://github.com/obselate/goo/tree/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/post-checkpoint-2026-09-05/reconcile-benchmark) preserve the measurement. Final native figures use `native-results/final-current-verified`, built from the current test source. An earlier private-compositor comparison used an archived executable with equivalent Container/full operations but stale shader-smoke tests. Its raw evidence is retained as superseded. The current shader smoke was rebuilt and passed separately. Desktop-compositor calibration and the parser preflight are excluded.

## Drag/drop research

[The drag/drop proposal](../architecture/drag-drop-proposal-2026-09-05.md) recommends an in-app pointer coordinator with optional source and target descriptors, sparse runtime bindings, payload ownership, Copy/Move negotiation, cancellation, and target hit testing separate from capture. Native file/text imports are a separate host capability. Native outbound dragging needs a platform capability design. The report compares API shapes and cites the pinned SDL and native platform contracts. No drag/drop API was implemented.

## Fragment shader review

[The fragment review](fragment-review-2026-09-05.md) covers the Gallery fragments, production source counterparts, effect ABI, and loaded SPIR-V. Its first actionable correctness finding is sampled-image alpha: upload creates straight sRGB texels, but the fragment emits RGB without multiplying sampled alpha into the premultiplied blend.

The unchanged native image test reproduced a pixel-check failure with zero Vulkan validation errors. The source, loaded SPIR-V disassembly, and native failure agree. This shader remains unchanged and is the next correctness fix. Dense path-band fallback and glass tap counts need GPU measurements before optimization. Liquid dispersion across alpha discontinuities needs a focused visual case. The glass AA difference and CRT virtual resolution remain quality/design questions, not established regressions.
