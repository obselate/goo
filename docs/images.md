# Local raster images

Prepare local PNG, JPEG, or GIF assets with `ImageSourceCache` before building the UI. The
loader reads and decodes on a worker, then returns an immutable `ImageSource`:

```gsharp
using let images = ImageSourceCache()
using let logo = await images.LoadAsync(Path.Combine(AppContext.BaseDirectory, "Assets/logo.png"))
// Store logo in application state and use it from Cell.Build:
Image{Source: logo, Width: 64, Height: 64, Fit: ImageFit.Contain}
```

Copy packaged image assets to the output/publish directory using the application's
ordinary content items. The loader accepts local filesystem paths, including
extracted packaged assets. It does not fetch URLs. Await loading outside
`Cell.Build`, painting, and input callbacks. For a later load, assign the result
to application state on the window's owner thread and rebuild the affected Cell.

PNG grayscale, RGB, indexed, grayscale-alpha, and RGBA are supported, including
their standard bit depths and Adam7 interlacing. Output is premultiplied RGBA8.
JPEG supports 8-bit grayscale, RGB/YCbCr, and CMYK/YCCK baseline or progressive
images (at most 64 scans); JPEG alpha is opaque. GIF87a/GIF89a loads the first
image onto the logical screen, including palette transparency and interlacing.
Animated GIFs are accepted as static first-frame images, at most 1024 frames;
later frames are structurally checked but are neither decoded nor scheduled.
The loader uses the first PNG image and ignores animation and color-profile
metadata. PNG `eXIf` and JPEG EXIF orientation are applied, including mirrored
orientations. Width, height and thumbnail bounds refer to the displayed image.
Malformed or duplicate EXIF metadata is ignored. Those images stay unrotated.
The `Decode` and cache overloads treat pixels as sRGB without profile conversion.
Other formats throw
`NotSupportedException`; a consumer decoder can still create `ImageSource`
directly. `Image.Path` is legacy metadata: mounting a nonempty path without
`Source` throws a message directing the caller to `LoadAsync`.

By default each file is limited to 16 MiB encoded, 8192 pixels per dimension, and 64 MiB
decoded RGBA. An `ImageDecodeLimits` argument changes the limits, and a file that exceeds
one throws `ImageLimitException`. The loader validates PNG chunk bounds/checksums and the exact
decompressed scanline size before invoking the decoder, including for
compressed data that expands beyond the header's dimensions. JPEG frame dimensions,
segment bounds, scan count, and an end marker are checked before decoding. GIF
screen/frame bounds, complete data blocks, and the first frame's exact LZW
expansion are checked before decoding. It serializes
decoding within each cache to bound simultaneous working buffers. Temporary
decoder buffers are native memory that is additional to the decoded cache budget.
The decode frees them before it returns. Only the returned pixels stay in managed memory.

The cache defaults to 64 MiB decoded and 128 unique canonical paths. Constructor
arguments can change those cache limits. A full cache faults new loads with
`InvalidOperationException`; existing entries remain available. Paths are
snapshots: changing a file does not refresh a cached source. Create a new cache
when assets change. Path aliases involving symlinks are not deduplicated.

Concurrent requests for a completed path share pixels and renderer identity.
Each successful call returns an independently disposable owner, so callers can
release results separately. Disposing the cache releases its owners and cancels
queued/in-flight loads; returned sources and already-mounted leases stay valid.
Keep the cache at application scope and dispose returned sources when no longer
needed. The final owner/lease releases the pixels.

`LoadAsync(path, cancellationToken)` cancels only that caller. Cancellation is
checked while waiting, reading, validating, and before publication. A native
window is never needed for decoding. The decoder itself is synchronous;
cancellation during that bounded step is observed when it returns. Missing
files, access errors, malformed input, unsupported formats, capacity exhaustion,
and cancellation are observable through the returned task. Failed or cancelled
loads are not cached and may be retried.

The decoder is the pinned `stb_image` source in the `goo-harfbuzz-gpu` native library.
No extra native library ships. The packaged loading smoke covers PNG, baseline/progressive/CMYK JPEG,
transparent GIF, and the first frame of an animated GIF under NativeAOT;
the Linux Vulkan smoke also checks rendered pixels and teardown.

## HiDPI asset families

```gsharp
import Goo.Images

using let variants = ImageVariants([]ImageVariant{
    ImageVariant("Assets/logo.png", 1),
    ImageVariant("Assets/logo@2x.png", 2),
    ImageVariant("Assets/logo@3x.png", 3),
})
let result = await variants.LoadAsync(metrics, token)
if result.Status == ImageAssetStatus.Success {
    Image{Source: result.Source, PixelsPerUnit: result.PixelsPerUnit}
}
```

- Reference `Goo`. Keep the `Goo.Images` namespace import.
- Pass the latest `Window.MetricsChanged` snapshot. It includes `UiScale`.
- Selection uses the smallest density at least as large as the window scale, else the largest.
- Each variant must have the same logical size. A 128-pixel 2x source measures 64 logical units.
- Publish Source and PixelsPerUnit together on the UI thread. Ignore late results from older requests.
- Each result owns its Source. Dispose it when application state no longer needs it.
- The family caches decoded pixels. Disposing the family does not invalidate returned sources or mounted leases.

## Embedded color profiles

```gsharp
let result = ImageSource.DecodeColorManaged(bytes, ImageDecodeLimits.Default, token)
if result.Status == ImageDecodeStatus.Success {
    using let source = result.Source!!
    Image{Source: source, Width: 240, Height: 160}
}
```

- PNG `iCCP` and JPEG APP2 profiles use the same managed converter on all platforms.
- RGB matrix/TRC and gray ICC v2/v4 profiles convert to SDR sRGB before alpha premultiplication.
- Parametric curves and sampled curves are supported. Conversion uses relative colorimetric intent.
- LUT, CMYK and unsupported profile classes return `Unsupported`. Invalid profiles return `InvalidData`.
- The uncompressed profile limit is 4 MiB. JPEG ICC fragments may arrive in any order.
- Files without an ICC profile use sRGB. PNG gamma/chromaticity tags do not create an ICC profile.
- Reference fixtures cover sRGB, Display P3, Adobe RGB, ProPhoto and gray. RGB output is within two byte levels of the reference conversions.
