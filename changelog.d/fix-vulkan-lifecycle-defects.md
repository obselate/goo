## Fixed

- Growing the shared path atlas no longer invalidates another window's queued frame.
- Hidden layer-shell windows finish pending frames and close without waiting for an unavailable presentation.
- Device recovery preserves windows that are still starting. Windows with a zero-size surface resume presenting when the surface becomes available.
