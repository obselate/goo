# Shader pipeline byte identity

**Retained for production.** Separately constructed shader programs with identical
Vulkan SPIR-V now share one pipeline within the existing device, format, and layout
cache. This removes duplicate native objects and prevents identical programs from
exhausting the fixed 32-entry cache. It is not a broad frame-speed optimization.

## Design

`ShaderEffectProgram` computes one SHA-256 digest for its selected Vulkan SPIR-V
during construction. A `ConditionalWeakTable` provides the same-program fast lookup
without retaining program keys strongly. Only an alias miss enters the cache lock and
uses the digest plus an exact span byte comparison before sharing a pipeline. The exact
comparison prevents digest collisions from aliasing distinct shaders.

`ProgramId` remains unique per program object. Each `ShaderEffect` also retains its
own parameters and data. Pipeline ownership remains scoped to the existing shared
Vulkan state, and disposal destroys each unique pipeline once.

## Measurement method

One C# probe assembly ran against saved baseline and candidate `Goo.dll` files. Six
paired runs alternated baseline/candidate order for both workloads. Each process
opened a real native window and loaded the same 7.8 KB effect artifact. The shared
workload resolved 32 effects using one program object. The duplicate workload
constructed 32 independent program objects from the same bytes. Warm lookup results
use 10,000 batches of 1,000 resolutions after at least one second of warmup. Values
below are medians of six run-level values. Warm batch percentiles are divided by
1,000 for a per-lookup equivalent. They are not percentiles of individual lookups.

## Results

| Workload | Metric | Baseline | Candidate |
| --- | --- | ---: | ---: |
| Shared object | Accepted programs | 32 | 32 |
| Shared object | Unique pipelines / cache entries | 1 / 1 | 1 / 1 |
| Shared object | Resolve batch | 577.599 us | 706.231 us |
| Shared object | Warm batch P50 / 1,000 | 4.384 ns/lookup | 11.161 ns/lookup |
| Shared object | Warm batch P99 / 1,000 | 5.506 ns/lookup | 14.232 ns/lookup |
| Duplicate objects | Accepted programs | 32 | 32 |
| Duplicate objects | Unique pipelines / cache entries | 32 / 32 | 1 / 1 |
| Duplicate objects | Resolve batch | 903.664 us | 864.705 us |
| Duplicate objects | Warm batch P50 / 1,000 | 15.119 ns/lookup | 13.095 ns/lookup |
| Duplicate objects | Warm batch P99 / 1,000 | 21.240 ns/lookup | 18.154 ns/lookup |

Warm lookup allocated zero managed bytes in every baseline and candidate run. For
32 duplicate programs, median construction time rose from 165.858 to 323.566 us and
allocation rose from 273,408 to 275,712 bytes. The added digest costs 72 bytes and
about 4.93 us per program for this artifact. In the shared-object runs, the median
first-program observation rose from 974.612 to 1,193.770 us, but this includes process
first use, JIT, and cache effects and is not a cold driver-pipeline measurement.

The baseline accepted 32 duplicate programs as 32 unique pipelines, then a 64-program
run stopped at the cache limit after accepting 32. The candidate accepted all 64 as
one unique pipeline. The shared-object 64-program control remained one pipeline in
both builds.

## Correctness and limits

The native gate verifies separately loaded identical programs, distinct shader bytes,
forced digest collision defense, independent effect parameters and data, pixel output,
and clean close/reopen resource accounting. It passes on the native Vulkan lane and
through the Linux headless Wayland CI wrapper with diagnostics. Existing queue-wake,
primitive metrics, retention, and staging disposition remain unchanged.
The focused API checks pass 12/12, and FailedIdle recovery also passes.

The probe measures internal pipeline lookup after warmup. It does not measure frame
time, application startup, first-use compilation in a clean driver cache, or general
shader-loading performance. The retained change is justified by cache capacity and
native pipeline count, not the small and mixed lookup-time differences.

The completed [pre-push frame comparison](pre-push-2026-09-05.md) measures the combined
pipeline-identity and subsequent timeline, timestamp, and layer-pool changes. Six
alternating-order pairs per workload show similar frame costs with mixed timing
directions and less image-effects native object churn. It does not isolate the added
same-program lookup cost and does not change the capacity-based acceptance decision.

## Evidence

- [Verification and fingerprints](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/pipeline-identity-2026-09-04/verification.json),
  [paired results](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/pipeline-identity-2026-09-04/results.json),
  [probe](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/pipeline-identity-2026-09-04/Pipeline.cs), and
  [paired runner](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/pipeline-identity-2026-09-04/run-pairs.py).
- [Baseline 64-program capacity](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/pipeline-identity-2026-09-04/baseline-duplicate64.log.gz)
  and the final [candidate native gate and 64-program proof](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/pipeline-identity-2026-09-04/native.log).
- [API checks](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/pipeline-identity-2026-09-04/api.log),
  [recovery](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/pipeline-identity-2026-09-04/recovery.log.gz),
  [primitive metrics](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/pipeline-identity-2026-09-04/metrics.log.gz), and
  [retention](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/pipeline-identity-2026-09-04/retention.log).
- [Queue wake](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/pipeline-identity-2026-09-04/queue-wake.log),
  [queue isolation](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/pipeline-identity-2026-09-04/queue-isolation.log),
  [strict lint](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/pipeline-identity-2026-09-04/lint.log), and
  [local CI-wrapper gate](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/pipeline-identity-2026-09-04/ci.log).
