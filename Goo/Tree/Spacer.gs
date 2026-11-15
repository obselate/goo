package Goo

/// Takes free main-axis space without paint, input, or accessibility output.
public class Spacer : Blob {
  internal override func coreBlob() { }

  /// Initializes a spacer with grow 1, shrink 1, basis 0, and minimum size 0.
  public init() {
    pushScalar(StyleField.FlexGrow, 1.0)
    pushScalar(StyleField.FlexShrink, 1.0)
    pushLength(StyleField.FlexBasis, 0)
    pushLength(StyleField.MinWidth, 0)
    pushLength(StyleField.MinHeight, 0)
  }
}
