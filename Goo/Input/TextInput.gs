package Goo

import System
import System.Collections.Generic
import System.Text

internal class TextInput {
  private var focused Node?
  private var host WindowHost?
  private var nativeTextInputActive bool
  private var clipFallback string
  private var focusControl InputDispatchControl
  private var focusDispatchGeneration int64
  private var focusChangeGeneration int64

  internal init() {
    clipFallback = ""
    focusControl = InputDispatchControl()
  }

  internal func Attach(host WindowHost) {
    this.host = host
    syncNativeTextInput()
  }

  internal func Dispose() {
    if let current = focused {
      blurEditor(current)
      current.Focused = false
    }
    focused = nil
    syncNativeTextInput()
    host = nil
    nativeTextInputActive = false
  }

  internal func AfterTreeUpdated(root Node?, resolver Resolver) {
    guard let tree = root else {
      SetFocus(resolver, nil)
      return
    }
    if let f = focused {
      if !containsPath(tree, f) {
        SetFocus(resolver, nil)
      }
    }
    if focused == nil {
      if let target = findAutoFocus(tree, false, false) {
        SetFocus(resolver, target)
      }
    }
    syncNativeTextInput()
    if let f = focused {
      if f.Kind == NodeKind.Entry || f.Kind == NodeKind.Editor {
        updateTextInputArea(f)
      }
    }
  }

  private func findAutoFocus(n Node, hidden bool, disabled bool) Node? {
    let nowHidden = hidden || n.PaintInputHidden
    let nowDisabled = disabled || n.Disabled
    if !nowHidden && !nowDisabled && n.AutoFocus && n.Focusable {
      return n
    }
    for i in 0 ... n.Children.Count {
      if let found = findAutoFocus(n.Children[i], nowHidden, nowDisabled) {
        return found
      }
    }
    return nil
  }

  // Reports caret visibility flips so the render gate repaints on blink edges.
  internal func Step(dt float64) bool {
    guard let f = focused else {
      return false
    }
    if (f.Kind != NodeKind.Entry && f.Kind != NodeKind.Editor) || !canReceiveInput(f) {
      return false
    }
    let before = f.BlinkT - Math.Floor(f.BlinkT) < 0.5
    f.BlinkT = f.BlinkT + dt
    let after = f.BlinkT - Math.Floor(f.BlinkT) < 0.5
    return before != after
  }

  // Seconds until the caret's next visibility flip, or 1.0 (deliberately
  // larger than Window's 250ms idle-wait ceiling, so it never binds) when
  // nothing is focused/blinking. A focused entry must wake the window again
  // to blink, but as a bounded deadline, not a permanent "demand" latch --
  // treating it as demand would revert Pump to an unpaced poll spin with
  // nothing forcing a render most iterations (see Window.Host.gs).
  internal func BlinkDeadlineSeconds() float64 {
    guard let f = focused else {
      return 1.0
    }
    if (f.Kind != NodeKind.Entry && f.Kind != NodeKind.Editor) || !canReceiveInput(f) {
      return 1.0
    }
    let phase = f.BlinkT - Math.Floor(f.BlinkT)
    return phase < 0.5 ? 0.5 - phase : 1.0 - phase
  }

  internal func SetClipboardFallback(value string) {
    clipFallback = value
  }

  internal func AccessibilitySetValue(root Node?, target Node, value string) bool {
    if !canReceiveInput(target) { return false }
    if target.Kind == NodeKind.Entry {
      let before = editState(target)
      let editor = Edit()
      commitEdit(root, target, before, editor.Insert(editor.SelectAll(before), value))
      return true
    }
    if target.Kind == NodeKind.Editor && !target.EditorReadOnly {
      if let controller = target.EditorController {
        controller.Execute(TextCommand{ Kind: TextCommandKind.SelectAll })
        return controller.Execute(TextCommand{ Kind: TextCommandKind.Insert, Text: value })
      }
    }
    return false
  }

