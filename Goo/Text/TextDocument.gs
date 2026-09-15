package Goo

import System
import System.Collections.Generic
import System.Text

internal enum TextDocumentMutationKind { Normal; Undo; Redo }

internal data struct TextDocumentMutation(Kind TextDocumentMutationKind,
  Transaction TextHistoryTransaction,
  DiscardedTransactions IReadOnlyList[TextHistoryTransaction]?) { }

/// Provides an immutable, thread-safe view of one text document version.
public class TextSnapshot {
  private let root TextPieceNode?
  private let version int64

  internal init(document TextDocument) {
    if document == nil { throw ArgumentNullException("document") }
    root = document.SnapshotRoot()
    version = document.Version
  }

  /// Gets the version represented by this snapshot.
  public prop Version int64{ get -> version }
  /// Gets the document length in UTF-16 code units.
  public prop Length int32{ get -> textLength(root) }
  /// Gets the number of logical lines.
  public prop LineCount int32{ get -> textLineCount(root) }

  /// Gets all text in this snapshot.
  /// @returns The complete snapshot text.
  public func GetText() string -> rootText(root)

  /// Gets text in a UTF-16 range.
  /// @param textRange The range to read.
  /// @returns The text in the range.
  public func GetText(textRange TextRange) string -> rootTextRange(root, textRange)

  /// Gets the content range of a logical line, excluding its line ending.
  /// @param line The zero-based line index.
  /// @returns The line content range.
  public func GetLineRange(line int32) TextRange -> rootLineRange(root, line)

  /// Gets the content of a logical line, excluding its line ending.
  /// @param line The zero-based line index.
  /// @returns The line content.
  public func GetLineText(line int32) string -> rootLineText(root, line)

  /// Gets the logical line that contains a UTF-16 offset.
  /// @param offset The zero-based UTF-16 offset.
  /// @returns The zero-based line index.
  public func GetLineIndex(offset int32) int32 -> rootLineIndex(root, offset)
}

/// Stores editable text and versioned immutable snapshots.
public class TextDocument {
  private var root TextPieceNode?
  private var version int64
  private let undoHistory List[TextHistoryEntry]
  private let redoHistory List[TextHistoryEntry]
  private let groupHistory List[TextHistoryTransaction]
  private var undoGroupDepth int32
  private var currentMutation TextDocumentMutation?

  /// Occurs after one document transaction commits.
  public event Changed Action[TextDocumentChange]

  // Core observers maintain controller, layer, and view state before application callbacks.
  internal var Committed Action[TextDocumentChange]?

  /// Creates an empty document.
  public init() {
    undoHistory = List[TextHistoryEntry]()
    redoHistory = List[TextHistoryEntry]()
    groupHistory = List[TextHistoryTransaction]()
  }

  /// Creates a document from text without normalizing its line endings.
  /// @param text The initial UTF-16 text.
  public convenience init(text string) {
    init()
    if text == nil { throw ArgumentNullException("text") }
    validateUtf16Text(text, "text")
    if text.Length != 0 {
      root = TextPieceNode(nil, TextPiece(TextPieceBuffer(text, false), 0, text.Length), nil)
    }
  }

  /// Gets the document length in UTF-16 code units.
  public prop Length int32{ get -> textLength(root) }
  /// Gets the number of logical lines.
  public prop LineCount int32{ get -> textLineCount(root) }
  /// Gets the monotonically increasing document version.
  public prop Version int64{ get -> version }
  /// Gets whether an undo operation is available.
  public prop CanUndo bool{ get -> undoHistory.Count != 0 || groupHistory.Count != 0 }
  /// Gets whether a redo operation is available.
  public prop CanRedo bool{ get -> redoHistory.Count != 0 }

  /// Creates an immutable snapshot of the current document version.
  /// @returns The immutable snapshot.
  public func Snapshot() TextSnapshot -> TextSnapshot(this)

  internal func SnapshotRoot() TextPieceNode ? -> root
  internal prop PieceCount int32{ get -> countTextPieces(root) }
  internal prop CurrentMutation TextDocumentMutation? { get -> currentMutation }

