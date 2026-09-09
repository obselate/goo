# Goo SVG compiler

`Goo.SvgCompiler` converts the accepted SVG subset into deterministic little-endian GCV1 bytes.

Install the framework-dependent .NET tool:

```text
dotnet tool install --global Goo.SvgCompiler --version 0.5.2
goo-svgc --check input.svg
goo-svgc input.svg output.gcv1
```

The tool targets .NET 10 and has no runtime package dependencies. It emits a compact GCV1 asset
for embedding by an application that references Goo.

```text
dotnet run --project tools/Goo.SvgCompiler -c Release -- \
  tools/Goo.SvgCompiler/samples/s13-representative.svg /tmp/s13.gcv1
```

`--check` compiles twice, verifies byte-for-byte deterministic output, validates the current 11-section
GCV1 header, sections, and track/keyframe contents without writing a file, and reports the SHA-256.
`--goo-check` performs the same deterministic check before loading the bytes through
`Goo.CompiledVectorAsset.Load`.

```text
dotnet run --project tools/Goo.SvgCompiler -c Release -- --check \
  tools/Goo.SvgCompiler/samples/s13-animated.svg
```

The static subset includes a positive `viewBox`, groups, affine transforms, inherited opacity, paths,
rectangles, ellipses, lines, polylines, polygons, solid paints, local linear and radial gradients with
stops for fills, solid-color strokes and dashes, and user-space path clips. Gradient strokes are
rejected because the GCV1 stroke path has no compatible gradient representation. Object-bounding-box
gradient transforms are rejected because their coordinate space is not retained by GCV1. Radial
gradient focal attributes, user-space radius percentages, and non-axis-aligned gradient transforms
are rejected because the Vulkan radial primitive preserves only center and axis-aligned radii.

The controlled animation subset includes `animateTransform` for matrix, translate, scale, rotate, skewX,
and skewY values. `animate` supports node opacity, solid fill and stroke colors, stroke width, miter
limit, line cap, line join, and dash offset. Values use `values` or `from` and `to`. Key times, linear,
step, and cubic spline easing are bounded and deterministic. Begin must be immediate, additive and
accumulate modes must be replace and none, restart must be always, and fill must be freeze. Finite
integer repeats from one through 64 are unrolled. `repeatCount="indefinite"` emits the GCV1 loop flag.
Path morph animation uses `attributeName="d"` or `attributeName="path"`, normalizes every target with
the same path parser as static geometry, and requires identical contour count, curve count, closed
flags, and endpoint connectivity. Morph keyframes use the same linear, step, and cubic spline easing
fields as regular keyframes.

The compiler rejects event-driven or delayed timing, CSS animation, additive or accumulate semantics,
general SMIL elements, filters, masks, scripts, selectors, external references, runtime DOM features,
unsupported paint or stroke properties, and incompatible path morph targets. It reports a deterministic
line and column diagnostic when a target has incompatible topology.

The emitted morph ABI is:

1. Use the current 11-section, 172-byte GCV1 header. Section 10 is `MorphCurves` with 24-byte records
   containing `X0`, `Y0`, `CX`, `CY`, `X1`, and `Y1` float32 values.
2. Add `Morph` as track kind 4 and value kind 4. A morph track uses the existing 24-byte track record
   and points at existing 48-byte keyframes.
3. A morph node stores its track index at node byte offset 44. The base node contours define the
   topology and curve count.
4. A morph keyframe stores `Time` as float32 at offset 0, `TargetCurveStart` as uint32 at offset 4,
   and `TargetCurveCount` as uint32 at offset 8. Offsets 12 through 24 remain zero. Offsets 28 through
   44 use the regular keyframe easing and cubic control fields. The target count must equal the sum of
   base curve counts, and the target range must lie in MorphCurves.
5. Each target curve sequence must preserve base contour count, curve count, open or closed state,
   and exact endpoint continuity. The runtime validates this topology before accepting the asset.

This tool emits morph tracks without changing the Goo ABI.
