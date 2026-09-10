package Goo

import System
import System.Collections.Generic

/// Selects a semantic text-editor operation.
public enum TextCommandKind {
  Insert;
  DeleteBackward;
  DeleteForward;
  DeleteWordBackward;
  DeleteWordForward;
  MoveLeft;
  MoveRight;
  MoveUp;
  MoveDown;
  MoveWordLeft;
  MoveWordRight;
  MoveLineStart;
  MoveLineEnd;
  MoveDocumentStart;
  MoveDocumentEnd;
  PageUp;
  PageDown;
  SelectAll;
  Copy;
  Cut;
  Paste;
  Undo;
  Redo;
  Indent;
  Outdent;
  Submit;
  ToggleOverwrite;
  BeginComposition;
  UpdateComposition;
  CommitComposition;
  CancelComposition;
}

/// Describes an operation with a Kind, Text, and ExtendSelection flag.
public data struct TextCommand(Kind TextCommandKind, Text string, ExtendSelection bool) { }

/// Provides mutable cancellation state before a text-editor command runs.
public class TextCommandEvent {
  private let command TextCommand
  private var cancel bool

  internal init(command TextCommand) {
    this.command = command
  }

  /// Gets the semantic command being dispatched.
  public prop Command TextCommand{ get -> command }
  /// Gets or sets whether Goo skips its default command behavior.
  public prop Cancel bool{
    get -> cancel
    set(v) -> cancel = v
  }
}

/// Describes preedit Range, Text, SelectionStart, and SelectionLength values.
public data struct TextComposition(Range TextRange, Text string, SelectionStart int32,
  SelectionLength int32) {
    internal prop EffectiveSelection TextSelection? { get; init; }
  }

internal data struct TextEditorControllerState {
  internal var Selection TextSelection
  internal var Composition TextComposition?
  internal var ScrollTargetX float64
  internal var ScrollTargetY float64
  internal var Focused bool
}

/// Owns editing state and semantic commands for one text document view.
public class TextEditorController : IDisposable {
  private let document TextDocument
  private var selection TextSelection
  private var composition TextComposition?
  private var desiredHorizontalPosition float64
  private var hasDesiredHorizontalPosition bool
  private var scrollTargetX float64
  private var scrollTargetY float64
  private var focused bool
  private var overwrite bool
  private var onCommand Action[TextCommandEvent]?
  private var onSubmit Action?
  private var undoGroup object?
  private var undoCommand TextCommandKind
  private var applyingDocumentEdit bool
  private var replacingSelection bool
  private var disposed bool
  private var mountedEditor object?

  internal var Changed Action?
  internal var Submitted Action?

  /// Creates a controller for one document.
  /// @param document The document edited by this controller.
  public init(document TextDocument) {
    if document == nil { throw ArgumentNullException("document") }
    this.document = document
    selection = TextSelection{
      Anchor: TextPosition{ Offset: 0, Affinity: TextAffinity.Upstream },
      Active: TextPosition{ Offset: 0, Affinity: TextAffinity.Upstream },
    }
    document.Changed += onDocumentChanged
  }

  /// Gets the document edited by this controller.
  public prop Document TextDocument{ get -> document }
  /// Gets or sets the current selection.
  public prop Selection TextSelection{
    get -> selection
    set(v) -> setSelection(v, true)
  }
  /// Gets the desired horizontal caret position used by vertical movement.
  public prop DesiredHorizontalPosition float64? {
    get -> hasDesiredHorizontalPosition ? desiredHorizontalPosition : nil
  }
  /// Gets the horizontal scroll target in logical pixels.
  public prop ScrollTargetX float64{ get -> scrollTargetX }
  /// Gets the vertical scroll target in logical pixels.
  public prop ScrollTargetY float64{ get -> scrollTargetY }
  /// Gets whether this controller currently owns editor focus.
  public prop IsFocused bool{ get -> focused }
  /// Gets the transient IME composition, or nil when none is active.
  public prop Composition TextComposition? { get -> composition }
  /// Gets or sets whether typed text overwrites following grapheme clusters.
  public prop Overwrite bool{
    get -> overwrite
    set(v) {
      if overwrite != v {
        overwrite = v
        breakUndoGroup()
        changed()
      }
    }
  }
  /// Gets or sets the interceptor called before every semantic command.
  public prop OnCommand Action[TextCommandEvent]? {
    get -> onCommand
    set(v) -> onCommand = v
  }
  /// Gets or sets the callback invoked by an accepted submit command.
  public prop OnSubmit Action? {
    get -> onSubmit
    set(v) -> onSubmit = v
  }

