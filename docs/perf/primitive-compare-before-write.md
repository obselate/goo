# Primitive compare-before-write

**Rejected for production.** The candidate cuts isolated unchanged/sparse preparation time, but the longer unchanged whole-frame runs reproduce a P99 regression. Production and its metrics/retention/recovery assertions were restored to the accepted upload-metrics baseline. The benchmark improvements and candidate patch are retained.

## Candidate design

Incoming 128-byte records are compared with the frame slot's last submitted CPU history before writing mapped staging. Equal records skip the mapped write. Dirty ranges are assembled from a reusable Boolean array. The array grows only when comparable history needs more capacity and allocates nothing per warmed preparation. History validity and the comparable record count are captured once at preparation start. First-use and invalidated slots take the ordinary write path without comparison bookkeeping.

The renderer supplies a maximum record count, not necessarily the final count. If the final count requires a full upload, skipped records are restored from submitted history before publishing that full range. This is required because an aborted candidate can leave stale mapped bytes. Unchanged records split sparse ranges, so sparse copies cannot accidentally include those stale bytes. The empty-frame sentinel uses the same record writer. Effect-data version/offset handling, memory placement, command submission, and history publication remain unchanged.

## Measurement method

The baseline is the working tree after the accepted upload-metrics correction. Each lane uses one common harness assembly against saved baseline and candidate Goo assemblies. Six paired runs alternate baseline/candidate order. Results below use the median of the six run percentiles, with every run retained in the evidence JSON. Timing uses native NVIDIA Vulkan on an isolated KWin virtual compositor at 1600 x 1000, scale 1, VSync disabled. Validation is enabled separately for correctness gates.

The isolated probe starts a real window, warms both frame slots, waits for actual owned GPU work, then measures BeginPrepare, 1,000 record writes, FinishPrepare and Abort on the real mapped slot. It takes 10,000 samples after 3,000 warmup preparations. It excludes scene construction, native command recording, history publication, submission and presentation. Its repeated aborts preserve a fixed submitted history. Sparse changes one record and full changes every record at word 24. The cold case invalidates history before the loop and measures first-use preparation with capacity already allocated. It does not measure buffer allocation or application startup.

The frame benchmark takes 2,000 samples after 300 warmup frames. It rebuilds the existing 1,000-box Cell every frame. Unchanged changes no record, sparse changes record zero, and full changes every record using monotonically varying colors that remain different across the two frame slots. Measured-interval counter deltas assert the exact dirty-record count. ForceRender measures host frame work through queue handling, not physical input latency or GPU completion. This workload includes substantial existing scene-build allocation, so an isolated staging improvement is not a general UI speed claim.

## Correctness

The native metrics gate verifies full, unchanged and sparse writes, partial/completed aborts, stale staging followed by a sparse candidate, full repair after count shrink/growth, the zero sentinel, relocated effect bytes and both flush-helper branches. Direct fixture preparation waits for actual GPU completion before reusing its slot. Native retention verifies pixels, both frame slots, topology and sparse transfers. Queue isolation, live pacing, failed-idle/surface/device recovery and the local CI-wrapper metrics/queue-wake gates also run. The queue-wake CI invocation remains present.

The flush branch test does not qualify physically non-coherent hardware. The independently reproduced ShaderEffectSmoke fatal diagnostic from the metrics task remains a separate issue.

## Isolated preparation results

All After columns refer to the rejected candidate, not the restored production code.

Times are microseconds. Each cell is the median of six run percentiles.

| Workload | Before P50 | After P50 | Before P99 | After P99 | After staging bytes | After compared bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Unchanged | 34.531 | 22.798 | 57.268 | 38.046 | 0 | 128000 |
| One changed record | 31.815 | 22.673 | 52.464 | 40.061 | 128 | 127972 |
| All records changed | 30.738 | 30.553 | 60.269 | 50.234 | 128000 | 100000 |
| No valid history, preallocated | 14.848 | 15.735 | 23.799 | 22.838 | 128000 | 0 |

Unchanged P50 falls 34.0% and sparse P50 falls 28.7%. Both improve in every pair. Fully changed P50 is effectively flat. No-history preparation adds 0.887 microseconds at P50, a 6.0% local cost, while its median run P99 is lower. All four workloads have lower median run P99. Individual tail timings vary, so these figures do not prove a universal latency bound. Every isolated preparation allocates zero managed bytes after warmup. Submitted bytes stay zero in this preparation-only probe by design.

## Whole-frame results

Times are milliseconds, with the same six-pair aggregation.

| Workload | Before P50 | After P50 | Before P99 | After P99 | After CPU staging bytes/frame | Submitted bytes/frame |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Unchanged | 1.189 | 1.163 | 1.974 | 2.116 | 0 | 0 |
| One changed record | 1.145 | 1.111 | 2.090 | 1.954 | 128 | 128 |
| All records changed | 2.883 | 2.870 | 4.107 | 4.127 | 128000 | 128000 |

