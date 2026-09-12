package Goo

import System
import System.Collections.Generic
import System.Threading

internal enum TextProjectionKind { Replacement; Hidden; InlineSlot; BlockSlot }

internal data struct TextStyleSpan(Key string, Range TextRange, Style Style) { }

internal data struct TextPresentationLayerChange(Range TextRange, All bool,
  SlotChildrenChanged bool) { }

internal sealed class TextPresentationProjection {
  private var key string
  private var kind TextProjectionKind
  private var textRange TextRange
  private var text string
  private var content Blob?

  internal init(key string, textRange TextRange) {
    if String.IsNullOrEmpty(key) { throw ArgumentException("Key must be non-empty", "key") }
    if textRange.Start < 0 || textRange.Length <= 0 {
      throw ArgumentException("A projection requires a non-empty range", "textRange")
    }
    this.key = key
    kind = TextProjectionKind.Hidden
    this.textRange = textRange
    text = ""
  }

  internal prop Key string{ get -> key }
  internal prop Kind TextProjectionKind{ get -> kind }
  internal prop Range TextRange{ get -> textRange }
  internal prop Text string{ get -> text }
  internal prop Content Blob? { get -> content }

  internal func Update(nextKind TextProjectionKind, nextRange TextRange, nextText string, nextContent Blob?) {
    kind = nextKind
    textRange = nextRange
    text = nextText
    content = nextContent
  }

  internal func Rebase(nextRange TextRange) {
    textRange = nextRange
  }
}

internal sealed class TextProjectionHistory {
  internal let Projection TextPresentationProjection
  internal let Transaction TextHistoryTransaction
  internal let OriginalRange TextRange
  internal let Index int32
  internal var Active bool

  internal init(projection TextPresentationProjection,
    transaction TextHistoryTransaction, index int32, originalRange TextRange) {
      Projection = projection
      Transaction = transaction
      OriginalRange = originalRange
      Index = index
    }
}

internal sealed class TextStyleHistory {
  internal let Key string
  internal let Transaction TextHistoryTransaction
  internal let OriginalRange TextRange
  internal var Active bool

  internal init(key string, transaction TextHistoryTransaction,
    originalRange TextRange) {
      Key = key
      Transaction = transaction
      OriginalRange = originalRange
    }
}

internal sealed class TextStyleRangeEntry {
  internal let Index int32
  internal var Range TextRange

  internal init(index int32, textRange TextRange) {
    Index = index
    Range = textRange
  }
}

/// Owns keyed text styles and atomic source projections for one document.
public class TextPresentationLayer : IDisposable {
  shared {
    private var nextIdentity int64
  }

  private let document TextDocument
  private let identity int64
  private let styleSpans List[TextStyleSpan]
  private let projections List[TextPresentationProjection]
  private let projectionHistory List[TextProjectionHistory]
  private let styleHistory List[TextStyleHistory]
  private let projectionHistoryTransactions Dictionary[TextHistoryTransaction, List[TextProjectionHistory]]
  private let styleHistoryTransactions Dictionary[TextHistoryTransaction, List[TextStyleHistory]]
  private let projectionRangeIndex List[TextPresentationProjection]
  private let styleRangeIndex List[TextStyleRangeEntry]
  private var stylePrefixMaxEnd []int32
  private var cachedStyleSpans [] ? TextStyleSpan
  private var cachedProjections [] ? TextPresentationProjection
  private var revision int64
  private var disposed bool

  internal var Changed((TextPresentationLayerChange) -> void)?

  /// Creates a presentation layer bound to one document.
  /// @param document The document whose source ranges this layer references.
  public init(document TextDocument) {
    if document == nil { throw ArgumentNullException("document") }
    this.document = document
    identity = Interlocked.Increment(ref nextIdentity)
    styleSpans = List[TextStyleSpan]()
    projections = List[TextPresentationProjection]()
    projectionHistory = List[TextProjectionHistory]()
    styleHistory = List[TextStyleHistory]()
    projectionHistoryTransactions = Dictionary[TextHistoryTransaction, List[TextProjectionHistory]]()
    styleHistoryTransactions = Dictionary[TextHistoryTransaction, List[TextStyleHistory]]()
    projectionRangeIndex = List[TextPresentationProjection]()
    styleRangeIndex = List[TextStyleRangeEntry]()
    stylePrefixMaxEnd = []int32{}
    document.Changed += onDocumentChanged
  }