  /// Dispatches and performs a semantic text-editor command. MoveLeft and MoveRight use visual
  /// order while mounted and logical document order otherwise.
  /// @param command The command to dispatch.
  /// @returns True when default handling ran.
  public func Execute(command TextCommand) bool {
    if !beginCommand(command) { return false }
    switch command.Kind {
      case TextCommandKind.Insert { return insertDefault(command.Text, TextCommandKind.Insert) }
      case TextCommandKind.DeleteBackward { return deleteBackward(false) }
      case TextCommandKind.DeleteForward { return deleteForward(false) }
      case TextCommandKind.DeleteWordBackward { return deleteBackward(true) }
      case TextCommandKind.DeleteWordForward { return deleteForward(true) }
      case TextCommandKind.MoveLeft { return moveHorizontal(-1, command.ExtendSelection) }
      case TextCommandKind.MoveRight { return moveHorizontal(1, command.ExtendSelection) }
      case TextCommandKind.MoveUp { return moveVertical(-1, command.ExtendSelection) }
      case TextCommandKind.MoveDown { return moveVertical(1, command.ExtendSelection) }
      case TextCommandKind.MoveWordLeft { return moveWord(-1, command.ExtendSelection) }
      case TextCommandKind.MoveWordRight { return moveWord(1, command.ExtendSelection) }
      case TextCommandKind.MoveLineStart { return moveLineEdge(false, command.ExtendSelection) }
      case TextCommandKind.MoveLineEnd { return moveLineEdge(true, command.ExtendSelection) }
      case TextCommandKind.MoveDocumentStart { return placeSelection(0, TextAffinity.Upstream, command.ExtendSelection, false) }
      case TextCommandKind.MoveDocumentEnd { return placeSelection(document.Length, TextAffinity.Downstream, command.ExtendSelection, false) }
      case TextCommandKind.PageUp { return moveVertical(-10, command.ExtendSelection) }
      case TextCommandKind.PageDown { return moveVertical(10, command.ExtendSelection) }
      case TextCommandKind.SelectAll { return selectAllDefault() }
      case TextCommandKind.Copy { return true }
      case TextCommandKind.Cut { return cutDefault() }
      case TextCommandKind.Paste { return insertDefault(command.Text, TextCommandKind.Paste) }
      case TextCommandKind.Undo { return undoDefault() }
      case TextCommandKind.Redo { return redoDefault() }
      case TextCommandKind.Indent { return indentDefault(false) }
      case TextCommandKind.Outdent { return indentDefault(true) }
      case TextCommandKind.Submit {
        onSubmit?.Invoke()
        Submitted?.Invoke()
        return true
      }
      case TextCommandKind.ToggleOverwrite {
        Overwrite = !Overwrite
        return true
      }
      case TextCommandKind.BeginComposition { return beginCompositionDefault() }
      case TextCommandKind.UpdateComposition { return updateCompositionDefault(command.Text, 0, 0) }
      case TextCommandKind.CommitComposition {
        return commitCompositionDefault(String.IsNullOrEmpty(command.Text) ? nil : command.Text)
      }
      case TextCommandKind.CancelComposition { return cancelCompositionDefault() }
      case _ { throw ArgumentOutOfRangeException("command") }
    }
    return false
  }

  /// Gets the selected text after command interception.
  /// @returns The selected text, or an empty string when canceled.
  public func Copy() string {
    if !beginCommand(TextCommand { Kind: TextCommandKind.Copy }) { return "" }
    return selectedText()
  }

  /// Gets and deletes the selected text after command interception.
  /// @returns The deleted text, or an empty string when canceled.
  public func Cut() string {
    if !beginCommand(TextCommand { Kind: TextCommandKind.Cut }) { return "" }
    let copied = selectedText()
    cutDefault()
    return copied
  }

  /// Updates transient IME composition text and its selected segment.
  /// @param text The transient preedit text.
  /// @param selectionStart The UTF-16 selected-segment start.
  /// @param selectionLength The UTF-16 selected-segment length.
  /// @returns True when default handling ran.
  public func UpdateComposition(text string, selectionStart int32, selectionLength int32) bool {
    if !beginCommand(TextCommand { Kind: TextCommandKind.UpdateComposition, Text: text }) { return false }
    return updateCompositionDefault(text, selectionStart, selectionLength)
  }

  /// Commits the current transient composition text.
  /// @returns True when default handling ran.
  public func CommitComposition() bool {
    if !beginCommand(TextCommand { Kind: TextCommandKind.CommitComposition }) { return false }
    return commitCompositionDefault(nil)
  }

