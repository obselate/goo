# Direct primitive upload experiment

**Rejected and removed.** The direct mapped primitive upload experiment caused a gross
frame-time regression in every paired pre-push measurement. Goo retains the staged
primitive upload path. `GOO_PRIMITIVE_UPLOAD_MODE` is no longer available, and the
direct-mode production code, focused test, benchmark fields, and CI route were removed.

## Decision

The confirmation used four alternating-order staged/direct pairs for each of the
unchanged, sparse, and full workloads. Each run used 300 warmup frames and 500 measured
frames, for 24 runs total. All runs used the same frozen candidate runtime, and the
direct lane reported a real direct selection without fallback.

Median run P50 rose from 1.188 ms staged to 21.979 ms direct for unchanged frames, from
1.304 ms to 22.199 ms for sparse frames, and from 2.857 ms to 40.467 ms for full frames.
Median run P99 rose from 1.968 ms to 25.462 ms, from 2.318 ms to 25.587 ms, and from
4.013 ms to 46.007 ms respectively. Managed allocation did not materially improve.

| Workload | Pair | P50 direct vs staged | P95 direct vs staged | P99 direct vs staged |
| --- | ---: | ---: | ---: | ---: |
| Full | 1 | +1317.499% | +1160.767% | +1035.439% |
| Full | 2 | +1282.430% | +948.154% | +857.374% |
| Full | 3 | +1314.275% | +1100.738% | +1071.931% |
| Full | 4 | +1337.230% | +1298.362% | +1166.414% |
| Sparse | 1 | +1616.933% | +1194.186% | +920.401% |
| Sparse | 2 | +1595.767% | +1124.052% | +1071.908% |
| Sparse | 3 | +1606.683% | +1390.407% | +1178.247% |
| Sparse | 4 | +1584.269% | +1125.217% | +979.559% |
| Unchanged | 1 | +1792.111% | +1649.195% | +1455.639% |
| Unchanged | 2 | +1767.841% | +1355.377% | +1213.290% |
| Unchanged | 3 | +1666.065% | +1366.207% | +1175.111% |
| Unchanged | 4 | +1733.430% | +1354.127% | +1045.665% |

The RTX 3080 desktop had broad concurrent desktop GPU load. Alternating the lane order
gave both paths exposure to that load, but the measurements do not isolate it. The
selected direct memory was host-coherent and not host-cached. A plausible explanation
is that the encoder's host writes and subsequent history comparisons paid a high cost
when accessing that GPU-visible memory. This is an inference, not a measured cause;
hardware counters and profiling were not needed to reject the repeated order-of-magnitude slowdown.

No physical Mac was available. The performance conclusion is based on the Linux NVIDIA
lane. Since the experiment was rejected and removed, macOS qualification was not a
prerequisite for the rollback.

The exact archived task patch was reversed after all 13 experiment paths matched their
recorded candidate hashes. After reversal, the 12 modified files matched their recorded
pre-experiment hashes and the newly added direct smoke was absent. This preserved the
earlier pipeline-identity, shared-timeline, queue-wake, and primitive-metrics work.

See the [final pre-push report](pre-push-2026-09-05.md), the
[paired confirmation analysis](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/pre-push-2026-09-05/results/direct-confirmation/analysis.md),
and the [machine-readable rollback proof](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/pre-push-2026-09-05/rollback-proof.json).

## Historical design

The removed experiment accepted `GOO_PRIMITIVE_UPLOAD_MODE=direct` to request direct
upload and `GOO_PRIMITIVE_UPLOAD_MODE=staged` to force the existing path. An unset
variable selected staged mode, and any other value was rejected.

Direct mode mapped the storage buffer itself. Primitive records and shader-effect data
were written into that allocation. Command recording omitted the staging-buffer copy and
its transfer-to-shader barrier. The slot remained protected by its actual completed
graphics timeline serial, so the host could not modify a buffer still consumed by the
GPU.

The allocator tested the memory requirements of the exact storage buffer for a type with
`DEVICE_LOCAL` and `HOST_VISIBLE`. `HOST_COHERENT` was preferred. If no compatible type
existed, the requested direct path reported a capability fallback and used staged upload.
Buffer creation, capacity, allocation, binding, mapping, and device failures remained
errors after a compatible type was selected.

Host-coherent direct allocations required no explicit flush. A noncoherent direct
allocation flushed every byte written by the host, aligned through the allocator to
`nonCoherentAtomSize`. The encoder wrote every active 128-byte primitive record before
comparing the candidate with retained history. A noncoherent direct frame therefore
flushed the full written record span, plus the effect-data range when written.

No host-write pipeline barrier was recorded. Vulkan queue submission made host writes
that happened before submission available to device accesses. Noncoherent memory still
required `vkFlushMappedMemoryRanges` before submission. The allocator's atom-aligned
placements kept an aligned flush from overlapping another live suballocation.

