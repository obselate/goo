package Goo

import System
import System.Collections.Generic

/// Selects a style property that can interpolate during a transition.
public enum TransitionProperty {
  All;
  Width; Height; MinWidth; MinHeight; MaxWidth; MaxHeight; AspectRatio;
  Padding; PaddingLeft; PaddingTop; PaddingRight; PaddingBottom;
  Margin; MarginLeft; MarginTop; MarginRight; MarginBottom;
  Gap; RowGap; ColumnGap;
  FlexGrow; FlexShrink; FlexBasis;
  Left; Top; Right; Bottom;
  BackgroundColor;
  BorderRadius; BorderTopLeftRadius; BorderTopRightRadius;
  BorderBottomLeftRadius; BorderBottomRightRadius;
  BorderWidth; BorderLeftWidth; BorderTopWidth; BorderRightWidth; BorderBottomWidth;
  BorderColor; BorderLeftColor; BorderTopColor; BorderRightColor; BorderBottomColor;
  Opacity; BoxShadow;
  Color; FontSize; FontWeight; LetterSpacing; LineHeight;
  Transform;
  OutlineWidth; OutlineColor; OutlineOffset;
  TextStrokeWidth; TextStrokeColor; TextShadow;
  BackgroundGradient; BackdropBlur;
  ShapeCornerRadius; StrokeStart; StrokeEnd; MiterLimit;
  DashOffset; DashIntervals; SelectionColor; CaretColor
}

internal func allTransitionSelection() StyleMask -> StyleMask { Low: UInt64.MaxValue, High: UInt64.MaxValue }

internal func transitionSelectionIsAll(selection StyleMask) bool -> selection.Low == UInt64.MaxValue && selection.High == UInt64.MaxValue

internal func sameTransitionSelection(left StyleMask, right StyleMask) bool -> left.Low == right.Low && left.High == right.High

internal func makeTransitionSelection(values []TransitionProperty) StyleMask {
  var result = StyleMask{}
  for i in 0 ... values.Length {
    let property = values[i]
    if property == TransitionProperty.All {
      return allTransitionSelection()
    }
    result = styleMaskUnion(result, transitionPropertyMask(property))
  }
  return result
}

internal func transitionSelected(selection StyleMask, field StyleField) bool -> styleMaskHas(selection, field)

