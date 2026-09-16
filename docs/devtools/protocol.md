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
  "version": "0.5.4",
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

Supported CLI requests are `snapshot`, `capture`, and the command supplied by `goo attach --command`. A capture response may first return `payload.pending: true`; repeat the `capture` request until it returns `pending: false` or the bounded CLI wait expires. The completed response uses `format: "rgba8-srgb-premultiplied"`, `width`, `height`, `stride`, and `rgbaBase64`. The CLI encodes this pixel payload as a real PNG. Legacy responses can contain `payload.contentBase64`, `payload.base64`, `payload.data`, or `payload.path`.

Clients must inspect the handshake capabilities before enabling optional panels. An older runtime may omit capabilities or close the connection for an unsupported request. The CLI treats that as a connection failure and reports the endpoint and command.

## Application input

Input is separately opt-in: launch with `goo dev --input --no-watch --project App.gsproj`, set both `GOO_DEVTOOLS=1` and `GOO_DEVTOOLS_INPUT=1`, or call `DevTools.Attach(window, true)` on the owning UI thread. The CLI flag sets the input environment variable for its child process. Attaching without permission keeps inspection available without adding the `input` capability. Permission lasts until that diagnostics session is disposed. This is a trusted local automation endpoint, not a remote control service.

Send `command: "input"` with an object payload whose `event` is `pointer.move`, `pointer.down`, `pointer.up`, `pointer.cancel`, `wheel`, `key.down`, `key.up`, `text`, `click`, or `reset`. Commands run in arrival order through `PlatformInput` on the selected window's UI queue, including normal bubbling, focus, capture, default editing, and Cell invalidation. Use one client to order a multi-request gesture. Native user input can interleave; use a dedicated test window for deterministic automation.

- Pointer and wheel coordinates are logical window coordinates (`x`, `y`). Alternatively, supply a stable snapshot `nodeId` and optional `offsetX`/`offsetY` measured from its current window border-box origin. Omitted offsets use the border-box center. The node is resolved after pending tree updates. Hidden, removed, and wrong-window IDs are rejected. Coordinate targeting still obeys clipping, overlap and normal hit testing; it does not force activation of an obscured node.
- `button` is a `PointerButton` name, defaulting to `Primary`; wheel uses logical `deltaX`/`deltaY`. Coordinates/deltas must be finite and within ±10,000,000. Node-relative offsets refer to the axis-aligned window bounds, including transforms.
- Keys use the `Key` enum names in `key`. `text` contains committed UTF-16 text, at most 16,384 units, and requires a focused editable control. IME composition is not simulated. Optional `modifiers` contains boolean `alt`, `ctrl`, `shift`, and `super` fields on each event.
- `click` sends a down/up pair. Pointer commands share one session-owned mouse contact, distinct from the native mouse. `pointer.cancel` needs no target and releases its capture. `reset` resets window input and focus. Session disposal or an exception after injection also resets input, preventing a retained drag or pressed key. Input commands are rejected while inspector selection mode is active.

A successful response has `ok: true` and `payload: {"command":"input","applied":true,"sequence":N}`. It acknowledges synchronous handlers and subsequent reconciliation/layout, not asynchronous application work or GPU presentation. Request a `snapshot` with `payload: {"full":true}` to obtain a complete settled tree, preserving node IDs, and use `capture` for a presented image.

Errors use `input-disabled`, `invalid-input`, `stale-target`, `closed`, `busy`, `timeout`, or `command`. Requests are limited to 65,536 characters and the UI queue to 32 pending requests. A five-second server timeout cancels work that has not begun. A handler already running may have applied input: **do not automatically retry timed-out actions**. Release/cancel a gesture explicitly when its result is uncertain. Oversized request lines close the connection. No input worker or frame work is created when diagnostics are disabled.

```sh
goo dev --input --no-watch --project App.gsproj
goo input click --pid 1234 --window "Main" --node 42
goo input text --pid 1234 --window "Main" --text "hello"
goo input key.down --pid 1234 --window "Main" --key Backspace
goo input key.up --pid 1234 --window "Main" --key Backspace
goo input pointer.down --pid 1234 --window "Main" --x 200 --y 60
goo input pointer.move --pid 1234 --window "Main" --x 280 --y 60
goo input pointer.cancel --pid 1234 --window "Main"
goo attach --pid 1234 --window "Main" --once --json --payload '{"full":true}'
```

The CLI exits successfully only after a positive acknowledgement, requires the advertised capability, and uses the same explicit PID/window selection rules as capture. Add `--json` to preserve the complete response.
