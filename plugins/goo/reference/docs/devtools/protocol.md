# Goo DevTools local protocol

The protocol is local, explicit, and versioned. Set `GOO_DEVTOOLS=1` to attach Goo diagnostics automatically when each window opens. `DevTools.Attach(window)` remains available for advanced manual control. A production window without the environment flag does not publish an endpoint descriptor.

## Descriptor

The runtime writes one UTF-8 JSON endpoint descriptor per window into the configured runtime directory. The file may be named `<pid>-<window>.json` or any `.json` name. The CLI accepts these fields:

```json
{
  "protocol": "goo.devtools/1",
  "pid": 12345,
  "process": "HelloGoo",
  "version": 1,
  "transport": "named-pipe",
  "pipe": "goo-12345-1",
  "createdUtc": "2026-08-29T12:00:00Z",
  "windows": [
    { "id": "window-12345-1", "title": "Hello Goo" }
  ]
}
```

`pipe` is a .NET named-pipe name or an absolute Unix-domain socket path. `pipeName`, `endpoint`, `socket`, `address`, `processId`, and `applicationName` are accepted aliases. Goo transport is local only. Network endpoints are rejected. The CLI ignores malformed descriptors and stale process IDs.

## Connection

Messages are one JSON object per UTF-8 line. The client sends this first:

```json
{
  "type": "hello",
  "protocol": "goo.devtools/1",
  "client": "goo-cli",
  "version": "0.6.0",
  "capabilities": ["tree", "properties", "layout", "events", "logs", "accessibility", "capture", "source-navigation", "hot-reload"]
}
```

Requests use a unique `id` and a command-specific payload:

```json
{
  "type": "request",
  "id": "a1b2c3",
  "command": "snapshot",
  "payload": {}
}
```

The response keeps the same `id`. Unsolicited tree, event, log, and hot-reload updates are JSON objects without a matching request ID. `goo attach --json` preserves every line for IDE or script consumers.

Use `goo list --json` for live process/window discovery. Its `window` IDs can be
passed to `--window` on attach, capture and input, including when titles match.
Pass `--project` throughout when using project-local descriptors. `attach --once`
bounds its connection and request with `--wait` and exits unsuccessfully for a
rejected response. Streaming attach remains open until disconnected.

One window accepts up to eight simultaneous clients. Each request is serialized
through the window UI queue. A client that sends no complete request or stops
reading a response is disconnected after 30 seconds, so an inspector or broken
client cannot block short-lived snapshot and capture clients. Interactive attach
uses request envelopes for plain command lines. On stdin EOF it drains responses
for sent request IDs up to `--wait`, then detaches. Use `--once` for one scripted
request.

Supported CLI requests are `snapshot`, `capture`, and the command supplied by `goo attach --command`. A capture response may first return `payload.pending: true`; repeat the `capture` request until it returns `pending: false` or the bounded CLI wait expires. The completed response uses `format: "rgba8-srgb-premultiplied"`, `width`, `height`, `stride`, and `rgbaBase64`. The CLI encodes this pixel payload as a real PNG. Legacy responses can contain `payload.contentBase64`, `payload.base64`, `payload.data`, or `payload.path`.

Clients must inspect the handshake capabilities before enabling optional panels. An older runtime may omit capabilities or close the connection for an unsupported request. The CLI treats that as a connection failure and reports the endpoint and command. The server hello includes its PID, window ID, and diagnostic session ID. The CLI rejects a hello whose PID or window does not match the selected descriptor.

Current runtimes advertise `inspect.enter`, `inspect.select`, `inspect.clear`, `inspect.exit`, `runtime-overrides`, and `runtime-overrides.describe`. The hello field `runtimeOverrideProperties` is the runtime-owned array of accepted temporary override property names. Clients must not substitute a local allowlist. A runtime without both override capabilities reports property discovery as unavailable.

