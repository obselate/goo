package Goo

import System

internal func ArrayGrowthCapacity(current int32, required int32,
  minimum int32) int32 {
    if required < 0 { throw ArgumentOutOfRangeException("required") }
    if required <= current { return current }
    var capacity = Math.Max(current, minimum)
    while capacity < required {
      if capacity > Int32.MaxValue / 2 { return required }
      capacity *= 2
    }
    return capacity
  }

internal func GrowArray[T any](values []T, count int32, required int32,
  minimum int32) []T {
    let capacity = ArrayGrowthCapacity(values.Length, required, minimum)
    if capacity == values.Length { return values }
    let expanded = [capacity]T
    Array.Copy(values, expanded, count)
    return expanded
  }