  /// Gets all document text.
  /// @returns The complete document text.
  public func GetText() string -> rootText(root)

  /// Gets text in a UTF-16 range.
  /// @param textRange The range to read.
  /// @returns The text in the range.
  public func GetText(textRange TextRange) string -> rootTextRange(root, textRange)

  /// Gets the content range of a logical line, excluding its line ending.
  /// @param line The zero-based line index.
  /// @returns The line content range.
  public func GetLineRange(line int32) TextRange -> rootLineRange(root, line)

  /// Gets the content of a logical line, excluding its line ending.
  /// @param line The zero-based line index.
  /// @returns The line content.
  public func GetLineText(line int32) string -> rootLineText(root, line)

  /// Gets the logical line that contains a UTF-16 offset.
  /// @param offset The zero-based UTF-16 offset.
  /// @returns The zero-based line index.
  public func GetLineIndex(offset int32) int32 -> rootLineIndex(root, offset)

  /// Applies one replacement against the current document version.
  /// @param change The replacement to apply.
  /// @returns The committed change description.
  public func Apply(change TextChange) TextDocumentChange -> ApplyTransaction([]TextChange { change })

  /// Applies ordered, non-overlapping replacements against the current version.
  /// @param changes The replacements, interpreted against the pre-edit snapshot.
  /// @returns The committed change description.
  public func ApplyTransaction(changes []TextChange) TextDocumentChange {
    let committed = applyTransaction(changes, false, true, nil,
      TextDocumentMutationKind.Normal, nil)
    return committed
  }

  internal func ApplyControllerTransaction(changes []TextChange,
    historyGroup object) TextDocumentChange -> applyTransaction(changes, true, true,
      historyGroup, TextDocumentMutationKind.Normal, nil)

  /// Starts an undo group. Nested groups commit when the outer group ends.
  public func BeginUndoGroup() {
    undoGroupDepth++
  }

  /// Ends an undo group and commits its pending edits as one history entry.
  public func EndUndoGroup() {
    if undoGroupDepth == 0 {
      throw InvalidOperationException("No undo group is active")
    }
    undoGroupDepth--
    if undoGroupDepth == 0 {
      commitUndoGroup()
    }
  }

  /// Creates an undo boundary within an active group.
  public func BreakUndoGroup() {
    commitUndoGroup()
  }

  /// Reverts the most recent undo group.
  /// @returns True when a group was reverted.
  public func Undo() bool {
    commitUndoGroup()
    if undoHistory.Count == 0 {
      return false
    }
    let index = undoHistory.Count - 1
    let entry = undoHistory[index]
    undoHistory.RemoveAt(index)
    for i in(entry.Transactions.Count - 1) ... -1 {
      let transaction = entry.Transactions[i]
      applyTransaction(transaction.UndoChanges, true, false, nil,
        TextDocumentMutationKind.Undo, transaction)
    }
    redoHistory.Add(entry)
    return true
  }

  /// Reapplies the most recently reverted undo group.
  /// @returns True when a group was reapplied.
  public func Redo() bool {
    commitUndoGroup()
    if redoHistory.Count == 0 {
      return false
    }
    let index = redoHistory.Count - 1
    let entry = redoHistory[index]
    redoHistory.RemoveAt(index)
    for i in 0 ... entry.Transactions.Count {
      let transaction = entry.Transactions[i]
      applyTransaction(transaction.ForwardChanges, true, false, nil,
        TextDocumentMutationKind.Redo, transaction)
    }
    undoHistory.Add(entry)
    return true
  }