internal func transitionSelectionProperties(selection StyleMask) []TransitionProperty {
  if transitionSelectionIsAll(selection) {
    return []TransitionProperty{ TransitionProperty.All }
  }
  let result = List[TransitionProperty]()
  addTransitionProperty(result, selection, TransitionProperty.Width)
  addTransitionProperty(result, selection, TransitionProperty.Height)
  addTransitionProperty(result, selection, TransitionProperty.MinWidth)
  addTransitionProperty(result, selection, TransitionProperty.MinHeight)
  addTransitionProperty(result, selection, TransitionProperty.MaxWidth)
  addTransitionProperty(result, selection, TransitionProperty.MaxHeight)
  addTransitionProperty(result, selection, TransitionProperty.AspectRatio)
  if !addTransitionShorthand(result, selection, TransitionProperty.Padding) {
    addTransitionProperty(result, selection, TransitionProperty.PaddingLeft)
    addTransitionProperty(result, selection, TransitionProperty.PaddingTop)
    addTransitionProperty(result, selection, TransitionProperty.PaddingRight)
    addTransitionProperty(result, selection, TransitionProperty.PaddingBottom)
  }
  if !addTransitionShorthand(result, selection, TransitionProperty.Margin) {
    addTransitionProperty(result, selection, TransitionProperty.MarginLeft)
    addTransitionProperty(result, selection, TransitionProperty.MarginTop)
    addTransitionProperty(result, selection, TransitionProperty.MarginRight)
    addTransitionProperty(result, selection, TransitionProperty.MarginBottom)
  }
  addTransitionProperty(result, selection, TransitionProperty.Gap)
  addTransitionProperty(result, selection, TransitionProperty.RowGap)
  addTransitionProperty(result, selection, TransitionProperty.ColumnGap)
  addTransitionProperty(result, selection, TransitionProperty.FlexGrow)
  addTransitionProperty(result, selection, TransitionProperty.FlexShrink)
  addTransitionProperty(result, selection, TransitionProperty.FlexBasis)
  addTransitionProperty(result, selection, TransitionProperty.Left)
  addTransitionProperty(result, selection, TransitionProperty.Top)
  addTransitionProperty(result, selection, TransitionProperty.Right)
  addTransitionProperty(result, selection, TransitionProperty.Bottom)
  addTransitionProperty(result, selection, TransitionProperty.BackgroundColor)
  addTransitionProperty(result, selection, TransitionProperty.BorderRadius)
  addTransitionProperty(result, selection, TransitionProperty.BorderTopLeftRadius)
  addTransitionProperty(result, selection, TransitionProperty.BorderTopRightRadius)
  addTransitionProperty(result, selection, TransitionProperty.BorderBottomLeftRadius)
  addTransitionProperty(result, selection, TransitionProperty.BorderBottomRightRadius)
  if !addTransitionShorthand(result, selection, TransitionProperty.BorderWidth) {
    addTransitionProperty(result, selection, TransitionProperty.BorderLeftWidth)
    addTransitionProperty(result, selection, TransitionProperty.BorderTopWidth)
    addTransitionProperty(result, selection, TransitionProperty.BorderRightWidth)
    addTransitionProperty(result, selection, TransitionProperty.BorderBottomWidth)
  }
  if !addTransitionShorthand(result, selection, TransitionProperty.BorderColor) {
    addTransitionProperty(result, selection, TransitionProperty.BorderLeftColor)
    addTransitionProperty(result, selection, TransitionProperty.BorderTopColor)
    addTransitionProperty(result, selection, TransitionProperty.BorderRightColor)
    addTransitionProperty(result, selection, TransitionProperty.BorderBottomColor)
  }
  addTransitionProperty(result, selection, TransitionProperty.Opacity)
  addTransitionProperty(result, selection, TransitionProperty.BoxShadow)
  addTransitionProperty(result, selection, TransitionProperty.Color)
  addTransitionProperty(result, selection, TransitionProperty.FontSize)
  addTransitionProperty(result, selection, TransitionProperty.FontWeight)
  addTransitionProperty(result, selection, TransitionProperty.LetterSpacing)
  addTransitionProperty(result, selection, TransitionProperty.LineHeight)
  addTransitionProperty(result, selection, TransitionProperty.Transform)
  addTransitionProperty(result, selection, TransitionProperty.OutlineWidth)
  addTransitionProperty(result, selection, TransitionProperty.OutlineColor)
  addTransitionProperty(result, selection, TransitionProperty.OutlineOffset)
  addTransitionProperty(result, selection, TransitionProperty.TextStrokeWidth)
  addTransitionProperty(result, selection, TransitionProperty.TextStrokeColor)
  addTransitionProperty(result, selection, TransitionProperty.TextShadow)
  addTransitionProperty(result, selection, TransitionProperty.BackgroundGradient)
  addTransitionProperty(result, selection, TransitionProperty.BackdropBlur)
  addTransitionProperty(result, selection, TransitionProperty.ShapeCornerRadius)
  addTransitionProperty(result, selection, TransitionProperty.StrokeStart)
  addTransitionProperty(result, selection, TransitionProperty.StrokeEnd)
  addTransitionProperty(result, selection, TransitionProperty.MiterLimit)
  addTransitionProperty(result, selection, TransitionProperty.DashOffset)
  addTransitionProperty(result, selection, TransitionProperty.DashIntervals)
  addTransitionProperty(result, selection, TransitionProperty.SelectionColor)
  addTransitionProperty(result, selection, TransitionProperty.CaretColor)
  return result.ToArray()
}

private func addTransitionProperty(result List[TransitionProperty], selection StyleMask,
  property TransitionProperty) {
    if transitionSelectionContains(selection, transitionPropertyMask(property)) {
      result.Add(property)
    }
  }

private func addTransitionShorthand(result List[TransitionProperty], selection StyleMask,
  property TransitionProperty) bool{
    if !transitionSelectionContains(selection, transitionPropertyMask(property)) {
      return false
    }
    result.Add(property)
    return true
  }

private func transitionSelectionContains(selection StyleMask, required StyleMask) bool -> (selection.Low & required.Low) == required.Low
  && (selection.High & required.High) == required.High