  internal func AccessibilitySetSelection(target Node, start int32, length int32) bool {
    if !canReceiveInput(target) || start < 0 || length < 0 { return false }
    let end = start + length
    if end < start { return false }
    if target.Kind == NodeKind.Entry {
      let semanticLength = target.Password
      ? UnicodeGraphemes.Starts(target.Buffer).Length : target.Buffer.Length
      if end > semanticLength { return false }
      target.Anchor = target.Password ? protectedTextSourceOffset(target.Buffer, start) : start
      target.Caret = target.Password ? protectedTextSourceOffset(target.Buffer, end) : end
      target.AnchorAffinity = TextAffinity.Upstream
      target.CaretAffinity = TextAffinity.Downstream
      target.BlinkT = 0.0
      return true
    }
    if target.Kind == NodeKind.Editor {
      guard let controller = target.EditorController else { return false }
      if end > controller.Document.Length { return false }
      controller.Selection = TextSelection{
        Anchor: TextPosition{ Offset: start, Affinity: TextAffinity.Upstream },
        Active: TextPosition{ Offset: end, Affinity: TextAffinity.Downstream },
      }
      return true
    }
    return false
  }

  internal func FocusedNode() Node ? -> focused

  internal func FocusGeneration() int64 -> focusChangeGeneration

  internal func RefreshInputArea(n Node) {
    if focused == n { updateTextInputArea(n) }
  }

  internal func SetFocus(resolver Resolver, target Node?) {
    var nextTarget = target
    if let requested = nextTarget {
      if !canReceiveInput(requested) {
        nextTarget = nil
      }
    }
    let previous = focused
    if nextTarget == previous {
      return
    }
    focusChangeGeneration++
    let changeGeneration = focusChangeGeneration
    focused = nextTarget
    if let old = previous {
      blurEditor(old)
      old.Focused = false
      resolver.Invalidate(old, false)
    }
    if let next = nextTarget {
      next.Focused = true
      resolver.Invalidate(next, false)
      if next.Kind == NodeKind.Entry {
        next.PreFocus = next.Buffer
        next.Caret = next.Buffer.Length
        next.Anchor = next.Caret
        next.CaretAffinity = TextAffinity.Upstream
        next.AnchorAffinity = TextAffinity.Upstream
        next.BlinkT = 0.0
        FollowCaret(next)
      } else if next.Kind == NodeKind.Editor {
        if let controller = next.EditorController {
          next.BlinkT = 0.0
          controller.Focus()
          TextEditorLayouts.FollowCaret(next, controller.Selection.Active)
        }
      }
    }
    syncNativeTextInput()
    if let next = nextTarget {
      if next.Kind == NodeKind.Entry || next.Kind == NodeKind.Editor {
        updateTextInputArea(next)
      }
    }
    if let old = previous {
      dispatchFocus(old, false)
      if focusChangeGeneration != changeGeneration {
        return
      }
    }
    if let next = nextTarget {
      dispatchFocus(next, true)
    }
  }

  private func dispatchFocus(target Node, received bool) {
    focusDispatchGeneration++
    let generation = focusDispatchGeneration
    focusControl.Begin(generation)
    try {
      var current Node? = target
      while current != nil {
        let node = current
        let callback = received ? InputCallbacks.Focus(node) : InputCallbacks.Blur(node)
        if let handler = callback {
          handler(FocusEvent{ Control: focusControl, Generation: generation })
          rebuildFiberOwner(node)
        }
        if focusControl.PropagationStopped { break }
        current = node.Parent
      }
    } finally {
      focusControl.Finish(generation)
    }
  }