  private func applyTransaction(changes []TextChange, ownChanges bool, recordHistory bool,
    historyGroup object?, mutationKind TextDocumentMutationKind,
    transaction TextHistoryTransaction?) TextDocumentChange{
      validateTextChanges(root, changes)
      if changes.Length == 0 || noTextChanges(changes) {
        let committedChanges = if ownChanges { changes } else { copyTextChanges(changes) }
        return TextDocumentChange{
          BeforeVersion: version,
          AfterVersion: version,
          Changes: freezeTextChanges(committedChanges),
        }
      }

      let beforeRoot = root
      let beforeVersion = version
      let forward = if ownChanges { changes } else { copyTextChanges(changes) }
      let committedTransaction = if let current = transaction { current }
      else { TextHistoryTransaction(forward, inverseTextChanges(beforeRoot, forward)) }
      var changedRoot = beforeRoot
      for i in(forward.Length - 1) ... -1 {
        changedRoot = replaceText(changedRoot, forward[i])
      }
      root = changedRoot
      version++
      let committed = TextDocumentChange{
        BeforeVersion: beforeVersion,
        AfterVersion: version,
        Changes: freezeTextChanges(forward),
      }
      var discarded IReadOnlyList[TextHistoryTransaction]? = nil
      if recordHistory { discarded = record(committedTransaction, historyGroup) }
      let previousMutation = currentMutation
      currentMutation = TextDocumentMutation{ Kind: mutationKind,
        Transaction: committedTransaction, DiscardedTransactions: discarded }
      try {
        Committed?(committed)
        if Changed != nil {
          Changed(committed)
        }
      } finally {
        currentMutation = previousMutation
      }
      return committed
    }

  private func record(transaction TextHistoryTransaction,
    historyGroup object?) IReadOnlyList[TextHistoryTransaction]? {
      var discarded List[TextHistoryTransaction]? = nil
      if redoHistory.Count != 0 {
        discarded = List[TextHistoryTransaction]()
        for entry in redoHistory {
          for value in entry.Transactions { discarded.Add(value) }
        }
      }
      redoHistory.Clear()
      if undoGroupDepth != 0 {
        groupHistory.Add(transaction)
        return discarded
      }
      if historyGroup != nil && undoHistory.Count != 0 {
        let last = undoHistory[undoHistory.Count - 1]
        if last.Group == historyGroup {
          last.Transactions.Add(transaction)
          return discarded
        }
      }
      let transactions = List[TextHistoryTransaction]{ transaction }
      undoHistory.Add(TextHistoryEntry(transactions, historyGroup))
      return discarded
    }

  private func commitUndoGroup() {
    if groupHistory.Count == 0 {
      return
    }
    undoHistory.Add(TextHistoryEntry(groupHistory, nil))
    groupHistory.Clear()
  }
}

internal sealed class TextHistoryTransaction {
  internal let ForwardChanges []TextChange
  internal let UndoChanges []TextChange

  internal init(forwardChanges []TextChange, undoChanges []TextChange) {
    ForwardChanges = forwardChanges
    UndoChanges = undoChanges
  }
}

internal sealed class TextHistoryEntry {
  internal let Transactions List[TextHistoryTransaction]
  internal let Group object?

  internal init(transactions IReadOnlyList[TextHistoryTransaction], group object?) {
    Transactions = List[TextHistoryTransaction](transactions)
    Group = group
  }
}

internal sealed class TextPieceBuffer {
  private let source string
  private var text []char
  private var length int32
  private var lineEnds []int32
  private var lineEndCount int32
  private let appendable bool

  internal init(value string, canAppend bool) {
    appendable = canAppend
    source = canAppend ? "" : value
    var capacity = value.Length
    if canAppend && capacity < 16 { capacity = 16 }
    text = [canAppend ? capacity : 0]char
    if canAppend { value.CopyTo(0, text, 0, value.Length) }
    length = value.Length
    var count int32 = 0
    for i in 0 ... value.Length {
      if value[i] == '\r' || (value[i] == '\n' && (i == 0 || value[i - 1] != '\r')) {
        count++
      }
    }
    var lineCapacity = count
    if canAppend && lineCapacity < 4 { lineCapacity = 4 }
    lineEnds = [lineCapacity]int32
    for i in 0 ... value.Length {
      if value[i] == '\r' || (value[i] == '\n' && (i == 0 || value[i - 1] != '\r')) {
        lineEnds[lineEndCount] = i
        lineEndCount++
      }
    }
  }

  internal func CharAt(index int32) char -> appendable ? text[index] : source[index]