  /// Gets the document whose source ranges this layer references.
  public prop Document TextDocument{ get -> document }
  internal prop Identity int64{ get -> identity }
  /// Gets the monotonic revision of presentation-layer mutations.
  public prop Revision int64{ get -> revision }
  /// Adds or updates a keyed style span.
  /// @param key The stable style-span key.
  /// @param textRange The source range to style.
  /// @param style Inline text fields only. Paragraph and box fields are rejected.
  public func SetStyle(key string, textRange TextRange, style Style) {
    validateKey(key)
    validateRange(textRange)
    validatePresentationStyle(style)
    if style == nil { throw ArgumentNullException("style") }
    discardStyleHistory(key)
    let value = TextStyleSpan{ Key: key, Range: textRange, Style: style }
    let index = styleIndex(key)
    let previous = index < 0 ? textRange : styleSpans[index].Range
    if index < 0 {
      styleSpans.Add(value)
    } else {
      styleSpans[index] = value
    }
    rebuildStyleRangeIndex()
    mutate(rangeUnion(previous, textRange), false)
  }

  /// Removes a keyed style span.
  /// @param key The style-span key.
  /// @returns True when a span was removed.
  public func RemoveStyle(key string) bool {
    discardStyleHistory(key)
    let index = styleIndex(key)
    if index < 0 { return false }
    let removed = styleSpans[index].Range
    styleSpans.RemoveAt(index)
    rebuildStyleRangeIndex()
    mutate(removed, false)
    return true
  }

  /// Adds or updates an atomic source-range text replacement.
  /// @param key The stable projection key.
  /// @param textRange The source range to replace.
  /// @param text The replacement text.
  public func SetReplacement(key string, textRange TextRange, text string) {
    if text == nil { throw ArgumentNullException("text") }
    setProjection(key, TextProjectionKind.Replacement, textRange, text, nil)
  }

  /// Adds or updates a hidden atomic source range.
  /// @param key The stable projection key.
  /// @param textRange The source range to hide.
  public func SetHiddenRange(key string, textRange TextRange) {
    setProjection(key, TextProjectionKind.Hidden, textRange, "", nil)
  }

  /// Adds or updates an atomic inline Goo slot.
  /// @param key The stable projection key.
  /// @param textRange The source range represented by the slot.
  /// @param content The retained inline slot content.
  public func SetInlineSlot(key string, textRange TextRange, content Blob) {
    setProjection(key, TextProjectionKind.InlineSlot, textRange, "", content)
  }

  /// Adds or updates an atomic block Goo slot.
  /// @param key The stable projection key.
  /// @param textRange The source range represented by the slot.
  /// @param content The retained block slot content.
  public func SetBlockSlot(key string, textRange TextRange, content Blob) {
    setProjection(key, TextProjectionKind.BlockSlot, textRange, "", content)
  }

  /// Removes a keyed atomic projection.
  /// @param key The projection key.
  /// @returns True when a projection was removed.
  public func RemoveProjection(key string) bool {
    let index = projectionIndex(key)
    discardProjectionHistory(key)
    if index < 0 { return false }
    let projection = projections[index]
    let removed = projection.Range
    let slotChanged = projection.Kind == TextProjectionKind.InlineSlot
      || projection.Kind == TextProjectionKind.BlockSlot
    projections.RemoveAt(index)
    rebuildProjectionRangeIndex()
    mutate(removed, slotChanged)
    return true
  }

  /// Removes matching style and projection keys.
  /// @param key The key to remove.
  /// @returns True when at least one item was removed.
  public func Remove(key string) bool {
    let style = styleIndex(key)
    let projection = projectionIndex(key)
    discardProjectionHistory(key)
    discardStyleHistory(key)
    if style < 0 && projection < 0 { return false }
    var changedRange = style >= 0 ? styleSpans[style].Range : projections[projection].Range
    let slotChanged = projection >= 0
      && (projections[projection].Kind == TextProjectionKind.InlineSlot
          || projections[projection].Kind == TextProjectionKind.BlockSlot)
    if style >= 0 { styleSpans.RemoveAt(style) }
    if projection >= 0 {
      changedRange = rangeUnion(changedRange, projections[projection].Range)
      projections.RemoveAt(projection)
    }
    if style >= 0 { rebuildStyleRangeIndex() }
    if projection >= 0 { rebuildProjectionRangeIndex() }
    mutate(changedRange, slotChanged)
    return true
  }