  /// Commits the supplied text over the current composition or selection.
  /// @param text The committed text.
  /// @returns True when default handling ran.
  public func CommitComposition(text string) bool {
    if !beginCommand(TextCommand { Kind: TextCommandKind.CommitComposition, Text: text }) { return false }
    return commitCompositionDefault(text)
  }

  /// Marks this controller focused.
  public func Focus() {
    if !focused {
      focused = true
      changed()
    }
  }

  /// Clears focus and cancels transient IME composition.
  public func Blur() {
    if focused || composition != nil {
      focused = false
      composition = nil
      breakUndoGroup()
      changed()
    }
  }

  /// Changes the logical scroll target.
  /// @param x The non-negative horizontal target.
  /// @param y The non-negative vertical target.
  public func ScrollTo(x float64, y float64) {
    if Double.IsNaN(x) || Double.IsInfinity(x) || x < 0.0 {
      throw ArgumentOutOfRangeException("x")
    }
    if Double.IsNaN(y) || Double.IsInfinity(y) || y < 0.0 {
      throw ArgumentOutOfRangeException("y")
    }
    if scrollTargetX != x || scrollTargetY != y {
      scrollTargetX = x
      scrollTargetY = y
      changed()
    }
  }

  /// Creates an undo boundary without ending a currently active group.
  public func BreakUndoGroup() {
    breakUndoGroup()
  }

  /// Releases document subscriptions held by this controller.
  public func Dispose() {
    if !disposed {
      disposed = true
      undoGroup = nil
      document.Changed -= onDocumentChanged
      mountedEditor = nil
    }
  }

  internal func Attach(editor object) {
    if disposed { throw ObjectDisposedException("TextEditorController") }
    if mountedEditor != nil && mountedEditor != editor {
      throw InvalidOperationException("A TextEditorController can mount only one editor")
    }
    mountedEditor = editor
  }

  internal func Detach(editor object) {
    if mountedEditor == editor {
      mountedEditor = nil
      Blur()
    }
  }

  internal func State() TextEditorControllerState -> TextEditorControllerState {
    Selection: selection,
    Composition: composition,
    ScrollTargetX: scrollTargetX,
    ScrollTargetY: scrollTargetY,
    Focused: focused,
  }

  internal func SetEffectiveCompositionSelection(value TextSelection) {
    guard let current = composition else { return }
    composition = TextComposition{
      Range: current.Range, Text: current.Text, SelectionStart: current.SelectionStart,
      SelectionLength: current.SelectionLength, EffectiveSelection: value,
    }
    changed()
  }

  internal func SetPlatformCompositionRange(value TextRange) bool {
    let text = document.GetText(value)
    if !beginCommand(TextCommand { Kind: TextCommandKind.UpdateComposition, Text: text }) { return false }
    composition = TextComposition{
      Range: value, Text: text, SelectionStart: 0, SelectionLength: value.Length,
      EffectiveSelection: selection,
    }
    breakUndoGroup()
    changed()
    return true
  }

  internal func ApplyPlatformCompositionDeletion(changes []TextChange) bool {
    if !beginCommand(TextCommand { Kind: TextCommandKind.DeleteBackward }) { return false }
    let group = beginEditGroup(TextCommandKind.DeleteBackward)
    applyingDocumentEdit = true
    try {
      document.ApplyControllerTransaction(changes, group)
    } finally {
      applyingDocumentEdit = false
    }
    hasDesiredHorizontalPosition = false
    followCaret()
    changed()
    return true
  }

  private func beginCommand(command TextCommand) bool {
    validateCommand(command)
    let args = TextCommandEvent(command)
    onCommand?.Invoke(args)
    return !args.Cancel
  }

  private func validateCommand(command TextCommand) {
    if int32(command.Kind) < int32(TextCommandKind.Insert)
      || int32(command.Kind) > int32(TextCommandKind.CancelComposition) {
        throw ArgumentOutOfRangeException("command")
      }
    if (command.Kind == TextCommandKind.Insert || command.Kind == TextCommandKind.Paste
        || command.Kind == TextCommandKind.UpdateComposition) && command.Text == nil {
          throw ArgumentNullException("command")
        }
  }

  private func insertDefault(text string, kind TextCommandKind) bool {
    if text == nil { throw ArgumentNullException("text") }
    if text.Length == 0 { return true }
    let textRange = selectedRange()
    let replace = overwrite && textRange.Length == 0 ? overwriteRange(text) : textRange
    applyTextChange(kind, TextChange{ Range: replace, InsertedText: text })
    composition = nil
    return true
  }

