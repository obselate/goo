package Goo

import System
import System.Collections.Generic

internal enum FieldKind {
  KLength; KColor; KScalar; KEnum; KString; KGradient; KBoxShadows; KPath;
  KImageSource; KShaderEffect; KScrollbar
}

@Flags
internal enum StyleFieldFlags {
  None = 0;
  Inheritable = 1;
  Logical = 2;
  ShapeExcluded = 4;
  Lerpable = 8;
  Initialize = 16;
}

internal data struct StyleFieldInfo {
  internal var Field StyleField
  internal var Kind FieldKind
  internal var Effects ReconcileEffects
  internal var Flags StyleFieldFlags
  internal var Default StyleEntry
}

internal class StyleFields {
  shared {
    private let values []StyleFieldInfo = createStyleFieldInfo()
    internal let InheritableFields []StyleField = selectStyleFields(
      values, StyleFieldFlags.Inheritable)
    internal let InitialFields []StyleField = selectStyleFields(
      values, StyleFieldFlags.Initialize)

    internal prop Count int32{ get -> values.Length }

    internal func Kind(field StyleField) FieldKind -> values[ordinal(field)].Kind

    internal func Effects(field StyleField) ReconcileEffects -> values[ordinal(field)].Effects

    internal func Default(field StyleField) StyleEntry {
      let info = values[ordinal(field)]
      if hasStyleFieldFlag(info.Flags, StyleFieldFlags.Logical) {
        throw NotSupportedException("StyleFields.Default: logical StyleField")
      }
      return info.Default
    }

    internal func Has(field StyleField, flag StyleFieldFlags) bool ->
    hasStyleFieldFlag(values[ordinal(field)].Flags, flag)

    private func ordinal(field StyleField) int32 {
      let result = int32(field)
      if result < 0 || result >= values.Length {
        throw ArgumentOutOfRangeException("field")
      }
      return result
    }
  }
}

