# Local raster images

Prepare local PNG assets with `ImageSourceCache` before building the UI. The
loader reads and decodes on a worker, then returns an immutable `ImageSource`:

```gsharp
using let images = ImageSourceCache()
using let logo = await images.LoadAsync(Path.Combine(AppContext.BaseDirectory, "Assets/logo.png"))
// Store logo in application state and use it from Cell.Build:
Image{ Source: logo, Width: 64, Height: 64, Fit: ImageFit.Contain }
```

Copy packaged PNG assets to the output/publish directory using the application's
ordinary content items. The loader accepts local filesystem paths, including
extracted packaged assets. It does not fetch URLs. Await loading outside
`Cell.Build`, painting, and input callbacks. For a later load, assign the result
to application state on the window's owner thread and rebuild the affected Cell.

PNG grayscale, RGB, indexed, grayscale-alpha, and RGBA are supported, including
their standard bit depths and Adam7 interlacing. Output is premultiplied RGBA8.
The loader uses the first PNG image, ignores animation and color-profile
metadata, and does not perform color management. Other formats throw
`NotSupportedException`; a consumer decoder can still create `ImageSource`
directly. `Image.Path` is legacy metadata: mounting a nonempty path without
`Source` throws a message directing the caller to `LoadAsync`.

Each file is limited to 16 MiB encoded, 8192 pixels per dimension, and 64 MiB
decoded RGBA. The loader validates PNG chunk bounds/checksums and the exact
decompressed scanline size before invoking the managed decoder, including for
compressed data that expands beyond the header's dimensions. It serializes
decoding within each cache to bound simultaneous working buffers. Temporary
decoder buffers are additional to the decoded cache budget.

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
window is never needed for decoding. The managed decoder itself is synchronous;
cancellation during that bounded step is observed when it returns. Missing
files, access errors, malformed input, unsupported formats, capacity exhaustion,
and cancellation are observable through the returned task. Failed or cancelled
loads are not cached and may be retried.

The pinned StbImageSharp dependency is managed code with no extra native decoder
payload. NuGet restores it transitively, and NativeAOT includes the used decoder
code. Linux/macOS CI publishes and runs a local PNG loading smoke as NativeAOT;
the Linux Vulkan smoke also checks rendered pixels and teardown.
