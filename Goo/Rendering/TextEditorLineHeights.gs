package Goo

import System
import System.Collections.Generic

internal sealed class TextEditorLineHeightBlock {
  internal var Count int32
  internal var Sum float32
  internal var Values ([]float32)?
}

internal sealed class TextEditorLineHeights {
  shared {
    private const BlockSize int32 = 512
  }

  private let blocks List[TextEditorLineHeightBlock] = List[TextEditorLineHeightBlock]()
  private var snapshot TextSnapshot?
  private var lines int32
  private var width float32
  private var fingerprint int32
  private var lineHeight float32
  private var ascent float32
  private var descent float32

  internal prop Total float32{ get; private set; }

  internal func Matches(current TextSnapshot, width float32, fingerprint int32, lineHeight float32,
    ascent float32, descent float32) bool {
      guard let tracked = snapshot else { return false }
      return tracked.Version == current.Version && lines == current.LineCount && this.width == width
        && this.fingerprint == fingerprint && this.lineHeight == lineHeight
        && this.ascent == ascent && this.descent == descent
    }

  internal func Reset(current TextSnapshot, width float32, fingerprint int32, lineHeight float32,
    ascent float32, descent float32) {
      blocks.Clear()
      snapshot = current
      lines = 0
      this.width = width
      this.fingerprint = fingerprint
      this.lineHeight = lineHeight
      this.ascent = ascent
      this.descent = descent
      Total = 0.0F
      insertBlocks(0, current.LineCount)
    }

  internal func Set(line int32, extra float32) float32 {
    var local = line
    var index int32 = 0
    while local >= blocks[index].Count {
      local -= blocks[index].Count
      index++
    }
    let block = blocks[index]
    let previous = if let values = block.Values { values[local] } else { 0.0F }
    if previous == extra { return 0.0F }
    let values = block.Values ?? [BlockSize * 2]float32
    block.Values = values
    values[local] = extra
    refresh(block)
    return extra - previous
  }

  internal func ExtraBefore(line int32) float32 {
    var remaining = line
    var sum = 0.0F
    for block in blocks {
      if remaining < block.Count {
        if let values = block.Values {
          for i in 0 ... remaining { sum += values[i] }
        }
        return sum
      }
      sum += block.Sum
      remaining -= block.Count
    }
    return sum
  }

  internal func LineAt(offset float32) int32 {
    var top = 0.0F
    var first int32 = 0
    for block in blocks {
      let height = float32(block.Count) * lineHeight + block.Sum
      if offset < top + height {
        for i in 0 ... block.Count {
          top += lineHeight + (block.Values?[i] ?? 0.0F)
          if offset < top { return first + i }
        }
        return first + block.Count - 1
      }
      top += height
      first += block.Count
    }
    return Math.Max(0, first - 1)
  }

  internal func Apply(change TextDocumentChange, after TextSnapshot) {
    guard let before = snapshot else { return }
    if before.Version != change.BeforeVersion {
      snapshot = nil
      return
    }
    var shift int32 = 0
    for item in change.Changes { shift += item.InsertedText.Length - item.Range.Length }
    for var i = change.Changes.Count - 1; i >= 0; i-- {
      let item = change.Changes[i]
      shift -= item.InsertedText.Length - item.Range.Length
      let line = before.GetLineIndex(item.Range.Start)
      let removed = before.GetLineIndex(item.Range.Start + item.Range.Length) - line
      let start = item.Range.Start + shift
      let inserted = after.GetLineIndex(start + item.InsertedText.Length) - after.GetLineIndex(start)
      removeLines(line + 1, removed)
      insertLines(line + 1, inserted)
    }
    snapshot = after
  }

  private func removeLines(line int32, count int32) {
    var remaining = count
    while remaining > 0 {
      var local = line
      var index int32 = 0
      while local >= blocks[index].Count {
        local -= blocks[index].Count
        index++
      }
      let block = blocks[index]
      let take = Math.Min(remaining, block.Count - local)
      if let values = block.Values {
        Array.Copy(values, local + take, values, local, block.Count - local - take)
        Array.Clear(values, block.Count - take, take)
      }
      block.Count -= take
      lines -= take
      remaining -= take
      if block.Count == 0 {
        blocks.RemoveAt(index)
      } else {
        refresh(block)
        if index + 1 < blocks.Count && block.Count + blocks[index + 1].Count <= BlockSize {
          merge(index)
        }
      }
    }
    Total = total()
  }

  private func insertLines(line int32, count int32) {
    if count == 0 { return }
    var local = line
    var index int32 = 0
    while index < blocks.Count && local > blocks[index].Count {
      local -= blocks[index].Count
      index++
    }
    if index == blocks.Count {
      insertBlocks(index, count)
      return
    }
    let block = blocks[index]
    if block.Count + count <= BlockSize * 2 {
      if let values = block.Values {
        Array.Copy(values, local, values, local + count, block.Count - local)
        Array.Clear(values, local, count)
      }
      block.Count += count
      lines += count
      return
    }
    let right = TextEditorLineHeightBlock{ Count: block.Count - local }
    if let values = block.Values {
      let moved = [BlockSize * 2]float32
      Array.Copy(values, local, moved, 0, right.Count)
      Array.Clear(values, local, right.Count)
      right.Values = moved
      refresh(right)
    }
    block.Count = local
    refresh(block)
    blocks.Insert(index + 1, right)
    insertBlocks(index + 1, count)
    if block.Count == 0 { blocks.RemoveAt(index) }
  }

  private func insertBlocks(index int32, count int32) {
    var at = index
    var remaining = count
    while remaining > 0 {
      let size = Math.Min(BlockSize, remaining)
      blocks.Insert(at, TextEditorLineHeightBlock{ Count: size })
      at++
      remaining -= size
    }
    lines += count
  }

  private func merge(index int32) {
    let block = blocks[index]
    let next = blocks[index + 1]
    if let source = next.Values {
      let values = block.Values ?? [BlockSize * 2]float32
      Array.Copy(source, 0, values, block.Count, next.Count)
      block.Values = values
    }
    block.Count += next.Count
    blocks.RemoveAt(index + 1)
    refresh(block)
  }

  private func refresh(block TextEditorLineHeightBlock) {
    var sum = 0.0F
    if let values = block.Values {
      for i in 0 ... block.Count { sum += values[i] }
    }
    block.Sum = sum
    Total = total()
  }

  private func total() float32 {
    var sum = 0.0F
    for block in blocks { sum += block.Sum }
    return sum
  }
}
