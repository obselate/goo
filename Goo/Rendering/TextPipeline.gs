package Goo

import System
import System.Collections.Generic
import System.Runtime.CompilerServices

// Value snapshots keep the common single-paragraph path allocation-neutral.
internal data struct TextSourceSnapshot(Source string, Display string, Transform TextTransform) { }

internal data struct TextParagraphAnalysis(Start int32, End int32, Text string,
  Resolution BidiResolution?, FontFamily string, FontSize float32, FontWeight float64,
  Italic bool, LetterSpacing float32, Direction Direction) { }

internal class TextAnalysis {
  internal prop Snapshot TextSourceSnapshot{ get; set; }
  internal prop FontFamily string{ get; set; }
  internal prop FontSize float32{ get; set; }
  internal prop FontWeight float64{ get; set; }
  internal prop Italic bool{ get; set; }
  internal prop LetterSpacing float32{ get; set; }
  internal prop Direction Direction{ get; set; }
  internal prop First TextParagraphAnalysis{ get; set; }
  internal prop Additional [] ? TextParagraphAnalysis{ get; set; }
  internal prop ParagraphCount int32{ get; set; }

  internal init() {
    Snapshot = TextSourceSnapshot("", "", TextTransform.None)
    FontFamily = ""
  }

  internal func Paragraph(index int32) TextParagraphAnalysis {
    if index == 0 { return First }
    return Additional!! [index - 1]
  }

  internal func SetParagraph(index int32, value TextParagraphAnalysis) {
    if index == 0 {
      First = value
    } else {
      Additional!! [index - 1] = value
    }
  }
}

internal class TextAnalysisStore {
  internal prop Value TextAnalysis? { get; set; }
}

internal class PassiveTextRangeBlob {
  internal prop Ranges []TextStyleRange{ get; init; }

  internal init(ranges []TextStyleRange) {
    Ranges = ranges
  }
}

internal class TextPresentationPlan {
  internal prop Ranges []TextStyleRange{ get; init; }

  internal init(ranges []TextStyleRange) {
    Ranges = ranges
  }
}

internal class PassiveTextPresentation {
  internal prop Content string{ get; init; }
  internal prop Transform TextTransform{ get; init; }
  internal prop Ranges []TextStyleRange{ get; init; }
  internal prop Plan TextPresentationPlan{ get; init; }

  internal init(content string, transform TextTransform, ranges []TextStyleRange,
    displayRanges []TextStyleRange) {
      Content = content
      Transform = transform
      Ranges = ranges
      Plan = TextPresentationPlan(displayRanges)
    }
}

internal data struct PassiveTextPresentationChange(Changed bool, FlowChanged bool) { }

internal class PassiveTextRangeBlobs {
  shared {
    private let values ConditionalWeakTable[Text, PassiveTextRangeBlob] =
    ConditionalWeakTable[Text, PassiveTextRangeBlob]()
    private let empty []TextStyleRange = []TextStyleRange{}

    internal func Read(text Text) []TextStyleRange {
      if !text.HasPassiveTextRanges { return empty }
      guard let value = Values(text) else { return empty }
      return copyPassiveTextStyleRanges(value)
    }

    internal func Values(text Text) [] ? TextStyleRange {
      if !text.HasPassiveTextRanges { return nil }
      if values.TryGetValue(text, out var value) { return value.Ranges }
      return nil
    }

    internal func Write(text Text, ranges [] ? TextStyleRange) {
      guard let value = ranges else { throw ArgumentNullException("StyleRanges") }
      values.Remove(text)
      text.HasPassiveTextRanges = value.Length != 0
      if value.Length != 0 {
        values.Add(text, PassiveTextRangeBlob(copyPassiveTextStyleRanges(value)))
      }
    }
  }
}

