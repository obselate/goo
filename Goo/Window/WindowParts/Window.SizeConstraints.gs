package Goo

import System

/// Selects the client axes measured from the root before the first map.
public enum SizeToContent { None; Width; Height; Both }

@Flags
internal enum WindowResizeConstraints { None = 0; Left = 1; Right = 2; Top = 4; Bottom = 8 }

/// Configures client-area sizes in layout units on the owning UI thread.
public partial class Window {
  private var minWidth float64
  private var minHeight float64
  private var maxWidth float64
  private var maxHeight float64
  private var nativeMinWidth int32
  private var nativeMinHeight int32
  private var requestedSize LayoutSize?

  internal prop ResizeConstraints WindowResizeConstraints{
    get -> (host as SdlHost?)?.ResizeConstraints ?? WindowResizeConstraints.None
  }

  /// Gets or sets the client minimum size in layout units. Zero removes an axis limit.
  /// Each axis must be finite, nonnegative and no greater than its nonzero maximum. Embedded hosts are unsupported.
  public prop MinSize LayoutSize{
    get -> ReadUntrackedWindowValue(LayoutSize(minWidth, minHeight))
    set(value) {
      requireUiThread("Window.MinSize")
      validateSizeLimit(value.Width, maxWidth, true)
      validateSizeLimit(value.Height, maxHeight, true)
      if MinSize == value { return }
      applyMinimumSize(value.Width, value.Height)
      minWidth = value.Width
      minHeight = value.Height
    }
  }

  /// Gets or sets the client maximum size in layout units. Zero removes an axis limit.
  /// Each axis must be finite, nonnegative and no smaller than its minimum. Embedded hosts are unsupported.
  public prop MaxSize LayoutSize{
    get -> ReadUntrackedWindowValue(LayoutSize(maxWidth, maxHeight))
    set(value) {
      requireUiThread("Window.MaxSize")
      validateSizeLimit(value.Width, minWidth, false)
      validateSizeLimit(value.Height, minHeight, false)
      if MaxSize == value { return }
      host?.SetMaximumSize(scaledSize(value.Width), scaledSize(value.Height))
      maxWidth = value.Width
      maxHeight = value.Height
    }
  }

  /// Measures the selected root axes once before the first map, within MaxSize and the display work area and at least MinSize.
  /// A root axis with a percentage or viewport-relative part keeps Size on that axis.
  /// Descendant viewport units use the declared Size during this measure. Later resizing belongs to the user.
  /// Ignored on embedded and Android hosts, which control the client size.
  public prop SizeToContent SizeToContent{ get; init; }

  private func validateSizeLimit(value float64, other float64, minimum bool) {
    if !Double.IsFinite(value) || value < 0.0 || (minimum && other != 0.0 && value > other)
      || (!minimum && value != 0.0 && value < other) {
        throw ArgumentOutOfRangeException("value", "Size limits must be finite and nonnegative with minimum <= nonzero maximum")
      }
  }

  private func applyMinimumSize(minimumWidth float64, minimumHeight float64) {
    let scaledWidth = scaledSize(minimumWidth)
    let scaledHeight = scaledSize(minimumHeight)
    host?.SetMinimumSize(scaledWidth, scaledHeight)
    nativeMinWidth = scaledWidth
    nativeMinHeight = scaledHeight
  }

  private func constrainSize() {
    if embeddedHost == nil { applyMinimumSize(minWidth, minHeight) }
    width = Math.Max(width, nativeMinWidth)
    height = Math.Max(height, nativeMinHeight)
    if maxWidth != 0.0 { width = Math.Min(width, scaledSize(maxWidth)) }
    if maxHeight != 0.0 { height = Math.Min(height, scaledSize(maxHeight)) }
  }

  private func measureInitialContent() {
    if SizeToContent == SizeToContent.None { return }
    if LayerShell != nil { throw NotSupportedException("Layer-shell sizes are configured by the compositor") }
    guard let native = host else { return }

    let display = native.GetCurrentDisplay()
    let area = display?.UsableBounds ?? display?.Bounds
    let maximum = LayoutSize(
      Math.Min(if maxWidth != 0.0 { maxWidth } else { Double.PositiveInfinity },
        (area?.Width ?? Double.PositiveInfinity) / float64(UiScale)),
      Math.Min(if maxHeight != 0.0 { maxHeight } else { Double.PositiveInfinity },
        (area?.Height ?? Double.PositiveInfinity) / float64(UiScale)))
    Size = MeasureContentSize(maximum,
      SizeToContent == SizeToContent.Width || SizeToContent == SizeToContent.Both,
      SizeToContent == SizeToContent.Height || SizeToContent == SizeToContent.Both)
    native.RefreshMetricsIfChanged()
    consumeNativeMetrics()
  }

  internal func MeasureContentSize(maximum LayoutSize, widthAxis bool = true, heightAxis bool = true,
    percentageSize LayoutSize? = nil) LayoutSize {
    UpdateTree()
    guard let tree = node else { return Size }
    var dependsOnWidth = tree.Width.Unit == LengthUnit.Percent
    var dependsOnHeight = tree.Height.Unit == LengthUnit.Percent
    if let declarations = LengthDeclarations.Get(tree) {
      for entry in declarations.Values {
        if entry.Field == StyleField.Width { dependsOnWidth = entry.Value.DependsOnContainer }
        if entry.Field == StyleField.Height { dependsOnHeight = entry.Value.DependsOnContainer }
      }
    }
    let measureWidth = widthAxis && (percentageSize != nil || !dependsOnWidth)
    let measureHeight = heightAxis && (percentageSize != nil || !dependsOnHeight)
    if !measureWidth && !measureHeight { return Size }
    let availableWidth = maximum.Width
    let availableHeight = maximum.Height
    let basis = percentageSize ?? LayoutSize(float64(LayoutWidth), float64(LayoutHeight))
    let engine = layout.Engine
    var request = engine.RootRequest(float32(basis.Width), float32(basis.Height), layout.Density, tree.Direction)
    let margin = engine.ResolveBox(tree, in request).Margin
    request.Override = FlexOverride.Capped
    request.Width = measureWidth ? FlexConstraint.Cap(float32(availableWidth) - margin.Sum(true))
      : FlexConstraint.Exact(float32(basis.Width) - margin.Sum(true))
    request.Height = measureHeight ? FlexConstraint.Cap(float32(availableHeight) - margin.Sum(false))
      : FlexConstraint.Exact(float32(basis.Height) - margin.Sum(false))
    let measured = engine.MeasureSubtree(tree, request)
    let measuredWidth = FlexLayoutEngine.PixelRound(measured.Width, layout.Density) + margin.Sum(true)
    let measuredHeight = FlexLayoutEngine.PixelRound(measured.Height, layout.Density) + margin.Sum(false)
    let contentWidth = measureWidth ? Math.Max(minWidth, Math.Min(measuredWidth, availableWidth)) : Size.Width
    let contentHeight = measureHeight ? Math.Max(minHeight, Math.Min(measuredHeight, availableHeight)) : Size.Height
    if percentageSize != nil {
      layout.PopupMeasuredWidth = tree.Width.Unit == LengthUnit.Percent ? float32(contentWidth - margin.Sum(true)) : nil
      layout.PopupMeasuredHeight = tree.Height.Unit == LengthUnit.Percent ? float32(contentHeight - margin.Sum(false)) : nil
      layout.laidOut = false
    }
    return LayoutSize(contentWidth, contentHeight)
  }

  internal func ClearPopupMeasurement() {
    layout.PopupMeasuredWidth = nil
    layout.PopupMeasuredHeight = nil
    layout.laidOut = false
  }
}
