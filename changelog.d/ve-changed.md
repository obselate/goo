## Changed

- Breaking: Shape path paint uses `Fill: VectorPaint(...)` and `Stroke: VectorStroke(...)` instead of background and border declarations. Legacy paint without either new member throws at mount.
- Breaking: `VectorAsset.Render` accepts `fit` and `key`, with `ShapeFit.Contain` as the default. Replace `asset.Render("key")` with `asset.Render(key: "key")`.
- Breaking: Shape state-style background and border paint, including `BackgroundColorAnim` and `BorderColorAnim`, no longer apply. For fill, use `UseCurrentColor: true` with state-style `Color` or `ColorAnim`.
- Out-of-range path numbers report their scanner position instead of the end of the string.
- Breaking: `VectorAsset.ViewBoxX`, `ViewBoxY`, `ViewBoxWidth`, `ViewBoxHeight`, and the `ShaderEffect` constructor's `backdropOutset` and `backdropBlur` use `float64`. Update `float32` variables and delegates to `float64`. Backdrop distances are in layout units.
