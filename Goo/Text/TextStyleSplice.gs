package Goo

import System
import System.Collections.Generic

internal func spliceTextStyles(existing IReadOnlyList[TextStyleSpan], replaced TextRange,
  text string, inserted IReadOnlyList[TextStyleSpan]) IReadOnlyList[TextStyleSpan] {
    let result = List[TextStyleSpan]()
    let end = replaced.Start + replaced.Length
    let delta = text.Length - replaced.Length
    let suffix = ":" + Guid.NewGuid().ToString("N")
    for span in existing {
      let finish = span.Range.Start + span.Range.Length
      if finish <= replaced.Start {
        result.Add(span)
      } else if span.Range.Start >= end {
        result.Add(TextStyleSpan{ Key: span.Key, Range: TextRange{
          Start: span.Range.Start + delta, Length: span.Range.Length }, Style: span.Style })
      } else {
        if span.Range.Start < replaced.Start {
          result.Add(TextStyleSpan{ Key: span.Key, Range: TextRange{
            Start: span.Range.Start, Length: replaced.Start - span.Range.Start }, Style: span.Style })
        }
        if finish > end {
          result.Add(TextStyleSpan{ Key: span.Key + suffix, Range: TextRange{
            Start: replaced.Start + text.Length, Length: finish - end }, Style: span.Style })
        }
      }
    }
    for i in 0 ... inserted.Count {
      let span = inserted[i]
      let textRange = span.Range
      if textRange.Start < 0 || textRange.Length < 0 || textRange.Start > text.Length - textRange.Length {
        throw ArgumentOutOfRangeException("fragmentRelativeStyles")
      }
      let finish = textRange.Start + textRange.Length
      if (textRange.Start > 0 && textRange.Start < text.Length && Char.IsLowSurrogate(text[textRange.Start]))
        || (finish > 0 && finish < text.Length && Char.IsLowSurrogate(text[finish])) {
          throw ArgumentException("Style ranges must end on UTF-16 boundaries", "fragmentRelativeStyles")
        }
      result.Add(TextStyleSpan{ Key: suffix + ":" + i.ToString(), Range: TextRange{
        Start: replaced.Start + textRange.Start, Length: textRange.Length }, Style: span.Style })
    }
    return result
  }
