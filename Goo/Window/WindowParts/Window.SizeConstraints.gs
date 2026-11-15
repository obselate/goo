package Goo

import Facebook.Yoga
import System

/// Selects the client axes measured from the root before the first map.
public enum SizeToContent { None; Width; Height; Both }

/// Configures client-area sizes in layout units on the owning UI thread.
public partial class Window {
  private var minWidth float64
  private var minHeight float64
  private var maxWidth float64
  private var maxHeight float64
  private var nativeMinWidth int32
  private var nativeMinHeight int32
  private var requestedSize LayoutSize?

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
    guard let tree = node, let yoga = tree.Yoga else { return Size }
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
    let marginWidth = float64(YGNodeLayoutAPI.YGNodeLayoutGetMargin(yoga, YGEdge.Left)
      + YGNodeLayoutAPI.YGNodeLayoutGetMargin(yoga, YGEdge.Right))
    let marginHeight = float64(YGNodeLayoutAPI.YGNodeLayoutGetMargin(yoga, YGEdge.Top)
      + YGNodeLayoutAPI.YGNodeLayoutGetMargin(yoga, YGEdge.Bottom))
    let boundedWidth = Math.Max(0.0, availableWidth - marginWidth)
    let boundedHeight = Math.Max(0.0, availableHeight - marginHeight)
    let maxContentWidth = if tree.MaxWidth.Unit == LengthUnit.Px { Math.Min(boundedWidth, float64(tree.MaxWidth.Value)) } else { boundedWidth }
    let maxContentHeight = if tree.MaxHeight.Unit == LengthUnit.Px { Math.Min(boundedHeight, float64(tree.MaxHeight.Value)) } else { boundedHeight }
    try {
      YGNodeStyleAPI.YGNodeStyleSetMaxWidth(yoga, float32(maxContentWidth))
      YGNodeStyleAPI.YGNodeStyleSetMaxHeight(yoga, float32(maxContentHeight))
      if percentageSize != nil {
        if tree.Width.Unit == LengthUnit.Percent { YGNodeStyleAPI.YGNodeStyleSetWidthPercent(yoga, tree.Width.Value) }
        if tree.Height.Unit == LengthUnit.Percent { YGNodeStyleAPI.YGNodeStyleSetHeightPercent(yoga, tree.Height.Value) }
      }
      YGNodeAPI.YGNodeCalculateLayout(yoga,
        if measureWidth && (percentageSize == nil || tree.Width.Unit != LengthUnit.Percent) { Single.NaN }
          else { float32(percentageSize?.Width ?? float64(LayoutWidth)) },
        if measureHeight && (percentageSize == nil || tree.Height.Unit != LengthUnit.Percent) { Single.NaN }
          else { float32(percentageSize?.Height ?? float64(LayoutHeight)) }, yogaDirection(tree.Direction))
      let measuredWidth = float64(YGNodeLayoutAPI.YGNodeLayoutGetWidth(yoga)
        + YGNodeLayoutAPI.YGNodeLayoutGetMargin(yoga, YGEdge.Left)
        + YGNodeLayoutAPI.YGNodeLayoutGetMargin(yoga, YGEdge.Right))
      let measuredHeight = float64(YGNodeLayoutAPI.YGNodeLayoutGetHeight(yoga)
        + YGNodeLayoutAPI.YGNodeLayoutGetMargin(yoga, YGEdge.Top)
        + YGNodeLayoutAPI.YGNodeLayoutGetMargin(yoga, YGEdge.Bottom))
      let contentWidth = if measureWidth { Math.Max(minWidth, Math.Min(measuredWidth, availableWidth)) } else { Size.Width }
      let contentHeight = if measureHeight { Math.Max(minHeight, Math.Min(measuredHeight, availableHeight)) } else { Size.Height }
      if percentageSize != nil {
        layout.PopupMeasuredWidth = tree.Width.Unit == LengthUnit.Percent ? float32(contentWidth - marginWidth) : nil
        layout.PopupMeasuredHeight = tree.Height.Unit == LengthUnit.Percent ? float32(contentHeight - marginHeight) : nil
      }
      return LayoutSize(contentWidth, contentHeight)
    } finally {
      markYogaStyle(tree, StyleField.MaxWidth)
      markYogaStyle(tree, StyleField.MaxHeight)
      applyMinMax(yoga, tree)
      layout.laidOut = false
    }
  }

  internal func ClearPopupMeasurement() {
    layout.PopupMeasuredWidth = nil
    layout.PopupMeasuredHeight = nil
    if let tree = node, let yoga = tree.Yoga {
      if tree.Width.Unit == LengthUnit.Percent { YGNodeStyleAPI.YGNodeStyleSetWidthPercent(yoga, tree.Width.Value) }
      if tree.Height.Unit == LengthUnit.Percent { YGNodeStyleAPI.YGNodeStyleSetHeightPercent(yoga, tree.Height.Value) }
      layout.laidOut = false
    }
  }
}
