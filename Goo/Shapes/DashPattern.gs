package Goo

import System
import System.Collections.Generic
import System.Collections.ObjectModel

/// Specifies logical-pixel dash intervals and their phase offset.
/// Empty intervals produce a solid stroke. Odd interval counts repeat once.
public sealed class DashPattern {
  private let intervals ReadOnlyCollection[float64]
  private var offset float64
  private var revision uint64

  /// Gets the immutable intervals after odd-count normalization.
  public prop Intervals IReadOnlyList[float64]{ get -> intervals }
  /// Gets the finite dash phase offset in logical pixels.
  public prop Offset float64{ get -> offset }
  internal prop Revision uint64{ get -> revision }

  /// Creates a dash pattern.
  /// @param intervals Non-negative finite dash and gap lengths. Empty is solid, and non-empty values must not all be zero.
  /// @param offset The finite phase offset in logical pixels.
  public init(intervals []float64, offset float64) {
    if !motionFiniteFloat32(offset) {
      throw ArgumentOutOfRangeException("offset")
    }

    let normalized = List[float64]()
    var allZero = true
    for i in 0 ... intervals.Length {
      let interval = intervals[i]
      if !motionFiniteFloat32(interval) || interval < 0.0 {
        throw ArgumentOutOfRangeException("intervals")
      }
      if interval != 0.0 {
        allZero = false
      }
      normalized.Add(interval)
    }
    if normalized.Count > 0 && allZero {
      throw ArgumentException("intervals must not all be zero", "intervals")
    }
    if normalized.Count % 2 != 0 {
      let count = normalized.Count
      for i in 0 ... count {
        normalized.Add(normalized[i])
      }
    }

    this.intervals = ReadOnlyCollection[float64](normalized)
    this.offset = offset
  }

  internal func SetOffset(next float64) {
    if !motionFiniteFloat32(next) {
      throw ArgumentOutOfRangeException("offset")
    }
    if offset != next {
      offset = next
      revision++
    }
  }
}
