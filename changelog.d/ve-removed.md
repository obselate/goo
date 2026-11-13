## Removed

- Breaking: Replace `Shape.StrokeCap`, `StrokeJoin`, `MiterLimit`, `Dashes`, and `VectorEffect` with the matching guarded `VectorStroke` properties. Replace the six-argument constructor with `VectorStroke(width, paint){.Cap: cap, .Join: join, .MiterLimit: limit, .Dashes: dashes}`. Keep trim bounds on `Shape.StrokeStart` and `StrokeEnd`.
