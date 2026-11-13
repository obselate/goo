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
- `Inset` sets all four position offsets. Later offsets override individual edges.

## Relative and intrinsic lengths

```gsharp
Container{Width: Percent(100) - Rem(2), MaxHeight: Vh(25)}
Container{Width: Length.FitContent(Em(32.5))}
```

- Numbers are layout pixels. G# uses `Percent`, `Em`, `Rem`, `Vw` and `Vh`. Other .NET languages can use `Length.Pixels`, `Length.Percent`, `Length.Em`, `Length.Rem`, `Length.Vw` and `Length.Vh`.
- `Em` uses the element's computed font size. In `FontSize`, it uses the parent's font size. `Rem` uses the root font size. Platform text scale applies once.
- `Vw` and `Vh` use percentages of the window layout viewport.
- Add or subtract lengths, or multiply and divide them by a number. Automatic and intrinsic values cannot be operands.
- `FontSize` accepts pixels, `Em`, and `Rem`. Properties that reject percentages also reject relative units.
- `Length.MinContent`, `Length.MaxContent`, and `Length.FitContent(limit)` apply to width, height, their minimum and maximum bounds, and `FlexBasis`. They measure retained content without calling `Build`.
- In a custom layout callback, `context.ResolveLength(value, LayoutAxis.Horizontal)` resolves against the available content width. `Vertical` uses height. Automatic and intrinsic values return `nil`.
- Length animations accept one unit. Mixed lengths throw `ArgumentException`.

## Padding and margin

`Padding` and `Margin` accept pixel numbers or `Edges`. Two arguments mean
vertical and horizontal, not top and left. Three and four arguments follow CSS
order. Use named edges to set only specific sides. Omitted sides keep their
`BasedOn` values, or default to zero. There is no `nil` placeholder for omitted
sides. Use a uniform base to explicitly clear the other sides.

`PaddingStart`, `PaddingEnd`, `MarginStart`, and `MarginEnd` remain available for
direction-aware edges.

```gsharp
Container{ Padding: 8, Margin: Edges(4, 12) }
Container{ Padding: Edges(4, 12, 8), Margin: Edges(4, 8, 12, 16) }
Container{ BasedOn: cardStyle, Padding: Edges{ Top: 10, Left: 6 } }
Container{ BasedOn: cardStyle, Padding: Edges(0){ .Top: 10, .Left: 6 } }
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
Container{ BorderWidth: 2, BorderColor: red }
Container{ BorderWidth: Edges{ Top: 2, Left: 4 }, BorderColor: Edges[Color]{ Top: red, Left: blue } }
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
call `context.ArrangeChild(index, bounds)` exactly once for every direct child,
including hidden children. Bounds are margin boxes relative to the content origin;
Goo subtracts child margins before arranging the child's border box. The algorithm
controls final width/height even when the child has an authored size or size limit;
those declarations participate in measurement. Normal relative child offsets still
apply. Custom layout owns track/gap and out-of-flow policy; all direct children
participate. Scroll extents and layout transitions include custom placements.

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
      context.ArrangeChild(i, ElementRect{
        Y: y, Width: finalSize.Width, Height: child.Height,
      })
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
