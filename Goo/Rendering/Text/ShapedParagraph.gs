package Goo

import System
import System.Collections.Generic
import System.Text

internal data struct ParagraphPaintSpan(Start int32, End int32, Style TextResolvedStyle) { }

internal data struct ParagraphShapeGroup(Start int32, End int32, SpanStartIndex int32,
  SpanEndIndex int32, Style TextResolvedStyle, EffectiveDirection int32) { }

internal data struct ParagraphWrappedLine(Start int32, End int32) { }

internal sealed class ParagraphShapedRun : IDisposable {
  internal prop LogicalStart int32{ get; init; }
  internal prop LogicalEnd int32{ get; init; }
  internal prop Script uint32{ get; init; }
  internal prop RightToLeft bool{ get; init; }
  internal prop Family string{ get; init; }
  internal prop FontSize float32{ get; init; }
  internal prop LetterSpacing float32{ get; init; }
  internal prop Width float32{ get; init; }
  internal prop Ascent float32{ get; init; }
  internal prop Descent float32{ get; init; }
  internal prop Glyphs []uint32{ get; init; }
  internal prop Clusters []uint32{ get; init; }
  internal prop Points []TextPoint{ get; init; }
  internal prop PenX []float32{ get; init; }
  internal prop PenEndX []float32{ get; init; }
  internal prop Flags []uint8{ get; init; }
  internal prop Lease TypefaceLease{ get; init; }
  private var disposed bool

  internal init(logicalStart int32, logicalEnd int32, script uint32, rightToLeft bool,
    family string, fontSize float32, letterSpacing float32, width float32, ascent float32,
    descent float32, glyphs []uint32, clusters []uint32, points []TextPoint,
    penX []float32, penEndX []float32, flags []uint8, lease TypefaceLease) {
      LogicalStart = logicalStart
      LogicalEnd = logicalEnd
      Script = script
      RightToLeft = rightToLeft
      Family = family
      FontSize = fontSize
      LetterSpacing = letterSpacing
      Width = width
      Ascent = ascent
      Descent = descent
      Glyphs = glyphs
      Clusters = clusters
      Points = points
      PenX = penX
      PenEndX = penEndX
      Flags = flags
      Lease = lease
    }

  public func Dispose() {
    if disposed { return }
    disposed = true
    Lease.Dispose()
  }
}

internal sealed class ShapedParagraph : IDisposable {
  internal const ClusterBoundaryBit uint8 = uint8(1)
  internal const UnsafeBreakBit uint8 = uint8(2)
  internal const CanBreakBit uint8 = uint8(4)
  internal const GraphemeStartBit uint8 = uint8(8)

  internal prop Paragraph TextParagraphAnalysis{ get; init; }
  internal prop Text string{ get; init; }
  internal prop RightToLeft bool{ get; init; }
  internal prop HasBidiInfo bool{ get; init; }
  internal prop BaseAscent float32{ get; init; }
  internal prop BaseDescent float32{ get; init; }
  internal prop TotalWidth float32{ get; init; }
  internal prop Groups []ParagraphShapeGroup{ get; init; }
  internal prop PaintSpans []ParagraphPaintSpan{ get; init; }
  internal prop Runs List[ParagraphShapedRun]{ get; init; }
  internal prop PrefixWidth []float32{ get; init; }
  internal prop LeadingSpacing []?float32{ get; init; }
  internal prop BoundaryFlags []uint8{ get; init; }
  private var disposed bool

  private init(paragraph TextParagraphAnalysis, rightToLeft bool, hasBidiInfo bool,
    baseAscent float32, baseDescent float32, totalWidth float32,
    groups []ParagraphShapeGroup, paintSpans []ParagraphPaintSpan,
    runs List[ParagraphShapedRun], prefixWidth []float32, leadingSpacing []?float32,
    boundaryFlags []uint8) {
      Paragraph = paragraph
      Text = paragraph.Text
      RightToLeft = rightToLeft
      HasBidiInfo = hasBidiInfo
      BaseAscent = baseAscent
      BaseDescent = baseDescent
      TotalWidth = totalWidth
      Groups = groups
      PaintSpans = paintSpans
      Runs = runs
      PrefixWidth = prefixWidth
      LeadingSpacing = leadingSpacing
      BoundaryFlags = boundaryFlags
    }

  internal func MeasureSlice(start int32, end int32) float32 {
    if end <= start { return 0.0F }
    var w = PrefixWidth[end] - PrefixWidth[start]
    if let leading = LeadingSpacing {
      w = w - leading[start]
    }
    return w < 0.0F ? 0.0F : w
  }

  internal func ComputeMinContentWidth() float32 {
    let len = Text.Length
    if len == 0 { return 0.0F }
    var maxWord = 0.0F
    var wordStart int32 = 0
    var gPrev int32 = 0
    var idx int32 = 1
    while idx <= len {
      let atEnd = idx == len
      let isG = atEnd || (BoundaryFlags[idx] & GraphemeStartBit) != uint8(0)
      if isG {
        if (BoundaryFlags[idx] & CanBreakBit) != uint8(0) || atEnd {
          let ch = Text[idx - 1]
          let end = (ch == ' ' || ch == '\t') ? gPrev : idx
          if end > wordStart {
            let w = MeasureSlice(wordStart, end)
            if w > maxWord { maxWord = w }
          }
          wordStart = idx
        }
        gPrev = idx
      }
      idx++
    }
    return maxWord
  }

  internal func NextGraphemeEnd(start int32) int32 {
    let len = Text.Length
    if start >= len { return len }
    var next = start + 1
    while next < len && (BoundaryFlags[next] & GraphemeStartBit) == uint8(0) {
      next++
    }
    return next
  }

  internal func PrevGraphemeEnd(floor int32, end int32) int32 {
    if end <= floor { return floor }
    var prev = end - 1
    while prev > floor && (BoundaryFlags[prev] & GraphemeStartBit) == uint8(0) {
      prev--
    }
    return prev
  }

  private func measureReshapedLineWidth(start int32, end int32) float32 {
    let groupStyle = Groups[0].Style
    if Groups.Length == 1 {
      return TextShaping.MeasureLineUncached(Text, start, end - start, groupStyle.FontFamily,
        groupStyle.FontSize, int32(groupStyle.FontWeight), groupStyle.FontStyle == FontStyle.Italic,
        groupStyle.LetterSpacing, int32(groupStyle.Direction), groupStyle.Language, nil)
    }
    return MeasureSlice(start, end)
  }

