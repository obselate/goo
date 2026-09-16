package Goo

import System
import System.Buffers
import System.Collections.Generic
import System.Text

internal sealed class LineBreakMap {
  internal prop Offsets []int32{ get; set; }

  internal init(offsets []int32) {
    Offsets = offsets
  }

  internal func CanBreak(utf16Offset int32) bool -> Array.BinarySearch(Offsets, utf16Offset) >= 0
}

internal enum TextLineBreakClass {
  AI;
  AK;
  AL;
  AP;
  AS;
  B2;
  BA;
  BB;
  BK;
  CB;
  CJ;
  CL;
  CM;
  CP;
  CR;
  EB;
  EM;
  EX;
  GL;
  H2;
  H3;
  HL;
  HY;
  ID;
  IN;
  IS;
  JL;
  JT;
  JV;
  LF;
  NL;
  NS;
  NU;
  OP;
  PO;
  PR;
  QU;
  RI;
  SA;
  SG;
  SP;
  SY;
  VF;
  VI;
  WJ;
  XX;
  ZW;
  ZWJ;
}

internal enum TextLineBreakAction {
  Prohibited;
  Allowed;
  Mandatory;
}

internal data struct TextLineBreakScalar(Start int32, End int32, Value int32,
  Original TextLineBreakClass, Class TextLineBreakClass, Context uint8,
  JoinedToPrior bool) { }

