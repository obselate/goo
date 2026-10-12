package Goo

import System
import System.IO
import System.Threading

public partial class ImageSource {
  shared {
    /// Decodes PNG, JPEG, or the first GIF frame into an owned premultiplied RGBA source.
    /// The default ImageDecodeLimits apply. An image that exceeds a limit throws ImageLimitException.
    /// Decoding is synchronous. Call from a worker when loading outside the UI thread.
    public func Decode(encoded ReadOnlyMemory[uint8]) ImageSource ->
    Decode(encoded, CancellationToken.None)

    /// Decodes encoded bytes with cancellation during validation and before publication.
    public func Decode(encoded ReadOnlyMemory[uint8], cancellationToken CancellationToken) ImageSource ->
    RasterImageDecoder.Decode(encoded, ImageDecodeLimits.Default, cancellationToken)

    /// Decodes encoded bytes with the given limits.
    public func Decode(encoded ReadOnlyMemory[uint8], limits ImageDecodeLimits,
      cancellationToken CancellationToken) ImageSource {
        if Object.ReferenceEquals(limits, nil) { throw ArgumentNullException("limits") }
        return RasterImageDecoder.Decode(encoded, limits, cancellationToken)
      }

    /// Decodes from the stream's current position and leaves the stream open.
    /// Uses the same limits and synchronous decoding as the encoded-byte overload.
    public func Decode(stream Stream) ImageSource -> Decode(stream, CancellationToken.None)

    /// Decodes a stream with cancellation between reads and during validation.
    /// Leaves the stream open, including on cancellation or decoding failure.
    public func Decode(stream Stream, cancellationToken CancellationToken) ImageSource ->
    Decode(stream, ImageDecodeLimits.Default, cancellationToken)

    /// Decodes a stream with the given limits and leaves the stream open.
    public func Decode(stream Stream, limits ImageDecodeLimits,
      cancellationToken CancellationToken) ImageSource {
        if Object.ReferenceEquals(stream, nil) { throw ArgumentNullException("stream") }
        if Object.ReferenceEquals(limits, nil) { throw ArgumentNullException("limits") }
        return RasterImageDecoder.Load(stream, limits, cancellationToken)
      }

    /// Loads a local PNG, JPEG, or first GIF frame as an owned bounded thumbnail.
    /// The image keeps its aspect ratio, never grows, and retains only the reduced pixels.
    /// This synchronous operation belongs on a worker outside the UI thread.
    public func LoadThumbnail(path string, maxWidth int32, maxHeight int32) ImageSource ->
    LoadThumbnail(path, maxWidth, maxHeight, CancellationToken.None)

    /// Loads a bounded thumbnail with cancellation during reading, validation, and resampling.
    /// The default ImageDecodeLimits apply. The decoded-byte limit applies to the reduced pixels.
    public func LoadThumbnail(path string, maxWidth int32, maxHeight int32,
      cancellationToken CancellationToken) ImageSource ->
    LoadThumbnail(path, maxWidth, maxHeight, ImageDecodeLimits.Default, cancellationToken)

    /// Loads a bounded thumbnail with the given limits.
    public func LoadThumbnail(path string, maxWidth int32, maxHeight int32,
      limits ImageDecodeLimits, cancellationToken CancellationToken) ImageSource {
        if String.IsNullOrWhiteSpace(path) { throw ArgumentException("A local image path is required", "path") }
        if maxWidth <= 0 { throw ArgumentOutOfRangeException("maxWidth") }
        if maxHeight <= 0 { throw ArgumentOutOfRangeException("maxHeight") }
        if Object.ReferenceEquals(limits, nil) { throw ArgumentNullException("limits") }
        return RasterImageDecoder.LoadThumbnail(path, maxWidth, maxHeight, limits, cancellationToken)
      }
  }
}