  internal func WrapLines(maxWidth float32, lines List[ParagraphWrappedLine],
    out cacheMin float32, out cacheMax float32) {
      lines.Clear()
      let len = Text.Length
      if len == 0 {
        lines.Add(ParagraphWrappedLine(0, 0))
        cacheMin = 0.0F
        cacheMax = Single.PositiveInfinity
        return
      }
      if maxWidth < 0.0F || TotalWidth <= maxWidth + 0.0001F {
        lines.Add(ParagraphWrappedLine(0, len))
        cacheMin = TotalWidth
        cacheMax = Single.PositiveInfinity
        return
      }
      var minAcc = 0.0F
      var maxRej = Single.PositiveInfinity
      var cursor int32 = 0
      while cursor < len {
        var fit = cursor
        var preferred = -1
        var overflowed = false
        var prev = cursor
        var next = NextGraphemeEnd(cursor)
        while prev < len {
          let prevChar = Text[next - 1]
          if prevChar == ' ' || prevChar == '\t' {
            fit = next
            preferred = next
          } else {
            let width = MeasureSlice(cursor, next)
            let breakable = (BoundaryFlags[next] & CanBreakBit) != uint8(0)
            let exceeds = width > maxWidth
            if exceeds && fit != cursor {
              overflowed = true
              if width < maxRej { maxRej = width }
              break
            }
            if !exceeds {
              if width > minAcc { minAcc = width }
            } else {
              if width < maxRej { maxRej = width }
            }
            fit = next
            if breakable { preferred = next }
            overflowed = overflowed || exceeds
          }
          if next >= len { break }
          prev = next
          next = NextGraphemeEnd(next)
        }
        var lineEnd = if overflowed && preferred > cursor { preferred } else { fit }
        if lineEnd <= cursor { lineEnd = NextGraphemeEnd(cursor) }
        while overflowed && lineEnd < len && lineEnd > cursor + 1
          && Text[lineEnd - 1] != ' ' && Text[lineEnd - 1] != '\t'
          && NeedsReshapeSlice(cursor, lineEnd) && Groups.Length == 1 {
            let actual = measureReshapedLineWidth(cursor, lineEnd)
            if actual <= maxWidth {
              if actual > minAcc { minAcc = actual }
              break
            }
            if actual < maxRej { maxRej = actual }
            let stepped = PrevGraphemeEnd(cursor, lineEnd)
            if stepped <= cursor { break }
            lineEnd = stepped
          }
        lines.Add(ParagraphWrappedLine(cursor, lineEnd))
        cursor = lineEnd
      }
      cacheMin = minAcc
      cacheMax = maxRej
    }

  internal func NeedsReshapeSlice(lineStart int32, lineEnd int32) bool {
    let len = Text.Length
    if lineStart == 0 && lineEnd == len {
      return false
    }
    if HasBidiInfo || RightToLeft {
      return true
    }
    if (BoundaryFlags[lineStart] & ClusterBoundaryBit) == uint8(0)
      || (BoundaryFlags[lineEnd] & ClusterBoundaryBit) == uint8(0) {
        return true
      }
    if (BoundaryFlags[lineStart] & UnsafeBreakBit) != uint8(0)
      || (BoundaryFlags[lineEnd] & UnsafeBreakBit) != uint8(0) {
        return true
      }
    if lineStart > 0 && CrossesJoiningBoundary(lineStart) { return true }
    if lineEnd < len && CrossesJoiningBoundary(lineEnd) { return true }
    return false
  }

  private func CrossesJoiningBoundary(offset int32) bool {
    let prev = Text[offset - 1]
    let next = Text[offset]
    if ShapedParagraph.isBreakWhiteOrAsciiPunct(prev)
      || ShapedParagraph.isBreakWhiteOrAsciiPunct(next) { return false }
    for run in Runs {
      if offset > run.LogicalStart && offset < run.LogicalEnd {
        return ShapedParagraph.isContextualJoiningScript(run.Script)
      }
    }
    return false
  }

  internal func MaterializePlainLine(lineStart int32, lineEnd int32, baseWidth float32) TextLine {
    let contentLen = lineEnd - lineStart
    let len = Text.Length
    let endsWithBreak = lineEnd >= len || (BoundaryFlags[lineEnd] & CanBreakBit) != uint8(0)
    let content = if lineStart == 0 && lineEnd == len { Text }
    else { Text.Substring(lineStart, contentLen) }
    if contentLen == 0 {
      let empty = ShapedText("", List[ShapedRun](), 0.0F, BaseAscent, BaseDescent, RightToLeft)
      return TextLine{
        Content: "",
        Shape: empty,
        Width: 0.0F,
        DisplayStart: Paragraph.Start + lineStart,
        DisplayEnd: Paragraph.Start + lineEnd,
        VisibleEnd: Paragraph.Start + lineEnd,
        RightToLeft: RightToLeft,
        EndsWithBreak: endsWithBreak,
      }
    }
    if NeedsReshapeSlice(lineStart, lineEnd) {
      let shaped = TextAnalyses.ShapeLine(Paragraph, lineStart, lineEnd)
      return TextLine{
        Content: content,
        Shape: shaped,
        Width: shaped.Width,
        DisplayStart: Paragraph.Start + lineStart,
        DisplayEnd: Paragraph.Start + lineEnd,
        VisibleEnd: Paragraph.Start + lineEnd,
        RightToLeft: shaped.RightToLeft,
        EndsWithBreak: endsWithBreak,
      }
    }
    let shaped = BuildSlicedShapedText(content, lineStart, lineEnd, RightToLeft)
    return TextLine{
      Content: content,
      Shape: shaped,
      Width: shaped.Width,
      DisplayStart: Paragraph.Start + lineStart,
      DisplayEnd: Paragraph.Start + lineEnd,
      VisibleEnd: Paragraph.Start + lineEnd,
      RightToLeft: shaped.RightToLeft,
      EndsWithBreak: endsWithBreak,
    }
  }