  internal func HandleKey(root Node?, resolver Resolver, key Key, modifiers KeyModifiers) bool {
    let shift = modifiers.Shift
    guard let n = focused else {
      if key == Key.Tab {
        focusStep(root, resolver, shift ? -1 : 1)
        return true
      }
      return false
    }
    if n.Kind == NodeKind.Editor && canReceiveInput(n) {
      if key == Key.Tab && n.EditorReadOnly {
        focusStep(root, resolver, shift ? -1 : 1)
        return true
      }
      return handleEditorKey(n, key, modifiers)
    }
    if key == Key.Tab {
      focusStep(root, resolver, shift ? -1 : 1)
      return true
    }
    if n.Kind != NodeKind.Entry || !canReceiveInput(n) {
      return false
    }
    let word = InputPolicy.Word(modifiers)
    let primary = InputPolicy.Primary(modifiers)
    let s = editState(n)
    let e = Edit()
    if key == Key.Left {
      if word {
        commitEdit(root, n, s, e.WordLeft(s, shift))
      } else {
        commitVisualMove(n, -1, shift)
      }
    } else if key == Key.Right {
      if word {
        commitEdit(root, n, s, e.WordRight(s, shift))
      } else {
        commitVisualMove(n, 1, shift)
      }
    } else if key == Key.Home {
      commitVisualEdge(n, false, shift)
    } else if key == Key.End {
      commitVisualEdge(n, true, shift)
    } else if key == Key.Backspace {
      commitEdit(root, n, s, word ? e.KillWordLeft(s) : e.Backspace(s))
    } else if key == Key.Delete {
      commitEdit(root, n, s, word ? e.KillWordRight(s) : e.Delete(s))
    } else if key == Key.Enter || key == Key.KeypadEnter {
      if let h = n.OnSubmit {
        h(n.Buffer)
        invalidateOwner(root, n)
      }
    } else if key == Key.Escape {
      if n.Buffer != n.PreFocus {
        n.Buffer = n.PreFocus
        n.Caret = n.Buffer.Length
        n.Anchor = n.Caret
        n.CaretAffinity = TextAffinity.Upstream
        n.AnchorAffinity = TextAffinity.Upstream
        if let h = n.OnChange {
          h(n.Buffer)
          invalidateOwner(root, n)
        }
      }
      SetFocus(resolver, nil)
    } else if primary && key == Key.A {
      commitEdit(root, n, s, e.SelectAll(s))
    } else if primary && key == Key.C {
      if !n.Password && e.HasSelection(s) {
        clipboardSet(e.Selected(s))
      }
    } else if primary && key == Key.X {
      if !n.Password && e.HasSelection(s) {
        clipboardSet(e.Selected(s))
        commitEdit(root, n, s, e.Insert(s, ""))
      }
    } else if primary && key == Key.V {
      commitEdit(root, n, s, e.Insert(s, sanitize(clipboardGet())))
    } else {
      return false
    }
    return true
  }

  internal func HandleChar(root Node?, value string) bool {
    guard let n = focused else {
      return false
    }
    if n.Kind == NodeKind.Editor && canReceiveInput(n) {
      var committed = n.EditorReadOnly
      if !n.EditorReadOnly {
        if let controller = n.EditorController {
          committed = controller.Composition != nil
          ? controller.CommitComposition(value) : controller.Execute(TextCommand{ Kind: TextCommandKind.Insert, Text: value })
          if committed {
            n.BlinkT = 0.0
            updateTextInputArea(n)
          }
        }
      }
      dispatchTextInput(n, value)
      return committed
    }
    if n.Kind == NodeKind.Entry && canReceiveInput(n) {
      let clean = sanitize(value)
      if clean.Length != 0 {
        let s = editState(n)
        commitEdit(root, n, s, Edit().Insert(s, clean))
      }
      dispatchTextInput(n, value)
      return clean.Length != 0
    }
    dispatchTextInput(n, value)
    return false
  }

  internal func HandleComposition(root Node?, value string, selectionStart int32,
    selectionLength int32) bool{
      guard let n = focused else { return false }
      if !canReceiveInput(n) { return false }
      let composition = normalizeComposition(value, selectionStart, selectionLength)
      var updated = false
      if n.Kind == NodeKind.Editor && !n.EditorReadOnly {
        if let controller = n.EditorController {
          updated = controller.UpdateComposition(composition.Text, composition.SelectionStart,
            composition.SelectionLength)
          if updated {
            n.BlinkT = 0.0
            updateTextInputArea(n)
          }
        }
      }
      dispatchTextComposition(n, composition)
      return updated
    }

  internal func HandleCompositionCandidates(candidates IReadOnlyList[string]?, selected int32,
    horizontal bool) {
      guard let n = focused else {
        return
      }
      if !canReceiveInput(n) {
        return
      }
      let values = candidates ?? TextInputCallbacks.EmptyCandidates()
      let selectedCandidate = selected >= 0 && selected < values.Count ? selected : -1
      if let callback = TextInputCallbacks.TextCandidates(n) {
        callback(TextCandidateEvent{ Candidates: values, SelectedCandidate: selectedCandidate,
          Horizontal: horizontal })
        rebuildFiberOwner(n)
      }
    }