Inspection commands change diagnostics state without input permission. Typed clients must supply `inspect.select` with exactly one selector: `target`, positive window-local `nodeId`, or a complete finite `x`/`y` pair. A numeric ID or point with no match returns `selected:false`; a stale or foreign opaque handle is an error. `inspect.enter` diverts pointer routing to selection until `inspect.exit`; `inspect.clear` clears only the current selection.

`property.override` requires exactly one `target` or positive `nodeId`, plus an advertised `property` and string `value`. Examples include `Width: "100px"`, `BackgroundColor: "#ff0000"`, and `Opacity: "0.5"`. Lengths accept `px` or `%`; `auto` is limited to width and height, and opacity is from 0 through 1. `property.reset` uses the same target and an optional property. Omitting property resets all temporary overrides on that node only. It does not reset input or other nodes. Overrides are diagnostics state and do not edit source. Inspection and style commands are rejected while an injected gesture is held.

For scripted mutations, `goo attach --once --require-capabilities NAME[,NAME]` checks the selected hello before request dispatch on the same connection. `--require-override-property NAME` also requires `runtime-overrides.describe` and a valid `runtimeOverrideProperties` list. Missing or malformed requirements fail with no request sent. After dispatch, timeout, invalid acknowledgement, or unexpected disconnect sets `mayHaveApplied:true`; inspect state and do not retry automatically.

## Snapshot identity and semantics

Each full snapshot includes `targetIdentity` with `pid`, `windowId`, and `sessionId`. Every node has an opaque `target` handle scoped to that identity. Prefer this handle for later pointer or wheel input. It remains stable while the node stays mounted, and is rejected after remount, window mismatch, or process restart. Numeric `id` and `parentId` remain available for inspector compatibility, but are only local to one window and must not be treated as cross-window identity.

Snapshot accessibility fields come from Goo's retained semantic tree without installing or replacing the application's accessibility adapter. They include resolved role, name, value, state, and the semantic `accessibilityId`. Editable controls expose their current value, UTF-16 selection, and caret. Editor `text` is capped at 16,384 UTF-16 units and accompanied by `textLength` and `textTruncated`; a truncated prefix cannot prove exact equality or absence in the unseen suffix. Password text and explicit password accessibility values are masked.

`borderBox` is the transformed layout bound. `clipBox` is its visible intersection with window, overflow, editor-content, and conservative path-clip bounds. `visible` means that conservative rectangle is nonempty, not that overlap analysis proved the node unobscured. `accessibilityHidden` separately identifies a node omitted from the semantic tree. `clipApproximate` reports geometry that cannot be represented exactly as an axis-aligned rectangle. `actionPoint` is present only when current routing verifies a point that reaches the node or its descendant. `actionable` is true only for that verified case. `actionStatus` is one of `actionable`, `window-blocked`, `hidden`, `disabled`, `detached`, `modal-blocked`, `clipped`, `not-hit-testable`, or `no-verified-point`. The last status means the bounded search did not prove a point, not that the node is fully occluded.

## Application input

Input is separately opt-in: launch with `goo dev --input --no-watch --project App.gsproj`, set both `GOO_DEVTOOLS=1` and `GOO_DEVTOOLS_INPUT=1`, or call `DevTools.Attach(window, true)` on the owning UI thread. The CLI flag sets the input environment variable for its child process. Attaching without permission keeps inspection available without adding the `input` capability. Permission lasts until that diagnostics session is disposed. This is a trusted local automation endpoint, not a remote control service.

Send `command: "input"` with an object payload whose `event` is `pointer.move`, `pointer.down`, `pointer.up`, `pointer.cancel`, `wheel`, `key.down`, `key.up`, `text`, `click`, or `reset`. Commands run in arrival order through `PlatformInput` on the selected window's UI queue, including normal bubbling, focus, capture, default editing, and Cell invalidation. Native user input can interleave; use a dedicated test window for deterministic automation.