internal class PassiveTextPresentations {
  shared {
    private let values ConditionalWeakTable[Node, PassiveTextPresentation] =
    ConditionalWeakTable[Node, PassiveTextPresentation]()

    internal func Apply(n Node, content string,
      ranges [] ? TextStyleRange) PassiveTextPresentationChange{
        if ranges == nil || ranges.Length == 0 {
          if values.TryGetValue(n, out var prior) {
            values.Remove(n)
            return PassiveTextPresentationChange{ Changed: true,
              FlowChanged: rangesAffectFlow(prior.Ranges) }
          }
          return PassiveTextPresentationChange{}
        }
        if values.TryGetValue(n, out var current) && current.Content == content
          && current.Transform == n.TextTransform && sameRanges(current.Ranges, ranges) {
            return PassiveTextPresentationChange{}
          }
        validateRanges(content, ranges)
        let displayRanges = mapDisplayRanges(n, content, ranges)
        var oldFlow = false
        if values.TryGetValue(n, out var prior) { oldFlow = rangesAffectFlow(prior.Ranges) }
        let flowChanged = rangesAffectFlow(ranges) || oldFlow
        values.Remove(n)
        values.Add(n, PassiveTextPresentation(content, n.TextTransform,
          copyPassiveTextStyleRanges(ranges), displayRanges))
        return PassiveTextPresentationChange{ Changed: true, FlowChanged: flowChanged }
      }

    internal func Read(n Node) [] ? TextStyleRange {
      if values.TryGetValue(n, out var value) { return value.Plan.Ranges }
      return nil
    }

    internal func Remove(n Node) {
      values.Remove(n)
    }

    private func validateRanges(content string, ranges []TextStyleRange) {
      for i in 0 ... ranges.Length {
        let value = ranges[i]
        let textRange = value.Range
        if textRange.Start < 0 || textRange.Length < 0
          || textRange.Start > content.Length - textRange.Length{
            throw ArgumentOutOfRangeException("StyleRanges")
          }
        let style = value.Style
        if style == nil { throw ArgumentNullException("StyleRanges") }
        if let entries = style.Entries() {
          for entryIndex in 0 ... entries.Count {
            let field = entries.At(entryIndex).Field
            if field == StyleField.TextTransform {
              throw ArgumentException("Text style ranges do not support TextTransform", "StyleRanges")
            }
            if !inlinePresentationStyleField(field) {
              throw ArgumentException("Text style ranges support inline text fields only",
                "StyleRanges")
            }
          }
        }
      }
    }

    private func sameRanges(left []TextStyleRange, right []TextStyleRange) bool {
      if left.Length != right.Length { return false }
      for i in 0 ... left.Length {
        if left[i].Range != right[i].Range
          || !sameStyleEntries(left[i].Style.Entries(), right[i].Style.Entries()) {
            return false
          }
      }
      return true
    }

    private func mapDisplayRanges(n Node, content string,
      ranges []TextStyleRange) []TextStyleRange{
        let result = [ranges.Length]TextStyleRange
        for i in 0 ... ranges.Length {
          let textRange = ranges[i].Range
          let start = TextLayouts.transformText(content.Substring(0, textRange.Start),
            n.TextTransform).Length
          let end = TextLayouts.transformText(content.Substring(0,
            textRange.Start + textRange.Length),
            n.TextTransform).Length
          result[i] = TextStyleRange{ Range: TextRange{ Start: start, Length: end - start },
            Style: ranges[i].Style }
        }
        return result
      }

    private func rangesAffectFlow(ranges []TextStyleRange) bool {
      for i in 0 ... ranges.Length {
        if let entries = ranges[i].Style.Entries() {
          for entryIndex in 0 ... entries.Count {
            let field = entries.At(entryIndex).Field
            if field == StyleField.FontFamily || field == StyleField.FontSize
              || field == StyleField.FontWeight || field == StyleField.FontStyle
              || field == StyleField.LetterSpacing || field == StyleField.LineHeight
              || field == StyleField.Direction || field == StyleField.TextTransform{
                return true
              }
          }
        }
      }
      return false
    }
  }
}

