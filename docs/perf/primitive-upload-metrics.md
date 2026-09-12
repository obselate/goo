# Primitive upload metrics

Primitive frame counters separate CPU staging work, transfer preparation, native command recording, and accepted submissions. They count logical operations and byte lengths, not physical memory-bus traffic or GPU execution time. `SubmittedTransferBytes` means submission succeeded and its completion was reconciled on the host. It does not mean GPU execution or presentation has completed.

| Field | Meaning and accounting point |
| --- | --- |
| `CpuWrittenBytes` | Bytes written into mapped staging by record writes, effect-data copies, and the empty-frame sentinel. Counted when written, including work later aborted. |
| `CpuWriteOperations` | One per 128-byte record write, effect-data copy, or sentinel write. Not individual word stores or map calls. |
| `CpuComparedBytes` | Bytes examined per operand when comparing staging records with CPU history. Counts the differing word and stops at the first difference. An unchanged 128-byte record compares 128 bytes from each operand. Full preparation skips comparison. |
| `HistoryCopiedBytes` | Bytes copied from staging into CPU history after successful submission. This is separate from staging writes and comparison reads. |
| `PlannedTransferBytes` | Sum of dirty primitive and effect-data ranges from a completed preparation. Includes plans subsequently aborted. |
| `SkippedTransferBytes` | Prepared payload bytes omitted from that transfer plan. These bytes may still have been written and compared by the CPU. |
| `UploadRangeCount` | Number of planned `VkBufferCopy` regions. Multiple regions can use one native copy command. |
| `FlushRequests` | Nonempty transfer ranges passed to the allocator's flush helper. Coherent-memory no-ops still count as requests. |
| `NativeFlushCalls` | Actual calls to `vkFlushMappedMemoryRanges`, including calls that return an error. Coherent-memory early returns count zero. |
| `RecordedCopyCommands` | Actual `vkCmdCopyBuffer` calls made while recording. Aborting a recorded frame does not erase this CPU work. |
| `RecordedBarriers` | Transfer-to-shader buffer barrier commands recorded for the primitive payload. |
| `SubmittedTransferBytes` | Planned bytes accepted at the existing successful-submission/history-publication boundary. Abort adds zero. Repeated reconciliation of the same submission adds zero. |
| `DirtyRecordCount`, `FullUpload`, `RetainedReuse` | Properties of the completed transfer plan. `FullUpload` describes a full plan, not proof of submission. |

`Total*` fields accumulate the same events over the frame-data owner's lifetime and saturate at `uint64.MaxValue`. Each successful `BeginPrepare` resets the per-preparation snapshot. Abort retains the snapshot and incurred totals. Total full uploads count completed full preparations. Allocation, descriptor updates, scene compilation, text/clip uploads, and driver-internal work are outside these primitive counters.

The old primitive `WrittenBytes` and `SkippedBytes` fields are now `PlannedTransferBytes` and `SkippedTransferBytes`. The old hardcoded `MappedWrites` is replaced by `CpuWriteOperations`. The old `Flushes` is split into `FlushRequests` and `NativeFlushCalls`. Benchmark and fixture consumers use the explicit names. Text and clip counters have their own existing contracts and were not renamed in this change.

## Verification

```sh
dotnet build tests/Goo.AsyncReadbackSmoke/Goo.AsyncReadbackSmoke.gsproj -c Release
GOO_PRIMITIVE_METRICS_SMOKE=1 dotnet tests/Goo.AsyncReadbackSmoke/bin/Release/net10.0/Goo.AsyncReadbackSmoke.dll
GOO_VK_DIAGNOSTICS=1 GOO_PRIMITIVE_UPLOAD_BENCHMARK=1 dotnet tests/Goo.AsyncReadbackSmoke/bin/Release/net10.0/Goo.AsyncReadbackSmoke.dll
```

The native metrics gate checks 1,000 records across full, unchanged, and one-record mutations. It also checks partial and completed preparation aborts, an eight-byte effect-data tail, cumulative counters, and subsequent reuse of the unmodified submission history. The allocator check toggles the coherent flag on an isolated test allocation to exercise both the skipped-flush and actual native-call branches. This is branch coverage, not qualification on physically non-coherent hardware. The Linux native CI step invokes this gate through the existing headless Wayland wrapper.

The upload algorithm remains staged. The [compare-before-write experiment](primitive-compare-before-write.md) was rejected after a repeated whole-frame P99 regression. These corrected metrics and the existing staging algorithm remain the production baseline.

## Verified results, 2026-09-04

| 1,000-record frame | CPU staging bytes | Compared bytes per operand | Planned bytes | Submitted bytes | Flush requests | Native flush calls |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Full | 128,000 | 0 | 128,000 | 128,000 | 1 | 0 |
| Unchanged | 128,000 | 128,000 | 0 | 0 | 0 | 0 |
| One changed record | 128,000 | 127,972 | 128 | 128 | 1 | 0 |

Both NVIDIA and the software CI-wrapper lane pass the metrics gate. Partial abort preserves 136 CPU-written bytes and zero planned/submitted bytes. Completed abort preserves 128,008 CPU-written and planned bytes, but zero submitted/history-copied bytes. Subsequent unchanged frames transfer zero bytes, proving aborted writes did not publish history.

The existing benchmark, across 2,301 preparations including warmup, reports 294,528,000 CPU-written bytes, 294,272,000 compared bytes, and only 256,000 planned/submitted/history-copied bytes. Those transfers use two copy commands, two barriers, two flush requests, and zero native flush calls. Both frame slots are exercised. These counters expose the staging work that the old transfer-only byte count hid.

Release, native smoke, and failed-idle builds pass with warnings treated as errors. Strict CI lint, native retention, failed-idle/recovery, and queue-wake gates pass. The extra ShaderEffectSmoke run rejects a fatal recovery diagnostic with code -13 and value 401. A reconstruction using the pre-change source and Goo binary reproduces the same failure. This remains a separate issue.

[Verification environment and binary fingerprints](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/upload-metrics-2026-09-04/verification.json), [hardware metrics](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/upload-metrics-2026-09-04/metrics-native.log), [software metrics](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/upload-metrics-2026-09-04/metrics-ci.log), [benchmark totals](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/upload-metrics-2026-09-04/benchmark-summary.log), [queue gate](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/upload-metrics-2026-09-04/queue-ci.log), [retention](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/upload-metrics-2026-09-04/retention.log), [recovery](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/upload-metrics-2026-09-04/failed-idle.log), [shader failure before](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/upload-metrics-2026-09-04/shader-before.log), [shader failure after](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/upload-metrics-2026-09-04/shader-after.log).
