# SVG loading

```gsharp
import Goo.Svg

let icon = Svg.Load("icon.svg")
Container{Width: 32, Height: 32, icon.Render(),}
```

Reference `Goo`. Load once and retain the asset outside `Build`.
See the [SVG API](api/svg.md) for string and stream overloads.

Authored `VectorNode` trees also use `VectorAsset(x, y, width, height, roots)`.

Author paths and transforms in the asset's view-box coordinates. A path's own
view-box metadata does not independently resize it within a document. Node child
arrays are copied, paints and strokes are immutable, and nodes can be reused.
Rendering contains the complete document within its parent while preserving its
aspect ratio. Strokes, clips, and nested transforms scale with the document.

Input is limited to 16 MiB, including forward-only streams. `Load(Stream)` reads
from the current position and leaves the stream open. XML depth limits are separate.

The supported subset includes paths, groups, affine transforms, opacity, solid paints,
linear and radial gradients, strokes, dashes, user-space clips, controlled transform,
opacity, color, stroke, and compatible-topology path morph animation. Root SVG documents
must provide a positive `viewBox`, or positive `width` and `height` when no viewBox exists.

Gradient strokes, object-bounding-box gradient transforms, nested SVG, text, images, CSS,
scripts, filters, masks, external references, event-driven SMIL, and incompatible morph
topologies are rejected. XML DTDs and external entity resolution are disabled.