internal func copyPassiveTextStyleRanges(values []TextStyleRange) []TextStyleRange {
  let result = [values.Length]TextStyleRange
  for i in 0 ... values.Length { result[i] = values[i] }
  return result
}

internal data class TextResolvedStyle {
  internal prop Color Color{ get; set; }
  internal prop FontFamily string{ get; set; }
  internal prop FontSize float32{ get; set; }
  internal prop FontWeight float64{ get; set; }
  internal prop FontStyle FontStyle{ get; set; }
  internal prop LetterSpacing float32{ get; set; }
  internal prop LineHeight float32{ get; set; }
  internal prop Decoration TextDecoration{ get; set; }
  internal prop StrokeWidth float32{ get; set; }
  internal prop StrokeColor Color{ get; set; }
  internal prop Shadows BoxShadowStack? { get; set; }
  internal prop Direction Direction{ get; set; }
  internal prop Transform TextTransform{ get; set; }
}

internal class TextPaintRun {
  internal prop Shape ShapedText? { get; init; }
  internal prop X float32{ get; init; }
  internal prop DisplayStart int32{ get; init; }
  internal prop DisplayLength int32{ get; init; }
  internal prop Style TextResolvedStyle{ get; init; }
  internal prop DecorationSegments [] ? float32{ get; set; }
}

internal class TextRichLine {
  internal prop DisplayStart int32{ get; init; }
  internal prop Width float32{ get; set; }
  internal prop Ascent float32{ get; set; }
  internal prop Descent float32{ get; set; }
  internal prop Height float32{ get; set; }
  internal prop PaintTop float32{ get; set; }
  internal prop PaintBottom float32{ get; set; }
  internal prop PaintPad float32{ get; set; }
  internal prop Runs List[TextPaintRun]{ get; init; }

  internal init(displayStart int32, width float32, ascent float32, descent float32,
    height float32) {
      DisplayStart = displayStart
      Width = width
      Ascent = ascent
      Descent = descent
      Height = height
      Runs = List[TextPaintRun]()
    }
}

internal func textPaintPad(strokeWidth float32, shadows BoxShadowStack?) float32 {
  var pad = strokeWidth > 0.0F ? strokeWidth * 0.5F + 1.0F : 0.0F
  for i in 0 ... textShadowCount(shadows) {
    let shadow = textShadowAt(shadows, i)
    let blur = if shadow.Blur.Unit == LengthUnit.Px { shadow.Blur.Value } else { 0.0F }
    let x = if shadow.OffsetX.Unit == LengthUnit.Px { shadow.OffsetX.Value } else { 0.0F }
    let y = if shadow.OffsetY.Unit == LengthUnit.Px { shadow.OffsetY.Value } else { 0.0F }
    let reach = (blur > 0.0F ? blur * 2.0F + 2.0F : 0.0F)
    +(x < 0.0F ? -x : x) + (y < 0.0F ? -y : y)
    if reach > pad { pad = reach }
  }
  return pad
}

internal func textDecorationBottom(decoration TextDecoration, ascent float32,
  descent float32) float32{
    var bottom = descent
    if decoration == TextDecoration.None { return bottom }
    var thickness = (descent - ascent) * 0.06F
    if thickness < 1.0F { thickness = 1.0F }
    var offset = descent * 0.45F
    if offset < thickness { offset = thickness }
    let underline = offset + thickness
    if underline > bottom { bottom = underline }
    return bottom
  }

internal class TextRichLayout {
  internal prop Lines List[TextRichLine]{ get; init; }

  internal init() {
    Lines = List[TextRichLine]()
  }
}

