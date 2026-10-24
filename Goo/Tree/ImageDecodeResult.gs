package Goo

import System
import System.IO
import System.Threading

/// Describes a strict image decode outcome without hiding unsupported color profiles.
public enum ImageDecodeStatus { Success; InvalidData; LimitExceeded; Unsupported; Cancelled }

/// Contains the owned image on success and a bounded explanation on failure.
public sealed class ImageDecodeResult {
  private let status ImageDecodeStatus
  private let source ImageSource?
  private let detail string

  /// Gets the decode outcome.
  public prop Status ImageDecodeStatus { get -> status }

  /// Gets the independently disposable source on success, otherwise nil.
  public prop Source ImageSource? { get -> source }

  /// Gets a bounded failure explanation, or an empty string on success.
  public prop Detail string { get -> detail }

  internal init(status ImageDecodeStatus, source ImageSource? = nil, detail string = "") {
    this.status = status
    this.source = source
    this.detail = if detail.Length > 512 { detail.Substring(0, 512) } else { detail }
  }
}

public partial class ImageSource {
  shared {
    /// Decodes PNG or JPEG with embedded RGB matrix/TRC or gray ICC profiles converted to SDR sRGB.
    /// Applies EXIF orientation. LUT and CMYK profiles return Unsupported.
    /// Files without an embedded profile use sRGB. Existing Decode overloads keep their sRGB assumption.
    /// @param encoded The complete bounded encoded image.
    /// @param limits The encoded and decoded image limits.
    /// @param cancellationToken Cancels validation, color conversion and publication.
    /// @returns An owned source on success or an explicit failure status.
    public func DecodeColorManaged(encoded ReadOnlyMemory[uint8], limits ImageDecodeLimits,
      cancellationToken CancellationToken) ImageDecodeResult {
        if Object.ReferenceEquals(limits, nil) { throw ArgumentNullException("limits") }
        try {
          return ImageDecodeResult(ImageDecodeStatus.Success,
            RasterImageDecoder.DecodeColorManaged(encoded, limits, cancellationToken))
        } catch (error OperationCanceledException) {
          return ImageDecodeResult(ImageDecodeStatus.Cancelled, detail: error.Message)
        } catch (error ImageLimitException) {
          return ImageDecodeResult(ImageDecodeStatus.LimitExceeded, detail: error.Message)
        } catch (error InvalidDataException) {
          return ImageDecodeResult(ImageDecodeStatus.InvalidData, detail: error.Message)
        } catch (error NotSupportedException) {
          return ImageDecodeResult(ImageDecodeStatus.Unsupported, detail: error.Message)
        }
      }
  }
}