  internal func AppendTo(builder StringBuilder, start int32, count int32) {
    if appendable { builder.Append(text, start, count) }
    else { builder.Append(source, start, count) }
  }

  internal func CanAppend(offset int32) bool -> appendable && offset == length

  internal func Append(value string) {
    let nextLength = length + value.Length
    ensureTextCapacity(nextLength)
    value.CopyTo(0, text, length, value.Length)
    for i in 0 ... value.Length {
      let offset = length + i
      let current = value[i]
      let previous = offset == 0 ? '\0' : text[offset - 1]
      if current == '\r' || (current == '\n' && previous != '\r') {
        ensureLineCapacity(lineEndCount + 1)
        lineEnds[lineEndCount] = offset
        lineEndCount++
      }
    }
    length = nextLength
  }

  private func ensureTextCapacity(required int32) {
    if text.Length < required {
      var capacity = text.Length == 0 ? 16 : text.Length
      while capacity < required {
        if capacity > 1073741823 { capacity = required }
        else { capacity = capacity * 2 }
      }
      let next = [capacity]char
      Array.Copy(text, next, length)
      text = next
    }
  }

  private func ensureLineCapacity(required int32) {
    if lineEnds.Length < required {
      var capacity = lineEnds.Length == 0 ? 4 : lineEnds.Length
      while capacity < required {
        if capacity > 1073741823 { capacity = required }
        else { capacity = capacity * 2 }
      }
      let next = [capacity]int32
      Array.Copy(lineEnds, next, lineEndCount)
      lineEnds = next
    }
  }

  internal func CountLineBreaks(start int32, length int32) int32 {
    let end = start + length
    var count = lowerBound(lineEnds, lineEndCount, end) - lowerBound(lineEnds, lineEndCount, start)
    if start > 0 && start < this.length && CharAt(start) == '\n' && CharAt(start - 1) == '\r' {
      count++
    }
    return count
  }

  internal func LineBreakStart(start int32, length int32, breakIndex int32) int32 {
    let special = start > 0 && CharAt(start) == '\n' && CharAt(start - 1) == '\r'
    if special && breakIndex == 0 {
      return 0
    }
    let first = lowerBound(lineEnds, lineEndCount, start)
    let index = first + breakIndex - (special ? 1 : 0)
    if index < first || index >= lineEndCount || lineEnds[index] >= start + length {
      throw ArgumentOutOfRangeException("breakIndex")
    }
    return lineEnds[index] - start
  }
}

internal sealed class TextPiece {
  internal let Buffer TextPieceBuffer
  internal let Start int32
  internal let Length int32
  internal let LineBreaks int32
  internal let StartsLf bool
  internal let EndsCr bool

  internal init(buffer TextPieceBuffer, start int32, length int32) {
    Buffer = buffer
    Start = start
    Length = length
    LineBreaks = buffer.CountLineBreaks(start, length)
    StartsLf = buffer.CharAt(start) == '\n'
    EndsCr = buffer.CharAt(start + length - 1) == '\r'
  }

  internal func LineBreaksBefore(length int32) int32 -> Buffer.CountLineBreaks(Start, length)
}

internal sealed class TextPieceNode {
  internal let Left TextPieceNode?
  internal let Piece TextPiece
  internal let Right TextPieceNode?
  internal let Height int32
  internal let Length int32
  internal let LineBreaks int32
  internal let StartsLf bool
  internal let EndsCr bool

  internal init(left TextPieceNode?, piece TextPiece, right TextPieceNode?) {
    Left = left
    Piece = piece
    Right = right
    Height = 1 + Math.Max(textHeight(left), textHeight(right))
    Length = textLength(left) + piece.Length + textLength(right)
    LineBreaks = textLineBreaks(left) + piece.LineBreaks + textLineBreaks(right)
    -joinedCrLf(left, piece) - joinedCrLf(piece, right)
    StartsLf = firstStartsLf(left, piece)
    EndsCr = lastEndsCr(piece, right)
  }
}

internal sealed class TextSplit {
  internal let Left TextPieceNode?
  internal let Right TextPieceNode?

