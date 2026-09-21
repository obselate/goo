package Goo

import System

internal data struct EditState {
  internal var Text string
  internal var Caret int32
  internal var Anchor int32
}

// Pure single-line editing over text, caret, and anchor.
internal class Edit {
  internal func HasSelection(s EditState) bool -> s.Caret != s.Anchor
  internal func SelStart(s EditState) int32 -> s.Caret < s.Anchor ? s.Caret : s.Anchor
  internal func SelEnd(s EditState) int32 -> s.Caret > s.Anchor ? s.Caret : s.Anchor
  internal func Selected(s EditState) string -> s.Text.Substring(SelStart(s), SelEnd(s) - SelStart(s))

  internal func Insert(s EditState, str string) EditState {
    let lo = SelStart(s)
    let hi = SelEnd(s)
    let text = s.Text.Substring(0, lo) + str + s.Text.Substring(hi)
    let c = lo + str.Length
    return EditState{ Text: text, Caret: c, Anchor: c }
  }

  internal func Backspace(s EditState) EditState {
    if HasSelection(s) { return Insert(s, "") }
    let starts = UnicodeGraphemes.Starts(s.Text)
    let end = elementStart(starts, s.Text.Length, s.Caret)
    if end == 0 { return s }
    let start = previousElement(starts, s.Text.Length, end)
    let text = s.Text.Substring(0, start) + s.Text.Substring(end)
    return EditState{ Text: text, Caret: start, Anchor: start }
  }

  internal func Delete(s EditState) EditState {
    if HasSelection(s) { return Insert(s, "") }
    let starts = UnicodeGraphemes.Starts(s.Text)
    let start = elementStart(starts, s.Text.Length, s.Caret)
    if start == s.Text.Length { return s }
    let end = nextElement(starts, s.Text.Length, start)
    let text = s.Text.Substring(0, start) + s.Text.Substring(end)
    return EditState{ Text: text, Caret: start, Anchor: start }
  }

  internal func Home(s EditState, extend bool) EditState -> place(s, 0, extend)
  internal func End(s EditState, extend bool) EditState -> place(s, s.Text.Length, extend)

  internal func WordLeft(s EditState, extend bool) EditState -> place(s, prevWord(s.Text, s.Caret), extend)
  internal func WordRight(s EditState, extend bool) EditState -> place(s, nextWord(s.Text, s.Caret), extend)

  internal func KillWordLeft(s EditState) EditState {
    if HasSelection(s) { return Insert(s, "") }
    return Insert(EditState{ Text: s.Text, Caret: s.Caret, Anchor: prevWord(s.Text, s.Caret) }, "")
  }

  internal func KillWordRight(s EditState) EditState {
    if HasSelection(s) { return Insert(s, "") }
    return Insert(EditState{ Text: s.Text, Caret: s.Caret, Anchor: nextWord(s.Text, s.Caret) }, "")
  }

  internal func SelectAll(s EditState) EditState -> EditState { Text: s.Text, Caret: s.Text.Length, Anchor: 0 }

  internal func SelectWordAt(s EditState, index int32) EditState {
    let selected = TextSelectionRanges.Word(s.Text, index)
    return EditState{ Text: s.Text, Anchor: selected.Start, Caret: selected.Start + selected.Length }
  }

  internal func place(s EditState, index int32, extend bool) EditState {
    var c = index
    if c < 0 { c = 0 }
    if c > s.Text.Length { c = s.Text.Length }
    return EditState{ Text: s.Text, Caret: c, Anchor: extend ? s.Anchor : c }
  }

  internal func prevWord(text string, from int32) int32 {
    let starts = UnicodeGraphemes.Starts(text)
    let limit = elementStart(starts, text.Length, from)
    var i int32 = 0
    var latestWordStart int32 = 0
    var hasWord = false
    var previousWord = false
    while i < limit {
      let currentWord = isWord(text, i)
      if currentWord && !previousWord {
        latestWordStart = i
        hasWord = true
      }
      previousWord = currentWord
      i = nextElement(starts, text.Length, i)
    }
    return hasWord ? latestWordStart : 0
  }

  internal func nextWord(text string, from int32) int32 {
    let starts = UnicodeGraphemes.Starts(text)
    var i = elementStart(starts, text.Length, from)
    while i < text.Length && !isWord(text, i) {
      i = nextElement(starts, text.Length, i)
    }
    while i < text.Length && isWord(text, i) {
      i = nextElement(starts, text.Length, i)
    }
    return i
  }

  private func elementStart(starts []int32, length int32, index int32) int32 {
    var target = index
    if target < 0 { target = 0 }
    if target >= length { return length }
    var low int32 = 0
    var high = starts.Length
    while low < high {
      let middle = low + (high - low) / 2
      if starts[middle] <= target {
        low = middle + 1
      } else {
        high = middle
      }
    }
    return starts[low - 1]
  }

  private func nextElement(starts []int32, length int32, from int32) int32 {
    let start = elementStart(starts, length, from)
    if start == length { return start }
    var low int32 = 0
    var high = starts.Length
    while low < high {
      let middle = low + (high - low) / 2
      if starts[middle] <= start {
        low = middle + 1
      } else {
        high = middle
      }
    }
    return if low < starts.Length { starts[low] } else { length }
  }

  private func previousElement(starts []int32, length int32, from int32) int32 {
    var target = from
    if target > length { target = length }
    if target <= 0 { return 0 }
    var low int32 = 0
    var high = starts.Length
    while low < high {
      let middle = low + (high - low) / 2
      if starts[middle] < target {
        low = middle + 1
      } else {
        high = middle
      }
    }
    return if low == 0 { 0 } else { starts[low - 1] }
  }

  private func isWord(text string, elementStart int32) bool -> TextSelectionRanges.IsWord(text, elementStart)
}