  /// Removes every style span and atomic projection from this layer.
  public func Clear() {
    projectionHistory.Clear()
    styleHistory.Clear()
    projectionHistoryTransactions.Clear()
    styleHistoryTransactions.Clear()
    if styleSpans.Count != 0 || projections.Count != 0 {
      var slotChanged = false
      for projection in projections {
        if projection.Kind == TextProjectionKind.InlineSlot
          || projection.Kind == TextProjectionKind.BlockSlot{
            slotChanged = true
            break
          }
      }
      styleSpans.Clear()
      projections.Clear()
      styleRangeIndex.Clear()
      stylePrefixMaxEnd = []int32{}
      projectionRangeIndex.Clear()
      mutateAll(slotChanged)
    }
  }

  /// Releases document subscriptions held by this layer.
  public func Dispose() {
    if !disposed {
      disposed = true
      document.Changed -= onDocumentChanged
      projectionHistory.Clear()
      styleHistory.Clear()
      projectionHistoryTransactions.Clear()
      styleHistoryTransactions.Clear()
    }
  }

  internal func ReadStyleSpans() []TextStyleSpan {
    if cachedStyleSpans == nil { cachedStyleSpans = styleSpans.ToArray() }
    return cachedStyleSpans!!
  }

  internal func ReadProjections() []TextPresentationProjection {
    if cachedProjections == nil { cachedProjections = projections.ToArray() }
    return cachedProjections!!
  }

  private func setProjection(key string, kind TextProjectionKind, textRange TextRange, text string, content Blob?) {
    validateKey(key)
    validateRange(textRange)
    if textRange.Length == 0 {
      throw ArgumentException("Layout-affecting projections require a non-empty range", "textRange")
    }
    if (kind == TextProjectionKind.InlineSlot || kind == TextProjectionKind.BlockSlot) && content == nil {
      throw ArgumentNullException("content")
    }
    let existing = projectionIndex(key)
    let previous = existing < 0 ? textRange : projections[existing].Range
    let previousSlot = existing >= 0
      && (projections[existing].Kind == TextProjectionKind.InlineSlot
          || projections[existing].Kind == TextProjectionKind.BlockSlot)
    let nextSlot = kind == TextProjectionKind.InlineSlot || kind == TextProjectionKind.BlockSlot
    let slotChanged = previousSlot != nextSlot
      || (nextSlot && (existing < 0 || projections[existing].Content != content))
    ensureProjectionDoesNotOverlap(existing, textRange)
    TextEditorLayerBindings.EnsureNonOverlapping(this, textRange)
    discardProjectionHistory(key)
    if existing < 0 {
      let projection = TextPresentationProjection(key, textRange)
      projection.Update(kind, textRange, text, content)
      projections.Add(projection)
    } else {
      projections[existing].Update(kind, textRange, text, content)
    }
    rebuildProjectionRangeIndex()
    mutate(rangeUnion(previous, textRange), slotChanged)
  }

  private func validateKey(key string) {
    if String.IsNullOrEmpty(key) {
      throw ArgumentException("Key must be non-empty", "key")
    }
  }

  private func validateRange(textRange TextRange) {
    document.GetText(textRange)
  }

  private func ensureProjectionDoesNotOverlap(skipIndex int32, textRange TextRange) {
    for i in 0 ... projections.Count {
      if i == skipIndex || !rangesOverlap(projections[i].Range, textRange) { continue }
      throw ArgumentException("Layout-affecting projections cannot overlap", "range")
    }
  }

  private func rangesOverlap(left TextRange, right TextRange) bool {
    if left.Length == 0 || right.Length == 0 { return false }
    return left.Start < right.Start + right.Length && right.Start < left.Start + left.Length
  }

  private func styleIndex(key string) int32 -> styleSpans.FindIndex(value -> value.Key == key)

  private func projectionIndex(key string) int32 -> projections.FindIndex(value -> value.Key == key)

  private func discardProjectionHistory(key string) {
    projectionHistory.RemoveAll(history -> {
      if history.Projection.Key != key { return false }
      removeProjectionHistoryTransaction(history)
      return true
    })
  }

  private func discardStyleHistory(key string) {
    styleHistory.RemoveAll(history -> {
      if history.Key != key { return false }
      removeStyleHistoryTransaction(history)
      return true
    })
  }

