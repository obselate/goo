package Goo

import System
import System.Collections.Generic

internal class VirtualRowIndex {
  private let sums []float64
  internal init(heights []float32, gap float32) {
    sums = [heights.Length + 1]float64
    for i in 1 ... sums.Length {
      sums[i] += float64(heights[i - 1]) + float64(gap)
      let parent = i + (i & -i)
      if parent < sums.Length { sums[parent] += sums[i] }
    }
  }
  internal prop Count int32{ get -> sums.Length - 1 }
  internal func Prefix(count int32) float64 {
    var index = Math.Clamp(count, 0, Count)
    var result = 0.0
    while index > 0 { result += sums[index]
      index -= index & -index }
    return result
  }
  internal func Add(index int32, delta float64) {
    var next = index + 1
    while next < sums.Length { sums[next] += delta
      next += next & -next }
  }
  internal func Find(offset float64) int32 {
    var index = 0
    var bit = 1
    while bit <= Count / 2 { bit *= 2 }
    var remaining = Math.Max(0.0, offset)
    while bit > 0 {
      let next = index + bit
      if next <= Count && sums[next] <= remaining {
        index = next
        remaining -= sums[next]
      }
      bit /= 2
    }
    return Math.Min(index, Math.Max(0, Count - 1))
  }
}

internal data struct VirtualRow[T] {
  internal var Item T
  internal var Key string
  internal var Height float32
  internal var Measured bool
}

internal class VirtualRowMetadata[T] {
  internal let Rows []VirtualRow[T]
  internal let Indices Dictionary[string, int32]
  internal let Index VirtualRowIndex
  internal let Width float32
  internal let Gap float32
  internal let Estimate float32
  internal init(rows []VirtualRow[T], indices Dictionary[string, int32], width float32, gap float32, estimate float32) {
    Rows = rows
    Indices = indices
    Width = width
    Gap = gap
    Estimate = estimate
    let heights = [rows.Length]float32
    for i in 0 ... rows.Length { heights[i] = rows[i].Height }
    Index = VirtualRowIndex(heights, gap)
  }
}

internal data struct VirtualRowMeasurement {
  internal var Index int32
  internal var Height float32
}