private func transitionPropertyMask(property TransitionProperty) StyleMask {
  var result = StyleMask{}
  switch property {
    case TransitionProperty.Width { return styleMaskWith(result, StyleField.Width) }
    case TransitionProperty.Height { return styleMaskWith(result, StyleField.Height) }
    case TransitionProperty.MinWidth { return styleMaskWith(result, StyleField.MinWidth) }
    case TransitionProperty.MinHeight { return styleMaskWith(result, StyleField.MinHeight) }
    case TransitionProperty.MaxWidth { return styleMaskWith(result, StyleField.MaxWidth) }
    case TransitionProperty.MaxHeight { return styleMaskWith(result, StyleField.MaxHeight) }
    case TransitionProperty.AspectRatio { return styleMaskWith(result, StyleField.AspectRatio) }
    case TransitionProperty.Padding {
      result = styleMaskWith(result, StyleField.PaddingLeft)
      result = styleMaskWith(result, StyleField.PaddingTop)
      result = styleMaskWith(result, StyleField.PaddingRight)
      return styleMaskWith(result, StyleField.PaddingBottom)
    }
    case TransitionProperty.PaddingLeft { return styleMaskWith(result, StyleField.PaddingLeft) }
    case TransitionProperty.PaddingTop { return styleMaskWith(result, StyleField.PaddingTop) }
    case TransitionProperty.PaddingRight { return styleMaskWith(result, StyleField.PaddingRight) }
    case TransitionProperty.PaddingBottom { return styleMaskWith(result, StyleField.PaddingBottom) }
    case TransitionProperty.Margin {
      result = styleMaskWith(result, StyleField.MarginLeft)
      result = styleMaskWith(result, StyleField.MarginTop)
      result = styleMaskWith(result, StyleField.MarginRight)
      return styleMaskWith(result, StyleField.MarginBottom)
    }
    case TransitionProperty.MarginLeft { return styleMaskWith(result, StyleField.MarginLeft) }
    case TransitionProperty.MarginTop { return styleMaskWith(result, StyleField.MarginTop) }
    case TransitionProperty.MarginRight { return styleMaskWith(result, StyleField.MarginRight) }
    case TransitionProperty.MarginBottom { return styleMaskWith(result, StyleField.MarginBottom) }
    case TransitionProperty.Gap { return styleMaskWith(result, StyleField.Gap) }
    case TransitionProperty.RowGap { return styleMaskWith(result, StyleField.RowGap) }
    case TransitionProperty.ColumnGap { return styleMaskWith(result, StyleField.ColumnGap) }
    case TransitionProperty.FlexGrow { return styleMaskWith(result, StyleField.FlexGrow) }
    case TransitionProperty.FlexShrink { return styleMaskWith(result, StyleField.FlexShrink) }
    case TransitionProperty.FlexBasis { return styleMaskWith(result, StyleField.FlexBasis) }
    case TransitionProperty.Left { return styleMaskWith(result, StyleField.Left) }
    case TransitionProperty.Top { return styleMaskWith(result, StyleField.Top) }
    case TransitionProperty.Right { return styleMaskWith(result, StyleField.Right) }
    case TransitionProperty.Bottom { return styleMaskWith(result, StyleField.Bottom) }
    case TransitionProperty.BackgroundColor { return styleMaskWith(result, StyleField.BackgroundColor) }
    case TransitionProperty.BorderRadius { return styleMaskWith(result, StyleField.BorderRadius) }
    case TransitionProperty.BorderTopLeftRadius { return styleMaskWith(result, StyleField.BorderTopLeftRadius) }
    case TransitionProperty.BorderTopRightRadius { return styleMaskWith(result, StyleField.BorderTopRightRadius) }
    case TransitionProperty.BorderBottomLeftRadius { return styleMaskWith(result, StyleField.BorderBottomLeftRadius) }
    case TransitionProperty.BorderBottomRightRadius { return styleMaskWith(result, StyleField.BorderBottomRightRadius) }
    case TransitionProperty.BorderWidth {
      result = styleMaskWith(result, StyleField.BorderLeftWidth)
      result = styleMaskWith(result, StyleField.BorderTopWidth)
      result = styleMaskWith(result, StyleField.BorderRightWidth)
      result = styleMaskWith(result, StyleField.BorderBottomWidth)
      return styleMaskWith(result, StyleField.ShapeStrokeWidth)
    }
    case TransitionProperty.BorderLeftWidth { return styleMaskWith(result, StyleField.BorderLeftWidth) }
    case TransitionProperty.BorderTopWidth { return styleMaskWith(result, StyleField.BorderTopWidth) }
    case TransitionProperty.BorderRightWidth { return styleMaskWith(result, StyleField.BorderRightWidth) }
    case TransitionProperty.BorderBottomWidth { return styleMaskWith(result, StyleField.BorderBottomWidth) }
    case TransitionProperty.BorderColor {
      result = styleMaskWith(result, StyleField.BorderLeftColor)
      result = styleMaskWith(result, StyleField.BorderTopColor)
      result = styleMaskWith(result, StyleField.BorderRightColor)
      result = styleMaskWith(result, StyleField.BorderBottomColor)
      return styleMaskWith(result, StyleField.ShapeStrokeColor)
    }
    case TransitionProperty.BorderLeftColor { return styleMaskWith(result, StyleField.BorderLeftColor) }
    case TransitionProperty.BorderTopColor { return styleMaskWith(result, StyleField.BorderTopColor) }
    case TransitionProperty.BorderRightColor { return styleMaskWith(result, StyleField.BorderRightColor) }
    case TransitionProperty.BorderBottomColor { return styleMaskWith(result, StyleField.BorderBottomColor) }
    case TransitionProperty.Opacity { return styleMaskWith(result, StyleField.Opacity) }
    case TransitionProperty.BoxShadow { return styleMaskWith(result, StyleField.BoxShadows) }
    case TransitionProperty.Color { return styleMaskWith(result, StyleField.Color) }
    case TransitionProperty.FontSize { return styleMaskWith(result, StyleField.FontSize) }
    case TransitionProperty.FontWeight { return styleMaskWith(result, StyleField.FontWeight) }
    case TransitionProperty.LetterSpacing { return styleMaskWith(result, StyleField.LetterSpacing) }
    case TransitionProperty.LineHeight { return styleMaskWith(result, StyleField.LineHeight) }
    case TransitionProperty.Transform {
      result = styleMaskWith(result, StyleField.TransformTranslateX)
      result = styleMaskWith(result, StyleField.TransformTranslateY)
      result = styleMaskWith(result, StyleField.TransformRotate)
      result = styleMaskWith(result, StyleField.TransformScale)
      result = styleMaskWith(result, StyleField.TransformScaleX)
      result = styleMaskWith(result, StyleField.TransformScaleY)
      result = styleMaskWith(result, StyleField.TransformSkewX)
      result = styleMaskWith(result, StyleField.TransformSkewY)
      result = styleMaskWith(result, StyleField.TransformOriginX)
      return styleMaskWith(result, StyleField.TransformOriginY)
    }
    case TransitionProperty.OutlineWidth { return styleMaskWith(result, StyleField.OutlineWidth) }
    case TransitionProperty.OutlineColor { return styleMaskWith(result, StyleField.OutlineColor) }
    case TransitionProperty.OutlineOffset { return styleMaskWith(result, StyleField.OutlineOffset) }
    case TransitionProperty.TextStrokeWidth { return styleMaskWith(result, StyleField.TextStrokeWidth) }
    case TransitionProperty.TextStrokeColor { return styleMaskWith(result, StyleField.TextStrokeColor) }
    case TransitionProperty.TextShadow { return styleMaskWith(result, StyleField.TextShadows) }
    case TransitionProperty.BackgroundGradient { return styleMaskWith(result, StyleField.BackgroundGradient) }
    case TransitionProperty.BackdropBlur { return styleMaskWith(result, StyleField.BackdropBlur) }
    case TransitionProperty.ShapeCornerRadius { return styleMaskWith(result, StyleField.ShapeCornerRadius) }
    case TransitionProperty.StrokeStart { return styleMaskWith(result, StyleField.StrokeStart) }
    case TransitionProperty.StrokeEnd { return styleMaskWith(result, StyleField.StrokeEnd) }
    case TransitionProperty.MiterLimit { return styleMaskWith(result, StyleField.MiterLimit) }
    case TransitionProperty.DashOffset { return styleMaskWith(result, StyleField.DashOffset) }
    case TransitionProperty.DashIntervals { return styleMaskWith(result, StyleField.DashIntervals) }
    case TransitionProperty.SelectionColor { return styleMaskWith(result, StyleField.SelectionColor) }
    case TransitionProperty.CaretColor { return styleMaskWith(result, StyleField.CaretColor) }
    default { throw ArgumentOutOfRangeException("TransitionProperties") }
  }
}