  private func onDocumentChanged(change TextDocumentChange) {
    var changedLayer = false
    var slotChanged = false
    let mutation = document.CurrentMutation
    let firstProjection = firstAffectedProjection(change.Changes)
    for var i = projectionRangeIndex.Count - 1; i >= firstProjection; i-- {
      let projection = projectionRangeIndex[i]
      if textRangeFullyDeleted(projection.Range, change.Changes) {
        let originalRange = projection.Range
        let originalIndex = projectionIndex(projection.Key)
        let isSlot = projection.Kind == TextProjectionKind.InlineSlot
          || projection.Kind == TextProjectionKind.BlockSlot
        if isSlot { slotChanged = true }
        projection.Rebase(rebaseTextRange(projection.Range, change.Changes))
        projections.RemoveAt(originalIndex)
        projectionRangeIndex.RemoveAt(i)
        if let current = mutation {
          var history TextProjectionHistory? = nil
          if current.Kind == TextDocumentMutationKind.Redo {
            history = projectionHistoryFor(projection, current.Transaction)
          } else if current.Kind == TextDocumentMutationKind.Normal {
            discardProjectionHistory(projection.Key)
            let created = TextProjectionHistory(projection, current.Transaction,
              originalIndex, originalRange)
            addProjectionHistory(created)
            history = created
          }
          if let value = history {
            value.Active = false
          }
        }
        changedLayer = true
      } else {
        let next = rebaseNonExpandingRange(projection.Range, change.Changes)
        if next != projection.Range {
          projection.Rebase(next)
          changedLayer = true
        }
      }
    }
    if let current = mutation {
      if current.Kind == TextDocumentMutationKind.Undo
        && projectionHistoryTransactions.TryGetValue(current.Transaction, out var histories) {
          for history in histories {
            if history.Active || !projectionRangeAvailable(history.Projection, history.OriginalRange)
              || !TextEditorLayerBindings.CanRestoreNonOverlapping(this, history.OriginalRange) {
                continue
              }
            history.Projection.Rebase(history.OriginalRange)
            let index = history.Index < projections.Count ? history.Index : projections.Count
            projections.Insert(index, history.Projection)
            insertProjectionRange(history.Projection)
            history.Active = true
            if history.Projection.Kind == TextProjectionKind.InlineSlot
              || history.Projection.Kind == TextProjectionKind.BlockSlot{ slotChanged = true }
            changedLayer = true
          }
        }
    }
    let firstStyle = firstAffectedStyle(change.Changes)
    for i in firstStyle ... styleRangeIndex.Count {
      let indexed = styleRangeIndex[i]
      let span = styleSpans[indexed.Index]
      if span.Range.Start + span.Range.Length < change.Changes[0].Range.Start { continue }
      var restored TextStyleHistory? = nil
      if let current = mutation {
        if current.Kind == TextDocumentMutationKind.Undo {
          let history = styleHistoryFor(span.Key, current.Transaction)
          if history != nil && !history.Active { restored = history }
        }
      }
      if let history = restored {
        styleSpans[indexed.Index] = TextStyleSpan{ Key: span.Key,
          Range: history.OriginalRange, Style: span.Style }
        indexed.Range = history.OriginalRange
        history.Active = true
        changedLayer = true
        continue
      }
      let next = if textRangeFullyDeleted(span.Range, change.Changes) {
        let collapsed = collapseDeletedRange(span.Range, change.Changes)
        if let current = mutation {
          var history TextStyleHistory? = nil
          if current.Kind == TextDocumentMutationKind.Redo {
            history = styleHistoryFor(span.Key, current.Transaction)
          } else if current.Kind == TextDocumentMutationKind.Normal {
            discardStyleHistory(span.Key)
            let created = TextStyleHistory(span.Key, current.Transaction, span.Range)
            addStyleHistory(created)
            history = created
          }
          if let value = history {
            value.Active = false
          }
        }
        collapsed
      } else {
        span.Range.Length == 0
        ? rebaseNonExpandingRange(span.Range, change.Changes) : rebaseTextRange(span.Range, change.Changes)
      }
      if next != span.Range {
        styleSpans[indexed.Index] = TextStyleSpan{ Key: span.Key, Range: next, Style: span.Style }
        indexed.Range = next
        changedLayer = true
      }
    }
    updateStylePrefix(firstStyle)
    if let current = mutation {
      if current.DiscardedTransactions != nil {
        discardHistoryTransactions(current.DiscardedTransactions!!)
      }
    }
    if changedLayer { mutate(documentChangeRange(change.Changes), slotChanged) }
  }

  private func projectionRangeAvailable(value TextPresentationProjection,
    textRange TextRange) bool{
      for projection in projections {
        if projection != value && rangesOverlap(projection.Range, textRange) { return false }
      }
      return true
    }