  internal init(left TextPieceNode?, right TextPieceNode?) {
    Left = left
    Right = right
  }
}

internal func copyTextChanges(changes []TextChange) []TextChange {
  let copy = [changes.Length]TextChange
  Array.Copy(changes, copy, changes.Length)
  return copy
}

internal func inverseTextChanges(root TextPieceNode?, changes []TextChange) []TextChange {
  let inverse = [changes.Length]TextChange
  var delta int32 = 0
  for i in 0 ... changes.Length {
    let change = changes[i]
    let deleted = readText(root, change.Range)
    inverse[i] = TextChange{
      Range: TextRange{ Start: change.Range.Start + delta, Length: change.InsertedText.Length },
      InsertedText: deleted,
    }
    delta = delta + change.InsertedText.Length - change.Range.Length
  }
  return inverse
}

internal func noTextChanges(changes []TextChange) bool {
  for i in 0 ... changes.Length {
    if changes[i].Range.Length != 0 || changes[i].InsertedText.Length != 0 {
      return false
    }
  }
  return true
}

internal func replaceText(root TextPieceNode?, change TextChange) TextPieceNode? {
  let beforeAndRest = splitText(root, change.Range.Start)
  let ignoredAndAfter = splitText(beforeAndRest.Right, change.Range.Length)
  if change.InsertedText.Length != 0 && change.Range.Length == 0
    && canExtendLastText(beforeAndRest.Left) {
      let before = beforeAndRest.Left!!
      return joinText(extendLastText(before, change.InsertedText), ignoredAndAfter.Right)
    }
  let inserted TextPieceNode? = if change.InsertedText.Length != 0 {
    let buffer = TextPieceBuffer(change.InsertedText, true)
    TextPieceNode(nil, TextPiece(buffer, 0, change.InsertedText.Length), nil)
  } else {
    nil
  }
  return joinText(joinText(beforeAndRest.Left, inserted), ignoredAndAfter.Right)
}

internal func canExtendLastText(root TextPieceNode?) bool {
  guard let node = root else { return false }
  var last = node
  while let right = last.Right { last = right }
  return last.Piece.Buffer.CanAppend(last.Piece.Start + last.Piece.Length)
}

internal func extendLastText(root TextPieceNode, value string) TextPieceNode {
  if let right = root.Right {
    return TextPieceNode(root.Left, root.Piece, extendLastText(right, value))
  }
  root.Piece.Buffer.Append(value)
  return TextPieceNode(root.Left, TextPiece(root.Piece.Buffer, root.Piece.Start,
    root.Piece.Length + value.Length), nil)
}

internal func splitText(root TextPieceNode?, offset int32) TextSplit {
  guard let node = root else {
    return TextSplit(nil, nil)
  }
  let leftLength = textLength(node.Left)
  if offset < leftLength {
    let split = splitText(node.Left, offset)
    return TextSplit(split.Left, joinText(joinText(split.Right, TextPieceNode(nil, node.Piece, nil)), node.Right))
  }
  let pieceEnd = leftLength + node.Piece.Length
  if offset > pieceEnd {
    let split = splitText(node.Right, offset - pieceEnd)
    return TextSplit(joinText(joinText(node.Left, TextPieceNode(nil, node.Piece, nil)), split.Left), split.Right)
  }
  if offset == leftLength {
    return TextSplit(node.Left, joinText(TextPieceNode(nil, node.Piece, nil), node.Right))
  }
  if offset == pieceEnd {
    return TextSplit(joinText(node.Left, TextPieceNode(nil, node.Piece, nil)), node.Right)
  }
  let local = offset - leftLength
  let leftPiece = TextPiece(node.Piece.Buffer, node.Piece.Start, local)
  let rightPiece = TextPiece(node.Piece.Buffer, node.Piece.Start + local, node.Piece.Length - local)
  return TextSplit(joinText(node.Left, TextPieceNode(nil, leftPiece, nil)), joinText(TextPieceNode(nil, rightPiece, nil), node.Right))
}

