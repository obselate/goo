# Rendering API

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/Rendering`](https://github.com/obselate/goo/tree/8c6b1bbb9b1d5637b41c2b6c02d9f3d8ad637650/Goo/Rendering)

## Apply fragment shaders to retained elements

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

The fixed ABI binds the isolated source at set 0, the optional backdrop at set 1, Goo primitive data at set 2, Goo clip data at set 3, optional retained effect data at set 4, and eight `vec4` values in a 128-byte fragment push block. `uv` is normalized to the visible element bounds. `source` and `backdrop` are premultiplied linear colors. Return premultiplied linear color. Goo applies retained clip coverage and element opacity after `gooEffect`. Set `backdropOutset` to the largest displacement or filter radius the shader needs beyond those bounds. When backdrop sampling is disabled, the backdrop argument aliases the source and Goo skips the target copy.

Each `ShaderEffectData` publication is a complete replacement. The constructor and `Publish` copy bytes. `Transfer` and `PublishTransferred` take array ownership and invoke the supplied callback after Goo no longer reads that publication. Each source is limited to 16 MiB, each compiled scene frame is limited to 64 MiB of effect data, and unchanged retained versions reuse the existing upload. Goo recreates device-local data from the retained publication after device recovery.

The generic `Publish[T]` overload accepts `ReadOnlySpan[T]` for unmanaged elements and copies native memory layout directly into one owned publication. Match shader field layout, alignment and byte order explicitly. Data published during `Build` is available to the following scene compilation. Publish geometry-dependent data from `MetricsChanged`, which runs after layout and before paint. The renderer snapshots retained data during scene compilation. Concurrent later publications belong to a later frame.

Use `<GooShaderEffect Include="Shaders/field.slang" SourceIndependent="true" />` for a generator that replaces the element's visual subtree without sampling it. Its `source` and `backdrop` arguments are zero, and source/backdrop texture descriptors are unavailable. Goo draws it directly into the current target while retaining layout, input, accessibility, transforms, opacity and clipping. The artifact records this mode, and constructing a generator with backdrop sampling enabled throws. Group opacity and non-normal blending can still require an isolation layer. This removes the otherwise unused source capture pass, not every possible offscreen pass.

The compiled program stays a sidecar asset in JIT and NativeAOT builds. Goo packages the build adapter, but neither the adapter, authoring modules, nor compiler toolchains are copied to application output. Goo does not invoke a runtime shader compiler. The first use creates a backend pipeline in a device-generation cache. Warm parameter updates reuse that pipeline and the retained layer pool. One target format supports up to 32 distinct effect program identities per device generation. A non-normal `BlendMode` cannot share the same element with an ordinary source-sampling `ShaderEffect`.

## Gradient stops

Linear and radial gradients accept two or more ordered stops, including repeated
positions for hard color edges. There is no fixed four-stop limit. Larger stop
lists use Goo-owned GPU storage and remain a single gradient draw; device storage
limits still apply. Interpolation uses premultiplied linear color, including
per-stop alpha and element opacity.

## `ExternalFrameDescription`

Source:

- [`ExternalImage.Types.gs`](https://github.com/obselate/goo/blob/8c6b1bbb9b1d5637b41c2b6c02d9f3d8ad637650/Goo/Rendering/ExternalImage.Types.gs)

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

- [`ExternalImage.Types.gs`](https://github.com/obselate/goo/blob/8c6b1bbb9b1d5637b41c2b6c02d9f3d8ad637650/Goo/Rendering/ExternalImage.Types.gs)

Reports the end of a frame lease. Wait the returned dependency before reuse.

### `ReleaseSync`

Gets an owned completion or unused acquire handle. Dispose the handle after use.

### `Status`

Gets the terminal frame status.

### `Value`

Gets the synchronization value for the returned handle, when present.

## `ExternalFrameStatus`

Source:

- [`ExternalImage.Types.gs`](https://github.com/obselate/goo/blob/8c6b1bbb9b1d5637b41c2b6c02d9f3d8ad637650/Goo/Rendering/ExternalImage.Types.gs)

Reports the end of a frame read lease.

### Values

- `Released`
- `Dropped`
- `DeviceLost`
- `Closed`

## `ExternalImage`

Source:

- [`ExternalImage.gs`](https://github.com/obselate/goo/blob/8c6b1bbb9b1d5637b41c2b6c02d9f3d8ad637650/Goo/Rendering/ExternalImage.gs)

Owns one imported GPU allocation. Dispose retires it after its last frame lease.

### `Dispose`

Stops new publications. Native storage remains alive through existing reads.

### `Height`

Gets the allocation height in pixels.

### `Width`

Gets the allocation width in pixels.

## `ExternalImageAlphaMode`

Source:

- [`ExternalImage.Types.gs`](https://github.com/obselate/goo/blob/8c6b1bbb9b1d5637b41c2b6c02d9f3d8ad637650/Goo/Rendering/ExternalImage.Types.gs)

Identifies source alpha storage.

### Values

- `Premultiplied`
- `Opaque`

## `ExternalImageColorEncoding`

Source:

- [`ExternalImage.Types.gs`](https://github.com/obselate/goo/blob/8c6b1bbb9b1d5637b41c2b6c02d9f3d8ad637650/Goo/Rendering/ExternalImage.Types.gs)

Identifies the source sample encoding.

### Values

- `Unsupported`
- `Srgb`

## `ExternalImageHandleKind`

Source:

- [`ExternalImage.Types.gs`](https://github.com/obselate/goo/blob/8c6b1bbb9b1d5637b41c2b6c02d9f3d8ad637650/Goo/Rendering/ExternalImage.Types.gs)

Identifies an exported Vulkan memory handle.

### Values

- `OpaqueFd`
- `DmaBuf`
- `OpaqueWin32`
- `D3D11TextureNt`
- `D3D12Resource`

## `ExternalImagePlane`

Source:

- [`ExternalImage.Types.gs`](https://github.com/obselate/goo/blob/8c6b1bbb9b1d5637b41c2b6c02d9f3d8ad637650/Goo/Rendering/ExternalImage.Types.gs)

Describes one explicit memory plane.

### `Offset`

Gets the byte offset of this plane.

### `RowPitch`

Gets the row stride in bytes.

## `ExternalImageResult`

Source:

- [`ExternalImage.Types.gs`](https://github.com/obselate/goo/blob/8c6b1bbb9b1d5637b41c2b6c02d9f3d8ad637650/Goo/Rendering/ExternalImage.Types.gs)

Reports an external image import.

### `Detail`

Gets a bounded failure description.

### `Image`

Gets the caller-owned image, only on Success.

### `Status`

Gets the import status.

## `ExternalImageSession`

Sources:

- [`ExternalImageSession.gs`](https://github.com/obselate/goo/blob/8c6b1bbb9b1d5637b41c2b6c02d9f3d8ad637650/Goo/Rendering/ExternalImageSession.gs)
- [`ExternalImageSession.Metal.gs`](https://github.com/obselate/goo/blob/8c6b1bbb9b1d5637b41c2b6c02d9f3d8ad637650/Goo/Rendering/Vulkan/ExternalImageSession.Metal.gs)
- [`ExternalImageSession.Vulkan.gs`](https://github.com/obselate/goo/blob/8c6b1bbb9b1d5637b41c2b6c02d9f3d8ad637650/Goo/Rendering/Vulkan/ExternalImageSession.Vulkan.gs)

Imports GPU images for one device generation. Open, import and Dispose require the window owner thread.

### `Invalidated`

Raised once on the owner thread when the session closes or its device is lost.

### `CreateSource`

Creates a bounded latest-frame image provider.

Returns: A caller-owned provider for images from this session.

### `Dispose`

Invalidates this session and retires its native resources. Closed is not a producer completion promise.

### `ImportAndroidHardwareBuffer(System.IntPtr)`

Imports a retained Android hardware buffer when the platform route is available.

- `buffer`: A borrowed AHardwareBuffer pointer.

Returns: Unsupported on platforms without the Android import route.

### `ImportMetalIoSurface(System.IntPtr,int32)`

Imports a retained IOSurface plane when the platform route is available.

- `surface`: A borrowed IOSurface pointer.
- `plane`: The surface plane index.

Returns: Success with a caller-owned RGBA plane, or an explicit platform or format status.

### `ImportMetalTexture(System.IntPtr)`

Imports a retained Metal texture when the platform route is available.

- `texture`: A borrowed MTLTexture pointer.

Returns: Success with a caller-owned image, or an explicit platform or format status.

### `ImportVulkan(VulkanExternalImageDescription)`

Imports a ring slot. The caller keeps the original memory handle and allocation.

- `description`: Exact exported allocation metadata.

Returns: Success with a caller-owned imported image, or an explicit import status.

### `Open(Window)`

Opens a session after the window has created its presentation device.

- `window`: The owning window.

Returns: Success with a session, or an explicit device or platform status.

### `DeviceUuid`

Gets the 16-byte physical device UUID.

### `DriverUuid`

Gets the 16-byte driver UUID.

### `Generation`

Gets the device generation. Imports never survive a device change.

### `WindowsDevice`

Gets Windows adapter identity, or nil when the driver does not expose a LUID.

## `ExternalImageSessionResult`

Source:

- [`ExternalImage.Types.gs`](https://github.com/obselate/goo/blob/8c6b1bbb9b1d5637b41c2b6c02d9f3d8ad637650/Goo/Rendering/ExternalImage.Types.gs)

Reports opening an external image session.

### `Detail`

Gets a bounded failure description.

### `Session`

Gets the caller-owned session, only on Success.

### `Status`

Gets the session status.

## `ExternalImageSource`

Source:

- [`ExternalImage.gs`](https://github.com/obselate/goo/blob/8c6b1bbb9b1d5637b41c2b6c02d9f3d8ad637650/Goo/Rendering/ExternalImage.gs)

Supplies a bounded latest external frame to Image.Source. Callbacks run on the session window owner thread.

### `ContentChanged`

Raised on the owner thread when the source changes.

### `Acquire`

Acquires the last complete frame. Producer work is never waited inside painting.

Returns: A retained external frame lease, or a failed lease before the first ready frame.

### `Dispose`

Stops publication and retires the displayed and pending read leases.

### `Publish(ExternalImage,ExternalFrameDescription,ExternalImageSync,System.Action{ExternalFrameResult})`

Publishes one frame without waiting for producer GPU work. Busy preserves caller ownership.

- `image`: An unused image imported by this session.
- `frame`: The visible sRGB crop and orientation.
- `ready`: Producer completion and released layout ownership.
- `released`: Receives exactly one terminal result after a successful publication.

Returns: The publication status. A failure does not take a frame lease.

### `ContentVersion`

Gets the nonzero publication version.

## `ExternalImageStatus`

Source:

- [`ExternalImage.Types.gs`](https://github.com/obselate/goo/blob/8c6b1bbb9b1d5637b41c2b6c02d9f3d8ad637650/Goo/Rendering/ExternalImage.Types.gs)

Reports external image operations.

### Values

- `Success`
- `Unsupported`
- `UnsupportedFormat`
- `UnsupportedSynchronization`
- `WrongDevice`
- `StaleGeneration`
- `Busy`
- `DeviceLost`
- `Closed`
- `Failed`

## `ExternalImageSync`

Source:

- [`ExternalImage.Types.gs`](https://github.com/obselate/goo/blob/8c6b1bbb9b1d5637b41c2b6c02d9f3d8ad637650/Goo/Rendering/ExternalImage.Types.gs)

Describes borrowed producer synchronization. AlreadyComplete requires producer completion before Publish.

### `new`

Creates synchronization metadata. Set the kind, layout and queue family before publication.

### `Handle`

Gets the borrowed semaphore or fence handle.

### `ImageLayout`

Gets the producer's released numeric VkImageLayout.

### `Kind`

Gets the producer completion kind.

### `QueueFamily`

Gets the released external or foreign queue family index.

### `Timeline`

Gets whether the payload is a timeline semaphore.

### `Value`

Gets the required timeline value.

## `ExternalImageSyncKind`

Source:

- [`ExternalImage.Types.gs`](https://github.com/obselate/goo/blob/8c6b1bbb9b1d5637b41c2b6c02d9f3d8ad637650/Goo/Rendering/ExternalImage.Types.gs)

Identifies a producer completion dependency.

### Values

- `OpaqueFdSemaphore`
- `SyncFd`
- `OpaqueWin32Semaphore`
- `D3D12Fence`
- `MetalSharedEvent`
- `AlreadyComplete`

## `ExternalImageWindowsDevice`

Source:

- [`ExternalImage.Types.gs`](https://github.com/obselate/goo/blob/8c6b1bbb9b1d5637b41c2b6c02d9f3d8ad637650/Goo/Rendering/ExternalImage.Types.gs)

Identifies a Windows adapter for a D3D external image producer.

### `Luid`

Gets the eight-byte adapter LUID.

### `NodeMask`

Gets the physical device node mask.

## `ImageColorProfile`

Source:

- [`ImageColorProfile.gs`](https://github.com/obselate/goo/blob/8c6b1bbb9b1d5637b41c2b6c02d9f3d8ad637650/Goo/Rendering/ImageColorProfile.gs)

Converts consumer-decoded straight RGBA samples from bounded ICC profiles to SDR sRGB.

### `ToSrgb(System.ReadOnlyMemory{System.Byte},System.Span{System.Byte},bool,System.Threading.CancellationToken)`

Converts straight RGBA8 samples in place before ImageSource.Transfer or alpha premultiplication. Alpha bytes are unchanged. Failed or cancelled output must not be published.

- `profile`: The complete ICC v2/v4 profile, at most 4 MiB.
- `straightRgba`: The nonempty RGBA8 buffer. Its length must be divisible by four.
- `gray`: True for original gray samples replicated into the RGB channels.
- `cancellationToken`: Cancels conversion before publication.

Returns: Success, InvalidData, Unsupported for LUT or incompatible profiles, or Cancelled.

## `OffscreenRenderOptions`

Source:

- [`OffscreenRender.gs`](https://github.com/obselate/goo/blob/8c6b1bbb9b1d5637b41c2b6c02d9f3d8ad637650/Goo/Rendering/OffscreenRender.gs)

Specifies LogicalWidth, LogicalHeight, PixelWidth, PixelHeight, Background and the MaxBytes allocation limit.

## `OffscreenRenderResult`

Source:

- [`OffscreenRender.gs`](https://github.com/obselate/goo/blob/8c6b1bbb9b1d5637b41c2b6c02d9f3d8ad637650/Goo/Rendering/OffscreenRender.gs)

Contains Status, owned Capture pixels on Success and Error detail on failure.

## `OffscreenRenderSession`

Source:

- [`OffscreenRenderSession.gs`](https://github.com/obselate/goo/blob/8c6b1bbb9b1d5637b41c2b6c02d9f3d8ad637650/Goo/Rendering/OffscreenRenderSession.gs)

Holds a shared renderer alive without owning a native presentation surface. Create, render, service and dispose it on the creating thread. Service while awaiting page completion.

### `Dispose`

Cancels pending pages, waits for safe GPU cleanup and releases this session's runtime lease.

### `RenderAsync(Cell,OffscreenRenderOptions,System.Threading.CancellationToken,WindowCapture)`

Renders a fresh page. The session remains usable while its source window has no presentation surface.

- `root`: Independent, unattached page content.
- `options`: Logical viewport, output pixels, background and allocation limit.
- `cancellation`: Cancels after in-flight GPU work is safe to release.
- `reusable`: Previous pixels to reuse when the output size matches.

Returns: Owned pixels or an explicit render status.

### `Service`

Consumes completed GPU work and starts a queued page without presenting a native window.

## `OffscreenRenderSessionResult`

Source:

- [`OffscreenRenderSession.gs`](https://github.com/obselate/goo/blob/8c6b1bbb9b1d5637b41c2b6c02d9f3d8ad637650/Goo/Rendering/OffscreenRenderSession.gs)

Contains Status, a Session on Success and Error detail on failure.

## `OffscreenRenderStatus`

Source:

- [`OffscreenRender.gs`](https://github.com/obselate/goo/blob/8c6b1bbb9b1d5637b41c2b6c02d9f3d8ad637650/Goo/Rendering/OffscreenRender.gs)

Reports an independent render operation without exposing GPU resource handles.

### Values

- `Success`
- `Busy`
- `NotReady`
- `Unsupported`
- `BudgetExceeded`
- `DeviceLost`
- `Cancelled`
- `Failed`

## `ShaderEffect`

Source:

- [`ShaderEffect.gs`](https://github.com/obselate/goo/blob/8c6b1bbb9b1d5637b41c2b6c02d9f3d8ad637650/Goo/Rendering/ShaderEffect.gs)

Owns retained parameter state for one backend-neutral shader effect program.

### `new(ShaderEffectProgram,bool,float32,float32)`

Creates a retained fragment effect with optional bounded backdrop sampling.

- `program`: The compiled shader effect program.
- `samplesBackdrop`: Whether Goo copies the existing target behind the element for shader sampling.
- `backdropOutset`: The finite nonnegative logical-pixel distance captured around the element, up to 256.
- `backdropBlur`: The Gaussian standard deviation in logical pixels. Positive values prefilter the backdrop at quarter resolution and capture at least three standard deviations around the element.

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

- [`ShaderEffectData.gs`](https://github.com/obselate/goo/blob/8c6b1bbb9b1d5637b41c2b6c02d9f3d8ad637650/Goo/Rendering/ShaderEffectData.gs)

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

### `Publish``1(System.ReadOnlySpan{T})`

Copies unmanaged values into a complete replacement publication using their native memory layout. The caller must match the shader's element layout and alignment.

- `T`: The unmanaged element type copied into the publication.
- `values`: The non-empty replacement values.

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

- [`ShaderEffectProgram.gs`](https://github.com/obselate/goo/blob/8c6b1bbb9b1d5637b41c2b6c02d9f3d8ad637650/Goo/Rendering/ShaderEffectProgram.gs)

Owns one immutable compiled shader effect program with backend-specific artifacts.

### `new(System.Byte[],bool)`

Loads and validates a compiled shader effect program from memory.

- `program`: The complete Goo shader effect program bytes.
- `replacesBackdrop`: Whether the shader replaces the target instead of source-over compositing. Use GOO_REPLACES_BACKDROP in the shader to retain clip coverage when replacing a transparent backdrop.

### `Load(string)`

Loads and validates a compiled shader effect program from a file.

- `path`: The program file path.

Returns: The immutable compiled program.

## `TextAffinity`

Source:

- [`TextMetrics.gs`](https://github.com/obselate/goo/blob/8c6b1bbb9b1d5637b41c2b6c02d9f3d8ad637650/Goo/Rendering/TextMetrics.gs)

Specifies the visual side of a text position at a directional boundary.

### Values

- `Upstream`
- `Downstream`

## `VectorAsset`

Source:

- [`VectorAsset.Render.gs`](https://github.com/obselate/goo/blob/8c6b1bbb9b1d5637b41c2b6c02d9f3d8ad637650/Goo/Rendering/VectorAsset.Render.gs)

Owns an immutable vector document shared by authored and runtime SVG assets.

### `new(float64,float64,float64,float64,VectorNode[])`

Snapshots a vector document whose paths use the supplied view-box coordinate space.

### `NodeAt(int32)`

Returns the immutable node at a flattened document index.

### `PathForNode(int32)`

Returns a node path in the document coordinate space.

### `Render`

Creates a retained vector display fitted within its parent.

### `Render(string)`

Creates a keyed retained vector display fitted within its parent.

### `ClipCount`

Gets the clip count.

### `ContourCount`

Gets the contour count.

### `CurveCount`

Gets the quadratic curve count.

### `NodeCount`

Gets the node count.

### `Nodes`

Gets the immutable flattened node sequence.

### `PaintCount`

Gets the paint count.

### `StrokeCount`

Gets the stroke count.

### `ViewBoxHeight`

Gets the view-box height.

### `ViewBoxWidth`

Gets the view-box width.

### `ViewBoxX`

Gets the view-box x origin.

### `ViewBoxY`

Gets the view-box y origin.

## `VulkanDrivers`

Source:

- [`VulkanDrivers.gs`](https://github.com/obselate/goo/blob/8c6b1bbb9b1d5637b41c2b6c02d9f3d8ad637650/Goo/Rendering/Vulkan/VulkanDrivers.gs)

Configures additional Vulkan drivers for the process.

### `Direct`

Gets or sets driver DLL paths added to system drivers in inclusive mode on Windows. Set this before opening the first window. Paths are copied and are never read from the environment. Throws PlatformNotSupportedException on other platforms and InvalidOperationException after Vulkan loading starts.

## `VulkanExternalImageDescription`

Source:

- [`ExternalImage.Types.gs`](https://github.com/obselate/goo/blob/8c6b1bbb9b1d5637b41c2b6c02d9f3d8ad637650/Goo/Rendering/ExternalImage.Types.gs)

Describes a borrowed exportable 2D Vulkan allocation. Goo duplicates Memory before import.

### `new`

Creates allocation metadata. Set all required image and allocation fields before import.

### `AllocationSize`

Gets the exported allocation size in bytes.

### `DedicatedAllocation`

Gets whether the producer used a dedicated image allocation.

### `DeviceUuid`

Gets the producer physical device UUID, exactly 16 bytes.

### `DriverUuid`

Gets the producer driver UUID, exactly 16 bytes.

### `DrmModifier`

Gets the explicit DRM format modifier for DMA-BUF import.

### `Format`

Gets the numeric VkFormat. Supported imports use sRGB RGBA8 or BGRA8.

### `HandleKind`

Gets the native memory handle type.

### `Height`

Gets the allocation height in pixels.

### `ImageCreateFlags`

Gets the matching numeric VkImageCreateFlags.

### `ImageUsage`

Gets the exact numeric VkImageUsageFlags, including sampled usage.

### `KeyedMutex`

Gets whether the producer allocation requires keyed-mutex sharing. This route is unsupported.

### `Memory`

Gets the borrowed memory handle. The caller retains ownership.

### `MemoryOffset`

Gets the image binding offset in bytes.

### `MemoryTypeIndex`

Gets the producer allocation memory type index.

### `Planes`

Gets the explicit DRM plane layouts.

### `Tiling`

Gets the numeric VkImageTiling.

### `Width`

Gets the allocation width in pixels.
