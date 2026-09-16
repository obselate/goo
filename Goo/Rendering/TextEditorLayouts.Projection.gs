package Goo

import Facebook.Yoga
import System
import System.Collections.Generic

internal partial class TextEditorLayouts {
  shared {
    private func resolveParagraph(snapshot TextSnapshot, line int32,
      projections List[TextEditorProjection], styles List[TextEditorPresentationStyle], n Node,
      state TextEditorRenderState, fingerprint int32)
    TextEditorResolvedParagraph{
      let source = snapshot.GetLineRange(line)
      let baseStyle = state.BaseStyle(n, fingerprint)
      let result = TextEditorResolvedParagraph{ Source: source, BaseStyle: baseStyle }
      var display = ""
      var cursor = source.Start
      let sourceEnd = source.Start + source.Length
      for projection in projections {
        let end = projection.Range.Start + projection.Range.Length
        let insertion = projection.Composition && projection.Range.Length == 0
        if insertion {
          if projection.Range.Start < source.Start || projection.Range.Start > sourceEnd { continue }
        } else if end <= source.Start || projection.Range.Start >= sourceEnd {
          continue
        }
        let start = projection.Range.Start > cursor ? projection.Range.Start : cursor
        if start > cursor {
          appendSourceSegment(result, ref display, snapshot.GetText(TextRange{ Start: cursor,
            Length: start - cursor }), cursor, styles, baseStyle)
        }
        if projection.Range.Start >= source.Start && (projection.Range.Start < sourceEnd || insertion) {
          let style = editorStyleAt(styles, projection.Range.Start, baseStyle)
          let projectionText = TextLayouts.transformText(projection.Text, style.Transform)
          let displayStart = display.Length
          display = display + projectionText
          var compositionSelectionStart int32 = 0
          var compositionSelectionEnd int32 = 0
          if projection.Composition {
            var selectionStart = projection.CompositionSelectionStart
            if selectionStart < 0 { selectionStart = 0 }
            if selectionStart > projection.Text.Length { selectionStart = projection.Text.Length }
            var selectionEnd = selectionStart + projection.CompositionSelectionLength
            if selectionEnd > projection.Text.Length { selectionEnd = projection.Text.Length }
            if selectionEnd < selectionStart { selectionEnd = selectionStart }
            compositionSelectionStart = transformedCompositionOffset(projection.Text,
              selectionStart, style.Transform)
            compositionSelectionEnd = transformedCompositionOffset(projection.Text,
              selectionEnd, style.Transform)
          }
          result.Segments.Add(TextEditorResolvedSegment(projection.Range,
            displayStart, projectionText.Length, compositionSelectionStart,
            compositionSelectionEnd, projection.Atomic, projection.Composition,
            projection.Slot, projection.BlockSlot, projection.SlotKey,
            projection.SlotWidth, projection.SlotHeight, style))
        }
        if end > cursor { cursor = end }
        if cursor > sourceEnd { cursor = sourceEnd }
      }
      if cursor < sourceEnd {
        appendSourceSegment(result, ref display, snapshot.GetText(TextRange{ Start: cursor,
          Length: sourceEnd - cursor }), cursor, styles, baseStyle)
      }
      result.Text = display
      result.Resolution = state.ParagraphResolution(n, display, fingerprint)
      return result
    }

    private func transformedCompositionOffset(text string, offset int32,
      transform TextTransform) int32-> if transform == TextTransform.None { offset } else { TextLayouts.transformText(text.Substring(0, offset), transform).Length }

    private func appendSourceSegment(result TextEditorResolvedParagraph, ref display string,
      text string, start int32, styles List[TextEditorPresentationStyle], baseStyle TextResolvedStyle) {
        var cursor int32 = 0
        while cursor < text.Length {
          let absolute = start + cursor
          let style = editorStyleAt(styles, absolute, baseStyle)
          var end = text.Length
          let boundary = nextStyleBoundary(styles, absolute, start + text.Length)
          if boundary > absolute { end = boundary - start }
          if end <= cursor { end = cursor + 1 }
          appendTransformedSource(result, ref display, text.Substring(cursor, end - cursor),
            absolute, style)
          cursor = end
        }
      }

    private func appendTransformedSource(result TextEditorResolvedParagraph, ref display string,
      text string, start int32, style TextResolvedStyle) {
        if style.Transform == TextTransform.None {
          appendResolvedSource(result, ref display, text, start, text.Length, style, false)
          return
        }
        let starts = UnicodeGraphemes.Starts(text)
        var runStart int32 = 0
        for i in 0 ... starts.Length {
          let clusterStart = starts[i]
          let clusterEnd = i + 1 < starts.Length ? starts[i + 1] : text.Length
          let source = text.Substring(clusterStart, clusterEnd - clusterStart)
          let transformed = TextLayouts.transformText(source, style.Transform)
          if transformed.Length == source.Length { continue }
          if clusterStart > runStart {
            let run = text.Substring(runStart, clusterStart - runStart)
            appendResolvedSource(result, ref display, TextLayouts.transformText(run, style.Transform),
              start + runStart, run.Length, style, false)
          }
          appendResolvedSource(result, ref display, transformed, start + clusterStart,
            source.Length, style, true)
          runStart = clusterEnd
        }
        if runStart < text.Length {
          let run = text.Substring(runStart)
          appendResolvedSource(result, ref display, TextLayouts.transformText(run, style.Transform),
            start + runStart, run.Length, style, false)
        }
      }

    private func appendResolvedSource(result TextEditorResolvedParagraph, ref display string,
      text string, sourceStart int32, sourceLength int32, style TextResolvedStyle,
      atomic bool) {
        let displayStart = display.Length
        display = display + text
        result.Segments.Add(TextEditorResolvedSegment(
          TextRange{ Start: sourceStart, Length: sourceLength },
          displayStart, text.Length, atomic, style))
      }

    private func editorProjections(state TextEditorRenderState, width float32,
      height float32) List[TextEditorProjection]{
        let values = state.BeginProjections()
        for layerIndex in 0 ... state.LayerCount {
          let layer = state.Layer(layerIndex)
          for projection in layer.ReadProjections() {
            let slot = projection.Kind == TextProjectionKind.InlineSlot
              || projection.Kind == TextProjectionKind.BlockSlot
            let key = textEditorSlotKey(layer, projection)
            let size = slot ? state.SlotSize(key, width) : Rect{}
            values.Add(TextEditorProjection{
              Range: projection.Range,
              Text: projection.Kind == TextProjectionKind.Replacement ? projection.Text : (slot ? "\uFFFC" : ""),
              Atomic: true,
              Slot: slot,
              BlockSlot: projection.Kind == TextProjectionKind.BlockSlot,
              SlotKey: key,
              SlotWidth: size.W,
              SlotHeight: size.H,
            })
          }
        }
        if let composition = state.Controller.Composition {
          values.Add(TextEditorProjection{ Range: composition.Range, Text: composition.Text,
            Atomic: true, Composition: true,
            CompositionSelectionStart: composition.SelectionStart,
            CompositionSelectionLength: composition.SelectionLength })
        }
        sortEditorItems(values, projectionSortKey)
        return values
      }

    private func editorStyles(state TextEditorRenderState) List[TextEditorPresentationStyle] {
      let values = state.BeginStyles()
      var order int32 = 0
      for layerIndex in 0 ... state.LayerCount {
        let layer = state.Layer(layerIndex)
        for span in layer.ReadStyleSpans() {
          values.Add(TextEditorPresentationStyle{ Range: span.Range,
            Declaration: span.Style, Order: order })
          order++
        }
      }
      sortEditorItems(values, styleSortKey)
      var maximum = Int32.MinValue
      for value in values {
        let end = value.Range.Start + value.Range.Length
        if end > maximum { maximum = end }
        value.PrefixMaxEnd = maximum
      }
      return values
    }

    private func filterParagraphProjections(values List[TextEditorProjection],
      source TextRange, result List[TextEditorProjection]) {
        var low int32 = 0
        var high = values.Count
        while low < high {
          let middle = low + (high - low) / 2
          if values[middle].Range.Start < source.Start { low = middle + 1 }
          else { high = middle }
        }
        while low > 0 {
          let prior = values[low - 1]
          if prior.Range.Start + prior.Range.Length <= source.Start { break }
          low--
        }
        let sourceEnd = source.Start + source.Length
        for i in low ... values.Count {
          let value = values[i]
          if value.Range.Start > sourceEnd { break }
          let end = value.Range.Start + value.Range.Length
          let insertion = value.Composition && value.Range.Length == 0
          if insertion {
            if value.Range.Start >= source.Start && value.Range.Start <= sourceEnd { result.Add(value) }
          } else if end > source.Start && value.Range.Start < sourceEnd {
            result.Add(value)
          }
        }
      }

    private func filterParagraphStyles(values List[TextEditorPresentationStyle],
      source TextRange, result List[TextEditorPresentationStyle]) {
        var low int32 = 0
        var high = values.Count
        while low < high {
          let middle = low + (high - low) / 2
          if values[middle].PrefixMaxEnd <= source.Start { low = middle + 1 }
          else { high = middle }
        }
        let sourceEnd = source.Start + source.Length
        for i in low ... values.Count {
          let value = values[i]
          if value.Range.Start > sourceEnd { break }
          if value.Range.Start + value.Range.Length > source.Start { result.Add(value) }
        }
        sortEditorItems(result, orderSortKey)
      }

    private func editorStyleAt(styles List[TextEditorPresentationStyle], offset int32,
      baseStyle TextResolvedStyle) TextResolvedStyle{
        var result = baseStyle
        var overridden = false
        for item in styles {
          if offset < item.Range.Start || offset >= item.Range.Start + item.Range.Length { continue }
          if !overridden {
            result = TextResolvedStyles.Copy(baseStyle)
            overridden = true
          }
          TextResolvedStyles.Apply(result, item.Declaration)
        }
        return result
      }

    private func nextStyleBoundary(styles List[TextEditorPresentationStyle], offset int32,
      limit int32) int32{
        var result = limit
        for item in styles {
          let start = item.Range.Start
          let end = item.Range.Start + item.Range.Length
          if start > offset && start < result { result = start }
          if end > offset && end < result { result = end }
        }
        return result
      }

    internal func DisplayOffsetForSource(paragraph TextEditorResolvedParagraph, source int32,
      affinity TextAffinity) int32{
        for i in 0 ... paragraph.Segments.Count {
          let segment = paragraph.Segments[i]
          let end = segment.Source.Start + segment.Source.Length
          if source < segment.Source.Start || source > end { continue }
          if !segment.Atomic {
            let relative = source - segment.Source.Start
            let length = relative > segment.DisplayLength ? segment.DisplayLength : relative
            return segment.DisplayStart + length
          }
          if segment.Source.Length != 0 {
            if source == segment.Source.Start { return segment.DisplayStart }
            if source == end { return segment.DisplayStart + segment.DisplayLength }
          }
          return affinity == TextAffinity.Upstream ? segment.DisplayStart : segment.DisplayStart + segment.DisplayLength
        }
        return source <= paragraph.Source.Start ? 0 : paragraph.Text.Length
      }

    internal func SourceOffsetForDisplay(paragraph TextEditorResolvedParagraph, display int32,
      affinity TextAffinity) int32{
        for i in 0 ... paragraph.Segments.Count {
          let segment = paragraph.Segments[i]
          let end = segment.DisplayStart + segment.DisplayLength
          if display < segment.DisplayStart || display > end { continue }
          if !segment.Atomic {
            let relative = display - segment.DisplayStart
            let length = relative > segment.Source.Length ? segment.Source.Length : relative
            return segment.Source.Start + length
          }
          if segment.DisplayLength == 0 && display == segment.DisplayStart {
            return affinity == TextAffinity.Upstream ? segment.Source.Start : segment.Source.Start + segment.Source.Length
          }
          if display == segment.DisplayStart { return segment.Source.Start }
          if display == end { return segment.Source.Start + segment.Source.Length }
          return affinity == TextAffinity.Upstream ? segment.Source.Start : segment.Source.Start + segment.Source.Length
        }
        return display <= 0 ? paragraph.Source.Start : paragraph.Source.Start + paragraph.Source.Length
      }

    internal func LineForPosition(layout TextEditorVisualLayout,
      position TextPosition) TextEditorVisualLine? {
        let index = lineIndexForPosition(layout, position)
        return index < 0 ? nil : layout.Lines[index]
      }

    private func lineIndexForPosition(layout TextEditorVisualLayout,
      position TextPosition) int32{
        var fallback = -1
        for i in 0 ... layout.Lines.Count {
          let line = layout.Lines[i]
          if position.Offset < line.SourceStart || position.Offset > line.SourceEnd { continue }
          fallback = i
          if position.Offset > line.SourceStart && position.Offset < line.SourceEnd { return i }
          if position.Offset == line.SourceStart && position.Affinity == TextAffinity.Downstream {
            return i
          }
          if position.Offset == line.SourceEnd && position.Affinity == TextAffinity.Upstream {
            return i
          }
        }
        return if fallback >= 0 { fallback } else { layout.Lines.Count == 0 ? -1 : layout.Lines.Count - 1 }
      }

    private func editorLayerRevision(state TextEditorRenderState) int64 {
      var result int64 = 17
      for i in 0 ... state.LayerCount { result = result * 31 + state.Layer(i).Revision }
      return result
    }

    private func editorFontFingerprint(n Node) int32 {
      var result int32 = 17
      result = result * 31 + n.FontFamily.GetHashCode()
      result = result * 31 + TextLayouts.fontSize(n).GetHashCode()
      result = result * 31 + n.FontWeight.GetHashCode()
      result = result * 31 + int32(n.FontStyle)
      result = result * 31 + TextLayouts.letterSpacing(n).GetHashCode()
      result = result * 31 + n.LineHeight.GetHashCode()
      result = result * 31 + int32(n.Direction)
      result = result * 31 + int32(n.TextWrap)
      result = result * 31 + int32(n.TextTransform)
      result = result * 31 + n.Color.GetHashCode()
      result = result * 31 + int32(n.TextDecoration)
      result = result * 31 + n.TextStrokeWidth.Value.GetHashCode()
      result = result * 31 + int32(n.TextStrokeWidth.Unit)
      result = result * 31 + n.TextStrokeColor.GetHashCode()
      result = result * 31 + (n.TextShadows?.GetHashCode() ?? 0)
      return result
    }

  }
}
