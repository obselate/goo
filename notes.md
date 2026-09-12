Final release review: [API, shader quality, cleanup, and deferred fault-path work](docs/perf/final-release-review-2026-09-05.md).

Release preparation: [Goo 0.5.0](docs/perf/release-0.5.0-preparation.md). Local correctness checks pass. Tagging awaits fresh macOS native artifacts and the complete hosted package pipeline on the candidate commit.

Current follow-up: [sampled-image and liquid-glass alpha fixes, dense-path optimization, glass GPU measurements, and in-app drag/drop](docs/perf/non-uat-followup-2026-09-05.md). Implementation, correctness checks, and all 63 validation-off GPU timing runs are complete. Subjective shader UAT and native platform drag/drop remain deferred. Earlier [effect replacement, hit fixtures, teardown cleanup, and style-comparison work](docs/perf/post-checkpoint-2026-09-05.md) remain preserved.

Current triage: [verified claims, disposition, evidence, and implementation order](docs/perf/notes-triage.md), 2026-09-05.

Latest measurements: [cold/warm Blob cost table with Managed/RSS/PSS and GPU, 35 timing runs](docs/perf/blob-cost-table-2026-09-05.md), plus the [full three-mode matrix, 63 timing runs](docs/perf/all-blobs-2026-09-05.md), 2026-09-05.

Completed: [shader-effect recovery and retained-resource verification](docs/perf/shader-effect-recovery-2026-09-05.md), queue-wake CI gate, Shape path identity fast path, [primitive upload metric correction](docs/perf/primitive-upload-metrics.md), [shader pipeline byte identity](docs/perf/pipeline-identity.md), [shared graphics timeline completion](docs/perf/timeline-completion.md), and the 24-run pre-push broad A/C comparison of the combined pipeline, timeline, and layer-LRU package. The broad results contain mixed small frame-time changes and support no general speed claim. Pipeline identity remains accepted for capacity and native-object reduction; the shared timeline remains accepted for FIFO completion, lifetime, and resource reuse. The [direct primitive upload experiment](docs/perf/primitive-direct-upload.md) was rejected after every pre-push pair showed a gross regression and was removed, leaving staged upload as the sole retained path. The [compare-before-write experiment](docs/perf/primitive-compare-before-write.md) also remains rejected. The shader and input follow-up is tracked above. Physical-Mac qualification is explicitly deferred because the user has no Mac. See the [pre-push report](docs/perf/pre-push-2026-09-05.md). Helper/DSL and cosmetic duplication work are deferred. The historical measurements and detailed proposals below are retained for context; their numbering is not the implementation order.

1. Sparse retained Blob optimization follow-ups from the 1,000-Cell Linux Vulkan benchmark:
  - Image (optimized): warm 1.583 ms P50, 2.429 ms P99, and 1,120 B/frame. Cold is 3.691 ms P50 and 10.171 ms P99 over the first two frames. Per-frame source reuse and exact retained-image damage reduced warm P50 by 89.5% from 15.061 ms.
  - Shape (poor): 1.492 ms P50, 1.914 ms P99, and 1,283,888 B/frame. CPU is acceptable, but transient allocation is severely unoptimized.
  - Fixed repeated-source lookup 2026-09-04: an identity fast path reduces the fresh sparse probe from 1,282,032 to 2,032 B/frame (99.84%). Paired CPU P50/P99: 1.143/2.446 ms before, 0.892/1.284 ms after. Identity allocation, collision, mutable revision and native vector gates pass. Residual command boxing remains in reconciliation of the one changed Shape. See the triage report for evidence and workload limits.

2. SVG and Shape redesign, first implementation 2026-09-04: immutable `VectorAsset`/`VectorNode` documents now converge on one retained renderer for authored paths, compiled GCV1, and optional `Goo.Svg` runtime loading. Corrected cubic approximation, numerical path coverage, implicit fill closure, vector stroke alignment, and whole-document fitting. Vulkan readback verifies source parity, nested transforms, nonzero origins, 1x/1.5x/2x sizing, retained resize cleanup, transform animation, and path morphs. This does not establish an allocation or frame-time improvement for item 1.

