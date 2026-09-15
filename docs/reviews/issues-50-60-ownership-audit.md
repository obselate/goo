# Ownership audit: Goo issues #50–#60

Audited 2026-09-15. Read-only architectural findings; no cleanup below has been applied.

## Scope and evidence

The eleven issue implementations authored on `codex/overlay-focus-review`, compared with `2f50290`: `b85307d` (#50), `58f3a92` (#51), `b181ffd` (#52), `0fce624` (#53), `121b67e` (#54), `5e0939f` (#55), `db7d377` (#56), `9678548` (#57), `248a970` (#58), `76e0284` (#59), and `a26866b` (#60). References identify the current reviewed checkout, based on `f3684d9`, including the subsequently integrated focus-scope support where it affects these responsibilities. The separately requested gallery fixes and new pointer-event property are outside this audit's findings.

Reviewed implementation state, callers, teardown, input/layout integration, public contracts, tests, packaging, generated API documentation, and the native-accessibility package README. Searched all Goo source for material copies and callers of the reported policies. This is not an audit of unrelated changes in the user's original checkout. No claim is made that any public API is unused or removable.

## 1. P1 — Generated API documentation has no reproducible source of truth

**Confidence: high; reproduced with the repository's generator.** Several issue guides were written directly into generated pages, while `tools/Goo.ApiDocs/Program.cs` was unchanged across the eleven issue implementations. For example, the click-count guide in [input.md:9](../api/input.md#L9) and measured-row guide in [tree.md:15](../api/tree.md#L15) have no equivalent in the generator's guide emitters. Regeneration removes that authored material. The new documented top-level `VirtualRows` function also reaches the generator's unmapped-member failure because the generator assigns XML members through discovered public types ([Program.cs:139](../../tools/Goo.ApiDocs/Program.cs#L139), [Program.cs:173](../../tools/Goo.ApiDocs/Program.cs#L173)).

Running `dotnet run --project tools/Goo.ApiDocs/Goo.ApiDocs.csproj -c Release` produced six changed API pages and threw `InvalidDataException: Unmapped Goo.xml members` for `M:Goo.VirtualRows``1(...)` at [Program.cs:64](../../tools/Goo.ApiDocs/Program.cs#L64). The destructive generated output was restored before continuing. A second run against the XML from the pre-feedback review package, directed into a temporary output directory, failed on the same member; see [baseline generation log](../../artifacts/review-followup-2026-09-15/baseline-docs-generation.log). The workflow runs this generator and then requires a clean docs diff ([ci.yml:58](../../.github/workflows/ci.yml#L58)); this breaks that CI step even though core and public API behavior tests pass. This finding concerns the existing issue documentation; the separately requested pointer property also needs to remain documented when the generator is repaired.

**Ideal boundary:** the API generator and its authored guide inputs own reproducible generated pages. Public XML source owns member descriptions; explicit source-owned guide text owns explanatory prose. Generated Markdown should not be a second editable source.

**Safe cleanup:** add an explicit owner/mapping for the top-level `VirtualRows` XML member and move the issue guide additions into the generator or a declared guide input. Preserve all current material while doing so. Generate into a temporary output directory until validation passes, then replace the output atomically; the current generator writes before rejecting unmapped members. Verify two successive generation runs produce identical output and a clean `git diff -- docs/api`. This audit leaves the generator unchanged.

## 2. P2 — Drop-target policy has two owners and already differs at focus boundaries

**Confidence: high for duplication and the source-level divergence.** The focus-scope case below is established by tracing control flow; it was not exercised against an external file manager during this audit.

`NativeDropRouter` repeats target availability, transformed coordinates, deepest accepting target lookup, enter/leave transitions, and callback-owner invalidation already implemented by `PointerInput`:

| Responsibility | Native file drop | In-process drag |
| --- | --- | --- |
| Availability | [NativeFileDrop.gs:107](../../Goo/Input/NativeFileDrop.gs#L107) | [PointerInput.DragDrop.gs:132](../../Goo/Input/PointerInput.DragDrop.gs#L132) |
| Hit path and acceptance query | [NativeFileDrop.gs:120](../../Goo/Input/NativeFileDrop.gs#L120) | [PointerInput.DragDrop.gs:154](../../Goo/Input/PointerInput.DragDrop.gs#L154) |
| Transform and event construction | [NativeFileDrop.gs:163](../../Goo/Input/NativeFileDrop.gs#L163) | [PointerInput.DragDrop.gs:136](../../Goo/Input/PointerInput.DragDrop.gs#L136) |
| Enter/leave transition | [NativeFileDrop.gs:141](../../Goo/Input/NativeFileDrop.gs#L141) | [PointerInput.DragDrop.gs:218](../../Goo/Input/PointerInput.DragDrop.gs#L218) |
| Callback invalidation | [NativeFileDrop.gs:177](../../Goo/Input/NativeFileDrop.gs#L177) | [PointerInput.DragDrop.gs:436](../../Goo/Input/PointerInput.DragDrop.gs#L436) |

The in-process route calls `chainDisabled` before any query; that guard rejects a hit path outside an active focus scope ([PointerInput.gs:988](../../Goo/Input/PointerInput.gs#L988)). The native route checks only `Disabled` before invoking `DropTarget.Query`, and checks `canReceiveInput` afterward ([NativeFileDrop.gs:123](../../Goo/Input/NativeFileDrop.gs#L123)). Hit-path construction does not itself enforce focus scopes ([Hit.gs:76](../../Goo/Input/Hit.gs#L76)). Consequently, a hit-tested target outside an active focus scope can receive a native acceptance query and owner rebuild even though it cannot receive enter/drop; an in-process drag suppresses that query. An occluding backdrop may hide this case, but is not required by the focus-scope contract. This difference arose when later focus-scope support was integrated with the duplicated routing.

**Ideal boundary:** one internal target-routing policy in `Goo/Input`, shared by both transports. It should own path eligibility, coordinate mapping, acceptance evaluation, and target callback invalidation. Each session should retain its own source, capture, cancellation generation, allowed effects, and platform lifetime. A native copy-only session has legitimate differences from an in-process source session.

**Safe cleanup:** first add a regression covering an acceptance query outside a focus scope. Extract the shared pre-query eligibility and target/event helpers, replace both implementations, then decide whether transition bookkeeping can be shared without obscuring reentrancy. Avoid merging the two complete session state machines. Verify transformed nested targets, disabled ancestors, focus scopes, copy negotiation, callback removal, cancellation during query, and exceptions for both transports.

## 3. P2 — Clipboard code owns transport-neutral file-path validation

**Confidence: high.** [ClipboardTransfer.gs:90](../../Goo/Platform/ClipboardTransfer.gs#L90) owns absolute-path/NUL validation, the 4,096-path and aggregate text budgets, collection insertion, and a clipboard-specific exception. Native chooser results and native drag ingress both call it:

- Clipboard URI parsing: [ClipboardTransfer.gs:85](../../Goo/Platform/ClipboardTransfer.gs#L85); Windows file extraction: [ClipboardTransfer.Windows.gs:47](../../Goo/Platform/ClipboardTransfer.Windows.gs#L47); macOS pasteboard extraction: [ClipboardTransfer.Mac.gs:67](../../Goo/Platform/ClipboardTransfer.Mac.gs#L67).
- Native chooser result copy: [NativeFileDialog.gs:193](../../Goo/Platform/NativeFileDialog.gs#L193), including a separate literal count limit; its result mapping catches `ClipboardLimitException` at [NativeFileDialog.gs:106](../../Goo/Platform/NativeFileDialog.gs#L106).
- Native drag ingress: [SdlHost.NativeDrop.gs:90](../../Goo/Platform/Sdl/SdlHost.NativeDrop.gs#L90); its UTF-8 budget also throws the clipboard exception at [SdlHost.NativeDrop.gs:111](../../Goo/Platform/Sdl/SdlHost.NativeDrop.gs#L111).

The dependency is observable: chooser errors can say “Clipboard paths” or “Clipboard file list” because the generic validation carries clipboard wording. A change to the shared clipboard limits also changes chooser/drop policy, while the chooser's literal limit can drift independently.

**Ideal boundary:** an internal native-file-path collector/validator in `Goo/Platform` owns shared path validity and budgets. Clipboard code owns MIME, URI-list, CF_HDROP and pasteboard decoding; the chooser owns SDL callback/result lifetime; native drop owns event sequence and path-copy lifetime. Each maps neutral validation failures into its public status/error contract.

**Safe cleanup:** move the existing validation and limits into that single helper, replace all callers, and remove the duplicated chooser count literal. Preserve bounded UTF-8 reads before managed string allocation. Keep format-specific URI parsing and bitmap/image limits in clipboard code. Verify absolute/NUL rejection, count and aggregate text boundaries, owned-result lifetime, and transport-appropriate error text through all three entry points.

## Other boundaries examined

| Issue | Assessment |
| --- | --- |
| #50 window constraints | Window owns validated logical constraints; native host applies them and initial creation replays them. No additional runtime ownership finding; generated documentation is covered by finding 1. |
| #51 ownership/modality | `WindowFamily` owns parent/child registration, blocking state, close ordering and focus restoration. Native host integration is required. |
| #52 clipboard | File-policy finding above; MIME decoding, native buffers and image normalization otherwise belong together. |
| #53 custom layout | `CustomLayoutState` owns callback lifetime, measured child state and Yoga integration. Reconciler/layout hooks maintain that contract rather than duplicate it. |
| #54 measured virtual rows | The unmapped XML member is covered by finding 1. Source/index metadata owns stable keys, measurement and scroll anchoring. General content-box helpers remain in the pre-existing `TextLayouts` owner; this extends older geometry ownership debt rather than introducing a second implementation. |
| #55 click counts | Pointer input owns per-contact sequencing; routed events and text selection consume it. No parallel text-only counter was introduced. |
| #56 native choosers | Shared file-policy finding above; the owner-thread completion queue, modal blocking and native callback lifetime have distinct jobs. |
| #57 native accessibility | The package intentionally supplies optional native payloads while the managed bridge compiles into Goo. Window/SDL lifecycle hooks are reachable integration, not orphaned packaging. AccessKit-specific Cocoa forwarding sits in an SDL partial; consider moving it into the bridge if another backend is added, but the current single-backend boundary does not justify a new public abstraction by itself. |
| #58 native file drop | Routing finding above; copied file ownership and native session lifetime remain transport-specific. |
| #59 DevTools input | Session owns permission/protocol parsing and teardown; commands enter the normal platform input path on the window thread. No separate widget-input implementation found. |
| #60 JPEG/static GIF | Generalized raster decoding remains behind existing image-source/cache ownership, with format validation before decoding. No new tree/render primitive required. |

## Prioritized follow-up

1. Repair API documentation ownership and mapping so generation and the existing CI docs check are reproducible. Preserve the authored issue guides.
2. Unify target eligibility before querying, with the focus-scope regression, then share the small target-routing operations. Keep all public drag contracts unchanged.
3. Move native path validity/budgets to a neutral owner and update all clipboard/chooser/drop callers together. Keep status enums and ownership guarantees unchanged.
4. Re-run focused behavior tests and full core/API checks after each change. Review native file-manager/chooser acceptance and existing allocation/input benchmarks before merging. Do not combine these changes with a broad accessibility or geometry reorganization.
