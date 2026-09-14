package Goo

import System

/// Configures native client-area size limits on the owning UI thread.
public partial class Window {
  private var minWidth int32
  private var minHeight int32
  private var maxWidth int32
  private var maxHeight int32

  /// Gets or sets the native client minimum width in logical pixels; zero removes the limit.
  /// Must be nonnegative and no greater than a nonzero MaxWidth. Embedded hosts are unsupported.
  public prop MinWidth int32{
    get -> minWidth
    set(v) {
      requireUiThread("Window.MinWidth")
      validateSizeLimit(v, maxWidth, true)
      if minWidth == v { return }
      host?.SetMinimumSize(v, minHeight)
      minWidth = v
    }
  }

  /// Gets or sets the native client minimum height in logical pixels; zero removes the limit.
  /// Must be nonnegative and no greater than a nonzero MaxHeight. Embedded hosts are unsupported.
  public prop MinHeight int32{
    get -> minHeight
    set(v) {
      requireUiThread("Window.MinHeight")
      validateSizeLimit(v, maxHeight, true)
      if minHeight == v { return }
      host?.SetMinimumSize(minWidth, v)
      minHeight = v
    }
  }

  /// Gets or sets the native client maximum width in logical pixels; zero removes the limit.
  /// Must be nonnegative and, when nonzero, no smaller than MinWidth. Embedded hosts are unsupported.
  public prop MaxWidth int32{
    get -> maxWidth
    set(v) {
      requireUiThread("Window.MaxWidth")
      validateSizeLimit(v, minWidth, false)
      if maxWidth == v { return }
      host?.SetMaximumSize(v, maxHeight)
      maxWidth = v
    }
  }

  /// Gets or sets the native client maximum height in logical pixels; zero removes the limit.
  /// Must be nonnegative and, when nonzero, no smaller than MinHeight. Embedded hosts are unsupported.
  public prop MaxHeight int32{
    get -> maxHeight
    set(v) {
      requireUiThread("Window.MaxHeight")
      validateSizeLimit(v, minHeight, false)
      if maxHeight == v { return }
      host?.SetMaximumSize(maxWidth, v)
      maxHeight = v
    }
  }

  private func validateSizeLimit(value int32, other int32, minimum bool) {
    if value < 0 || (minimum && other != 0 && value > other)
      || (!minimum && value != 0 && value < other) {
        throw ArgumentOutOfRangeException("value", "Size limits must be nonnegative with minimum <= nonzero maximum")
      }
  }

  private func constrainSize() {
    width = Math.Max(width, minWidth)
    height = Math.Max(height, minHeight)
    if maxWidth != 0 { width = Math.Min(width, maxWidth) }
    if maxHeight != 0 { height = Math.Min(height, maxHeight) }
  }
}
