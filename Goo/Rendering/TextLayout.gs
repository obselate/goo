package Goo

import System
import System.Collections.Generic
import System.Threading

internal class TextLine {
  internal prop Content string{ get; init; }
  internal prop Shape ShapedText? { get; init; }
  internal prop Width float32{ get; set; }
  internal prop WidthLimit float32{ get; init; }
  internal prop DisplayStart int32{ get; set; }
  internal prop DisplayEnd int32{ get; set; }
  internal prop VisibleEnd int32{ get; set; }
  internal prop RightToLeft bool{ get; set; }
  internal prop EndsWithBreak bool{ get; set; }
  internal prop DisplayWidth float32{
    get {
      if let shaped = Shape { return shaped.Width }
      return Width
    }
  }

  internal init() {
    Content = ""
    WidthLimit = Single.PositiveInfinity
  }
}

internal class TextLayout {
  private var rich TextRichLayout?
  private var minWidth float32 = -1.0F
  internal var References int32 = 1

  internal prop Content string{ get; init; }
  internal prop FontFamily string{ get; init; }
  internal prop Language string{ get; init; }
  internal prop FontSize float32{ get; init; }
  internal prop FontWeight float64{ get; init; }
  internal prop FontRegistryGeneration uint64{ get; init; }
  internal prop Policy int32{ get; init; }
  internal prop TextMaxLines int32{ get; init; }
  internal prop LetterSpacing float32{ get; init; }
  internal prop LineHeight float64{ get; init; }
  internal prop MaxWidth float32{ get; init; }
  internal prop RichSignature uint64{ get; init; }
  internal prop RichRanges [] ? TextStyleRange{ get; init; }
  internal prop RichBaseColor Color{ get; init; }
  internal prop RichBaseDecoration TextDecoration{ get; init; }
  internal prop RichBaseStrokeWidth float32{ get; init; }
  internal prop RichBaseStrokeColor Color{ get; init; }
  internal prop RichBaseShadows BoxShadowStack? { get; init; }
  internal prop RichRootFontSize float32{ get; init; }
  internal var CacheMinWidth float32
  internal var CacheMaxWidth float32 = Single.PositiveInfinity
  internal var WidthLimit float32 = Single.PositiveInfinity
  internal var EstimatedBytes int64
  internal prop MinWidth float32{
    get {
      let current = Volatile.Read(in minWidth)
      if current >= 0.0F { return current }
      let computed = TextLayouts.ComputeLazyMinWidth(this)
      Volatile.Write(ref minWidth, computed)
      return computed
    }
    set {
      Volatile.Write(ref minWidth, value)
    }
  }
  internal prop Rich TextRichLayout? {
    get -> rich
    set -> rich = value
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
    Language = ""
    Lines = List[TextLine]()
  }
}

private sealed class SharedLayoutCacheNode {
  internal let Key string
  internal let Layout TextLayout
  internal var Prev SharedLayoutCacheNode?
  internal var Next SharedLayoutCacheNode?

  internal init(key string, layout TextLayout) {
    Key = key
    Layout = layout
  }
}

