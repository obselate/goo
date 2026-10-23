package GooAndroidSmoke

import Goo

/// Shows one imported Android frame for capture checks.
public class ExternalImageSmokeCell : Cell {
    /// Gets or sets the retained frame provider.
    public prop Source ExternalImageSource? { get; set; }

    /// Gets or sets draw opacity for the retained redraw check.
    public prop Opacity float32 { get; set; }

    override func Build() Blob -> Image{ Source: Source, Width: Percent(100), Height: Percent(100), Fit: ImageFit.Fill, Opacity: Opacity }
}
