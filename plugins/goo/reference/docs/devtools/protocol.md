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
  "version": "0.5.0",
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

Supported CLI requests are `snapshot`, `capture`, and the command supplied by `goo attach --command`. A capture response may first return `payload.pending: true`; repeat the `capture` request until it returns `pending: false` or the bounded CLI wait expires. The completed response uses `format: "rgba8-srgb-premultiplied"`, `width`, `height`, `stride`, and `rgbaBase64`. The CLI encodes this pixel payload as a real PNG. Legacy responses can contain `payload.contentBase64`, `payload.base64`, `payload.data`, or `payload.path`.

Clients must inspect the handshake capabilities before enabling optional panels. An older runtime may omit capabilities or close the connection for an unsupported request. The CLI treats that as a connection failure and reports the endpoint and command.
