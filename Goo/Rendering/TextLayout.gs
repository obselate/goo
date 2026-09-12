package Goo

import System
import System.Collections.Generic
import Facebook.Yoga

internal class TextLine {
  internal prop Content string{ get; init; }
  internal prop Shape ShapedText? { get; init; }
  internal prop Width float32{ get; init; }
  internal prop DisplayWidth float32{
    get {
      return if let shaped = Shape { shaped.Width } else { 0.0F }
    }
  }

  internal init() {
    Content = ""
  }
}

internal class TextLayout {
  private var rich TextRichLayout?
  private var geometry TextLayoutGeometry?

  internal prop Content string{ get; init; }
  internal prop FontFamily string{ get; init; }
  internal prop FontSize float32{ get; init; }
  internal prop FontWeight float64{ get; init; }
  internal prop FontRegistryGeneration uint64{ get; init; }
  internal prop Policy int32{ get; init; }
  internal prop TextMaxLines int32{ get; init; }
  internal prop LetterSpacing float32{ get; init; }
  internal prop LineHeight float64{ get; init; }
  internal prop MaxWidth float32{ get; init; }
  internal prop Rich TextRichLayout? {
    get -> rich
    set -> rich = value
  }
  internal prop Geometry TextLayoutGeometry? {
    get -> geometry
    set -> geometry = value
  }
  internal prop Lines List[TextLine]{ get; init; }
  internal prop Ascent float32{ get; set; }
  internal prop Descent float32{ get; set; }
  internal prop Width float32{ get; set; }
  internal prop Height float32{ get; set; }
  internal prop Clamped bool{ get; set; }

  internal init() {
    Content = ""
    FontFamily = ""
    Lines = List[TextLine]()
  }
}

internal data struct TextGeometryLine {
  internal prop DisplayStart int32{ get; init; }
  internal prop DisplayEnd int32{ get; init; }
  internal prop VisibleEnd int32{ get; init; }
}

internal class TextLayoutGeometry {
  internal prop Lines List[TextGeometryLine]{ get; init; }

  internal init() {
    Lines = List[TextGeometryLine]()
  }
}

