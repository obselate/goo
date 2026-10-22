package Goo

import System

/// Configures native client-area size limits on the owning UI thread.
public partial class Window {
  private var minWidth int32
  private var minHeight int32
  private var maxWidth int32
  private var maxHeight int32
  private var nativeMinWidth int32
  private var nativeMinHeight int32

  /// Gets or sets the client minimum width in layout pixels, multiplied by UiScale and clamped to the current display's usable width.
  /// Zero removes the limit. Must be nonnegative and no greater than a nonzero MaxWidth. Embedded hosts are unsupported.
  public prop MinWidth int32{
    get -> minWidth
    set(v) {
      requireUiThread("Window.MinWidth")
      validateSizeLimit(v, maxWidth, true)
      if minWidth == v { return }
      applyMinimumSize(v, minHeight)
      minWidth = v
    }
  }

  /// Gets or sets the client minimum height in layout pixels, multiplied by UiScale and clamped to the current display's usable height.
  /// Zero removes the limit. Must be nonnegative and no greater than a nonzero MaxHeight. Embedded hosts are unsupported.
  public prop MinHeight int32{
    get -> minHeight
    set(v) {
      requireUiThread("Window.MinHeight")
      validateSizeLimit(v, maxHeight, true)
      if minHeight == v { return }
      applyMinimumSize(minWidth, v)
      minHeight = v
    }
  }

  /// Gets or sets the client maximum width in layout pixels, multiplied by UiScale for the native limit; zero removes the limit.
  /// Must be nonnegative and, when nonzero, no smaller than MinWidth. Embedded hosts are unsupported.
  public prop MaxWidth int32{
    get -> maxWidth
    set(v) {
      requireUiThread("Window.MaxWidth")
      validateSizeLimit(v, minWidth, false)
      if maxWidth == v { return }
      host?.SetMaximumSize(scaledSize(v), scaledSize(maxHeight))
      maxWidth = v
    }
  }

  /// Gets or sets the client maximum height in layout pixels, multiplied by UiScale for the native limit; zero removes the limit.
  /// Must be nonnegative and, when nonzero, no smaller than MinHeight. Embedded hosts are unsupported.
  public prop MaxHeight int32{
    get -> maxHeight
    set(v) {
      requireUiThread("Window.MaxHeight")
      validateSizeLimit(v, minHeight, false)
      if maxHeight == v { return }
      host?.SetMaximumSize(scaledSize(maxWidth), scaledSize(v))
      maxHeight = v
    }
  }

  private func validateSizeLimit(value int32, other int32, minimum bool) {
    if value < 0 || (minimum && other != 0 && value > other)
      || (!minimum && value != 0 && value < other) {
        throw ArgumentOutOfRangeException("value", "Size limits must be nonnegative with minimum <= nonzero maximum")
      }
  }

  private func applyMinimumSize(minimumWidth int32, minimumHeight int32) {
    var scaledWidth = scaledSize(minimumWidth)
    var scaledHeight = scaledSize(minimumHeight)
    if scaledWidth != 0 || scaledHeight != 0 {
      if let display = host?.GetCurrentDisplay() {
        if let usable = display.UsableBounds {
          if usable.Width > 0.0 { scaledWidth = Math.Min(scaledWidth, int32(usable.Width)) }
          if usable.Height > 0.0 { scaledHeight = Math.Min(scaledHeight, int32(usable.Height)) }
        }
      }
    }
    host?.SetMinimumSize(scaledWidth, scaledHeight)
    nativeMinWidth = scaledWidth
    nativeMinHeight = scaledHeight
  }

  private func constrainSize() {
    if embeddedHost == nil { applyMinimumSize(minWidth, minHeight) }
    if nativeMinWidth < scaledSize(minWidth) { width = Math.Min(width, nativeMinWidth) }
    if nativeMinHeight < scaledSize(minHeight) { height = Math.Min(height, nativeMinHeight) }
    width = Math.Max(width, nativeMinWidth)
    height = Math.Max(height, nativeMinHeight)
    if maxWidth != 0 { width = Math.Min(width, scaledSize(maxWidth)) }
    if maxHeight != 0 { height = Math.Min(height, scaledSize(maxHeight)) }
  }
}