internal func joinText(left TextPieceNode?, right TextPieceNode?) TextPieceNode? {
  guard let leftNode = left else { return right }
  guard let rightNode = right else { return leftNode }
  if textHeight(leftNode) > textHeight(rightNode) + 1 {
    return balanceText(TextPieceNode(leftNode.Left, leftNode.Piece, joinText(leftNode.Right, rightNode)))
  }
  if textHeight(rightNode) > textHeight(leftNode) + 1 {
    return balanceText(TextPieceNode(joinText(leftNode, rightNode.Left), rightNode.Piece, rightNode.Right))
  }
  let extracted = removeFirstText(rightNode)
  return balanceText(TextPieceNode(leftNode, extracted.First, extracted.Rest))
}

internal sealed class TextFirst {
  internal let First TextPiece
  internal let Rest TextPieceNode?

  internal init(first TextPiece, rest TextPieceNode?) {
    First = first
    Rest = rest
  }
}

internal func removeFirstText(root TextPieceNode) TextFirst {
  guard let left = root.Left else {
    return TextFirst(root.Piece, root.Right)
  }
  let extracted = removeFirstText(left)
  return TextFirst(extracted.First, balanceText(TextPieceNode(extracted.Rest, root.Piece, root.Right)))
}

internal func balanceText(root TextPieceNode) TextPieceNode {
  let difference = textHeight(root.Left) - textHeight(root.Right)
  if difference > 1 {
    let left = root.Left!!
    if textHeight(left.Left) < textHeight(left.Right) {
      let pivot = left.Right!!
      let rotatedLeft = TextPieceNode(left.Left, left.Piece, pivot.Left)
      let rotatedRight = TextPieceNode(pivot.Right, root.Piece, root.Right)
      return TextPieceNode(rotatedLeft, pivot.Piece, rotatedRight)
    }
    let rotatedRight = TextPieceNode(left.Right, root.Piece, root.Right)
    return TextPieceNode(left.Left, left.Piece, rotatedRight)
  }
  if difference < -1 {
    let right = root.Right!!
    if textHeight(right.Right) < textHeight(right.Left) {
      let pivot = right.Left!!
      let rotatedLeft = TextPieceNode(root.Left, root.Piece, pivot.Left)
      let rotatedRight = TextPieceNode(pivot.Right, right.Piece, right.Right)
      return TextPieceNode(rotatedLeft, pivot.Piece, rotatedRight)
    }
    let rotatedLeft = TextPieceNode(root.Left, root.Piece, right.Left)
    return TextPieceNode(rotatedLeft, right.Piece, right.Right)
  }
  return root
}

internal func textHeight(root TextPieceNode?) int32 {
  guard let node = root else { return 0 }
  return node.Height
}

internal func textLength(root TextPieceNode?) int32 {
  guard let node = root else { return 0 }
  return node.Length
}

internal func countTextPieces(root TextPieceNode?) int32 {
  guard let node = root else { return 0 }
  return countTextPieces(node.Left) + 1 + countTextPieces(node.Right)
}

internal func textLineBreaks(root TextPieceNode?) int32 {
  guard let node = root else { return 0 }
  return node.LineBreaks
}

internal func textLineCount(root TextPieceNode?) int32 -> textLineBreaks(root) + 1

internal func joinedCrLf(left TextPieceNode?, right TextPiece) int32 {
  guard let leftNode = left else { return 0 }
  return leftNode.EndsCr && right.StartsLf ? 1 : 0
}

internal func joinedCrLf(left TextPiece, right TextPieceNode?) int32 {
  guard let rightNode = right else { return 0 }
  return left.EndsCr && rightNode.StartsLf ? 1 : 0
}

internal func firstStartsLf(left TextPieceNode?, piece TextPiece) bool {
  guard let node = left else { return piece.StartsLf }
  return node.StartsLf
}

internal func lastEndsCr(piece TextPiece, right TextPieceNode?) bool {
  guard let node = right else { return piece.EndsCr }
  return node.EndsCr
}

internal func rootText(root TextPieceNode?) string -> readText(root, TextRange { Start: 0, Length: textLength(root) })

