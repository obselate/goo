# Diagnostics API

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/Diagnostics`](https://github.com/obselate/goo/tree/9e4745962fb68163cecb2bf1eac60aeccab7ad0b/Goo/Diagnostics)

## `DevTools`

Source:

- [`DevTools.gs`](https://github.com/obselate/goo/blob/9e4745962fb68163cecb2bf1eac60aeccab7ad0b/Goo/Diagnostics/DevTools.gs)

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
