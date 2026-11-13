## Added
- Parse SVG path data with `VectorPath.Parse(data, viewBox)` and append closed contours with `PathBuilder.Ellipse`, `Rectangle`, and `RoundedRectangle`.

## Changed
- Shape path paint uses `Fill: VectorPaint(...)` and `Stroke: VectorStroke(...)` instead of background and border declarations. Legacy paint without either new member throws at mount.
- `VectorAsset.Render` accepts `fit` and `key`, with `ShapeFit.Contain` as the default. Replace `asset.Render("key")` with `asset.Render(key: "key")`.

## Removed
- Replace `Shape.StrokeCap`, `StrokeJoin`, `MiterLimit`, `Dashes`, and `VectorEffect` with the matching `VectorStroke` options. Keep trim bounds on `Shape.StrokeStart` and `StrokeEnd`.