  internal func HandleCompositionCancel(root Node?) bool {
    guard let n = focused else { return false }
    if !canReceiveInput(n) { return false }
    var canceled = false
    if n.Kind == NodeKind.Editor {
      if let controller = n.EditorController {
        canceled = controller.Execute(TextCommand{ Kind: TextCommandKind.CancelComposition })
        if canceled { updateTextInputArea(n) }
      }
    }
    dispatchTextCompositionCancel(n)
    return canceled
  }

  private func dispatchTextInput(n Node, value string) {
    if let callback = TextInputCallbacks.TextInput(n) {
      callback(value)
      rebuildFiberOwner(n)
    }
  }

  private func dispatchTextComposition(n Node, value TextCompositionEvent) {
    if let callback = TextInputCallbacks.TextComposition(n) {
      callback(value)
      rebuildFiberOwner(n)
    }
  }

  private func dispatchTextCompositionCancel(n Node) {
    if let callback = TextInputCallbacks.TextCompositionCancel(n) {
      callback()
      rebuildFiberOwner(n)
    }
  }

  private func normalizeComposition(value string, selectionStart int32,
    selectionLength int32) TextCompositionEvent{
      if selectionStart < 0 || selectionLength < 0
        || selectionStart > value.Length - selectionLength
        || splitsSurrogatePair(value, selectionStart)
        || splitsSurrogatePair(value, selectionStart + selectionLength) {
          return TextCompositionEvent{ Text: value, SelectionStart: 0, SelectionLength: 0 }
        }
      let starts = UnicodeGraphemes.Starts(value)
      let start = if selectionStart == value.Length { value.Length }
      else { compositionBoundaryBefore(starts, selectionStart) }
      let end = if selectionLength == 0 { start }
      else { compositionBoundaryAfter(starts, value.Length, selectionStart + selectionLength) }
      return TextCompositionEvent{ Text: value, SelectionStart: start,
        SelectionLength: end - start }
    }

  private func compositionBoundaryBefore(starts []int32, offset int32) int32 {
    var result int32 = 0
    for start in starts {
      if start > offset { break }
      result = start
    }
    return result
  }

  private func compositionBoundaryAfter(starts []int32, length int32, offset int32) int32 {
    for start in starts {
      if start >= offset { return start }
    }
    return length
  }

  private func splitsSurrogatePair(value string, offset int32) bool -> offset > 0 && offset < value.Length
    && Char.IsHighSurrogate(value[offset - 1]) && Char.IsLowSurrogate(value[offset])

  private func syncNativeTextInput() {
    let desired = if let current = focused {
      canReceiveInput(current) && (current.Kind == NodeKind.Entry || current.Kind == NodeKind.Editor
          || TextInputCallbacks.HasNodeCallbacks(current))
    } else { false }
    if desired == nativeTextInputActive {
      return
    }
    guard let native = host else {
      return
    }
    if desired {
      nativeTextInputActive = native.StartTextInput()
    } else {
      native.StopTextInput()
      nativeTextInputActive = false
    }
  }

  private func focusStep(root Node?, resolver Resolver, dir int32) {
    guard let tree = root else {
      return
    }
    let order = List[Node]()
    collectFocusables(tree, order, false, false)
    if order.Count == 0 {
      return
    }
    var idx = -1
    for i in 0 ... order.Count {
      if let f = focused {
        if order[i] == f {
          idx = i
          break
        }
      }
    }
    var next = dir > 0 ? 0 : order.Count - 1
    if idx != -1 {
      next = ((idx + dir) % order.Count + order.Count) % order.Count
    }
    SetFocus(resolver, order[next])
  }

  private func commitEdit(root Node?, n Node, before EditState, after EditState) {
    let priorAnchorAffinity = n.AnchorAffinity
    n.Buffer = after.Text
    n.Caret = after.Caret
    n.Anchor = after.Anchor
    if after.Text != before.Text {
      n.CaretAffinity = TextAffinity.Upstream
    } else if after.Caret < before.Caret {
      n.CaretAffinity = TextAffinity.Downstream
    } else if after.Caret > before.Caret {
      n.CaretAffinity = TextAffinity.Upstream
    }
    if after.Caret == after.Anchor {
      n.AnchorAffinity = n.CaretAffinity
    } else if after.Anchor == before.Anchor {
      n.AnchorAffinity = priorAnchorAffinity
    } else {
      n.AnchorAffinity = after.Anchor <= after.Caret
      ? TextAffinity.Downstream : TextAffinity.Upstream
    }
    n.BlinkT = 0.0
    if after.Text != before.Text {
      if let h = n.OnChange {
        h(after.Text)
        invalidateOwner(root, n)
      }
    }
    FollowCaret(n)
    updateTextInputArea(n)
  }

