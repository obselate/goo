# Layout API

Source: [`Goo/Layout`](../../Goo/Layout)

## Size flexible content

```gsharp
Container{
    FlexDirection: FlexDirection.Row,
    Text{Content: "A long label can wrap", FlexGrow: 1, MinWidth: 0},
    Container{FlexGrow: 1, MinWidth: 0, MinHeight: 0, OverflowY: Overflow.Scroll},
}
```

- `FlexShrink` defaults to 1. Set it to 0 to disable shrinking.
- An explicit `MinWidth` or `MinHeight` sets the axis minimum.
- Without an explicit minimum, `Scroll` or `Hidden` overflow permits zero.
- Otherwise, an authored axis size is the minimum. Without one, content sets it.
- Wrapping Text stops shrinking at its widest word. `MinWidth: 0` permits narrower text and word breaks.
- Use flexible regions inside a sized parent. Scroll content that cannot fit.

See [Style](style.md) for the property contracts.

## Row, column, and spacer

```gsharp
Row{Gap: 8, Text("Title"), Spacer(), Button(){Text("Close")}}
Container{Position: PositionType.Absolute, Inset: 0}
Text{Content: "Flexible", Flex: 1, MinWidth: 0}
```

- `Row` and `Column` fix the main axis. Setting `FlexDirection`, including through a state style, throws at mount.
- `Spacer` defaults to grow 1, shrink 1, basis 0, and minimum size 0. It has no paint, hit test, or accessibility node.
- `Flex: n` sets grow n, shrink 1, and basis 0. It does not change the automatic minimum. Later flex declarations override each part.
- `Inset` accepts `Edges` in top, right, bottom, left order. A uniform length sets every edge. Later offsets override individual edges.

## Relative and intrinsic lengths

```gsharp
Container{Width: Percent(100) - Rem(2), MaxHeight: Vh(25)}
Container{Width: Length.FitContent(Em(32.5))}
```

- Numbers are layout units. G# uses `Percent`, `Em`, `Rem`, `Vw` and `Vh`. Other .NET languages can use `Length.Pixels`, `Length.Percent`, `Length.Em`, `Length.Rem`, `Length.Vw` and `Length.Vh`.
- `Em` uses the element's computed font size. In `FontSize`, it uses the parent's font size. `Rem` uses the root font size. Platform text scale applies once.
- `Vw` and `Vh` use percentages of the window layout viewport.
- Add or subtract lengths, or multiply and divide them by a number. Automatic and intrinsic values cannot be operands.
- Supported `Style` properties are listed below. `FontSize` accepts layout units, `Em`, `Rem` and mixtures of those units, but not percentages, `Vw` or `Vh`.
- `Length.MinContent`, `Length.MaxContent`, and `Length.FitContent(limit)` apply to width, height, their minimum and maximum bounds, and `FlexBasis`. They measure retained content without calling `Build`.
- In a custom layout callback, `context.ResolveLength(value, LayoutAxis.Horizontal)` resolves percentages against the available content width. `Vertical` uses height. `Em` uses the custom-layout container's font size. Automatic and intrinsic values return `nil`. A nonzero percentage part without a finite basis also returns `nil`.
- Length animations accept one unit. Mixed lengths throw `ArgumentException`.

| Style properties | `Em`, `Rem`, `Vw`, `Vh` |
| --- | --- |
| `Width`, `Height`, `MinWidth`, `MinHeight`, `MaxWidth`, `MaxHeight`, `FlexBasis` | All four, including mixed lengths |
| `Padding`, `PaddingStart`, `PaddingEnd`, `Margin`, `MarginStart`, `MarginEnd`, `Gap`, `RowGap`, `ColumnGap` | All four, including each `Edges` component |
| `Inset`, `Left`, `Start`, `Top`, `Right`, `End`, `Bottom`, `TransformOriginX`, `TransformOriginY` | All four, including mixed lengths |
| `FontSize` | `Em` and `Rem` only |
| `BorderRadius`, `BorderTopLeftRadius`, `BorderTopRightRadius`, `BorderBottomLeftRadius`, `BorderBottomRightRadius`, `BorderWidth`, `BorderStartWidth`, `BorderEndWidth`, `OutlineWidth`, `OutlineOffset`, `TextStrokeWidth`, `LetterSpacing` | None. Use layout units |

