# Rendering API

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/Rendering`](../../Goo/Rendering)

## Apply fragment shaders to retained elements

Load one backend-neutral `ShaderEffectProgram`, create retained `ShaderEffect` state from it, and assign the effect through the ordinary `Style.ShaderEffect` property on a `Container`, `Button`, `Text`, `Image`, `Shape`, or another Blob. Goo renders that element and its subtree into a bounded offscreen layer, runs the selected backend artifact, then composites the result without changing layout, hit testing, accessibility, transforms, or clipping.

```gsharp
import System
import System.IO
import System.Numerics
import Goo

let path = Path.Combine(AppContext.BaseDirectory, "Shaders", "glass.goo-effect")
let program = ShaderEffectProgram.Load(path)
let effect = ShaderEffect(program,
  samplesBackdrop: true,
  backdropOutset: 24.0F)
effect.SetParameter(0, Vector4(0.18F, 0.65F, 0.9F, 1.0F))
let data = ShaderEffectData(BitConverter.GetBytes(1.0F))
effect.SetData(0, data)

let control = Button{
  Width: 180,
  Height: 52,
  BorderRadius: 18,
  ShaderEffect: effect,
}
```

Reuse the same effect instance for controls that share program and parameters. Create separate effect instances from the same program when controls need independent parameter state. Program sharing also shares the backend pipeline identity. `SetParameter` accepts slots 0 through 7, marks mounted users paint-dirty only when a value changes, and stays allocation-free after construction.

Set `Playing = true` to opt into continuous renderer-driven playback. `ElapsedSeconds` is supplied separately through `gooElapsedSeconds()`, so playback does not consume one of the eight parameter slots. Pausing preserves the current elapsed position, and assigning `ElapsedSeconds` seeks while paused or playing. Goo schedules continuous frames only while a playing effect is mounted.

Author ShaderEffects in native Slang by including Goo's fixed module and implementing `float4 gooEffect(float2 uv, float4 source, float4 backdrop)`. GLSL compatibility sources instead include `goo_effect.glsl` and implement the equivalent `vec4` function. `gooDataByteLength(slot)` and `gooDataWord(slot, wordIndex)` read retained data slots zero through three; invalid slots and out-of-range words return zero.

```slang
#include "goo_effect.slang"

float4 gooEffect(float2 uv, float4 source, float4 backdrop)
{
    float gain = gooDataByteLength(0) >= 4 ? asfloat(gooDataWord(0, 0)) : 1.0;
    float pulse = 0.5 + 0.5 * sin(gooElapsedSeconds());
    return lerp(source, backdrop, gooParameter(0).x * pulse) * gain;
}
```

Add the source to the G# project:

```xml
<ItemGroup>
  <GooShaderEffect Include="Shaders/glass.slang" />