internal class TextResolvedStyles {
  shared {
    internal func Base(n Node) TextResolvedStyle -> TextResolvedStyle { Color: n.Color, FontFamily: n.FontFamily,
      FontSize: TextLayouts.fontSize(n), FontWeight: n.FontWeight,
      FontStyle: n.FontStyle, LetterSpacing: TextLayouts.letterSpacing(n),
      LineHeight: float32(n.LineHeight), Decoration: n.TextDecoration,
      StrokeWidth: n.TextStrokeWidth.Px,
      StrokeColor: n.TextStrokeColor, Shadows: n.TextShadows, Direction: n.Direction,
      Transform: n.TextTransform }

    internal func Copy(source TextResolvedStyle) TextResolvedStyle -> TextResolvedStyle { Color: source.Color, FontFamily: source.FontFamily,
      FontSize: source.FontSize, FontWeight: source.FontWeight, FontStyle: source.FontStyle,
      LetterSpacing: source.LetterSpacing, LineHeight: source.LineHeight,
      Decoration: source.Decoration, StrokeWidth: source.StrokeWidth,
      StrokeColor: source.StrokeColor, Shadows: source.Shadows, Direction: source.Direction,
      Transform: source.Transform }

    internal func At(n Node, ranges []TextStyleRange, offset int32) TextResolvedStyle {
      let result = Base(n)
      for i in 0 ... ranges.Length {
        let current = ranges[i]
        let end = current.Range.Start + current.Range.Length
        if offset < current.Range.Start || offset >= end { continue }
        Apply(result, current.Style)
      }
      return result
    }

    internal func NextBoundary(ranges []TextStyleRange, offset int32, limit int32) int32 {
      var result = limit
      for i in 0 ... ranges.Length {
        let current = ranges[i].Range
        let end = current.Start + current.Length
        if current.Start > offset && current.Start < result { result = current.Start }
        if end > offset && end < result { result = end }
      }
      return result
    }

    internal func AffectsWidth(left TextResolvedStyle, right TextResolvedStyle) bool -> left.FontFamily != right.FontFamily || left.FontSize != right.FontSize
      || left.FontWeight != right.FontWeight || left.FontStyle != right.FontStyle
      || left.LetterSpacing != right.LetterSpacing || left.Direction != right.Direction
      || left.Transform != right.Transform

    internal func Apply(result TextResolvedStyle, style Style) {
      if let entries = style.Entries() {
        for i in 0 ... entries.Count {
          let entry = entries.At(i)
          switch entry.Field {
            case StyleField.Color {
              result.Color = Color.FromNormalized(entry.A, entry.B, entry.C, entry.D)
            }
            case StyleField.FontFamily { result.FontFamily = entryText(entry) ?? result.FontFamily }
            case StyleField.FontSize {
              if LengthUnit(int32(entry.B)) == LengthUnit.Px { result.FontSize = entry.A }
            }
            case StyleField.FontWeight { result.FontWeight = float64(entry.A) }
            case StyleField.FontStyle { result.FontStyle = FontStyle(int32(entry.A)) }
            case StyleField.LetterSpacing {
              if LengthUnit(int32(entry.B)) == LengthUnit.Px { result.LetterSpacing = entry.A }
            }
            case StyleField.LineHeight { result.LineHeight = entry.A }
            case StyleField.TextDecoration { result.Decoration = TextDecoration(int32(entry.A)) }
            case StyleField.TextStrokeWidth {
              if LengthUnit(int32(entry.B)) == LengthUnit.Px { result.StrokeWidth = entry.A }
            }
            case StyleField.TextStrokeColor {
              result.StrokeColor = Color.FromNormalized(entry.A, entry.B, entry.C, entry.D)
            }
            case StyleField.TextShadows { result.Shadows = entryShadows(entry) }
            case StyleField.Direction { result.Direction = Direction(int32(entry.A)) }
            case StyleField.TextTransform { result.Transform = TextTransform(int32(entry.A)) }
            case _ { }
          }
        }
      }
    }
  }
}