  private func deleteBackward(word bool) bool {
    let textRange = selectedRange()
    if textRange.Length != 0 {
      applyTextChange(word ? TextCommandKind.DeleteWordBackward : TextCommandKind.DeleteBackward,
        TextChange{ Range: textRange, InsertedText: "" })
      composition = nil
      return true
    }
    let start = if word { previousWord(selection.Active.Offset) }
    else { previousDocumentElement(selection.Active.Offset) }
    if start == selection.Active.Offset { return true }
    applyTextChange(word ? TextCommandKind.DeleteWordBackward : TextCommandKind.DeleteBackward,
      TextChange{ Range: TextRange{ Start: start, Length: selection.Active.Offset - start }, InsertedText: "" })
    composition = nil
    return true
  }

  private func deleteForward(word bool) bool {
    let textRange = selectedRange()
    if textRange.Length != 0 {
      applyTextChange(word ? TextCommandKind.DeleteWordForward : TextCommandKind.DeleteForward,
        TextChange{ Range: textRange, InsertedText: "" })
      composition = nil
      return true
    }
    let end = if word { nextWord(selection.Active.Offset) }
    else { nextDocumentElement(selection.Active.Offset) }
    if end == selection.Active.Offset { return true }
    applyTextChange(word ? TextCommandKind.DeleteWordForward : TextCommandKind.DeleteForward,
      TextChange{ Range: TextRange{ Start: selection.Active.Offset, Length: end - selection.Active.Offset }, InsertedText: "" })
    composition = nil
    return true
  }

  private func moveHorizontal(direction int32, extend bool) bool {
    if let collapsed = collapseToEdgeIfNotExtending(direction, extend) { return collapsed }
    if let mounted = mountedEditor as Node? {
      if let target = TextEditorLayouts.MoveHorizontal(mounted, selection.Active, direction) {
        return placeSelection(target.Offset, target.Affinity, extend, false)
      }
    }
    let target = direction < 0
    ? previousDocumentElement(selection.Active.Offset) : nextDocumentElement(selection.Active.Offset)
    return placeSelection(target, direction < 0 ? TextAffinity.Upstream : TextAffinity.Downstream, extend, false)
  }

  private func moveWord(direction int32, extend bool) bool {
    if let collapsed = collapseToEdgeIfNotExtending(direction, extend) { return collapsed }
    let target = direction < 0 ? previousWord(selection.Active.Offset) : nextWord(selection.Active.Offset)
    return placeSelection(target, direction < 0 ? TextAffinity.Upstream : TextAffinity.Downstream, extend, false)
  }

  private func collapseToEdgeIfNotExtending(direction int32, extend bool) bool? {
    let textRange = selectedRange()
    if textRange.Length != 0 && !extend {
      return placeSelection(direction < 0 ? textRange.Start : textRange.Start + textRange.Length,
        direction < 0 ? TextAffinity.Upstream : TextAffinity.Downstream, false, false)
    }
    return nil
  }

  private func moveVertical(lines int32, extend bool) bool {
    if let mounted = mountedEditor as Node? {
      let contentLeft = TextLayouts.ContentLeft(mounted) - mounted.Rect.X
      if !hasDesiredHorizontalPosition {
        let rect = TextEditorLayouts.CaretRect(mounted, selection.Active)
        desiredHorizontalPosition = float64(rect.X - contentLeft + float32(scrollTargetX))
        hasDesiredHorizontalPosition = true
      }
      if let target = TextEditorLayouts.MoveVertical(mounted, selection.Active,
        float32(desiredHorizontalPosition), lines) {
          return placeSelection(target.Offset, target.Affinity, extend, true)
        }
    }
    let current = document.GetLineIndex(selection.Active.Offset)
    let target = Math.Clamp(current + lines, 0, document.LineCount - 1)
    if !hasDesiredHorizontalPosition {
      desiredHorizontalPosition = lineColumn(current, selection.Active.Offset)
      hasDesiredHorizontalPosition = true
    }
    let targetOffset = offsetAtColumn(target, desiredHorizontalPosition)
    return placeSelection(targetOffset, TextAffinity.Downstream, extend, true)
  }

  private func moveLineEdge(end bool, extend bool) bool {
    let line = document.GetLineIndex(selection.Active.Offset)
    let lineRange = document.GetLineRange(line)
    return placeSelection(end ? lineRange.Start + lineRange.Length : lineRange.Start,
      end ? TextAffinity.Downstream : TextAffinity.Upstream, extend, false)
  }