  internal func BuildSlicedShapedText(text string, sliceStart int32, sliceEnd int32,
    lineRtl bool) ShapedText{
      let lineRuns = List[ShapedRun]()
      var cursor = 0.0F
      var ascent = BaseAscent
      var descent = BaseDescent
      let wholeParagraph = sliceStart == 0 && sliceEnd == Text.Length
      for pRun in Runs {
        let s0 = pRun.LogicalStart > sliceStart ? pRun.LogicalStart : sliceStart
        let s1 = pRun.LogicalEnd < sliceEnd ? pRun.LogicalEnd : sliceEnd
        if s1 <= s0 { continue }
        let glyphCount = pRun.Glyphs.Length
        if glyphCount == 0 { continue }
        var leading = 0.0F
        if lineRuns.Count > 0 && pRun.LetterSpacing != 0.0F && (BoundaryFlags[s0] & GraphemeStartBit) != uint8(0) {
          leading = pRun.LetterSpacing
        }
        if wholeParagraph && s0 == pRun.LogicalStart && s1 == pRun.LogicalEnd {
          let base = cursor
          let runBase = base + leading
          let outPoints = [glyphCount]TextPoint
          for g in 0 ... glyphCount {
            let p = pRun.Points[g]
            outPoints[g] = TextPoint(runBase + p.X, p.Y)
          }
          let outGlyphs = [glyphCount]uint32
          let outClusters = [glyphCount]uint32
          Array.Copy(pRun.Glyphs, outGlyphs, glyphCount)
          Array.Copy(pRun.Clusters, outClusters, glyphCount)
          let runWidth = pRun.Width + leading
          let visualStart = pRun.RightToLeft ? base + runWidth : base
          let visualEnd = pRun.RightToLeft ? base : base + runWidth
          if pRun.Ascent < ascent { ascent = pRun.Ascent }
          if pRun.Descent > descent { descent = pRun.Descent }
          lineRuns.Add(ShapedRun(pRun.LogicalStart == 0 && pRun.LogicalEnd == Text.Length
            ? Text : Text.Substring(pRun.LogicalStart, pRun.LogicalEnd - pRun.LogicalStart),
            pRun.Family, outGlyphs, outPoints, outClusters,
            pRun.LogicalStart - sliceStart, pRun.RightToLeft, visualStart, visualEnd,
            false, pRun.Lease.Duplicate()))
          cursor = cursor + runWidth
          continue
        }
        // LTR wrapped or sub-range slice: glyphs are in logical ascending cluster order.
        var g0 int32 = 0
        while g0 < glyphCount && pRun.LogicalStart + int32(pRun.Clusters[g0]) < s0 { g0++ }
        var g1 = g0
        while g1 < glyphCount && pRun.LogicalStart + int32(pRun.Clusters[g1]) < s1 { g1++ }
        if g1 <= g0 { continue }
        let outCount = g1 - g0
        let outGlyphs = [outCount]uint32
        let outClusters = [outCount]uint32
        let outPoints = [outCount]TextPoint
        let base = cursor
        let originPen = pRun.PenX[g0]
        let sliceWidth = (pRun.PenEndX[g1 - 1] - originPen) + leading
        let shift = base + leading - originPen
        let clusterShift = uint32(s0 - pRun.LogicalStart)
        for k in 0 ... outCount {
          let srcIdx = g0 + k
          outGlyphs[k] = pRun.Glyphs[srcIdx]
          outClusters[k] = pRun.Clusters[srcIdx] - clusterShift
          let p = pRun.Points[srcIdx]
          outPoints[k] = TextPoint(p.X + shift, p.Y)
        }
        if pRun.Ascent < ascent { ascent = pRun.Ascent }
        if pRun.Descent > descent { descent = pRun.Descent }
        let subText = Text.Substring(s0, s1 - s0)
        let visualStart = pRun.RightToLeft ? base + sliceWidth : base
        let visualEnd = pRun.RightToLeft ? base : base + sliceWidth
        lineRuns.Add(ShapedRun(subText, pRun.Family, outGlyphs, outPoints, outClusters,
          s0 - sliceStart, pRun.RightToLeft, visualStart, visualEnd, false, pRun.Lease.Duplicate()))
        cursor = cursor + sliceWidth
      }
      return ShapedText(text, lineRuns, cursor, ascent, descent, lineRtl)
    }

  internal func MaterializeRichLine(n Node, lineStart int32, lineEnd int32, baseStyle TextResolvedStyle,
    out richLine TextRichLine) TextLine {
      let contentLen = lineEnd - lineStart
      let content = if lineStart == 0 && lineEnd == Text.Length { Text }
      else { Text.Substring(lineStart, contentLen) }
      let displayStart = Paragraph.Start + lineStart
      var ascent = BaseAscent
      var descent = BaseDescent
      var height = baseStyle.FontSize * baseStyle.LineHeight
      var paintTop = ascent
      var paintBottom = textDecorationBottom(baseStyle.Decoration, ascent, descent)
      richLine = TextRichLine(displayStart, 0.0F, ascent, descent, height)

      if contentLen == 0 {
        return TextLine{
          Content: "", Shape: nil, Width: 0.0F,
          DisplayStart: displayStart, DisplayEnd: displayStart, VisibleEnd: displayStart,
          RightToLeft: RightToLeft, EndsWithBreak: true,
        }
      }

      let useBidiFallback = HasBidiInfo || RightToLeft || NeedsReshapeSlice(lineStart, lineEnd)
        || hasSpanBoundaryInsideClusterOrRtl(lineStart, lineEnd)

      if !useBidiFallback {
        var lineX = 0.0F
        for span in PaintSpans {
          let s0 = span.Start > lineStart ? span.Start : lineStart
          let s1 = span.End < lineEnd ? span.End : lineEnd
          if s1 <= s0 { continue }
          let spanText = Text.Substring(s0, s1 - s0)
          let slice = BuildSlicedShapedText(spanText, s0, s1, false)
          var leading = 0.0F
          if lineX > 0.0F && span.Style.LetterSpacing != 0.0F && (BoundaryFlags[s0] & GraphemeStartBit) != uint8(0) {
            leading = span.Style.LetterSpacing
          }
          let runX = lineX + leading
          lineX = runX + slice.Width
          appendRichPaintRun(richLine, slice, runX, Paragraph.Start + s0, s1 - s0, span.Style,
            ref ascent, ref descent, ref height, ref paintTop, ref paintBottom)
        }
        richLine.Width = lineX
        richLine.Ascent = ascent
        richLine.Descent = descent
        richLine.Height = height
        if ascent < paintTop { paintTop = ascent }
        let metricBottom = textDecorationBottom(baseStyle.Decoration, ascent, descent)
        if metricBottom > paintBottom { paintBottom = metricBottom }
        richLine.PaintTop = paintTop
        richLine.PaintBottom = paintBottom
        return TextLine{
          Content: content, Shape: nil, Width: lineX,
          DisplayStart: displayStart, DisplayEnd: Paragraph.Start + lineEnd,
          VisibleEnd: Paragraph.Start + lineEnd, RightToLeft: RightToLeft,
          EndsWithBreak: lineEnd >= Text.Length || (BoundaryFlags[lineEnd] & CanBreakBit) != uint8(0),
        }
      }

      // Bidi / wrapped-cluster-split fallback: shape line slices coalesced by shaping style
      return materializeReshapedRichLine(n, lineStart, lineEnd, content, displayStart,
        baseStyle, richLine)
    }

  private func hasSpanBoundaryInsideClusterOrRtl(lineStart int32, lineEnd int32) bool {
    if HasBidiInfo || RightToLeft {
      return PaintSpans.Length > 1
    }
    for span in PaintSpans {
      if span.Start > lineStart && span.Start < lineEnd {
        if (BoundaryFlags[span.Start] & ClusterBoundaryBit) == uint8(0)
          || (BoundaryFlags[span.Start] & UnsafeBreakBit) != uint8(0) {
            return true
          }
      }
      if span.End > lineStart && span.End < lineEnd {
        if (BoundaryFlags[span.End] & ClusterBoundaryBit) == uint8(0)
          || (BoundaryFlags[span.End] & UnsafeBreakBit) != uint8(0) {
            return true
          }
      }
    }
    return false
  }

  private func appendRichPaintRun(richLine TextRichLine, slice ShapedText, x float32,
    absDisplayStart int32, displayLen int32, style TextResolvedStyle,
    ref ascent float32, ref descent float32, ref height float32,
    ref paintTop float32, ref paintBottom float32) {
      let ownsGlyphs = slice.GlyphCount > 0
      var decorationSegments [] ? float32 = nil
      if ownsGlyphs && style.Decoration != TextDecoration.None {
        if !slice.HasRightToLeftRun && slice.Runs.Count == 1 {
          decorationSegments = []float32{0.0F, slice.Width}
        } else {
          let segments = slice.SelectionRects(0, displayLen)
          if segments.Length > 0 { decorationSegments = segments }
        }
      }
      let retained = TextPaintRun{
        Shape: slice, X: x, DisplayStart: absDisplayStart,
        DisplayLength: displayLen, Style: style,
      }
      if let segments = decorationSegments { retained.DecorationSegments = segments }
      richLine.Runs.Add(retained)
      if ownsGlyphs {
        let paintPad = textPaintPad(style.StrokeWidth, style.Shadows)
        if paintPad > richLine.PaintPad { richLine.PaintPad = paintPad }
        if slice.Ascent < ascent { ascent = slice.Ascent }
        if slice.Descent > descent { descent = slice.Descent }
        if slice.InkTop < paintTop { paintTop = slice.InkTop }
        if slice.InkBottom > paintBottom { paintBottom = slice.InkBottom }
        let decBottom = textDecorationBottom(style.Decoration, slice.Ascent, slice.Descent)
        if decBottom > paintBottom { paintBottom = decBottom }
        let runHeight = style.FontSize * style.LineHeight
        if runHeight > height { height = runHeight }
      }
    }