internal class TextLayouts {
  shared {
    internal func For(n Node, maxWidth float32) TextLayout {
      if let cached = n.TextLayout {
        if matches(cached, n, maxWidth) {
          return cached
        }
      }
      if let cache = n.TextLayoutCache {
        for i in 0 ... cache.Count {
          let cached = cache[i]
          if matches(cached, n, maxWidth) {
            n.TextLayout = cached
            return cached
          }
        }
      }
      let layout = build(n, maxWidth)
      if n.TextLayoutCache == nil {
        n.TextLayoutCache = List[TextLayout]()
      }
      if let cache = n.TextLayoutCache {
        if cache.Count == 4 {
          dispose(cache[0])
          cache.RemoveAt(0)
        }
        cache.Add(layout)
      }
      n.TextLayout = layout
      return layout
    }

    internal func CurrentForGeometry(n Node) TextLayout? {
      let width = ContentWidth(n)
      if let layout = n.TextLayout {
        if matches(layout, n, width) { return layout }
      }
      if let cache = n.TextLayoutCache {
        for i in 0 ... cache.Count {
          let item = cache[i]
          if matches(item, n, width) { return item }
        }
      }
      return nil
    }

    internal func Invalidate(n Node) {
      disposeCached(n)
      // Fixed-Px size cannot depend on content, so skip the Yoga dirty and
      // spare content-only frames a full relayout pass.
      if n.Width.Unit == LengthUnit.Px && n.Height.Unit == LengthUnit.Px {
        return
      }
      if let yoga = n.Yoga {
        YGNodeAPI.YGNodeMarkDirty(yoga)
      }
    }

    internal func RefreshRich(n Node) {
      if let cache = n.TextLayoutCache {
        for layout in cache {
          if layout.Rich == nil {
            disposeCached(n)
            return
          }
        }
        for layout in cache { refreshRichLayout(n, layout) }
      } else if let layout = n.TextLayout {
        if layout.Rich == nil {
          disposeCached(n)
          return
        }
        refreshRichLayout(n, layout)
      }
    }

    internal func DisposeTree(n Node) {
      let firstError = disposeTree(n)
      if let error = firstError {
        throw error
      }
    }

    private func disposeTree(n Node) Exception? {
      n.Retired = true
      ElementHandles.Detach(n)
      if n.HasAccessibilityDeclaration { AccessibilityMetadata.Remove(n) }
      if n.HasAccessibilityNodeState { AccessibilityNodeStates.Remove(n) }
      var firstError Exception?
      if let cell = n.Fiber {
        n.Fiber = nil
        try {
          cell.DisposeMounted()
        } catch (error Exception) {
          firstError = error
        }
      }
      disposeCached(n)
      TextAnalyses.Remove(n)
      PassiveTextPresentations.Remove(n)
      if let entryShape = n.EntryShape {
        entryShape.Shape?.Dispose()
        entryShape.PlaceholderShape?.Dispose()
        n.EntryShape = nil
      }
      if n.Kind == NodeKind.Editor {
        TextEditorLayouts.Dispose(n)
      }
      if n.Kind == NodeKind.Image {
        ImageLayouts.Dispose(n)
      }
      BackgroundImageLayouts.Dispose(n)
      ShaderEffectStyles.Dispose(n)
      LayoutTransitions.Dispose(n)
      Virtualization.Dispose(n)
      for i in 0 ... n.Children.Count {
        if let error = disposeTree(n.Children[i]) {
          if firstError == nil {
            firstError = error
          }
        }
      }
      return firstError
    }

    internal func disposeCached(n Node) {
      if let cache = n.TextLayoutCache {
        for i in 0 ... cache.Count {
          dispose(cache[i])
        }
      } else if let cached = n.TextLayout {
        dispose(cached)
      }
      n.TextLayout = nil
      n.TextLayoutCache = nil
    }

    internal func IsShapingField(f StyleField) bool -> f == StyleField.FontFamily || f == StyleField.FontSize
      || f == StyleField.FontWeight || f == StyleField.FontStyle
      || f == StyleField.LetterSpacing || f == StyleField.LineHeight
      || f == StyleField.TextWrap || f == StyleField.TextTrimming
      || f == StyleField.TextTransform || f == StyleField.TextMaxLines
      || f == StyleField.Direction

    internal func dispose(layout TextLayout) {
      layout.Geometry = nil
      for line in layout.Lines {
        line.Shape?.Dispose()
      }
      if let rich = layout.Rich {
        for line in rich.Lines { disposeRichLine(line) }
      }
    }

    internal func RemoveGeometry(n Node) {
      if let layout = n.TextLayout {
        layout.Geometry = nil
      }
      if let cache = n.TextLayoutCache {
        for layout in cache {
          layout.Geometry = nil
        }
      }
    }

    internal func Measure(yoga Facebook.Yoga.Node, width float32, widthMode MeasureMode,
      height float32, heightMode MeasureMode) YGSize{
        let n = nodeFromYoga(yoga)
        let constraint = widthMode == MeasureMode.Undefined ? -1.0F : width
        let layout = For(n, constraint)
        return clampMeasuredSize(layout.Width, layout.Height, width, widthMode, height, heightMode)
      }

    internal func clampMeasuredSize(measuredWidth float32, measuredHeight float32, width float32,
      widthMode MeasureMode, height float32, heightMode MeasureMode) YGSize{
        var w = measuredWidth
        var h = measuredHeight
        if widthMode == MeasureMode.Exactly {
          w = width
        } else if widthMode == MeasureMode.AtMost && w > width {
          w = width
        }
        if heightMode == MeasureMode.Exactly {
          h = height
        } else if heightMode == MeasureMode.AtMost && h > height {
          h = height
        }
        return YGSize{ Width: w, Height: h }
      }

    internal func lineOffset(n Node, line TextLine, contentWidth float32) float32 {
      let rtl = if let shaped = line.Shape { shaped.RightToLeft } else { false }
      return lineOffset(n, line.DisplayWidth, rtl, contentWidth)
    }

    internal func lineOffset(n Node, displayWidth float32, rtl bool,
      contentWidth float32) float32{
        let free = contentWidth - displayWidth
        if free <= 0.0F { return 0.0F }
        return switch n.TextAlign {
          case TextAlign.Center: free * 0.5F
          case TextAlign.Right: free
          case TextAlign.Start: rtl ? free : 0.0F
          case TextAlign.End: rtl ? 0.0F : free
          default: 0.0F
        }
      }

    internal func ContentLeft(n Node) float32 -> n.Rect.X + borderPx(n, YGEdge.Left) + padding(n, YGEdge.Left)

    internal func ContentTop(n Node) float32 -> n.Rect.Y + borderPx(n, YGEdge.Top) + padding(n, YGEdge.Top)

    internal func ContentWidth(n Node) float32 {
      let width = n.Rect.W - borderPx(n, YGEdge.Left) - borderPx(n, YGEdge.Right)
      -padding(n, YGEdge.Left) - padding(n, YGEdge.Right)
      return width > 0.0F ? width : 0.0F
    }

    internal func ContentHeight(n Node) float32 {
      let height = n.Rect.H - borderPx(n, YGEdge.Top) - borderPx(n, YGEdge.Bottom)
      -padding(n, YGEdge.Top) - padding(n, YGEdge.Bottom)
      return height > 0.0F ? height : 0.0F
    }

    internal func build(n Node, maxWidth float32) TextLayout {
      let analysis = TextAnalyses.For(n)
      let ranges = PassiveTextPresentations.Read(n)
      let geometry TextLayoutGeometry? = n.HasElementHandle ? TextLayoutGeometry() : nil
      let rich TextRichLayout? = if ranges != nil { TextRichLayout() } else { nil }
      let result = TextLayout{
        Content: n.Content,
        FontFamily: n.FontFamily,
        FontRegistryGeneration: FontRegistry.Generation,
        FontSize: fontSize(n),
        FontWeight: n.FontWeight,
        Policy: textPolicy(n),
        TextMaxLines: n.TextMaxLines,
        LetterSpacing: letterSpacing(n),
        LineHeight: n.LineHeight,
        MaxWidth: maxWidth,
        Rich: rich,
      }
      for i in 0 ... analysis.ParagraphCount {
        let paragraph = analysis.Paragraph(i)
        result.Clamped = appendParagraph(result, geometry, n, paragraph, maxWidth)
        if result.Clamped {
          break
        }
        if i + 1 < analysis.ParagraphCount && lineLimitReached(result, n) {
          result.Clamped = true
          break
        }
      }
      if result.Clamped && n.TextTrimming == TextTrimming.Ellipsis && result.Lines.Count > 0 {
        let last = result.Lines.Count - 1
        let prior = result.Lines[last]
        let elided = ellipsizeClampedLine(n, prior, maxWidth)
        result.Lines[last] = elided
        if elided.Content != prior.Content {
          if let retained = geometry {
            let priorGeometry = retained.Lines[last]
            retained.Lines[last] = TextGeometryLine{ DisplayStart: priorGeometry.DisplayStart,
              DisplayEnd: priorGeometry.DisplayEnd,
              VisibleEnd: priorGeometry.DisplayStart + elided.Content.Length - 1 }
          }
          if let retained = result.Rich {
            let priorRich = retained.Lines[last]
            disposeRichLine(priorRich)
            retained.Lines[last] = makeRichLine(n, elided, priorRich.DisplayStart)
          }
        }
      }
      for i in 0 ... result.Lines.Count {
        let width = lineWidth(result, i)
        if width > result.Width {
          result.Width = width
        }
      }
      if let retained = result.Rich {
        for line in retained.Lines { result.Height = result.Height + line.Height }
        if retained.Lines.Count > 0 {
          result.Ascent = retained.Lines[0].Ascent
          result.Descent = retained.Lines[0].Descent
        }
      } else if result.Lines.Count > 0 {
        if let shaped = result.Lines[0].Shape {
          result.Ascent = shaped.Ascent
          result.Descent = shaped.Descent
        }
        result.Height = float32(result.Lines.Count) * resolvedLineHeight(n)
      }
      if let retained = geometry {
        result.Geometry = retained
        warmGeometry(result)
      }
      return result
    }

    private func warmGeometry(layout TextLayout) {
      for line in layout.Lines {
        line.Shape?.PrepareGeometry()
      }
    }

    internal func appendParagraph(result TextLayout, geometry TextLayoutGeometry?, n Node,
      paragraph TextParagraphAnalysis, maxWidth float32) bool{
        if lineLimitReached(result, n) {
          return true
        }
        let text = paragraph.Text
        let start = paragraph.Start
        if text == "" {
          appendLine(result, geometry, n, shape(n, paragraph, 0, 0), start, start, start)
          return false
        }
        if n.TextWrap == TextWrap.NoWrap {
          let line = shapeNoWrap(n, paragraph, maxWidth)
          let displayEnd = start + text.Length
          let visibleEnd = line.Content == text ? displayEnd : start + line.Content.Length - 1
          appendLine(result, geometry, n, line, start, displayEnd, visibleEnd)
          return false
        }
        if maxWidth < 0.0F {
          appendLine(result, geometry, n, shape(n, paragraph, 0, text.Length), start,
            start + text.Length, start + text.Length)
          return false
        }
        let whole = shape(n, paragraph, 0, text.Length)
        let wholeWidth = if result.Rich != nil {
          measureRichRange(n, paragraph, 0, text.Length)
        } else { whole.Width }
        if wholeWidth <= maxWidth {
          appendLine(result, geometry, n, whole, start, start + text.Length, start + text.Length)
          return false
        }
        whole.Shape?.Dispose()
        let elements = UnicodeGraphemes.Starts(text)
        var cursor int32 = 0
        while cursor < elements.Length {
          var next = cursor + 1
          var fit = cursor
          var opportunity = -1
          var overflowed = false
          while next <= elements.Length {
            let nextIndex = next < elements.Length ? elements[next] : text.Length
            let startIndex = elements[cursor]
            let width = if result.Rich != nil {
              measureRichRange(n, paragraph, startIndex, nextIndex)
            } else {
              TextFlow.MeasureBase(paragraph, startIndex, nextIndex)
            }
            let decision = TextFlow.Consider(cursor, fit, opportunity, overflowed, next,
              width, maxWidth, breakAfter(text, nextIndex))
            fit = decision.Fit
            opportunity = decision.Preferred
            overflowed = decision.Overflowed
            if decision.Stop { break }
            if next == elements.Length {
              break
            }
            next = next + 1
          }
          var lineEnd = TextFlow.Resolve(cursor, fit, opportunity, overflowed)
          if lineEnd == cursor {
            lineEnd = cursor + 1
          }
          let startIndex = elements[cursor]
          let endIndex = lineEnd < elements.Length ? elements[lineEnd] : text.Length
          appendLine(result, geometry, n, shape(n, paragraph, startIndex, endIndex),
            start + startIndex, start + endIndex, start + endIndex)
          cursor = lineEnd
          if lineLimitReached(result, n) && cursor < elements.Length {
            return true
          }
        }
        return false
      }

    internal func lineLimitReached(result TextLayout, n Node) bool -> n.TextMaxLines > 0 && result.Lines.Count >= n.TextMaxLines

    internal func appendLine(result TextLayout, geometry TextLayoutGeometry?, n Node, line TextLine,
      displayStart int32, displayEnd int32, visibleEnd int32) {
        result.Lines.Add(line)
        if let rich = result.Rich {
          rich.Lines.Add(makeRichLine(n, line, displayStart))
        }
        if let retained = geometry {
          retained.Lines.Add(TextGeometryLine{ DisplayStart: displayStart, DisplayEnd: displayEnd,
            VisibleEnd: visibleEnd })
        }
      }

    internal func shape(n Node, paragraph TextParagraphAnalysis, start int32,
      end int32) TextLine{
        let shaped = TextAnalyses.ShapeLine(paragraph, start, end)
        return TextLine{
          Content: paragraph.Text.Substring(start, end - start),
          Shape: shaped,
          Width: shaped.Width,
        }
      }

    internal func lineWidth(layout TextLayout, index int32) float32 {
      if let rich = layout.Rich { return rich.Lines[index].Width }
      return layout.Lines[index].Width
    }

    private func makeRichLine(n Node, line TextLine, displayStart int32) TextRichLine {
      let ranges = PassiveTextPresentations.Read(n) ?? []TextStyleRange{}
      let base = TextResolvedStyles.Base(n)
      let baseMetrics = TextShaping.Metrics(base.FontFamily, base.FontSize,
        int32(base.FontWeight), base.FontStyle == FontStyle.Italic)
      var ascent = baseMetrics.Ascent
      var descent = baseMetrics.Descent
      var height = base.FontSize * base.LineHeight
      var correction = 0.0F
      var paintTop = ascent
      var paintBottom = textDecorationBottom(base.Decoration, ascent, descent)
      let result = TextRichLine(displayStart, line.DisplayWidth, ascent, descent, height)
      guard let shape = line.Shape else { return result }
      var cursor int32 = 0
      while cursor < line.Content.Length {
        let absolute = displayStart + cursor
        var end = TextResolvedStyles.NextBoundary(ranges, absolute,
          displayStart + line.Content.Length) - displayStart
        if end <= cursor { end = cursor + 1 }
        let style = TextResolvedStyles.At(n, ranges, absolute)
        let changedShape = TextResolvedStyles.AffectsWidth(base, style)
        let run = if changedShape { shapeInlineLine(n, displayStart, line.Content, style) }
        else { shape }
        let startX = shape.CaretX(cursor, int32(TextAffinity.Downstream))
        let endX = shape.CaretX(end, int32(TextAffinity.Downstream))
        let natural = startX > endX ? startX - endX : endX - startX
        let runStartX = run.CaretX(cursor, int32(TextAffinity.Downstream))
        let runEndX = run.CaretX(end, int32(TextAffinity.Downstream))
        let actual = runStartX > runEndX ? runStartX - runEndX : runEndX - runStartX
        let x = startX + correction - runStartX
        let slice = TextShaping.Slice(run, cursor, end)
        let ownsGlyphs = TextShaping.GlyphCount(slice) > 0
        var decorationSegments [] ? float32 = nil
        if ownsGlyphs && style.Decoration != TextDecoration.None {
          let segments = slice.SelectionRects(cursor, end)
          if segments.Length > 0 { decorationSegments = segments }
        }
        if changedShape { run.Dispose() }
        let retained = TextPaintRun{ Shape: slice, X: x, DisplayStart: absolute,
          DisplayLength: end - cursor, Style: style }
        if let segments = decorationSegments {
          retained.DecorationSegments = segments
        }
        result.Runs.Add(retained)
        if ownsGlyphs {
          let paintPad = textPaintPad(style.StrokeWidth, style.Shadows)
          if paintPad > result.PaintPad { result.PaintPad = paintPad }
          correction = correction + actual - natural
          let metrics = TextShaping.Metrics(style.FontFamily, style.FontSize,
            int32(style.FontWeight), style.FontStyle == FontStyle.Italic)
          if metrics.Ascent < ascent { ascent = metrics.Ascent }
          if metrics.Descent > descent { descent = metrics.Descent }
          if slice.InkTop < paintTop { paintTop = slice.InkTop }
          if slice.InkBottom > paintBottom { paintBottom = slice.InkBottom }
          let decorationBottom = textDecorationBottom(style.Decoration, metrics.Ascent,
            metrics.Descent)
          if decorationBottom > paintBottom { paintBottom = decorationBottom }
          let runHeight = style.FontSize * style.LineHeight
          if runHeight > height { height = runHeight }
        }
        cursor = end
      }
      result.Width = line.DisplayWidth + correction
      result.Ascent = ascent
      result.Descent = descent
      result.Height = height
      if ascent < paintTop { paintTop = ascent }
      let metricBottom = textDecorationBottom(base.Decoration, ascent, descent)
      if metricBottom > paintBottom { paintBottom = metricBottom }
      result.PaintTop = paintTop
      result.PaintBottom = paintBottom
      return result
    }

    private func measureRichRange(n Node, paragraph TextParagraphAnalysis, start int32,
      end int32) float32{
        using let base = TextLineShaper.Base(paragraph, start, end)
        let ranges = PassiveTextPresentations.Read(n) ?? []TextStyleRange{}
        let baseStyle = TextResolvedStyles.Base(n)
        var width = base.Width
        var cursor = start
        while cursor < end {
          let absolute = paragraph.Start + cursor
          var next = TextResolvedStyles.NextBoundary(ranges, absolute,
            paragraph.Start + end) - paragraph.Start
          if next <= cursor { next = cursor + 1 }
          let style = TextResolvedStyles.At(n, ranges, absolute)
          if TextResolvedStyles.AffectsWidth(baseStyle, style) {
            using let shaped = TextLineShaper.Styled(paragraph, start, end, style)
            let startX = base.CaretX(cursor - start, int32(TextAffinity.Downstream))
            let endX = base.CaretX(next - start, int32(TextAffinity.Downstream))
            let natural = startX > endX ? startX - endX : endX - startX
            let styledStart = shaped.CaretX(cursor - start, int32(TextAffinity.Downstream))
            let styledEnd = shaped.CaretX(next - start, int32(TextAffinity.Downstream))
            let actual = styledStart > styledEnd ? styledStart - styledEnd : styledEnd - styledStart
            width = width + actual - natural
          }
          cursor = next
        }
        return width
      }

    private func inlineText(n Node, text string, style TextResolvedStyle) string -> style.Transform == n.TextTransform ? text : transformText(text, style.Transform)

    private func shapeInlineLine(n Node, displayStart int32, text string,
      style TextResolvedStyle) ShapedText{
        if style.Transform == n.TextTransform {
          let analysis = TextAnalyses.For(n)
          for i in 0 ... analysis.ParagraphCount {
            let paragraph = analysis.Paragraph(i)
            if displayStart < paragraph.Start || displayStart + text.Length > paragraph.End {
              continue
            }
            let local = displayStart - paragraph.Start
            return TextLineShaper.Styled(paragraph, local, local + text.Length, style)
          }
        }
        return TextShaping.Shape(inlineText(n, text, style), style.FontFamily, style.FontSize,
          int32(style.FontWeight), style.FontStyle == FontStyle.Italic,
          style.LetterSpacing, int32(style.Direction))
      }

    private func disposeRichLine(line TextRichLine) {
      for run in line.Runs { run.Shape?.Dispose() }
    }

    private func refreshRichLayout(n Node, layout TextLayout) {
      if let prior = layout.Rich {
        for line in prior.Lines { disposeRichLine(line) }
        if PassiveTextPresentations.Read(n) == nil {
          layout.Rich = nil
        } else {
          let rich = TextRichLayout()
          for i in 0 ... layout.Lines.Count {
            rich.Lines.Add(makeRichLine(n, layout.Lines[i], prior.Lines[i].DisplayStart))
          }
          layout.Rich = rich
        }
      }
    }

    internal func shapeNoWrap(n Node, paragraph TextParagraphAnalysis,
      maxWidth float32) TextLine{
        let text = paragraph.Text
        let whole = shape(n, paragraph, 0, text.Length)
        if n.TextTrimming != TextTrimming.Ellipsis || maxWidth < 0.0F || whole.Width <= maxWidth {
          return whole
        }
        let direction = TextShaping.BaseDirection(text, int32(n.Direction))
        let display = TextShaping.Ellipsize(text, n.FontFamily, fontSize(n), int32(n.FontWeight),
          n.FontStyle == FontStyle.Italic, letterSpacing(n), direction, maxWidth)
        let logicalWidth = whole.Width
        whole.Shape?.Dispose()
        let shaped = TextShaping.Shape(display, n.FontFamily, fontSize(n), int32(n.FontWeight),
          n.FontStyle == FontStyle.Italic, letterSpacing(n), direction)
        return TextLine{
          Content: display,
          Shape: shaped,
          Width: logicalWidth,
        }
      }

    internal func ellipsizeClampedLine(n Node, line TextLine, maxWidth float32) TextLine {
      if line.Content.Length > 0 && line.Content[line.Content.Length - 1] == 8230 {
        return line
      }
      let direction = if let existing = line.Shape {
        existing.RightToLeft ? 2 : 1
      } else {
        TextShaping.BaseDirection(line.Content, int32(n.Direction))
      }
      let display = maxWidth < 0.0F
      ? line.Content + "\u2026" : TextShaping.Ellipsize(line.Content, n.FontFamily, fontSize(n), int32(n.FontWeight),
        n.FontStyle == FontStyle.Italic, letterSpacing(n), direction, maxWidth)
      line.Shape?.Dispose()
      let shaped = TextShaping.Shape(display, n.FontFamily, fontSize(n), int32(n.FontWeight),
        n.FontStyle == FontStyle.Italic, letterSpacing(n), direction)
      return TextLine{
        Content: display,
        Shape: shaped,
        Width: shaped.Width > line.Width ? shaped.Width : line.Width,
      }
    }

    internal func matches(layout TextLayout, n Node, maxWidth float32) bool -> layout.Content == n.Content && layout.FontFamily == n.FontFamily
      && layout.FontRegistryGeneration == FontRegistry.Generation
      && layout.FontSize == fontSize(n) && layout.FontWeight == n.FontWeight
      && layout.Policy == textPolicy(n) && layout.LetterSpacing == letterSpacing(n)
      && layout.TextMaxLines == n.TextMaxLines
      && layout.LineHeight == n.LineHeight && layout.MaxWidth == maxWidth

    internal func textPolicy(n Node) int32 -> int32(n.FontStyle) | (int32(n.TextWrap) << 2) | (int32(n.TextTrimming) << 3)
    | (int32(n.TextTransform) << 4) | (int32(n.Direction) << 7)

    internal func transformText(content string, transform TextTransform) string -> switch transform {
      case TextTransform.Uppercase: content.ToUpperInvariant()
      case TextTransform.Lowercase: content.ToLowerInvariant()
      default: content
    }

    internal func fontSize(n Node) float32 -> n.FontSize.Px

    internal func letterSpacing(n Node) float32 -> n.LetterSpacing.Px

    internal func resolvedLineHeight(n Node) float32 -> fontSize(n) * float32(n.LineHeight)

    internal func padding(n Node, edge YGEdge) float32 -> resolveEdgePadding(n, edge, 0.0F)

    internal func borderPx(n Node, edge YGEdge) float32 {
      let width = switch edge {
        case YGEdge.Left: n.BorderLeftWidth
        case YGEdge.Top: n.BorderTopWidth
        case YGEdge.Right: n.BorderRightWidth
        case YGEdge.Bottom: n.BorderBottomWidth
        default: Length {}
      }
      return width.Px
    }

    internal func breakAfter(text string, index int32) bool {
      if index <= 0 || index >= text.Length {
        return index == text.Length
      }
      let prior = text[index - 1]
      return isWhitespace(prior) || prior == 45 || isCjk(prior)
    }

    internal func isWhitespace(c char) bool -> c == 9 || c == 32

    internal func isNewline(c char) bool -> c == 10 || c == 13

    internal func isCjk(c char) bool -> (c >= 0x2E80 && c <= 0x9FFF) || (c >= 0xF900 && c <= 0xFAFF)
      || (c >= 0x3040 && c <= 0x30FF) || (c >= 0xAC00 && c <= 0xD7AF)

  }
}
