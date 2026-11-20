## Added

- `Window.BeginMove()` and `Window.BeginResize(WindowEdge)` start a system move or resize. Call them from a pointer, touch or key press handler. Windows uses the pointer drag or its keyboard move and size mode. Wayland sends `xdg_toplevel.move` or `resize` with the serial of the latest input event.
- `Window.ShowSystemMenu(Point)` shows the platform window menu.
- `Window.MaximizeButton(Button)` marks a custom maximize button. On Windows 11, hovering it shows the Snap Layouts flyout.
