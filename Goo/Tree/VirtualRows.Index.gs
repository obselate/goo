package Goo

import System
import System.Collections.Generic

// Prefix sums of row extents over a fixed number of slots, stored as a Fenwick tree.
internal class VirtualRowIndex {
  private let sums []float64
  internal init(extents []float64) {
    sums = [extents.Length + 1]float64
    for i in 1 ... sums.Length {
      sums[i] += extents[i - 1]
      let parent = i + (i & -i)
      if parent < sums.Length { sums[parent] += sums[i] }
    }
  }
  internal prop Capacity int32{ get -> sums.Length - 1 }
  // The sum of the first `count` slots.
  internal func Prefix(count int32) float64 {
    var index = Math.Clamp(count, 0, Capacity)
    var result = 0.0
    while index > 0 { result += sums[index]
      index -= index & -index }
    return result
  }
  internal func Add(slot int32, delta float64) {
    var next = slot + 1
    while next < sums.Length { sums[next] += delta
      next += next & -next }
  }
  // The number of leading slots whose sum does not exceed `offset`.
  internal func Find(offset float64) int32 {
    var index = 0
    var bit = 1
    while bit <= Capacity / 2 { bit *= 2 }
    var remaining = Math.Max(0.0, offset)
    while bit > 0 {
      let next = index + bit
      if next <= Capacity && sums[next] <= remaining {
        index = next
        remaining -= sums[next]
      }
      bit /= 2
    }
    return index
  }
}

internal data struct VirtualRow[T] {
  internal var Item T
  internal var Key string
  internal var Height float32
  internal var Measured bool
}

// The rows of a vertical virtual list with their keys and measured heights. Rows can be dropped from the
// start and appended at the end in time proportional to the change; the slot buffer is compacted or grown
// when the end reaches its capacity.
internal class VirtualRowMetadata[T] {
  private var rows []VirtualRow[T]
  private var slots Dictionary[string, int32]
  private var index VirtualRowIndex
  private var head int32
  private var count int32
  internal let Width float32
  internal let Gap float32
  internal let Estimate float32

  // Throws when keys are empty or repeated.
  internal init(values []VirtualRow[T], width float32, gap float32, estimate float32) {
    Width = width
    Gap = gap
    Estimate = estimate
    rows = values
    count = values.Length
    slots = Dictionary[string, int32](values.Length, StringComparer.Ordinal)
    for i in 0 ... values.Length {
      let key = values[i].Key
      if String.IsNullOrEmpty(key) || !slots.TryAdd(key, i) { throw InvalidOperationException("VirtualRows keys must be nonempty and unique across the collection") }
    }
    index = VirtualRowIndex(Extents(values, values.Length))
  }

  internal prop Count int32{ get -> count }

  internal func Row(position int32) VirtualRow[T] -> rows[head + position]

  internal func TryIndex(key string, out position int32) bool {
    if slots.TryGetValue(key, out var slot) {
      position = slot - head
      return true
    }
    position = -1
    return false
  }

  internal func Contains(key string) bool -> slots.ContainsKey(key)

  // The row values in order.
  internal func Items() []T {
    let result = [count]T
    for i in 0 ... count { result[i] = rows[head + i].Item }
    return result
  }

  // The total extent of the first `rowCount` rows, including the gap after each.
  internal func Prefix(rowCount int32) float64 -> index.Prefix(head + Math.Clamp(rowCount, 0, count)) - index.Prefix(head)

  // The row containing `offset`, clamped to the rows.
  internal func Find(offset float64) int32 {
    if count == 0 { return 0 }
    let slot = index.Find(Math.Max(0.0, offset) + index.Prefix(head))
    return Math.Clamp(slot - head, 0, count - 1)
  }

  internal func Measure(position int32, height float32) {
    let slot = head + position
    var row = rows[slot]
    index.Add(slot, float64(height) - float64(row.Height))
    row.Height = height
    row.Measured = true
    rows[slot] = row
  }

  internal func DropFirst(rowCount int32) {
    let dropped = Math.Clamp(rowCount, 0, count)
    for i in 0 ... dropped {
      slots.Remove(rows[head + i].Key)
      rows[head + i] = VirtualRow[T]{}
    }
    head += dropped
    count -= dropped
    if count == 0 { Compact(rows.Length) }
  }

  // Appends a row whose key the caller has checked is new.
  internal func Append(row VirtualRow[T]) {
    if head + count == rows.Length {
      Compact(if count * 2 <= rows.Length { rows.Length } else { Math.Max(16, rows.Length * 2) })
    }
    let slot = head + count
    rows[slot] = row
    slots.Add(row.Key, slot)
    index.Add(slot, float64(row.Height) + float64(Gap))
    count++
  }

  private func Compact(capacity int32) {
    let next = [capacity]VirtualRow[T]
    Array.Copy(rows, head, next, 0, count)
    rows = next
    head = 0
    slots.Clear()
    for i in 0 ... count { slots.Add(rows[i].Key, i) }
    index = VirtualRowIndex(Extents(rows, count))
  }

  private func Extents(values []VirtualRow[T], used int32) []float64 {
    let extents = [values.Length]float64
    for i in 0 ... used { extents[i] = float64(values[i].Height) + float64(Gap) }
    return extents
  }
}

internal data struct VirtualRowMeasurement {
  internal var Index int32
  internal var Height float32
}
