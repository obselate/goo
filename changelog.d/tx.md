## Added
- Compose inline text with `Text("plain", TextSpan("styled", style))`. Plain strings convert to unstyled spans. Use `Selectable: true` for text selection and copy without editing.

## Changed
- Replace `TextEditor(controller, layers)` with `TextEditor{Controller: controller, Layers: layers}` and `Virtual(source)` with `Virtual{Source: source}`. The controller and source are required at mount.
- `Window.MeasureText` now returns `float64` layout units. Update variables and delegates that require `float32`.
- Ellipsis text now has automatic minimum width zero. Set `MinWidth` when a nonzero minimum is needed.
