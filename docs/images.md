# Raster images

```gsharp
using let images = ImageSourceCache()
using let logo = await images.LoadAsync(Path.Combine(AppContext.BaseDirectory, "Assets/logo.png"))
Image{Source: logo, Width: 64, Height: 64, Fit: ImageFit.Contain}
```

Load before building the UI. Retain the source in app state. For later loads, run work in a `go` child, then publish through `Window.Post` and rebuild the affected Cell. Never load or decode in `Build`, painting or input handlers.

Copy assets with the project's content items. Paths are local files, not URLs. A nonempty `Image.Path` without `Source` throws when mounted. Use `ImageSourceCache.LoadAsync` and assign `Image.Source`.

## Formats and limits

| Input | Support |
| --- | --- |
| PNG | Grayscale, RGB, indexed, grayscale-alpha and RGBA, standard bit depths and Adam7. First image only. |
| JPEG | 8-bit grayscale, RGB/YCbCr and CMYK/YCCK, baseline or progressive, at most 64 scans. Opaque alpha. |
| GIF87a/GIF89a | First frame on the logical screen, transparency and interlacing. At most 1024 frames. No animation playback. |
| Orientation | PNG eXIf and JPEG EXIF, including mirrors. Bounds use displayed orientation. Invalid or duplicate metadata is ignored. |
| Pixels | Premultiplied RGBA8. Ordinary decode assumes sRGB and does not convert embedded profiles. |
| Other formats | `NotSupportedException`. A consumer decoder can create an `ImageSource`. |

Default decode limits are 16 MiB encoded, 8192 pixels per dimension and 64 MiB decoded. Pass `ImageDecodeLimits` to change them. Exceeding a limit throws `ImageLimitException`. Temporary decoder memory is separate from the cache budget.

## Cache and ownership

- The cache defaults to 64 MiB decoded and 128 unique canonical paths. Constructor arguments change these limits. A full cache faults new loads with `InvalidOperationException` and keeps existing entries.
- Paths are snapshots. Create a new cache after assets change. Symlink aliases are not deduplicated.
- Requests for a completed path share pixels and renderer identity. Each successful call returns an independently disposable owner.
- Disposing the cache cancels queued and in-flight loads and releases its owners. Returned sources and mounted leases stay valid. The final owner or lease releases the pixels.
- A load token cancels only that caller. Cancellation is checked while waiting, reading, validating and before publication. The bounded synchronous decoder observes cancellation when it returns.
- Missing files, access errors, malformed input, unsupported formats, capacity errors and cancellation fault the task. Failed or cancelled loads are not cached.

## Owned pixels and providers

`Image.Source` and `Style.BackgroundImageSource` accept an `ImageSourceProvider`. A source takes priority over a path. Source failure does not fall back to that path.

| API | Ownership |
| --- | --- |
| `ImageSource(width, height, pixels)` | Copies exactly `width * height * 4` row-major premultiplied RGBA bytes. Dimensions must be positive. |
| `ImageSource.Transfer(width, height, pixels, released)` | Adopts the validated buffer. Do not read, write or reuse it until `released` runs. Rejected arguments leave ownership with the caller and do not call `released`. |
| `ImageSourceLease` | One lease per mounted binding. Complete once with `Complete(source)` or `Fail()`. Release on replacement or unmount cancels provider work through `Released`. Late completion returns `false`. |

Disposing a source releases its owner reference. Mounted leases keep pixels alive. The transfer callback runs exactly once after Goo can no longer read the buffer. It may run during disposal. Callback exceptions do not interrupt cleanup.

For streaming, keep one provider identity. Publish immutable generations with increasing `ContentVersion`. Do not mutate an in-flight generation. Return released buffers to a bounded pool. The last published version remains renderable until its replacement upload completes.

## Decode and thumbnails

```gsharp
using let source = ImageSource.Decode(encodedBytes)
using let thumbnail = ImageSource.LoadThumbnail(path, 320, 240, token)
```

- `Decode` also accepts a readable stream at its current position and leaves it open. It shares the format and limit rules above. The caller owns the result.
- Both operations are synchronous. Run them in a `go` child.
- Thumbnail bounds must be positive. Goo preserves aspect ratio, never enlarges and area-filters premultiplied RGBA. The decoded-byte limit applies to reduced pixels. Encoded-byte and source-dimension limits still apply.

## Raster density and asset families

```gsharp
Image{Source: logo2x, PixelsPerUnit: 2, Fit: ImageFit.None}
```

A 128-by-64 source at density 2 measures 64-by-32 layout units. `ImageFit.None` uses that size. Other fit modes keep their normal behavior.

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

Pass the latest `Window.MetricsChanged` snapshot. Selection uses the smallest density at least as large as `UiScale`, otherwise the largest. Variants must have the same logical size. Publish source and density together on the UI thread and ignore stale results. Each result owns its source. Disposing the family does not invalidate returned sources or mounted leases.

## GPU memory pressure

An image can stay missing until GPU memory frees or headroom grows. A frame that fails allocation can stop automatic rendering until input, a rebuild or a render request. Goo does not crash. Diagnostics count refusals and failures. There are no image GPU budget settings.

## Embedded color profiles

```gsharp
let result = ImageSource.DecodeColorManaged(bytes, ImageDecodeLimits.Default, token)
if result.Status == ImageDecodeStatus.Success {
    using let source = result.Source!!
    Image{Source: source, Width: 240, Height: 160}
}
```

| Profile | Behavior |
| --- | --- |
| PNG iCCP or JPEG APP2 RGB matrix/TRC and gray ICC v2/v4 | Converts to SDR sRGB before premultiplication, with relative colorimetric intent. Parametric and sampled curves are supported. |
| LUT, CMYK or unsupported class | `Unsupported`. |
| Invalid profile | `InvalidData`. |
| No ICC profile | Assumes sRGB. PNG gamma/chromaticity tags do not create a profile. |

The uncompressed profile limit is 4 MiB. JPEG ICC fragments can arrive in any order.

## Consumer WebP and AVIF decoders

```gsharp
let status = ImageColorProfile.ToSrgb(iccBytes, straightRgba, false, token)
```

On `Success`, premultiply alpha and transfer the immutable RGBA8 buffer. Use a provider and lease for asynchronous delivery.

| Input | Work before publication |
| --- | --- |
| WebP | Apply EXIF orientation. Extract ICCP and convert straight RGB. |
| AVIF | Apply irot/imir. Decode YUV range and matrix. Convert ICC, otherwise map NCLX primaries and transfer to SDR sRGB. |
| Untagged SDR sRGB | Premultiply alpha and transfer. |

Consumer decoders own input limits, codec lifetime and cancellation. `ToSrgb` leaves alpha unchanged. Never publish failed or cancelled output. Core includes no WebP or AVIF codec or global decoder registry. See the [image API](api/images.md) for member contracts.
