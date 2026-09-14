# Diagnostics API

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/Diagnostics`](../../Goo/Diagnostics)

## `DevTools`

Source:

- [`DevTools.gs`](../../Goo/Diagnostics/DevTools.gs)

Attaches Goo DevTools diagnostics to a window.

### `Attach(Window)`

Attaches Goo DevTools diagnostics to the window.

- `window`: The window to expose through Goo DevTools.

Returns: An object that removes the diagnostics attachment when disposed.

### `Attach(Window, Boolean)`

Attaches local diagnostics and optionally permits application input through normal routing. `allowInput: true` enables the `input` protocol capability until the session is disposed; attaching again with `false` does not revoke an existing grant. The owning UI thread and normal window lifetime requirements apply. See the [input protocol](../devtools/protocol.md#application-input).
