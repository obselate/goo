package Goo

import System
import System.Collections.Generic

internal partial class TextInput {
  private var entryComposition TextComposition?
  private var entryCompositionBefore EditState

  internal func EditorSnapshot() FocusedEditorSnapshot? {
    guard let n = focused else { return nil }
    if !canReceiveInput(n) { return nil }
    var value = n.Buffer
    var anchor = n.Anchor
    var active = n.Caret
    var composing = entryComposition
    if n.Kind == NodeKind.Editor {
      guard let controller = n.EditorController else { return nil }
      value = controller.Document.GetText()
      anchor = controller.Selection.Anchor.Offset
      active = controller.Selection.Active.Offset
      composing = controller.Composition
      if let current = composing {
        value = value.Substring(0, current.Range.Start) + current.Text
        +value.Substring(current.Range.Start + current.Range.Length)
        anchor = current.Range.Start + current.SelectionStart
        active = anchor + current.SelectionLength
        if let selected = current.EffectiveSelection {
          anchor = selected.Anchor.Offset
          active = selected.Active.Offset
        }
      }
    } else if n.Kind != NodeKind.Entry {
      return nil
    }
    let compositionStart = if let current = composing { current.Range.Start } else { -1 }
    let compositionEnd = if let current = composing { compositionStart + current.Text.Length } else { -1 }
    return FocusedEditorSnapshot{
      FocusId: focusChangeGeneration,
      Text: value,
      SelectionStart: anchor,
      SelectionEnd: active,
      CompositionStart: compositionStart,
      CompositionEnd: compositionEnd,
      IsPassword: n.Kind == NodeKind.Entry && n.Password,
      IsMultiline: n.Kind == NodeKind.Editor,
      IsReadOnly: n.Kind == NodeKind.Editor && n.EditorReadOnly,
      CaretArea: editorCaretArea(n),
    }
  }

  internal func ClearEditorFocus(resolver Resolver) {
    SetFocus(resolver, nil)
  }

  internal func MoveEditorFocus(root Node?, resolver Resolver, forward bool) bool {
    let before = focusChangeGeneration
    focusStep(root, resolver, forward ? 1 : -1)
    return focusChangeGeneration != before
  }

  internal func CommitPlatformText(root Node?, value string) bool {
    if value != "" { return HandleChar(root, value) }
    guard let n = focused else { return false }
    if !canReceiveInput(n) { return false }
    if n.Kind == NodeKind.Editor && !n.EditorReadOnly {
      guard let controller = n.EditorController else { return false }
      let result = controller.CommitComposition(value)
      if result { updateTextInputArea(n) }
      return result
    }
    if n.Kind != NodeKind.Entry { return false }
    if entryComposition != nil { return HandleChar(root, value) }
    let before = editState(n)
    commitEdit(root, n, before, Edit().Insert(before, value))
    return true
  }

  internal func SetEditorSelection(root Node?, start int32, end int32) bool {
    guard let snapshot = EditorSnapshot(), let n = focused else { return false }
    if start < 0 || end < 0 || start > snapshot.Text.Length || end > snapshot.Text.Length {
      return false
    }
    let low = textBoundary(snapshot.Text, Math.Min(start, end), false)
    let high = textBoundary(snapshot.Text, Math.Max(start, end), start != end)
    let anchor = start <= end ? low : high
    let active = start <= end ? high : low
    if snapshot.CompositionStart >= 0 {
      setEffectiveCompositionSelection(n, anchor, active)
      updateTextInputArea(n)
      return true
    }
    if !FinishComposition(root) { return false }
    if n.Kind == NodeKind.Editor {
      guard let controller = n.EditorController else { return false }
      controller.Selection = TextSelection{
        Anchor: TextPosition{ Offset: anchor, Affinity: TextAffinity.Upstream },
        Active: TextPosition{ Offset: active, Affinity: TextAffinity.Downstream },
      }
    } else {
      let before = editState(n)
      commitEdit(root, n, before, EditState{ Text: n.Buffer, Anchor: anchor, Caret: active })
    }
    updateTextInputArea(n)
    return true
  }

  internal func SetEditorCompositionRange(root Node?, start int32, end int32) bool {
    guard let snapshot = EditorSnapshot() else { return false }
    if snapshot.IsReadOnly || start < 0 || end < start || end > snapshot.Text.Length { return false }
    if !FinishComposition(root) { return false }
    if start == end { return true }
    let low = textBoundary(snapshot.Text, start, false)
    let high = textBoundary(snapshot.Text, end, true)
    guard let n = focused else { return false }
    if n.Kind == NodeKind.Editor {
      guard let controller = n.EditorController else { return false }
      let result = controller.SetPlatformCompositionRange(TextRange{ Start: low, Length: high - low })
      if result { updateTextInputArea(n) }
      return result
    }
    let before = editState(n)
    if !SetEditorSelection(root, low, high) { return false }
    if !HandleComposition(root, snapshot.Text.Substring(low, high - low), 0, high - low) {
      SetEditorSelection(root, snapshot.SelectionStart, snapshot.SelectionEnd)
      return false
    }
    entryCompositionBefore = before
    return SetEditorSelection(root, snapshot.SelectionStart, snapshot.SelectionEnd)
  }