internal class LineBreakOpportunities {
  shared {
    internal func Resolve(text string) LineBreakMap {
      if text == nil { throw ArgumentNullException("text") }
      if text.Length == 0 {
        let offsets = [1]int32
        offsets[0] = 0
        return LineBreakMap(offsets)
      }

      let scalars = DecodeScalars(text)
      let offsets = List[int32](scalars.Count)
      for i in 0 ... scalars.Count {
        let action = ResolveBoundary(scalars, i)
        let end = scalars[i].End
        if action != TextLineBreakAction.Prohibited {
          offsets.Add(end)
        }
      }
      return LineBreakMap(offsets.ToArray())
    }

    private func DecodeScalars(text string) List[TextLineBreakScalar] {
      let scalars = List[TextLineBreakScalar]()
      var cursor int32 = 0
      while cursor < text.Length {
        let status = Rune.DecodeFromUtf16(text.AsSpan(cursor, text.Length - cursor), out var rune,
          out var consumed)
        if status != OperationStatus.Done {
          throw ArgumentException("Text must contain valid UTF-16.", "text")
        }
        let original = UnicodeLineBreakData.Classify(rune.Value)
        let resolved = ResolveClass(original, rune.Value)
        var effective = resolved
        var joined = false
        if original == TextLineBreakClass.CM || original == TextLineBreakClass.ZWJ {
          if scalars.Count != 0 {
            let prior = scalars[scalars.Count - 1]
            if CanExtend(prior.Class) {
              effective = prior.Class
              joined = true
            }
          }
          if !joined { effective = TextLineBreakClass.AL }
        }
        let end = cursor + consumed
        var context = UnicodeLineBreakContext.Classify(rune.Value)
        if joined { context = scalars[scalars.Count - 1].Context }
        scalars.Add(TextLineBreakScalar(cursor, end, rune.Value, original, effective,
          context, joined))
        cursor = end
      }
      return scalars
    }

    private func ResolveClass(original TextLineBreakClass, value int32) TextLineBreakClass {
      if original == TextLineBreakClass.AI || original == TextLineBreakClass.SG
        || original == TextLineBreakClass.XX{ return TextLineBreakClass.AL }
      if original == TextLineBreakClass.CJ { return TextLineBreakClass.NS }
      if original == TextLineBreakClass.SA {
        return if HasContext(UnicodeLineBreakContext.Classify(value),
          UnicodeLineBreakContext.CombiningMark) { TextLineBreakClass.CM }
        else { TextLineBreakClass.AL }
      }
      return original
    }

    private func CanExtend(value TextLineBreakClass) bool -> value != TextLineBreakClass.BK && value != TextLineBreakClass.CR
      && value != TextLineBreakClass.LF && value != TextLineBreakClass.NL
      && value != TextLineBreakClass.SP && value != TextLineBreakClass.ZW

    private func ResolveBoundary(scalars List[TextLineBreakScalar], leftIndex int32)
    TextLineBreakAction{
      let left = scalars[leftIndex]
      let rightIndex = leftIndex + 1
      if rightIndex >= scalars.Count {
        return if IsHard(left.Original) { TextLineBreakAction.Mandatory }
        else { TextLineBreakAction.Allowed }
      }
      let right = scalars[rightIndex]

      if left.Original == TextLineBreakClass.CR && right.Original == TextLineBreakClass.LF {
        return TextLineBreakAction.Prohibited
      }
      if IsHard(left.Original) { return TextLineBreakAction.Mandatory }
      if IsHard(right.Original) { return TextLineBreakAction.Prohibited }

      if right.Class == TextLineBreakClass.SP || right.Class == TextLineBreakClass.ZW {
        return TextLineBreakAction.Prohibited
      }
      if HasZeroWidthBefore(scalars, leftIndex) { return TextLineBreakAction.Allowed }
      if left.Original == TextLineBreakClass.ZWJ || right.JoinedToPrior {
        return TextLineBreakAction.Prohibited
      }
      if left.Class == TextLineBreakClass.WJ || right.Class == TextLineBreakClass.WJ {
        return TextLineBreakAction.Prohibited
      }
      if left.Class == TextLineBreakClass.GL { return TextLineBreakAction.Prohibited }
      if right.Class == TextLineBreakClass.GL
        && left.Class != TextLineBreakClass.SP
        && left.Class != TextLineBreakClass.BA
        && left.Class != TextLineBreakClass.HY{ return TextLineBreakAction.Prohibited }
      if right.Class == TextLineBreakClass.CL || right.Class == TextLineBreakClass.CP
        || right.Class == TextLineBreakClass.EX || right.Class == TextLineBreakClass.SY{
          return TextLineBreakAction.Prohibited
        }
      if IsAfterOpeningWithSpaces(scalars, leftIndex) { return TextLineBreakAction.Prohibited }
      if IsAfterInitialQuoteWithSpaces(scalars, leftIndex) {
        return TextLineBreakAction.Prohibited
      }
      if IsBeforeFinalQuote(scalars, leftIndex, rightIndex, right) {
        return TextLineBreakAction.Prohibited
      }
      if left.Class == TextLineBreakClass.SP && right.Class == TextLineBreakClass.IS
        && rightIndex + 1 < scalars.Count
        && scalars[rightIndex + 1].Class == TextLineBreakClass.NU{
          return TextLineBreakAction.Allowed
        }
      if right.Class == TextLineBreakClass.IS { return TextLineBreakAction.Prohibited }
      if IsBeforeNonstarterAfterClosing(scalars, leftIndex, right) {
        return TextLineBreakAction.Prohibited
      }
      if IsWithinDoubleHyphen(scalars, leftIndex, right) {
        return TextLineBreakAction.Prohibited
      }
      if left.Class == TextLineBreakClass.SP { return TextLineBreakAction.Allowed }
      if right.Class == TextLineBreakClass.QU && !HasContext(right.Context,
        UnicodeLineBreakContext.InitialQuote) {
          return TextLineBreakAction.Prohibited
        }
      let baseLeft = scalars[BaseIndex(scalars, leftIndex)]
      if baseLeft.Class == TextLineBreakClass.QU && !HasContext(baseLeft.Context,
        UnicodeLineBreakContext.FinalQuote) {
          return TextLineBreakAction.Prohibited
        }
      if IsQuoteAroundNonEastAsian(scalars, leftIndex, rightIndex, left, right) {
        return TextLineBreakAction.Prohibited
      }
      if left.Class == TextLineBreakClass.CB || right.Class == TextLineBreakClass.CB {
        return TextLineBreakAction.Allowed
      }
      if IsWordInitialHyphen(scalars, leftIndex, right) {
        return TextLineBreakAction.Prohibited
      }
      if right.Class == TextLineBreakClass.BA || right.Class == TextLineBreakClass.HY
        || right.Class == TextLineBreakClass.NS || left.Class == TextLineBreakClass.BB{
          return TextLineBreakAction.Prohibited
        }
      if IsHebrewHyphenSequence(scalars, leftIndex, right) {
        return TextLineBreakAction.Prohibited
      }
      if left.Class == TextLineBreakClass.SY && right.Class == TextLineBreakClass.HL {
        return TextLineBreakAction.Prohibited
      }
      if right.Class == TextLineBreakClass.IN { return TextLineBreakAction.Prohibited }
      if IsAlphabetic(left.Class) && right.Class == TextLineBreakClass.NU
        || left.Class == TextLineBreakClass.NU && IsAlphabetic(right.Class) {
          return TextLineBreakAction.Prohibited
        }
      if left.Class == TextLineBreakClass.PR && IsIdeographicOrEmoji(right.Class)
        || IsIdeographicOrEmoji(left.Class) && right.Class == TextLineBreakClass.PO{
          return TextLineBreakAction.Prohibited
        }
      if IsPrefixOrPostfix(left.Class) && IsAlphabetic(right.Class)
        || IsAlphabetic(left.Class) && IsPrefixOrPostfix(right.Class) {
          return TextLineBreakAction.Prohibited
        }
      if IsNumberPattern(scalars, leftIndex, right) { return TextLineBreakAction.Prohibited }
      if IsHangulSequence(left.Class, right.Class) { return TextLineBreakAction.Prohibited }
      if IsHangulNumberSequence(left.Class, right.Class) { return TextLineBreakAction.Prohibited }
      if IsAlphabetic(left.Class) && IsAlphabetic(right.Class) {
        return TextLineBreakAction.Prohibited
      }
      if IsBrahmicSequence(scalars, leftIndex, rightIndex, left, right) {
        return TextLineBreakAction.Prohibited
      }
      if left.Class == TextLineBreakClass.IS && IsAlphabetic(right.Class) {
        return TextLineBreakAction.Prohibited
      }
      if IsParenthesisSequence(left, right) { return TextLineBreakAction.Prohibited }
      if IsRegionalIndicatorPair(scalars, leftIndex, right) {
        return TextLineBreakAction.Prohibited
      }
      if IsEmojiModifierSequence(left, right) { return TextLineBreakAction.Prohibited }
      return TextLineBreakAction.Allowed
    }

    private func HasZeroWidthBefore(scalars List[TextLineBreakScalar], leftIndex int32) bool {
      var index = leftIndex
      while index >= 0 && scalars[index].Class == TextLineBreakClass.SP { index-- }
      return index >= 0 && scalars[index].Class == TextLineBreakClass.ZW
    }

    private func IsAfterOpeningWithSpaces(scalars List[TextLineBreakScalar], leftIndex int32) bool {
      let prior = PreviousNonSpace(scalars, leftIndex)
      return prior >= 0 && scalars[prior].Class == TextLineBreakClass.OP
    }

    private func IsAfterInitialQuoteWithSpaces(scalars List[TextLineBreakScalar], leftIndex int32) bool {
      var quoteIndex = leftIndex
      if scalars[leftIndex].Class == TextLineBreakClass.SP {
        quoteIndex = PreviousNonSpace(scalars, leftIndex)
      }
      if quoteIndex < 0 { return false }
      quoteIndex = BaseIndex(scalars, quoteIndex)
      let quote = scalars[quoteIndex]
      if quote.Class != TextLineBreakClass.QU || !HasContext(quote.Context,
        UnicodeLineBreakContext.InitialQuote) { return false }
      let before = quoteIndex - 1
      if before < 0 { return true }
      let value = scalars[BaseIndex(scalars, before)].Class
      return value == TextLineBreakClass.BK || value == TextLineBreakClass.CR
        || value == TextLineBreakClass.LF || value == TextLineBreakClass.NL
        || value == TextLineBreakClass.OP || value == TextLineBreakClass.QU
        || value == TextLineBreakClass.GL || value == TextLineBreakClass.SP
        || value == TextLineBreakClass.ZW
    }

    private func IsBeforeFinalQuote(scalars List[TextLineBreakScalar], leftIndex int32,
      rightIndex int32, right TextLineBreakScalar) bool{
        if right.Class != TextLineBreakClass.QU || !HasContext(right.Context,
          UnicodeLineBreakContext.FinalQuote) { return false }
        let after = rightIndex + 1
        if after >= scalars.Count { return true }
        let value = scalars[after].Class
        return value == TextLineBreakClass.SP || value == TextLineBreakClass.GL
          || value == TextLineBreakClass.WJ || value == TextLineBreakClass.CL
          || value == TextLineBreakClass.QU || value == TextLineBreakClass.CP
          || value == TextLineBreakClass.EX || value == TextLineBreakClass.IS
          || value == TextLineBreakClass.SY || IsHard(value)
          || value == TextLineBreakClass.ZW
      }

    private func IsBeforeNonstarterAfterClosing(scalars List[TextLineBreakScalar], leftIndex int32,
      right TextLineBreakScalar) bool{
        if right.Class != TextLineBreakClass.NS { return false }
        let prior = PreviousNonSpace(scalars, leftIndex)
        return prior >= 0 && (scalars[prior].Class == TextLineBreakClass.CL
            || scalars[prior].Class == TextLineBreakClass.CP)
      }

    private func IsWithinDoubleHyphen(scalars List[TextLineBreakScalar], leftIndex int32,
      right TextLineBreakScalar) bool{
        if right.Class != TextLineBreakClass.B2 { return false }
        let prior = PreviousNonSpace(scalars, leftIndex)
        return prior >= 0 && scalars[prior].Class == TextLineBreakClass.B2
      }

    private func IsQuoteAroundNonEastAsian(scalars List[TextLineBreakScalar],
      leftIndex int32, rightIndex int32, left TextLineBreakScalar,
      right TextLineBreakScalar) bool{
        if right.Class == TextLineBreakClass.QU {
          if !IsEastAsian(left) { return true }
          let after = rightIndex + 1
          if after >= scalars.Count || !IsEastAsian(scalars[after]) { return true }
        }
        let baseLeftIndex = BaseIndex(scalars, leftIndex)
        let baseLeft = scalars[baseLeftIndex]
        if baseLeft.Class == TextLineBreakClass.QU {
          if !IsEastAsian(right) { return true }
          let before = baseLeftIndex - 1
          if before < 0 || !IsEastAsian(scalars[BaseIndex(scalars, before)]) { return true }
        }
        return false
      }

    private func IsWordInitialHyphen(scalars List[TextLineBreakScalar], leftIndex int32,
      right TextLineBreakScalar) bool{
        if leftIndex < 0 || right.Class != TextLineBreakClass.AL { return false }
        let baseIndex = BaseIndex(scalars, leftIndex)
        let base = scalars[baseIndex]
        if base.Class != TextLineBreakClass.HY && base.Value != 0x2010 { return false }
        let before = baseIndex - 1
        if before < 0 { return true }
        let value = scalars[BaseIndex(scalars, before)].Class
        return value == TextLineBreakClass.BK || value == TextLineBreakClass.CR
          || value == TextLineBreakClass.LF || value == TextLineBreakClass.NL
          || value == TextLineBreakClass.SP || value == TextLineBreakClass.ZW
          || value == TextLineBreakClass.CB || value == TextLineBreakClass.GL
      }

    private func IsHebrewHyphenSequence(scalars List[TextLineBreakScalar], leftIndex int32,
      right TextLineBreakScalar) bool{
        if leftIndex < 1 || right.Class == TextLineBreakClass.HL { return false }
        let left = scalars[leftIndex]
        let before = scalars[leftIndex - 1]
        return before.Class == TextLineBreakClass.HL
          && (left.Class == TextLineBreakClass.HY || left.Class == TextLineBreakClass.BA)
          && (left.Class != TextLineBreakClass.BA || !IsEastAsian(left))
      }

    private func IsNumberPattern(scalars List[TextLineBreakScalar], leftIndex int32,
      right TextLineBreakScalar) bool{
        if right.Class == TextLineBreakClass.PO || right.Class == TextLineBreakClass.PR {
          var cursor = leftIndex
          if scalars[cursor].Class == TextLineBreakClass.CL
            || scalars[cursor].Class == TextLineBreakClass.CP{ cursor-- }
          while cursor >= 0 && (scalars[cursor].Class == TextLineBreakClass.SY
              || scalars[cursor].Class == TextLineBreakClass.IS) { cursor-- }
          if cursor >= 0 && scalars[cursor].Class == TextLineBreakClass.NU { return true }
        }
        if right.Class == TextLineBreakClass.NU {
          let left = scalars[leftIndex].Class
          if left == TextLineBreakClass.HY || left == TextLineBreakClass.IS
            || left == TextLineBreakClass.PO
            || left == TextLineBreakClass.PR{ return true }
          var cursor = leftIndex
          while cursor >= 0 && (scalars[cursor].Class == TextLineBreakClass.SY
              || scalars[cursor].Class == TextLineBreakClass.IS) { cursor-- }
          if cursor >= 0 && scalars[cursor].Class == TextLineBreakClass.NU { return true }
        }
        let left = scalars[leftIndex].Class
        if (left == TextLineBreakClass.PO || left == TextLineBreakClass.PR)
          && right.Class == TextLineBreakClass.OP{
            let after = leftIndex + 2
            if after < scalars.Count && scalars[after].Class == TextLineBreakClass.NU { return true }
            if after + 1 < scalars.Count && scalars[after].Class == TextLineBreakClass.IS
              && scalars[after + 1].Class == TextLineBreakClass.NU{ return true }
          }
        return false
      }

    private func IsHangulSequence(left TextLineBreakClass, right TextLineBreakClass) bool -> left == TextLineBreakClass.JL && (right == TextLineBreakClass.JL
        || right == TextLineBreakClass.JV || right == TextLineBreakClass.H2
        || right == TextLineBreakClass.H3)
      || (left == TextLineBreakClass.JV || left == TextLineBreakClass.H2)
      && (right == TextLineBreakClass.JV || right == TextLineBreakClass.JT)
      || (left == TextLineBreakClass.JT || left == TextLineBreakClass.H3)
      && right == TextLineBreakClass.JT

    private func IsHangulNumberSequence(left TextLineBreakClass, right TextLineBreakClass) bool {
      let leftHangul = left == TextLineBreakClass.JL || left == TextLineBreakClass.JV
        || left == TextLineBreakClass.JT || left == TextLineBreakClass.H2
        || left == TextLineBreakClass.H3
      let rightHangul = right == TextLineBreakClass.JL || right == TextLineBreakClass.JV
        || right == TextLineBreakClass.JT || right == TextLineBreakClass.H2
        || right == TextLineBreakClass.H3
      return leftHangul && right == TextLineBreakClass.PO
        || left == TextLineBreakClass.PR && rightHangul
    }

    private func IsBrahmicSequence(scalars List[TextLineBreakScalar], leftIndex int32,
      rightIndex int32, left TextLineBreakScalar, right TextLineBreakScalar) bool{
        let baseLeftIndex = BaseIndex(scalars, leftIndex)
        let baseLeft = scalars[baseLeftIndex]
        if baseLeft.Class == TextLineBreakClass.AP && IsBrahmicStart(right) { return true }
        if IsBrahmicBase(baseLeft) && (right.Class == TextLineBreakClass.VF
            || right.Class == TextLineBreakClass.VI) { return true }
        if left.Class == TextLineBreakClass.VI && IsBrahmicStart(right)
          && baseLeftIndex > 0 && IsBrahmicBase(scalars[BaseIndex(scalars, baseLeftIndex - 1)]) { return true }
        return IsBrahmicBase(baseLeft) && IsBrahmicStart(right)
          && rightIndex + 1 < scalars.Count
          && scalars[rightIndex + 1].Class == TextLineBreakClass.VF
      }

    private func IsParenthesisSequence(left TextLineBreakScalar, right TextLineBreakScalar) bool {
      if right.Class == TextLineBreakClass.OP && IsAlphabetic(left.Class)
        || right.Class == TextLineBreakClass.OP && left.Class == TextLineBreakClass.NU{
          return !IsEastAsian(right)
        }
      if left.Class == TextLineBreakClass.CP && (IsAlphabetic(right.Class)
          || right.Class == TextLineBreakClass.NU) {
            return !IsEastAsian(left)
          }
      return false
    }

    private func IsRegionalIndicatorPair(scalars List[TextLineBreakScalar], leftIndex int32,
      right TextLineBreakScalar) bool{
        if scalars[leftIndex].Class != TextLineBreakClass.RI
          || right.Class != TextLineBreakClass.RI{ return false }
        var index = leftIndex
        var count int32 = 0
        while index >= 0 {
          index = BaseIndex(scalars, index)
          if scalars[index].Class != TextLineBreakClass.RI { break }
          count = count + 1
          index--
        }
        return count % 2 != 0
      }

    private func IsEmojiModifierSequence(left TextLineBreakScalar,
      right TextLineBreakScalar) bool{
        if right.Class != TextLineBreakClass.EM { return false }
        return left.Class == TextLineBreakClass.EB
          || HasContext(left.Context, UnicodeLineBreakContext.ExtendedPictographicUnassigned)
      }

    private func IsBrahmicStart(value TextLineBreakScalar) bool -> value.Class == TextLineBreakClass.AK || value.Class == TextLineBreakClass.AS
      || value.Value == 0x25CC

    private func IsBrahmicBase(value TextLineBreakScalar) bool -> value.Class == TextLineBreakClass.AK || value.Class == TextLineBreakClass.AS
      || value.Value == 0x25CC

    private func IsIdeographicOrEmoji(value TextLineBreakClass) bool -> value == TextLineBreakClass.ID || value == TextLineBreakClass.EB
      || value == TextLineBreakClass.EM

    private func IsPrefixOrPostfix(value TextLineBreakClass) bool -> value == TextLineBreakClass.PR || value == TextLineBreakClass.PO

    private func IsAlphabetic(value TextLineBreakClass) bool -> value == TextLineBreakClass.AL || value == TextLineBreakClass.HL

    private func IsHard(value TextLineBreakClass) bool -> value == TextLineBreakClass.BK || value == TextLineBreakClass.CR
      || value == TextLineBreakClass.LF || value == TextLineBreakClass.NL

    private func IsEastAsian(value TextLineBreakScalar) bool -> HasContext(value.Context, UnicodeLineBreakContext.EastAsian)

    private func HasContext(value uint8, flag uint8) bool -> (value & flag) != uint8(0)

    private func BaseIndex(scalars List[TextLineBreakScalar], index int32) int32 {
      var cursor = index
      while cursor > 0 && scalars[cursor].JoinedToPrior { cursor-- }
      return cursor
    }

    private func PreviousNonSpace(scalars List[TextLineBreakScalar], index int32) int32 {
      var cursor = index
      while cursor >= 0 && scalars[cursor].Class == TextLineBreakClass.SP { cursor-- }
      return cursor
    }
  }
}