  private func materializeReshapedRichLine(n Node, lineStart int32, lineEnd int32,
    content string, displayStart int32, baseStyle TextResolvedStyle,
    richLine TextRichLine) TextLine {
      var ascent = richLine.Ascent
      var descent = richLine.Descent
      var height = richLine.Height
      var paintTop = ascent
      var paintBottom = textDecorationBottom(baseStyle.Decoration, ascent, descent)
      // Shape base line with coalesced groups where paint-only spans still share 1 shape pass per line!
      let lineParagraph = TextParagraphAnalysis(displayStart, displayStart + content.Length,
        content, TextShaping.ResolveParagraph(content, int32(baseStyle.Direction)),
        baseStyle.FontFamily, baseStyle.FontSize, baseStyle.FontWeight,
        baseStyle.FontStyle == FontStyle.Italic, baseStyle.LetterSpacing,
        baseStyle.Direction, baseStyle.Language)
      let ranges = PassiveTextPresentations.Read(n)
      using let lineShaped = ShapedParagraph.Build(lineParagraph, baseStyle, ranges, n)
      if !lineShaped.HasBidiInfo && !lineShaped.RightToLeft {
        var lineX = 0.0F
        for span in lineShaped.PaintSpans {
          let spanText = content.Substring(span.Start, span.End - span.Start)
          let slice = lineShaped.BuildSlicedShapedText(spanText, span.Start, span.End, false)
          var leading = 0.0F
          if lineX > 0.0F && span.Style.LetterSpacing != 0.0F
            && (lineShaped.BoundaryFlags[span.Start] & GraphemeStartBit) != uint8(0) {
            leading = span.Style.LetterSpacing
          }
          let runX = lineX + leading
          lineX = runX + slice.Width
          appendRichPaintRun(richLine, slice, runX, displayStart + span.Start, span.End - span.Start,
            span.Style, ref ascent, ref descent, ref height, ref paintTop, ref paintBottom)
        }
        richLine.Width = lineX
      } else {
        // Mixed-direction Bidi rich line: shape each span in base line visually
        using let baseLine = TextShaping.ShapeLine(content, 0, content.Length, baseStyle.FontFamily,
          baseStyle.FontSize, int32(baseStyle.FontWeight), baseStyle.FontStyle == FontStyle.Italic,
          baseStyle.LetterSpacing, int32(baseStyle.Direction), lineParagraph.Resolution, baseStyle.Language)
        var correction = 0.0F
        for span in lineShaped.PaintSpans {
          let style = span.Style
          let spanText = content.Substring(span.Start, span.End - span.Start)
          let changedShape = TextResolvedStyles.AffectsWidth(baseStyle, style)
          let styledFull = if changedShape {
            TextLineShaper.Styled(content, lineParagraph.Resolution, baseStyle.Direction,
              0, content.Length, style)
          } else { baseLine }
          let baseStartX = baseLine.CaretX(span.Start, int32(TextAffinity.Downstream))
          let baseEndX = baseLine.CaretX(span.End, int32(TextAffinity.Upstream))
          let natural = MathF.Abs(baseEndX - baseStartX)
          let runStartX = styledFull.CaretX(span.Start, int32(TextAffinity.Downstream))
          let runEndX = styledFull.CaretX(span.End, int32(TextAffinity.Upstream))
          let actual = MathF.Abs(runEndX - runStartX)
          let baseLeft = baseStartX < baseEndX ? baseStartX : baseEndX
          let runLeft = runStartX < runEndX ? runStartX : runEndX
          let slice = TextShaping.Slice(styledFull, span.Start, span.End)
          if changedShape { styledFull.Dispose() }
          rebaseRichSlice(content, slice, span.Start, span.End, runLeft)
          let x = baseLeft + correction
          let retained = TextPaintRun{
            Shape: slice, X: x, DisplayStart: displayStart + span.Start,
            DisplayLength: span.End - span.Start, Style: style,
          }
          if style.Decoration != TextDecoration.None && slice.GlyphCount > 0 {
            let segments = slice.SelectionRects(0, span.End - span.Start)
            if segments.Length > 0 { retained.DecorationSegments = segments }
          }
          richLine.Runs.Add(retained)
          if slice.GlyphCount > 0 {
            let paintPad = textPaintPad(style.StrokeWidth, style.Shadows)
            if paintPad > richLine.PaintPad { richLine.PaintPad = paintPad }
            correction = correction + actual - natural
            let metrics = TextShaping.Metrics(style.FontFamily, style.FontSize,
              int32(style.FontWeight), style.FontStyle == FontStyle.Italic)
            if metrics.Ascent < ascent { ascent = metrics.Ascent }
            if metrics.Descent > descent { descent = metrics.Descent }
            if slice.InkTop < paintTop { paintTop = slice.InkTop }
            if slice.InkBottom > paintBottom { paintBottom = slice.InkBottom }
            let decBottom = textDecorationBottom(style.Decoration, metrics.Ascent, metrics.Descent)
            if decBottom > paintBottom { paintBottom = decBottom }
            let runHeight = style.FontSize * style.LineHeight
            if runHeight > height { height = runHeight }
          }
        }
        richLine.Width = baseLine.Width + correction
      }
      richLine.Ascent = ascent
      richLine.Descent = descent
      richLine.Height = height
      if ascent < paintTop { paintTop = ascent }
      let metricBottom = textDecorationBottom(baseStyle.Decoration, ascent, descent)
      if metricBottom > paintBottom { paintBottom = metricBottom }
      richLine.PaintTop = paintTop
      richLine.PaintBottom = paintBottom
      return TextLine{
        Content: content, Shape: nil, Width: richLine.Width,
        DisplayStart: displayStart, DisplayEnd: Paragraph.Start + lineEnd,
        VisibleEnd: Paragraph.Start + lineEnd, RightToLeft: lineShaped.RightToLeft,
        EndsWithBreak: lineEnd >= Text.Length || (BoundaryFlags[lineEnd] & CanBreakBit) != uint8(0),
      }
    }

