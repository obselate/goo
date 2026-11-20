## Fixed

- Undecorated windows: controls with `OnClick` at a window edge, such as WindowChrome Close, now get clicks inside the resize band. Focusable-only content still resizes there.
- Undecorated windows: each corner now resizes within `max(2 * ResizeBand, 16)` of the corner, not only `ResizeBand x ResizeBand`.
- Undecorated windows on Linux and Windows: the pointer now shows the resize cursor whenever a press would resize. Before, the content cursor could replace it. macOS keeps the content cursor, because SDL starts no resize from hit-test results there.
- Windows: `ResizeBand` now uses logical pixels and follows the display scale. Before, it used physical pixels.
