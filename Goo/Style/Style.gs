package Goo

import System
import System.Collections.Generic

/// Collects ordered layout, paint, and text declarations.
/// Use BasedOn to copy reusable declarations. G# object spread does not copy them.
public open class Style {
  internal var entries StyleEntries?

  /// Creates an empty write-only style declaration sink.
  public init() {
  }

  internal func Entries() StyleEntries ? -> entries

  internal func addEntry(value StyleEntry) {
    if entries == nil { entries = StyleEntries{} }
    entries?.Add(value)
  }

  /// Copies another style's ordered declarations at this declaration position.
  /// The copy does not retain the source Style. Declarations written later take precedence.
  public prop BasedOn Style? {
    init{
      guard let style = value else { return }
      guard let source = style.Entries() else { return }
      if entries == nil { entries = StyleEntries{} }
      entries?.AddRange(source)
    }
  }

  internal func push(f StyleField, a float32, b float32, c float32, d float32) {
    addEntry(StyleEntry{ Field: f, A: a, B: b, C: c, D: d })
  }

  internal func pushLength(f StyleField, v Length) { push(f, v.Value, float32(int32(v.Unit)), 0.0F, 0.0F) }
  internal func pushColor(f StyleField, v Color) { push(f, v.R, v.G, v.B, v.A) }
  internal func pushScalar(f StyleField, v float64) {
    let packed = float32(v)
    if Single.IsNaN(packed) || Single.IsInfinity(packed) {
      throw ArgumentOutOfRangeException(f.ToString())
    }
    push(f, packed, 0.0F, 0.0F, 0.0F)
  }
  internal func pushEnumOrdinal(f StyleField, ordinal int32) { push(f, float32(ordinal), 0.0F, 0.0F, 0.0F) }
  internal func pushInt32(f StyleField, value int32) {
    push(f, float32(value >> 16), float32(value & int32(65535)), 0.0F, 0.0F)
  }
  internal func pushText(f StyleField, value string) {
    addEntry(StyleEntry{ Field: f, Payload: value })
  }
  internal func pushGradient(f StyleField, value Gradient?) {
    addEntry(StyleEntry{ Field: f, Payload: value })
  }
  internal func pushBoxShadowStack(value BoxShadowStack) {
    addEntry(StyleEntry{ Field: StyleField.BoxShadows, Payload: value })
  }

  internal func pushTextShadowStack(value BoxShadowStack) {
    addEntry(StyleEntry{ Field: StyleField.TextShadows, Payload: value })
  }

  internal func pushPath(f StyleField, value VectorPath) {
    addEntry(StyleEntry{ Field: f, Payload: value.payload })
  }
  internal func pushImageSource(f StyleField, value ImageSourceProvider?) {
    addEntry(StyleEntry{ Field: f, Payload: value })
  }
  internal func pushShaderEffect(f StyleField, value ShaderEffect?) {
    addEntry(StyleEntry{ Field: f, Payload: value })
  }
  internal func pushScrollbar(f StyleField, value Scrollbar?) {
    addEntry(StyleEntry{ Field: f, Payload: value })
  }

  internal func pushTransform(value PanelTransform) {
    pushLength(StyleField.TransformTranslateX, value.TranslateX)
    pushLength(StyleField.TransformTranslateY, value.TranslateY)
    pushScalar(StyleField.TransformRotate, value.Rotate)
    pushScalar(StyleField.TransformScale, value.Scale)
    pushScalar(StyleField.TransformScaleX, value.ScaleX)
    pushScalar(StyleField.TransformScaleY, value.ScaleY)
    pushScalar(StyleField.TransformSkewX, value.SkewX)
    pushScalar(StyleField.TransformSkewY, value.SkewY)
  }