3. Diskfrisk shader-data authoring: no generic typed-helper work. The proposed wrappers save little code and do not solve the actual full-buffer publication cost. Revisit only if range publication becomes a measured Goo bottleneck.

4. Platform order: physical-Mac qualification is deferred because the user has no Mac. The historical target order starts with macOS through MoltenVK, including Vulkan portability enumeration, portability_subset, osx-arm64
  assets, Apple font resolution, signing, and physical-Mac qualification. Android follows with net10.0-android and real
  Adreno/Mali testing at Vulkan 1.3/API 33 with runtime checks. Do not add a Vulkan 1.1 compatibility tier. MoltenVK remains
  the macOS default. Evaluate KosmicKrisp only if real hardware proves a concrete correctness or performance gain. iOS
  follows the macOS MoltenVK proof using net10.0-ios NativeAOT. WASM is a separate browser host and WebGPU renderer,
  not Vulkan.

5. Cross-language API: keep reusable authoring helpers CLR-visible and keep G#-erased syntax sugar thin. Angel D. Muñoz's
  independent Gopi proof uses Goo 0.4.0 directly from F# and needs only small `Children` extension members. Evaluate a
  `Goo.FSharp` child-builder or small DSL after the core API cleanup. Keep `Cell.Build()` public. Keep `Anim<T>` CLR-visible
  and sealed because Goo exposes no inheritance contract for it.

6. Goo-only simplification audit, 2026-09-03. Scope is `Goo/` plus in-repo tests, tools, apps, and templates. External consumer compatibility is intentionally not a constraint. Medium entries are ordered by expected value and urgency. Each entry is a potential task, not an approved design.
  - [Medium][duplication][high risk] Consolidate image and buffer allocation setup in `Goo/Rendering/Vulkan/VulkanMemory.Operations.gs:6-66` only if the shared path preserves resource-specific bind structures, handles, rollback, placement, tracking, and completion behavior.
  - [Medium][duplication][high risk] Share only byte-copy plumbing between glyph and paint-glyph encoding in `Goo/Rendering/Vulkan/VulkanTextNative.Font.gs:232-336`. Preserve their distinct native calls, palette handling, zero-length rules, status types, result payloads, and ABI widths.
  - [Low][API reduction] Replace `TextPresentationLayer.Remove`, `RemoveStyle`, `RemoveProjection`, and the setter family with coherent typed keyed views. `layer.Styles[key] = nil` and `layer.Projections[key] = nil` should remove only from their respective namespace, while non-nil assignment performs add or update. Do not add `nil` to a setter whose remaining range or payload arguments become meaningless during removal.
  - [Done 2026-09-04][duplication] Centralized version wrapping, finite checks, and conservative-bounds union in `VulkanSceneMath.gs` and routed the scene compiler, damage journal, shader data, and debug overlay through it.

7. Text cold startup (marginal): retained proof/resource deduplication and compatible text-run batching reduced the reproduced cold worst allocation from 1,206,496 B to 471,648 B and collapse 1,000 compatible text segments to one text draw. Five-process cold lower/worst bounds improved from 17.838/23.360 ms to 14.444/19.843 ms, but first-visible-slot setup can still exceed 16.67 ms. Warm simple-text sparse performance is 0.792 ms P50, 1.627 ms P99, and 1,392 B/frame.

