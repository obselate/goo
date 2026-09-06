# Shapes API

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/Shapes`](../../Goo/Shapes)

## `DashPattern`

Source:

- [`DashPattern.gs`](../../Goo/Shapes/DashPattern.gs)

Specifies logical-pixel dash intervals and their phase offset. Empty intervals produce a solid stroke. Odd interval counts repeat once.

### `new(float64[],float64)`

Creates a dash pattern.

- `intervals`: Non-negative finite dash and gap lengths. Empty is solid, and non-empty values must not all be zero.
- `offset`: The finite phase offset in logical pixels.

### `Intervals`

Gets the immutable intervals after odd-count normalization.

### `Offset`

Gets the finite dash phase offset in logical pixels.

## `FillRule`

Source:

- [`Shape.gs`](../../Goo/Shapes/Shape.gs)

Selects the rule for filling overlapping path regions.

### Values

- `NonZero`
- `EvenOdd`

## `PathBuilder`

Source:

- [`PathBuilder.gs`](../../Goo/Shapes/PathBuilder.gs)

Builds an immutable vector path from drawing commands.

### `new`

Creates a builder with a unit view box.

### `new(float64,float64,float64,float64)`

Creates a builder with the specified view box.

- `viewBoxX`: The view-box left coordinate.
- `viewBoxY`: The view-box top coordinate.
- `viewBoxWidth`: The positive view-box width.
- `viewBoxHeight`: The positive view-box height.

### `ArcTo(float64,float64,float64,bool,bool,float64,float64)`

Adds an elliptical arc to a point.

- `radiusX`: The non-negative horizontal radius.
- `radiusY`: The non-negative vertical radius.
- `rotationDegrees`: The ellipse rotation in degrees.
- `largeArc`: Whether to use the larger arc.
- `sweepClockwise`: Whether the arc sweeps clockwise.
- `x`: The endpoint x coordinate.
- `y`: The endpoint y coordinate.

Returns: This builder.

### `Build`

Builds the immutable path and seals this builder.

Returns: The completed vector path.

### `Close`

Closes the current contour.

Returns: This builder.

### `CubicTo(float64,float64,float64,float64,float64,float64)`

Adds a cubic Bézier curve to a point.

- `controlX1`: The first control-point x coordinate.
- `controlY1`: The first control-point y coordinate.
- `controlX2`: The second control-point x coordinate.
- `controlY2`: The second control-point y coordinate.
- `x`: The endpoint x coordinate.
- `y`: The endpoint y coordinate.

Returns: This builder.

### `LineTo(float64,float64)`

Adds a straight line to a point.

- `x`: The point x coordinate.
- `y`: The point y coordinate.

Returns: This builder.

### `MoveTo(float64,float64)`

Begins a new contour at a point.

- `x`: The point x coordinate.
- `y`: The point y coordinate.

Returns: This builder.

### `Polyline(Point[],bool)`

Adds a polyline contour through the specified points.

- `points`: The two or more contour points.
- `close`: Whether to close the contour.

Returns: This builder.

### `QuadraticTo(float64,float64,float64,float64)`

Adds a quadratic Bézier curve to a point.

- `controlX`: The control-point x coordinate.
- `controlY`: The control-point y coordinate.
- `x`: The endpoint x coordinate.
- `y`: The endpoint y coordinate.

Returns: This builder.

## `Point`

Source:

- [`Point.gs`](../../Goo/Shapes/Point.gs)

Represents an immutable two-dimensional point.

### `X`

Gets the x coordinate.

### `Y`

Gets the y coordinate.

## `Shape`

Source:

- [`Shape.gs`](../../Goo/Shapes/Shape.gs)

Displays a vector path with fill and one uniform stroke. Side-specific border declarations apply to boxes only.

### `new`

Creates a shape with default paint options.

### `CornerRadius`

Gets or sets the non-negative finite corner radius in logical pixels.

### `Dashes`

Gets or sets the stroke dash pattern.

### `FillRule`

Gets or sets the fill rule. The default is NonZero.

### `Fit`

Gets or sets the geometry fit. Cover clips, Fill stretches, and None preserves view-box units.

### `MiterLimit`

Gets or sets the non-negative finite miter limit. The default is 4.

### `Path`

Gets or sets the vector path to display.

### `StrokeCap`

Gets or sets the stroke cap style. The default is Butt.

### `StrokeJoin`

Gets or sets the stroke join style. The default is Miter.

## `ShapeFit`

Source:

- [`Shape.gs`](../../Goo/Shapes/Shape.gs)

Selects how path geometry maps into the padded layout bounds. Contain is the centered aspect-preserving default.

### Values

- `Contain`
- `Cover`
- `Fill`
- `None`

## `StrokeCap`

Source:

- [`Shape.gs`](../../Goo/Shapes/Shape.gs)

Selects the cap style for stroked paths.

### Values

- `Butt`
- `Round`
- `Square`

## `StrokeJoin`

Source:

- [`Shape.gs`](../../Goo/Shapes/Shape.gs)

Selects the join style for stroked paths.

### Values

- `Miter`
- `Round`
- `Bevel`

## `VectorNode`

Source:

- [`VectorAssetModel.gs`](../../Goo/Shapes/VectorAssetModel.gs)

Describes one immutable vector node and its composed children.

### `new(VectorNode[])`

Creates a group node with children.

### `new(VectorPath)`

Creates a path node with no paint or children.

### `new(VectorPath,VectorNodeStyle)`

Creates a path node with immutable style options.

### `new(VectorPath,VectorNodeStyle,VectorNode[])`

Creates a path node with immutable style options.

### `Children`

Gets the immutable child sequence.

### `ClipPath`

Gets this node's optional clip path.

### `ClipPathFillRule`

Gets this node's clip fill rule.

### `Fill`

Gets this node's optional fill paint.

### `FillRule`

Gets this node's fill rule.

### `Key`

Gets the stable key used for this node when rendered.

### `Opacity`

Gets this node's local opacity.

### `Path`

Gets this node's path.

### `Stroke`

Gets this node's optional stroke.

### `Style`

Gets the immutable node options.

### `Transform`

Gets this node's local transform.

## `VectorNodeStyle`

Source:

- [`VectorAssetModel.gs`](../../Goo/Shapes/VectorAssetModel.gs)

Describes immutable paint and composition options for a vector node.

### `new`

Creates vector node options with unit opacity and nonzero winding.

### `ClipPath`

Gets this node's optional clip path.

### `ClipPathFillRule`

Gets this node's clip fill rule.

### `Fill`

Gets this node's optional fill paint.

### `FillRule`

Gets this node's fill rule.

### `Key`

Gets the stable key used for this node when rendered.

### `Opacity`

Gets this node's local opacity.

### `Stroke`

Gets this node's optional stroke.

### `Transform`

Gets this node's local transform.

## `VectorPaint`

Source:

- [`VectorAssetModel.gs`](../../Goo/Shapes/VectorAssetModel.gs)

Describes one immutable vector fill paint.

### `new(Color)`

Creates a solid vector paint.

### `new(Gradient)`

Creates a gradient vector paint.

### `Color`

Gets the solid color, or transparent when this paint is a gradient.

### `Gradient`

Gets the gradient, or nil for a solid paint.

## `VectorPath`

Source:

- [`VectorPath.gs`](../../Goo/Shapes/VectorPath.gs)

Represents an immutable vector path in a top-left coordinate system. Coordinates increase rightward on x and downward on y.

### `Empty`

Gets an empty path with a unit view box.

### `ViewBoxHeight`

Gets the view-box height.

### `ViewBoxWidth`

Gets the view-box width.

### `ViewBoxX`

Gets the view-box left coordinate.

### `ViewBoxY`

Gets the view-box top coordinate.

## `VectorStroke`

Source:

- [`VectorAssetModel.gs`](../../Goo/Shapes/VectorAssetModel.gs)

Describes one immutable vector stroke.

### `new(float64,Color)`

Creates a solid-color stroke with default cap, join, and miter settings.

### `new(float64,VectorPaint)`

Creates a stroke with default cap, join, and miter settings.

### `new(float64,VectorPaint,StrokeCap,StrokeJoin,float64,DashPattern)`

Creates a fully specified immutable stroke.

### `Cap`

Gets the line cap style.

### `Dashes`

Gets the optional dash pattern.

### `Join`

Gets the line join style.

### `MiterLimit`

Gets the finite miter limit.

### `Paint`

Gets the stroke paint.

### `Width`

Gets the non-negative stroke width in view-box units.
