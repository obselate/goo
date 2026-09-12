# Shared graphics timeline completion

**Retained for production.** The implementation uses one
Vulkan timeline semaphore for graphics completion within each shared runtime generation.
Window and offscreen submissions use the same accepted FIFO serial sequence, and resource
retirement reads the device's actual completed timeline value.

## Design

`VulkanQueueWorker.EnqueueSubmit` assigns a candidate serial, invokes the target's
pre-submit validation delegate, records the timeline and serial in the mailbox, advances
the sequence, and appends the mailbox to the FIFO while holding the worker gate. A
deferred or rejected enqueue consumes no serial. A validation exception cancels the
mailbox and also leaves the sequence unchanged.

Window and offscreen targets allocate and retain their validation delegates during
construction. Submission therefore does not create a callback for each frame. Validation
runs before the worker can execute the native submit and records the accepted serial into
the target's prepared resource state.

Each `VulkanSharedRuntime` generation owns one timeline semaphore and its queue worker.
Every accepted graphics submit signals that timeline with its assigned serial. Frame slots
and offscreen readbacks retain the serial associated with their submitted work. They no
longer allocate or wait on graphics-completion fences. Polling and bounded waits query or
wait for the recorded serial through `vkGetSemaphoreCounterValue` and
`vkWaitSemaphores`.

The actual GPU counter is the completion watermark used by image, path, text, primitive,
clip, layer, and other serial-retired resources. Recovery destroys the old runtime
generation and its timeline, then creates a new generation with its own completion state.

GPU timestamp collection follows the same contract. Timestamp stage state records the
actual global completion serial separately from the diagnostic trace's fence field, which
is zero because graphics completion fences were removed. Query-slot reads and query-pool
destruction poll the retained runtime lease for the required timeline value before reading
or destroying pending query state. Recovery testing exposed the remaining old-fence
dependency in this collector and drove this migration.

## Preserved synchronization

Timeline completion does not replace CPU queue-mailbox reconciliation. Targets still
consume worker submit results before they mark prepared resources submitted or expose
readback completion. Queue wake behavior remains required so submit and present results
reach their owning target.

Window-system synchronization also remains separate. Swapchain image acquisition and
render-complete signaling continue to use binary semaphores. Presentation retirement
continues to use presentation fences when the maintenance path supports them. These
objects serve WSI and CPU lifecycle contracts that the graphics timeline does not cover.

## Previous completion helper

The removed frame-ring helper returned the maximum serial visible in its slots, including
submitted and last-completed values. That implementation was ambiguous as a completion
watermark, but it was not by itself proof of an early resource free. Proving that defect
would require a retirement call to consume the value while eligible resources were still
in use. The migration removes the ambiguity by taking retirement progress directly from
the Vulkan timeline counter.

## Layer-pool contention finding

A simultaneous baseline/candidate timestamp workload exposed layer-target churn after the
timeline began reporting the actual completion watermark. The candidate failed at sample
1,764 with 12 native object allocations and 6 layer-target creations after warmup. The
pool grew from 6 to 12 targets while device-memory allocation count stayed unchanged. The
saved pre-timeline baseline passed the same simultaneous workload.

The actual watermark made more targets eligible sooner. First-fit acquisition then kept
selecting the same completed target set. Other warm targets crossed the existing idle
retirement threshold and were destroyed, then had to be recreated when two in-flight
frames needed them again.

The bounded correction selects the oldest eligible matching target. Same-command reuse
within the current frame retains first priority, and deterministic index order breaks
ties. Completion eligibility, the two-serial idle threshold, memory-pressure retirement,
and pressure-failure policy remain unchanged. This rotates the existing warm targets
instead of starving part of the pool.

The corrected candidate completed one isolated 2,000-frame timestamp run and three
concurrent candidate/baseline pairs. Every process exited zero, and every candidate run
kept the unchanged-workload assertion of zero warm native allocations.

## Focused verification

The native `GOO_TIMELINE_COMPLETION_SMOKE=1` route, with
`GOO_VK_DIAGNOSTICS=1`, covers validation rollback, deferred enqueue, shared window and
offscreen FIFO serials, held-work poll and zero-time wait behavior, CPU mailbox
reconciliation, offscreen pixels, and clean multi-window shutdown. The existing queue-wake
and recovery lanes remain separate regression gates.

The final source passes native and lavapipe timeline completion, full readback, pipeline
identity, primitive metrics, retention, live pacing, queue isolation, and software queue
wake. Queue wake retains its submit, present, independent frame-deadline, and blocking-wait
checks. Normal and maintenance-disabled FailedIdle recovery both resolve stage timestamps
and close with zero native objects and layer residents. The API suite passes 12/12, the ABI
smoke passes, both final smoke projects build with zero warnings and errors, strict lint
passes, and the CI YAML parses. Final runtime logs contain no Vulkan validation errors.

