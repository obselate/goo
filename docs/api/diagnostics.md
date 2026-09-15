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

### `Attach(Window,bool)`

Attaches local diagnostics and optionally permits input commands through normal UI routing. Input remains disabled unless explicitly allowed here or by GOO_DEVTOOLS_INPUT=1 at automatic attachment.

- `window`: The window to expose through Goo DevTools.
- `allowInput`: Whether to permit local application input commands for this session.

Returns: An object that removes the diagnostics attachment when disposed.