- Pointer and wheel coordinates are logical window coordinates (`x`, `y`). Alternatively, supply the snapshot `target`, or a legacy window-local `nodeId`, with optional `offsetX`/`offsetY` measured from its current window border-box origin. With no offsets, Goo uses the verified `actionPoint`. Supplying one axis preserves the border-box center on the other axis. The exact resulting point is verified through current clipping, transforms, overlap, disabled state, hit testing, and modal scope. Stale or foreign handles and nodes without a verified point are rejected. Raw `x`/`y` remains lower-level normal routing and is not preflighted as a node target.
- `button` is a `PointerButton` name, defaulting to `Primary`; wheel uses logical `deltaX`/`deltaY`. Coordinates/deltas must be finite and within ±10,000,000. Node-relative offsets refer to the axis-aligned window bounds, including transforms.
- Keys use the `Key` enum names in `key`. `text` contains committed UTF-16 text, at most 16,384 units, and requires a focused editable control. IME composition is not simulated. Optional `modifiers` contains boolean `alt`, `ctrl`, `shift`, and `super` fields on each event.
- `click` sends a down/up pair. Pointer commands share one session-owned mouse contact, distinct from the native mouse. Targets apply only to pointer and wheel events. Text and key events route to current focus, so a supplied `target` or `nodeId` is rejected. `pointer.cancel` needs no target and releases its capture. `reset` resets window input and focus. Session disposal or an exception after injection also resets input, preventing a retained drag or pressed key. Input commands are rejected while inspector selection mode is active.
- A runtime that advertises `input.gesture-lease` owns held pointer buttons and keys with an opaque `gestureId`. `pointer.down` or `key.down` acquires the lease. Every later input request supplies the same ID until all matching releases complete. `pointer.cancel` clears pointer holds only. `reset` clears pointer and key holds. Successful owner input renews the 30-second lease. Observation does not renew it. Expiry resets injected input without replaying any action. Snapshots and captures remain available while inspect and style mutations return `gesture-owned`.

A successful response has `ok: true` and `payload: {"command":"input","applied":true,"sequence":N,"gestureId":"...","gestureActive":true,"leaseMs":30000}` while holds remain. `gestureId` is `null`, `gestureActive` is false and `leaseMs` is zero after release. It acknowledges synchronous handlers and subsequent reconciliation/layout, not asynchronous application work or GPU presentation. Every remote `snapshot` response is a complete settled tree with `full:true`, preserving node IDs. The `full` request field remains accepted for compatibility. Use `capture` for a presented image.

Errors use `input-disabled`, `invalid-input`, `stale-target`, `target-not-actionable`, `gesture-owned`, `gesture-expired`, `closed`, `busy`, `timeout`, or `command`. Requests are limited to 65,536 characters and the UI queue to 32 pending requests. A five-second server timeout cancels work that has not begun. A handler already running may have applied input: **do not automatically retry timed-out actions**. The CLI prints the generated token before sending a hold, so use that token to release, cancel, or reset after an uncertain result. Oversized request lines close the connection. No input worker or frame work is created when diagnostics are disabled.

```sh
goo dev --input --no-watch --project App.gsproj
goo input click --pid 1234 --window "window-1234-1" --target TARGET_HANDLE
goo input click --pid 1234 --window "window-1234-1" --node 42
goo input text --pid 1234 --window "Main" --text "hello"
goo input key.down --pid 1234 --window "Main" --key Backspace
goo input key.up --pid 1234 --window "Main" --key Backspace --gesture TOKEN
goo input pointer.down --pid 1234 --window "Main" --x 200 --y 60
goo input pointer.move --pid 1234 --window "Main" --x 280 --y 60 --gesture TOKEN
goo input pointer.cancel --pid 1234 --window "Main" --gesture TOKEN
goo attach --pid 1234 --window "Main" --once --json --payload '{"full":true}'
```

The CLI exits successfully only after a positive acknowledgement, requires the advertised capability, and uses the same explicit PID/window selection rules as capture. Add `--json` to preserve the complete response.
