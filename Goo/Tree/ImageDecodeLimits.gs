package Goo

import System

/// Sets the size limits for one image decode.
public class ImageDecodeLimits {
  shared {
    private let defaults ImageDecodeLimits = ImageDecodeLimits()

    /// Gets the default limits.
    public prop Default ImageDecodeLimits{ get -> defaults }

    private func positive(value int32, name string) int32 {
      if value <= 0 { throw ArgumentOutOfRangeException(name) }
      return value
    }
  }

  private var maxEncodedBytes int32 = 16777216
  private var maxPixelsPerSide int32 = 8192
  private var maxDecodedBytes int32 = 67108864

  /// Gets the maximum encoded input size in bytes. The default is 16 MiB.
  public prop MaxEncodedBytes int32{ get -> maxEncodedBytes init -> maxEncodedBytes = positive(value, "MaxEncodedBytes") }
  /// Gets the maximum source width and height in pixels. The default is 8192.
  public prop MaxPixelsPerSide int32{ get -> maxPixelsPerSide init -> maxPixelsPerSide = positive(value, "MaxPixelsPerSide") }
  /// Gets the maximum size in bytes of the RGBA pixels that the decode keeps. The default is 64 MiB.
  /// For a thumbnail, this limit applies to the reduced pixels and not to the source.
  public prop MaxDecodedBytes int32{ get -> maxDecodedBytes init -> maxDecodedBytes = positive(value, "MaxDecodedBytes") }

  /// Initializes the default limits.
  public init() { }
}

/// Reports an image that exceeds an ImageDecodeLimits value.
public class ImageLimitException : Exception {
  private let width int32
  private let height int32

  /// Gets the source pixel width, or 0 when the limit was exceeded before the header gave it.
  public prop Width int32{ get -> width }
  /// Gets the source pixel height, or 0 when the limit was exceeded before the header gave it.
  public prop Height int32{ get -> height }

  internal init(message string, width int32, height int32): base(message) {
    this.width = width
    this.height = height
  }
}
