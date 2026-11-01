# Rendering API

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/Rendering`](https://github.com/obselate/goo/tree/main/Goo/Rendering)

## Color and compositing

Compositing, gradients and image samples use premultiplied display-encoded sRGB channels in UNORM attachments. Alpha is linear coverage.

Vulkan surfaces keep the `SRGB_NONLINEAR` color-space tag. Goo uses an advertised UNORM format or a compatible UNORM view through `VK_KHR_swapchain_mutable_format`. Startup fails if neither is available. Goo does not fall back to linear-light blending.

## Apply fragment shaders to retained elements

Effect programs use `goo-shader-effect-3`. Build effect sources with the current Goo build adapter before loading them.

Load one backend-neutral `ShaderEffectProgram`, create retained `ShaderEffect` state from it, and assign the effect through the ordinary `Style.ShaderEffect` property on a `Container`, `Button`, `Text`, `Image`, `Shape`, or another Blob. Ordinary effects render that element and its subtree into a bounded offscreen layer, run the selected backend artifact, then composite the result without changing layout, hit testing, accessibility, transforms, or clipping.

```gsharp
import Goo
import System
import System.IO
import System.Numerics

let path = Path.Combine(AppContext.BaseDirectory, "Shaders", "glass.goo-effect")
let program = ShaderEffectProgram.Load(path)
let effect = ShaderEffect(program, samplesBackdrop: true, backdropOutset: 24.0F)
effect.SetParameter(0, Vector4(0.18F, 0.65F, 0.9F, 1.0F))
let data = ShaderEffectData(BitConverter.GetBytes(1.0F))
effect.SetData(0, data)

let control = Button{Width: 180, Height: 52, BorderRadius: 18, ShaderEffect: effect,}
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

Build requires [Slang 2026.16](https://github.com/shader-slang/slang/releases/tag/v2026.16) through `SLANG_SDK` or `PATH` and SPIRV-Tools 2026.3 from [Vulkan SDK 1.4.357.0](https://vulkan.lunarg.com/sdk/home) through `VULKAN_SDK` or `PATH`. Goo compiles and validates the source during the build, writes deterministic intermediates under `obj`, and copies `Shaders/glass.goo-effect` plus `Shaders/glass.goo-effect.json` provenance to build and publish output. The program container can carry separate artifacts for multiple rendering backends. The current compiler emits Vulkan SPIR-V. Set `TargetPath` on `GooShaderEffect` to override the relative output path. Unchanged inputs skip compilation. Tool-version mismatches, compiler errors, validation errors, ABI mismatches, and unsupported capabilities fail the build.
The fixed ABI binds the isolated source at set 0, the optional backdrop at set 1, Goo primitive data at set 2, Goo clip data at set 3, optional retained effect data at set 4, and eight `vec4` values in a 128-byte fragment push block. `uv` is normalized to the visible element bounds. `source`, `backdrop` and returned colors use premultiplied display-encoded sRGB channels. Alpha is linear coverage. Images and render attachments use UNORM storage. Samples do not decode RGB. Mix authored sRGB tint values directly with sampled RGB. Source-independent effects return encoded RGB too. Goo applies retained clip coverage and element opacity after `gooEffect`. Set `backdropOutset` to the largest displacement or filter radius the shader needs beyond those bounds. When backdrop sampling is disabled, the backdrop argument aliases the source and Goo skips the target copy.

Each `ShaderEffectData` publication is a complete replacement. The constructor and `Publish` copy bytes. `Transfer` and `PublishTransferred` take array ownership and invoke the supplied callback after Goo no longer reads that publication. Each source is limited to 16 MiB, each compiled scene frame is limited to 64 MiB of effect data, and unchanged retained versions reuse the existing upload. Goo recreates device-local data from the retained publication after device recovery.

The generic `Publish[T]` overload accepts `ReadOnlySpan[T]` for unmanaged elements and copies native memory layout directly into one owned publication. Match shader field layout, alignment and byte order explicitly. Data published during `Build` is available to the following scene compilation. Publish geometry-dependent data from `MetricsChanged`, which runs after layout and before paint. The renderer snapshots retained data during scene compilation. Concurrent later publications belong to a later frame.

Use `<GooShaderEffect Include="Shaders/field.slang" SourceIndependent="true" />` for a generator that replaces the element's visual subtree without sampling it. Its `source` and `backdrop` arguments are zero, and source/backdrop texture descriptors are unavailable. Goo draws it directly into the current target while retaining layout, input, accessibility, transforms, opacity and clipping. The artifact records this mode, and constructing a generator with backdrop sampling enabled throws. Group opacity and non-normal blending can still require an isolation layer. This removes the otherwise unused source capture pass, not every possible offscreen pass.

The compiled program stays a sidecar asset in JIT and NativeAOT builds. Goo packages the build adapter, but neither the adapter, authoring modules, nor compiler toolchains are copied to application output. Goo does not invoke a runtime shader compiler. The first use creates a backend pipeline in a device-generation cache. Warm parameter updates reuse that pipeline and the retained layer pool. One target format supports up to 32 distinct effect program identities per device generation. A non-normal `BlendMode` cannot share the same element with an ordinary source-sampling `ShaderEffect`.

## Gradient stops

Linear and radial gradients accept two or more ordered stops, including repeated
positions for hard color edges. There is no fixed four-stop limit. Larger stop
lists use Goo-owned GPU storage and remain a single gradient draw; device storage
limits still apply. Interpolation uses premultiplied encoded sRGB color, including
per-stop alpha and element opacity.

## `ExternalFrameDescription`

Source:

- [`ExternalImage.Types.gs`](https://github.com/obselate/goo/blob/main/Goo/Rendering/ExternalImage.Types.gs)

Describes visible source pixels. Orientation uses EXIF values 1 through 8.

### `AlphaMode`

Gets the source alpha storage.

### `ColorEncoding`

Gets the source color encoding. HDR samples are not supported.

### `Height`

Gets the crop height in pixels.

### `Orientation`

Gets the EXIF orientation, from 1 through 8.

### `Width`

Gets the crop width in pixels.

### `X`

Gets the crop left edge in pixels.

### `Y`

Gets the crop top edge in pixels.

## `ExternalFrameResult`

Source:

- [`ExternalImage.Types.gs`](https://github.com/obselate/goo/blob/main/Goo/Rendering/ExternalImage.Types.gs)
Reports the end of a frame lease. Wait the returned dependency before reuse.

### `ReleaseSync`

Gets an owned completion or unused acquire handle. Dispose the handle after use.

### `Status`

Gets the terminal frame status.

### `Value`

Gets the synchronization value for the returned handle, when present.

## `ExternalFrameStatus`

Source:

- [`ExternalImage.Types.gs`](https://github.com/obselate/goo/blob/main/Goo/Rendering/ExternalImage.Types.gs)

Reports the end of a frame read lease.

### Values

- `Released`
- `Dropped`
- `DeviceLost`
- `Closed`

## `ExternalImage`

Source:

- [`ExternalImage.gs`](https://github.com/obselate/goo/blob/main/Goo/Rendering/ExternalImage.gs)

Owns one imported GPU allocation. Dispose retires it after its last frame lease.

### `Dispose`

Stops new publications. Native storage remains alive through existing reads.

### `Height`

Gets the allocation height in pixels.

### `Width`

Gets the allocation width in pixels.

## `ExternalImageAlphaMode`

Source:

- [`ExternalImage.Types.gs`](https://github.com/obselate/goo/blob/main/Goo/Rendering/ExternalImage.Types.gs)

Identifies source alpha storage.

### Values
