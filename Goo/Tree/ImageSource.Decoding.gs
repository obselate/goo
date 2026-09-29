package Goo

import System
import System.IO
import System.Threading

public partial class ImageSource {
  shared {
    /// Decodes PNG, JPEG, or the first GIF frame into an owned premultiplied RGBA source.
    /// Encoded input is limited to 16 MiB, dimensions to 8192 pixels, and decoded pixels to 64 MiB.
    /// Decoding is synchronous. Call from a worker when loading outside the UI thread.
    public func Decode(encoded ReadOnlyMemory[uint8]) ImageSource ->
    Decode(encoded, CancellationToken.None)

    /// Decodes encoded bytes with cancellation during validation and before publication.
    public func Decode(encoded ReadOnlyMemory[uint8], cancellationToken CancellationToken) ImageSource ->
    RasterImageDecoder.Decode(encoded, cancellationToken)

    /// Decodes from the stream's current position and leaves the stream open.
    /// Uses the same limits and synchronous decoding as the encoded-byte overload.
    public func Decode(stream Stream) ImageSource -> Decode(stream, CancellationToken.None)

    /// Decodes a stream with cancellation between reads and during validation.
    /// Leaves the stream open, including on cancellation or decoding failure.
    public func Decode(stream Stream, cancellationToken CancellationToken) ImageSource {
      if Object.ReferenceEquals(stream, nil) { throw ArgumentNullException("stream") }
      return RasterImageDecoder.Load(stream, cancellationToken)
    }

    /// Loads a local PNG, JPEG, or first GIF frame as an owned bounded thumbnail.
    /// The image keeps its aspect ratio, never grows, and retains only the reduced pixels.
    /// This synchronous operation belongs on a worker outside the UI thread.
    public func LoadThumbnail(path string, maxWidth int32, maxHeight int32) ImageSource ->
    LoadThumbnail(path, maxWidth, maxHeight, CancellationToken.None)

    /// Loads a bounded thumbnail with cancellation during reading, validation, and resampling.
    /// Encoded input is limited to 16 MiB, source dimensions to 8192, and source RGBA to 64 MiB.
    public func LoadThumbnail(path string, maxWidth int32, maxHeight int32,
      cancellationToken CancellationToken) ImageSource {
        if String.IsNullOrWhiteSpace(path) { throw ArgumentException("A local image path is required", "path") }
        if maxWidth <= 0 { throw ArgumentOutOfRangeException("maxWidth") }
        if maxHeight <= 0 { throw ArgumentOutOfRangeException("maxHeight") }
        return RasterImageDecoder.LoadThumbnail(path, maxWidth, maxHeight, cancellationToken)
      }
  }
}