## Padding and margin

`Padding` and `Margin` accept pixel numbers or `Edges`. Two arguments mean
vertical and horizontal, not top and left. Three and four arguments follow CSS
order. Use named edges to set only specific sides. Omitted sides keep their
`BasedOn` values, or default to zero. There is no `nil` placeholder for omitted
sides. Use a uniform base to explicitly clear the other sides.

`PaddingStart`, `PaddingEnd`, `MarginStart`, and `MarginEnd` remain available for
direction-aware edges.

```gsharp
Container{Padding: 8, Margin: Edges(4, 12)}
Container{Padding: Edges(4, 12, 8), Margin: Edges(4, 8, 12, 16)}
Container{BasedOn: cardStyle, Padding: Edges{Top: 10, Left: 6}}
Container{BasedOn: cardStyle, Padding: Edges(0){.Top: 10, .Left: 6}}
```

## Border edges

`BorderWidth` uses length-valued `Edges`. `BorderColor` uses `Edges[Color]`.
Plain numbers and colors still set every border edge. Named sides set only those
edges, while two to four positional values follow the same CSS order as padding.
`BorderStartWidth`, `BorderEndWidth`, `BorderStartColor`, and `BorderEndColor`
remain direction-aware. A uniform border width or color also sets a Shape's
stroke. Individual sides affect box borders only.

```gsharp
let red = Color.Rgb(255, 0, 0)
let blue = Color.Rgb(0, 0, 255)
Container{BorderWidth: 2, BorderColor: red}
Container{BorderWidth: Edges{Top: 2, Left: 4}, BorderColor: Edges[Color]{Top: red, Left: blue}}
```

## Retained custom layout

Set `Container.Layout` to an immutable `LayoutAlgorithm` to replace the container's
flex algorithm while keeping its mounted children, styles, input, accessibility,
and rendering. A policy implements `Measure(context, available)` and
`Arrange(context, finalSize)`. Both sizes describe the container's **content** area;
Goo handles its padding and border. Positive infinity is allowed only in available
constraints. Desired sizes and arranged rectangles must be finite, nonnegative in
size, and representable by the renderer's 32-bit logical coordinates.

`context.MeasureChild(index, available)` asks the existing child subtree for its
desired margin-box size. It handles wrapping text, images, nested flex layouts, and
nested custom panels. It does not reconcile or remount children. During `Arrange`,
call `context.ArrangeChild(index, bounds)` exactly once for every direct non-Portal child,
including hidden children. Bounds are margin boxes relative to the content origin;
Goo subtracts child margins before arranging the child's border box. The algorithm
controls final width/height even when the child has an authored size or size limit;
those declarations participate in measurement. Normal relative child offsets still
apply. Custom layout owns track/gap and out-of-flow policy. Portals use their own
layout and do not participate. Child indices follow declaration order with Portals
excluded. Scroll extents and layout transitions include custom placements.

Arranged bounds and cached sizes remain unrounded. Absolute child rectangles snap
to `Window.PixelScale`. Density changes rearrange children. Positive sizes and
border widths have a one-device-pixel minimum.

A context is valid only on the UI thread inside its current callback. Out-of-phase use, duplicate or
missing arrangements, invalid sizes, reentrant window layout, and more than 64
nested custom measurement callbacks throw. Do not mutate the UI or an algorithm's configuration
inside its callbacks. Replace a policy object when its configuration changes.
Content, font, image, child-list, and child-style changes invalidate affected
measurements automatically; changing available width uses a new constraint key.

Each layout callback permits at most `min(65536, max(32, childCount * 16))`
calls to `MeasureChild`.

```gsharp
class VerticalLayout : LayoutAlgorithm {
    public func Measure(context LayoutContext, available LayoutSize) LayoutSize {
        var width = 0.0
        var height = 0.0
        for i in 0 ... context.ChildCount {
            let child = context.MeasureChild(i, LayoutSize(available.Width, System.Double.PositiveInfinity))
            width = System.Math.Max(width, child.Width)
            height += child.Height
        }
        return LayoutSize(width, height)
    }

    public func Arrange(context LayoutContext, finalSize LayoutSize) {
        var y = 0.0
        for i in 0 ... context.ChildCount {
            let child = context.MeasureChild(i, LayoutSize(finalSize.Width, System.Double.PositiveInfinity))
            context.ArrangeChild(i, ElementRect{Y: y, Width: finalSize.Width, Height: child.Height,})
            y += child.Height
        }
    }
}
```


