package Goo

import Facebook.Yoga
import System
import System.Collections.Generic

internal partial class TextEditorLayouts {
  shared {
    internal func editorLineOffset(n Node, line TextEditorVisualLine, width float32) float32 {
      let rtl = if let shape = line.Shape { shape.RightToLeft } else { false }
      return TextLayouts.lineOffset(n, line.Width, rtl, width)
    }

    internal func CaretX(line TextEditorVisualLine, index int32, affinity TextAffinity) float32 {
      let value = if let shape = line.Shape { shape.CaretX(index, int32(affinity)) } else { 0.0F }
      let display = line.DisplayStart + index
      for i in 0 ... line.Slots.Count {
        let slot = line.Slots[i]
        let end = slot.DisplayStart + slot.DisplayLength
        if display == slot.DisplayStart { return slot.LogicalStart }
        if display == end { return slot.LogicalEnd }
        if display > slot.DisplayStart && display < end {
          return affinity == TextAffinity.Upstream ? slot.LogicalStart : slot.LogicalEnd
        }
      }
      for i in 0 ... line.Runs.Count {
        let run = line.Runs[i]
        let end = run.DisplayStart + run.DisplayLength
        if display < run.DisplayStart || display > end { continue }
        if let shape = run.Shape {
          return run.X + shape.CaretX(display - run.DisplayStart, int32(affinity))
        }
      }
      return expandedSlotX(line, value)
    }

    private func visualCarets(line TextEditorVisualLine) List[TextEditorVisualCaret] {
      let values = List[TextEditorVisualCaret]()
      let starts = UnicodeGraphemes.Starts(line.Paragraph.Text)
      for i in 0 ... starts.Length + 1 {
        let display = i == starts.Length ? line.Paragraph.Text.Length : starts[i]
        if display < line.DisplayStart || display > line.DisplayStart + line.DisplayLength { continue }
        if atomicDisplayInterior(line.Paragraph, display) { continue }
        let local = display - line.DisplayStart
        for affinityValue in 0 ... 2 {
          let affinity = TextAffinity(affinityValue)
          let position = TextPosition{ Offset: SourceOffsetForDisplay(line.Paragraph, display, affinity),
            Affinity: affinity }
          let x = CaretX(line, local, affinity)
          var duplicate = false
          for value in values {
            if value.X == x && value.Position.Offset == position.Offset
              && value.Position.Affinity == position.Affinity{
                duplicate = true
                break
              }
          }
          if !duplicate { values.Add(TextEditorVisualCaret{ X: x, Position: position }) }
        }
      }
      sortEditorItems(values, caretSortKey)
      return values
    }

    private func atomicDisplayInterior(paragraph TextEditorResolvedParagraph,
      display int32) bool{
        for segment in paragraph.Segments {
          if segment.Atomic && display > segment.DisplayStart
            && display < segment.DisplayStart + segment.DisplayLength{
              return true
            }
        }
        return false
      }

    private func visualCaretIndex(values List[TextEditorVisualCaret], position TextPosition) int32 {
      for i in 0 ... values.Count {
        if values[i].Position.Offset == position.Offset && values[i].Position.Affinity == position.Affinity {
          return i
        }
      }
      var result int32 = 0
      var distance = Single.MaxValue
      for i in 0 ... values.Count {
        let current = values[i]
        if current.Position.Offset != position.Offset { continue }
        let candidate = current.X < 0.0F ? -current.X : current.X
        if candidate < distance {
          distance = candidate
          result = i
        }
      }
      return result
    }

    internal func HitTest(line TextEditorVisualLine, x float32) TextHit {
      var adjusted = x
      for i in 0 ... line.Slots.Count {
        let slot = line.Slots[i]
        if x >= slot.X && x <= slot.X + slot.Width {
          let towardEnd = x - slot.X > slot.Width * 0.5F
          return TextHit{
            Index: slot.DisplayStart - line.DisplayStart
            +(towardEnd ? slot.DisplayLength : 0),
            Affinity: towardEnd ? int32(TextAffinity.Downstream) : int32(TextAffinity.Upstream),
          }
        }
        if x > slot.X + slot.Width {
          adjusted = adjusted - slot.Width + slot.NaturalWidth
        }
      }
      if line.Runs.Count != 0 {
        var nearest = TextHit{}
        var nearestDistance = Single.MaxValue
        for i in 0 ... line.Runs.Count {
          let run = line.Runs[i]
          guard let shape = run.Shape else { continue }
          let local = x - run.X
          let clamped = if local < 0.0F { 0.0F }
          else if local > shape.Width { shape.Width } else { local }
          let distance = local - clamped < 0.0F ? clamped - local : local - clamped
          let hit = shape.HitTest(clamped)
          if distance < nearestDistance {
            nearestDistance = distance
            nearest = TextHit{
              Index: run.DisplayStart - line.DisplayStart + hit.Index,
              Affinity: hit.Affinity,
            }
          }
          if distance == 0.0F { return nearest }
        }
        return nearest
      }
      return if let shape = line.Shape { shape.HitTest(adjusted) } else { TextHit{} }
    }

    internal func CopySelectionRectsForGeometry(line TextEditorVisualLine, start int32,
      end int32, rectOffset int32, destination Span[float32], out required int32) int32{
        required = 0
        if start >= end || rectOffset < 0 { return 0 }
        guard let shape = line.Shape else { return 0 }
        if line.Runs.Count == 0 && line.Slots.Count == 0 {
          required = shape.SelectionRectCount(start, end)
          return shape.CopySelectionRects(start, end, rectOffset, destination)
        }
        return TraverseSelectionRects(line, start, end, rectOffset, destination, nil,
          out required)
      }

    private func TraverseSelectionRects(line TextEditorVisualLine, start int32,
      end int32, rectOffset int32, destination Span[float32], result List[float32]?,
      out required int32) int32{
        guard let shape = line.Shape else {
          required = 0
          return 0
        }
        var cursor TextEditorSelectionCursor
        let values = stackalloc[64]float32
        if line.Runs.Count != 0 {
          let absoluteStart = line.DisplayStart + start
          let absoluteEnd = line.DisplayStart + end
          for i in 0 ... line.Runs.Count {
            let run = line.Runs[i]
            guard let runShape = run.Shape else { continue }
            let runEnd = run.DisplayStart + run.DisplayLength
            let selectedStart = absoluteStart > run.DisplayStart ? absoluteStart : run.DisplayStart
            let selectedEnd = absoluteEnd < runEnd ? absoluteEnd : runEnd
            if selectedEnd <= selectedStart { continue }
            let localStart = selectedStart - run.DisplayStart
            let localEnd = selectedEnd - run.DisplayStart
            let rectCount = runShape.SelectionRectCount(localStart, localEnd)
            var sourceOffset int32 = 0
            while sourceOffset < rectCount {
              let copied = runShape.CopySelectionRects(localStart, localEnd, sourceOffset, values)
              var value int32 = 0
              while value + 1 < copied {
                cursor = appendGeometryRect(cursor, values[value] + run.X,
                  values[value + 1] + run.X, rectOffset, destination, result)
                value = value + 2
              }
              if copied == 0 { break }
              sourceOffset = sourceOffset + copied / 2
            }
          }
        } else {
          let rectCount = shape.SelectionRectCount(start, end)
          var sourceOffset int32 = 0
          while sourceOffset < rectCount {
            let copied = shape.CopySelectionRects(start, end, sourceOffset, values)
            var value int32 = 0
            while value + 1 < copied {
              var left = values[value]
              let right = values[value + 1]
              for i in 0 ... line.Slots.Count {
                let slot = line.Slots[i]
                if slot.NaturalRight <= left || slot.NaturalLeft >= right { continue }
                if left < slot.NaturalLeft {
                  cursor = appendGeometryRect(cursor, expandedSlotX(line, left), slot.X,
                    rectOffset, destination, result)
                }
                left = slot.NaturalRight
              }
              if left < right {
                cursor = appendGeometryRect(cursor, expandedSlotX(line, left),
                  expandedSlotX(line, right), rectOffset, destination, result)
              }
              value = value + 2
            }
            if copied == 0 { break }
            sourceOffset = sourceOffset + copied / 2
          }
        }
        for i in 0 ... line.Slots.Count {
          let slot = line.Slots[i]
          let slotEnd = slot.DisplayStart + slot.DisplayLength - line.DisplayStart
          let slotStart = slot.DisplayStart - line.DisplayStart
          if start < slotEnd && end > slotStart {
            cursor = appendGeometryRect(cursor, slot.X, slot.X + slot.Width, rectOffset,
              destination, result)
          }
        }
        required = cursor.Index
        return cursor.Written
      }

    private func appendGeometryRect(cursor TextEditorSelectionCursor, left float32,
      right float32, rectOffset int32, destination Span[float32], result List[float32]?) TextEditorSelectionCursor{
        var written = cursor.Written
        if cursor.Index >= rectOffset {
          if let values = result {
            values.Add(left)
            values.Add(right)
            written = written + 2
          } else if written + 1 < destination.Length {
            destination[written] = left
            destination[written + 1] = right
            written = written + 2
          }
        }
        return TextEditorSelectionCursor{ Index: cursor.Index + 1, Written: written }
      }

    internal func SelectionRects(line TextEditorVisualLine, start int32,
      end int32) IReadOnlyList[float32]{
        guard let shape = line.Shape else { return []float32{} }
        if line.Slots.Count == 0 && line.Runs.Count == 0 {
          return shape.SelectionRects(start, end)
        }
        let result = line.BeginSelectionRects()
        let empty = stackalloc[0]float32
        var required int32
        TraverseSelectionRects(line, start, end, 0, empty, result, out required)
        return result
      }

    private func expandedSlotX(line TextEditorVisualLine, x float32) float32 {
      var value = x
      for i in 0 ... line.Slots.Count {
        let slot = line.Slots[i]
        if x >= slot.NaturalRight { value = value + slot.Width - slot.NaturalWidth }
      }
      return value
    }

    private func slotWidthCorrection(line TextEditorVisualLine) float32 {
      var result = 0.0F
      for slot in line.Slots { result = result + slot.Width - slot.NaturalWidth }
      return result
    }

    private func MeasureRange(n Node, paragraph TextEditorResolvedParagraph, start int32,
      end int32) float32{
        let baseStyle = paragraph.BaseStyle!!
        using let shape = shapeEditorLine(n, paragraph, start, end, baseStyle)
        var width = shape.Width
        for segment in paragraph.Segments {
          let segmentEnd = segment.DisplayStart + segment.DisplayLength
          let selectedStart = segment.DisplayStart > start ? segment.DisplayStart : start
          let selectedEnd = segmentEnd < end ? segmentEnd : end
          if selectedEnd <= selectedStart { continue }
          var natural = shape.CaretX(selectedEnd - start, int32(TextAffinity.Downstream))
          -shape.CaretX(selectedStart - start, int32(TextAffinity.Downstream))
          if natural < 0.0F { natural = -natural }
          var actual = natural
          if segment.Slot {
            actual = segment.BlockSlot && end - start > 0 ? width : (segment.SlotWidth > 0.0F ? segment.SlotWidth : natural)
          } else if segment.Style != baseStyle {
            using let styled = shapeEditorLine(n, paragraph, selectedStart, selectedEnd,
              segment.Style)
            actual = styled.Width
          }
          width = width + actual - natural
        }
        return width
      }

    private func nextEditorGrapheme(text string, start int32) int32 {
      let starts = UnicodeGraphemes.Starts(text)
      for i in 0 ... starts.Length {
        if starts[i] > start { return starts[i] }
      }
      return text.Length
    }
  }
}

internal func rangesEditorTouch(left TextRange, right TextRange) bool {
  let leftEnd = left.Start + left.Length
  let rightEnd = right.Start + right.Length
  return left.Start <= rightEnd && right.Start <= leftEnd
}

internal func paragraphChanged(paragraph TextRange, changes IReadOnlyList[TextChange]) bool {
  for change in changes {
    if rangesEditorTouch(paragraph, change.Range) { return true }
  }
  return false
}
