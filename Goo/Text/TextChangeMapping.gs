package Goo

import System
import System.Collections.Generic

internal func rebaseTextPosition(position TextPosition, changes IReadOnlyList[TextChange]) TextPosition {
  var delta int32 = 0
  for change in changes {
    let start = change.Range.Start
    let end = start + change.Range.Length
    let inserted = change.InsertedText.Length
    let mappedStart = start + delta
    if position.Offset < start {
      continue
    }
    if position.Offset > end {
      delta = delta + inserted - change.Range.Length
      continue
    }
    if position.Offset == end && change.Range.Length != 0 {
      return TextPosition{ Offset: mappedStart + inserted, Affinity: position.Affinity }
    }
    let offset = position.Affinity == TextAffinity.Downstream ? mappedStart + inserted : mappedStart
    return TextPosition{ Offset: offset, Affinity: position.Affinity }
  }
  return TextPosition{ Offset: position.Offset + delta, Affinity: position.Affinity }
}

internal func rebaseTextRange(textRange TextRange, changes IReadOnlyList[TextChange]) TextRange {
  let start = rebaseTextPosition(
    TextPosition{ Offset: textRange.Start, Affinity: TextAffinity.Upstream }, changes)
  let end = rebaseTextPosition(
    TextPosition{ Offset: textRange.Start + textRange.Length, Affinity: TextAffinity.Downstream }, changes)
  return TextRange{
    Start: start.Offset,
    Length: Math.Max(0, end.Offset - start.Offset),
  }
}

internal func textRangeFullyDeleted(textRange TextRange, changes IReadOnlyList[TextChange]) bool {
  if textRange.Length == 0 {
    return false
  }
  let targetEnd = textRange.Start + textRange.Length
  var covered = textRange.Start
  for change in changes {
    if change.Range.Start >= targetEnd {
      break
    }
    if change.Range.Length == 0 {
      continue
    }
    let changeEnd = change.Range.Start + change.Range.Length
    if changeEnd <= covered {
      continue
    }
    if change.Range.Start > covered {
      return false
    }
    covered = Math.Min(changeEnd, targetEnd)
    if covered == targetEnd {
      return true
    }
  }
  return false
}
