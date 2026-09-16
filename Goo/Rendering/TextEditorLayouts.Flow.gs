package Goo

import Facebook.Yoga
import System
import System.Collections.Generic

internal partial class TextEditorLayouts {
  shared {
    private func build(n Node, state TextEditorRenderState, snapshot TextSnapshot,
      width float32, height float32, revision int64, fingerprint int32) TextEditorVisualLayout{
        let metrics = TextShaping.Metrics(n.FontFamily, TextLayouts.fontSize(n), int32(n.FontWeight),
          n.FontStyle == FontStyle.Italic)
        var lineHeight = TextLayouts.resolvedLineHeight(n)
        if lineHeight <= 0.0F { lineHeight = metrics.Descent - metrics.Ascent }
        if lineHeight <= 0.0F { lineHeight = 1.0F }
        let result = state.BeginLayout()
        result.Version = snapshot.Version
        result.DocumentLineCount = snapshot.LineCount
        result.LayerRevision = revision
        result.Width = width
        result.ConstraintWidth = width
        result.HeightConstraint = height
        result.FontFingerprint = fingerprint
        result.LineHeight = lineHeight
        result.Ascent = metrics.Ascent
        result.Descent = metrics.Descent
        let projections = editorProjections(state, width, height)
        let styles = editorStyles(state)
        let used = state.BeginUsedParagraphs()
        let bounded = height >= 0.0F
        var firstLine int32 = 0
        var lastLine = snapshot.LineCount
        if bounded {
          let scrollLine = lineForVerticalOffset(state, snapshot,
            float32(state.Controller.ScrollTargetY), width, fingerprint, lineHeight,
            metrics.Ascent, metrics.Descent)
          let overscan = n.EditorOverscanLines
          firstLine = scrollLine - overscan
          if firstLine < 0 { firstLine = 0 }
          let visible = int32(height / lineHeight) + 1 + overscan * 2
          lastLine = firstLine + visible
          if lastLine > snapshot.LineCount { lastLine = snapshot.LineCount }
        }
        var top = verticalOffsetForLine(state, snapshot, firstLine, width, fingerprint,
          lineHeight, metrics.Ascent, metrics.Descent)
        var widest = 0.0F
        for lineIndex in firstLine ... lastLine {
          let source = snapshot.GetLineRange(lineIndex)
          var cached = state.Paragraph(source, width, fingerprint, lineHeight, metrics.Ascent,
            metrics.Descent)
          if cached == nil {
            let value = paragraphLayout(n, state, snapshot, lineIndex, projections, styles, width,
              fingerprint, lineHeight, metrics.Ascent, metrics.Descent)
            state.AddParagraph(value)
            cached = value
          }
          let paragraphCache = cached
          used.Add(paragraphCache)
          for visual in paragraphCache.Lines {
            visual.Top = top + visual.RelativeTop
            result.Lines.Add(visual)
          }
          top = top + paragraphCache.Height
          if paragraphCache.Width > widest { widest = paragraphCache.Width }
        }
        if result.Lines.Count == 0 {
          let empty = TextEditorResolvedParagraph{ Source: TextRange{ Start: 0, Length: 0 },
            BaseStyle: state.BaseStyle(n, fingerprint) }
          appendVisualLine(result, n, empty, 0, 0, 0.0F)
          top = lineHeight
        }
        result.Width = widest
        if bounded {
          result.Height = height > lineHeight ? height : lineHeight
          result.ContentWidth = widest
          result.ContentHeight = top + float32(snapshot.LineCount - lastLine) * lineHeight
        } else {
          result.Height = top
          result.ContentWidth = widest
          result.ContentHeight = top
        }
        if bounded { state.TrimParagraphs(used) }
        return result
      }

    private func paragraphLayout(n Node, state TextEditorRenderState, snapshot TextSnapshot, lineIndex int32,
      projections List[TextEditorProjection], styles List[TextEditorPresentationStyle],
      width float32, fingerprint int32, lineHeight float32, ascent float32, descent float32)
    TextEditorParagraphLayout{
      let temporary = state.BeginParagraphLayout()
      temporary.ConstraintWidth = width
      temporary.FontFingerprint = fingerprint
      temporary.LineHeight = lineHeight
      temporary.Ascent = ascent
      temporary.Descent = descent
      let source = snapshot.GetLineRange(lineIndex)
      let paragraphProjections = state.BeginParagraphProjections()
      let paragraphStyles = state.BeginParagraphStyles()
      filterParagraphProjections(projections, source, paragraphProjections)
      filterParagraphStyles(styles, source, paragraphStyles)
      let paragraph = resolveParagraph(snapshot, lineIndex, paragraphProjections,
        paragraphStyles, n, state, fingerprint)
      let height = appendParagraph(temporary, n, paragraph, width, 0.0F)
      var widest = 0.0F
      for line in temporary.Lines {
        if line.Width > widest { widest = line.Width }
      }
      let result = TextEditorParagraphLayout{ Source: paragraph.Source, ConstraintWidth: width,
        FontFingerprint: fingerprint, LineHeight: lineHeight, Ascent: ascent, Descent: descent,
        Width: widest, Height: height }
      for line in temporary.Lines { result.Lines.Add(line) }
      return result
    }

    private func lineForVerticalOffset(state TextEditorRenderState, snapshot TextSnapshot,
      offset float32, width float32, fingerprint int32, lineHeight float32,
      ascent float32, descent float32) int32{
        if offset <= 0.0F { return 0 }
        var low int32 = 0
        var high = snapshot.LineCount - 1
        while low <= high {
          let line = low + (high - low) / 2
          let top = verticalOffsetForLine(state, snapshot, line, width, fingerprint,
            lineHeight, ascent, descent)
          let height = state.ParagraphHeightForLine(snapshot, line, width, fingerprint,
            lineHeight, ascent, descent) ?? lineHeight
          if offset < top {
            high = line - 1
          } else if offset >= top + height {
            low = line + 1
          } else {
            return line
          }
        }
        return if low >= snapshot.LineCount { snapshot.LineCount - 1 } else { low < 0 ? 0 : low }
      }

    private func verticalOffsetForLine(state TextEditorRenderState, snapshot TextSnapshot,
      target int32, width float32, fingerprint int32, lineHeight float32,
      ascent float32, descent float32) float32 -> float32(target) * lineHeight + state.HeightAdjustmentBefore(snapshot, target,
        width, fingerprint, lineHeight, ascent, descent)

    private func appendParagraph(layout TextEditorVisualLayout, n Node,
      paragraph TextEditorResolvedParagraph, width float32, top float32) float32{
        if paragraph.Text.Length == 0 {
          let visual = appendVisualLine(layout, n, paragraph, 0, 0, top)
          return top + visual.Height
        }
        var cursor int32 = 0
        var lineTop = top
        for segment in paragraph.Segments {
          if !segment.Slot || !segment.BlockSlot { continue }
          if segment.DisplayStart > cursor {
            lineTop = appendInlineParagraph(layout, n, paragraph, cursor, segment.DisplayStart,
              width, lineTop)
          }
          let block = appendVisualLine(layout, n, paragraph, segment.DisplayStart,
            segment.DisplayStart + segment.DisplayLength, lineTop)
          lineTop = lineTop + block.Height
          cursor = segment.DisplayStart + segment.DisplayLength
        }
        if cursor < paragraph.Text.Length {
          lineTop = appendInlineParagraph(layout, n, paragraph, cursor, paragraph.Text.Length,
            width, lineTop)
        }
        return lineTop
      }

    private func appendInlineParagraph(layout TextEditorVisualLayout, n Node,
      paragraph TextEditorResolvedParagraph, start int32, limit int32, width float32,
      top float32) float32{
        if n.TextWrap == TextWrap.NoWrap || width < 0.0F {
          let visual = appendVisualLine(layout, n, paragraph, start, limit, top)
          return top + visual.Height
        }
        if !hasWidthOverrides(n, paragraph, start, limit) {
          using let measure = shapeEditorLine(n, paragraph, start, limit, paragraph.BaseStyle!!)
          if !measure.HasRightToLeftRun {
            return appendWrappedInlineParagraph(layout, n, paragraph, start, limit, width, top, measure)
          }
        }
        return appendWrappedInlineParagraph(layout, n, paragraph, start, limit, width, top, nil)
      }

    private func appendWrappedInlineParagraph(layout TextEditorVisualLayout, n Node,
      paragraph TextEditorResolvedParagraph, start int32, limit int32, width float32,
      top float32, measure ShapedText?) float32{
        let breakMap = LineBreakOpportunities.Resolve(paragraph.Text)
        let elements = UnicodeGraphemes.Starts(paragraph.Text)
        var cursor = start
        var lineTop = top
        while cursor < limit {
          let origin = if let shaped = measure {
            shaped.CaretX(cursor - start, int32(TextAffinity.Downstream))
          } else {
            0.0F
          }
          var fit = cursor
          var preferred = -1
          var overflowed = false
          for i in 0 ... elements.Length {
            let end = i + 1 < elements.Length ? elements[i + 1] : paragraph.Text.Length
            if end <= cursor { continue }
            if end > limit { break }
            var measured = if let shaped = measure {
              shaped.CaretX(end - start, int32(TextAffinity.Downstream)) - origin
            } else {
              MeasureRange(n, paragraph, cursor, end)
            }
            if measure != nil && measured < 0.0F { measured = -measured }
            let decision = TextFlow.Consider(cursor, fit, preferred, overflowed, end, measured,
              width, breakMap.CanBreak(end))
            fit = decision.Fit
            preferred = decision.Preferred
            overflowed = decision.Overflowed
            if decision.Stop || decision.Overflowed { break }
          }
          var end = TextFlow.Resolve(cursor, fit, preferred, overflowed)
          if end <= cursor { end = nextEditorGrapheme(paragraph.Text, cursor) }
          if end > limit { end = limit }
          let visual = appendVisualLine(layout, n, paragraph, cursor, end, lineTop)
          cursor = end
          lineTop = lineTop + visual.Height
        }
        return lineTop
      }

    private func hasWidthOverrides(n Node, paragraph TextEditorResolvedParagraph,
      start int32, limit int32) bool{
        let baseStyle = paragraph.BaseStyle!!
        for segment in paragraph.Segments {
          let end = segment.DisplayStart + segment.DisplayLength
          if end <= start || segment.DisplayStart >= limit { continue }
          if segment.Slot || segment.Style != baseStyle { return true }
        }
        return false
      }

    private func appendVisualLine(layout TextEditorVisualLayout, n Node,
      paragraph TextEditorResolvedParagraph, displayStart int32, displayEnd int32,
      top float32) TextEditorVisualLine{
        let shape = shapeEditorLine(n, paragraph, displayStart, displayEnd, paragraph.BaseStyle!!)
        var visualHeight = layout.LineHeight
        var visualAscent = layout.Ascent
        var visualDescent = layout.Descent
        for segment in paragraph.Segments {
          if segment.DisplayStart >= displayEnd || segment.DisplayStart + segment.DisplayLength <= displayStart {
            continue
          }
          let metrics = TextShaping.Metrics(segment.Style.FontFamily, segment.Style.FontSize,
            int32(segment.Style.FontWeight), segment.Style.FontStyle == FontStyle.Italic)
          if metrics.Ascent < visualAscent { visualAscent = metrics.Ascent }
          if metrics.Descent > visualDescent { visualDescent = metrics.Descent }
          let styledHeight = (metrics.Descent - metrics.Ascent) * segment.Style.LineHeight
          if styledHeight > visualHeight { visualHeight = styledHeight }
          if segment.Slot && segment.SlotHeight > visualHeight {
            visualHeight = segment.SlotHeight
          }
        }
        let firstSource = SourceOffsetForDisplay(paragraph, displayStart, TextAffinity.Downstream)
        let lastSource = SourceOffsetForDisplay(paragraph, displayEnd, TextAffinity.Upstream)
        let line = TextEditorVisualLine(paragraph, displayStart,
          displayEnd - displayStart,
          firstSource < lastSource ? firstSource : lastSource,
          firstSource > lastSource ? firstSource : lastSource,
          top, visualHeight, visualAscent, visualDescent, shape)
        appendSlotGeometry(line, layout, paragraph, displayStart, displayEnd, shape)
        appendPaintRuns(line, n, paragraph, displayStart, displayEnd, shape)
        layout.Lines.Add(line)
        return line
      }

    private func shapeEditorLine(n Node, paragraph TextEditorResolvedParagraph,
      start int32, end int32, style TextResolvedStyle) ShapedText -> TextLineShaper.Styled(paragraph.Text, paragraph.Resolution,
        paragraph.BaseStyle!!.Direction, start, end, style)

    private func appendSlotGeometry(line TextEditorVisualLine, layout TextEditorVisualLayout,
      paragraph TextEditorResolvedParagraph, displayStart int32, displayEnd int32,
      shape ShapedText) {
        for segment in paragraph.Segments {
          let segmentEnd = segment.DisplayStart + segment.DisplayLength
          if !segment.Slot || segment.DisplayStart < displayStart || segmentEnd > displayEnd { continue }
          let start = segment.DisplayStart - displayStart
          let end = segmentEnd - displayStart
          let naturalStart = shape.CaretX(start, int32(TextAffinity.Downstream))
          let naturalEnd = shape.CaretX(end, int32(TextAffinity.Downstream))
          var natural = naturalEnd - naturalStart
          if natural < 0.0F { natural = -natural }
          let naturalLeft = naturalStart < naturalEnd ? naturalStart : naturalEnd
          let naturalRight = naturalStart > naturalEnd ? naturalStart : naturalEnd
          let width = segment.BlockSlot && layout.ConstraintWidth > 0.0F
          ? layout.ConstraintWidth : (segment.SlotWidth > 0.0F ? segment.SlotWidth : natural)
          line.Slots.Add(TextEditorSlotGeometry{
            Range: segment.Source,
            Key: segment.SlotKey,
            DisplayStart: segment.DisplayStart,
            DisplayLength: segment.DisplayLength,
            X: naturalLeft,
            Width: width,
            NaturalWidth: natural,
            NaturalLeft: naturalLeft,
            NaturalRight: naturalRight,
            NaturalStart: naturalStart,
            NaturalEnd: naturalEnd,
            Height: segment.SlotHeight > 0.0F ? segment.SlotHeight : layout.LineHeight,
            Block: segment.BlockSlot,
          })
        }
        sortEditorItems(line.Slots, slotSortKey)
        var correction = 0.0F
        for slot in line.Slots {
          slot.X = slot.NaturalLeft + correction
          slot.LogicalStart = slot.NaturalStart == slot.NaturalLeft ? slot.X : slot.X + slot.Width
          slot.LogicalEnd = slot.NaturalEnd == slot.NaturalLeft ? slot.X : slot.X + slot.Width
          correction = correction + slot.Width - slot.NaturalWidth
        }
      }

    private func appendPaintRuns(line TextEditorVisualLine, n Node,
      paragraph TextEditorResolvedParagraph, displayStart int32, displayEnd int32,
      shape ShapedText) {
        let baseStyle = paragraph.BaseStyle!!
        var special = line.Slots.Count != 0
        for segment in paragraph.Segments {
          if segment.Style != baseStyle && segment.DisplayStart < displayEnd
            && segment.DisplayStart + segment.DisplayLength > displayStart{
              special = true
              break
            }
        }
        if !special {
          return
        }
        var cursor = displayStart
        var correction = 0.0F
        for segment in paragraph.Segments {
          let end = segment.DisplayStart + segment.DisplayLength
          if end <= displayStart || segment.DisplayStart >= displayEnd { continue }
          let start = segment.DisplayStart > displayStart ? segment.DisplayStart : displayStart
          let clippedEnd = end < displayEnd ? end : displayEnd
          if start > cursor {
            correction = correction + appendPaintRun(line, n, paragraph, cursor, start,
              displayStart, shape, correction, baseStyle)
          }
          if segment.Slot {
            for slot in line.Slots {
              if slot.DisplayStart == segment.DisplayStart { correction = correction + slot.Width - slot.NaturalWidth }
            }
          } else if clippedEnd > start {
            correction = correction + appendPaintRun(line, n, paragraph, start, clippedEnd,
              displayStart, shape, correction, segment.Style)
          }
          cursor = clippedEnd
        }
        if cursor < displayEnd {
          correction = correction + appendPaintRun(line, n, paragraph, cursor, displayEnd,
            displayStart, shape, correction, baseStyle)
        }
        line.StyleWidthCorrection = correction - slotWidthCorrection(line)
      }

    private func appendPaintRun(line TextEditorVisualLine, n Node,
      paragraph TextEditorResolvedParagraph, start int32, end int32, displayStart int32,
      shape ShapedText, correction float32, style TextResolvedStyle) float32{
        let run = shapeEditorLine(n, paragraph, start, end, style)
        let naturalStart = shape.CaretX(start - displayStart, int32(TextAffinity.Downstream))
        let naturalEnd = shape.CaretX(end - displayStart, int32(TextAffinity.Downstream))
        var natural = naturalEnd - naturalStart
        if natural < 0.0F { natural = -natural }
        let retained = TextPaintRun{ Shape: run,
          X: shape.CaretX(start - displayStart, int32(TextAffinity.Downstream)) + correction,
          DisplayStart: start,
          DisplayLength: end - start,
          Style: style }
        if style.Decoration != TextDecoration.None && TextShaping.GlyphCount(run) > 0 {
          let segments = run.SelectionRects(0, end - start)
          if segments.Length > 0 { retained.DecorationSegments = segments }
        }
        line.Runs.Add(retained)
        let adjustment = run.Width - natural
        if adjustment != 0.0F {
          let right = naturalStart > naturalEnd ? naturalStart : naturalEnd
          for slot in line.Slots {
            if slot.NaturalLeft < right {
              continue
            }
            slot.X = slot.X + adjustment
            slot.LogicalStart = slot.LogicalStart + adjustment
            slot.LogicalEnd = slot.LogicalEnd + adjustment
          }
        }
        return adjustment
      }

  }
}