internal class TextLineShaper {
  shared {
    internal func Base(paragraph TextParagraphAnalysis, start int32, end int32) ShapedText -> TextShaping.ShapeLine(paragraph.Text, start, end - start, paragraph.FontFamily,
      paragraph.FontSize, int32(paragraph.FontWeight), paragraph.Italic,
      paragraph.LetterSpacing, int32(paragraph.Direction), paragraph.Resolution)

    internal func Styled(paragraph TextParagraphAnalysis, start int32, end int32,
      style TextResolvedStyle) ShapedText{
        let resolution = if style.Direction == paragraph.Direction { paragraph.Resolution }
        else { TextShaping.ResolveParagraph(paragraph.Text, int32(style.Direction)) }
        return shapeStyled(paragraph.Text, resolution, start, end, style)
      }

    internal func Styled(text string, resolution BidiResolution?, baseDirection Direction,
      start int32, end int32, style TextResolvedStyle) ShapedText{
        let activeResolution = if style.Direction == baseDirection { resolution }
        else { TextShaping.ResolveParagraph(text, int32(style.Direction)) }
        return shapeStyled(text, activeResolution, start, end, style)
      }

    private func shapeStyled(text string, resolution BidiResolution?, start int32, end int32,
      style TextResolvedStyle) ShapedText -> TextShaping.ShapeLine(text, start, end - start, style.FontFamily, style.FontSize,
        int32(style.FontWeight), style.FontStyle == FontStyle.Italic, style.LetterSpacing,
        int32(style.Direction), resolution)

    internal func Entry(n Node, text string) ShapedText {
      let paragraph = TextParagraphAnalysis(0, text.Length, text,
        TextShaping.ResolveParagraph(text, int32(n.Direction)), n.FontFamily,
        TextLayouts.fontSize(n), n.FontWeight, n.FontStyle == FontStyle.Italic,
        TextLayouts.letterSpacing(n), n.Direction)
      return Base(paragraph, 0, text.Length)
    }
  }
}

internal class TextFlow {
  shared {
    internal func Consider(cursor int32, fit int32, preferred int32, overflowed bool,
      candidate int32, width float32, limit float32, breakable bool) TextFlowCandidate{
        let exceeds = width > limit
        if exceeds && fit != cursor {
          return TextFlowCandidate(fit, preferred, true, true)
        }
        return TextFlowCandidate(candidate, breakable ? candidate : preferred,
          overflowed || exceeds, false)
      }

    internal func Resolve(cursor int32, fit int32, preferred int32, overflowed bool) int32 {
      if overflowed && preferred > cursor { return preferred }
      return fit
    }

    internal func Measure(paragraph TextParagraphAnalysis, start int32, end int32,
      style TextResolvedStyle) float32{
        using let shape = TextLineShaper.Styled(paragraph, start, end, style)
        return shape.Width
      }

    internal func MeasureBase(paragraph TextParagraphAnalysis, start int32, end int32) float32 {
      using let shape = TextLineShaper.Base(paragraph, start, end)
      return shape.Width
    }
  }
}

internal data struct TextFlowCandidate(Fit int32, Preferred int32, Overflowed bool,
  Stop bool) { }