  internal func FinishComposition(root Node?) bool {
    guard let n = focused else { return false }
    if n.Kind == NodeKind.Editor {
      guard let controller = n.EditorController else { return false }
      if controller.Composition == nil { return true }
      if n.EditorReadOnly { return false }
      guard let snapshot = EditorSnapshot() else { return false }
      let result = controller.CommitComposition()
      if result { SetEditorSelection(root, snapshot.SelectionStart, snapshot.SelectionEnd) }
      return result
    }
    if n.Kind != NodeKind.Entry { return false }
    guard let current = entryComposition else { return true }
    let before = entryCompositionBefore
    let anchor = n.Anchor
    let active = n.Caret
    cancelEntryComposition(n)
    commitEdit(root, n, before, replaceEntryComposition(before, current, current.Text))
    SetEditorSelection(root, anchor, active)
    return true
  }

  internal func DeleteSurroundingText(root Node?, beforeLength int32, afterLength int32) bool {
    guard let current = EditorSnapshot(), let n = focused else { return false }
    if current.IsReadOnly || beforeLength < 0 || afterLength < 0 { return false }
    let selectionLow = Math.Min(current.SelectionStart, current.SelectionEnd)
    let selectionHigh = Math.Max(current.SelectionStart, current.SelectionEnd)
    let low = current.CompositionStart < 0 ? selectionLow : Math.Min(selectionLow, current.CompositionStart)
    let high = current.CompositionEnd < 0 ? selectionHigh : Math.Max(selectionHigh, current.CompositionEnd)
    let start = beforeLength == 0 ? low : textBoundary(current.Text, low - Math.Min(beforeLength, low), false)
    let end = afterLength == 0 ? high : textBoundary(current.Text, high + Math.Min(afterLength, current.Text.Length - high), true)
    let selected = current.Text.Substring(low, high - low)
    if start == low && end == high { return true }
    if current.CompositionStart >= 0 {
      return deleteAroundComposition(root, n, current, start, low, high, end)
    }
    if !SetEditorSelection(root, start, end) { return false }
    if n.Kind == NodeKind.Editor {
      guard let controller = n.EditorController else { return false }
      if !controller.Execute(TextCommand {
        Kind: selected.Length == 0 ? TextCommandKind.DeleteBackward : TextCommandKind.Insert,
        Text: selected }) {
          SetEditorSelection(root, current.SelectionStart, current.SelectionEnd)
          return false
        }
    } else {
      let before = editState(n)
      commitEdit(root, n, before, Edit().Insert(before, selected))
    }
    let anchor = current.SelectionStart <= current.SelectionEnd ? start : start + selected.Length
    let active = current.SelectionStart <= current.SelectionEnd ? start + selected.Length : start
    return SetEditorSelection(root, anchor, active)
  }

  private func deleteAroundComposition(root Node?, n Node, snapshot FocusedEditorSnapshot,
    start int32, low int32, high int32, end int32) bool{
      let pending = if n.Kind == NodeKind.Editor { n.EditorController?.Composition }
      else { entryComposition }
      guard let current = pending else { return false }
      let effectiveChanges = []TextChange{
        TextChange{ Range: TextRange{ Start: start, Length: low - start }, InsertedText: "" },
        TextChange{ Range: TextRange{ Start: high, Length: end - high }, InsertedText: "" },
      }
      let documentChanges = List[TextChange]()
      if start < low {
        documentChanges.Add(TextChange{ Range: TextRange{ Start: start, Length: low - start }, InsertedText: "" })
      }
      if high < end {
        documentChanges.Add(TextChange{ Range: TextRange{
          Start: high - current.Text.Length + current.Range.Length,
          Length: end - high }, InsertedText: "" })
      }
      let value = snapshot.Text.Substring(0, start) + snapshot.Text.Substring(low, high - low)
      +snapshot.Text.Substring(end)
      let selected = TextSelection{
        Anchor: rebaseTextPosition(TextPosition{ Offset: snapshot.SelectionStart,
          Affinity: TextAffinity.Upstream }, effectiveChanges),
        Active: rebaseTextPosition(TextPosition{ Offset: snapshot.SelectionEnd,
          Affinity: TextAffinity.Downstream }, effectiveChanges),
      }
      let next = TextComposition{
        Range: rebaseTextRange(current.Range, documentChanges),
        Text: current.Text,
        SelectionStart: current.SelectionStart,
        SelectionLength: current.SelectionLength,
        EffectiveSelection: selected,
      }
      if n.Kind == NodeKind.Editor {
        guard let controller = n.EditorController else { return false }
        if !controller.ApplyPlatformCompositionDeletion(documentChanges.ToArray()) { return false }
      } else {
        let before = entryCompositionBefore
        var committed = before.Text
        var removed int32 = 0
        for change in documentChanges {
          committed = committed.Remove(change.Range.Start - removed, change.Range.Length)
          removed = removed + change.Range.Length
        }
        entryCompositionBefore = EditState{ Text: committed,
          Anchor: rebaseTextPosition(TextPosition{ Offset: before.Anchor }, documentChanges).Offset,
          Caret: rebaseTextPosition(TextPosition{ Offset: before.Caret }, documentChanges).Offset }
        entryComposition = next
        n.Buffer = value
        n.Anchor = selected.Anchor.Offset
        n.Caret = selected.Active.Offset
        n.BlinkT = 0.0
        FollowCaret(n)
        if before.Text != committed {
          n.OnChange?.Invoke(committed)
          invalidateOwner(root, n)
        }
      }
      updateTextInputArea(n)
      return true
    }

