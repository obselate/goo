# Style API

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/Style`](../../Goo/Style)

## Compose reusable styles

`Style.BasedOn` copies another style's ordered declarations at its exact declaration position. Declarations written afterward win, as in `Container{ BasedOn: CardStyle, BackgroundColor: selectedColor }`. The destination does not retain the source Style or share its declaration log.

`BackgroundGradient: nil` is an explicit clear declaration. It removes an earlier composed or lower-state gradient while preserving `BackgroundColor`. Omitting `BackgroundGradient` leaves the earlier declaration in effect.

## `AlignContent`

Source:

- [`StyleEnums.gs`](../../Goo/Style/StyleEnums.gs)

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

- [`StyleEnums.gs`](../../Goo/Style/StyleEnums.gs)

Selects default cross-axis alignment for children.

### Values

- `Stretch`
- `FlexStart`
- `Center`
- `FlexEnd`
- `Baseline`

## `AlignSelf`

Source:

- [`StyleEnums.gs`](../../Goo/Style/StyleEnums.gs)

Selects a child's cross-axis alignment.

### Values

- `Auto`
- `Stretch`
- `FlexStart`
- `Center`
- `FlexEnd`
- `Baseline`

## `BlendMode`

Source:

- [`StyleEnums.gs`](../../Goo/Style/StyleEnums.gs)

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

- [`StyleEnums.gs`](../../Goo/Style/StyleEnums.gs)

Selects how box border edges paint.

### Values

- `Solid`
- `Dashed`
- `Dotted`

## `BoxShadow`

Source:

- [`BoxShadow.gs`](../../Goo/Style/BoxShadow.gs)

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

- [`Color.gs`](../../Goo/Style/Color.gs)

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

- [`StyleEnums.gs`](../../Goo/Style/StyleEnums.gs)

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

- [`StyleEnums.gs`](../../Goo/Style/StyleEnums.gs)

Selects the inherited inline direction used by layout and logical edges. Auto keeps flex layout left-to-right and detects each text paragraph's direction.

### Values

- `Auto`
- `LeftToRight`
- `RightToLeft`

## `Display`

Source:

- [`StyleEnums.gs`](../../Goo/Style/StyleEnums.gs)

Selects whether an element participates in layout.

### Values

- `Flex`
- `None`

## `Easing`

Source:

- [`StyleEnums.gs`](../../Goo/Style/StyleEnums.gs)

Selects the curve that shapes transition progress; Ease curves are quadratic.

### Values

- `Linear`
- `EaseIn`
- `EaseOut`
- `EaseInOut`

## `FlexDirection`

Source:

- [`StyleEnums.gs`](../../Goo/Style/StyleEnums.gs)

Selects the main-axis direction of a flex container.

### Values

- `Column`
- `ColumnReverse`
- `Row`
- `RowReverse`

## `FlexWrap`

Source:

- [`StyleEnums.gs`](../../Goo/Style/StyleEnums.gs)

Selects how flex children wrap.

### Values

- `NoWrap`
- `Wrap`
- `WrapReverse`

## `FontStyle`

Source:

- [`StyleEnums.gs`](../../Goo/Style/StyleEnums.gs)

Selects the font slant.

### Values

- `Normal`
- `Italic`

## `Gradient`

Source:

- [`Gradient.gs`](../../Goo/Style/Gradient.gs)

Paints a background with interpolated color stops.

### `Stops`

Gets the ordered color stops.

## `GradientStop`

Source:

- [`Gradient.gs`](../../Goo/Style/Gradient.gs)

Specifies one immutable gradient color stop.

### `Color`

Gets the stop color.

### `Offset`

Gets the stop position from 0 through 1.

## `JustifyContent`

Source:

- [`StyleEnums.gs`](../../Goo/Style/StyleEnums.gs)

Selects main-axis child distribution.

### Values

- `FlexStart`
- `Center`
- `FlexEnd`
- `SpaceBetween`
- `SpaceAround`
- `SpaceEvenly`

## `Length`

Source:

- [`Length.gs`](../../Goo/Style/Length.gs)

Specifies a layout length.

### `Percent(float64)`

Creates a percentage of the available size.

- `value`: percentage of the available size

Returns: a percentage length

### `op_Implicit(float64)~Length`

Converts a pixel value to a length.

- `value`: length in pixels

Returns: a pixel length

### `op_Implicit(int32)~Length`

Converts an integer pixel value to a length.

- `value`: length in pixels

Returns: a pixel length

### `Auto`

Gets an automatic layout length.

### `HasMagnitude`

Gets whether this length has a concrete magnitude (pixels or percent), as opposed to Auto or an unset default. Magnitude is only defined when this is true.

### `IsPercent`

Gets whether this length is a percentage of the available size, as opposed to an absolute pixel value.

### `Magnitude`

Gets the raw numeric magnitude: pixels when IsPercent is false, percentage points (0-100) when true. Undefined for Auto/unset lengths; check HasMagnitude first.

## `LinearGradient`

Source:

- [`Gradient.gs`](../../Goo/Style/Gradient.gs)

Paints a straight-line gradient at an angle.

### `new(Color[])`

Creates a top-to-bottom linear gradient from evenly spread colors.

- `colors`: At least two colors, spread evenly from 0 through 1.

### `new(float64,Color[])`

Creates an angled linear gradient from evenly spread colors.

- `angle`: The finite direction in degrees. Zero points up and positive angles turn clockwise.
- `colors`: At least two colors, spread evenly from 0 through 1.

### `new(float64,GradientStop[])`

Creates an angled linear gradient from explicit stops.

- `angle`: The finite direction in degrees. Zero points up and positive angles turn clockwise.
- `stops`: At least two stops with non-decreasing offsets.

### `Angle`

Gets the direction in degrees. Zero points up and positive angles turn clockwise.

### `Stops`

Gets the ordered color stops.

## `Overflow`

Source:

- [`StyleEnums.gs`](../../Goo/Style/StyleEnums.gs)

Selects overflow behavior.

### Values

- `Visible`
- `Hidden`
- `Scroll`

## `PanelTransform`

Source:

- [`PanelTransform.gs`](../../Goo/Style/PanelTransform.gs)

Specifies one normalized 2D panel transform. Scale runs first, then skew, then rotation, then translation.

### `Equals(PanelTransform)`

Tests whether another transform has the same normalized components.

### `op_Equality(PanelTransform,PanelTransform)`

Tests two panel transforms for normalized component equality.

### `op_Inequality(PanelTransform,PanelTransform)`

Tests two panel transforms for normalized component inequality.

### `Rotate`

Gets or sets clockwise rotation in degrees. Authored turns are preserved for interpolation.

### `Scale`

Gets or sets uniform scale. The default is 1.

### `ScaleX`

Gets or sets horizontal scale. It multiplies with Scale. The default is 1.

### `ScaleY`

Gets or sets vertical scale. It multiplies with Scale. The default is 1.

### `SkewX`

Gets or sets the horizontal skew angle in degrees.

### `SkewY`

Gets or sets the vertical skew angle in degrees.

### `TranslateX`

Gets or sets the horizontal pixel or percentage translation. An explicit percentage unit is retained at zero for transitions.

### `TranslateY`

Gets or sets the vertical pixel or percentage translation. An explicit percentage unit is retained at zero for transitions.

## `PositionType`

Source:

- [`StyleEnums.gs`](../../Goo/Style/StyleEnums.gs)

Selects relative, absolute, or static positioning; static ignores inset offsets.

### Values

- `Relative`
- `Absolute`
- `Static`

## `RadialGradient`

Source:

- [`Gradient.gs`](../../Goo/Style/Gradient.gs)

Paints a circular gradient from a normalized center.

### `new(Color[])`

Creates a centered radial gradient from evenly spread colors.

- `colors`: At least two colors, spread evenly from 0 through 1.

### `new(float64,float64,float64,GradientStop[])`

Creates a radial gradient from explicit geometry and stops.

- `centerX`: The normalized horizontal center from 0 through 1.
- `centerY`: The normalized vertical center from 0 through 1.
- `radius`: The normalized radius above 0 and at most 1.
- `stops`: At least two stops with non-decreasing offsets.

### `CenterX`

Gets the normalized horizontal center from 0 through 1.

### `CenterY`

Gets the normalized vertical center from 0 through 1.

### `Radius`

Gets the normalized radius above 0 and at most 1.

### `Stops`

Gets the ordered color stops.

## `Style`

Source:

- [`Style.gs`](../../Goo/Style/Style.gs)

Collects ordered layout, paint, and text declarations. Use BasedOn to copy reusable declarations. G# object spread does not copy them.

### `new`

Creates an empty write-only style declaration sink.

### `AlignContent`

Sets cross-axis line distribution.

### `AlignItems`

Sets cross-axis alignment for child items.

### `AlignSelf`

Sets this item's cross-axis alignment.

### `AspectRatio`

Sets the preferred width-to-height ratio.

### `BackgroundColor`

Sets the background color.

### `BackgroundGradient`

Sets or explicitly clears the background gradient. A non-nil gradient wins over BackgroundColor when both apply.

### `BackgroundImage`

Sets the local image path painted over the background fill.

### `BackgroundImageFit`

Sets how the background image fits its border box. The default is Cover.

### `BackgroundImageSource`

Sets the owned or provider-backed background source. It wins over BackgroundImage when set.

### `BasedOn`

Copies another style's ordered declarations at this declaration position. The copy does not retain the source Style. Declarations written later take precedence.

### `BlendMode`

Sets how this element and its descendants composite with the backdrop.

### `BorderBottomColor`

Sets the bottom box border color.

### `BorderBottomLeftRadius`

Sets the bottom-left border radius.

### `BorderBottomRightRadius`

Sets the bottom-right border radius.

### `BorderBottomWidth`

Sets the bottom box border width.

### `BorderColor`

Sets every box border color or the uniform Shape stroke color.

### `BorderEndColor`

Sets the box border color at the inline end edge.

### `BorderEndWidth`

Sets the box border width at the inline end edge.

### `BorderLeftColor`

Sets the left box border color.

### `BorderLeftWidth`

Sets the left box border width.

### `BorderRadius`

Sets the radius of all border corners.

### `BorderRightColor`

Sets the right box border color.

### `BorderRightWidth`

Sets the right box border width.

### `BorderStartColor`

Sets the box border color at the inline start edge.

### `BorderStartWidth`

Sets the box border width at the inline start edge.

### `BorderStyle`

Sets how box border edges paint. Dashed and Dotted stroke one ring using the top border width and color. Shape strokes are unchanged.

### `BorderTopColor`

Sets the top box border color.

### `BorderTopLeftRadius`

Sets the top-left border radius.

### `BorderTopRightRadius`

Sets the top-right border radius.

### `BorderTopWidth`

Sets the top box border width.

### `BorderWidth`

Sets every box border width or the uniform Shape stroke width.

### `Bottom`

Sets the bottom position offset.

### `BoxShadow`

Sets one outer or inset shadow as a one-item shadow stack. Shapes shadow their painted fill and stroke geometry.

### `BoxShadows`

Sets the defensively copied front-to-back shadow stack. An empty array clears state-layer shadows. Shape shadows follow painted fill and stroke geometry.

### `ClipPath`

Sets a vector path with a contour that clips this element and its descendants.

### `ClipPathFillRule`

Sets the fill rule used by ClipPath.

### `ClipPathFit`

Sets how ClipPath maps into the element border box. The default is Fill.

### `Color`

Sets the text color.

### `ColumnGap`

Sets the gap between columns.

### `Cursor`

Sets the inherited system pointer cursor.

### `Direction`

Sets the inherited inline direction used by layout and logical edges.

### `Display`

Sets whether the element participates in layout.

### `End`

Sets the inline end position offset.

### `FlexBasis`

Sets the initial main-axis size.

### `FlexDirection`

Sets the main-axis direction.

### `FlexGrow`

Sets the flex grow factor.

### `FlexShrink`

Sets the flex shrink factor.

### `FlexWrap`

Sets whether items wrap onto multiple lines.

### `FontFamily`

Sets the preferred font family.

### `FontSize`

Sets the font size.

### `FontStyle`

Sets the font style.

### `FontWeight`

Sets the font weight.

### `Gap`

Sets the gap between rows and columns.

### `Height`

Sets the preferred height.

### `JustifyContent`

Sets main-axis item distribution.

### `Left`

Sets the left position offset.

### `LetterSpacing`

Sets added spacing between letters.

### `LineHeight`

Sets the line-height multiplier.

### `Margin`

Sets margins on all edges.

### `MarginBottom`

Sets the bottom margin.

### `MarginEnd`

Sets the margin at the inline end edge.

### `MarginLeft`

Sets the left margin.

### `MarginRight`

Sets the right margin.

### `MarginStart`

Sets the margin at the inline start edge.

### `MarginTop`

Sets the top margin.

### `MaxHeight`

Sets the maximum height.

### `MaxWidth`

Sets the maximum width.

### `MinHeight`

Sets the minimum height.

### `MinWidth`

Sets the minimum width.

### `Opacity`

Sets opacity from 0 through 1.

### `OutlineColor`

Sets the color of the box outline.

### `OutlineOffset`

Sets the signed pixel offset from the border edge. Positive values move the outline outward.

### `OutlineWidth`

Sets the non-negative pixel thickness of the box outline. Shape does not paint box outlines.

### `Overflow`

Sets overflow handling on both axes.

### `OverflowX`

Sets horizontal overflow handling.

### `OverflowY`

Sets vertical overflow handling.

### `Padding`

Sets padding on all edges.

### `PaddingBottom`

Sets bottom padding.

### `PaddingEnd`

Sets padding at the inline end edge.

### `PaddingLeft`

Sets left padding.

### `PaddingRight`

Sets right padding.

### `PaddingStart`

Sets padding at the inline start edge.

### `PaddingTop`

Sets top padding.

### `Position`

Sets relative, absolute, or static positioning.

### `Right`

Sets the right position offset.

### `RowGap`

Sets the gap between rows.

### `ShaderEffect`

Sets a layout-neutral fragment effect over the element and its retained subtree.

### `Start`

Sets the inline start position offset.

### `TextAlign`

Sets horizontal text alignment.

### `TextDecoration`

Sets the inherited lines painted with text. Values can be combined.

### `TextMaxLines`

Caps visual lines in static Text. Zero keeps all lines; negative values throw ArgumentOutOfRangeException. It does not inherit, change TextEntry, or interpolate through transitions.

### `TextShadow`

Sets one inherited text shadow as a one-item shadow stack.

### `TextShadows`

Sets the defensively copied inherited front-to-back text shadow stack. An empty array clears inherited text shadows.

### `TextStrokeColor`

Sets the inherited glyph stroke color without changing text layout.

### `TextStrokeWidth`

Sets the inherited non-negative pixel width of the glyph stroke. The stroke is paint-only, outlines glyphs only, and snaps during transitions.

### `TextTransform`

Sets inherited invariant casing for static Text. TextEntry is unchanged.

### `TextTrimming`

Sets how overflowing static text is trimmed.

### `TextWrap`

Sets whether static text wraps at soft-wrap opportunities.

### `Top`

Sets the top position offset.

### `Transform`

Sets a layout-neutral 2D transform for this element and its descendants. Components interpolate only when their length units match.

### `TransformOriginX`

Sets the horizontal transform origin. The default is 50 percent.

### `TransformOriginY`

Sets the vertical transform origin. The default is 50 percent.

### `Visibility`

Sets whether this element and its descendants paint and receive input. Hidden elements remain in layout and retain their state.

### `Width`

Sets the preferred width.

### `ZIndex`

Sets this element's stacking order among direct siblings.

## `TextAlign`

Source:

- [`StyleEnums.gs`](../../Goo/Style/StyleEnums.gs)

Selects horizontal text alignment. Start is the default and follows paragraph direction.

### Values

- `Left`
- `Center`
- `Right`
- `Start`
- `End`

## `TextDecoration`

Source:

- [`StyleEnums.gs`](../../Goo/Style/StyleEnums.gs)

Selects the lines painted with text. Values can be combined.

### Values

- `None`
- `Underline`
- `LineThrough`

## `TextShadow`

Source:

- [`TextShadow.gs`](../../Goo/Style/TextShadow.gs)

Specifies one immutable text shadow.

### `Blur`

Gets the non-negative blur radius in pixels.

### `Color`

Gets the shadow color.

### `OffsetX`

Gets the horizontal offset in pixels.

### `OffsetY`

Gets the vertical offset in pixels.

## `TextTransform`

Source:

- [`StyleEnums.gs`](../../Goo/Style/StyleEnums.gs)

Selects invariant casing for static text.

### Values

- `None`
- `Uppercase`
- `Lowercase`

## `TextTrimming`

Source:

- [`StyleEnums.gs`](../../Goo/Style/StyleEnums.gs)

Selects how overflowing static text is trimmed.

### Values

- `None`
- `Ellipsis`

## `TextWrap`

Source:

- [`StyleEnums.gs`](../../Goo/Style/StyleEnums.gs)

Selects whether static text wraps at soft-wrap opportunities.

### Values

- `Wrap`
- `NoWrap`

## `Tokens`

Source:

- [`Tokens.gs`](../../Goo/Style/Tokens.gs)

Provides typed lexical context to synchronous component functions. A scope ends when its body returns and does not flow into later Cell builds.

### `Get``1`

Gets the token set active in the current synchronous scope.

- `T`: The token-set type.

Returns: The active token set.

### `Scope``2(T,System.Func{R})`

Runs a synchronous component body with tokens active only until the body returns.

- `T`: The token-set type.
- `R`: The result type.
- `tokens`: The token set to make active.
- `body`: The synchronous body to run while the token set is active.

Returns: The value returned by the body.

## `TransitionProperty`

Source:

- [`TransitionProperty.gs`](../../Goo/Style/TransitionProperty.gs)

Selects a style property that can interpolate during a transition.

### Values

- `All`
- `Width`
- `Height`
- `MinWidth`
- `MinHeight`
- `MaxWidth`
- `MaxHeight`
- `AspectRatio`
- `Padding`
- `PaddingLeft`
- `PaddingTop`
- `PaddingRight`
- `PaddingBottom`
- `Margin`
- `MarginLeft`
- `MarginTop`
- `MarginRight`
- `MarginBottom`
- `Gap`
- `RowGap`
- `ColumnGap`
- `FlexGrow`
- `FlexShrink`
- `FlexBasis`
- `Left`
- `Top`
- `Right`
- `Bottom`
- `BackgroundColor`
- `BorderRadius`
- `BorderTopLeftRadius`
- `BorderTopRightRadius`
- `BorderBottomLeftRadius`
- `BorderBottomRightRadius`
- `BorderWidth`
- `BorderLeftWidth`
- `BorderTopWidth`
- `BorderRightWidth`
- `BorderBottomWidth`
- `BorderColor`
- `BorderLeftColor`
- `BorderTopColor`
- `BorderRightColor`
- `BorderBottomColor`
- `Opacity`
- `BoxShadow`
- `Color`
- `FontSize`
- `FontWeight`
- `LetterSpacing`
- `LineHeight`
- `Transform`

## `Visibility`

Source:

- [`StyleEnums.gs`](../../Goo/Style/StyleEnums.gs)

Selects whether an element and its descendants are visible and interactive.

### Values

- `Visible`
- `Hidden`