## Historical abort and lifetime contract

Preparing a direct frame changed the mapped device buffer before queue admission. A
rejected candidate still had no GPU consumer: preparation waited for prior use of that
slot to complete, and the rejected command buffer never reached native submission.
Previously presented image contents were independent of the primitive buffer.

Direct abort did not restore old bytes. It invalidated the slot's retained history. The
next prepare performed a full record write, including the zero-record sentinel, and
rewrote shader-effect data even when its version was unchanged. This covered record-count
shrink or growth and effect-tail relocation.

## Historical metrics

Requested mode, selected mode, and capability fallback were reported separately. In
direct mode, `PlannedTransferBytes`, `SubmittedTransferBytes`, recorded copy commands,
recorded transfer barriers, and `UploadRangeCount` were zero. `CpuWrittenBytes`,
`CpuWriteOperations`, `CpuComparedBytes`, and `DirtyRecordCount` retained their existing
meanings.

`FlushRequests`, `NativeFlushCalls`, and `RequestedFlushBytes` described mapped-memory
publication requests. A coherent direct allocation could report requested bytes with no
native flush. `HistoryCopiedBytes` measured accepted candidate data copied into CPU
history. An aborted candidate did not count as submitted transfer or accepted history.

These direct-mode fields and counters were removed with the experiment. The staged
metrics that existed before the experiment remain.

## Historical correctness verification

Before performance qualification, the focused native and lavapipe direct gates passed.
They covered forced staged mode, selected direct mode where hardware supported it,
exact-buffer capability rejection, staged fallback where the device exposed a usable
fallback type, sparse and full logical changes, dynamic growth, count shrink, the zero
sentinel, same-version effect data after abort, pixels, mode-specific counters, and
balanced buffer and memory lifetimes.

The deterministic noncoherent phase flushed a 512-byte aligned record prefix and checked
full logical write coverage plus the native flush branch through the existing allocator.
It was an emulation, not evidence that direct mode ran on real noncoherent hardware. The
NVIDIA lane covered full fallback. Lavapipe exposed only the combined device-local and
host-visible type, so it proved exact-buffer rejection but could not exercise the full
staged-fallback allocation under filtered properties.

Forced staged, forced direct, and maintenance-disabled direct recovery passed with
resolved stage timestamps and zero remaining native objects or residents. Default
primitive metrics, retention, and readback passed. Forced-direct readback, pipeline
identity, queue isolation, timeline completion, and live pacing also passed. The API
suite passed 12/12, builds completed without warnings or errors, strict lint and CI YAML
validation passed, and runtime logs contained no Vulkan validation errors.

Those results establish that the experiment was functionally correct before removal.
They do not offset the later performance rejection. The historical candidate, logs, and
exact patch remain archived under
[`evidence/primitive-direct-upload-2026-09-05`](https://github.com/obselate/goo/tree/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/primitive-direct-upload-2026-09-05).

## Historical evidence

- [Verification manifest](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/primitive-direct-upload-2026-09-05/verification.json),
  [source hashes](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/primitive-direct-upload-2026-09-05/source-hashes.json),
  [binary hashes](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/primitive-direct-upload-2026-09-05/binary-hashes.json), and
  [task patch](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/primitive-direct-upload-2026-09-05/task.patch).
- [Native direct gate](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/primitive-direct-upload-2026-09-05/direct-gate-final.log),
  [lavapipe gate](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/primitive-direct-upload-2026-09-05/direct-ci-final.log),
  [native lane results](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/primitive-direct-upload-2026-09-05/native-results.json),
  and [direct readback](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/primitive-direct-upload-2026-09-05/direct-readback.log).
- [Forced staged recovery](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/primitive-direct-upload-2026-09-05/recovery-staged-final.log),
  [forced direct recovery](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/primitive-direct-upload-2026-09-05/recovery-direct-final.log),
  [maintenance-disabled direct recovery](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/primitive-direct-upload-2026-09-05/recovery-direct-compat.log),
  [API checks](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/primitive-direct-upload-2026-09-05/api-build.log),
  [final candidate build](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/primitive-direct-upload-2026-09-05/async-build-final.log),
  and [skill verification](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/primitive-direct-upload-2026-09-05/skill-verify.log).

## Vulkan references

- [Vulkan synchronization specification: host write ordering guarantees](https://docs.vulkan.org/spec/latest/chapters/synchronization.html#synchronization-submission-host-writes)
- [Vulkan synchronization specification: availability, visibility, and domain operations](https://docs.vulkan.org/spec/latest/chapters/synchronization.html#synchronization-memory-barriers)
- [Vulkan Guide synchronization examples: direct mapped buffer upload](https://docs.vulkan.org/guide/latest/synchronization_examples.html#examples-transfer)
- [Vulkan Guide: memory allocation](https://docs.vulkan.org/guide/latest/memory_allocation.html)