</ItemGroup>
```

Build requires the pinned Slang 2026.16 compiler through `SLANG_SDK` or `PATH` and SPIRV-Tools 2026.3 from Vulkan SDK 1.4.357.0 through `VULKAN_SDK` or `PATH`. Goo compiles and validates the source during the build, writes deterministic intermediates under `obj`, and copies `Shaders/glass.goo-effect` plus `Shaders/glass.goo-effect.json` provenance to build and publish output. The program container can carry separate artifacts for multiple rendering backends. The current compiler emits Vulkan SPIR-V. Set `TargetPath` on `GooShaderEffect` to override the relative output path. Unchanged inputs skip compilation. Tool-version mismatches, compiler errors, validation errors, ABI mismatches, and unsupported capabilities fail the build.

The fixed ABI binds the isolated source at set 0, the optional backdrop at set 1, Goo primitive data at set 2, Goo clip data at set 3, optional retained effect data at set 4, and eight `vec4` values in a 128-byte fragment push block. `uv` is normalized to the visible element bounds. `source` and `backdrop` are premultiplied linear colors. Return premultiplied linear color. Goo applies retained clip coverage and element opacity after `gooEffect`. Set `backdropOutset` to the largest displacement or filter radius the shader needs beyond those bounds. When backdrop sampling is disabled, the backdrop argument aliases the source and Goo skips the target copy.

Each `ShaderEffectData` publication is a complete replacement. The constructor and `Publish` copy bytes. `Transfer` and `PublishTransferred` take array ownership and invoke the supplied callback after Goo no longer reads that publication. Each source is limited to 16 MiB, each compiled scene frame is limited to 64 MiB of effect data, and unchanged retained versions reuse the existing upload. Goo recreates device-local data from the retained publication after device recovery.

The compiled program stays a sidecar asset in JIT and NativeAOT builds. Goo packages the build adapter, but neither the adapter, authoring modules, nor compiler toolchains are copied to application output. Goo does not invoke a runtime shader compiler. The first use creates a backend pipeline in a device-generation cache. Warm parameter updates reuse that pipeline and the retained layer pool. One target format supports up to 32 distinct effect program identities per device generation. A non-normal `BlendMode` cannot currently share the same element with `ShaderEffect`.

## `CompiledVectorAsset`

Source:

- [`CompiledVector.Asset.gs`](../../Goo/Rendering/CompiledVector.Asset.gs)

Loads, caches, and renders a validated compiled vector asset.

### `Load(System.Byte[])`

Loads a compiled vector asset and throws when the bytes are invalid.

### `PathForNode(int32)`

Returns the cached path for one asset node.

### `Render`

Creates a retained display cell for this asset.

### `Render(string)`

Creates or updates a retained display cell using the supplied key.

### `TryLoad(System.Byte[])`

Loads a compiled vector asset and returns nil when the bytes are invalid.

### `ByteCount`

Gets the encoded asset byte count.

### `ClipCount`

Gets the number of clip paths.

### `ContourCount`

Gets the number of vector contours.

### `CurveCount`

Gets the number of vector curves.

### `Flags`

Gets the compiled asset flags.

### `KeyframeCount`

Gets the number of animation keyframes.

### `MorphCurveCount`

Gets the number of morph curves.

### `NodeCount`

Gets the number of vector nodes.

### `PaintCount`

Gets the number of paints.

### `StrokeCount`

Gets the number of strokes.

### `TrackCount`

Gets the number of animation tracks.

### `Version`

Gets the compiled asset format version.

### `ViewBoxHeight`

Gets the view box height.

### `ViewBoxWidth`

Gets the view box width.

### `ViewBoxX`

Gets the view box origin on the x axis.

### `ViewBoxY`

Gets the view box origin on the y axis.

## `ShaderEffect`

Source:

- [`ShaderEffect.gs`](../../Goo/Rendering/ShaderEffect.gs)

Owns retained parameter state for one backend-neutral shader effect program.

### `new(ShaderEffectProgram,bool,float32)`

Creates a retained fragment effect with optional bounded backdrop sampling.

- `program`: The compiled shader effect program.
- `samplesBackdrop`: Whether Goo copies the existing target behind the element for shader sampling.
- `backdropOutset`: The finite nonnegative logical-pixel distance captured around the element, up to 256.

### `SetData(int32,ShaderEffectData)`

Binds one retained data source to a fixed shader input slot.

- `slot`: The data slot from zero through three.
- `value`: The retained source, or nil to unbind the slot.

Returns: True when the binding changed.

### `SetParameter(int32,System.Numerics.Vector4)`

Updates one retained shader parameter slot without allocating on the warm path.

- `slot`: The parameter slot from 0 through 7.
- `value`: The four finite parameter values.

Returns: True when the retained value changed.

### `ElapsedSeconds`

Gets or sets the elapsed playback position in seconds.

### `Playing`

Gets or sets whether Goo advances ElapsedSeconds and renders attached effects continuously. Playback is disabled by default.

## `ShaderEffectData`

Source:

- [`ShaderEffectData.gs`](../../Goo/Rendering/ShaderEffectData.gs)

Owns one retained byte sequence for ShaderEffect data inputs.

### `new(System.Byte[])`

Copies bytes into the initial retained publication.

- `bytes`: The non-empty byte sequence to copy.

### `Dispose`

Releases the current owner reference. Captured publications remain valid until released.

### `Publish(System.Byte[])`

Copies and publishes a complete replacement byte sequence.

- `bytes`: The non-empty replacement byte sequence.

### `PublishTransferred(System.Byte[],System.Action)`

Publishes a complete replacement by taking ownership of its array.

- `bytes`: The non-empty replacement byte sequence transferred to Goo.
- `released`: Called once Goo no longer reads the transferred array.

### `Transfer(System.Byte[],System.Action)`

Creates a source that takes ownership of bytes without copying them.

- `bytes`: The non-empty byte sequence transferred to Goo.
- `released`: Called once Goo no longer reads the transferred array.

Returns: The retained data source.

### `ByteLength`

Gets the current publication byte length, or zero after disposal.

### `ContentVersion`

Gets the monotonically increasing publication version.

### `IsDisposed`

Gets whether this source has released its current publication.

## `ShaderEffectProgram`

Source:

- [`ShaderEffectProgram.gs`](../../Goo/Rendering/ShaderEffectProgram.gs)

Owns one immutable compiled shader effect program with backend-specific artifacts.

### `new(System.Byte[])`

Loads and validates a compiled shader effect program from memory.

- `program`: The complete Goo shader effect program bytes.

### `Load(string)`

Loads and validates a compiled shader effect program from a file.

- `path`: The program file path.

Returns: The immutable compiled program.

## `TextAffinity`

Source:

- [`TextMetrics.gs`](../../Goo/Rendering/TextMetrics.gs)

Specifies the visual side of a text position at a directional boundary.

### Values

- `Upstream`
- `Downstream`

## `VectorAsset`

Source:

- [`CompiledVector.Asset.gs`](../../Goo/Rendering/CompiledVector.Asset.gs)

Owns an immutable vector document shared by authored, runtime SVG, and compiled assets.

### `new(float64,float64,float64,float64,VectorNode[])`

Snapshots a vector document whose paths use the supplied view-box coordinate space.

### `Load(System.Byte[])`

Decodes a validated compiled vector document.

### `NodeAt(int32)`

Returns the immutable node at a flattened document index.

### `PathForNode(int32)`

Returns a node path in the document coordinate space.

### `Render`

Creates a retained vector display fitted within its parent.

### `Render(string)`

Creates a keyed retained vector display fitted within its parent.

### `TryLoad(System.Byte[])`

Decodes a compiled vector document or returns nil when the bytes are invalid.

### `ByteCount`

Gets the encoded source byte count, or zero for authored documents.

### `ClipCount`

Gets the clip count.

### `ContourCount`

Gets the contour count.

### `CurveCount`

Gets the quadratic curve count.

### `Flags`

Gets source format flags, or zero for authored documents.

### `KeyframeCount`

Gets the animation keyframe count.

### `MorphCurveCount`

Gets the morph curve count.

### `NodeCount`

Gets the node count.

### `Nodes`

Gets the immutable flattened node sequence.

### `PaintCount`

Gets the paint count.

### `StrokeCount`

Gets the stroke count.

### `TrackCount`

Gets the animation track count.

### `Version`

Gets the source format version, or zero for authored documents.

### `ViewBoxHeight`

Gets the view-box height.

### `ViewBoxWidth`

Gets the view-box width.

### `ViewBoxX`

Gets the view-box x origin.

### `ViewBoxY`

Gets the view-box y origin.
