# Shapes API

Source: [`Goo/Shapes`](../../Goo/Shapes)

## `DashPattern`


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


Selects the rule for filling overlapping path regions.

### Values

- `NonZero`
- `EvenOdd`

## `PathBuilder`


Builds an immutable vector path from drawing commands. Drawing commands and Reset return this builder.

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

### `Build`

Builds an immutable snapshot while allowing further commands and builds.

Returns: The completed vector path.

### `Close`

Closes the current contour.

### `CubicTo(float64,float64,float64,float64,float64,float64)`

Adds a cubic Bézier curve to a point.

- `controlX1`: The first control-point x coordinate.
- `controlY1`: The first control-point y coordinate.
- `controlX2`: The second control-point x coordinate.
- `controlY2`: The second control-point y coordinate.
- `x`: The endpoint x coordinate.
- `y`: The endpoint y coordinate.

### `Ellipse(float64,float64,float64,float64)`

Appends a closed ellipse in view-box coordinates.

- `x`: The left coordinate.
- `y`: The top coordinate.
- `width`: The non-negative width.
- `height`: The non-negative height.

### `LineTo(float64,float64)`

Adds a straight line to a point.

- `x`: The point x coordinate.
- `y`: The point y coordinate.

### `MoveTo(float64,float64)`

Begins a new contour at a point.

- `x`: The point x coordinate.
- `y`: The point y coordinate.

### `Polyline(Point[],bool)`

Adds a polyline contour through the specified points.

- `points`: The two or more contour points.
- `close`: Whether to close the contour.

### `QuadraticTo(float64,float64,float64,float64)`

Adds a quadratic Bézier curve to a point.

- `controlX`: The control-point x coordinate.
- `controlY`: The control-point y coordinate.
- `x`: The endpoint x coordinate.
- `y`: The endpoint y coordinate.

### `Rectangle(float64,float64,float64,float64)`

Appends a closed rectangle in view-box coordinates.

- `x`: The left coordinate.
- `y`: The top coordinate.
- `width`: The non-negative width.
- `height`: The non-negative height.

### `Reset`

Clears the commands and contour while retaining the view box and storage for continued use. Previously built paths remain immutable. Each Build copies the commands.

### `RoundedRectangle(float64,float64,float64,float64,float64)`

Appends a closed rounded rectangle in view-box coordinates. The radius is clamped to half the smaller dimension.

- `x`: The left coordinate.
- `y`: The top coordinate.
- `width`: The non-negative width.
- `height`: The non-negative height.
- `radius`: The non-negative corner radius.

## `Point`


Represents an immutable two-dimensional point.

### `X`

Gets the x coordinate.

### `Y`

Gets the y coordinate.

## `Shape`


Displays a vector path with fill and one uniform stroke. Use Fill and Stroke for path paint. Legacy paint without either throws: "Shape paint moved to Fill and Stroke".

### `new`

Creates a shape with default paint options.

### `CornerRadius`

Gets or sets the non-negative finite corner radius in logical pixels.

### `Fill`

Gets or sets the optional path fill. A gradient takes priority over UseCurrentColor.

### `FillRule`

Gets or sets the fill rule. The default is NonZero.

### `Fit`

Gets or sets the geometry fit. Cover clips, Fill stretches, and None preserves view-box units.

### `Path`

Gets or sets the vector path to display. Reuse one path and position instances with Transform to share encoded geometry.

### `Stroke`

Gets or sets the complete stroke paint and options. Gradient strokes are not supported.

### `StrokeEnd`

Gets or sets the stroke end in [0, 1]. Equal bounds omit the stroke; fill remains unchanged. Trim precedes dashes, whose phase starts at each trimmed contour. Trim preserves fully included closed contours; partial contours use the stroke's Cap at their open ends.

### `StrokeStart`

Gets or sets the stroke start in [0, 1], summed across contours in path order. None measures flattened geometry after fit mapping. NonScalingStroke measures geometry after the full transform. On mount, StrokeStart must not exceed StrokeEnd.

### `UseCurrentColor`

Uses the inherited Color for solid fill when true. The default is false. A gradient Fill and the Stroke paint are unchanged.

## `ShapeFit`


Selects how path geometry maps into the padded layout bounds. Contain is the centered aspect-preserving default.

### Values

- `Contain`
- `Cover`
- `Fill`
- `None`

## `StrokeCap`


Selects the cap style for stroked paths.

### Values

- `Butt`
- `Round`
- `Square`

## `StrokeJoin`


Selects the join style for stroked paths.

### Values

- `Miter`
- `Round`
- `Bevel`

## `VectorEffect`


Selects whether strokes scale with geometry or remain in window logical pixels.

### Values

- `None`
- `NonScalingStroke`

## `VectorNode`


Describes one immutable vector node and its composed children.

### `new(VectorNode[])`

Creates a group node with children.

### `new(VectorPath)`

Creates a path node with no paint or children.

### `new(VectorPath,VectorNodeStyle)`

Creates a path node with immutable style options.

### `new(VectorPath,VectorNodeStyle,VectorNode[])`

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


Represents an immutable vector path in a top-left coordinate system. Coordinates increase rightward on x and downward on y.

### `Equals(VectorPath)`

Tests whether another path has the same content.

### `Parse(string,ElementRect)`

Parses SVG path data in the supplied view box. Parse once outside Build and retain the result.

- `data`: The SVG path commands.
- `viewBox`: The finite view box with positive width and height.

Returns: The immutable vector path.

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


Describes one immutable vector stroke.

### `new(float64,Color)`

Creates a solid-color stroke with default cap, join, and miter settings.

### `new(float64,VectorPaint)`

Creates a stroke with default cap, join, and miter settings.

### `Cap`

Gets the line cap style.

### `Dashes`

Gets the optional dash pattern. NonScalingStroke measures dash lengths in window logical pixels.

### `Join`

Gets the line join style.

### `MiterLimit`

Gets the non-negative finite miter limit.

### `Paint`

Gets the stroke paint.

### `VectorEffect`

Gets the vector effect. The default is None.

### `Width`

Gets the non-negative stroke width in view-box units, or window logical pixels for NonScalingStroke.
