package Goo

import Facebook.Yoga
import System
import System.Collections.Generic

internal partial class TextEditorLayouts {
  shared {
    private let projectionSortKey Func[TextEditorProjection, float64] =
    (value TextEditorProjection) -> float64(value.Range.Start)
    private let styleSortKey Func[TextEditorPresentationStyle, float64] =
    (value TextEditorPresentationStyle) -> float64(value.Range.Start)
    private let slotSortKey Func[TextEditorSlotGeometry, float64] =
    (value TextEditorSlotGeometry) -> float64(value.NaturalLeft)
    private let caretSortKey Func[TextEditorVisualCaret, float64] =
    (value TextEditorVisualCaret) -> float64(value.X)
    private let orderSortKey Func[TextEditorPresentationStyle, float64] =
    (value TextEditorPresentationStyle) -> float64(value.Order)

    private func sortEditorItems[T any](values List[T], key Func[T, float64]) {
      for var i = 1; i < values.Count; i++ {
        let value = values[i]
        let valueKey = key(value)
        var j = i
        while j > 0 && key(values[j - 1]) > valueKey {
          values[j] = values[j - 1]
          j--
        }
        values[j] = value
      }
    }

    internal func ExpandAtomicRange(n Node, textRange TextRange) TextRange {
      if textRange.Length == 0 { return textRange }
      guard let state = n.EditorState else { return textRange }
      var start = textRange.Start
      var end = textRange.Start + textRange.Length
      var expanded = true
      while expanded {
        expanded = false
        for layerIndex in 0 ... state.LayerCount {
          for projection in state.Layer(layerIndex).ReadProjections() {
            let projectionEnd = projection.Range.Start + projection.Range.Length
            if start >= projectionEnd || projection.Range.Start >= end { continue }
            if projection.Range.Start < start {
              start = projection.Range.Start
              expanded = true
            }
            if projectionEnd > end {
              end = projectionEnd
              expanded = true
            }
          }
        }
      }
      return TextRange{ Start: start, Length: end - start }
    }

    internal func For(n Node, width float32, height float32) TextEditorVisualLayout {
      guard let state = n.EditorState else {
        throw InvalidOperationException("Text editor node has no render state")
      }
      let revision = editorLayerRevision(state)
      if let cached = state.Layout {
        if !state.Dirty && cached.Version == state.Document.Version && cached.LayerRevision == revision
          && cached.ConstraintWidth == width && cached.HeightConstraint == height{
            return cached
          }
      }
      let fingerprint = editorFontFingerprint(n)
      let snapshot = state.Document.Snapshot()
      let layout = build(n, state, snapshot, width, height, revision, fingerprint)
      state.Layout = layout
      state.Dirty = false
      if n.HasElementHandle {
        warmGeometry(layout)
      }
      return layout
    }

    private func warmGeometry(layout TextEditorVisualLayout) {
      for line in layout.Lines {
        line.Shape?.PrepareGeometry()
        for run in line.Runs {
          run.Shape?.PrepareGeometry()
        }
      }
    }

    internal func SlotChildDirty(yoga Facebook.Yoga.Node) {
      guard let child = YGNodeAPI.YGNodeGetContext(yoga) as Node,
      let parent = child.Parent,
      let state = parent.EditorState else {
        return
      }
      state.ClearParagraphs()
      Invalidate(parent)
    }

    internal func Invalidate(n Node) {
      if let state = n.EditorState {
        state.Dirty = true
        state.Layout = nil
      }
      if !(n.Width.Unit == LengthUnit.Px && n.Height.Unit == LengthUnit.Px) {
        if let yoga = n.Yoga { YGNodeAPI.YGNodeMarkDirty(yoga) }
      }
    }

    internal func disposeParagraph(value TextEditorParagraphLayout) {
      disposeLines(value.Lines)
    }

    private func disposeLines(lines List[TextEditorVisualLine]) {
      for line in lines {
        line.Shape?.Dispose()
        for run in line.Runs { run.Shape?.Dispose() }
      }
    }

    internal func Measure(yoga Facebook.Yoga.Node, width float32, widthMode MeasureMode,
      height float32, heightMode MeasureMode) YGSize{
        let n = nodeFromYoga(yoga)
        let constraint = widthMode == MeasureMode.Undefined ? -1.0F : width
        let heightConstraint = heightMode == MeasureMode.Undefined ? -1.0F : height
        let layout = For(n, constraint, heightConstraint)
        return TextLayouts.clampMeasuredSize(layout.Width, layout.Height, width, widthMode, height, heightMode)
      }

    internal func CaretRect(n Node, position TextPosition) Rect {
      let width = BoxGeometry.ContentWidth(n)
      let height = BoxGeometry.ContentHeight(n)
      let layout = For(n, width, height)
      return CaretRect(n, layout, position)
    }

    internal func TryCaretRectForGeometry(n Node, position TextPosition,
      out rect Rect) bool{
        rect = Rect{}
        if position.Offset < 0 || !validTextAffinity(position.Affinity) { return false }
        guard let state = n.EditorState else { return false }
        if position.Offset > state.Document.Length { return false }
        guard let layout = CurrentForGeometry(n) else { return false }
        guard let line = LineForPosition(layout, position) else { return false }
        if position.Offset < line.SourceStart || position.Offset > line.SourceEnd { return false }
        rect = CaretRect(n, layout, position)
        return true
      }

    private func CaretRect(n Node, layout TextEditorVisualLayout,
      position TextPosition) Rect{
        let width = BoxGeometry.ContentWidth(n)
        let contentLeft = BoxGeometry.ContentLeft(n) - n.Rect.X
        let contentTop = BoxGeometry.ContentTop(n) - n.Rect.Y
        let scroll = if let state = n.EditorState { float32(state.Controller.ScrollTargetY) } else { 0.0F }
        let line = LineForPosition(layout, position)
        guard let visual = line else {
          return Rect{ X: contentLeft, Y: contentTop, W: 1.5F, H: layout.LineHeight }
        }
        let index = DisplayOffsetForSource(visual.Paragraph, position.Offset, position.Affinity)
        -visual.DisplayStart
        let x = CaretX(visual, index, position.Affinity)
        let aligned = editorLineOffset(n, visual, width)
        let scrollX = if let state = n.EditorState { float32(state.Controller.ScrollTargetX) } else { 0.0F }
        return Rect{ X: contentLeft + aligned + x - scrollX, Y: contentTop + visual.Top - scroll,
          W: 1.5F, H: visual.Height }
      }

    internal func CompositionCaretRect(n Node, composition TextComposition) Rect {
      if let selected = composition.EffectiveSelection {
        let offset = selected.Active.Offset
        let end = composition.Range.Start + composition.Text.Length
        if offset < composition.Range.Start || offset > end {
          let source = offset <= composition.Range.Start ? offset : offset - composition.Text.Length + composition.Range.Length
          return CaretRect(n, TextPosition{ Offset: source, Affinity: selected.Active.Affinity })
        }
      }
      let width = BoxGeometry.ContentWidth(n)
      let height = BoxGeometry.ContentHeight(n)
      let layout = For(n, width, height)
      let contentLeft = BoxGeometry.ContentLeft(n) - n.Rect.X
      let contentTop = BoxGeometry.ContentTop(n) - n.Rect.Y
      let scrollY = if let state = n.EditorState { float32(state.Controller.ScrollTargetY) } else { 0.0F }
      let scrollX = if let state = n.EditorState { float32(state.Controller.ScrollTargetX) } else { 0.0F }
      var lineIndex int32 = 0
      while lineIndex < layout.Lines.Count {
        let line = layout.Lines[lineIndex]
        var caret int32 = 0
        if !CompositionCaretDisplayIndex(line, composition, out caret) {
          lineIndex = lineIndex + 1
          continue
        }
        if caret == line.DisplayLength && lineIndex + 1 < layout.Lines.Count {
          let next = layout.Lines[lineIndex + 1]
          if next.Paragraph == line.Paragraph && next.DisplayStart == line.DisplayStart + line.DisplayLength {
            lineIndex = lineIndex + 1
            continue
          }
        }
        let x = CaretX(line, caret, TextAffinity.Downstream)
        let aligned = editorLineOffset(n, line, width)
        return Rect{ X: contentLeft + aligned + x - scrollX,
          Y: contentTop + line.Top - scrollY, W: 1.5F, H: line.Height }
      }
      return CaretRect(n, TextPosition{ Offset: composition.Range.Start,
        Affinity: TextAffinity.Downstream })
    }

    private func CompositionCaretDisplayIndex(line TextEditorVisualLine,
      composition TextComposition, out index int32) bool{
        index = 0
        for segment in line.Paragraph.Segments {
          if !segment.Composition || segment.Source.Start != composition.Range.Start
            || segment.Source.Length != composition.Range.Length{ continue }
          let caretOffset = if let selected = composition.EffectiveSelection {
            transformedCompositionOffset(composition.Text,
              selected.Active.Offset - composition.Range.Start, segment.Style.Transform)
          } else { segment.CompositionSelectionStart }
          let absolute = segment.DisplayStart + caretOffset
          if absolute < line.DisplayStart
            || absolute > line.DisplayStart + line.DisplayLength{ return false }
          index = absolute - line.DisplayStart
          return true
        }
        return false
      }

    internal func CompositionDisplayRange(line TextEditorVisualLine,
      composition TextComposition, out start int32, out end int32) bool{
        start = 0
        end = 0
        for segment in line.Paragraph.Segments {
          if !segment.Composition || segment.Source.Start != composition.Range.Start
            || segment.Source.Length != composition.Range.Length{ continue }
          var displayStart = segment.DisplayStart + segment.CompositionSelectionStart
          var displayEnd = segment.DisplayStart + segment.CompositionSelectionEnd
          let segmentEnd = segment.DisplayStart + segment.DisplayLength
          if displayStart < segment.DisplayStart { displayStart = segment.DisplayStart }
          if displayStart > segmentEnd { displayStart = segmentEnd }
          if displayEnd < displayStart { displayEnd = displayStart }
          if displayEnd > segmentEnd { displayEnd = segmentEnd }
          start = displayStart - line.DisplayStart
          end = displayEnd - line.DisplayStart
          if start < 0 { start = 0 }
          if end < 0 { end = 0 }
          if start > line.DisplayLength { start = line.DisplayLength }
          if end > line.DisplayLength { end = line.DisplayLength }
          return true
        }
        return false
      }

    internal func ScrollExtent(n Node) Point {
        let layout = For(n, BoxGeometry.ContentWidth(n), BoxGeometry.ContentHeight(n))
      return Point{
        X: float64(layout.ContentWidth > n.Rect.W ? layout.ContentWidth : n.Rect.W),
        Y: float64(layout.ContentHeight > n.Rect.H ? layout.ContentHeight : n.Rect.H)
        }
    }

    internal func FollowCaret(n Node, position TextPosition) {
      if let state = n.EditorState {
        var current = state.Controller.State()
        let initial = For(n, BoxGeometry.ContentWidth(n), BoxGeometry.ContentHeight(n))
        var visible = false
        for line in initial.Lines {
          if position.Offset >= line.SourceStart && position.Offset <= line.SourceEnd {
            visible = true
            break
          }
        }
        if !visible {
          let snapshot = state.Document.Snapshot()
          let line = snapshot.GetLineIndex(position.Offset)
          let y = verticalOffsetForLine(state, snapshot, line, initial.ConstraintWidth,
            initial.FontFingerprint, initial.LineHeight, initial.Ascent, initial.Descent)
          ScrollState.To(n, float32(current.ScrollTargetX), y, true, false)
          current = state.Controller.State()
        }
        let rect = CaretRect(n, position)
        let left = BoxGeometry.ContentLeft(n) - n.Rect.X
        let top = BoxGeometry.ContentTop(n) - n.Rect.Y
        let right = left + BoxGeometry.ContentWidth(n)
        let bottom = top + BoxGeometry.ContentHeight(n)
        let logicalLeft = rect.X + float32(current.ScrollTargetX)
        let logicalTop = rect.Y + float32(current.ScrollTargetY)
        var x = float32(current.ScrollTargetX)
        var y = float32(current.ScrollTargetY)
        if logicalLeft < x + left { x = logicalLeft - left }
        else if logicalLeft + rect.W > x + right { x = logicalLeft + rect.W - right }
        if logicalTop < y + top { y = logicalTop - top }
        else if logicalTop + rect.H > y + bottom { y = logicalTop + rect.H - bottom }
        ScrollState.To(n, x, y, true, false)
      }
    }

    internal func SlotOrigin(n Node, key string) Rect? {
      let width = BoxGeometry.ContentWidth(n)
      let layout = For(n, width, BoxGeometry.ContentHeight(n))
      let left = BoxGeometry.ContentLeft(n) - n.Rect.X
      let top = BoxGeometry.ContentTop(n) - n.Rect.Y
      let scrollX = if let state = n.EditorState { float32(state.Controller.ScrollTargetX) } else { 0.0F }
      let scrollY = if let state = n.EditorState { float32(state.Controller.ScrollTargetY) } else { 0.0F }
      for line in layout.Lines {
        for slot in line.Slots {
          if slot.Key != key { continue }
          let x = slot.Block ? left : left + editorLineOffset(n, line, width) + slot.X - scrollX
          let y = top + line.Top - scrollY
          let contentHeight = BoxGeometry.ContentHeight(n)
          if x + slot.Width <= left || x >= left + width
            || y + slot.Height <= top || y >= top + contentHeight{ return nil }
          return Rect{ X: x, Y: y, W: slot.Width, H: slot.Height }
        }
      }
      return nil
    }

    internal func HitTest(n Node, localX float32, localY float32) TextPosition {
      let width = BoxGeometry.ContentWidth(n)
      let height = BoxGeometry.ContentHeight(n)
      let layout = For(n, width, height)
      return HitTest(n, layout, localX, localY)
    }

    internal func TryHitTestForGeometry(n Node, localX float32, localY float32,
      out position TextPosition) bool{
        position = TextPosition{}
        guard let layout = CurrentForGeometry(n) else { return false }
        position = HitTest(n, layout, localX, localY)
        return true
      }

    internal func CurrentForGeometry(n Node) TextEditorVisualLayout? {
      guard let state = n.EditorState, let layout = state.Layout else { return nil }
      if state.Dirty || layout.Version != state.Document.Version
        || layout.ConstraintWidth != BoxGeometry.ContentWidth(n)
        || layout.HeightConstraint != BoxGeometry.ContentHeight(n) {
          return nil
        }
      return layout
    }

    internal func PrepareCurrentGeometry(n Node) {
      if let layout = CurrentForGeometry(n) {
        warmGeometry(layout)
      }
    }

    private func validTextAffinity(value TextAffinity) bool -> value == TextAffinity.Upstream || value == TextAffinity.Downstream

    private func HitTest(n Node, layout TextEditorVisualLayout, localX float32,
      localY float32) TextPosition{
        let width = BoxGeometry.ContentWidth(n)
        let contentLeft = BoxGeometry.ContentLeft(n) - n.Rect.X
        let contentTop = BoxGeometry.ContentTop(n) - n.Rect.Y
        let state = n.EditorState!!
        let x = localX - contentLeft + float32(state.Controller.ScrollTargetX)
        let y = localY - contentTop + float32(state.Controller.ScrollTargetY)
        var selected TextEditorVisualLine? = nil
        for i in 0 ... layout.Lines.Count {
          let line = layout.Lines[i]
          if y >= line.Top && y < line.Top + line.Height {
            selected = line
            break
          }
        }
        if selected == nil && layout.Lines.Count > 0 {
          selected = y < layout.Lines[0].Top ? layout.Lines[0] : layout.Lines[layout.Lines.Count - 1]
        }
        guard let line = selected else {
          return TextPosition{ Offset: 0, Affinity: TextAffinity.Downstream }
        }
        let hitX = x - editorLineOffset(n, line, width)
        let hit = HitTest(line, hitX)
        let display = line.DisplayStart + hit.Index
        return TextPosition{ Offset: SourceOffsetForDisplay(line.Paragraph, display,
          TextAffinity(hit.Affinity)), Affinity: TextAffinity(hit.Affinity) }
      }

    internal func MoveVertical(n Node, position TextPosition, desiredX float32,
      delta int32) TextPosition? {
        let layout = For(n, BoxGeometry.ContentWidth(n), BoxGeometry.ContentHeight(n))
        let current = lineIndexForPosition(layout, position)
        if current < 0 || layout.Lines.Count == 0 { return nil }
        var target = current + delta
        if target < 0 { target = 0 }
        if target >= layout.Lines.Count { target = layout.Lines.Count - 1 }
        let line = layout.Lines[target]
        let hit = HitTest(line, desiredX)
        return TextPosition{ Offset: SourceOffsetForDisplay(line.Paragraph,
          line.DisplayStart + hit.Index, TextAffinity(hit.Affinity)),
          Affinity: TextAffinity(hit.Affinity) }
      }

    internal func MoveHorizontal(n Node, position TextPosition, direction int32) TextPosition? {
      let layout = For(n, BoxGeometry.ContentWidth(n), BoxGeometry.ContentHeight(n))
      if layout.Lines.Count == 0 || direction == 0 { return nil }
      let lineIndex = lineIndexForPosition(layout, position)
      if lineIndex < 0 { return nil }
      let candidates = visualCarets(layout.Lines[lineIndex])
      if candidates.Count == 0 { return nil }
      let current = visualCaretIndex(candidates, position)
      let currentX = candidates[current].X
      if direction < 0 {
        for var i = current; i > 0; i-- {
          let candidate = candidates[i - 1]
          if candidate.X < currentX - 0.01F { return candidate.Position }
        }
      } else {
        for i in current + 1 ... candidates.Count {
          let candidate = candidates[i]
          if candidate.X > currentX + 0.01F { return candidate.Position }
        }
      }
      if direction < 0 && lineIndex > 0 {
        let prior = visualCarets(layout.Lines[lineIndex - 1])
        return prior.Count == 0 ? nil : prior[prior.Count - 1].Position
      }
      if direction > 0 && lineIndex + 1 < layout.Lines.Count {
        let next = visualCarets(layout.Lines[lineIndex + 1])
        return next.Count == 0 ? nil : next[0].Position
      }
      return candidates[current].Position
    }

  }
}