  private func projectionHistoryFor(projection TextPresentationProjection,
    transaction TextHistoryTransaction) TextProjectionHistory? {
      if projectionHistoryTransactions.TryGetValue(transaction, out var values) {
        for history in values {
          if history.Projection == projection { return history }
        }
      }
      return nil
    }

  private func styleHistoryFor(key string,
    transaction TextHistoryTransaction) TextStyleHistory? {
      if styleHistoryTransactions.TryGetValue(transaction, out var values) {
        for history in values {
          if history.Key == key { return history }
        }
      }
      return nil
    }

  private func addProjectionHistory(history TextProjectionHistory) {
    projectionHistory.Add(history)
    if !projectionHistoryTransactions.TryGetValue(history.Transaction, out var values) {
      values = List[TextProjectionHistory]()
      projectionHistoryTransactions.Add(history.Transaction, values)
    }
    values.Add(history)
  }

  private func addStyleHistory(history TextStyleHistory) {
    styleHistory.Add(history)
    if !styleHistoryTransactions.TryGetValue(history.Transaction, out var values) {
      values = List[TextStyleHistory]()
      styleHistoryTransactions.Add(history.Transaction, values)
    }
    values.Add(history)
  }

  private func removeProjectionHistoryTransaction(history TextProjectionHistory) {
    if projectionHistoryTransactions.TryGetValue(history.Transaction, out var values) {
      values.Remove(history)
      if values.Count == 0 { projectionHistoryTransactions.Remove(history.Transaction) }
    }
  }

  private func removeStyleHistoryTransaction(history TextStyleHistory) {
    if styleHistoryTransactions.TryGetValue(history.Transaction, out var values) {
      values.Remove(history)
      if values.Count == 0 { styleHistoryTransactions.Remove(history.Transaction) }
    }
  }

  private func discardHistoryTransactions(transactions IReadOnlyList[TextHistoryTransaction]) {
    for transaction in transactions {
      if projectionHistoryTransactions.TryGetValue(transaction, out var projectionsForTransaction) {
        for history in projectionsForTransaction { projectionHistory.Remove(history) }
        projectionHistoryTransactions.Remove(transaction)
      }
      if styleHistoryTransactions.TryGetValue(transaction, out var stylesForTransaction) {
        for history in stylesForTransaction { styleHistory.Remove(history) }
        styleHistoryTransactions.Remove(transaction)
      }
    }
  }

  private func rebuildProjectionRangeIndex() {
    projectionRangeIndex.Clear()
    for projection in projections { projectionRangeIndex.Add(projection) }
    for var i = 1; i < projectionRangeIndex.Count; i++ {
      let value = projectionRangeIndex[i]
      var j = i
      while j > 0 && projectionRangeIndex[j - 1].Range.Start > value.Range.Start {
        projectionRangeIndex[j] = projectionRangeIndex[j - 1]
        j--
      }
      projectionRangeIndex[j] = value
    }
  }

  private func insertProjectionRange(value TextPresentationProjection) {
    var low int32 = 0
    var high = projectionRangeIndex.Count
    while low < high {
      let middle = low + (high - low) / 2
      if projectionRangeIndex[middle].Range.Start <= value.Range.Start { low = middle + 1 }
      else { high = middle }
    }
    projectionRangeIndex.Insert(low, value)
  }

  private func rebuildStyleRangeIndex() {
    styleRangeIndex.Clear()
    for i in 0 ... styleSpans.Count {
      styleRangeIndex.Add(TextStyleRangeEntry(i, styleSpans[i].Range))
    }
    for var i = 1; i < styleRangeIndex.Count; i++ {
      let value = styleRangeIndex[i]
      var j = i
      while j > 0 && styleRangeIndex[j - 1].Range.Start > value.Range.Start {
        styleRangeIndex[j] = styleRangeIndex[j - 1]
        j--
      }
      styleRangeIndex[j] = value
    }
    stylePrefixMaxEnd = [styleRangeIndex.Count]int32
    updateStylePrefix(0)
  }

  private func updateStylePrefix(start int32) {
    var maximum = start > 0 ? stylePrefixMaxEnd[start - 1] : Int32.MinValue
    for i in start ... styleRangeIndex.Count {
      let textRange = styleRangeIndex[i].Range
      let end = textRange.Start + textRange.Length
      if end > maximum { maximum = end }
      stylePrefixMaxEnd[i] = maximum
    }
  }