8. Vulkan API recommendations derived from Arseny Kapoulkine's Vulkan API design talk, researched and verified against Goo commit `5fcb375` and the Vulkan specification on 2026-09-03. This section preserves the historical implementation proposal. Phases 1 and 2 were accepted, phase 3 was tested and removed, and phase 4 remains deferred.
  - Selection rationale: these four changes address concrete Goo code paths without requiring a renderer rewrite. Timeline semaphores replace duplicated submission-completion fences and provide one real completion watermark. SPIR-V identity deduplicates expensive pipelines currently keyed by object identity. Direct primitive upload tests removal of an actual staging copy and transfer barrier on supported memory. Generated typed wrappers improve shader authoring without freezing a new renderer-wide descriptor API. Buffer device address, descriptor heaps, and unified pipeline layouts do not have comparable evidence or platform coverage in Goo today.
  - Compatibility summary: phases 1 through 3 are internal Vulkan implementation changes and must not change the public Goo API. Phase 4 is additive and optional. Existing `ShaderEffect.SetParameter`, `ShaderEffect.SetData`, schema-1 effect bundles, WSI acquire semaphores, WSI render-complete semaphores, present fences, readback behavior, device-loss behavior, pixels, layout, hit testing, and accessibility remain supported. No accepted phase intentionally removes user-visible functionality.
  - Performance summary: the 24-run broad A/C comparison of the combined pipeline, timeline, and layer-LRU package produced mixed small frame-time changes, so it supports no broad speed claim. Pipeline dedup is retained for duplicate-pipeline capacity and native-object reduction. Timeline completion and LRU reuse are retained for completion, lifetime, and resource behavior. Direct mapped primitive storage removed copies and barriers in the experiment, but every measured pre-push pair regressed grossly; it was removed and staged upload is the sole retained path. Typed wrappers are an authoring improvement and are not expected to alter rendering performance. See the [pre-push report](docs/perf/pre-push-2026-09-05.md).

  - Phase 1, shared graphics-queue timeline completion:
    - Add `VkSemaphoreType`, `VkSemaphoreWaitFlags`, `VkSemaphoreTypeCreateInfo`, `VkSemaphoreWaitInfo`, `VK_SEMAPHORE_TYPE_TIMELINE`, `VK_STRUCTURE_TYPE_SEMAPHORE_TYPE_CREATE_INFO`, and `VK_STRUCTURE_TYPE_SEMAPHORE_WAIT_INFO` to `tools/Goo.VulkanGen/input/registry-manifest.json` and `tools/Goo.VulkanGen/Program.cs`. Add `vkGetSemaphoreCounterValue` and `vkWaitSemaphores` to the expected device commands. Regenerate `Goo/Rendering/Vulkan/Vulkan.Abi.Types.gs`, `Vulkan.Abi.Constants.gs`, `Vulkan.Abi.Structs.Device.gs`, `Vulkan.Abi.Dispatch.gs`, and `tests/Goo.VulkanProof/Generated/Vulkan.Generated.gs`. Do not hand-edit generated ABI output.
    - Add a shared timeline semaphore, its object accounting, and a completed-value query to `Goo/Rendering/Vulkan/VulkanSharedRuntime.gs`. Create it by chaining `VkSemaphoreTypeCreateInfo` through `VkSemaphoreCreateInfo.pNext` with type `VK_SEMAPHORE_TYPE_TIMELINE` and initial value zero.
    - Replace `ReserveGraphicsSubmissionSerial()` as an independently callable counter with one operation that serializes serial reservation through queue enqueue. The current window path in `VulkanWindowTarget.Core.gs` and readback path in `VulkanAsyncReadback.gs` can reserve from different callers before either mailbox is enqueued. Timeline signal values must follow the graphics queue's actual FIFO submission order.
    - Extend `VulkanQueueMailbox` in `VulkanQueueWorker.Types.gs` so every graphics submit signals the shared timeline semaphore with its assigned serial. Window submits continue to wait on the binary acquire semaphore and signal the binary render-complete semaphore. Offscreen submits signal the same timeline without adding WSI semaphores.
    - Change the submission shape to include the timeline signal and stop passing a completion fence:

      ```gsharp
      var timelineSignal = VkSemaphoreSubmitInfo{
        sType: VkConstants.VK_STRUCTURE_TYPE_SEMAPHORE_SUBMIT_INFO,
        semaphore: graphicsTimeline,
        value: submissionSerial,
        stageMask: VkConstants.VK_PIPELINE_STAGE_2_ALL_COMMANDS_BIT,
      }
      submitResult = queueSubmit(queue, 1u, &submitInfo, 0uL)
      ```

      The real implementation must build a contiguous signal array when a window submit also signals its binary render-complete semaphore.
    - Remove the native `submissionFence` lifecycle from `Goo/Rendering/Vulkan/VulkanFrameSlot.gs` and the native `completionFence` lifecycle from `Goo/Rendering/Vulkan/VulkanOffscreenTarget.gs`. Replace slot/offscreen status and wait operations with `vkGetSemaphoreCounterValue` and `vkWaitSemaphores` against their recorded timeline serial. Keep `pendingPresentFence` and all swapchain present-fence handling in `VulkanWindowTarget.Core.gs` and `VulkanPresentationRetirement.gs`.
    - Replace `VulkanFrameSlotRing.CompletedGlobalSubmissionSerial()`, which currently takes the maximum of submitted and completed slot serials, with the actual timeline counter value. Feed that watermark to primitive, text, image, path, clip, layer, and presentation retirement.
    - Expected API effect: none. Required Vulkan capability is already core in Vulkan 1.2 and Goo targets Vulkan 1.3. The risk is internal ordering, timeout, close, recovery, and multi-window correctness, not feature loss.

  - Phase 2, byte-identity shader pipeline deduplication:
    - In `Goo/Rendering/ShaderEffectProgram.gs`, compute and retain SHA-256 for the selected Vulkan SPIR-V artifact once during construction. Keep `ProgramId` unchanged because scene identity and mutation tracking must remain per program object.
    - In `Goo/Rendering/Vulkan/VulkanSharedPrimitiveState.gs`, change `VulkanShaderEffectPipelineEntry` from a `ProgramId` key to a digest plus exact SPIR-V bytes plus `VkPipeline`. Under `pipelineGate`, match the digest first and then use an exact byte comparison before returning an existing pipeline. The exact comparison prevents a hash collision from aliasing different shaders.
    - Target cache shape:

      ```gsharp
      internal struct VulkanShaderEffectPipelineEntry {
        internal var Digest []uint8
        internal var Spirv []uint8
        internal var Pipeline VkPipeline
      }
      ```

    - `ResolveShaderEffectPipeline` must create and account for one pipeline only when no exact artifact match exists. Disposal must destroy each unique cached pipeline once. Do not add a second entry that aliases the same pipeline handle.
    - Do not modify the current public `ShaderEffectProgram`, `ShaderEffect`, `SetParameter`, or `SetData` contract. Two program objects with identical Vulkan bytes keep distinct `ProgramId` values while sharing only their internal pipeline object.
    - Expected API and functionality effect: none. Expected gain is lower shader-effect startup work and less pressure on the fixed 32-entry pipeline cache when applications load duplicate bundles. Hashing adds one construction-time CPU cost per program and no per-frame work.

  - Phase 3, historical primitive-only direct mapped upload experiment, rejected and removed after measurement:
    - Add a memory policy in `Goo/Rendering/Vulkan/VulkanMemoryPolicy.gs` that requires `DEVICE_LOCAL | HOST_VISIBLE` and prefers `HOST_COHERENT`. Do not silently weaken the required flags inside the allocator.
    - Add a nonthrowing, buffer-specific mapped allocation attempt in `Goo/Rendering/Vulkan/VulkanBufferFactory.gs` or the allocator boundary. An unavailable combined memory type is an expected capability miss and must select the current staged path. Allocation, bind, map, capacity, or device errors after a compatible type is selected remain real failures and must retain current rollback and object accounting.
    - Add explicit `Staged` and `Direct` modes to `VulkanPrimitiveFrameSlot` and `VulkanPrimitiveFrameData` in `Goo/Rendering/Vulkan/VulkanPrimitiveFrameData.gs`. In direct mode, create one mapped storage buffer with `VK_BUFFER_USAGE_STORAGE_BUFFER_BIT`, write and flush dirty ranges against its allocation, bind it through the existing descriptor path, and skip staging-buffer creation.
    - Branch `RecordUpload` so direct mode does not record `vkCmdCopyBuffer` or the transfer-write to shader-read barrier:

      ```gsharp
      if slot.Mode == VulkanPrimitiveUploadMode.Staged && slot.PreparedRangeCount > 0 {
        copyBuffer(commandBuffer, slot.StagingBuffer, slot.Buffer,
          uint32(slot.PreparedRangeCount), &slot.PreparedRanges[0])
        VulkanTransitions.RecordBuffer(...)
      }
      ```

    - Do not add a host-write pipeline barrier. Vulkan queue submission performs the host-to-device domain operation for host writes flushed before `vkQueueSubmit2`. Non-coherent allocations still require `FlushBeforeSubmit` with the correct atom-aligned ranges.
    - Keep staged upload as the default. Add a deterministic override for forced staged and forced direct benchmark runs plus diagnostics for selected mode, bytes written, flushes, copies, barriers, and fallback reason. Do not extend the experiment to text, clip masks, paths, or images until primitive data shows a repeatable gain.
    - Expected API and functionality effect: none. Hardware without compatible memory behaves exactly as it does now. Performance can improve, remain neutral, or regress by memory architecture, so adoption requires real-GPU evidence rather than capability detection alone.

  - Phase 4, optional generated typed shader-effect wrappers:
    - Define sidecar metadata owned by the application or shader build tool, then generate app-local wrapper types with named fields and setters that delegate to the existing eight `Vector4` parameter slots and four `ShaderEffectData` slots. Keep raw slot APIs available.
    - Generated wrappers must not change schema-1 bundle bytes or the full 128-byte push-constant ABI. Goo currently exposes eight `Vector4` slots, not five, and built-in/effect shaders consume the existing primitive descriptor and push layout.
    - Expected API effect: additive app-local source only. Expected functionality loss: none. Expected performance effect: none beyond avoiding accidental redundant setter calls if generated setters retain existing equality behavior.

  - Explicitly deferred recommendations:
    - Buffer device address: it would remove only a primitive descriptor currently bound once per layout and frame slot, while every built-in and effect shader would require ABI changes. The eight effect parameters already occupy the full 128-byte push-constant budget. There is no measured bottleneck that pays for this migration.
    - Descriptor heap or descriptor indexing redesign: Goo does not have the resource scale or bind churn evidence to justify it, and MoltenVK 1.4.2 does not provide the required uniform capability for the intended macOS path.
    - Unified pipeline layouts: current primitive, text, clip, image, path, and effect resource models are materially different. Unifying them would increase unused bindings and cross-pipeline coupling without a proven command-recording win. MoltenVK portability also blocks treating this as a universal simplification.

  - Historical execution proposal and verification gates; task selection and order are superseded by the current triage:
    - Use one Luna Max implementation agent per phase, in order. The primary agent gives each agent an exact baseline and file allowlist, reviews every changed line, verifies generated ABI drift, and rejects unverified deviations. Do not run multiple phases concurrently because phases 1 and 3 overlap submission and frame-retirement code.
    - Phase 1 gate: pinned `gsharp-authoring` verification, strict Release builds, Vulkan ABI generator byte stability, focused frame-slot/offscreen tests, queue-isolation, multi-window, readback, resize, close, timeout, and device-loss smokes, validation layers, and Vulkan object-accounting parity.
    - Phase 2 gate: focused program/effect tests for same object, separate objects with identical bytes, digest collision defense through exact comparison, different bytes, capacity, disposal, recovery, validation layers, object accounting, and pixel parity.
    - Phase 3 gate: forced staged/direct/fallback tests, non-coherent flush coverage, capacity growth and retirement, validation layers, object accounting, and pixel parity. The experiment passed its correctness gates, then failed its pre-push adoption criterion in every measured pair and was removed. Staged upload remains the sole retained path.
    - Phase 4 gate: generator determinism, generated-wrapper compilation, slot/range validation, raw API parity, unchanged bundle bytes, and an effect pixel smoke. It can be omitted without affecting phases 1 through 3.

Historical verification recheck 2026-09-05, now resolved by [native readback-target teardown and corrected test boundaries](docs/perf/shader-effect-recovery-2026-09-05.md): the final benchmark binary failed `GOO_SHADER_EFFECT_SMOKE=1` with Vulkan validation enabled, now earlier at `ShaderEffectSmoke.gs:174`: "ShaderEffect retained data frame created Vulkan resources". Validation errors and fatal counters are zero. The earlier stop prevents rechecking the historical recovery failure below. The allocation boundary included readback setup. Correcting it exposed native child objects abandoned during device-loss teardown, which are now destroyed before the device. [Current evidence](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/shader-notes-recheck-2026-09-05/verification.json).

Verification follow-up 2026-09-04: ShaderEffectSmoke rejects fatal recovery diagnostic -13/401 on both the pre-metrics source/binary and the current binary. Track separately from upload accounting. Native metrics, retention, failed-idle recovery and queue-wake checks pass.