  /// Sets the preferred width.
  public prop Width Length{ init -> pushCheckedLength(StyleField.Width, value, "Width", false, true, true) }
  /// Sets the preferred height.
  public prop Height Length{ init -> pushCheckedLength(StyleField.Height, value, "Height", false, true, true) }
  /// Sets the minimum width.
  public prop MinWidth Length{ init -> pushCheckedLength(StyleField.MinWidth, value, "MinWidth", false, true, false) }
  /// Sets the minimum height.
  public prop MinHeight Length{ init -> pushCheckedLength(StyleField.MinHeight, value, "MinHeight", false, true, false) }
  /// Sets the maximum width.
  public prop MaxWidth Length{ init -> pushCheckedLength(StyleField.MaxWidth, value, "MaxWidth", false, true, false) }
  /// Sets the maximum height.
  public prop MaxHeight Length{ init -> pushCheckedLength(StyleField.MaxHeight, value, "MaxHeight", false, true, false) }
  /// Sets the preferred width-to-height ratio.
  public prop AspectRatio float64{ init -> pushScalar(StyleField.AspectRatio, checkedNonNegative(value, "AspectRatio")) }
  /// Sets padding in CSS top, right, bottom, left order.
  public prop Padding Edges{ init -> pushEdges(value, true) }
  /// Sets padding at the inline start edge.
  public prop PaddingStart Length{ init -> pushCheckedLength(StyleField.PaddingStart, value, "PaddingStart", false, true, false) }
  /// Sets padding at the inline end edge.
  public prop PaddingEnd Length{ init -> pushCheckedLength(StyleField.PaddingEnd, value, "PaddingEnd", false, true, false) }
  /// Sets margins in CSS top, right, bottom, left order.
  public prop Margin Edges{ init -> pushEdges(value, false) }
  /// Sets the margin at the inline start edge.
  public prop MarginStart Length{ init -> pushCheckedLength(StyleField.MarginStart, value, "MarginStart", true, true, false) }
  /// Sets the margin at the inline end edge.
  public prop MarginEnd Length{ init -> pushCheckedLength(StyleField.MarginEnd, value, "MarginEnd", true, true, false) }
  /// Sets the gap between rows and columns.
  public prop Gap Length{ init -> pushCheckedLength(StyleField.Gap, value, "Gap", false, true, false) }
  /// Sets the gap between rows.
  public prop RowGap Length{ init -> pushCheckedLength(StyleField.RowGap, value, "RowGap", false, true, false) }
  /// Sets the gap between columns.
  public prop ColumnGap Length{ init -> pushCheckedLength(StyleField.ColumnGap, value, "ColumnGap", false, true, false) }
  /// Sets the main-axis direction.
  public prop FlexDirection FlexDirection{ init -> pushEnumOrdinal(StyleField.FlexDirection, int32(value)) }
  /// Sets whether items wrap onto multiple lines.
  public prop FlexWrap FlexWrap{ init -> pushEnumOrdinal(StyleField.FlexWrap, int32(value)) }
  /// Sets main-axis item distribution.
  public prop JustifyContent JustifyContent{ init -> pushEnumOrdinal(StyleField.JustifyContent, int32(value)) }
  /// Sets cross-axis alignment for child items.
  public prop AlignItems AlignItems{ init -> pushEnumOrdinal(StyleField.AlignItems, int32(value)) }
  /// Sets this item's cross-axis alignment.
  public prop AlignSelf AlignSelf{ init -> pushEnumOrdinal(StyleField.AlignSelf, int32(value)) }
  /// Sets cross-axis line distribution.
  public prop AlignContent AlignContent{ init -> pushEnumOrdinal(StyleField.AlignContent, int32(value)) }
  /// Sets the flex grow factor.
  public prop FlexGrow float64{ init -> pushScalar(StyleField.FlexGrow, checkedNonNegative(value, "FlexGrow")) }
  /// Sets the flex shrink factor.
  public prop FlexShrink float64{ init -> pushScalar(StyleField.FlexShrink, checkedNonNegative(value, "FlexShrink")) }
  /// Sets the initial main-axis size.
  public prop FlexBasis Length{ init -> pushCheckedLength(StyleField.FlexBasis, value, "FlexBasis", false, true, true) }
  /// Sets relative, absolute, or static positioning.
  public prop Position PositionType{ init -> pushEnumOrdinal(StyleField.Position, int32(value)) }
  /// Sets the left position offset.
  public prop Left Length{ init -> pushCheckedLength(StyleField.Left, value, "Left", true, true, false) }
  /// Sets the inline start position offset.
  public prop Start Length{ init -> pushCheckedLength(StyleField.Start, value, "Start", true, true, false) }
  /// Sets the top position offset.
  public prop Top Length{ init -> pushCheckedLength(StyleField.Top, value, "Top", true, true, false) }
  /// Sets the right position offset.
  public prop Right Length{ init -> pushCheckedLength(StyleField.Right, value, "Right", true, true, false) }
  /// Sets the inline end position offset.
  public prop End Length{ init -> pushCheckedLength(StyleField.End, value, "End", true, true, false) }
  /// Sets the bottom position offset.
  public prop Bottom Length{ init -> pushCheckedLength(StyleField.Bottom, value, "Bottom", true, true, false) }
  /// Sets whether the element participates in layout.
  public prop Display Display{ init -> pushEnumOrdinal(StyleField.Display, int32(value)) }
  /// Sets the inherited inline direction used by layout and logical edges.
  public prop Direction Direction{ init -> pushEnumOrdinal(StyleField.Direction, int32(value)) }
  /// Sets whether this element and its descendants paint and receive input.
  /// Hidden elements remain in layout and retain their state.
  public prop Visibility Visibility{ init -> pushEnumOrdinal(StyleField.Visibility, int32(value)) }
  /// Sets this element's stacking order among direct siblings.
  public prop ZIndex int32{ init -> pushInt32(StyleField.ZIndex, value) }
  /// Sets overflow handling on both axes.
  public prop Overflow Overflow{
    init{
      pushEnumOrdinal(StyleField.OverflowX, int32(value))
      pushEnumOrdinal(StyleField.OverflowY, int32(value))
    }
  }
  /// Sets horizontal overflow handling.
  public prop OverflowX Overflow{ init -> pushEnumOrdinal(StyleField.OverflowX, int32(value)) }
  /// Sets vertical overflow handling.
  public prop OverflowY Overflow{ init -> pushEnumOrdinal(StyleField.OverflowY, int32(value)) }
  /// Sets scrollbar visibility on both axes.
  public prop ScrollbarVisibility ScrollbarVisibility{
    init{
      pushEnumOrdinal(StyleField.ScrollbarVisibilityX, int32(value))
      pushEnumOrdinal(StyleField.ScrollbarVisibilityY, int32(value))
    }
  }
  /// Sets horizontal scrollbar visibility.
  public prop ScrollbarVisibilityX ScrollbarVisibility{
    init -> pushEnumOrdinal(StyleField.ScrollbarVisibilityX, int32(value))
  }
  /// Sets vertical scrollbar visibility.
  public prop ScrollbarVisibilityY ScrollbarVisibility{
    init -> pushEnumOrdinal(StyleField.ScrollbarVisibilityY, int32(value))
  }
  /// Sets scrollbar presentation on both axes.
  public prop Scrollbar Scrollbar?{
    init{
      pushScrollbar(StyleField.ScrollbarX, value)
      pushScrollbar(StyleField.ScrollbarY, value)
    }
  }
  /// Sets horizontal scrollbar presentation.
  public prop ScrollbarX Scrollbar?{
    init -> pushScrollbar(StyleField.ScrollbarX, value)
  }
  /// Sets vertical scrollbar presentation.
  public prop ScrollbarY Scrollbar?{
    init -> pushScrollbar(StyleField.ScrollbarY, value)
  }
  /// Sets the inherited system pointer cursor.
  public prop Cursor Cursor{ init -> pushEnumOrdinal(StyleField.Cursor, int32(value)) }
  /// Sets the background color.
  public prop BackgroundColor Color{ init -> pushColor(StyleField.BackgroundColor, value) }
  /// Sets or explicitly clears the background gradient.
  /// A non-nil gradient wins over BackgroundColor when both apply.
  public prop BackgroundGradient Gradient? { init -> pushGradient(StyleField.BackgroundGradient, value) }
  /// Sets the local image path painted over the background fill.
  public prop BackgroundImage string{ init -> pushText(StyleField.BackgroundImage, value) }
  /// Sets the owned or provider-backed background source. It wins over BackgroundImage when set.
  public prop BackgroundImageSource ImageSourceProvider? {
    init -> pushImageSource(StyleField.BackgroundImageSource, value)
  }
  /// Sets how the background image fits its border box. The default is Cover.
  public prop BackgroundImageFit ImageFit{ init -> pushEnumOrdinal(StyleField.BackgroundImageFit, int32(value)) }
  /// Sets a vector path with a contour that clips this element and its descendants.
  public prop ClipPath VectorPath{
    init{
      if value.CommandCount != 0 && !PathGeometry.For(value).HasFillContour {
        throw ArgumentException("ClipPath must contain a non-empty contour", "ClipPath")
      }
      pushPath(StyleField.ClipPath, value)
    }
  }
  /// Sets how ClipPath maps into the element border box. The default is Fill.
  public prop ClipPathFit ShapeFit{ init -> pushEnumOrdinal(StyleField.ClipPathFit, int32(value)) }
  public prop ClipPathFillRule FillRule{
    init -> pushEnumOrdinal(StyleField.ClipPathFillRule, int32(value))
  }
  /// Sets the radius of all border corners.
  public prop BorderRadius Length{ init -> pushCheckedLength(StyleField.BorderRadius, value, "BorderRadius", false, false, false) }
  /// Sets the top-left border radius.
  public prop BorderTopLeftRadius Length{ init -> pushCheckedLength(StyleField.BorderTopLeftRadius, value, "BorderTopLeftRadius", false, false, false) }
  /// Sets the top-right border radius.
  public prop BorderTopRightRadius Length{ init -> pushCheckedLength(StyleField.BorderTopRightRadius, value, "BorderTopRightRadius", false, false, false) }
  /// Sets the bottom-left border radius.
  public prop BorderBottomLeftRadius Length{ init -> pushCheckedLength(StyleField.BorderBottomLeftRadius, value, "BorderBottomLeftRadius", false, false, false) }
  /// Sets the bottom-right border radius.
  public prop BorderBottomRightRadius Length{ init -> pushCheckedLength(StyleField.BorderBottomRightRadius, value, "BorderBottomRightRadius", false, false, false) }
  /// Sets box border widths in CSS top, right, bottom, left order.
  /// A uniform value also sets the Shape stroke width.
  public prop BorderWidth Edges{ init -> pushBorderWidths(value) }
  /// Sets the box border width at the inline start edge.
  public prop BorderStartWidth Length{ init -> pushCheckedLength(StyleField.BorderStartWidth, value, "BorderStartWidth", false, false, false) }
  /// Sets the box border width at the inline end edge.
  public prop BorderEndWidth Length{ init -> pushCheckedLength(StyleField.BorderEndWidth, value, "BorderEndWidth", false, false, false) }
  /// Sets box border colors in CSS top, right, bottom, left order.
  /// A uniform value also sets the Shape stroke color.
  public prop BorderColor Edges[Color]{ init -> pushBorderColors(value) }
  /// Sets the box border color at the inline start edge.
  public prop BorderStartColor Color{ init -> pushColor(StyleField.BorderStartColor, value) }
  /// Sets the box border color at the inline end edge.
  public prop BorderEndColor Color{ init -> pushColor(StyleField.BorderEndColor, value) }
  /// Sets how box border edges paint. Dashed and Dotted stroke one ring
  /// using the top border width and color. Shape strokes are unchanged.
  public prop BorderStyle BorderStyle{ init -> pushEnumOrdinal(StyleField.BorderStyle, int32(value)) }
  /// Sets the non-negative pixel thickness of the box outline.
  /// Shape does not paint box outlines.
  public prop OutlineWidth Length{ init -> pushCheckedLength(StyleField.OutlineWidth, value, "OutlineWidth", false, false, false) }
  /// Sets the color of the box outline.
  public prop OutlineColor Color{ init -> pushColor(StyleField.OutlineColor, value) }
  /// Sets the signed pixel offset from the border edge. Positive values move the outline outward.
  public prop OutlineOffset Length{ init -> pushCheckedLength(StyleField.OutlineOffset, value, "OutlineOffset", true, false, false) }
  /// Sets opacity from 0 through 1.
  public prop Opacity float64{ init -> pushScalar(StyleField.Opacity, normalizeOpacity(value)) }
  /// Sets how this element and its descendants composite with the backdrop.
  public prop BlendMode BlendMode{ init -> pushEnumOrdinal(StyleField.BlendMode, int32(value)) }
  public prop ShaderEffect ShaderEffect? {
    init -> pushShaderEffect(StyleField.ShaderEffect, value)
  }
  /// Sets a layout-neutral 2D transform for this element and its descendants.
  /// Components interpolate only when their length units match.
  public prop Transform PanelTransform{ init -> pushTransform(value) }
  /// Sets the horizontal transform origin. The default is 50 percent.
  public prop TransformOriginX Length{
    init -> pushLength(StyleField.TransformOriginX, normalizeTransformOrigin(value, "TransformOriginX"))
  }
  /// Sets the vertical transform origin. The default is 50 percent.
  public prop TransformOriginY Length{
    init -> pushLength(StyleField.TransformOriginY, normalizeTransformOrigin(value, "TransformOriginY"))
  }
  /// Sets one outer or inset shadow as a one-item shadow stack.
  /// Shapes shadow their painted fill and stroke geometry.
  public prop BoxShadow BoxShadow{
    init -> pushBoxShadowStack(singleBoxShadow(value))
  }
  /// Sets the defensively copied front-to-back shadow stack. An empty array clears state-layer shadows.
  /// Shape shadows follow painted fill and stroke geometry.
  public prop BoxShadows []BoxShadow{ init -> pushBoxShadowStack(copyBoxShadows(value)) }
  /// Sets one inherited text shadow as a one-item shadow stack.
  public prop TextShadow TextShadow{ init -> pushTextShadowStack(singleTextShadow(value)) }
  /// Sets the defensively copied inherited front-to-back text shadow stack.
  /// An empty array clears inherited text shadows.
  public prop TextShadows []TextShadow{ init -> pushTextShadowStack(copyTextShadows(value)) }
  /// Sets the preferred font family.
  public prop FontFamily string{ init -> pushText(StyleField.FontFamily, value) }
  /// Sets the font size.
  public prop FontSize Length{ init -> pushCheckedLength(StyleField.FontSize, value, "FontSize", false, false, false) }
  /// Sets the text color.
  public prop Color Color{ init -> pushColor(StyleField.Color, value) }
  /// Sets the inherited non-negative pixel width of the glyph stroke.
  /// The stroke is paint-only, outlines glyphs only, and snaps during transitions.
  public prop TextStrokeWidth Length{
    init{
      let normalized = value.Unit == LengthUnit.Px && value.Value == 0.0F ? Length{} : value
      pushCheckedLength(StyleField.TextStrokeWidth, normalized, "TextStrokeWidth", false, false, false)
    }
  }
  /// Sets the inherited glyph stroke color without changing text layout.
  public prop TextStrokeColor Color{ init -> pushColor(StyleField.TextStrokeColor, value) }
  /// Sets the font weight.
  public prop FontWeight float64{ init -> pushScalar(StyleField.FontWeight, checkedNonNegative(value, "FontWeight")) }
  /// Sets the font style.
  public prop FontStyle FontStyle{ init -> pushEnumOrdinal(StyleField.FontStyle, int32(value)) }
  /// Sets added spacing between letters.
  public prop LetterSpacing Length{ init -> pushCheckedLength(StyleField.LetterSpacing, value, "LetterSpacing", true, false, false) }
  /// Sets the line-height multiplier.
  public prop LineHeight float64{ init -> pushScalar(StyleField.LineHeight, checkedNonNegative(value, "LineHeight")) }
  /// Sets horizontal text alignment.
  public prop TextAlign TextAlign{ init -> pushEnumOrdinal(StyleField.TextAlign, int32(value)) }
  /// Sets the inherited lines painted with text. Values can be combined.
  public prop TextDecoration TextDecoration{
    init{
      let bits = int32(value)
      if (bits & ^int32(3)) != 0 {
        throw ArgumentOutOfRangeException("TextDecoration")
      }
      pushEnumOrdinal(StyleField.TextDecoration, bits)
    }
  }
  /// Sets whether static text wraps at soft-wrap opportunities.
  public prop TextWrap TextWrap{ init -> pushEnumOrdinal(StyleField.TextWrap, int32(value)) }
  /// Sets how overflowing static text is trimmed.
  public prop TextTrimming TextTrimming{ init -> pushEnumOrdinal(StyleField.TextTrimming, int32(value)) }
  /// Caps visual lines in static Text. Zero keeps all lines; negative values throw ArgumentOutOfRangeException.
  /// It does not inherit, change TextEntry, or interpolate through transitions.
  public prop TextMaxLines int32{
    init{
      if value < 0 { throw ArgumentOutOfRangeException("TextMaxLines") }
      pushInt32(StyleField.TextMaxLines, value)
    }
  }
  /// Sets inherited invariant casing for static Text. TextEntry is unchanged.
  public prop TextTransform TextTransform{ init -> pushEnumOrdinal(StyleField.TextTransform, int32(value)) }