internal func rootTextRange(root TextPieceNode?, textRange TextRange) string {
  validateTextRange(root, textRange)
  return readText(root, textRange)
}

internal func rootLineRange(root TextPieceNode?, line int32) TextRange -> findLineRange(root, line)

internal func rootLineText(root TextPieceNode?, line int32) string -> readText(root, rootLineRange(root, line))

internal func rootLineIndex(root TextPieceNode?, offset int32) int32 {
  validateTextOffset(root, offset)
  return findLineIndex(root, offset)
}

internal func readText(root TextPieceNode?, textRange TextRange) string {
  if textRange.Length == 0 {
    return ""
  }
  let builder = StringBuilder(textRange.Length)
  appendText(root, textRange.Start, textRange.Start + textRange.Length, builder)
  return builder.ToString()
}

internal func appendText(root TextPieceNode?, start int32, end int32, builder StringBuilder) {
  guard let node = root else { return }
  let leftLength = textLength(node.Left)
  if start < leftLength {
    appendText(node.Left, start, end < leftLength ? end : leftLength, builder)
  }
  let pieceStart = leftLength
  let pieceEnd = pieceStart + node.Piece.Length
  if start < pieceEnd && end > pieceStart {
    let localStart = start > pieceStart ? start - pieceStart : 0
    let localEnd = end < pieceEnd ? end - pieceStart : node.Piece.Length
    node.Piece.Buffer.AppendTo(builder, node.Piece.Start + localStart, localEnd - localStart)
  }
  if end > pieceEnd {
    let rightStart = start > pieceEnd ? start - pieceEnd : 0
    appendText(node.Right, rightStart, end - pieceEnd, builder)
  }
}

internal func findLineRange(root TextPieceNode?, line int32) TextRange {
  let count = textLineCount(root)
  if line < 0 || line >= count {
    throw ArgumentOutOfRangeException("line")
  }
  let start = line == 0 ? 0 : lineStartAfter(root, line - 1)
  let ending = line == count - 1 ? textLength(root) : findTextLineBreakStart(root, line)
  return TextRange{ Start: start, Length: ending - start }
}

internal func findLineIndex(root TextPieceNode?, offset int32) int32 {
  let count = countTextLineBreaksBefore(root, offset, false)
  if offset > 0 && offset < textLength(root)
    && textCharAt(root, offset - 1) == '\r' && textCharAt(root, offset) == '\n' {
      return count - 1
    }
  return count
}

internal func lineStartAfter(root TextPieceNode?, breakIndex int32) int32 {
  let start = findTextLineBreakStart(root, breakIndex)
  let next = start + 1
  if textCharAt(root, start) == '\r' && next < textLength(root) && textCharAt(root, next) == '\n' {
    return next + 1
  }
  return next
}

internal func findTextLineBreakStart(root TextPieceNode?, breakIndex int32) int32 {
  if breakIndex < 0 || breakIndex >= textLineBreaks(root) {
    throw ArgumentOutOfRangeException("breakIndex")
  }
  return findTextLineBreakStart(root!!, breakIndex, 0)
}

internal func findTextLineBreakStart(root TextPieceNode, breakIndex int32, prefix int32) int32 {
  let left = root.Left
  let leftBreaks = textLineBreaks(left)
  if breakIndex < leftBreaks {
    return findTextLineBreakStart(left!!, breakIndex, prefix)
  }
  let leftLength = textLength(left)
  var remaining = breakIndex - leftBreaks
  let skipPieceStart = (left?.EndsCr ?? false) && root.Piece.StartsLf ? 1 : 0
  let pieceBreaks = root.Piece.LineBreaks - skipPieceStart
  if remaining < pieceBreaks {
    return prefix + leftLength + findPieceLineBreakStart(root.Piece, remaining + skipPieceStart)
  }
  remaining = remaining - pieceBreaks
  let right = root.Right!!
  let skipRightStart = right.StartsLf && root.Piece.EndsCr ? 1 : 0
  return findTextLineBreakStart(right, remaining + skipRightStart, prefix + leftLength + root.Piece.Length)
}