The ABI source is generated from the pinned local Vulkan registry. The curated production
declarations mechanically match that generated output.

## Known unrelated failure

`GOO_OFFSCREEN_FAILURE_SMOKE=1` terminates in `SdlHost.SetCursor` with an
`ObjectDisposedException`. The same failure and exit status reproduce against the saved
pre-timeline baseline and the candidate. The timeline work did not modify this path, but
the gate is not green and is excluded from completion claims for this change.

## Performance scope

This change has no frame-time or FPS claim. It removes per-submission graphics-completion
fences from window slots and offscreen targets and replaces their completion checks with a
shared timeline counter. The contention workload is a focused allocation and lifetime
regression check, not a speed benchmark. The completed [pre-push comparison](pre-push-2026-09-05.md)
measured the combined pipeline-identity, timeline, timestamp, and layer-pool changes
against the frozen pre-pipeline baseline. Six alternating-order pairs per workload
showed mixed frame-time changes, with no general speed claim. Image-effects native
object allocations fell from a median 6,560 to 5,346 per 2,000 measured frames.
The experiment does not isolate timeline semaphore cost. Staged primitive upload
remains retained after the direct-upload experiment was rejected and removed.

## Evidence

- [ABI parity](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/timeline-completion-2026-09-04/logs/abi-parity.log),
  [generator drift check](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/timeline-completion-2026-09-04/logs/generator-check.log), and
  [generated proof parity](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/timeline-completion-2026-09-04/generated-proof-parity.json).
- [Mechanical ABI mirror](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/timeline-completion-2026-09-04/scripts/mirror_timeline_abi.py)
  and [parity validator](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/timeline-completion-2026-09-04/scripts/validate_timeline_abi.py).
- [Verification manifest](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/timeline-completion-2026-09-04/verification.json),
  [final native results](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/timeline-completion-2026-09-04/logs/final-native-results.json),
  [final root-observed results](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/timeline-completion-2026-09-04/logs/root-final-results.json),
  and [final LRU results](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/timeline-completion-2026-09-04/logs/timestamp-lru-results.json).
- [Candidate offscreen-failure log](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/timeline-completion-2026-09-04/logs/offscreen-failure.log.gz)
  and [pre-timeline baseline reproduction](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/timeline-completion-2026-09-04/logs/offscreen-failure-baseline.log.gz).
- [Candidate timestamp contention](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/timeline-completion-2026-09-04/logs/timestamp-contention-1-candidate.log.gz),
  [simultaneous pre-timeline baseline](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/timeline-completion-2026-09-04/logs/timestamp-contention-1-baseline.log.gz),
  and [bounded layer LRU patch](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/timeline-completion-2026-09-04/scripts/layer-lru.patch).
- [Native timeline](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/timeline-completion-2026-09-04/logs/timeline-lru-final.log),
  [full readback](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/timeline-completion-2026-09-04/logs/readback-lru-final.log),
  [pipeline identity](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/timeline-completion-2026-09-04/logs/pipeline-identity-lru-final.log),
  [primitive metrics](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/timeline-completion-2026-09-04/logs/metrics-lru-final.log.gz), and
  [retention](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/timeline-completion-2026-09-04/logs/retention-lru-final.log).
- [Live pacing](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/timeline-completion-2026-09-04/logs/live-pacing-lru-final.log.gz),
  [queue isolation](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/timeline-completion-2026-09-04/logs/queue-isolation-lru-final.log),
  [software queue wake](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/timeline-completion-2026-09-04/logs/queue-wake-lru-final.log), and
  [local CI-wrapper timeline](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/timeline-completion-2026-09-04/logs/ci-lru-final.log).
- [Normal recovery](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/timeline-completion-2026-09-04/logs/recovery-lru-final.log),
  [maintenance-disabled recovery](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/timeline-completion-2026-09-04/logs/recovery-compat-lru-final.log),
  [Async build](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/timeline-completion-2026-09-04/logs/async-lru-final-build.log), and
  [recovery build](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/timeline-completion-2026-09-04/logs/recovery-lru-build.log).
- [API checks](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/timeline-completion-2026-09-04/logs/api-lru-final.log),
  [ABI smoke](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/timeline-completion-2026-09-04/logs/abi-smoke.log), and
  [strict lint](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/timeline-completion-2026-09-04/logs/lint-lru-final.log).
