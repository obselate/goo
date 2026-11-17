package Goo

import System
import System.Collections.Generic
import System.Collections.ObjectModel

/// Specifies logical-pixel dash intervals and their phase offset.
/// Empty intervals produce a solid stroke. Odd interval counts repeat once.
public class DashPattern {
  private let intervals ReadOnlyCollection[float64]
  private let values []float64
  private var offset float64
  private var revision uint64
  private var transitionOwned bool

  /// Gets the immutable intervals after odd-count normalization.
  public prop Intervals IReadOnlyList[float64]{ get -> intervals }
  /// Gets the finite dash phase offset in logical pixels.
  public prop Offset float64{ get -> offset }
  internal prop Revision uint64{ get -> revision }
  internal prop TransitionOwned bool{ get -> transitionOwned; init -> transitionOwned = value }

  /// Creates a dash pattern.
  /// @param intervals Non-negative finite dash and gap lengths. Empty is solid, and non-empty values must not all be zero.
  /// @param offset The finite phase offset in logical pixels.
  public init(intervals []float64, offset float64) {
    if !motionFiniteFloat32(offset) {
      throw ArgumentOutOfRangeException("offset")
    }

    let count = intervals.Length
    let normalized = [if count % 2 == 0 { count } else { count * 2 }]float64
    var allZero = true
    for i in 0 ... intervals.Length {
      let interval = intervals[i]
      if !motionFiniteFloat32(interval) || interval < 0.0 {
        throw ArgumentOutOfRangeException("intervals")
      }
      if interval != 0.0 {
        allZero = false
      }
      normalized[i] = interval
    }
    if count > 0 && allZero {
      throw ArgumentException("intervals must not all be zero", "intervals")
    }
    if count % 2 != 0 {
      for i in 0 ... count {
        normalized[count + i] = normalized[i]
      }
    }

    this.intervals = ReadOnlyCollection[float64](normalized)
    values = normalized
    this.offset = offset
  }

  internal init(source DashPattern, offset float64) {
    values = [source.values.Length]float64
    Array.Copy(source.values, values, values.Length)
    intervals = ReadOnlyCollection[float64](values)
    this.offset = offset
    transitionOwned = true
  }

  internal func InterpolateIntervals(from DashPattern, to DashPattern, t float32) {
    for i in 0 ... values.Length {
      values[i] = from.values[i] + (to.values[i] - from.values[i]) * float64(t)
    }
    revision++
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

internal sealed class DashTransitionValues {
  internal let From DashPattern
  internal let To DashPattern
  internal let Work DashPattern

  internal init(from DashPattern, to DashPattern) {
    From = from
    To = to
    Work = DashPattern(from, from.Offset)
  }

  internal func Sample(t float32) {
    Work.InterpolateIntervals(From, To, t)
  }
}

internal func sameDashIntervals(left DashPattern?, right DashPattern?) bool {
  if left == right { return true }
  if (left?.Intervals.Count ?? 0) != (right?.Intervals.Count ?? 0) { return false }
  guard let a = left, let b = right else { return true }
  for i in 0 ... a.Intervals.Count {
    if a.Intervals[i] != b.Intervals[i] { return false }
  }
  return true
}

internal func compatibleDashIntervals(left DashPattern?, right DashPattern?) bool ->
  left != nil && right != nil && left.Intervals.Count == right.Intervals.Count