  private func selectAllDefault() bool {
    let next = TextSelection{
      Anchor: TextPosition{ Offset: 0, Affinity: TextAffinity.Upstream },
      Active: TextPosition{ Offset: document.Length, Affinity: TextAffinity.Downstream },
    }
    setSelection(next, true)
    return true
  }

  private func cutDefault() bool {
    let textRange = selectedRange()
    if textRange.Length == 0 { return true }
    applyTextChange(TextCommandKind.Cut, TextChange{ Range: textRange, InsertedText: "" })
    composition = nil
    return true
  }

  private func undoDefault() bool {
    breakUndoGroup()
    applyingDocumentEdit = true
    var result = false
    try {
      result = document.Undo()
    } finally {
      applyingDocumentEdit = false
    }
    if result { changed() }
    return result
  }

  private func redoDefault() bool {
    breakUndoGroup()
    applyingDocumentEdit = true
    var result = false
    try {
      result = document.Redo()
    } finally {
      applyingDocumentEdit = false
    }
    if result { changed() }
    return result
  }

  private func indentDefault(outdent bool) bool {
    let textRange = selectedRange()
    let first = document.GetLineIndex(textRange.Start)
    var last = document.GetLineIndex(textRange.Start + textRange.Length)
    if textRange.Length != 0 && last > first && document.GetLineRange(last).Start == textRange.Start + textRange.Length {
      last--
    }
    let changes = List[TextChange]()
    for line in first ... last + 1 {
      let lineRange = document.GetLineRange(line)
      let lineText = document.GetLineText(line)
      if !outdent {
        changes.Add(TextChange{ Range: TextRange{ Start: lineRange.Start, Length: 0 }, InsertedText: "\t" })
      } else if lineText.StartsWith("\t") {
        changes.Add(TextChange{ Range: TextRange{ Start: lineRange.Start, Length: 1 }, InsertedText: "" })
      } else {
        var count int32 = 0
        while count < lineText.Length && count < 4 && lineText[count] == ' ' { count++ }
        if count != 0 {
          changes.Add(TextChange{ Range: TextRange{ Start: lineRange.Start, Length: count }, InsertedText: "" })
        }
      }
    }
    if changes.Count == 0 { return true }
    let committed = outdent && mountedEditor != nil
    ? expandAtomicDeletions(changes) : changes.ToArray()
    let group = beginEditGroup(outdent ? TextCommandKind.Outdent : TextCommandKind.Indent)
    applyingDocumentEdit = true
    try {
      document.ApplyControllerTransaction(committed, group)
    } finally {
      applyingDocumentEdit = false
    }
    changed()
    return true
  }

  private func expandAtomicDeletions(changes List[TextChange]) []TextChange {
    guard let mounted = mountedEditor as Node else { return changes.ToArray() }
    let result = List[TextChange]()
    for change in changes {
      let textRange = TextEditorLayouts.ExpandAtomicRange(mounted, change.Range)
      if result.Count != 0 {
        let index = result.Count - 1
        let previous = result[index]
        let previousEnd = previous.Range.Start + previous.Range.Length
        if textRange.Start <= previousEnd {
          let nextEnd = textRange.Start + textRange.Length
          let end = Math.Max(nextEnd, previousEnd)
          result[index] = TextChange{ Range: TextRange{ Start: previous.Range.Start,
            Length: end - previous.Range.Start }, InsertedText: "" }
          continue
        }
      }
      result.Add(TextChange{ Range: textRange, InsertedText: "" })
    }
    return result.ToArray()
  }

  private func beginCompositionDefault() bool {
    if composition != nil { return true }
    breakUndoGroup()
    composition = TextComposition{ Range: selectedRange(), Text: "", SelectionStart: 0, SelectionLength: 0 }
    changed()
    return true
  }

  private func updateCompositionDefault(text string, selectionStart int32, selectionLength int32) bool {
    if text == nil { throw ArgumentNullException("text") }
    if selectionStart < 0 || selectionLength < 0 || selectionStart > text.Length - selectionLength {
      throw ArgumentOutOfRangeException("selectionStart")
    }
    let selectionEnd = selectionStart + selectionLength
    if !wellFormedUtf16(text) || !graphemeBoundary(text, selectionStart)
      || !graphemeBoundary(text, selectionEnd) {
        throw ArgumentException("Composition selection must use grapheme boundaries", "selectionStart")
      }
    if composition == nil { beginCompositionDefault() }
    let textRange = composition!!.Range
    composition = TextComposition{
      Range: textRange,
      Text: text,
      SelectionStart: selectionStart,
      SelectionLength: selectionLength,
    }
    changed()
    return true
  }