  internal func ExecuteEditorCommand(root Node?, resolver Resolver, command TextCommand) bool {
    guard let n = focused else { return false }
    if !canReceiveInput(n) { return false }
    if command.Kind == TextCommandKind.CancelComposition { return HandleCompositionCancel(root) }
    if command.Kind == TextCommandKind.CommitComposition { return FinishComposition(root) }
    if command.Kind == TextCommandKind.UpdateComposition || command.Kind == TextCommandKind.BeginComposition {
      return HandleComposition(root, command.Text ?? "", 0, 0)
    }
    if command.Kind == TextCommandKind.Insert || command.Kind == TextCommandKind.Paste {
      return HandleChar(root, command.Text ?? "")
    }
    if !FinishComposition(root) { return false }
    if n.Kind == NodeKind.Editor {
      if n.EditorReadOnly && !readOnlyCommand(command.Kind) { return false }
      guard let controller = n.EditorController else { return false }
      if command.Kind == TextCommandKind.Copy {
        let value = controller.Copy()
        if value != "" { clipboardSet(value) }
        return true
      }
      if command.Kind == TextCommandKind.Cut {
        let value = controller.Cut()
        if value != "" { clipboardSet(value) }
        return true
      }
      let result = controller.Execute(command)
      if result { updateTextInputArea(n) }
      return result
    }
    if n.Kind != NodeKind.Entry { return false }
    let before = editState(n)
    let edit = Edit()
    var after = before
    switch command.Kind {
      case TextCommandKind.DeleteBackward { after = edit.Backspace(before) }
      case TextCommandKind.DeleteForward { after = edit.Delete(before) }
      case TextCommandKind.DeleteWordBackward { after = edit.KillWordLeft(before) }
      case TextCommandKind.DeleteWordForward { after = edit.KillWordRight(before) }
      case TextCommandKind.MoveLeft { commitVisualMove(n, -1, command.ExtendSelection)
        return true }
      case TextCommandKind.MoveRight { commitVisualMove(n, 1, command.ExtendSelection)
        return true }
      case TextCommandKind.MoveWordLeft { after = edit.WordLeft(before, command.ExtendSelection) }
      case TextCommandKind.MoveWordRight { after = edit.WordRight(before, command.ExtendSelection) }
      case TextCommandKind.MoveLineStart { commitVisualEdge(n, false, command.ExtendSelection)
        return true }
      case TextCommandKind.MoveLineEnd { commitVisualEdge(n, true, command.ExtendSelection)
        return true }
      case TextCommandKind.MoveDocumentStart { after = edit.Home(before, command.ExtendSelection) }
      case TextCommandKind.MoveDocumentEnd { after = edit.End(before, command.ExtendSelection) }
      case TextCommandKind.SelectAll { after = edit.SelectAll(before) }
      case TextCommandKind.Copy {
        if n.Password { return false }
        clipboardSet(edit.Selected(before))
        return true
      }
      case TextCommandKind.Cut {
        if n.Password { return false }
        clipboardSet(edit.Selected(before))
        after = edit.Insert(before, "")
      }
      case TextCommandKind.Submit {
        n.OnSubmit?.Invoke(n.Buffer)
        invalidateOwner(root, n)
        return true
      }
      case _ { return false }
    }
    commitEdit(root, n, before, after)
    return true
  }

