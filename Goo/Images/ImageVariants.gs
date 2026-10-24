package Goo.Images

import Goo
import System
import System.Collections.Generic
import System.IO
import System.Threading
import System.Threading.Tasks

/// Identifies one local image and the number of source pixels per logical unit.
public sealed class ImageVariant {
  /// Gets the local image path.
  public prop Path string { get; }

  /// Gets the positive finite source pixel density.
  public prop PixelsPerUnit float32 { get; }

  /// Creates a variant such as logo@2x.png with density 2.
  /// @param path The local file path.
  /// @param pixelsPerUnit The source pixels per logical unit.
  public init(path string, pixelsPerUnit float32) {
    if String.IsNullOrWhiteSpace(path) { throw ArgumentException("A local image path is required", "path") }
    if !Single.IsFinite(pixelsPerUnit) || pixelsPerUnit <= 0.0F { throw ArgumentOutOfRangeException("pixelsPerUnit") }
    Path = System.IO.Path.GetFullPath(path)
    PixelsPerUnit = pixelsPerUnit
  }
}

/// Distinguishes a loaded variant from unavailable metrics, cancellation and file or decoder failures.
public enum ImageAssetStatus { Success; NotReady; NotFound; InvalidData; LimitExceeded; Unsupported; Cancelled; Failed }

/// Contains an independently disposable image owner and its selected density on success.
public sealed class ImageAssetResult {
  /// Gets the load outcome.
  public prop Status ImageAssetStatus { get; }

  /// Gets the owned source on success, otherwise nil.
  public prop Source ImageSource? { get; }

  /// Gets the selected density. Assign it with Source to Image.PixelsPerUnit.
  public prop PixelsPerUnit float32 { get; }

  /// Gets a bounded failure explanation, or an empty string.
  public prop Detail string { get; }

  internal init(status ImageAssetStatus, source ImageSource? = nil, density float32 = 1.0F, detail string = "") {
    Status = status
    Source = source
    PixelsPerUnit = density
    Detail = if detail.Length > 512 { detail.Substring(0, 512) } else { detail }
  }
}

/// Selects and caches explicit local raster variants from stable window metrics.
public sealed class ImageVariants : IDisposable {
  private const MaxVariants int32 = 64
  private let variants []ImageVariant
  private let cache ImageSourceCache
  private let gate object = Object()
  private var logicalWidth float64
  private var logicalHeight float64
  private var densityTolerance float64

  /// Creates a family whose filenames may include @1.5x, @2x or @3x.
  /// Every variant must have the same logical size. The caller supplies filenames and densities.
  /// @param variants Up to 64 variants with distinct densities.
  /// @param limits The image decode limits, or the defaults.
  public init(variants IReadOnlyList[ImageVariant], limits ImageDecodeLimits? = nil) {
    if Object.ReferenceEquals(variants, nil) { throw ArgumentNullException("variants") }
    if variants.Count == 0 || variants.Count > MaxVariants { throw ArgumentOutOfRangeException("variants") }
    this.variants = [variants.Count]ImageVariant
    for i in 0 ... variants.Count {
      let variant = variants[i]
      if Object.ReferenceEquals(variant, nil) { throw ArgumentException("Variants cannot contain nil", "variants") }
      for j in 0 ... i {
        if variants[j].PixelsPerUnit == variant.PixelsPerUnit { throw ArgumentException("Variant densities must be distinct", "variants") }
      }
      this.variants[i] = variant
    }
    cache = ImageSourceCache(limits: limits)
  }

  /// Loads the smallest density at least as large as the effective window scale, else the largest.
  /// Repeated selections reuse decoded pixels. Concurrent calls return independent owners.
  /// @param metrics The current Window.MetricsChanged snapshot, including UiScale.
  /// @param cancellationToken Cancels only this load.
  /// @returns The owned selected image and density, or an explicit failure status.
  public async func LoadAsync(metrics WindowMetrics, cancellationToken CancellationToken) ImageAssetResult {
    let scale = Math.Max(metrics.DisplayScaleX, metrics.DisplayScaleY) * float64(metrics.UiScale)
    if !Double.IsFinite(scale) || scale <= 0.0 {
      return ImageAssetResult(ImageAssetStatus.NotReady, detail: "Window pixel scale is unavailable")
    }
    var selected = variants[0]
    for variant in variants {
      if (float64(variant.PixelsPerUnit) >= scale
          && (float64(selected.PixelsPerUnit) < scale || variant.PixelsPerUnit < selected.PixelsPerUnit))
        || (float64(selected.PixelsPerUnit) < scale && variant.PixelsPerUnit > selected.PixelsPerUnit) {
          selected = variant
        }
    }
    try {
      let source = await cache.LoadAsync(selected.Path, cancellationToken)
      let width = float64(source.Width) / float64(selected.PixelsPerUnit)
      let height = float64(source.Height) / float64(selected.PixelsPerUnit)
      let tolerance = 0.5 / float64(selected.PixelsPerUnit)
      var matches = true
      lock gate {
        if logicalWidth == 0.0 {
          logicalWidth = width
          logicalHeight = height
          densityTolerance = tolerance
        } else {
          matches = Math.Abs(width - logicalWidth) <= tolerance + densityTolerance
            && Math.Abs(height - logicalHeight) <= tolerance + densityTolerance
        }
      }
      if !matches {
        source.Dispose()
        return ImageAssetResult(ImageAssetStatus.InvalidData, detail: "Variants must have the same logical size")
      }
      return ImageAssetResult(ImageAssetStatus.Success, source, selected.PixelsPerUnit)
    } catch (error OperationCanceledException) {
      return ImageAssetResult(ImageAssetStatus.Cancelled, detail: error.Message)
    } catch (error ImageLimitException) {
      return ImageAssetResult(ImageAssetStatus.LimitExceeded, detail: error.Message)
    } catch (error FileNotFoundException) {
      return ImageAssetResult(ImageAssetStatus.NotFound, detail: error.Message)
    } catch (error DirectoryNotFoundException) {
      return ImageAssetResult(ImageAssetStatus.NotFound, detail: error.Message)
    } catch (error InvalidDataException) {
      return ImageAssetResult(ImageAssetStatus.InvalidData, detail: error.Message)
    } catch (error NotSupportedException) {
      return ImageAssetResult(ImageAssetStatus.Unsupported, detail: error.Message)
    } catch (error UnauthorizedAccessException) {
      return ImageAssetResult(ImageAssetStatus.Failed, detail: error.Message)
    } catch (error IOException) {
      return ImageAssetResult(ImageAssetStatus.Failed, detail: error.Message)
    } catch (error ObjectDisposedException) {
      rethrow
    } catch (error InvalidOperationException) {
      return ImageAssetResult(ImageAssetStatus.LimitExceeded, detail: error.Message)
    }
  }

  /// Releases cached owners and cancels pending loads. Returned sources and mounted leases stay valid.
  public func Dispose() { cache.Dispose() }
}
