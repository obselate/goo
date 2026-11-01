# Style API

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/Style`](https://github.com/obselate/goo/tree/main/Goo/Style)

## Compose reusable styles

`Style.BasedOn` copies another style's ordered declarations at its exact declaration position. Declarations written afterward win, as in `Container{ BasedOn: CardStyle, BackgroundColor: selectedColor }`. The destination does not retain the source Style or share its declaration log.

`BackgroundGradient: nil` is an explicit clear declaration. It removes an earlier composed or lower-state gradient while preserving `BackgroundColor`. Omitting `BackgroundGradient` leaves the earlier declaration in effect.

## `AlignContent`

Source:

- [`StyleEnums.gs`](https://github.com/obselate/goo/blob/main/Goo/Style/StyleEnums.gs)

Selects cross-axis distribution for wrapped lines.

### Values

- `FlexStart`
- `Center`
- `FlexEnd`
- `Stretch`
- `SpaceBetween`
- `SpaceAround`

## `AlignItems`

Source:

- [`StyleEnums.gs`](https://github.com/obselate/goo/blob/main/Goo/Style/StyleEnums.gs)

Selects default cross-axis alignment for children.

### Values

- `Stretch`
- `FlexStart`
- `Center`
- `FlexEnd`
- `Baseline`

## `AlignSelf`

Source:

- [`StyleEnums.gs`](https://github.com/obselate/goo/blob/main/Goo/Style/StyleEnums.gs)

Selects a child's cross-axis alignment.

### Values

- `Auto`
- `Stretch`
- `FlexStart`
- `Center`
- `FlexEnd`- `Baseline`

## `BlendMode`

Source:

- [`StyleEnums.gs`](https://github.com/obselate/goo/blob/main/Goo/Style/StyleEnums.gs)

Selects how an element and its descendants composite with the backdrop.

### Values

- `Normal`
- `Multiply`
- `Screen`
- `Overlay`
- `Darken`
- `Lighten`
- `ColorDodge`
- `ColorBurn`
- `HardLight`
- `SoftLight`
- `Difference`
- `Exclusion`
- `Hue`
- `Saturation`
- `Color`
- `Luminosity`

## `BorderStyle`

Source:

- [`StyleEnums.gs`](https://github.com/obselate/goo/blob/main/Goo/Style/StyleEnums.gs)

Selects how box border edges paint.

### Values

- `Solid`
- `Dashed`
- `Dotted`

## `BoxShadow`

Source:

- [`BoxShadow.gs`](https://github.com/obselate/goo/blob/main/Goo/Style/BoxShadow.gs)

Specifies one immutable outer or inset shadow. Shapes shadow their painted fill and stroke geometry.

### `Blur`

Gets the non-negative blur radius in pixels.

### `Color`

Gets the shadow color.

### `Inset`
Gets whether the shadow is clipped inside the painted box or Shape silhouette.

### `OffsetX`

Gets the horizontal offset in pixels.

### `OffsetY`

Gets the vertical offset in pixels.

### `Spread`

Gets the spread radius in pixels.

## `Color`

Source:

- [`Color.gs`](https://github.com/obselate/goo/blob/main/Goo/Style/Color.gs)

Specifies an immutable normalized RGBA color.

### `FromNormalized(float32,float32,float32,float32)`

Creates a color from normalized (0-1) channels, clamping out-of-range values and rejecting NaN. Unlike Rgba, this does not round-trip through 8-bit, so it is the precise constructor for interpolated colors.

- `r`: The red channel from 0 through 1.
- `g`: The green channel from 0 through 1.
- `b`: The blue channel from 0 through 1.
- `a`: The alpha channel from 0 through 1.

Returns: A normalized color.

### `Parse(string)`

Parses a CSS hexadecimal or named color.

- `value`: The CSS color string to parse.

Returns: The parsed color.

### `Rgb(int32,int32,int32)`

Creates an opaque color from 8-bit channels.

- `r`: The red channel from 0 through 255.
- `g`: The green channel from 0 through 255.
- `b`: The blue channel from 0 through 255.

Returns: A normalized opaque color.

### `Rgba(int32,int32,int32,int32)`

Creates a color from 8-bit channels.

- `r`: The red channel from 0 through 255.
- `g`: The green channel from 0 through 255.
- `b`: The blue channel from 0 through 255.
- `a`: The alpha channel from 0 through 255.
Returns: A normalized color.

### `TryParse(string)`

Parses a CSS hexadecimal or named color, or returns nil.

- `value`: The CSS color string to parse.

Returns: The parsed color, or nil when the value is invalid.

### `WithAlpha(float64)`

Returns this color with a normalized alpha channel.

- `alpha`: The alpha channel from 0 through 1.

Returns: A color with the specified alpha channel.

### `op_Implicit(Color)~Edges{Color}`

Converts a color into a uniform edge value.

- `value`: color for every edge

Returns: a uniform edge value

### `op_Implicit(string)~Color`

Converts a CSS color string to Color.

- `value`: The CSS color string to convert.

Returns: The parsed color.

### `A`

Gets the normalized alpha channel.

### `B`

Gets the normalized blue channel.

### `Black`

Gets opaque black.

### `G`

Gets the normalized green channel.

### `R`

Gets the normalized red channel.

### `Transparent`

Gets transparent black.

### `White`
Gets opaque white.

## `Cursor`

Source:

- [`StyleEnums.gs`](https://github.com/obselate/goo/blob/main/Goo/Style/StyleEnums.gs)

Selects the system pointer cursor shown over an element and its descendants.

### Values

- `Default`
- `Pointer`
- `Text`
- `Crosshair`
- `Move`
- `NotAllowed`
- `Wait`
- `Progress`
- `ResizeHorizontal`
- `ResizeVertical`
- `ResizeNorthwestSoutheast`
- `ResizeNortheastSouthwest`
- `ResizeNorthwest`
- `ResizeNorth`
- `ResizeNortheast`
- `ResizeEast`
- `ResizeSoutheast`
- `ResizeSouth`
- `ResizeSouthwest`
- `ResizeWest`

## `Direction`

Source:

- [`StyleEnums.gs`](https://github.com/obselate/goo/blob/main/Goo/Style/StyleEnums.gs)

Selects the inherited inline direction used by layout and logical edges. Auto keeps flex layout left-to-right and detects each text paragraph's direction.

### Values

- `Auto`
- `LeftToRight`
- `RightToLeft`

## `Display`

Source:

- [`StyleEnums.gs`](https://github.com/obselate/goo/blob/main/Goo/Style/StyleEnums.gs)

Selects whether an element participates in layout.

### Values

- `Flex`
- `None`
## `Easing`

Source:

- [`StyleEnums.gs`](https://github.com/obselate/goo/blob/main/Goo/Style/StyleEnums.gs)

Selects the curve that shapes transition progress; Ease curves are quadratic.

### Values

- `Linear`
- `EaseIn`
- `EaseOut`
- `EaseInOut`

## `Edges`

Source:

- [`Edges.gs`](https://github.com/obselate/goo/blob/main/Goo/Style/Edges.gs)

Specifies CSS-style top, right, bottom, and left lengths. One value applies to all edges. Two values mean vertical and horizontal. Three values mean top, horizontal, and bottom.

### `new(Length)`

Applies one length to every edge.

- `all`: length for every edge

### `new(Length,Length)`

Applies one length vertically and another horizontally.

- `vertical`: top and bottom length
- `horizontal`: right and left length

### `new(Length,Length,Length)`

Applies top, horizontal, and bottom lengths.

- `top`: top length
- `horizontal`: right and left length
- `bottom`: bottom length

### `new(Length,Length,Length,Length)`

Applies top, right, bottom, and left lengths in CSS order.

- `top`: top length
- `right`: right length
- `bottom`: bottom length
- `left`: left length

### `op_Implicit(float64)~Edges`

Converts pixel values into a uniform edge value.

- `value`: pixel length for every edge
