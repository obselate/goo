package Goo

import System
import System.Globalization

internal class TextSelectionRanges {
  shared {
    internal func Word(text string, offset int32) TextRange {
      if text.Length == 0 { return TextRange{} }
      let starts = UnicodeGraphemes.Starts(text)
      var index = Array.BinarySearch(starts, Math.Clamp(offset, 0, text.Length - 1))
      if index < 0 { index = ^index - 1 }
      let kind = wordClass(text, starts[index])
      var first = index
      var last = index + 1
      if kind != 4 {
        while first > 0 && wordClass(text, starts[first - 1]) == kind { first-- }
        while last < starts.Length && wordClass(text, starts[last]) == kind { last++ }
      }
      let end = last < starts.Length ? starts[last] : text.Length
      return TextRange{ Start: starts[first], Length: end - starts[first] }
    }

    internal func Line(document TextDocument, offset int32) TextRange {
      let line = document.GetLineIndex(offset)
      let start = document.GetLineRange(line).Start
      let end = line + 1 < document.LineCount ? document.GetLineRange(line + 1).Start : document.Length
      return TextRange{ Start: start, Length: end - start }
    }

    internal func Extend(origin TextRange, target TextRange) TextSelection {
      let backward = target.Start < origin.Start
      return TextSelection{
        Anchor: TextPosition{ Offset: backward ? origin.Start + origin.Length : origin.Start,
          Affinity: backward ? TextAffinity.Downstream : TextAffinity.Upstream },
        Active: TextPosition{ Offset: backward ? target.Start : Math.Max(origin.Start + origin.Length, target.Start + target.Length),
          Affinity: backward ? TextAffinity.Upstream : TextAffinity.Downstream },
      }
    }

    internal func IsWord(text string, offset int32) bool -> wordClass(text, offset) == 0

    private func wordClass(text string, offset int32) int32 {
      let value = text[offset]
      if value == '\r' || value == '\n' { return 4 }
      if Char.IsWhiteSpace(text, offset) { return 1 }
      let category = CharUnicodeInfo.GetUnicodeCategory(text, offset)
      if Char.IsLetterOrDigit(text, offset) || category == UnicodeCategory.ConnectorPunctuation
        || category == UnicodeCategory.NonSpacingMark || category == UnicodeCategory.SpacingCombiningMark {
          return 0
        }
      return Char.IsPunctuation(text, offset) ? 2 : 3
    }
  }
}
