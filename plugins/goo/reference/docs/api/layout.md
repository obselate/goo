# Layout API

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/Layout`](../../Goo/Layout)

## `LayoutAlgorithm`

Source:

- [`CustomLayout.gs`](../../Goo/Layout/CustomLayout.gs)

Measures and arranges the existing children of a Container. Implementations must be immutable and must not mutate UI state during layout.

### `Arrange(LayoutContext,LayoutSize)`

Places every child in the final content area; child indices and mounted identity match Container.Children.

- `context`: The retained children available only during this callback.
- `finalSize`: The finite content size after the surrounding layout resolves the container.

### `Measure(LayoutContext,LayoutSize)`

Returns the desired content size under the available constraints, excluding the container's padding and border.

- `context`: The retained children available only during this callback.
- `available`: The maximum content size, with positive infinity on an unbounded axis.

Returns: A finite, nonnegative desired content size, clamped by the parent constraints.

## `LayoutContext`

Source:

- [`CustomLayout.gs`](../../Goo/Layout/CustomLayout.gs)

Provides bounded access to retained children during custom measure and arrange callbacks.

### `ArrangeChild(int32,ElementRect)`

Places a child margin box relative to the container's content origin. Every child must be placed exactly once per arrange callback.

- `index`: The zero-based child index.
- `bounds`: A finite, nonnegative-size margin box; offsets may be negative.

### `MeasureChild(int32,LayoutSize)`

Measures a retained child subtree without rebuilding it. Root margins are included in the returned size.

- `index`: The zero-based child index.
- `available`: Maximum width and height; positive infinity means unconstrained.

Returns: The child's desired margin-box size under these constraints.

### `ChildCount`

Gets the number of retained direct children. Access outside a layout callback throws.

## `LayoutSize`

Source:

- [`CustomLayout.gs`](../../Goo/Layout/CustomLayout.gs)

Describes a logical size, or available constraints with positive infinity on unbounded axes.

### `Height`

Gets the logical height.

### `Width`

Gets the logical width.
