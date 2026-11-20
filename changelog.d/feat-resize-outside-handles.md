## Changed

- Undecorated resizable windows now resize from a border outside the window. Edge controls and scrollbars keep the full window edge.
- Wayland: undecorated resizable windows get a 12 px outside resize border with a shadow. The xdg window geometry excludes it. Other Linux SDL builds keep the inside `ResizeBand`.
- Windows: undecorated resizable windows use the native sizing frame outside the client area.
- macOS: undecorated resizable windows use the AppKit resize area and no inside `ResizeBand`.