  private func commitVisualMove(n Node, delta int32, extend bool) {
    let metrics = TextMetrics()
    let hit = n.Caret != n.Anchor && !extend
    ? metrics.Collapse(n, delta) : metrics.MoveCaret(n, delta)
    n.Caret = hit.Index
    n.CaretAffinity = TextAffinity(hit.Affinity)
    if !extend {
      n.Anchor = hit.Index
      n.AnchorAffinity = n.CaretAffinity
    }
    n.BlinkT = 0.0
    FollowCaret(n)
    updateTextInputArea(n)
  }

  private func commitVisualEdge(n Node, end bool, extend bool) {
    let hit = TextMetrics().LineEdge(n, end)
    n.Caret = hit.Index
    n.CaretAffinity = TextAffinity(hit.Affinity)
    if !extend {
      n.Anchor = hit.Index
      n.AnchorAffinity = n.CaretAffinity
    }
    n.BlinkT = 0.0
    FollowCaret(n)
    updateTextInputArea(n)
  }

  private func invalidateOwner(root Node?, target Node) {
    guard let tree = root else {
      return
    }
    if let c = findOwner(tree, target, nil) {
      c.Rebuild()
    }
  }

  private func collectFocusables(n Node, sink List[Node], hidden bool, disabled bool) {
    let nowHidden = hidden || n.PaintInputHidden
    let nowDisabled = disabled || n.Disabled
    if !nowHidden && !nowDisabled && n.Focusable {
      sink.Add(n)
    }
    for i in 0 ... n.Children.Count {
      collectFocusables(n.Children[i], sink, nowHidden, nowDisabled)
    }
  }

  private func editState(n Node) EditState -> EditState { Text: n.Buffer, Caret: n.Caret, Anchor: n.Anchor }

  private func clipboardGet() string -> if let native = host { native.GetClipboardText() } else { clipFallback }

  private func clipboardSet(value string) {
    if let native = host {
      native.SetClipboardText(value)
      return
    }
    clipFallback = value
  }

  private func updateTextInputArea(n Node) {
    if let native = host {
      if n.Kind == NodeKind.Editor {
        TextEditorInputAdapter.UpdateImeArea(native, n)
        return
      }
      if n.Kind != NodeKind.Entry {
        return
      }
      let metrics = TextMetrics()
      let shaped = metrics.BufferShape(n)
      let caretX = metrics.EntryOriginX(n, shaped)
      +metrics.CaretX(n, n.Caret)
      let topY = TextLayouts.ContentTop(n)
      let bottomY = topY + TextLayouts.ContentHeight(n)
      let p0 = TransformGeometry.NodeToWindow(n, caretX, topY)
      let p1 = TransformGeometry.NodeToWindow(n, caretX + 1.5F, topY)
      let p2 = TransformGeometry.NodeToWindow(n, caretX, bottomY)
      let p3 = TransformGeometry.NodeToWindow(n, caretX + 1.5F, bottomY)
      TextEditorInputAdapter.ApplyImeArea(native, p0, p1, p2, p3)
    }
  }

  private func sanitize(value string) string {
    let sb = StringBuilder()
    for c in value {
      if c >= 32 && c != 127 {
        sb.Append(c)
      }
    }
    return sb.ToString()
  }

  private func blurEditor(n Node) {
    if n.Kind == NodeKind.Editor {
      n.EditorController?.Blur()
    }
  }

