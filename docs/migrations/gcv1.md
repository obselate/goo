# Migrate GCV1 assets to Goo.Svg

Goo 0.6.0 removes the GCV1 binary vector format and the
`Goo.SvgCompiler` tool. Existing `.gcv1` files cannot be loaded by the new runtime.
Applications that already use `Goo.Svg.Svg.Parse` or `Svg.Load` keep the same loading
API. These methods now build `VectorAsset` directly, without a binary round trip.

## Replace compiled files with SVG sources

1. Add a reference to `Goo.Svg` from the same release as `Goo`.
2. Package the original `.svg` files as content or embedded resources instead of
   generated `.gcv1` files.
3. Remove `Goo.SvgCompiler` from tool manifests and remove `goo-svgc` build steps,
   including `--check` and `--goo-check` invocations.
4. Replace binary loading with the corresponding SVG loading method.

| Previous API | Replacement |
| --- | --- |
| `VectorAsset.Load(gcv1Bytes)` | `Svg.Load(svgPath)`, `Svg.Load(svgStream)`, or `Svg.Parse(svgText)` |
| `CompiledVectorAsset.Load(gcv1Bytes)` | The same SVG methods, returning `VectorAsset` |
| `VectorAsset.TryLoad(gcv1Bytes)` or `CompiledVectorAsset.TryLoad(gcv1Bytes)` | Catch `SvgParseException` when parsing SVG content. File and stream I/O can also fail. |
| `asset.Render()` or `asset.Render(key)` | Keep the same calls on the returned `VectorAsset` |

For a G# application, replace:

```gsharp
let icon = VectorAsset.Load(File.ReadAllBytes("icon.gcv1"))
```

with:

```gsharp
import Goo.Svg

let icon = Svg.Load("icon.svg")
```

Load once and retain the asset outside repeated `Cell.Build` calls. Rendering
remains the same:

```gsharp
Container{Width: 32, Height: 32, icon.Render(),}
```

For embedded SVG content, pass the resource stream to `Svg.Load(stream)`.
It reads from the current position and leaves the caller's stream open. Byte arrays
must contain SVG XML and can be wrapped in a stream. Passing old GCV1 bytes to
the SVG parser does not convert them.

There is no GCV1-to-SVG conversion tool in this change. Recover the original SVG
sources before upgrading. If only the binary assets remain, retain the previous
compatible runtime until those assets can be replaced.

## Removed types and metadata

`CompiledVectorAsset` is removed. Both binary `Load(byte[])` and `TryLoad(byte[])`
methods are removed from `VectorAsset`.

The GCV1 properties `Version`, `Flags`, `ByteCount`, `TrackCount`, `KeyframeCount`,
and `MorphCurveCount` are removed from `VectorAsset`. There is no replacement
serialization format or public animation-track inspection API. Remove code that
depends on the binary header or section counts. Applications that need the source
file size can track it separately.

`VectorAsset` retains its view-box properties, `Nodes`, `NodeAt`, `PathForNode`,
geometry/paint/stroke/clip counts, and rendering methods. Authored assets built
from `VectorNode` trees still require only the core `Goo` package.

## Animation and validation

The supported SVG animation subset, including compatible path morphs, is retained
as typed in-memory data and plays through `VectorAsset.Render`. Removing the binary
track metadata does not remove animation playback.

Runtime parsing still accepts a bounded SVG subset. It is not a general browser
SVG renderer. See [Goo.Svg's supported features and exclusions](../../Goo.Svg/README.md).
Invalid or unsupported SVG content raises `SvgParseException`. XML DTDs and external
entity resolution remain disabled.

To retain a build-time asset check after removing `goo-svgc --check`, load each
packaged SVG with `Svg.Load` in an application asset-validation step and fail on
parse or I/O errors. This validates source acceptance, not deterministic GCV1 bytes.
Check representative rendering and animation after migrating the assets.
