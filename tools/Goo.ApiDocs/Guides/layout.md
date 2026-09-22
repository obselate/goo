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

A context is valid only on the UI thread inside its current callback. Out-of-phase use, duplicate or
missing arrangements, invalid sizes, reentrant window layout, and more than 64
nested custom measurement callbacks throw. Do not mutate the UI or an algorithm's configuration
inside its callbacks. Replace a policy object when its configuration changes.
Content, font, image, child-list, and child-style changes invalidate affected
measurements automatically; changing available width uses a new constraint key.

Each measured child keeps at most four cached sizes, invalidated with its custom
parent when a retained child layout becomes dirty. Each callback permits at most
`min(65536, max(32, childCount * 16))` calls to `MeasureChild`. Structural updates
perform an O(n) child-index rebuild while retaining matching child state. Unchanged
geometry and scroll-only updates reuse the completed arrangement. Ordinary flex
containers allocate no custom-layout state.

```gsharp
class VerticalLayout : LayoutAlgorithm {
  public func Measure(context LayoutContext, available LayoutSize) LayoutSize {
    var width = 0.0
    var height = 0.0
    for i in 0 ... context.ChildCount {
      let child = context.MeasureChild(i, LayoutSize{
        Width: available.Width, Height: System.Double.PositiveInfinity,
      })
      width = System.Math.Max(width, child.Width)
      height += child.Height
    }
    return LayoutSize{Width: width, Height: height}
  }

  public func Arrange(context LayoutContext, finalSize LayoutSize) {
    var y = 0.0
    for i in 0 ... context.ChildCount {
      let child = context.MeasureChild(i, LayoutSize{
        Width: finalSize.Width, Height: System.Double.PositiveInfinity,
      })
      context.ArrangeChild(i, ElementRect{
        Y: y, Width: finalSize.Width, Height: child.Height,
      })
      y += child.Height
    }
  }
}
```