  internal func pushEdges(value Edges, padding bool) {
    let name = padding ? "Padding" : "Margin"
    let allowNegative = !padding
    if value.Uniform {
      pushCheckedLength(padding ? StyleField.Padding : StyleField.Margin,
        value.UniformValue, name, allowNegative, true, false)
    }
    if value.HasTop {
      pushCheckedLength(padding ? StyleField.PaddingTop : StyleField.MarginTop,
        value.Top, name + ".Top", allowNegative, true, false)
    }
    if value.HasRight {
      pushCheckedLength(padding ? StyleField.PaddingRight : StyleField.MarginRight,
        value.Right, name + ".Right", allowNegative, true, false)
    }
    if value.HasBottom {
      pushCheckedLength(padding ? StyleField.PaddingBottom : StyleField.MarginBottom,
        value.Bottom, name + ".Bottom", allowNegative, true, false)
    }
    if value.HasLeft {
      pushCheckedLength(padding ? StyleField.PaddingLeft : StyleField.MarginLeft,
        value.Left, name + ".Left", allowNegative, true, false)
    }
  }

  internal func pushBorderWidths(value Edges) {
    if value.Uniform {
      pushCheckedLength(StyleField.ShapeStrokeWidth, value.UniformValue, "BorderWidth", false, false, false)
      pushCheckedLength(StyleField.BorderTopWidth, value.UniformValue, "BorderWidth", false, false, false)
      pushCheckedLength(StyleField.BorderRightWidth, value.UniformValue, "BorderWidth", false, false, false)
      pushCheckedLength(StyleField.BorderBottomWidth, value.UniformValue, "BorderWidth", false, false, false)
    }
    if value.HasTop {
      pushCheckedLength(StyleField.BorderTopWidth, value.Top, "BorderWidth.Top", false, false, false)
    }
    if value.HasRight {
      pushCheckedLength(StyleField.BorderRightWidth, value.Right, "BorderWidth.Right", false, false, false)
    }
    if value.HasBottom {
      pushCheckedLength(StyleField.BorderBottomWidth, value.Bottom, "BorderWidth.Bottom", false, false, false)
    }
    if value.HasLeft {
      pushCheckedLength(StyleField.BorderLeftWidth, value.Left, "BorderWidth.Left", false, false, false)
    }
  }

