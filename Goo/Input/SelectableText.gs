package Goo

import System

internal class SelectableText {
  shared {
    internal func Set(n Node, anchor int32, caret int32) bool {
      n.Anchor = Math.Clamp(anchor, 0, n.Content.Length)
      n.Caret = Math.Clamp(caret, 0, n.Content.Length)
      n.BumpScenePaintVersion()
      return true
    }

    private func Line(n Node, offset int32) TextRange {
      var start = offset
      var end = offset
      while start > 0 && n.Content[start - 1] != '\n' { start-- }
      while end < n.Content.Length && n.Content[end] != '\n' { end++ }
      return TextRange(start, end - start)
    }

    internal func Pointer(n Node, x float32, y float32, extend bool, clicks int32, origin TextRange?) bool {
      TextGeometryQueries.Prepare(n)
      if !TextGeometryQueries.PositionAt(n, Point{X: float64(x), Y: float64(y)}, TextCoordinateSpace.Element, out var position) { return false }
      n.CaretAffinity = position.Affinity
      if clicks >= 2 {
        let selectedRange = clicks >= 3 ? Line(n, position.Offset) : TextSelectionRanges.Word(n.Content, position.Offset)
        if extend {
          let selected = TextSelectionRanges.Extend(origin ?? TextRange(n.Anchor, 0), selectedRange)
          return Set(n, selected.Anchor.Offset, selected.Active.Offset)
        }
        return Set(n, selectedRange.Start, selectedRange.Start + selectedRange.Length)
      }
      return Set(n, extend ? n.Anchor : position.Offset, position.Offset)
    }

    internal func Execute(n Node, command TextCommand) bool {
      let before = EditState{Text: n.Content, Anchor: n.Anchor, Caret: n.Caret}
      let edit = Edit()
      let extend = command.ExtendSelection
      var after = before
      if command.Kind == TextCommandKind.MoveUp || command.Kind == TextCommandKind.MoveDown
        || command.Kind == TextCommandKind.PageUp || command.Kind == TextCommandKind.PageDown {
        TextGeometryQueries.Prepare(n)
        if !TextGeometryQueries.CaretRect(n, TextPosition{Offset: n.Caret, Affinity: n.CaretAffinity}, TextCoordinateSpace.Element, out var rect) { return false }
        let up = command.Kind == TextCommandKind.MoveUp || command.Kind == TextCommandKind.PageUp
        let page = command.Kind == TextCommandKind.PageUp || command.Kind == TextCommandKind.PageDown
        let delta = page ? float64(n.Rect.H) : rect.Height
        return Pointer(n, float32(rect.X), float32(rect.Y + rect.Height * 0.5 + (up ? -delta : delta)), extend, 1, nil)
      }
      switch command.Kind {
        case TextCommandKind.SelectAll { after = edit.SelectAll(before) }
        case TextCommandKind.MoveWordLeft { after = edit.WordLeft(before, extend) }
        case TextCommandKind.MoveWordRight { after = edit.WordRight(before, extend) }
        case TextCommandKind.MoveLeft { return Move(n, true, extend) }
        case TextCommandKind.MoveRight { return Move(n, false, extend) }
        case TextCommandKind.MoveDocumentStart { after = edit.Home(before, extend) }
        case TextCommandKind.MoveDocumentEnd { after = edit.End(before, extend) }
        case TextCommandKind.MoveLineStart { after.Caret = Line(n, n.Caret).Start }
        case TextCommandKind.MoveLineEnd {
          let line = Line(n, n.Caret)
          after.Caret = line.Start + line.Length
        }
        case TextCommandKind.SelectWord { after = edit.SelectWordAt(before, command.Position?.Offset ?? n.Caret) }
        case TextCommandKind.SelectLine {
          let line = Line(n, command.Position?.Offset ?? n.Caret)
          return Set(n, line.Start, line.Start + line.Length)
        }
        case _ { return false }
      }
      if !extend && command.Kind != TextCommandKind.SelectAll && command.Kind != TextCommandKind.SelectWord { after.Anchor = after.Caret }
      return Set(n, after.Anchor, after.Caret)
    }

    private func Move(n Node, left bool, extend bool) bool {
      if !extend && n.Anchor != n.Caret {
        let offset = left ? Math.Min(n.Anchor, n.Caret) : Math.Max(n.Anchor, n.Caret)
        return Set(n, offset, offset)
      }
      var offset = left ? 0 : n.Content.Length
      for boundary in UnicodeGraphemes.Starts(n.Content) {
        if left && boundary < n.Caret { offset = boundary }
        if !left && boundary > n.Caret {
          offset = boundary
          break
        }
      }
      return Set(n, extend ? n.Anchor : offset, offset)
    }
  }
}