  private func documentChangeRange(changes IReadOnlyList[TextChange]) TextRange {
    var result = changes[0].Range
    for i in 1 ... changes.Count {
      result = rangeUnion(result, changes[i].Range)
    }
    return result
  }

  private func firstAffectedProjection(changes IReadOnlyList[TextChange]) int32 {
    let start = changes[0].Range.Start
    var low int32 = 0
    var high = projectionRangeIndex.Count
    while low < high {
      let middle = low + (high - low) / 2
      if projectionRangeIndex[middle].Range.Start < start { low = middle + 1 }
      else { high = middle }
    }
    if low > 0 {
      let prior = projectionRangeIndex[low - 1].Range
      if prior.Start + prior.Length > start { low-- }
    }
    return low
  }

  private func firstAffectedStyle(changes IReadOnlyList[TextChange]) int32 {
    let start = changes[0].Range.Start
    var low int32 = 0
    var high = styleRangeIndex.Count
    while low < high {
      let middle = low + (high - low) / 2
      if styleRangeIndex[middle].Range.Start < start { low = middle + 1 }
      else { high = middle }
    }
    let after = low
    if after == 0 || stylePrefixMaxEnd[after - 1] < start { return after }
    low = 0
    high = after
    while low < high {
      let middle = low + (high - low) / 2
      if stylePrefixMaxEnd[middle] < start { low = middle + 1 }
      else { high = middle }
    }
    return low
  }

  private func invalidateMaterialized() {
    cachedStyleSpans = nil
    cachedProjections = nil
  }

  private func mutate(textRange TextRange, slotChanged bool) {
    invalidateMaterialized()
    revision++
    let change = TextPresentationLayerChange{ Range: textRange, All: false,
      SlotChildrenChanged: slotChanged }
    if let callback = Changed { callback(change) }
    TextEditorLayerBindings.Changed(this, change)
  }

  private func mutateAll(slotChanged bool) {
    invalidateMaterialized()
    revision++
    let change = TextPresentationLayerChange{ All: true, SlotChildrenChanged: slotChanged }
    if let callback = Changed { callback(change) }
    TextEditorLayerBindings.Changed(this, change)
  }
}

private func validatePresentationStyle(style Style) {
  if style == nil { throw ArgumentNullException("style") }
  if let entries = style.Entries() {
    for i in 0 ... entries.Count {
      let entry = entries.At(i)
      if !inlinePresentationStyleField(entry.Field) {
        throw ArgumentException("Text presentation styles support inline text fields only", "style")
      }
    }
  }
}

internal func inlinePresentationStyleField(field StyleField) bool -> field == StyleField.Color || field == StyleField.FontFamily
  || field == StyleField.FontSize || field == StyleField.FontStyle
  || field == StyleField.FontWeight || field == StyleField.LetterSpacing
  || field == StyleField.LineHeight || field == StyleField.TextDecoration
  || field == StyleField.TextShadows || field == StyleField.TextStrokeWidth
  || field == StyleField.TextStrokeColor || field == StyleField.Direction
  || field == StyleField.TextTransform

internal func textEditorSlotKey(layer TextPresentationLayer,
  projection TextPresentationProjection) string -> "\u001Eeditor-slot:" + layer.Identity.ToString() + ":" + projection.Key

private func rebaseNonExpandingRange(textRange TextRange,
  changes IReadOnlyList[TextChange]) TextRange{
    let start = rebaseTextPosition(TextPosition{ Offset: textRange.Start,
      Affinity: TextAffinity.Downstream }, changes)
    let end = rebaseTextPosition(TextPosition{ Offset: textRange.Start + textRange.Length,
      Affinity: TextAffinity.Upstream }, changes)
    return TextRange{ Start: start.Offset,
      Length: Math.Max(0, end.Offset - start.Offset) }
  }

private func collapseDeletedRange(textRange TextRange,
  changes IReadOnlyList[TextChange]) TextRange{
    let start = rebaseTextPosition(TextPosition{ Offset: textRange.Start,
      Affinity: TextAffinity.Upstream }, changes)
    return TextRange{ Start: start.Offset, Length: 0 }
  }

private func rangeUnion(left TextRange, right TextRange) TextRange {
  let start = Math.Min(left.Start, right.Start)
  let leftEnd = left.Start + left.Length
  let rightEnd = right.Start + right.Length
  let end = Math.Max(leftEnd, rightEnd)
  return TextRange{ Start: start, Length: end - start }
}
