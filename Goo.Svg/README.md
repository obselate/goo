# Goo.Svg

`Goo.Svg` is an optional runtime loader for Goo's immutable `VectorAsset` documents.

```csharp
using Goo.Svg;

var asset = Svg.Parse(svgText);
var fromStream = Svg.Load(stream);
var fromFile = Svg.Load("icon.svg");
```

Load once and retain the asset instead of parsing inside each `Build` call.
Render the same reusable asset at the size of its parent:

```gsharp
let icon = Svg.Load("icon.svg")
Container{Width: 32, Height: 32, icon.Render(),}
```

The core `Goo` package also supports authored `VectorNode` trees through
`VectorAsset(x, y, width, height, roots)` without the SVG package.

Author paths and transforms in the asset's view-box coordinates. A path's own
view-box metadata does not independently resize it within a document. Node child
arrays are copied, paints and strokes are immutable, and nodes can be reused.
Rendering contains the complete document within its parent while preserving its
aspect ratio. Strokes, clips, and nested transforms scale with the document.

Text, stream, and file loading use the same runtime parser. `Load(Stream)` reads from
the current stream position and leaves the caller's stream open.

The supported subset includes paths, groups, affine transforms, opacity, solid paints,
linear and radial gradients, strokes, dashes, user-space clips, controlled transform,
opacity, color, stroke, and compatible-topology path morph animation. Root SVG documents
must provide a positive `viewBox`, or positive `width` and `height` when no viewBox exists.

Gradient strokes, object-bounding-box gradient transforms, nested SVG, text, images, CSS,
scripts, filters, masks, external references, event-driven SMIL, and incompatible morph
topologies are rejected. XML DTDs and external entity resolution are disabled.
