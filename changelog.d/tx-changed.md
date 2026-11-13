## Changed

- Breaking: Replace `TextEditor(controller)` and `TextEditor(controller, layers)` with `TextEditor{Controller: controller, Layers: layers}`. Omit `Layers` when unused. Replace `Virtual(source)` with `Virtual{Source: source}`. The controller and source are required at mount.
- Breaking: `Window.MeasureText` now returns `float64` layout units. Update variables and delegates that require `float32`.
- Ellipsis text now has automatic minimum width zero. Set `MinWidth` when a nonzero minimum is needed.
- Selectable text leaves unsupported keys to ancestor handlers and bindings. Selection clears on blur and content replacement. Appending content preserves selection.