internal func findPieceLineBreakStart(piece TextPiece, breakIndex int32) int32 -> piece.Buffer.LineBreakStart(piece.Start, piece.Length, breakIndex)

internal func countTextLineBreaksBefore(root TextPieceNode?, offset int32, predecessorEndsCr bool) int32 {
  if offset <= 0 { return 0 }
  guard let node = root else { return 0 }
  let left = node.Left
  let leftLength = textLength(left)
  if offset <= leftLength {
    return countTextLineBreaksBefore(left, offset, predecessorEndsCr)
  }
  var count = textLineBreaks(left)
  var previousEndsCr = predecessorEndsCr
  if let leftNode = left {
    if predecessorEndsCr && leftNode.StartsLf {
      count--
    }
    previousEndsCr = leftNode.EndsCr
  }
  let intoPiece = offset - leftLength
  let skipPieceStart = previousEndsCr && node.Piece.StartsLf ? 1 : 0
  if intoPiece <= node.Piece.Length {
    let pieceCount = node.Piece.LineBreaksBefore(intoPiece)
    return count + pieceCount - (skipPieceStart != 0 && intoPiece != 0 ? 1 : 0)
  }
  count = count + node.Piece.LineBreaks - skipPieceStart
  return count + countTextLineBreaksBefore(node.Right, intoPiece - node.Piece.Length, node.Piece.EndsCr)
}

internal func textCharAt(root TextPieceNode?, offset int32) char {
  var current = root
  var local = offset
  while let node = current {
    let leftLength = textLength(node.Left)
    if local < leftLength {
      current = node.Left
      continue
    }
    let afterLeft = local - leftLength
    if afterLeft < node.Piece.Length {
      return node.Piece.Buffer.CharAt(node.Piece.Start + afterLeft)
    }
    local = afterLeft - node.Piece.Length
    current = node.Right
  }
  throw ArgumentOutOfRangeException("offset")
}

internal func validateTextChanges(root TextPieceNode?, changes []TextChange) {
  var previousEnd int32 = 0
  for i in 0 ... changes.Length {
    let change = changes[i]
    validateTextRange(root, change.Range)
    validateUtf16Text(change.InsertedText, "changes")
    if i != 0 && change.Range.Start < previousEnd {
      throw ArgumentException("Changes must be ordered and non-overlapping", "changes")
    }
    previousEnd = change.Range.Start + change.Range.Length
  }
}

internal func validateTextRange(root TextPieceNode?, textRange TextRange) {
  if textRange.Start < 0 || textRange.Length < 0 || textRange.Start > textLength(root) - textRange.Length {
    throw ArgumentOutOfRangeException("textRange")
  }
  validateTextOffset(root, textRange.Start)
  validateTextOffset(root, textRange.Start + textRange.Length)
}

internal func validateTextOffset(root TextPieceNode?, offset int32) {
  let length = textLength(root)
  if offset < 0 || offset > length {
    throw ArgumentOutOfRangeException("offset")
  }
  if offset != 0 && offset != length
    && Char.IsHighSurrogate(textCharAt(root, offset - 1)) && Char.IsLowSurrogate(textCharAt(root, offset)) {
      throw ArgumentOutOfRangeException("offset")
    }
}

internal func validateUtf16Text(text string, name string) {
  if text == nil { throw ArgumentNullException(name) }
  var index int32 = 0
  while index < text.Length {
    let current = text[index]
    if Char.IsHighSurrogate(current) {
      if index + 1 >= text.Length || !Char.IsLowSurrogate(text[index + 1]) {
        throw ArgumentException("Text contains an unpaired high surrogate", name)
      }
      index = index + 2
      continue
    }
    if Char.IsLowSurrogate(current) {
      throw ArgumentException("Text contains an unpaired low surrogate", name)
    }
    index++
  }
}

internal func lowerBound(values []int32, count int32, target int32) int32 {
  var low int32 = 0
  var high = count
  while low < high {
    let middle = low + (high - low) / 2
    if values[middle] < target {
      low = middle + 1
    } else {
      high = middle
    }
  }
  return low
}