  private func rebaseRichSlice(content string, slice ShapedText, spanStart int32, spanEnd int32,
    runLeft float32) {
      let runs = slice.Runs
      for i in 0 ... runs.Count {
        let run = runs[i]
        let absStart = spanStart > run.LogicalStart ? spanStart : run.LogicalStart
        let oldEnd = run.LogicalStart + run.Text.Length
        let absEnd = spanEnd < oldEnd ? spanEnd : oldEnd
        let clusterShift = uint32(absStart - run.LogicalStart)
        if absEnd > absStart {
          run.Text = content.Substring(absStart, absEnd - absStart)
        } else {
          run.Text = ""
        }
        run.LogicalStart = absStart - spanStart
        if clusterShift != 0u {
          for k in 0 ... run.Clusters.Length {
            run.Clusters[k] = run.Clusters[k] - clusterShift
          }
        }
        if runLeft != 0.0F {
          for k in 0 ... run.Points.Length {
            let pt = run.Points[k]
            run.Points[k] = TextPoint(pt.X - runLeft, pt.Y)
          }
          run.VisualStart = run.VisualStart - runLeft
          run.VisualEnd = run.VisualEnd - runLeft
        }
      }
    }

  public func Dispose() {
    if disposed { return }
    disposed = true
    for run in Runs { run.Dispose() }
  }

