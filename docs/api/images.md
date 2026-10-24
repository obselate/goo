# Images API

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/Images`](../../Goo/Images)

## `ImageAssetResult`

Source:

- [`ImageVariants.gs`](../../Goo/Images/ImageVariants.gs)

Contains an independently disposable image owner and its selected density on success.

### `Detail`

Gets a bounded failure explanation, or an empty string.

### `PixelsPerUnit`

Gets the selected density. Assign it with Source to Image.PixelsPerUnit.

### `Source`

Gets the owned source on success, otherwise nil.

### `Status`

Gets the load outcome.

## `ImageAssetStatus`

Source:

- [`ImageVariants.gs`](../../Goo/Images/ImageVariants.gs)

Distinguishes a loaded variant from unavailable metrics, cancellation and file or decoder failures.

### Values

- `Success`
- `NotReady`
- `NotFound`
- `InvalidData`
- `LimitExceeded`
- `Unsupported`
- `Cancelled`
- `Failed`

## `ImageVariant`

Source:

- [`ImageVariants.gs`](../../Goo/Images/ImageVariants.gs)

Identifies one local image and the number of source pixels per logical unit.

### `new(string,float32)`

Creates a variant such as logo@2x.png with density 2.

- `path`: The local file path.
- `pixelsPerUnit`: The source pixels per logical unit.

### `Path`

Gets the local image path.

### `PixelsPerUnit`

Gets the positive finite source pixel density.

## `ImageVariants`

Source:

- [`ImageVariants.gs`](../../Goo/Images/ImageVariants.gs)

Selects and caches explicit local raster variants from stable window metrics.

### `new(System.Collections.Generic.IReadOnlyList{Images.ImageVariant},ImageDecodeLimits)`

Creates a family whose filenames may include @1.5x, @2x or @3x. Every variant must have the same logical size. The caller supplies filenames and densities.

- `variants`: Up to 64 variants with distinct densities.
- `limits`: The image decode limits, or the defaults.

### `Dispose`

Releases cached owners and cancels pending loads. Returned sources and mounted leases stay valid.

### `LoadAsync(WindowMetrics,System.Threading.CancellationToken)`

Loads the smallest density at least as large as the effective window scale, else the largest. Repeated selections reuse decoded pixels. Concurrent calls return independent owners.

- `metrics`: The current Window.MetricsChanged snapshot, including UiScale.
- `cancellationToken`: Cancels only this load.

Returns: The owned selected image and density, or an explicit failure status.
