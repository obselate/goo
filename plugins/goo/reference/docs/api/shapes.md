# Shapes API

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/Shapes`](https://github.com/obselate/goo/tree/main/Goo/Shapes)

## `DashPattern`

Source:

- [`DashPattern.gs`](https://github.com/obselate/goo/blob/main/Goo/Shapes/DashPattern.gs)

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

- [`Shape.gs`](https://github.com/obselate/goo/blob/main/Goo/Shapes/Shape.gs)

Selects the rule for filling overlapping path regions.

### Values

- `NonZero`
- `EvenOdd`

## `PathBuilder`

Source:

- [`PathBuilder.gs`](https://github.com/obselate/goo/blob/main/Goo/Shapes/PathBuilder.gs)

Builds an immutable vector path from drawing commands.

### `new`

Creates a builder with a unit view box.

### `new(float64,float64,float64,float64)`

Creates a builder with the specified view box.

- `viewBoxX`: The view-box left coordinate.
- `viewBoxY`: The view-box top coordinate.- `viewBoxWidth`: The positive view-box width.
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

Builds an immutable snapshot while allowing further commands and builds.

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