  private func commitCompositionDefault(text string?) bool {
    let textRange = if let current = composition { current.Range } else { selectedRange() }
    let committed = if let value = text { value }
    else if let current = composition { current.Text }
    else { "" }
    applyTextChange(TextCommandKind.CommitComposition,
      TextChange{ Range: textRange, InsertedText: committed })
    composition = nil
    changed()
    return true
  }

  private func cancelCompositionDefault() bool {
    if composition == nil { return true }
    composition = nil
    breakUndoGroup()
    changed()
    return true
  }

  private func applyTextChange(kind TextCommandKind, change TextChange) {
    var actual = change
    if change.Range.Length != 0 {
      if let mounted = mountedEditor as Node? {
        actual = TextChange{ Range: TextEditorLayouts.ExpandAtomicRange(
          mounted, change.Range), InsertedText: change.InsertedText }
      }
    }
    let group = beginEditGroup(kind)
    applyingDocumentEdit = true
    replacingSelection = true
    try {
      document.ApplyControllerTransaction([]TextChange{ actual }, group)
    } finally {
      replacingSelection = false
      applyingDocumentEdit = false
    }
    let caret = actual.Range.Start + actual.InsertedText.Length
    selection = TextSelection{
      Anchor: TextPosition{ Offset: caret, Affinity: TextAffinity.Downstream },
      Active: TextPosition{ Offset: caret, Affinity: TextAffinity.Downstream },
    }
    hasDesiredHorizontalPosition = false
    followCaret()
    changed()
  }

  private func beginEditGroup(kind TextCommandKind) object {
    if !coalescesEdit(kind) {
      breakUndoGroup()
      return Object()
    }
    if undoGroup == nil || undoCommand != kind {
      undoGroup = Object()
    }
    undoCommand = kind
    return undoGroup!!
  }

  private func coalescesEdit(kind TextCommandKind) bool -> kind == TextCommandKind.Insert
    || kind == TextCommandKind.DeleteBackward
    || kind == TextCommandKind.DeleteForward
    || kind == TextCommandKind.DeleteWordBackward
    || kind == TextCommandKind.DeleteWordForward

  private func breakUndoGroup() {
    undoGroup = nil
    undoCommand = TextCommandKind.Insert
  }

  private func placeSelection(offset int32, affinity TextAffinity, extend bool, preserveDesired bool) bool {
    let active = normalizePosition(TextPosition{ Offset: offset, Affinity: affinity })
    let next = TextSelection{
      Anchor: extend ? selection.Anchor : active,
      Active: active,
    }
    if sameSelection(selection, next) { return true }
    selection = next
    if !preserveDesired { hasDesiredHorizontalPosition = false }
    breakUndoGroup()
    followCaret()
    changed()
    return true
  }

  private func setSelection(value TextSelection, breakUndo bool) {
    let next = TextSelection{
      Anchor: normalizePosition(value.Anchor),
      Active: normalizePosition(value.Active),
    }
    if !sameSelection(selection, next) {
      selection = next
      hasDesiredHorizontalPosition = false
      if breakUndo { breakUndoGroup() }
      followCaret()
      changed()
    }
  }

  private func normalizePosition(position TextPosition) TextPosition {
    if int32(position.Affinity) < int32(TextAffinity.Upstream) || int32(position.Affinity) > int32(TextAffinity.Downstream) {
      throw ArgumentOutOfRangeException("position")
    }
    if !documentGraphemeBoundary(position.Offset) {
      throw ArgumentException("Position must be at a grapheme boundary", "position")
    }
    return position
  }

  private func onDocumentChanged(change TextDocumentChange) {
    if replacingSelection {
      return
    }
    selection = TextSelection{
      Anchor: snapRebasedPosition(rebaseTextPosition(selection.Anchor, change.Changes)),
      Active: snapRebasedPosition(rebaseTextPosition(selection.Active, change.Changes)),
    }
    if let current = composition {
      let nextRange = rebaseTextRange(current.Range, change.Changes)
      let effective TextSelection? = if let selected = current.EffectiveSelection {
        TextSelection{
          Anchor: rebaseCompositionPosition(selected.Anchor, current, nextRange, change.Changes),
          Active: rebaseCompositionPosition(selected.Active, current, nextRange, change.Changes),
        }
      } else { nil }
      composition = TextComposition{
        Range: nextRange,
        Text: current.Text,
        SelectionStart: current.SelectionStart,
        SelectionLength: current.SelectionLength,
        EffectiveSelection: effective,
      }
    }
    breakUndoGroup()
    changed()
  }

