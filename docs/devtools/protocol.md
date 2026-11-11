# Diagnostics and profiling

Use the [DevTools guide](README.md) for launch and target selection. Use `goo help attach` for raw requests when a capability has no MCP tool.

## Capture and snapshot semantics

- A capture with `degraded: true` rendered offscreen layers at lower resolution under GPU pressure. `layerResolutionShift` is the power-of-two reduction. Text and icons in those layers are upscaled.
- Opaque targets remain valid while their node stays mounted in the same window and diagnostic session. Remount or process restart invalidates them. Numeric IDs are window-local.
- Editors expose UTF-16 selection and caret offsets. `text` is capped at 16,384 UTF-16 units with `textLength` and `textTruncated`. A truncated prefix cannot prove equality or absence in the unseen suffix. Password values are masked.
- `borderBox` is the transformed layout bound. `clipBox` is its conservative visible intersection. `visible` does not prove the node is unobscured. `clipApproximate` marks geometry that an axis-aligned rectangle cannot represent exactly.
- `actionPoint` and `actionable` require a point verified by current input routing. A visible node may still be disabled, clipped, blocked, detached or not hit-testable.

Diagnostic text events send committed UTF-16 text, at most 16,384 units, to a focused editor. They do not simulate IME composition. Native input may interleave, so use a dedicated test window. Coordinates and deltas must be finite and within ±10,000,000. Requests are limited to 65,536 characters and 32 pending UI requests. Use fresh snapshots after actions.

## Profiler recording

The `profiler.trace.v1` capability provides `profiler.start`, `profiler.read` and `profiler.stop`. One persistent client owns the recorder for the process, including all windows and shared resources. Disconnect releases ownership. Use the graphical inspector to record, or keep a `goo attach` connection open for raw requests.

| Request | Contract |
| --- | --- |
| `profiler.start` | `bufferBytes` is clamped to 64 KiB through 16 MiB. Returns schema 1, trace identity, clock origin/frequency, sampling settings and device/name metadata. A competing recorder returns `state: "Busy"`. |
| `profiler.read` | Send `traceId`, string `afterSeq` and bounded `maxBytes`. Read ordered records and `nextSeq`, `more`, `state`, `dropped`, `partial` and the empty-poll delay. Drain immediately only while `more` is true. |
| `profiler.stop` | Freezes producers and drains submitted GPU timing through normal completion polling. Continue reading through `Complete`. No queue-idle wait is added. |

CPU timestamps use integer ticks relative to the recording origin. GPU elapsed nanoseconds use a separate clock. Large integers and IDs are strings. Unavailable measurements are `null`, not zero.

Do not add allocator requirements, estimated swapchain payload, managed memory, RSS/PSS and driver usage. These counters have different accounts, sources and freshness.

### Allocation sampling

Set `allocationSeconds` on `profiler.start` to 2 through 60 seconds. NativeAOT apps must also enable runtime events:

```xml
<PropertyGroup>
  <EventSourceSupport>true</EventSourceSupport>
</PropertyGroup>
```

With events disabled, `allocation.samples` reports `validity: "unavailable"` and a null value. Some runtimes report counts without usable type names. `allocation.types` then reports unavailable, not a type named `NULL`. NativeAOT may lack names even with events enabled. Unavailable does not mean no allocations. Sample counts are not exact object counts.

### GPU timing

Accept `vulkan.timestamp.elapsed` only with `validity: "available"` and no omitted scopes. Match window, frame and submission IDs. Each stage records up to 64 scopes per frame. Unsupported queues or larger stages report unavailable timing.

| Stage | Work |
| --- | --- |
| `gpu.upload` | Image, path and glyph uploads and barriers |
| `gpu.main` | Main rendering, including nested layers and effects |
| `gpu.effects` | Backdrop copies, blur and composition |
| `gpu.offscreen` | Layer attachment loads, contents and stores |
| `gpu.frame` | Complete window command buffer |
| `gpu.clip` | Dirty clip-mask passes and barriers |
| `gpu.primitive-upload` | Primitive, text-instance and stroke uploads |

Stages overlap. Main includes Offscreen and Effects. Frame includes all stages and transitions. Never add overlapping times or subtract their percentiles.

Set `GOO_FRAME_PROFILE=1` to print capabilities and completed `[goo.profile.gpu]` stages with `elapsed_ns`, `stage`, `scopes` and `dropped`. No DevTools connection is needed.

### Resize timing

| CPU phase | Work |
| --- | --- |
| `NativeResize` | Apply native metrics and resize the target |
| `Swapchain` | Recreate the swapchain, including deferred attempts |
| `DeviceIdle` | `vkDeviceWaitIdle`, only when called |
| `ClipAtlas` | Replace a clip-atlas generation |
| `LayerCollect` | Collect offscreen layers with `discardCompleted` |
| `LayerCreate` | Create a layer image, view and descriptor |

Phases are inclusive. Do not add a parent to its children. The frame chart shows exclusive costs. With profiling off, these phases do not read clocks or allocate per-call profiling data.

## Trace files

The desktop export uses `goo.profiler/1` with Chrome `traceEvents`. Standard event times are microseconds. Exact IDs, clocks, metadata, completion, gaps and dropped counts remain in Goo records. Those records, not floating-point Chrome times, are authoritative for a Goo round trip. Generic Chrome imports retain their event arguments.

GPU durations are elapsed counters or unavailable instants, not CPU-aligned duration slices.