private func createStyleFieldInfo() []StyleFieldInfo {
  let layoutPaint = ReconcileEffects.Layout | ReconcileEffects.Paint
  let layoutPaintInput = layoutPaint | ReconcileEffects.Input
  let paintInput = ReconcileEffects.Paint | ReconcileEffects.Input
  let lerp = StyleFieldFlags.Lerpable
  let init = StyleFieldFlags.Initialize
  let inherit = StyleFieldFlags.Inheritable
  let logical = StyleFieldFlags.Logical
  let shapeExcluded = StyleFieldFlags.ShapeExcluded
  let result = []StyleFieldInfo{
    styleFieldInfo(StyleField.Width, FieldKind.KLength, layoutPaint, lerp | init),
    styleFieldInfo(StyleField.Height, FieldKind.KLength, layoutPaint, lerp | init),
    styleFieldInfo(StyleField.MinWidth, FieldKind.KLength, layoutPaint, lerp | init),
    styleFieldInfo(StyleField.MinHeight, FieldKind.KLength, layoutPaint, lerp | init),
    styleFieldInfo(StyleField.MaxWidth, FieldKind.KLength, layoutPaint, lerp | init),
    styleFieldInfo(StyleField.MaxHeight, FieldKind.KLength, layoutPaint, lerp | init),
    styleFieldInfo(StyleField.AspectRatio, FieldKind.KScalar, layoutPaint, lerp | init),
    styleFieldInfo(StyleField.Padding, FieldKind.KLength, layoutPaint, lerp | init),
    styleFieldInfo(StyleField.PaddingLeft, FieldKind.KLength, layoutPaint, lerp | init),
    styleFieldInfo(StyleField.PaddingTop, FieldKind.KLength, layoutPaint, lerp | init),
    styleFieldInfo(StyleField.PaddingRight, FieldKind.KLength, layoutPaint, lerp | init),
    styleFieldInfo(StyleField.PaddingBottom, FieldKind.KLength, layoutPaint, lerp | init),
    styleFieldInfo(StyleField.Margin, FieldKind.KLength, layoutPaint, lerp | init),
    styleFieldInfo(StyleField.MarginLeft, FieldKind.KLength, layoutPaint, lerp | init),
    styleFieldInfo(StyleField.MarginTop, FieldKind.KLength, layoutPaint, lerp | init),
    styleFieldInfo(StyleField.MarginRight, FieldKind.KLength, layoutPaint, lerp | init),
    styleFieldInfo(StyleField.MarginBottom, FieldKind.KLength, layoutPaint, lerp | init),
    styleFieldInfo(StyleField.Gap, FieldKind.KLength, layoutPaint, lerp | init),
    styleFieldInfo(StyleField.RowGap, FieldKind.KLength, layoutPaint, lerp | init),
    styleFieldInfo(StyleField.ColumnGap, FieldKind.KLength, layoutPaint, lerp | init),
    styleFieldInfo(StyleField.FlexDirection, FieldKind.KEnum, layoutPaint, init),
    styleFieldInfo(StyleField.FlexWrap, FieldKind.KEnum, layoutPaint, init),
    styleFieldInfo(StyleField.JustifyContent, FieldKind.KEnum, layoutPaint, init),
    styleFieldInfo(StyleField.AlignItems, FieldKind.KEnum, layoutPaint, init),
    styleFieldInfo(StyleField.AlignSelf, FieldKind.KEnum, layoutPaint, init),
    styleFieldInfo(StyleField.AlignContent, FieldKind.KEnum, layoutPaint, init),
    styleFieldInfo(StyleField.FlexGrow, FieldKind.KScalar, layoutPaint, lerp | init),
    styleFieldInfo(StyleField.FlexShrink, FieldKind.KScalar, layoutPaint, lerp | init),
    styleFieldInfo(StyleField.FlexBasis, FieldKind.KLength, layoutPaint, lerp | init),
    styleFieldInfo(StyleField.Position, FieldKind.KEnum, layoutPaint, init),
    styleFieldInfo(StyleField.Left, FieldKind.KLength, layoutPaint, lerp | init),
    styleFieldInfo(StyleField.Top, FieldKind.KLength, layoutPaint, lerp | init),
    styleFieldInfo(StyleField.Right, FieldKind.KLength, layoutPaint, lerp | init),
    styleFieldInfo(StyleField.Bottom, FieldKind.KLength, layoutPaint, lerp | init),
    styleFieldInfo(StyleField.Display, FieldKind.KEnum, layoutPaintInput, init),
    styleFieldInfo(StyleField.OverflowX, FieldKind.KEnum, layoutPaintInput, init),
    styleFieldInfo(StyleField.OverflowY, FieldKind.KEnum, layoutPaintInput, init),
    styleFieldInfo(StyleField.BackgroundColor, FieldKind.KColor, ReconcileEffects.Paint, lerp | init),
    styleFieldInfo(StyleField.BorderRadius, FieldKind.KLength, ReconcileEffects.Paint, lerp | init),
    styleFieldInfo(StyleField.BorderTopLeftRadius, FieldKind.KLength,
      ReconcileEffects.Paint, lerp | init),
    styleFieldInfo(StyleField.BorderTopRightRadius, FieldKind.KLength,
      ReconcileEffects.Paint, lerp | init),
    styleFieldInfo(StyleField.BorderBottomLeftRadius, FieldKind.KLength,
      ReconcileEffects.Paint, lerp | init),
    styleFieldInfo(StyleField.BorderBottomRightRadius, FieldKind.KLength,
      ReconcileEffects.Paint, lerp | init),
    styleFieldInfo(StyleField.BorderLeftWidth, FieldKind.KLength, layoutPaint,
      lerp | init | shapeExcluded),
    styleFieldInfo(StyleField.BorderTopWidth, FieldKind.KLength, layoutPaint,
      lerp | init | shapeExcluded),
    styleFieldInfo(StyleField.BorderRightWidth, FieldKind.KLength, layoutPaint,
      lerp | init | shapeExcluded),
    styleFieldInfo(StyleField.BorderBottomWidth, FieldKind.KLength, layoutPaint,
      lerp | init | shapeExcluded),
    styleFieldInfo(StyleField.BorderLeftColor, FieldKind.KColor, ReconcileEffects.Paint,
      lerp | init | shapeExcluded),
    styleFieldInfo(StyleField.BorderTopColor, FieldKind.KColor, ReconcileEffects.Paint,
      lerp | init | shapeExcluded),
    styleFieldInfo(StyleField.BorderRightColor, FieldKind.KColor, ReconcileEffects.Paint,
      lerp | init | shapeExcluded),
    styleFieldInfo(StyleField.BorderBottomColor, FieldKind.KColor, ReconcileEffects.Paint,
      lerp | init | shapeExcluded),
    styleFieldInfo(StyleField.Opacity, FieldKind.KScalar, ReconcileEffects.Paint, lerp | init,
      StyleEntry{ Field: StyleField.Opacity, A: 1.0F }),
    styleFieldInfo(StyleField.BoxShadows, FieldKind.KBoxShadows,
      ReconcileEffects.Paint, lerp | init),
    styleFieldInfo(StyleField.Color, FieldKind.KColor, ReconcileEffects.Paint,
      lerp | init | inherit, StyleEntry{ Field: StyleField.Color, D: 1.0F }),
    styleFieldInfo(StyleField.FontFamily, FieldKind.KString, layoutPaint, init | inherit,
      StyleEntry{ Field: StyleField.FontFamily, Payload: "" }),
    styleFieldInfo(StyleField.FontSize, FieldKind.KLength, layoutPaint, lerp | init | inherit,
      StyleEntry{ Field: StyleField.FontSize, A: 16.0F,
        B: float32(int32(LengthUnit.Px)) }),
    styleFieldInfo(StyleField.FontStyle, FieldKind.KEnum, layoutPaint, init | inherit),
    styleFieldInfo(StyleField.FontWeight, FieldKind.KScalar, layoutPaint,
      lerp | init | inherit, StyleEntry{ Field: StyleField.FontWeight, A: 400.0F }),
    styleFieldInfo(StyleField.LetterSpacing, FieldKind.KLength, layoutPaint,
      lerp | init | inherit, StyleEntry{ Field: StyleField.LetterSpacing,
        B: float32(int32(LengthUnit.Px)) }),
    styleFieldInfo(StyleField.LineHeight, FieldKind.KScalar, layoutPaint,
      lerp | init | inherit, StyleEntry{ Field: StyleField.LineHeight, A: 1.2F }),
    styleFieldInfo(StyleField.TextAlign, FieldKind.KEnum, ReconcileEffects.Paint,
      init | inherit, StyleEntry{ Field: StyleField.TextAlign,
        A: float32(int32(TextAlign.Start)) }),
    styleFieldInfo(StyleField.BackgroundGradient, FieldKind.KGradient,
      ReconcileEffects.Paint, init),
    styleFieldInfo(StyleField.Cursor, FieldKind.KEnum, ReconcileEffects.Input, inherit),
    styleFieldInfo(StyleField.ZIndex, FieldKind.KEnum, paintInput, StyleFieldFlags.None),
    styleFieldInfo(StyleField.TextWrap, FieldKind.KEnum, layoutPaint, init | inherit),
    styleFieldInfo(StyleField.TextTrimming, FieldKind.KEnum, layoutPaint, init),
    styleFieldInfo(StyleField.TextTransform, FieldKind.KEnum, layoutPaint, init | inherit),
    styleFieldInfo(StyleField.OutlineWidth, FieldKind.KLength,
      ReconcileEffects.Paint, StyleFieldFlags.None),
    styleFieldInfo(StyleField.OutlineColor, FieldKind.KColor,
      ReconcileEffects.Paint, StyleFieldFlags.None),
    styleFieldInfo(StyleField.OutlineOffset, FieldKind.KLength,
      ReconcileEffects.Paint, StyleFieldFlags.None),
    styleFieldInfo(StyleField.Visibility, FieldKind.KEnum, paintInput, init),
    styleFieldInfo(StyleField.TextDecoration, FieldKind.KEnum,
      ReconcileEffects.Paint, init | inherit),
    styleFieldInfo(StyleField.TransformTranslateX, FieldKind.KLength, paintInput, lerp,
      StyleEntry{ Field: StyleField.TransformTranslateX,
        B: float32(int32(LengthUnit.Px)) }),
    styleFieldInfo(StyleField.TransformTranslateY, FieldKind.KLength, paintInput, lerp,
      StyleEntry{ Field: StyleField.TransformTranslateY,
        B: float32(int32(LengthUnit.Px)) }),
    styleFieldInfo(StyleField.TransformRotate, FieldKind.KScalar, paintInput, lerp),
    styleFieldInfo(StyleField.TransformScale, FieldKind.KScalar, paintInput, lerp,
      StyleEntry{ Field: StyleField.TransformScale, A: 1.0F }),
    styleFieldInfo(StyleField.TransformOriginX, FieldKind.KLength, paintInput, lerp,
      StyleEntry{ Field: StyleField.TransformOriginX, A: 50.0F,
        B: float32(int32(LengthUnit.Percent)) }),
    styleFieldInfo(StyleField.TransformOriginY, FieldKind.KLength, paintInput, lerp,
      StyleEntry{ Field: StyleField.TransformOriginY, A: 50.0F,
        B: float32(int32(LengthUnit.Percent)) }),
    styleFieldInfo(StyleField.TextShadows, FieldKind.KBoxShadows,
      ReconcileEffects.Paint, inherit),
    styleFieldInfo(StyleField.ShapeStrokeWidth, FieldKind.KLength, layoutPaint, lerp | init),
    styleFieldInfo(StyleField.ShapeStrokeColor, FieldKind.KColor, paintInput, lerp | init),
    styleFieldInfo(StyleField.TextMaxLines, FieldKind.KEnum, layoutPaint, init),
    styleFieldInfo(StyleField.TextStrokeWidth, FieldKind.KLength,
      ReconcileEffects.Paint, inherit),
    styleFieldInfo(StyleField.TextStrokeColor, FieldKind.KColor,
      ReconcileEffects.Paint, inherit),
    styleFieldInfo(StyleField.Direction, FieldKind.KEnum, layoutPaint, init | inherit),
    styleFieldInfo(StyleField.MarginStart, FieldKind.KLength, layoutPaint, logical | lerp),
    styleFieldInfo(StyleField.MarginEnd, FieldKind.KLength, layoutPaint, logical | lerp),
    styleFieldInfo(StyleField.PaddingStart, FieldKind.KLength, layoutPaint, logical | lerp),
    styleFieldInfo(StyleField.PaddingEnd, FieldKind.KLength, layoutPaint, logical | lerp),
    styleFieldInfo(StyleField.Start, FieldKind.KLength, layoutPaint, logical | lerp),
    styleFieldInfo(StyleField.End, FieldKind.KLength, layoutPaint, logical | lerp),
    styleFieldInfo(StyleField.BorderStartWidth, FieldKind.KLength, layoutPaint,
      logical | lerp | shapeExcluded),
    styleFieldInfo(StyleField.BorderEndWidth, FieldKind.KLength, layoutPaint,
      logical | lerp | shapeExcluded),
    styleFieldInfo(StyleField.BorderStartColor, FieldKind.KColor, ReconcileEffects.Paint,
      logical | lerp | shapeExcluded),
    styleFieldInfo(StyleField.BorderEndColor, FieldKind.KColor, ReconcileEffects.Paint,
      logical | lerp | shapeExcluded),
    styleFieldInfo(StyleField.BackgroundImage, FieldKind.KString, ReconcileEffects.Paint,
      StyleFieldFlags.None, StyleEntry{ Field: StyleField.BackgroundImage, Payload: "" }),
    styleFieldInfo(StyleField.BackgroundImageFit, FieldKind.KEnum, ReconcileEffects.Paint,
      StyleFieldFlags.None, StyleEntry{ Field: StyleField.BackgroundImageFit,
        A: float32(int32(ImageFit.Cover)) }),
    styleFieldInfo(StyleField.ClipPath, FieldKind.KPath, paintInput, StyleFieldFlags.None),
    styleFieldInfo(StyleField.ClipPathFit, FieldKind.KEnum, paintInput, StyleFieldFlags.None,
      StyleEntry{ Field: StyleField.ClipPathFit, A: float32(int32(ShapeFit.Fill)) }),
    styleFieldInfo(StyleField.BorderStyle, FieldKind.KEnum, ReconcileEffects.Paint, init),
    styleFieldInfo(StyleField.BlendMode, FieldKind.KEnum, ReconcileEffects.Paint, init),
    styleFieldInfo(StyleField.TransformScaleX, FieldKind.KScalar, paintInput, lerp,
      StyleEntry{ Field: StyleField.TransformScaleX, A: 1.0F }),
    styleFieldInfo(StyleField.TransformScaleY, FieldKind.KScalar, paintInput, lerp,
      StyleEntry{ Field: StyleField.TransformScaleY, A: 1.0F }),
    styleFieldInfo(StyleField.TransformSkewX, FieldKind.KScalar, paintInput, lerp),
    styleFieldInfo(StyleField.TransformSkewY, FieldKind.KScalar, paintInput, lerp),
    styleFieldInfo(StyleField.BackgroundImageSource, FieldKind.KImageSource,
      ReconcileEffects.Paint, StyleFieldFlags.None),
    styleFieldInfo(StyleField.ClipPathFillRule, FieldKind.KEnum, paintInput,
      StyleFieldFlags.None, StyleEntry{ Field: StyleField.ClipPathFillRule,
        A: float32(int32(FillRule.NonZero)) }),
    styleFieldInfo(StyleField.ShaderEffect, FieldKind.KShaderEffect,
      ReconcileEffects.Paint, init),
    styleFieldInfo(StyleField.ScrollbarVisibilityX, FieldKind.KEnum, layoutPaintInput, init,
      StyleEntry{ Field: StyleField.ScrollbarVisibilityX,
        A: float32(int32(ScrollbarVisibility.Auto)) }),
    styleFieldInfo(StyleField.ScrollbarVisibilityY, FieldKind.KEnum, layoutPaintInput, init,
      StyleEntry{ Field: StyleField.ScrollbarVisibilityY,
        A: float32(int32(ScrollbarVisibility.Auto)) }),
    styleFieldInfo(StyleField.ScrollbarX, FieldKind.KScrollbar, layoutPaintInput, init),
    styleFieldInfo(StyleField.ScrollbarY, FieldKind.KScrollbar, layoutPaintInput, init),
  }
  let expected = int32(StyleField.ScrollbarY) + 1
  if result.Length != expected {
    throw InvalidOperationException("StyleField metadata count mismatch")
  }
  for i in 0 ... result.Length {
    if int32(result[i].Field) != i {
      throw InvalidOperationException("StyleField metadata order mismatch")
    }
  }
  return result
}

private func styleFieldInfo(field StyleField, kind FieldKind, effects ReconcileEffects,
  flags StyleFieldFlags) StyleFieldInfo -> StyleFieldInfo{
    Field: field,
    Kind: kind,
    Effects: effects,
    Flags: flags,
    Default: StyleEntry{ Field: field },
  }

private func styleFieldInfo(field StyleField, kind FieldKind, effects ReconcileEffects,
  flags StyleFieldFlags, defaultEntry StyleEntry) StyleFieldInfo -> StyleFieldInfo{
    Field: field,
    Kind: kind,
    Effects: effects,
    Flags: flags,
    Default: defaultEntry,
  }

private func selectStyleFields(values []StyleFieldInfo, flag StyleFieldFlags) []StyleField {
  let result = List[StyleField]()
  for value in values {
    if hasStyleFieldFlag(value.Flags, flag) {
      result.Add(value.Field)
    }
  }
  return result.ToArray()
}

private func hasStyleFieldFlag(flags StyleFieldFlags, flag StyleFieldFlags) bool ->
(int32(flags) & int32(flag)) != 0