  private func updateEntryComposition(n Node, value TextCompositionEvent) bool {
    let clean = sanitize(value.Text)
    let selected = normalizeComposition(clean, Math.Min(value.SelectionStart, clean.Length),
      Math.Min(value.SelectionLength, clean.Length - Math.Min(value.SelectionStart, clean.Length)))
    if entryComposition == nil { entryCompositionBefore = editState(n) }
    let before = entryCompositionBefore
    let textRange = if let current = entryComposition { current.Range }
    else { TextRange{ Start: Math.Min(before.Caret, before.Anchor), Length: Math.Abs(before.Caret - before.Anchor) } }
    entryComposition = TextComposition{ Range: textRange, Text: clean,
      SelectionStart: selected.SelectionStart, SelectionLength: selected.SelectionLength }
    n.Buffer = before.Text.Substring(0, textRange.Start) + clean + before.Text.Substring(textRange.Start + textRange.Length)
    n.Anchor = textRange.Start + selected.SelectionStart
    n.Caret = n.Anchor + selected.SelectionLength
    n.BlinkT = 0.0
    FollowCaret(n)
    updateTextInputArea(n)
    return true
  }

  private func setEffectiveCompositionSelection(n Node, anchor int32, active int32) {
    let selected = TextSelection{
      Anchor: TextPosition{ Offset: anchor, Affinity: TextAffinity.Upstream },
      Active: TextPosition{ Offset: active, Affinity: TextAffinity.Downstream },
    }
    if n.Kind == NodeKind.Editor {
      n.EditorController?.SetEffectiveCompositionSelection(selected)
    } else {
      n.Anchor = anchor
      n.Caret = active
      guard let current = entryComposition else { return }
      entryComposition = TextComposition{ Range: current.Range, Text: current.Text,
        SelectionStart: current.SelectionStart, SelectionLength: current.SelectionLength,
        EffectiveSelection: selected }
      FollowCaret(n)
    }
    n.BlinkT = 0.0
  }

  private func cancelEntryComposition(n Node) bool {
    if n.Kind != NodeKind.Entry || entryComposition == nil { return false }
    n.Buffer = entryCompositionBefore.Text
    n.Caret = entryCompositionBefore.Caret
    n.Anchor = entryCompositionBefore.Anchor
    entryComposition = nil
    n.BlinkT = 0.0
    FollowCaret(n)
    updateTextInputArea(n)
    return true
  }

  private func replaceEntryComposition(before EditState, current TextComposition, value string) EditState ->
  Edit().Insert(EditState{ Text: before.Text, Anchor: current.Range.Start,
    Caret: current.Range.Start + current.Range.Length }, value)

  private func readOnlyCommand(kind TextCommandKind) bool -> kind == TextCommandKind.Copy
    || kind == TextCommandKind.SelectAll || kind == TextCommandKind.Submit
    || (kind >= TextCommandKind.MoveLeft && kind <= TextCommandKind.PageDown)

  private func textBoundary(value string, offset int32, forward bool) int32 {
    if offset == value.Length { return offset }
    let starts = UnicodeGraphemes.Starts(value)
    return forward ? compositionBoundaryAfter(starts, value.Length, offset) : compositionBoundaryBefore(starts, offset)
  }

  private func editorCaretArea(n Node) ElementRect {
    var left float32
    var top float32
    var width float32 = 1.5F
    var height float32
    if n.Kind == NodeKind.Editor {
      guard let controller = n.EditorController else { return ElementRect{} }
      let caret = if let current = controller.Composition {
        TextEditorLayouts.CompositionCaretRect(n, current)
      } else { TextEditorLayouts.CaretRect(n, controller.Selection.Active) }
      left = n.Rect.X + caret.X
      top = n.Rect.Y + caret.Y
      width = caret.W
      height = caret.H
    } else {
      let metrics = TextMetrics()
      left = metrics.EntryOriginX(n, metrics.BufferShape(n)) + metrics.CaretX(n, n.Caret)
      top = TextLayouts.ContentTop(n)
      height = TextLayouts.ContentHeight(n)
    }
    let p0 = TransformGeometry.NodeToWindow(n, left, top)
    let p1 = TransformGeometry.NodeToWindow(n, left + width, top)
    let p2 = TransformGeometry.NodeToWindow(n, left, top + height)
    let p3 = TransformGeometry.NodeToWindow(n, left + width, top + height)
    if !p0.Valid || !p1.Valid || !p2.Valid || !p3.Valid { return ElementRect{} }
    let x = TransformGeometry.min4(p0.X, p1.X, p2.X, p3.X)
    let y = TransformGeometry.min4(p0.Y, p1.Y, p2.Y, p3.Y)
    return ElementRect{ X: float64(x), Y: float64(y),
      Width: float64(TransformGeometry.max4(p0.X, p1.X, p2.X, p3.X) - x),
      Height: float64(TransformGeometry.max4(p0.Y, p1.Y, p2.Y, p3.Y) - y) }
  }
}