  internal func pushBorderColors(value Edges[Color]) {
    if value.Uniform {
      pushColor(StyleField.ShapeStrokeColor, value.UniformValue)
      pushColor(StyleField.BorderTopColor, value.UniformValue)
      pushColor(StyleField.BorderRightColor, value.UniformValue)
      pushColor(StyleField.BorderBottomColor, value.UniformValue)
    }
    if value.HasTop { pushColor(StyleField.BorderTopColor, value.Top) }
    if value.HasRight { pushColor(StyleField.BorderRightColor, value.Right) }
    if value.HasBottom { pushColor(StyleField.BorderBottomColor, value.Bottom) }
    if value.HasLeft { pushColor(StyleField.BorderLeftColor, value.Left) }
  }

  internal func pushCheckedLength(field StyleField, value Length, name string,
    allowsNegative bool, allowsPercent bool, allowsAuto bool) {
      if value.Unit == LengthUnit.Unset {
        pushLength(field, value)
        return
      }
      if Double.IsNaN(float64(value.Value)) || Double.IsInfinity(float64(value.Value)) {
        throw ArgumentOutOfRangeException(name)
      }
      if value.Unit == LengthUnit.Auto && !allowsAuto {
        throw ArgumentException(name + " does not support auto", name)
      }
      if value.Unit == LengthUnit.Percent && !allowsPercent {
        throw ArgumentException(name + " does not support percent", name)
      }
      if !allowsNegative && value.Value < 0.0F {
        throw ArgumentOutOfRangeException(name)
      }
      pushLength(field, value)
    }

  internal func checkedNonNegative(value float64, name string) float64 {
    if Double.IsNaN(value) || Double.IsInfinity(value) || value < 0.0 {
      throw ArgumentOutOfRangeException(name)
    }
    return value
  }

  internal func normalizeOpacity(value float64) float64 {
    if !motionFinite(value) {
      throw ArgumentOutOfRangeException("Opacity")
    }
    if value < 0.0 { return 0.0 }
    return if value > 1.0 { 1.0 } else { value }
  }
}
