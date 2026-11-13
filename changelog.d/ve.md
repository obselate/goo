## Added
- Parse SVG path data with `VectorPath.Parse(data, viewBox)` and append closed contours with `PathBuilder.Ellipse`, `Rectangle`, and `RoundedRectangle`.

## Changed
- Shape path paint uses `Fill: VectorPaint(...)` and `Stroke: VectorStroke(...)` instead of background and border declarations. Legacy paint without either new member throws at mount.
- `VectorAsset.Render` accepts `fit` and `key`, with `ShapeFit.Contain` as the default. Replace `asset.Render("key")` with `asset.Render(key: "key")`.
- Shape state-style background and border paint, including `BackgroundColorAnim` and `BorderColorAnim`, no longer apply. For fill, use `UseCurrentColor: true` with state-style `Color` or `ColorAnim`.
- Out-of-range path numbers report their scanner position instead of the end of the string.

## Removed
- Replace `Shape.StrokeCap`, `StrokeJoin`, `MiterLimit`, `Dashes`, and `VectorEffect` with the matching `VectorStroke` init members. Replace the six-argument constructor with `VectorStroke(width, paint){.Cap: cap, .Join: join, .MiterLimit: limit, .Dashes: dashes}`. Keep trim bounds on `Shape.StrokeStart` and `StrokeEnd`.