## Layout position simulations

See [motion](motion.md#layout-position-simulations) for position simulations.

## Text language and user scaling

See [Style.Language](style.md#language) and
[PlatformPreferences.TextScaleFactor](platform.md#textscalefactor).

## Scroll large content

- Positions use float32. Placement drifts beyond 16,777,216 pixels of content.
- `JumpTo` is immediate. `ScrollTo` animates containers and is immediate in text editors.
- `ElementHandle.ScrollToItem(key)` jumps to a virtual row.

## `Dock`


Sequentially docks children along container edges and gives remaining space to Fill children.

### `Default`

Gets a shared Dock instance with LastChildFill enabled.

### `Edge`

Identifies the per-child DockEdge trait.

### `new`

Initializes a Dock layout with LastChildFill enabled.

### `Arrange(LayoutContext,LayoutSize)`

Arranges docked edge strips in child order, then places all Fill children in the remaining rectangle.

- `context`: The bounded layout context for the current arrange pass.
- `finalSize`: The resolved content size.

### `Bottom(Blob)`

Docks a child to the bottom edge and returns it for fluent composition.

- `child`: The child blob to configure.

Returns: The configured child blob.

### `End(Blob)`

Docks a child to the inline-end edge and returns it for fluent composition.

- `child`: The child blob to configure.

Returns: The configured child blob.

### `Fill(Blob)`

Assigns a child to fill the remaining center area and returns it for fluent composition.

- `child`: The child blob to configure.

Returns: The configured child blob.

### `Left(Blob)`

Docks a child to the physical left edge and returns it for fluent composition.

- `child`: The child blob to configure.

Returns: The configured child blob.

### `Measure(LayoutContext,LayoutSize)`

Measures docked edge strips followed by any Fill children to determine the container's desired content size.

- `context`: The bounded layout context for the current measure pass.
- `available`: The maximum available content size.

Returns: The minimum content size needed to accommodate all docked edges and Fill children.

### `Right(Blob)`

Docks a child to the physical right edge and returns it for fluent composition.

- `child`: The child blob to configure.

Returns: The configured child blob.

### `Start(Blob)`

Docks a child to the inline-start edge and returns it for fluent composition.

- `child`: The child blob to configure.

Returns: The configured child blob.

### `Top(Blob)`

Docks a child to the top edge and returns it for fluent composition.

- `child`: The child blob to configure.

Returns: The configured child blob.

### `LastChildFill`

Gets or sets whether the last visible child without an explicit Dock.Edge trait fills the remaining area. Defaults to true.

## `DockEdge`


Selects the edge or center region occupied by a child inside a Dock layout.

### `Bottom`

Docks the child to the bottom edge.

### `End`

Docks the child to the inline-end edge (right in left-to-right, left in right-to-left).

### `Fill`

Places the child in the remaining center area after all docked edges are carved out.

### `Left`

Docks the child to the physical left edge regardless of reading direction.

### `Right`

Docks the child to the physical right edge regardless of reading direction.

### `Start`

Docks the child to the inline-start edge (left in left-to-right, right in right-to-left).

### `Top`

Docks the child to the top edge.

## `Grid`


Arranges children into a shared two-dimensional grid of columns and rows with auto-placement and spans.

### `Placement`

Identifies the per-child GridPlacement trait.

### `new`

Initializes a Grid layout with a single auto-sized column flow and Stretch alignment.

### `Align(Blob,System.Nullable{LayoutAlign},System.Nullable{LayoutAlign})`

Updates cell alignment on a child blob while preserving any existing Grid placement coordinates and spans.

- `child`: The child blob to configure.
- `horizontal`: Optional horizontal alignment override.
- `vertical`: Optional vertical alignment override.

Returns: The configured child blob.

### `Arrange(LayoutContext,LayoutSize)`

Arranges every child into its resolved grid cell with alignment and reading-direction support.

- `context`: The bounded layout context for the current arrange pass.
- `finalSize`: The resolved content size.

### `Measure(LayoutContext,LayoutSize)`

Measures the grid's columns and rows under the available constraints.

- `context`: The bounded layout context for the current measure pass.
- `available`: The maximum available content size.

Returns: The desired content size spanning all resolved tracks and gaps.

### `Place(Blob,System.Nullable{int32},System.Nullable{int32},int32,int32,System.Nullable{LayoutAlign},System.Nullable{LayoutAlign})`

Attaches explicit coordinates, spans, or alignment to a child blob and returns it for fluent composition.

- `child`: The child blob to configure.
- `column`: Optional zero-based starting column index.
- `row`: Optional zero-based starting row index.
- `columnSpan`: Number of columns spanned. Must be at least 1.
- `rowSpan`: Number of rows spanned. Must be at least 1.
- `horizontal`: Optional horizontal alignment override within the cell.
- `vertical`: Optional vertical alignment override within the cell.

Returns: The configured child blob.

### `Span(Blob,int32,int32)`

Attaches column and row spans to an auto-placed child blob and returns it for fluent composition.

- `child`: The child blob to configure.
- `columns`: Number of columns spanned. Must be at least 1.
- `rows`: Number of rows spanned. Must be at least 1.

Returns: The configured child blob.

### `AutoColumns`

Gets or sets the sizing rule for implicitly created columns. Defaults to Auto.

### `AutoRows`

Gets or sets the sizing rule for implicitly created rows. Defaults to Auto.

### `Columns`

Gets or sets the explicit column track definitions. Empty uses implicit AutoColumns tracks.

### `Dense`

Gets or sets whether auto-placement backfills earlier holes left by spanning items. Defaults to false.

### `Flow`

Gets or sets the auto-placement direction for items without explicit coordinates. Defaults to Row.

### `HorizontalAlign`

Gets or sets the default horizontal cell alignment. Defaults to Stretch.

### `Rows`

Gets or sets the explicit row track definitions. Empty uses implicit AutoRows tracks.

### `VerticalAlign`

Gets or sets the default vertical cell alignment. Defaults to Stretch.

## `GridFlow`


Selects the primary auto-placement direction for Grid items without explicit coordinates.

### `Column`

Places items top-to-bottom down each column before advancing to the next column.

### `Row`

Places items left-to-right across each row before advancing to the next row.

## `GridPlacement`


Configures explicit cell placement, track spans, and per-cell alignment for a Grid child.

### `Column`

Gets or sets the optional zero-based starting column index.

### `ColumnSpan`

Gets or sets the number of columns spanned. Nil resolves to 1.

### `HorizontalAlign`

Gets or sets the horizontal alignment override inside the cell, or nil to inherit Grid.HorizontalAlign.

### `Row`

Gets or sets the optional zero-based starting row index.

### `RowSpan`

Gets or sets the number of rows spanned. Nil resolves to 1.

### `VerticalAlign`

Gets or sets the vertical alignment override inside the cell, or nil to inherit Grid.VerticalAlign.

## `GridTrack`


Defines a single row or column track in a Grid layout.

### `Auto(float64,System.Nullable{float64})`

Creates an Auto track that fits content within optional minimum and maximum bounds.

- `minimum`: Minimum track size in layout units.
- `maximum`: Optional maximum track size in layout units.

Returns: A configured GridTrack.

### `Fixed(float64)`

Creates a Fixed-size track in layout units.

- `size`: The fixed size in layout units.

Returns: A configured GridTrack.

### `Fr(float64,float64,System.Nullable{float64})`

Creates a fractional track that shares remaining space proportionally by weight.

- `weight`: Positive fractional weight. Defaults to 1.
- `minimum`: Minimum track size in layout units.
- `maximum`: Optional maximum track size in layout units.

Returns: A configured GridTrack.

### `MaxContent(float64,System.Nullable{float64})`

Creates a MaxContent track that sizes to its items' unconstrained content size.

- `minimum`: Minimum track size in layout units.
- `maximum`: Optional maximum track size in layout units.

Returns: A configured GridTrack.

### `MinContent(float64,System.Nullable{float64})`

Creates a MinContent track that sizes to its items' minimum intrinsic size.

- `minimum`: Minimum track size in layout units.
- `maximum`: Optional maximum track size in layout units.

Returns: A configured GridTrack.

### `Repeat(int32,GridTrack)`

Creates an array containing count copies of the given track.

- `count`: Nonnegative number of tracks to create.
- `track`: The track definition to repeat.

Returns: An array of count GridTrack values.

### `Maximum`

Gets or sets the optional maximum track size in layout units. Nil means unbounded.

### `Minimum`

Gets or sets the minimum track size in layout units. Defaults to zero.

### `Unit`

Gets or sets the track sizing rule. Defaults to Auto.

### `Value`

Gets or sets the fixed size in layout units or the positive fractional weight.

## `GridUnit`


Selects how a Grid track determines its size.

### `Auto`

Sizes the track to fit its content between Minimum and Maximum.

### `Fixed`

Reserves a fixed size in layout units, clamped to Minimum and Maximum.

### `Fraction`

Allocates a proportional share of remaining space above Minimum up to Maximum.

### `MaxContent`

Sizes the track to the maximum intrinsic content size of its items.

### `MinContent`

Sizes the track to the minimum intrinsic content size of its items.

## `LayoutAlgorithm`


Measures and arranges the non-Portal children of a Container. Implementations must be immutable and must not mutate UI state during layout.

### `Arrange(LayoutContext,LayoutSize)`

Places every non-Portal child in the final content area. Indices follow Container.Children order with Portals excluded.

- `context`: The retained children available only during this callback.
- `finalSize`: The finite content size after the surrounding layout resolves the container.

### `Measure(LayoutContext,LayoutSize)`

Returns the desired content size under the available constraints, excluding the container's padding and border.

- `context`: The retained children available only during this callback.
- `available`: The maximum content size, with positive infinity on an unbounded axis.

Returns: A finite, nonnegative desired content size, clamped by the parent constraints.

## `LayoutAlign`


Selects how a child aligns within its allocated layout slot on one axis.

### `Center`

Centers the child within the slot.

### `End`

Aligns the child to the end edge of the slot (mirrored horizontally in right-to-left layouts).

### `Start`

Aligns the child to the start edge of the slot (mirrored horizontally in right-to-left layouts).

### `Stretch`

Stretches the child to fill the available slot dimension.

## `LayoutAxis`


Selects a horizontal or vertical length reference.

### `Horizontal`

Uses the available content width.

### `Vertical`

Uses the available content height.

## `LayoutConstraint`


Specifies a single-axis measurement constraint for LayoutContext.MeasureChild.

### `AtMost(float64)`

Returns a constraint that caps the child to at most the given finite, nonnegative size.

- `size`: Maximum size in layout units, or positive infinity for Unbounded.

Returns: A LayoutConstraint for the axis.

### `Exactly(float64)`

Returns a constraint that forces the child to the exact finite, nonnegative size.

- `size`: Exact size in layout units.

Returns: A LayoutConstraint for the axis.

### `MinContent`

Returns a minimum-content intrinsic measurement constraint.

### `Mode`

Gets the constraint mode.

### `Size`

Gets the constraint size in layout units when Mode is AtMost or Exactly.

### `Unbounded`

Returns an unconstrained measurement constraint.

## `LayoutContext`


Provides bounded access to retained non-Portal children during custom measure and arrange callbacks.

### `ArrangeChild(int32,ElementRect)`

Places a child margin box relative to the container's content origin. Every non-Portal child must be placed exactly once per arrange callback.

- `index`: The zero-based child index, excluding Portals.
- `bounds`: A finite, nonnegative-size margin box; offsets may be negative.

### `ChildDisplay(int32)`

Gets the Display mode of a retained child. Access outside a layout callback throws.

- `index`: The zero-based child index, excluding Portals.

Returns: The child's Display value.

### `ChildTrait``1(int32,LayoutKey{T})`

Reads a typed layout trait attached to a retained child, or returns the key's default value when absent.

- `T`: The trait value type.
- `index`: The zero-based child index, excluding Portals.
- `key`: The trait key.

Returns: The attached trait value or the key default.

### `MeasureChild(int32,LayoutConstraint,LayoutConstraint)`

Measures a retained child subtree with explicit per-axis constraints. Root margins are included in the returned size.

- `index`: The zero-based child index, excluding Portals.
- `width`: Horizontal measurement constraint.
- `height`: Vertical measurement constraint.

Returns: The child's desired margin-box size under these constraints.

### `MeasureChild(int32,LayoutSize)`

Measures a retained child subtree without rebuilding it. Root margins are included in the returned size.

- `index`: The zero-based child index, excluding Portals.
- `available`: Maximum width and height; positive infinity means unconstrained.

Returns: The child's desired margin-box size under these constraints.

### `MeasureChildBaseline(int32,LayoutConstraint,LayoutConstraint)`

Measures a retained child subtree and returns its first text baseline offset from its margin box top, when available.

- `index`: The zero-based child index, excluding Portals.
- `width`: Horizontal measurement constraint.
- `height`: Vertical measurement constraint.

Returns: Baseline offset from margin-box top, or nil when the child has no text baseline.

### `ResolveLength(Length,LayoutAxis)`

Resolves a length to layout units during the current callback. Em uses this container's font size. Percent uses the available size of the current callback.

- `value`: The pixel or relative length.
- `axis`: The available content axis for percentages.

Returns: Layout units, or nil for automatic or intrinsic values, or a nonzero percentage part without a finite basis.

### `TryGetChildTrait``1(int32,LayoutKey{T},T@)`

Tries to read a typed layout trait attached to a retained child.

- `T`: The trait value type.
- `index`: The zero-based child index, excluding Portals.
- `key`: The trait key.
- `value`: Receives the attached value, or the key default when absent.

Returns: True when the child declared the trait.

### `ChildCount`

Gets the number of retained direct children, excluding Portals. Access outside a layout callback throws.

### `ColumnGap`

Gets the resolved horizontal gap between columns or adjacent items in layout units during the current callback.

### `Direction`

Gets the effective reading direction of the container during the current callback.

### `PixelDensity`

Gets the pixel density used for layout rounding during the current callback.

### `RowGap`

Gets the resolved vertical gap between rows or stacked items in layout units during the current callback.

## `LayoutKey<T>`


Identifies a typed child layout trait attached to a Blob and queried from LayoutContext during custom layout.

### `new`

Creates a layout trait key whose default value is the default of T.

### `new(T)`

Creates a layout trait key with an explicit fallback value used when a child omits the trait.

- `defaultValue`: The value returned when a child does not declare this trait.

### `Default`

Gets the fallback value returned when a child does not declare this trait.

## `LayoutMeasureMode`


Selects how a custom layout constrains a child along one axis.

### `AtMost`

Caps the child to at most the specified size.

### `Exactly`

Forces the child to exactly the specified size.

### `MinContent`

Measures the child's minimum intrinsic content size.

### `Unbounded`

Allows the child to take its unconstrained natural size.

## `LayoutSize`


Describes a logical Width and Height, with positive infinity on unbounded axes.

## `Overlay`


Stacks children in the same content box in paint order and sizes the container to participating children.

### `Default`

Gets a shared Overlay instance with default Stretch alignment on both axes.

### `Placement`

Identifies the per-child OverlayPlacement trait.

### `new`

Initializes an Overlay layout with Stretch alignment on both axes.

### `Arrange(LayoutContext,LayoutSize)`

Arranges every child inside the final content box in declaration paint order.

- `context`: The bounded layout context for the current arrange pass.
- `finalSize`: The resolved content size.

### `Measure(LayoutContext,LayoutSize)`

Measures participating children and returns the maximum width and height.

- `context`: The bounded layout context for the current measure pass.
- `available`: The maximum available content size.

Returns: The combined desired content size.

### `Place(Blob,System.Nullable{LayoutAlign},System.Nullable{LayoutAlign},bool)`

Attaches Overlay placement options to a child blob and returns that child for fluent composition.

- `child`: The child blob to configure.
- `horizontal`: Optional horizontal alignment override.
- `vertical`: Optional vertical alignment override.
- `ignoreSize`: When true, excludes the child from the container's measured size.

Returns: The configured child blob.

### `HorizontalAlign`

Gets or sets the default horizontal alignment for children without an explicit override. Defaults to Stretch.

### `VerticalAlign`

Gets or sets the default vertical alignment for children without an explicit override. Defaults to Stretch.

## `OverlayPlacement`


Configures per-child alignment and sizing participation inside an Overlay layout.

### `HorizontalAlign`

Gets or sets the horizontal alignment override, or nil to inherit the container's HorizontalAlign.

### `IgnoreSize`

Gets or sets whether this child is excluded from the container's measured size. Defaults to false.

### `VerticalAlign`

Gets or sets the vertical alignment override, or nil to inherit the container's VerticalAlign.