internal class TextAnalyses {
  shared {
    private let values ConditionalWeakTable[Node, TextAnalysisStore] =
    ConditionalWeakTable[Node, TextAnalysisStore]()

    internal func For(n Node) TextAnalysis {
      var store TextAnalysisStore
      if !values.TryGetValue(n, out store) {
        store = TextAnalysisStore()
        values.Add(n, store)
      }
      if let current = store.Value {
        if matches(current, n) {
          return current
        }
        return buildInto(current, n.Content, n.TextTransform, n.FontFamily,
          TextLayouts.fontSize(n), n.FontWeight, n.FontStyle == FontStyle.Italic,
          TextLayouts.letterSpacing(n), n.Direction)
      }
      let next = build(n.Content, n.TextTransform, n.FontFamily, TextLayouts.fontSize(n),
        n.FontWeight, n.FontStyle == FontStyle.Italic, TextLayouts.letterSpacing(n), n.Direction)
      store.Value = next
      return next
    }

    internal func Remove(n Node) {
      values.Remove(n)
    }

    internal func ShapeLine(paragraph TextParagraphAnalysis, start int32,
      end int32) ShapedText -> TextLineShaper.Base(paragraph, start, end)

    internal func ShapeEntry(n Node, text string) ShapedText -> TextLineShaper.Entry(n, text)

    private func matches(value TextAnalysis, n Node) bool -> value.Snapshot.Source == n.Content && value.Snapshot.Transform == n.TextTransform
      && value.FontFamily == n.FontFamily && value.FontSize == TextLayouts.fontSize(n)
      && value.FontWeight == n.FontWeight && value.Italic == (n.FontStyle == FontStyle.Italic)
      && value.LetterSpacing == TextLayouts.letterSpacing(n) && value.Direction == n.Direction

    private func build(source string, transform TextTransform, fontFamily string,
      fontSize float32, fontWeight float64, italic bool, letterSpacing float32,
      direction Direction) TextAnalysis -> buildInto(TextAnalysis(), source, transform, fontFamily, fontSize, fontWeight,
        italic, letterSpacing, direction)

    private func buildInto(result TextAnalysis, source string, transform TextTransform,
      fontFamily string, fontSize float32, fontWeight float64, italic bool,
      letterSpacing float32, direction Direction) TextAnalysis{
        let snapshot = TextSourceSnapshot(source, TextLayouts.transformText(source, transform),
          transform)
        result.Snapshot = snapshot
        result.FontFamily = fontFamily
        result.FontSize = fontSize
        result.FontWeight = fontWeight
        result.Italic = italic
        result.LetterSpacing = letterSpacing
        result.Direction = direction
        result.ParagraphCount = paragraphCount(snapshot.Display)
        if result.ParagraphCount > 1 {
          let required = result.ParagraphCount - 1
          if result.Additional == nil || result.Additional!!.Length < required {
            result.Additional = [required]TextParagraphAnalysis
          } else if result.Additional!!.Length > required {
            Array.Clear(result.Additional!!, required, result.Additional!!.Length - required)
          }
        } else {
          result.Additional = nil
        }
        var start int32 = 0
        var index int32 = 0
        while start < snapshot.Display.Length {
          var end = start
          while end < snapshot.Display.Length && !TextLayouts.isNewline(snapshot.Display[end]) {
            end++
          }
          analyzeParagraph(result, index, start, end)
          index++
          if end == snapshot.Display.Length {
            start = end
          } else {
            start = end + 1
            if snapshot.Display[end] == '\r' && start < snapshot.Display.Length
              && snapshot.Display[start] == '\n' {
                start++
              }
            if start == snapshot.Display.Length {
              analyzeParagraph(result, index, start, start)
            }
          }
        }
        if snapshot.Display == "" { analyzeParagraph(result, 0, 0, 0) }
        return result
      }

    private func paragraphCount(text string) int32 {
      var count int32 = 1
      var index int32 = 0
      while index < text.Length {
        if TextLayouts.isNewline(text[index]) {
          count++
          if text[index] == '\r' && index + 1 < text.Length && text[index + 1] == '\n' {
            index++
          }
        }
        index++
      }
      return count
    }

    private func analyzeParagraph(analysis TextAnalysis, index int32, start int32, end int32) {
      let text = analysis.Snapshot.Display.Substring(start, end - start)
      analysis.SetParagraph(index, TextParagraphAnalysis(start, end, text,
        TextShaping.ResolveParagraph(text, int32(analysis.Direction)), analysis.FontFamily,
        analysis.FontSize, analysis.FontWeight, analysis.Italic, analysis.LetterSpacing,
        analysis.Direction))
    }
  }
}