  private func rebaseCompositionPosition(position TextPosition, current TextComposition,
    nextRange TextRange, changes IReadOnlyList[TextChange]) TextPosition{
      let start = current.Range.Start
      let end = start + current.Text.Length
      if position.Offset >= start && position.Offset <= end {
        return TextPosition{ Offset: nextRange.Start + position.Offset - start,
          Affinity: position.Affinity }
      }
      let sourceOffset = position.Offset < start ? position.Offset : position.Offset - current.Text.Length + current.Range.Length
      let source = snapRebasedPosition(rebaseTextPosition(TextPosition{
        Offset: sourceOffset, Affinity: position.Affinity }, changes))
      let nextEnd = nextRange.Start + nextRange.Length
      var offset = source.Offset
      if offset > nextEnd || (offset == nextEnd
          && (nextRange.Length > 0 || source.Affinity == TextAffinity.Downstream)) {
            offset = offset - nextRange.Length + current.Text.Length
          } else if offset > nextRange.Start {
            offset = source.Affinity == TextAffinity.Upstream ? nextRange.Start : nextRange.Start + current.Text.Length
          }
      return TextPosition{ Offset: offset, Affinity: source.Affinity }
    }

  private func selectedRange() TextRange {
    let a = selection.Anchor.Offset
    let b = selection.Active.Offset
    return TextRange{ Start: Math.Min(a, b), Length: Math.Abs(a - b) }
  }

  private func snapRebasedPosition(position TextPosition) TextPosition {
    if documentGraphemeBoundary(position.Offset) { return position }
    let offset = position.Affinity == TextAffinity.Upstream
    ? previousDocumentElement(position.Offset) : nextDocumentElement(position.Offset)
    return TextPosition{ Offset: offset, Affinity: position.Affinity }
  }

  private func selectedText() string -> document.GetText(selectedRange())

  private func overwriteRange(text string) TextRange {
    var end = selection.Active.Offset
    let starts = UnicodeGraphemes.Starts(text)
    for i in 0 ... starts.Length {
      end = nextDocumentElement(end)
    }
    return TextRange{ Start: selection.Active.Offset, Length: end - selection.Active.Offset }
  }

  private func documentGraphemeBoundary(offset int32) bool {
    validateTextOffset(document.SnapshotRoot(), offset)
    if offset == 0 || offset == document.Length { return true }
    if safeWordWindowBoundary(offset) { return true }
    var window int32 = 256
    while true {
      let start = wordWindowStart(offset, window)
      if start >= 0 {
        var end = offset + 16
        if end > document.Length { end = document.Length }
        if end < document.Length && Char.IsLowSurrogate(textCharAt(document.SnapshotRoot(), end)) {
          end--
        }
        let text = document.GetText(TextRange{ Start: start, Length: end - start })
        return graphemeBoundary(text, offset - start)
      }
      if window >= offset { return false }
      window = growWordWindow(window, offset)
    }
  }

  private func previousDocumentElement(offset int32) int32 {
    if offset <= 0 { return 0 }
    let line = document.GetLineIndex(offset)
    let textRange = document.GetLineRange(line)
    let end = textRange.Start + textRange.Length
    if offset > end { return end }
    if offset > textRange.Start {
      let text = document.GetText(textRange)
      return textRange.Start + previousElement(text, offset - textRange.Start)
    }
    if line == 0 { return 0 }
    let prior = document.GetLineRange(line - 1)
    return prior.Start + prior.Length
  }

  private func nextDocumentElement(offset int32) int32 {
    if offset >= document.Length { return document.Length }
    let line = document.GetLineIndex(offset)
    let textRange = document.GetLineRange(line)
    let end = textRange.Start + textRange.Length
    if offset < end {
      let text = document.GetText(textRange)
      return textRange.Start + nextElement(text, offset - textRange.Start)
    }
    if line + 1 < document.LineCount {
      return document.GetLineRange(line + 1).Start
    }
    return document.Length
  }

  private func lineColumn(line int32, offset int32) float64 {
    let lineRange = document.GetLineRange(line)
    let text = document.GetText(lineRange)
    let local = offset - lineRange.Start
    var count int32 = 0
    for start in UnicodeGraphemes.Starts(text) {
      if start >= local { break }
      count++
    }
    return float64(count)
  }