internal class TextLayouts {
  shared {
    private const MaxSharedLayoutBytes int64 = 32L * 1024L * 1024L
    private let sharedLayouts Dictionary[string, List[SharedLayoutCacheNode]] =
    Dictionary[string, List[SharedLayoutCacheNode]](StringComparer.Ordinal)
    private let sharedLock object = Object()
    private var lruHead SharedLayoutCacheNode?
    private var lruTail SharedLayoutCacheNode?
    private var sharedCacheBytes int64
    private var sharedCacheEntries int32
    private var sharedCacheHits int64
    private var sharedCacheMisses int64
    private var sharedCacheEvictions int64

    internal func CacheStats() TextCacheStats {
      lock (sharedLock) {
        return TextCacheStats(sharedCacheBytes, sharedCacheEntries,
          sharedCacheHits, sharedCacheMisses, sharedCacheEvictions)
      }
    }

    internal func For(n Node, requestedWidth float32, measuring bool = false) TextLayout {
      let maxWidth = if n.TextWrap == TextWrap.NoWrap && n.TextTrimming != TextTrimming.Ellipsis {
        -1.0F
      } else {
        !measuring && n.RetainedLayoutTransition != nil ? BoxGeometry.ContentWidth(n, true) : requestedWidth
      }
      let richRanges = PassiveTextPresentations.Read(n)
      let richSig = PassiveTextPresentations.Signature(n)
      let rootSize = richRanges != nil ? rootFontSize(n) : 0.0F
      if let cached = n.TextLayout {
        if matches(cached, n, maxWidth, richRanges, richSig, rootSize) {
          return cached
        }
      }
      if let prior = n.PriorTextLayout {
        if matches(prior, n, maxWidth, richRanges, richSig, rootSize) {
          n.PriorTextLayout = n.TextLayout
          n.TextLayout = prior
          return prior
        }
      }
      if let cache = n.TextLayoutCache {
        for i in 0 ... cache.Count {
          let cached = cache[i]
          if matches(cached, n, maxWidth, richRanges, richSig, rootSize) {
            n.TextLayout = cached
            return cached
          }
        }
      }
      let layout = sharedLayout(n, maxWidth, richRanges, richSig, rootSize)
      if n.TextLayoutCache == nil {
        if let previous = n.TextLayout {
          if let prior = n.PriorTextLayout {
            let cache = List[TextLayout](4)
            cache.Add(prior)
            cache.Add(previous)
            n.TextLayoutCache = cache
            n.PriorTextLayout = nil
          } else {
            n.PriorTextLayout = previous
          }
        }
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

    private func sharedLayout(n Node, maxWidth float32, richRanges [] ? TextStyleRange,
      richSig uint64, rootSize float32) TextLayout {
        lock (sharedLock) {
          if sharedLayouts.TryGetValue(n.Content, out var cached) {
            for cacheNode in cached {
              if matches(cacheNode.Layout, n, maxWidth, richRanges, richSig, rootSize) {
                moveSharedToHead(cacheNode)
                sharedCacheHits++
                Interlocked.Increment(ref cacheNode.Layout.References)
                return cacheNode.Layout
              }
            }
          }
          sharedCacheMisses++
        }
        let built = build(n, maxWidth, richRanges, richSig, rootSize)
        if built.EstimatedBytes > MaxSharedLayoutBytes / 2L {
          return built
        }
        var displaced List[TextLayout]? = nil
        var winner = built
        var discardBuilt = false
        lock (sharedLock) {
          if sharedLayouts.TryGetValue(n.Content, out var existingBucket) {
            for existingNode in existingBucket {
              if matches(existingNode.Layout, n, maxWidth, richRanges, richSig, rootSize) {
                moveSharedToHead(existingNode)
                Interlocked.Increment(ref existingNode.Layout.References)
                winner = existingNode.Layout
                discardBuilt = true
                break
              }
            }
          }
          if !discardBuilt {
            while sharedCacheBytes + built.EstimatedBytes > MaxSharedLayoutBytes {
              guard let retired = lruTail else { break }
              removeSharedNode(retired)
              if sharedLayouts.TryGetValue(retired.Key, out var bucket) {
                bucket.Remove(retired)
                if bucket.Count == 0 { sharedLayouts.Remove(retired.Key) }
              }
              sharedCacheBytes = sharedCacheBytes - retired.Layout.EstimatedBytes
              sharedCacheEntries--
              sharedCacheEvictions++
              let displacedList = displaced ?? List[TextLayout]()
              displaced = displacedList
              displacedList.Add(retired.Layout)
            }
            let nodeEntry = SharedLayoutCacheNode(built.Content, built)
            addSharedToHead(nodeEntry)
            if !sharedLayouts.TryGetValue(built.Content, out var list) {
              list = List[SharedLayoutCacheNode]()
              sharedLayouts.Add(built.Content, list)
            }
            list.Add(nodeEntry)
            sharedCacheBytes = sharedCacheBytes + built.EstimatedBytes
            sharedCacheEntries++
            Interlocked.Increment(ref built.References)
          }
        }
        if discardBuilt { dispose(built) }
        if let retired = displaced {
          for item in retired { dispose(item) }
        }
        return winner
      }

    private func addSharedToHead(node SharedLayoutCacheNode) {
      node.Prev = nil
      node.Next = lruHead
      if let head = lruHead { head.Prev = node }
      lruHead = node
      if lruTail == nil { lruTail = node }
    }

    private func removeSharedNode(node SharedLayoutCacheNode) {
      let prev = node.Prev
      let next = node.Next
      if let p = prev { p.Next = next } else { lruHead = next }
      if let n = next { n.Prev = prev } else { lruTail = prev }
      node.Prev = nil
      node.Next = nil
    }

    private func moveSharedToHead(node SharedLayoutCacheNode) {
      if Object.ReferenceEquals(lruHead, node) { return }
      removeSharedNode(node)
      addSharedToHead(node)
    }

    internal func CurrentForGeometry(n Node) TextLayout? {
      let width = BoxGeometry.ContentWidth(n, true)
      let richRanges = PassiveTextPresentations.Read(n)
      let richSig = PassiveTextPresentations.Signature(n)
      let rootSize = richRanges != nil ? rootFontSize(n) : 0.0F
      if let layout = n.TextLayout {
        if matches(layout, n, width, richRanges, richSig, rootSize) { return layout }
      }
      if let prior = n.PriorTextLayout {
        if matches(prior, n, width, richRanges, richSig, rootSize) { return prior }
      }
      if let cache = n.TextLayoutCache {
        for i in 0 ... cache.Count {
          let item = cache[i]
          if matches(item, n, width, richRanges, richSig, rootSize) { return item }
        }
      }
      return nil
    }

    internal func Invalidate(n Node, retainContentCache bool = false) {
      if !retainContentCache { disposeCached(n) }
      FlexLayoutEngine.Invalidate(n)
    }

    internal func RefreshRich(n Node) {
      let hadLayout = n.TextLayout != nil
      let previousWidth = if let current = n.TextLayout { current.MaxWidth }
      else { BoxGeometry.ContentWidth(n, true) }
      disposeCached(n)
      if hadLayout {
        let _ = For(n, previousWidth)
      }
    }

    internal func Dispose(n Node) {
      disposeCached(n)
      TextAnalyses.Remove(n)
      PassiveTextPresentations.Remove(n)
      if let entryShape = n.EntryShape {
        entryShape.Shape?.Dispose()
        entryShape.PlaceholderShape?.Dispose()
        n.EntryShape = nil
      }
    }

    internal func disposeCached(n Node) {
      if let cache = n.TextLayoutCache {
        for i in 0 ... cache.Count {
          dispose(cache[i])
        }
      } else if let cached = n.TextLayout {
        dispose(cached)
      }
      if let prior = n.PriorTextLayout { dispose(prior) }
      n.TextLayout = nil
      n.PriorTextLayout = nil
      n.TextLayoutCache = nil
    }

    internal func IsShapingField(f StyleField) bool -> f == StyleField.Language || f == StyleField.FontFamily || f == StyleField.FontSize
      || f == StyleField.FontWeight || f == StyleField.FontStyle
      || f == StyleField.LetterSpacing || f == StyleField.LineHeight
      || f == StyleField.TextWrap || f == StyleField.TextTrimming
      || f == StyleField.TextTransform || f == StyleField.TextMaxLines
      || f == StyleField.Direction

    internal func dispose(layout TextLayout) {
      if Interlocked.Decrement(ref layout.References) != 0 { return }
      for line in layout.Lines {
        line.Shape?.Dispose()
      }
      if let rich = layout.Rich {
        for line in rich.Lines { disposeRichLine(line) }
      }
    }

    internal func lineOffset(n Node, line TextLine, contentWidth float32) float32 ->
    lineOffset(n, line.DisplayWidth, line.RightToLeft, contentWidth)

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

    internal func build(n Node, maxWidth float32, richRanges [] ? TextStyleRange = nil,
      richSig uint64 = 0uL, rootSize float32 = 0.0F) TextLayout {
      let analysis = TextAnalyses.For(n)
      let baseStyle = TextResolvedStyles.Base(n)
      let ranges = richRanges ?? PassiveTextPresentations.Read(n)
      let rich TextRichLayout? = if ranges != nil { TextRichLayout() } else { nil }
      let result = TextLayout{
        Content: n.Content,
        FontFamily: n.FontFamily,
        Language: n.Language,
        FontRegistryGeneration: FontRegistry.Generation,
        FontSize: fontSize(n),
        FontWeight: n.FontWeight,
        Policy: textPolicy(n),
        TextMaxLines: n.TextMaxLines,
        LetterSpacing: letterSpacing(n),
        LineHeight: n.LineHeight,
        MaxWidth: maxWidth,
        RichSignature: richSig,
        RichRanges: ranges,
        RichBaseColor: ranges != nil ? n.Color : Color.Transparent,
        RichBaseDecoration: ranges != nil ? n.TextDecoration : TextDecoration.None,
        RichBaseStrokeWidth: ranges != nil ? n.TextStrokeWidth.Px : 0.0F,
        RichBaseStrokeColor: ranges != nil ? n.TextStrokeColor : Color.Transparent,
        RichBaseShadows: ranges != nil ? n.TextShadows : nil,
        RichRootFontSize: rootSize,
        Rich: rich,
      }
      var intervalMin = 0.0F
      var intervalMax = Single.PositiveInfinity
      var splitWordMin = -1.0F
      let wrappedLines = List[ParagraphWrappedLine]()
      for i in 0 ... analysis.ParagraphCount {
        let paragraph = analysis.Paragraph(i)
        if lineLimitReached(result, n) {
          result.Clamped = true
          break
        }
        using let shapedParagraph = ShapedParagraph.Build(paragraph, baseStyle, ranges, n)
        if paragraph.Text == "" {
          let line = if let rich = result.Rich {
            let l = shapedParagraph.MaterializeRichLine(n, 0, 0, baseStyle, out var richLine)
            rich.Lines.Add(richLine)
            l
          } else {
            shapedParagraph.MaterializePlainLine(0, 0, 0.0F)
          }
          result.Lines.Add(line)
        } else if n.TextWrap == TextWrap.NoWrap {
          let line = buildNoWrapLine(n, shapedParagraph, baseStyle, ranges, maxWidth,
            out var widthLimit, out var noWrapMin, out var noWrapRich)
          if let rich = result.Rich { rich.Lines.Add(noWrapRich!!) }
          result.Lines.Add(line)
          if result.Lines.Count == 1 {
            result.MinWidth = noWrapMin
            result.WidthLimit = widthLimit
            intervalMin = noWrapMin
            intervalMax = widthLimit
          } else {
            let curMin = result.MinWidth
            if noWrapMin > curMin { result.MinWidth = noWrapMin }
            result.WidthLimit = MathF.Min(result.WidthLimit, widthLimit)
            intervalMin = MathF.Max(intervalMin, noWrapMin)
            intervalMax = MathF.Min(intervalMax, widthLimit)
          }
        } else {
          shapedParagraph.WrapLines(maxWidth, wrappedLines, out var pMin, out var pMax)
          if pMin > intervalMin { intervalMin = pMin }
          if pMax < intervalMax { intervalMax = pMax }
          let totalParagraphLines = wrappedLines.Count
          var wIdx int32 = 0
          while wIdx < totalParagraphLines {
            let slice = wrappedLines[wIdx]
            let line = if let rich = result.Rich {
              let l = shapedParagraph.MaterializeRichLine(n, slice.Start, slice.End, baseStyle, out var richLine)
              rich.Lines.Add(richLine)
              l
            } else {
              shapedParagraph.MaterializePlainLine(slice.Start, slice.End,
                shapedParagraph.MeasureSlice(slice.Start, slice.End))
            }
            result.Lines.Add(line)
            if !line.EndsWithBreak && wIdx + 1 < totalParagraphLines {
              let pMinWord = shapedParagraph.ComputeMinContentWidth()
              if pMinWord > splitWordMin { splitWordMin = pMinWord }
            }
            wIdx++
            if lineLimitReached(result, n) && wIdx < totalParagraphLines {
              result.Clamped = true
              break
            }
          }
        }
        if result.Clamped { break }
        if i + 1 < analysis.ParagraphCount && lineLimitReached(result, n) {
          result.Clamped = true
          break
        }
      }
      if result.Clamped && n.TextTrimming == TextTrimming.Ellipsis && result.Lines.Count > 0 {
        let last = result.Lines.Count - 1
        let prior = result.Lines[last]
        let elided = ellipsizeClampedLine(n, prior, maxWidth, prior.DisplayStart)
        result.Lines[last] = elided
        if elided.Content != prior.Content {
          if let retained = result.Rich {
            let priorRich = retained.Lines[last]
            disposeRichLine(priorRich)
            retained.Lines[last] = makeRichLine(n, elided, priorRich.DisplayStart)
            elided.Width = retained.Lines[last].Width
          }
        }
        intervalMin = maxWidth
        intervalMax = maxWidth < 0.0F ? Single.PositiveInfinity : MathF.BitIncrement(maxWidth)
      }
      if intervalMax < intervalMin { intervalMax = intervalMin }
      result.CacheMinWidth = intervalMin
      result.CacheMaxWidth = intervalMax
      if splitWordMin >= 0.0F { result.MinWidth = splitWordMin }
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
      result.EstimatedBytes = estimateLayoutBytes(result)
      return result
    }

    private func buildNoWrapLine(n Node, shapedParagraph ShapedParagraph, baseStyle TextResolvedStyle,
      ranges [] ? TextStyleRange, maxWidth float32, out widthLimit float32,
      out minWidth float32, out richLine TextRichLine?) TextLine {
        let text = shapedParagraph.Text
        let start = shapedParagraph.Paragraph.Start
        widthLimit = Single.PositiveInfinity
        richLine = nil
        if ranges == nil {
          let whole = if n.TextTrimming == TextTrimming.Ellipsis && maxWidth >= 0.0F {
            shape(n, shapedParagraph.Paragraph, 0, text.Length)
          } else {
            shapedParagraph.MaterializePlainLine(0, text.Length, shapedParagraph.TotalWidth)
          }
          if n.TextTrimming != TextTrimming.Ellipsis || maxWidth < 0.0F || whole.Width <= maxWidth {
            minWidth = whole.Width
            return whole
          }
          let direction = TextShaping.BaseDirection(text, int32(n.Direction))
          let display = TextShaping.Ellipsize(text, n.FontFamily, fontSize(n), int32(n.FontWeight),
            n.FontStyle == FontStyle.Italic, letterSpacing(n), direction, maxWidth, out var limit,
            n.Language, whole.Shape)
          let logicalWidth = whole.Width
          whole.Shape?.Dispose()
          let shaped = TextShaping.Shape(display, n.FontFamily, fontSize(n), int32(n.FontWeight),
            n.FontStyle == FontStyle.Italic, letterSpacing(n), direction, n.Language)
          widthLimit = MathF.Min(limit, logicalWidth)
          minWidth = display == text ? logicalWidth : maxWidth
          let displayEnd = start + text.Length
          let visibleEnd = display == text ? displayEnd : start + display.Length - 1
          return TextLine{
            Content: display, Shape: shaped, Width: logicalWidth,
            WidthLimit: widthLimit, DisplayStart: start, DisplayEnd: displayEnd,
            VisibleEnd: visibleEnd, RightToLeft: shaped.RightToLeft,
          }
        }
        var fullRich TextRichLine
        let whole = shapedParagraph.MaterializeRichLine(n, 0, text.Length, baseStyle, out fullRich)
        if n.TextTrimming != TextTrimming.Ellipsis || maxWidth < 0.0F || fullRich.Width <= maxWidth {
          richLine = fullRich
          minWidth = fullRich.Width
          return whole
        }
        disposeRichLine(fullRich)
        let dummyShape = TextShaping.ShapeLine(text, 0, text.Length, n.FontFamily, fontSize(n),
          int32(n.FontWeight), n.FontStyle == FontStyle.Italic, letterSpacing(n),
          int32(n.Direction), shapedParagraph.Paragraph.Resolution, n.Language)
        let elidedLine = ellipsizeRichLine(n, TextLine{
          Content: text, Shape: dummyShape, Width: whole.Width,
          DisplayStart: start, DisplayEnd: start + text.Length, VisibleEnd: start + text.Length,
          RightToLeft: whole.RightToLeft,
        }, start, maxWidth)
        let builtRich = makeRichLine(n, elidedLine, start)
        elidedLine.Shape?.Dispose()
        richLine = builtRich
        minWidth = elidedLine.Content == text ? builtRich.Width : maxWidth
        widthLimit = maxWidth
        return TextLine{
          Content: elidedLine.Content, Shape: nil, Width: MathF.Max(whole.Width, builtRich.Width),
          WidthLimit: maxWidth, DisplayStart: start, DisplayEnd: start + text.Length,
          VisibleEnd: elidedLine.Content == text ? start + text.Length : start + elidedLine.Content.Length - 1,
          RightToLeft: whole.RightToLeft,
        }
      }

    internal func ComputeLazyMinWidth(layout TextLayout) float32 {
      var maxWordWidth = 0.0F
      var currentWordWidth = 0.0F
      var prevLineEnd = -1
      var prevEndedWithBreak = true
      var prevEndedWithSpace = false
      let spacing = layout.LetterSpacing
      for i in 0 ... layout.Lines.Count {
        let line = layout.Lines[i]
        let text = line.Content
        let sameParagraph = i > 0 && line.DisplayStart == prevLineEnd
        if !sameParagraph || prevEndedWithBreak {
          if currentWordWidth > maxWordWidth { maxWordWidth = currentWordWidth }
          currentWordWidth = 0.0F
        }
        if text.Length == 0 {
          prevLineEnd = line.DisplayEnd
          prevEndedWithBreak = true
          prevEndedWithSpace = false
          continue
        }
        let len = text.Length
        let breakFlags = [len + 1]uint8
        LineBreakOpportunities.FillFlags(text, breakFlags, uint8(1))
        // Collect per-cluster widths along the line without any HarfBuzz calls
        let runWidths = [len + 1]float32
        var firstCluster = true
        if let shaped = line.Shape {
          accumulateShapeWidths(shaped, runWidths, spacing, ref firstCluster)
        } else if let rich = layout.Rich {
          for paintRun in rich.Lines[i].Runs {
            if let rShape = paintRun.Shape {
              let offset = paintRun.DisplayStart - line.DisplayStart
              accumulatePaintRunWidths(rShape, offset, runWidths, paintRun.Style.LetterSpacing, ref firstCluster)
            }
          }
        }
        let gStarts = UnicodeGraphemes.Starts(text)
        var wordStart int32 = 0
        for gIdx in 1 ... gStarts.Length + 1 {
          let idx = gIdx < gStarts.Length ? gStarts[gIdx] : len
          let isLineEnd = idx == len
          let breakAllowed = isLineEnd ? line.EndsWithBreak : (breakFlags[idx] & uint8(1)) != uint8(0)
          if breakAllowed || isLineEnd {
            let prevG = gStarts[gIdx - 1]
            let trimmed = isWhitespace(text[idx - 1])
            let end = trimmed ? prevG : idx
            if end > wordStart {
              var segmentWidth = 0.0F
              for u in wordStart ... end { segmentWidth = segmentWidth + runWidths[u] }
              if trimmed && spacing != 0.0F { segmentWidth = segmentWidth - spacing }
              if segmentWidth < 0.0F { segmentWidth = 0.0F }
              if !sameParagraph || wordStart > 0 || prevEndedWithBreak {
                currentWordWidth = segmentWidth
              } else {
                currentWordWidth = currentWordWidth + segmentWidth
              }
              if currentWordWidth > maxWordWidth { maxWordWidth = currentWordWidth }
            }
            if breakAllowed && !isLineEnd {
              currentWordWidth = 0.0F
            }
            wordStart = idx
          }
        }
        prevLineEnd = line.DisplayEnd
        prevEndedWithBreak = line.EndsWithBreak
        prevEndedWithSpace = len > 0 && isWhitespace(text[len - 1])
      }
      if currentWordWidth > maxWordWidth { maxWordWidth = currentWordWidth }
      return maxWordWidth
    }

    private func accumulateShapeWidths(shaped ShapedText, clusterWidthAt []float32,
      letterSpacing float32, ref firstCluster bool) {
        for run in shaped.Runs {
          accumulateRunAdvances(run, run.LogicalStart, clusterWidthAt, letterSpacing, ref firstCluster)
        }
      }

    private func accumulatePaintRunWidths(shape ShapedText, baseOffset int32,
      clusterWidthAt []float32, letterSpacing float32, ref firstCluster bool) {
        for run in shape.Runs {
          accumulateRunAdvances(run, baseOffset + run.LogicalStart, clusterWidthAt, letterSpacing, ref firstCluster)
        }
      }

    private func accumulateRunAdvances(run ShapedRun, offset int32, clusterWidthAt []float32,
      letterSpacing float32, ref firstCluster bool) {
        let count = run.Glyphs.Length
        if count == 0 { return }
        // Advance per glyph: Points differences or VisualSpan bounds
        let ordered = [count]int32
        for i in 0 ... count { ordered[i] = i }
        let total = MathF.Abs(run.VisualEnd - run.VisualStart)
        if !run.RightToLeft {
          let prevX = MathF.Min(run.VisualStart, run.VisualEnd)
          var lastCluster int32 = -1
          var g int32 = 0
          while g < count {
            let cStart = int32(run.Clusters[g])
            let target = offset + cStart
            let penStart = if g == 0 { prevX } else { run.Points[g].X }
            var nextG = g + 1
            while nextG < count && int32(run.Clusters[nextG]) == cStart { nextG++ }
            let penEnd = if nextG < count { run.Points[nextG].X } else { prevX + total }
            let w = penEnd > penStart ? penEnd - penStart : 0.0F
            if target >= 0 && target < clusterWidthAt.Length {
              clusterWidthAt[target] = clusterWidthAt[target] + w
            }
            lastCluster = cStart
            firstCluster = false
            g = nextG
          }
        } else {
          let spanPerCluster = if run.Text.Length > 0 { total / float32(run.Text.Length) } else { total }
          for g in 0 ... count {
            let target = offset + int32(run.Clusters[g])
            if target >= 0 && target < clusterWidthAt.Length {
              clusterWidthAt[target] = clusterWidthAt[target] + spanPerCluster
            }
          }
        }
      }

    internal func lineLimitReached(result TextLayout, n Node) bool -> n.TextMaxLines > 0 && result.Lines.Count >= n.TextMaxLines

    internal func shape(n Node, paragraph TextParagraphAnalysis, start int32,
      end int32) TextLine{
        let shaped = TextAnalyses.ShapeLine(paragraph, start, end)
        return TextLine{
          Content: paragraph.Text.Substring(start, end - start),
          Shape: shaped,
          Width: shaped.Width,
          DisplayStart: paragraph.Start + start,
          DisplayEnd: paragraph.Start + end,
          VisibleEnd: paragraph.Start + end,
          RightToLeft: shaped.RightToLeft,
        }
      }

    internal func shapeNoWrap(n Node, paragraph TextParagraphAnalysis,
      maxWidth float32) TextLine{
        let baseStyle = TextResolvedStyles.Base(n)
        let ranges = PassiveTextPresentations.Read(n)
        using let shapedParagraph = ShapedParagraph.Build(paragraph, baseStyle, ranges, n)
        let line = buildNoWrapLine(n, shapedParagraph, baseStyle, ranges, maxWidth,
          out _, out _, out var noWrapRich)
        if let rich = noWrapRich { disposeRichLine(rich) }
        return line
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
      let ascent = baseMetrics.Ascent
      let descent = baseMetrics.Descent
      let height = base.FontSize * base.LineHeight
      let paintTop = ascent
      let paintBottom = textDecorationBottom(base.Decoration, ascent, descent)
      let result = TextRichLine(displayStart, line.DisplayWidth, ascent, descent, height)
      if line.Content.Length == 0 { return result }
      let rtl = line.RightToLeft
      let tempParagraph = TextParagraphAnalysis(displayStart, displayStart + line.Content.Length,
        line.Content, TextShaping.ResolveParagraph(line.Content, int32(base.Direction)),
        base.FontFamily, base.FontSize, base.FontWeight, base.FontStyle == FontStyle.Italic,
        base.LetterSpacing, base.Direction, base.Language)
      using let sp = ShapedParagraph.Build(tempParagraph, base, ranges, n)
      let built = sp.MaterializeRichLine(n, 0, line.Content.Length, base, out var builtRich)
      return builtRich
    }

    private func disposeRichLine(line TextRichLine) {
      for run in line.Runs { run.Shape?.Dispose() }
    }

    internal func ellipsizeClampedLine(n Node, line TextLine, maxWidth float32,
      displayStart int32 = 0) TextLine {
      if line.Content.Length > 0 && line.Content[line.Content.Length - 1] == 8230 {
        return line
      }
      if PassiveTextPresentations.Read(n) != nil {
        return ellipsizeRichLine(n, line, displayStart, maxWidth)
      }
      let direction = if let existing = line.Shape {
        existing.RightToLeft ? 2 : 1
      } else {
        TextShaping.BaseDirection(line.Content, int32(n.Direction))
      }
      let display = maxWidth < 0.0F
      ? line.Content + "\u2026" : TextShaping.Ellipsize(line.Content, n.FontFamily, fontSize(n), int32(n.FontWeight),
        n.FontStyle == FontStyle.Italic, letterSpacing(n), direction, maxWidth, out var widthLimit, n.Language, line.Shape)
      line.Shape?.Dispose()
      let shaped = TextShaping.Shape(display, n.FontFamily, fontSize(n), int32(n.FontWeight),
        n.FontStyle == FontStyle.Italic, letterSpacing(n), direction, n.Language)
      let visibleEnd = display == line.Content ? line.DisplayEnd : displayStart + display.Length - 1
      return TextLine{
        Content: display,
        Shape: shaped,
        Width: shaped.Width > line.Width ? shaped.Width : line.Width,
        DisplayStart: displayStart,
        DisplayEnd: line.DisplayEnd,
        VisibleEnd: visibleEnd,
        RightToLeft: shaped.RightToLeft,
      }
    }

    private func ellipsizeRichLine(n Node, line TextLine, displayStart int32,
      maxWidth float32) TextLine {
      let elements = UnicodeGraphemes.Starts(line.Content)
      let direction = if let shape = line.Shape { shape.RightToLeft ? 2 : 1 }
        else { line.RightToLeft ? 2 : TextShaping.BaseDirection(line.Content, int32(n.Direction)) }
      var low = maxWidth < 0.0F ? elements.Length : 0
      var high = elements.Length
      while low < high {
        let middle = low + (high - low + 1) / 2
        let end = middle < elements.Length ? elements[middle] : line.Content.Length
        let content = line.Content.Substring(0, end) + "\u2026"
        let candidate = makeRichLine(n, TextLine{Content: content, RightToLeft: direction == 2}, displayStart)
        let fits = candidate.Width <= maxWidth
        disposeRichLine(candidate)
        if fits { low = middle } else { high = middle - 1 }
      }
      let end = low < elements.Length ? elements[low] : line.Content.Length
      let content = line.Content.Substring(0, end) + "\u2026"
      line.Shape?.Dispose()
      return TextLine{
        Content: content,
        Shape: nil,
        Width: line.Width,
        DisplayStart: displayStart,
        DisplayEnd: line.DisplayEnd,
        VisibleEnd: displayStart + content.Length - 1,
        RightToLeft: direction == 2,
      }
    }

    internal func matches(layout TextLayout, n Node, maxWidth float32,
      richRanges [] ? TextStyleRange = nil, richSig uint64 = 0uL,
      rootSize float32 = 0.0F) bool {
      if layout.Content != n.Content || layout.Language != n.Language || layout.FontFamily != n.FontFamily
        || layout.FontRegistryGeneration != FontRegistry.Generation
        || layout.FontSize != fontSize(n) || layout.FontWeight != n.FontWeight
        || layout.Policy != textPolicy(n) || layout.LetterSpacing != letterSpacing(n)
        || layout.TextMaxLines != n.TextMaxLines || layout.LineHeight != n.LineHeight {
          return false
        }
      let activeRanges = richRanges ?? PassiveTextPresentations.Read(n)
      if activeRanges == nil {
        if layout.Rich != nil { return false }
      } else {
        if layout.Rich == nil { return false }
        let sig = richSig != 0uL ? richSig : PassiveTextPresentations.Signature(n)
        let rSize = rootSize > 0.0F ? rootSize : rootFontSize(n)
        if layout.RichSignature != sig || layout.RichBaseColor != n.Color
          || layout.RichBaseDecoration != n.TextDecoration
          || layout.RichBaseStrokeWidth != n.TextStrokeWidth.Px
          || layout.RichBaseStrokeColor != n.TextStrokeColor
          || layout.RichRootFontSize != rSize
          || !sameBoxShadows(layout.RichBaseShadows, n.TextShadows)
          || !PassiveTextPresentations.SameDisplayRanges(layout.RichRanges, activeRanges) {
            return false
          }
      }
      if layout.MaxWidth == maxWidth { return true }
      if n.TextWrap == TextWrap.NoWrap {
        if n.TextTrimming != TextTrimming.Ellipsis { return true }
        return !layout.Clamped && layout.Rich == nil
          && maxWidth >= layout.MinWidth && maxWidth < layout.WidthLimit
      }
      if maxWidth < 0.0F {
        return !layout.Clamped && layout.CacheMaxWidth == Single.PositiveInfinity
      }
      return maxWidth >= layout.CacheMinWidth && maxWidth < layout.CacheMaxWidth
    }

    private func rootFontSize(n Node) float32 {
      var root = n
      while let parent = root.Parent { root = parent }
      return root.FontSize.Px * n.TextScaleFactor
    }

    private func estimateLayoutBytes(layout TextLayout) int64 {
      var total = 256L + int64(layout.Content.Length) * 2L + int64(layout.Lines.Count) * 96L
      for line in layout.Lines {
        total = total + int64(line.Content.Length) * 2L
        if let shaped = line.Shape {
          total = total + estimateShapedTextBytes(shaped)
        }
      }
      if let rich = layout.Rich {
        for rLine in rich.Lines {
          total = total + 64L + int64(rLine.Runs.Count) * 80L
          for run in rLine.Runs {
            if let rShape = run.Shape {
              total = total + estimateShapedTextBytes(rShape)
            }
          }
        }
      }
      return total
    }

    private func estimateShapedTextBytes(shaped ShapedText) int64 {
      var total = 64L + int64(shaped.Runs.Count) * 96L
      for run in shaped.Runs {
        total = total + int64(run.Glyphs.Length) * 16L
      }
      return total
    }

    internal func textPolicy(n Node) int32 -> int32(n.FontStyle) | (int32(n.TextWrap) << 2) | (int32(n.TextTrimming) << 3)
    | (int32(n.TextTransform) << 4) | (int32(n.Direction) << 7)

    internal func transformText(content string, transform TextTransform) string -> switch transform {
      case TextTransform.Uppercase: content.ToUpperInvariant()
      case TextTransform.Lowercase: content.ToLowerInvariant()
      default: content
    }

    internal func fontSize(n Node) float32 -> n.FontSize.Px * n.TextScaleFactor

    internal func letterSpacing(n Node) float32 -> n.LetterSpacing.Px

    internal func resolvedLineHeight(n Node) float32 -> fontSize(n) * float32(n.LineHeight)

    internal func isWhitespace(c char) bool -> c == 9 || c == 32

    internal func isNewline(c char) bool -> c == 10 || c == 13
  }
}