The short unchanged runs have a 0.142 ms higher median run P99, with three pairs better and three worse. The longer unchanged run series below investigates that tail result. The short full-update P99 difference is 0.020 ms. These frame figures include scene rebuilding and allocation and are not interchangeable with the isolated preparation measurements.

## Longer unchanged-frame follow-up

This follow-up was triggered by the short-run tail result. It keeps the same frozen assemblies, but increases warmup to 2,000 frames and samples to 10,000, across four balanced pairs. It does not replace or hide the six-pair results above.

| Pair | Before P50, ms | After P50, ms | Before P99, ms | After P99, ms |
| --- | ---: | ---: | ---: | ---: |
| 1 | 1.193 | 1.199 | 1.926 | 2.278 |
| 2 | 1.196 | 1.197 | 2.104 | 2.202 |
| 3 | 1.190 | 1.188 | 1.956 | 2.158 |
| 4 | 1.200 | 1.178 | 1.869 | 2.060 |

The median run P99 rises from 1.941 ms to 2.180 ms, **12.3%**, and every pair is worse. Median run P50 is effectively unchanged, 1.194 ms to 1.193 ms. Both builds allocate 512,568 bytes at frame P50/P99. The candidate removes 1.28 GB of mapped writes over each 10,000-frame measurement, but that local saving does not satisfy the frame-latency gate.

The source of the tail regression is not established. These controlled assembly comparisons are sufficient to reject this candidate, not to attribute the slowdown to a specific instruction, GC behavior, driver behavior, or hardware architecture. A future staging experiment must explain and clear this frame-level regression before replacing the current implementation. Pipeline identity evaluation is the next independent triage item.

## Verification and evidence

Candidate Release, native smoke and failed-idle builds pass with warnings treated as errors. The candidate passes the correctness gates described above. Strict repository lint passes with the established CI exclusions GL0005 and GL0006. The generic skill wrapper stops on the two existing public Dispose documentation warnings; no new warning was introduced.

The restored native fixture Goo assembly is byte-identical to the saved baseline. Restored Release, native-smoke and failed-idle builds pass with zero warnings/errors, as do metrics, retention, recovery, queue isolation, pacing and the local software CI-wrapper gates. The evidence probe project compiles and the candidate patch passes git apply --check. The new workload/P99 benchmark and its documentation remain in the working tree. No commit or push was made.

- [Environment, source and binary fingerprints](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/compare-before-write-2026-09-04/verification.json).
- [Isolated runs](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/compare-before-write-2026-09-04/probe-results.json), [frame runs](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/compare-before-write-2026-09-04/frame-results.json), [long unchanged runs](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/compare-before-write-2026-09-04/unchanged-long-results.json). Each JSON log name has a matching `.log.gz` in this directory.
- [Candidate patch](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/compare-before-write-2026-09-04/candidate.patch), [isolated probe](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/compare-before-write-2026-09-04/Prepare.cs), [probe project](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/compare-before-write-2026-09-04/Prepare.csproj), [paired runner](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/compare-before-write-2026-09-04/run-pairs.py), [long-run follow-up](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/compare-before-write-2026-09-04/run-unchanged-long.py). The runners capture this session's `/tmp/goo-compare-staging` layout.
- Candidate [metrics](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/compare-before-write-2026-09-04/metrics-native.log), [software metrics](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/compare-before-write-2026-09-04/metrics-ci.log), [pixel retention](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/compare-before-write-2026-09-04/retention.log), [recovery](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/compare-before-write-2026-09-04/failed-idle.log), [queue wake](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/compare-before-write-2026-09-04/queue-ci.log), [queue isolation](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/compare-before-write-2026-09-04/queue-isolation.log), [pacing](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/compare-before-write-2026-09-04/live-pacing.log).

To repeat the production frame benchmark, build Goo.AsyncReadbackSmoke, enable GOO_VK_DIAGNOSTICS=1 and GOO_PRIMITIVE_UPLOAD_BENCHMARK=1, and select GOO_PRIMITIVE_UPLOAD_WORKLOAD=unchanged, sparse or full. Warmup and samples use GOO_PRIMITIVE_UPLOAD_WARMUP and GOO_PRIMITIVE_UPLOAD_SAMPLES. Build the isolated probe project against a saved fixture with `-p:GooFixturePath=/absolute/path/Goo.dll`, copy its executable assembly into a separate copy of the smoke runtime, and pass unchanged, sparse, full or cold. For a new candidate, save both assemblies and use one common harness before comparing.

Restored baseline evidence: [metrics](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/compare-before-write-2026-09-04/restored-metrics-native.log), [retention](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/compare-before-write-2026-09-04/restored-retention.log), [recovery](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/compare-before-write-2026-09-04/restored-failed-idle.log), [CI metrics](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/compare-before-write-2026-09-04/restored-metrics-ci.log), [CI queue](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/compare-before-write-2026-09-04/restored-queue-ci.log), [Release build](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/compare-before-write-2026-09-04/restored-release-build.log), [native build](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/compare-before-write-2026-09-04/restored-native-build.log), [recovery build](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/compare-before-write-2026-09-04/restored-failed-idle-build.log). Hosted CI was not run.