  private func handleEditorKey(n Node, key Key, modifiers KeyModifiers) bool {
    guard let controller = n.EditorController else { return false }
    let primary = InputPolicy.Primary(modifiers)
    let word = InputPolicy.Word(modifiers)
    let extend = modifiers.Shift
    let editable = !n.EditorReadOnly
    var handled = true

    if primary && key == Key.A {
      controller.Execute(TextCommand{ Kind: TextCommandKind.SelectAll })
    } else if primary && key == Key.C {
      let copied = controller.Copy()
      if copied != "" { clipboardSet(copied) }
    } else if primary && key == Key.X {
      if editable {
        let copied = controller.Cut()
        if copied != "" { clipboardSet(copied) }
      }
    } else if primary && key == Key.V {
      if editable {
        controller.Execute(TextCommand{ Kind: TextCommandKind.Paste, Text: clipboardGet() })
      }
    } else if primary && key == Key.Z {
      if editable {
        controller.Execute(TextCommand{ Kind: extend
          ? TextCommandKind.Redo : TextCommandKind.Undo })
      }
    } else if primary && key == Key.Y {
      if editable { controller.Execute(TextCommand{ Kind: TextCommandKind.Redo }) }
    } else if primary && key == Key.Home {
      controller.Execute(TextCommand{ Kind: TextCommandKind.MoveDocumentStart, ExtendSelection: extend })
    } else if primary && key == Key.End {
      controller.Execute(TextCommand{ Kind: TextCommandKind.MoveDocumentEnd, ExtendSelection: extend })
    } else if key == Key.Left {
      controller.Execute(TextCommand{
        Kind: word ? TextCommandKind.MoveWordLeft : TextCommandKind.MoveLeft,
        ExtendSelection: extend,
      })
    } else if key == Key.Right {
      controller.Execute(TextCommand{
        Kind: word ? TextCommandKind.MoveWordRight : TextCommandKind.MoveRight,
        ExtendSelection: extend,
      })
    } else if key == Key.Up {
      controller.Execute(TextCommand{ Kind: TextCommandKind.MoveUp, ExtendSelection: extend })
    } else if key == Key.Down {
      controller.Execute(TextCommand{ Kind: TextCommandKind.MoveDown, ExtendSelection: extend })
    } else if key == Key.Home {
      controller.Execute(TextCommand{
        Kind: TextCommandKind.MoveLineStart,
        ExtendSelection: extend,
      })
    } else if key == Key.End {
      controller.Execute(TextCommand{
        Kind: TextCommandKind.MoveLineEnd,
        ExtendSelection: extend,
      })
    } else if key == Key.PageUp {
      controller.Execute(TextCommand{ Kind: TextCommandKind.PageUp, ExtendSelection: extend })
    } else if key == Key.PageDown {
      controller.Execute(TextCommand{ Kind: TextCommandKind.PageDown, ExtendSelection: extend })
    } else if key == Key.Backspace {
      if editable {
        if word { controller.Execute(TextCommand{ Kind: TextCommandKind.DeleteWordBackward }) }
        else { controller.Execute(TextCommand{ Kind: TextCommandKind.DeleteBackward }) }
      }
    } else if key == Key.Delete {
      if editable {
        if word { controller.Execute(TextCommand{ Kind: TextCommandKind.DeleteWordForward }) }
        else { controller.Execute(TextCommand{ Kind: TextCommandKind.DeleteForward }) }
      }
    } else if key == Key.Tab {
      if editable {
        controller.Execute(TextCommand{ Kind: extend
          ? TextCommandKind.Outdent : TextCommandKind.Indent })
      }
    } else if key == Key.Insert {
      if editable { controller.Execute(TextCommand{ Kind: TextCommandKind.ToggleOverwrite }) }
    } else if key == Key.Enter || key == Key.KeypadEnter {
      if primary {
        controller.Execute(TextCommand{ Kind: TextCommandKind.Submit })
      } else if editable {
        controller.Execute(TextCommand{ Kind: TextCommandKind.Insert, Text: "\n" })
      }
    } else if key == Key.Escape {
      controller.Execute(TextCommand{ Kind: TextCommandKind.CancelComposition })
    } else {
      handled = false
    }
    if handled {
      n.BlinkT = 0.0
      updateTextInputArea(n)
    }
    return handled
  }
}

internal func rebuildFiberOwner(node Node) {
  var current Node? = node
  while current != nil {
    if let owner = current.Fiber {
      owner.Rebuild()
      return
    }
    current = current.Parent
  }
}
