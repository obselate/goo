# Diagnostics API

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/Diagnostics`](https://github.com/obselate/goo/tree/d379d7642b5a5e64add27fab70810e6a9ae4eabf/Goo/Diagnostics)

## `DevTools`

Source:

- [`DevTools.gs`](https://github.com/obselate/goo/blob/d379d7642b5a5e64add27fab70810e6a9ae4eabf/Goo/Diagnostics/DevTools.gs)

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
