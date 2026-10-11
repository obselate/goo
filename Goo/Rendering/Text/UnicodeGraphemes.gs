package Goo

import System
import System.Collections.Generic
import System.Text

internal data struct UnicodeGraphemeScalar(Start int32, End int32,
  Class UnicodeGraphemeClass, InCB UnicodeGraphemeInCB, ExtendedPictographic bool) { }

internal class UnicodeGraphemes {
  shared {
    internal func Starts(text string) []int32 {
      if text == nil { throw ArgumentNullException("text") }
      let scalars = List[UnicodeGraphemeScalar](text.Length)
      let starts = List[int32](text.Length)
      return Starts(text, scalars, starts).ToArray()
    }

    internal func Starts(text string, scalars List[UnicodeGraphemeScalar],
      starts List[int32]) List[int32]{
        if text == nil { throw ArgumentNullException("text") }
        scalars.Clear()
        starts.Clear()
        if scalars.Capacity < text.Length { scalars.Capacity = text.Length }
        if starts.Capacity < text.Length { starts.Capacity = text.Length }
        DecodeScalars(text, scalars)
        if scalars.Count == 0 { return starts }
        starts.Add(0)
        for index in 1 ... scalars.Count {
          if BreakBetween(scalars, index) { starts.Add(scalars[index].Start) }
        }
        return starts
      }

    private func DecodeScalars(text string, scalars List[UnicodeGraphemeScalar]) {
      var cursor int32 = 0
      while cursor < text.Length {
        let _ = Rune.DecodeFromUtf16(text.AsSpan(cursor, text.Length - cursor), out var rune,
          out var consumed)
        let info = UnicodeGraphemeData.Classify(rune.Value)
        scalars.Add(UnicodeGraphemeScalar(cursor, cursor + consumed, info.Class, info.InCB,
          info.ExtendedPictographic))
        cursor = cursor + consumed
      }
    }

    private func BreakBetween(scalars List[UnicodeGraphemeScalar], index int32) bool {
      let left = scalars[index - 1]
      let right = scalars[index]
      if left.Class == UnicodeGraphemeClass.CR && right.Class == UnicodeGraphemeClass.LF {
        return false
      }
      if IsControl(left.Class) || IsControl(right.Class) { return true }
      if left.Class == UnicodeGraphemeClass.L && (right.Class == UnicodeGraphemeClass.L
          || right.Class == UnicodeGraphemeClass.V || right.Class == UnicodeGraphemeClass.LV
          || right.Class == UnicodeGraphemeClass.LVT) { return false }
      if (left.Class == UnicodeGraphemeClass.LV || left.Class == UnicodeGraphemeClass.V)
        && (right.Class == UnicodeGraphemeClass.V || right.Class == UnicodeGraphemeClass.T) {
          return false
        }
      if (left.Class == UnicodeGraphemeClass.LVT || left.Class == UnicodeGraphemeClass.T)
        && right.Class == UnicodeGraphemeClass.T{ return false }
      if right.Class == UnicodeGraphemeClass.Extend || right.Class == UnicodeGraphemeClass.ZWJ {
        return false
      }
      if right.Class == UnicodeGraphemeClass.SpacingMark { return false }
      if left.Class == UnicodeGraphemeClass.Prepend { return false }
      if IsIndicConjunct(scalars, index) { return false }
      if IsExtendedPictographicSequence(scalars, index) { return false }
      if left.Class == UnicodeGraphemeClass.RegionalIndicator
        && right.Class == UnicodeGraphemeClass.RegionalIndicator{
          return !IsRegionalPair(scalars, index)
        }
      return true
    }

    private func IsControl(value UnicodeGraphemeClass) bool -> value == UnicodeGraphemeClass.CR || value == UnicodeGraphemeClass.LF
      || value == UnicodeGraphemeClass.Control

    private func IsIndicConjunct(scalars List[UnicodeGraphemeScalar], index int32) bool {
      if scalars[index].InCB != UnicodeGraphemeInCB.Consonant { return false }
      var cursor = index - 1
      while cursor >= 0 && scalars[cursor].InCB == UnicodeGraphemeInCB.Extend { cursor-- }
      if cursor < 0 || scalars[cursor].InCB != UnicodeGraphemeInCB.Linker { return false }
      cursor--
      while cursor >= 0 {
        while cursor >= 0 && scalars[cursor].InCB == UnicodeGraphemeInCB.Extend { cursor-- }
        if cursor < 0 { return false }
        if scalars[cursor].InCB == UnicodeGraphemeInCB.Consonant { return true }
        if scalars[cursor].InCB != UnicodeGraphemeInCB.Linker { return false }
        cursor--
      }
      return false
    }

    private func IsExtendedPictographicSequence(scalars List[UnicodeGraphemeScalar],
      index int32) bool{
        if !scalars[index].ExtendedPictographic
          || scalars[index - 1].Class != UnicodeGraphemeClass.ZWJ{ return false }
        var cursor = index - 2
        while cursor >= 0 && scalars[cursor].Class == UnicodeGraphemeClass.Extend { cursor-- }
        return cursor >= 0 && scalars[cursor].ExtendedPictographic
      }

    private func IsRegionalPair(scalars List[UnicodeGraphemeScalar], index int32) bool {
      var cursor = index - 1
      var count int32 = 0
      while cursor >= 0 && scalars[cursor].Class == UnicodeGraphemeClass.RegionalIndicator {
        count++
        cursor--
      }
      return count % 2 == 1
    }
  }
}