  private func offsetAtColumn(line int32, column float64) int32 {
    let lineRange = document.GetLineRange(line)
    let starts = UnicodeGraphemes.Starts(document.GetText(lineRange))
    let index = int32(column)
    if index <= 0 || starts.Length == 0 { return lineRange.Start }
    if index >= starts.Length { return lineRange.Start + lineRange.Length }
    return lineRange.Start + starts[index]
  }

  private func graphemeBoundary(text string, offset int32) bool {
    if offset == 0 || offset == text.Length { return true }
    for start in UnicodeGraphemes.Starts(text) {
      if start == offset { return true }
      if start > offset { return false }
    }
    return false
  }

  private func wellFormedUtf16(text string) bool {
    var i int32 = 0
    while i < text.Length {
      if Char.IsHighSurrogate(text[i]) {
        if i + 1 >= text.Length || !Char.IsLowSurrogate(text[i + 1]) { return false }
        i = i + 2
      } else {
        if Char.IsLowSurrogate(text[i]) { return false }
        i++
      }
    }
    return true
  }

  private func previousElement(text string, offset int32) int32 {
    var prior int32 = 0
    for start in UnicodeGraphemes.Starts(text) {
      if start >= offset { break }
      prior = start
    }
    return prior
  }

  private func nextElement(text string, offset int32) int32 {
    for start in UnicodeGraphemes.Starts(text) {
      if start > offset { return start }
    }
    return text.Length
  }

  private func previousWord(offset int32) int32 {
    var window int32 = 256
    while true {
      let start = wordWindowStart(offset, window)
      if start >= 0 {
        let text = document.GetText(TextRange{ Start: start, Length: offset - start })
        let local = previousWordInText(text, text.Length)
        if start == 0 || local > 0 { return start + local }
      }
      if window >= offset { return 0 }
      window = growWordWindow(window, offset)
    }
  }

  private func nextWord(offset int32) int32 {
    var window int32 = 256
    let remaining = document.Length - offset
    while true {
      var end = offset + (window < remaining ? window : remaining)
      if end < document.Length && Char.IsLowSurrogate(textCharAt(document.SnapshotRoot(), end)) {
        end--
      }
      let text = document.GetText(TextRange{ Start: offset, Length: end - offset })
      let local = nextWordInText(text, 0)
      if end == document.Length || local < text.Length { return offset + local }
      if window >= remaining { return document.Length }
      window = growWordWindow(window, remaining)
    }
  }

  private func wordWindowStart(offset int32, window int32) int32 {
    var start = offset - window
    if start <= 0 { return 0 }
    if Char.IsLowSurrogate(textCharAt(document.SnapshotRoot(), start)) { start-- }
    var candidate = start
    while candidate < offset {
      if safeWordWindowBoundary(candidate) { return candidate }
      candidate++
    }
    return -1
  }

  private func safeWordWindowBoundary(offset int32) bool {
    let left = textCharAt(document.SnapshotRoot(), offset - 1)
    let right = textCharAt(document.SnapshotRoot(), offset)
    return left <= '\u007F' && right <= '\u007F' && !(left == '\r' && right == '\n')
  }

  private func growWordWindow(window int32, limit int32) int32 {
    if window >= limit { return limit }
    return window > limit / 2 ? limit : window * 2
  }

  private func previousWordInText(text string, offset int32) int32 {
    let starts = UnicodeGraphemes.Starts(text)
    var i = starts.Length
    while i > 0 && starts[i - 1] >= offset { i-- }
    while i > 0 && !wordAt(text, starts[i - 1]) { i-- }
    while i > 0 && wordAt(text, starts[i - 1]) { i-- }
    return i < starts.Length ? starts[i] : 0
  }

  private func nextWordInText(text string, offset int32) int32 {
    let starts = UnicodeGraphemes.Starts(text)
    var i int32 = 0
    while i < starts.Length && starts[i] < offset { i++ }
    while i < starts.Length && !wordAt(text, starts[i]) { i++ }
    while i < starts.Length && wordAt(text, starts[i]) { i++ }
    return i < starts.Length ? starts[i] : text.Length
  }

  private func wordAt(text string, offset int32) bool -> Char.IsLetterOrDigit(text, offset)

  private func sameSelection(left TextSelection, right TextSelection) bool -> left.Anchor.Offset == right.Anchor.Offset
    && left.Anchor.Affinity == right.Anchor.Affinity
    && left.Active.Offset == right.Active.Offset
    && left.Active.Affinity == right.Active.Affinity

  private func changed() {
    Changed?.Invoke()
  }

  private func followCaret() {
    if let mounted = mountedEditor as Node? {
      TextEditorLayouts.FollowCaret(mounted, selection.Active)
    }
  }
}