  shared {
    internal func Build(paragraph TextParagraphAnalysis, baseStyle TextResolvedStyle,
      ranges [] ? TextStyleRange, node Node?) ShapedParagraph{
        let text = paragraph.Text
        let len = text.Length
        let paintSpans List[ParagraphPaintSpan] = List[ParagraphPaintSpan]()
        let groups List[ParagraphShapeGroup] = List[ParagraphShapeGroup]()
        if ranges == nil || ranges.Length == 0 || node == nil {
          paintSpans.Add(ParagraphPaintSpan(0, len, baseStyle))
          groups.Add(ParagraphShapeGroup(0, len, 0, 1, baseStyle, int32(baseStyle.Direction)))
        } else {
          let pRanges = ranges
          var cursor int32 = 0
          while cursor < len {
            let abs = paragraph.Start + cursor
            var end = TextResolvedStyles.NextBoundary(pRanges, abs, paragraph.End) - paragraph.Start
            if end <= cursor { end = cursor + 1 }
            let style = TextResolvedStyles.At(node, pRanges, abs)
            let spanIdx = paintSpans.Count
            paintSpans.Add(ParagraphPaintSpan(cursor, end, style))
            if groups.Count > 0 && !TextResolvedStyles.AffectsWidth(groups[groups.Count - 1].Style, style) {
              let last = groups[groups.Count - 1]
              groups[groups.Count - 1] = ParagraphShapeGroup(last.Start, end,
                last.SpanStartIndex, spanIdx + 1, last.Style, last.EffectiveDirection)
            } else {
              groups.Add(ParagraphShapeGroup(cursor, end, spanIdx, spanIdx + 1, style, int32(style.Direction)))
            }
            cursor = end
          }
          if len == 0 {
            paintSpans.Add(ParagraphPaintSpan(0, 0, baseStyle))
            groups.Add(ParagraphShapeGroup(0, 0, 0, 1, baseStyle, int32(baseStyle.Direction)))
          }
        }

        let boundaryFlags = [len + 1]uint8
        LineBreakOpportunities.FillFlags(text, boundaryFlags, CanBreakBit)
        let isAscii = Ascii.IsValid(text.AsSpan())
        if isAscii {
          var prevCr = false
          for i in 0 ... len {
            let ch = text[i]
            if !(prevCr && ch == '\n') {
              boundaryFlags[i] = boundaryFlags[i] | GraphemeStartBit
            }
            prevCr = ch == '\r'
          }
        } else {
          let gScratchOwner = TextShaping.AnalysisScratch()
          let gScratch = gScratchOwner.Rent(len)
          try {
            let gStarts = UnicodeGraphemes.Starts(text, gScratch.BeginGraphemeScalars(len),
              gScratch.BeginGlyphStarts(len))
            for idx in gStarts {
              boundaryFlags[idx] = boundaryFlags[idx] | GraphemeStartBit
            }
          } finally {
            gScratchOwner.Return(gScratch)
          }
        }
        boundaryFlags[0] = boundaryFlags[0] | ClusterBoundaryBit
        boundaryFlags[len] = boundaryFlags[len] | ClusterBoundaryBit

        let registryGeneration = FontRegistry.Generation
        let primary = TextShaping.ResolveCachedPrimary(baseStyle.FontFamily, int32(baseStyle.FontWeight),
          baseStyle.FontStyle == FontStyle.Italic, registryGeneration)
        let baseMetrics = TextShaping.MetricsFor(primary.Provider.Metrics, baseStyle.FontSize)
        let runs = List[ParagraphShapedRun]()
        var rightToLeft = int32(paragraph.Direction) == 2
        var hasBidiInfo = false
        let prefixWidth = [len + 1]float32
        var anySpacing = false
        for g in groups {
          if g.Style.LetterSpacing != 0.0F {
            anySpacing = true
            break
          }
        }
        let leadingSpacing []?float32 = if anySpacing { [len + 1]float32 } else { nil }

        let scratchOwner = TextShaping.AnalysisScratch()
        let scratch = scratchOwner.Rent(len)
        try {
          if len == 0 {
            rightToLeft = paragraph.Resolution?.RightToLeft ?? (int32(paragraph.Direction) == 2)
            primary.Dispose()
            return ShapedParagraph(paragraph, rightToLeft, false, baseMetrics.Ascent,
              baseMetrics.Descent, 0.0F, groups.ToArray(), paintSpans.ToArray(), runs,
              prefixWidth, leadingSpacing, boundaryFlags)
          }

          let scriptRuns = TextShaping.ScriptRunsFor(text, scratchOwner)
          let clusterEnd = [len]int32
          let clusterAdv = [len]float32
          let clusterSpacing = [len]float32
          let clusterHasGlyph = [len]bool
          let clusterUnsafe = [len]bool
          for i in 0 ... len { clusterEnd[i] = -1 }

          for gIdx in 0 ... groups.Count {
            let group = groups[gIdx]
            let gStyle = group.Style
            let usesBaseFace = gStyle.FontFamily == baseStyle.FontFamily
              && int32(gStyle.FontWeight) == int32(baseStyle.FontWeight)
              && (gStyle.FontStyle == FontStyle.Italic) == (baseStyle.FontStyle == FontStyle.Italic)
            let groupLease = if usesBaseFace { primary.Duplicate() }
            else {
              TextShaping.ResolveCachedPrimary(gStyle.FontFamily, int32(gStyle.FontWeight),
                gStyle.FontStyle == FontStyle.Italic, registryGeneration)
            }
            let groupFallbacks = List[TypefaceLease]()
            try {
              let res = if gIdx == 0 && group.EffectiveDirection == int32(paragraph.Direction) {
                paragraph.Resolution ?? TextShaping.ResolveParagraph(text, group.EffectiveDirection)
              } else {
                TextShaping.ResolveParagraph(text, group.EffectiveDirection)
              }
              if res.Info == nil {
                if gIdx == 0 { rightToLeft = group.EffectiveDirection == 2 }
                shapeDirectionalIntoRuns(text, group.Start, group.End - group.Start,
                  group.EffectiveDirection == 2, gStyle.FontFamily, int32(gStyle.FontWeight),
                  gStyle.FontStyle == FontStyle.Italic, registryGeneration, gStyle.FontSize,
                  gStyle.LetterSpacing, gStyle.Language, groupLease, groupFallbacks, scratch,
                  scriptRuns, runs, boundaryFlags, clusterEnd, clusterAdv, clusterSpacing,
                  clusterHasGlyph, clusterUnsafe)
              } else {
                hasBidiInfo = true
                let info = res.Info!!
                var pInfo Unicode.Bidi.ParagraphInfo
                var found = false
                for candidate in info.Paragraphs {
                  if group.Start >= candidate.Range.Start && group.End <= candidate.Range.End {
                    pInfo = candidate
                    found = true
                    break
                  }
                }
                if !found { throw ArgumentOutOfRangeException("length") }
                if gIdx == 0 { rightToLeft = pInfo.Level.IsRtl() }
                let visual = info.VisualRuns(pInfo, Unicode.Bidi.TextRange(group.Start, group.End))
                for visualRun in visual.Item2 {
                  let rtl = info.Levels[visualRun.Start].IsRtl()
                  shapeDirectionalIntoRuns(text, visualRun.Start, visualRun.Length, rtl,
                    gStyle.FontFamily, int32(gStyle.FontWeight),
                    gStyle.FontStyle == FontStyle.Italic, registryGeneration, gStyle.FontSize,
                    gStyle.LetterSpacing, gStyle.Language, groupLease, groupFallbacks, scratch,
                    scriptRuns, runs, boundaryFlags, clusterEnd, clusterAdv, clusterSpacing,
                    clusterHasGlyph, clusterUnsafe)
                }
              }
            } finally {
              for candidate in groupFallbacks { candidate.Dispose() }
              groupLease.Dispose()
            }
          }

          // Compute exact logical prefix width array & leading spacing in O(N).
          var cumWidth = 0.0F
          var seenGlyphCluster = false
          var c int32 = 0
          while c < len {
            let end = clusterEnd[c]
            if end > c {
              boundaryFlags[c] = boundaryFlags[c] | ClusterBoundaryBit
              boundaryFlags[end] = boundaryFlags[end] | ClusterBoundaryBit
              if clusterUnsafe[c] {
                boundaryFlags[c] = boundaryFlags[c] | UnsafeBreakBit
                boundaryFlags[end] = boundaryFlags[end] | UnsafeBreakBit
              }
              let spacing = if seenGlyphCluster && clusterHasGlyph[c]
                && (boundaryFlags[c] & GraphemeStartBit) != uint8(0) {
                  clusterSpacing[c]
                } else { 0.0F }
              if clusterHasGlyph[c] { seenGlyphCluster = true }
              if let leading = leadingSpacing { leading[c] = spacing }
              cumWidth = cumWidth + spacing + clusterAdv[c]
              for u in c + 1 ... end + 1 {
                prefixWidth[u] = cumWidth
              }
              c = end
            } else {
              prefixWidth[c + 1] = cumWidth
              c++
            }
          }

          primary.Dispose()
          return ShapedParagraph(paragraph, rightToLeft, hasBidiInfo, baseMetrics.Ascent,
            baseMetrics.Descent, cumWidth, groups.ToArray(), paintSpans.ToArray(), runs,
            prefixWidth, leadingSpacing, boundaryFlags)
        } catch (error Exception) {
          primary.Dispose()
          for run in runs { run.Dispose() }
          rethrow
        } finally {
          scratchOwner.Return(scratch)
        }
      }

    private func shapeDirectionalIntoRuns(text string, rangeStart int32, rangeLength int32,
      rtl bool, families string, weight int32, italic bool, registryGeneration uint64,
      size float32, letterSpacing float32, language string, primary TypefaceLease,
      fallbackCandidates List[TypefaceLease], scratch UnicodeTextAnalysisScratchScope,
      scriptRuns List[UnicodeScriptRun], outRuns List[ParagraphShapedRun],
      boundaryFlags []uint8, clusterEnd []int32, clusterAdv []float32,
      clusterSpacing []float32, clusterHasGlyph []bool, clusterUnsafe []bool) {
        let rangeEnd = rangeStart + rangeLength
        let first = TextShaping.firstScriptRun(scriptRuns, rangeStart)
        if rtl {
          var scriptIndex = first
          while scriptIndex < scriptRuns.Count && scriptRuns[scriptIndex].Start < rangeEnd { scriptIndex++ }
          while scriptIndex > first {
            scriptIndex--
            let scriptRun = scriptRuns[scriptIndex]
            let scriptEnd = scriptRun.Start + scriptRun.Length
            let start = if scriptRun.Start < rangeStart { rangeStart } else { scriptRun.Start }
            let end = if scriptEnd > rangeEnd { rangeEnd } else { scriptEnd }
            if end > start {
              shapeScriptIntoRuns(text, start, end - start, rtl, families, weight, italic,
                registryGeneration, size, letterSpacing, language, primary, fallbackCandidates,
                scratch, scriptRun.Script, outRuns, boundaryFlags, clusterEnd, clusterAdv,
                clusterSpacing, clusterHasGlyph, clusterUnsafe)
            }
          }
        } else {
          var scriptIndex = first
          while scriptIndex < scriptRuns.Count && scriptRuns[scriptIndex].Start < rangeEnd {
            let scriptRun = scriptRuns[scriptIndex]
            let scriptEnd = scriptRun.Start + scriptRun.Length
            let start = if scriptRun.Start < rangeStart { rangeStart } else { scriptRun.Start }
            let end = if scriptEnd > rangeEnd { rangeEnd } else { scriptEnd }
            if end > start {
              shapeScriptIntoRuns(text, start, end - start, rtl, families, weight, italic,
                registryGeneration, size, letterSpacing, language, primary, fallbackCandidates,
                scratch, scriptRun.Script, outRuns, boundaryFlags, clusterEnd, clusterAdv,
                clusterSpacing, clusterHasGlyph, clusterUnsafe)
            }
            scriptIndex++
          }
        }
      }

    private func shapeScriptIntoRuns(text string, textStart int32, textLength int32, rtl bool,
      families string, weight int32, italic bool, registryGeneration uint64, size float32,
      letterSpacing float32, language string, primary TypefaceLease,
      fallbackCandidates List[TypefaceLease], scratch UnicodeTextAnalysisScratchScope,
      script uint32, outRuns List[ParagraphShapedRun], boundaryFlags []uint8,
      clusterEnd []int32, clusterAdv []float32, clusterSpacing []float32,
      clusterHasGlyph []bool, clusterUnsafe []bool) {
        let direction = if rtl { 5u } else { 4u }
        if let cached = TextShaping.TryShapeWithCache(text, textStart, textLength, primary,
          direction, script, language) {
          var hasMissing = false
          for g in cached.Glyphs {
            if g == 0u {
              hasMissing = true
              break
            }
          }
          if !hasMissing {
            appendCachedRunToParagraph(textStart, textLength, rtl, script, size, letterSpacing,
              primary, cached, outRuns, boundaryFlags, clusterEnd, clusterAdv, clusterSpacing,
              clusterHasGlyph, clusterUnsafe)
            return
          }
          handleParagraphMissingFallback(text, textStart, textLength, rtl, families, weight,
            italic, registryGeneration, size, letterSpacing, language, primary, fallbackCandidates,
            direction, script, cached.Glyphs, cached.Clusters, cached.Glyphs.Length, scratch,
            outRuns, boundaryFlags, clusterEnd, clusterAdv, clusterSpacing, clusterHasGlyph, clusterUnsafe)
          return
        }
        let shaped = TextShaping.ShapeProviderSlice(text, textStart, textLength, primary.Provider,
          direction, script, language)
        let count = shaped.Count
        let buffer = shaped.Workspace.GlyphBuffer
        var hasMissing = false
        for i in 0 ... count {
          if buffer[i].GlyphId == 0u {
            hasMissing = true
            break
          }
        }
        if !hasMissing {
          appendRawRunToParagraph(textStart, textLength, rtl, script, size, letterSpacing,
            primary, buffer, count, outRuns, boundaryFlags, clusterEnd, clusterAdv, clusterSpacing,
            clusterHasGlyph, clusterUnsafe)
          return
        }
        let gIds = [count]uint32
        let cls = [count]uint32
        for i in 0 ... count {
          gIds[i] = buffer[i].GlyphId
          cls[i] = buffer[i].Cluster
        }
        handleParagraphMissingFallback(text, textStart, textLength, rtl, families, weight, italic,
          registryGeneration, size, letterSpacing, language, primary, fallbackCandidates,
          direction, script, gIds, cls, count, scratch, outRuns, boundaryFlags, clusterEnd,
          clusterAdv, clusterSpacing, clusterHasGlyph, clusterUnsafe)
      }

    private func handleParagraphMissingFallback(text string, textStart int32, textLength int32,
      rtl bool, families string, weight int32, italic bool, registryGeneration uint64,
      size float32, letterSpacing float32, language string, primary TypefaceLease,
      fallbackCandidates List[TypefaceLease], direction uint32, script uint32,
      primaryGlyphIds []uint32, primaryClusters []uint32, count int32,
      scratch UnicodeTextAnalysisScratchScope, outRuns List[ParagraphShapedRun],
      boundaryFlags []uint8, clusterEnd []int32, clusterAdv []float32,
      clusterSpacing []float32, clusterHasGlyph []bool, clusterUnsafe []bool) {
        if fallbackCandidates.Count == 0 {
          let resolved = TextShaping.ResolveFallbackCandidates(families, weight, italic, primary)
          for candidate in resolved { fallbackCandidates.Add(candidate) }
        }
        let boundaries = TextShaping.SelectFallbackCandidatesForSlice(text, textStart, textLength,
          families, weight, italic, registryGeneration, direction, script, language,
          primaryGlyphIds, primaryClusters, count, fallbackCandidates, scratch, out var selected)
        if rtl {
          var endIndex = boundaries.Count
          while endIndex > 0 {
            let selection = selected[endIndex - 1]
            var startIndex = endIndex - 1
            while startIndex > 0 && selected[startIndex - 1] == selection { startIndex-- }
            let groupStart = boundaries[startIndex]
            let groupEnd = if endIndex < boundaries.Count { boundaries[endIndex] } else { textLength }
            shapeFallbackLeafToParagraph(text, textStart + groupStart, groupEnd - groupStart, rtl,
              size, letterSpacing, language, fallbackCandidates[selection], direction, script,
              outRuns, boundaryFlags, clusterEnd, clusterAdv, clusterSpacing, clusterHasGlyph, clusterUnsafe)
            endIndex = startIndex
          }
        } else {
          var startIndex int32 = 0
          while startIndex < boundaries.Count {
            let selection = selected[startIndex]
            var endIndex = startIndex + 1
            while endIndex < boundaries.Count && selected[endIndex] == selection { endIndex++ }
            let groupStart = boundaries[startIndex]
            let groupEnd = if endIndex < boundaries.Count { boundaries[endIndex] } else { textLength }
            shapeFallbackLeafToParagraph(text, textStart + groupStart, groupEnd - groupStart, rtl,
              size, letterSpacing, language, fallbackCandidates[selection], direction, script,
              outRuns, boundaryFlags, clusterEnd, clusterAdv, clusterSpacing, clusterHasGlyph, clusterUnsafe)
            startIndex = endIndex
          }
        }
      }

    private func shapeFallbackLeafToParagraph(text string, absStart int32, len int32, rtl bool,
      size float32, letterSpacing float32, language string, selected TypefaceLease,
      direction uint32, script uint32, outRuns List[ParagraphShapedRun], boundaryFlags []uint8,
      clusterEnd []int32, clusterAdv []float32, clusterSpacing []float32,
      clusterHasGlyph []bool, clusterUnsafe []bool) {
        if let cached = TextShaping.TryShapeWithCache(text, absStart, len, selected, direction, script, language) {
          appendCachedRunToParagraph(absStart, len, rtl, script, size, letterSpacing, selected, cached,
            outRuns, boundaryFlags, clusterEnd, clusterAdv, clusterSpacing, clusterHasGlyph, clusterUnsafe)
          return
        }
        let shaped = TextShaping.ShapeProviderSlice(text, absStart, len, selected.Provider, direction, script, language)
        appendRawRunToParagraph(absStart, len, rtl, script, size, letterSpacing, selected,
          shaped.Workspace.GlyphBuffer, shaped.Count, outRuns, boundaryFlags, clusterEnd,
          clusterAdv, clusterSpacing, clusterHasGlyph, clusterUnsafe)
      }

    private func appendCachedRunToParagraph(runStart int32, runLength int32, rtl bool, script uint32,
      size float32, letterSpacing float32, selected TypefaceLease, cached CachedShapedRun,
      outRuns List[ParagraphShapedRun], boundaryFlags []uint8, clusterEnd []int32,
      clusterAdv []float32, clusterSpacing []float32, clusterHasGlyph []bool,
      clusterUnsafe []bool) {
        let count = cached.Glyphs.Length
        if count == 0 { return }
        let factor = size / 65536.0F
        let glyphs = [count]uint32
        let clusters = [count]uint32
        let points = [count]TextPoint
        let penX = [count]float32
        let penEndX = [count]float32
        let flags = cached.Flags
        var consumed = 0.0F
        var localPrior uint32 = 0u
        var hasLocalPrior = false
        for i in 0 ... count {
          let cluster = cached.Clusters[i]
          glyphs[i] = cached.Glyphs[i]
          clusters[i] = cluster
          if hasLocalPrior && cluster != localPrior && letterSpacing != 0.0F
            && (boundaryFlags[runStart + int32(cluster)] & GraphemeStartBit) != uint8(0) {
            consumed = consumed + letterSpacing
          }
          penX[i] = consumed
          let xOffset = float32(cached.XOffsets[i]) * factor
          let yOffset = float32(cached.YOffsets[i]) * factor
          points[i] = TextPoint(consumed + xOffset, yOffset)
          consumed = consumed + MathF.Abs(float32(cached.XAdvances[i]) * factor)
          penEndX[i] = consumed
          localPrior = cluster
          hasLocalPrior = true
        }
        recordClustersForLineBreak(runStart, runLength, rtl, count, clusters, cached.XAdvances,
          flags, factor, letterSpacing, clusterEnd, clusterAdv, clusterSpacing, clusterHasGlyph, clusterUnsafe)
        let metrics = TextShaping.MetricsFor(selected.Provider.Metrics, size)
        outRuns.Add(ParagraphShapedRun(runStart, runStart + runLength, script, rtl,
          selected.Family, size, letterSpacing, consumed, metrics.Ascent, metrics.Descent,
          glyphs, clusters, points, penX, penEndX, flags, selected.Duplicate()))
      }

    private func appendRawRunToParagraph(runStart int32, runLength int32, rtl bool, script uint32,
      size float32, letterSpacing float32, selected TypefaceLease, source []VulkanTextGlyph,
      count int32, outRuns List[ParagraphShapedRun], boundaryFlags []uint8,
      clusterEnd []int32, clusterAdv []float32, clusterSpacing []float32,
      clusterHasGlyph []bool, clusterUnsafe []bool) {
        if count == 0 { return }
        let factor = size / 65536.0F
        let glyphs = [count]uint32
        let clusters = [count]uint32
        let points = [count]TextPoint
        let penX = [count]float32
        let penEndX = [count]float32
        let flags = [count]uint8
        var consumed = 0.0F
        var localPrior uint32 = 0u
        var hasLocalPrior = false
        for i in 0 ... count {
          let g = source[i]
          let cluster = g.Cluster
          glyphs[i] = g.GlyphId
          clusters[i] = cluster
          flags[i] = uint8(g.Flags)
          if hasLocalPrior && cluster != localPrior && letterSpacing != 0.0F
            && (boundaryFlags[runStart + int32(cluster)] & GraphemeStartBit) != uint8(0) {
            consumed = consumed + letterSpacing
          }
          penX[i] = consumed
          let xOffset = float32(g.XOffset) * factor
          let yOffset = float32(g.YOffset) * factor
          points[i] = TextPoint(consumed + xOffset, yOffset)
          consumed = consumed + MathF.Abs(float32(g.XAdvance) * factor)
          penEndX[i] = consumed
          localPrior = cluster
          hasLocalPrior = true
        }
        recordRawClustersForLineBreak(runStart, runLength, rtl, count, source, factor,
          letterSpacing, clusterEnd, clusterAdv, clusterSpacing, clusterHasGlyph, clusterUnsafe)
        let metrics = TextShaping.MetricsFor(selected.Provider.Metrics, size)
        outRuns.Add(ParagraphShapedRun(runStart, runStart + runLength, script, rtl,
          selected.Family, size, letterSpacing, consumed, metrics.Ascent, metrics.Descent,
          glyphs, clusters, points, penX, penEndX, flags, selected.Duplicate()))
      }

    private func recordClustersForLineBreak(runStart int32, runLength int32, rtl bool, count int32,
      clusters []uint32, xAdvances []int32, flags []uint8, factor float32, letterSpacing float32,
      clusterEnd []int32, clusterAdv []float32, clusterSpacing []float32,
      clusterHasGlyph []bool, clusterUnsafe []bool) {
        if !rtl {
          var g int32 = 0
          while g < count {
            let relStart = int32(clusters[g])
            var adv = 0.0F
            var isUnsafe = false
            while g < count && int32(clusters[g]) == relStart {
              adv = adv + MathF.Abs(float32(xAdvances[g]) * factor)
              if (flags[g] & uint8(1)) != uint8(0) { isUnsafe = true }
              g++
            }
            let relEnd = if g < count { int32(clusters[g]) } else { runLength }
            let absStart = runStart + relStart
            let absEnd = runStart + relEnd
            if absStart >= 0 && absStart < clusterEnd.Length {
              clusterEnd[absStart] = absEnd
              clusterAdv[absStart] = adv
              clusterSpacing[absStart] = letterSpacing
              clusterHasGlyph[absStart] = true
              clusterUnsafe[absStart] = isUnsafe
            }
          }
        } else {
          var g = count - 1
          var nextEnd = runLength
          while g >= 0 {
            let relStart = int32(clusters[g])
            var adv = 0.0F
            var isUnsafe = false
            while g >= 0 && int32(clusters[g]) == relStart {
              adv = adv + MathF.Abs(float32(xAdvances[g]) * factor)
              if (flags[g] & uint8(1)) != uint8(0) { isUnsafe = true }
              g--
            }
            let absStart = runStart + relStart
            let absEnd = runStart + nextEnd
            if absStart >= 0 && absStart < clusterEnd.Length {
              clusterEnd[absStart] = absEnd
              clusterAdv[absStart] = adv
              clusterSpacing[absStart] = letterSpacing
              clusterHasGlyph[absStart] = true
              clusterUnsafe[absStart] = isUnsafe
            }
            nextEnd = relStart
          }
        }
      }

    private func recordRawClustersForLineBreak(runStart int32, runLength int32, rtl bool, count int32,
      source []VulkanTextGlyph, factor float32, letterSpacing float32,
      clusterEnd []int32, clusterAdv []float32, clusterSpacing []float32,
      clusterHasGlyph []bool, clusterUnsafe []bool) {
        if !rtl {
          var g int32 = 0
          while g < count {
            let relStart = int32(source[g].Cluster)
            var adv = 0.0F
            var isUnsafe = false
            while g < count && int32(source[g].Cluster) == relStart {
              adv = adv + MathF.Abs(float32(source[g].XAdvance) * factor)
              if (source[g].Flags & 1u) != 0u { isUnsafe = true }
              g++
            }
            let relEnd = if g < count { int32(source[g].Cluster) } else { runLength }
            let absStart = runStart + relStart
            let absEnd = runStart + relEnd
            if absStart >= 0 && absStart < clusterEnd.Length {
              clusterEnd[absStart] = absEnd
              clusterAdv[absStart] = adv
              clusterSpacing[absStart] = letterSpacing
              clusterHasGlyph[absStart] = true
              clusterUnsafe[absStart] = isUnsafe
            }
          }
        } else {
          var g = count - 1
          var nextEnd = runLength
          while g >= 0 {
            let relStart = int32(source[g].Cluster)
            var adv = 0.0F
            var isUnsafe = false
            while g >= 0 && int32(source[g].Cluster) == relStart {
              adv = adv + MathF.Abs(float32(source[g].XAdvance) * factor)
              if (source[g].Flags & 1u) != 0u { isUnsafe = true }
              g--
            }
            let absStart = runStart + relStart
            let absEnd = runStart + nextEnd
            if absStart >= 0 && absStart < clusterEnd.Length {
              clusterEnd[absStart] = absEnd
              clusterAdv[absStart] = adv
              clusterSpacing[absStart] = letterSpacing
              clusterHasGlyph[absStart] = true
              clusterUnsafe[absStart] = isUnsafe
            }
            nextEnd = relStart
          }
        }
      }

    private func isBreakWhiteOrAsciiPunct(ch char) bool ->
      ch <= '\u007F' && !((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9'))

    private func isContextualJoiningScript(script uint32) bool ->
      script == 0x41726162u || script == 0x53797263u || script == 0x4E6B6F6Fu
        || script == 0x4D616E64u || script == 0x4D6F6E67u || script == 0x50686167u
        || script == 0x41646C6Du || script == 0x526F6867u
  }
}
