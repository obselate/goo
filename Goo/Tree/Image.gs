package Goo

/// Controls how an image fits its destination box.
public enum ImageFit {
  /// Preserves the image aspect ratio within the destination box.
  Contain;
  /// Preserves the image aspect ratio while filling the destination box.
  Cover;
  /// Stretches the image to fill the destination box.
  Fill;
  /// Paints the image at its intrinsic size without scaling.
  None;
}

/// Defines a local bitmap image element.
public class Image : Blob {
  internal override func coreBlob() {
  }

  /// Legacy path metadata. A nonempty path without Source throws when mounted.
  /// Load local PNG assets with ImageSourceCache.LoadAsync and set Source instead.
  public prop Path string{ get; init; }
  /// Gets the owned or provider-backed image source. It wins over Path when set.
  public prop Source ImageSourceProvider? { get; init; }
  /// Gets the image fit mode.
  public prop Fit ImageFit{ get; init; }

  /// Initializes an image with an empty path and contained fit mode.
  public init() {
    Path = ""
    Fit = ImageFit.Contain
  }
}
