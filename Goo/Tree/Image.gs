package Goo

import System

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
  private var declarationSource ImageSourceProvider?
  private var declarationFit ImageFit
  private var declarationPlaceholder Blob?
  private var declarationFallback Blob?
  private var pixelsPerUnit float64 = 1.0

  internal override func coreBlob() {
  }

  /// Gets the owned or provider-backed image source.
  public prop Source ImageSourceProvider? {
    get -> declarationSource
    set {
      CheckMutable()
      declarationSource = value
    }
  }
  /// Gets the image fit mode.
  public prop Fit ImageFit {
    get -> declarationFit
    set {
      CheckMutable()
      declarationFit = value
    }
  }
  /// Gets content shown inside the image box while its source is pending.
  public prop Placeholder Blob? {
    get -> declarationPlaceholder
    set {
      CheckMutable()
      declarationPlaceholder = value
    }
  }
  /// Gets content shown inside the image box when its source fails.
  public prop Fallback Blob? {
    get -> declarationFallback
    set {
      CheckMutable()
      declarationFallback = value
    }
  }

  /// Gets source pixels per logical layout unit. Positive and finite, default 1.
  /// A 128-pixel image at density 2 has a natural width of 64 logical units.
  public prop PixelsPerUnit float64 {
    get -> pixelsPerUnit
    set {
      CheckMutable()
      if !Double.IsFinite(value) || value <= 0.0 { throw ArgumentOutOfRangeException("PixelsPerUnit") }
      pixelsPerUnit = value
    }
  }

  /// Initializes an image with contained fit mode.
  public init() {
    Fit = ImageFit.Contain
  }
}
