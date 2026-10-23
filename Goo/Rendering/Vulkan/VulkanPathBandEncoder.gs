package Goo

import System
import System.Collections.Generic
import System.Runtime.CompilerServices

internal sealed class PathBandEncoder {
  shared {
    private const MaxBandCount int32 = 32
    private const NonZeroFillRuleMask uint32 = 1u
    private const EvenOddFillRuleMask uint32 = 2u
    private let cache ConditionalWeakTable[VectorPathData, PathBandEncoding] =
    ConditionalWeakTable[VectorPathData, PathBandEncoding]()
    private let cacheLock object = Object()
    private let curveScratch List[PathAnalyticCurve] = List[PathAnalyticCurve]()
    private let boundsScratch List[PathCurveBounds] = List[PathCurveBounds]()
    private let horizontalBandScratch List[PathAnalyticBand] = List[PathAnalyticBand]()
    private let verticalBandScratch List[PathAnalyticBand] = List[PathAnalyticBand]()
    private let horizontalIndexScratch List[uint32] = List[uint32]()
    private let verticalIndexScratch List[uint32] = List[uint32]()
    private let candidateScratch List[PathBandCandidate] = List[PathBandCandidate]()
    private let reverseCandidateScratch List[PathBandCandidate] = List[PathBandCandidate]()
    private var scratchMinimumX float32
    private var scratchMinimumY float32
    private var scratchMaximumX float32
    private var scratchMaximumY float32

    internal func Encode(path VectorPath) PathBandEncoding {
      guard let data = path.payload else { return PathBandEncoding.Empty }
      if cache.TryGetValue(data, out var value)
        && value.GeometryRevision == data.GeometryRevision{ return value }
      lock (cacheLock) {
        if cache.TryGetValue(data, out var retained)
          && retained.GeometryRevision == data.GeometryRevision{ return retained }
        let geometry = PathGeometry.For(path)
        if cache.TryGetValue(data, out var existing) {
          if EncodeInto(geometry, existing) {
            return existing
          }
          existing.Reset(data.GeometryRevision)
          return existing
        }
        let encoded = Encode(PathGeometry.For(path))
        let built = if data.NormalizedOwner != nil
          && Object.ReferenceEquals(encoded, PathBandEncoding.Empty) {
            PathBandEncoding.CreateEmpty(data.GeometryRevision)
          } else {
            encoded
          }
        cache.Add(data, built)
        return built
      }
    }

    internal func Encode(path PathGeometry) PathBandEncoding {
      if !BuildScratch(path) { return PathBandEncoding.Empty }
      return PathBandEncoding(
        scratchMinimumX, scratchMinimumY, scratchMaximumX, scratchMaximumY,
        horizontalBandScratch.ToArray(), verticalBandScratch.ToArray(),
        horizontalIndexScratch.ToArray(), verticalIndexScratch.ToArray(),
        curveScratch.ToArray(), NonZeroFillRuleMask | EvenOddFillRuleMask,
        path.GeometryRevision)
    }

    private func EncodeInto(path PathGeometry, target PathBandEncoding) bool {
      if !BuildScratch(path) { return false }
      target.Rebuild(scratchMinimumX, scratchMinimumY, scratchMaximumX, scratchMaximumY,
        horizontalBandScratch, verticalBandScratch, horizontalIndexScratch,
        verticalIndexScratch, curveScratch, NonZeroFillRuleMask | EvenOddFillRuleMask,
        path.GeometryRevision)
      return true
    }

    private func BuildScratch(path PathGeometry) bool {
      if path == nil || path.QuadraticCount == 0 { return false }
      curveScratch.Clear()
      boundsScratch.Clear()
      horizontalBandScratch.Clear()
      verticalBandScratch.Clear()
      horizontalIndexScratch.Clear()
      verticalIndexScratch.Clear()
      scratchMinimumX = Single.PositiveInfinity
      scratchMinimumY = Single.PositiveInfinity
      scratchMaximumX = Single.NegativeInfinity
      scratchMaximumY = Single.NegativeInfinity
      for contourIndex in 0 ... path.ContourCount {
        let contour = path.Contours[contourIndex]
        if contour.End <= contour.Start { continue }
        for quadraticIndex in contour.Start ... contour.End {
          appendScratchQuadratic(path.Quadratics[quadraticIndex])
        }
        if !contour.Closed {
          let first = path.Quadratics[contour.Start]
          let last = path.Quadratics[contour.End - 1]
          if last.X1 != first.X0 || last.Y1 != first.Y0 {
            appendScratchQuadratic(PathQuadratic{
              X0: last.X1,
              Y0: last.Y1,
              CX: (last.X1 + first.X0) * 0.5F,
              CY: (last.Y1 + first.Y0) * 0.5F,
              X1: first.X0,
              Y1: first.Y0,
            })
          }
        }
      }
      if curveScratch.Count == 0 || !finite(scratchMinimumX) || !finite(scratchMinimumY)
        || !finite(scratchMaximumX) || !finite(scratchMaximumY) { return false }
      if scratchMaximumX < scratchMinimumX {
        let swap = scratchMinimumX
        scratchMinimumX = scratchMaximumX
        scratchMaximumX = swap
      }
      if scratchMaximumY < scratchMinimumY {
        let swap = scratchMinimumY
        scratchMinimumY = scratchMaximumY
        scratchMaximumY = swap
      }
      let horizontalCount = chooseBandCount(curveScratch.Count)
      let verticalCount = chooseBandCount(curveScratch.Count)
      buildBands(curveScratch, scratchMinimumY, scratchMaximumY, horizontalCount, true,
        scratchMinimumX, scratchMaximumX, horizontalBandScratch, horizontalIndexScratch)
      buildBands(curveScratch, scratchMinimumX, scratchMaximumX, verticalCount, false,
        scratchMinimumY, scratchMaximumY, verticalBandScratch, verticalIndexScratch)
      return true
    }

    private func appendScratchQuadratic(quadratic PathQuadratic) {
      if !finiteQuadratic(quadratic) { return }
      curveScratch.Add(PathAnalyticCurve{
        X0: quadratic.X0,
        Y0: quadratic.Y0,
        CX: quadratic.CX,
        CY: quadratic.CY,
        X1: quadratic.X1,
        Y1: quadratic.Y1,
        Flags: 0u,
        Reserved: 0u,
      })
      let bounds = PathCurveBounds{
        MinimumX: quadraticMinimum(quadratic.X0, quadratic.CX, quadratic.X1),
        MinimumY: quadraticMinimum(quadratic.Y0, quadratic.CY, quadratic.Y1),
        MaximumX: quadraticMaximum(quadratic.X0, quadratic.CX, quadratic.X1),
        MaximumY: quadraticMaximum(quadratic.Y0, quadratic.CY, quadratic.Y1),
      }
      boundsScratch.Add(bounds)
      if bounds.MinimumX < scratchMinimumX { scratchMinimumX = bounds.MinimumX }
      if bounds.MinimumY < scratchMinimumY { scratchMinimumY = bounds.MinimumY }
      if bounds.MaximumX > scratchMaximumX { scratchMaximumX = bounds.MaximumX }
      if bounds.MaximumY > scratchMaximumY { scratchMaximumY = bounds.MaximumY }
    }

    private func chooseBandCount(curveCount int32) int32 {
      var count int32 = 1
      while count < MaxBandCount && count * count < curveCount {
        count++
      }
      return count
    }

    private func buildBands(curves List[PathAnalyticCurve], minimum float32, maximum float32,
      count int32, horizontal bool, rayMinimum float32, rayMaximum float32,
      bands List[PathAnalyticBand], indices List[uint32]) {
        var extent = maximum - minimum
        if extent < 0.0F { extent = 0.0F }
        var bandIndex int32 = 0
        while bandIndex < count {
          let low = if extent == 0.0F {
            minimum
          } else {
            minimum + extent * float32(bandIndex) / float32(count)
          }
          let high = if extent == 0.0F || bandIndex + 1 == count {
            maximum
          } else {
            minimum + extent * float32(bandIndex + 1) / float32(count)
          }
          candidateScratch.Clear()
          var curveIndex int32 = 0
          while curveIndex < curves.Count {
            let bounds = boundsScratch[curveIndex]
            let curveMinimum = if horizontal { bounds.MinimumY } else { bounds.MinimumX }
            let curveMaximum = if horizontal { bounds.MaximumY } else { bounds.MaximumX }
            if curveMaximum >= low && curveMinimum <= high {
              let near = if horizontal { bounds.MinimumX } else { bounds.MinimumY }
              let far = if horizontal { bounds.MaximumX } else { bounds.MaximumY }
              candidateScratch.Add(PathBandCandidate{
                Index: uint32(curveIndex),
                Near: near,
                Far: far,
              })
            }
            curveIndex++
          }

          reverseCandidateScratch.Clear()
          for i in 0 ... candidateScratch.Count {
            reverseCandidateScratch.Add(candidateScratch[i])
          }
          sortCandidates(candidateScratch, false)
          sortCandidates(reverseCandidateScratch, true)
          var splitMinimum = rayMinimum
          var splitMaximum = rayMaximum
          if candidateScratch.Count != 0 {
            splitMinimum = candidateScratch[0].Near
            splitMaximum = candidateScratch[0].Far
            for i in 1 ... candidateScratch.Count {
              let candidate = candidateScratch[i]
              if candidate.Near < splitMinimum { splitMinimum = candidate.Near }
              if candidate.Far > splitMaximum { splitMaximum = candidate.Far }
            }
          }
          let forwardStart = uint32(indices.Count)
          for i in 0 ... candidateScratch.Count {
            indices.Add(candidateScratch[i].Index)
          }
          let forwardCount = uint32(candidateScratch.Count)
          let reverseStart = uint32(indices.Count)
          for i in 0 ... reverseCandidateScratch.Count {
            indices.Add(reverseCandidateScratch[i].Index)
          }
          let reverseCount = uint32(candidateScratch.Count)
          bands.Add(PathAnalyticBand{
            Minimum: low,
            Maximum: high,
            Split: midpoint(splitMinimum, splitMaximum),
            ForwardStart: forwardStart,
            ForwardCount: forwardCount,
            ReverseStart: reverseStart,
            ReverseCount: reverseCount,
            Flags: if horizontal { 1u } else { 2u },
          })
          bandIndex++
        }
      }

    private func sortCandidates(values List[PathBandCandidate], reverse bool) {
      var root = values.Count / 2
      var end = values.Count
      while end > 1 {
        if root > 0 {
          root--
        } else {
          end--
          let swap = values[end]
          values[end] = values[0]
          values[0] = swap
        }
        let value = values[root]
        var parent = root
        var child = parent * 2 + 1
        while child < end {
          if child + 1 < end && precedes(values[child], values[child + 1], reverse) {
            child++
          }
          if !precedes(value, values[child], reverse) { break }
          values[parent] = values[child]
          parent = child
          child = parent * 2 + 1
        }
        values[parent] = value
      }
    }

    private func precedes(left PathBandCandidate, right PathBandCandidate, reverse bool) bool ->
      if reverse { precedesReverse(left, right) } else { precedesForward(left, right) }

    private func precedesForward(left PathBandCandidate, right PathBandCandidate) bool {
      if left.Near < right.Near { return true }
      if left.Near > right.Near { return false }
      if left.Far > right.Far { return true }
      return if left.Far < right.Far { false } else { left.Index < right.Index }
    }

    private func precedesReverse(left PathBandCandidate, right PathBandCandidate) bool {
      if left.Far > right.Far { return true }
      if left.Far < right.Far { return false }
      if left.Near < right.Near { return true }
      return if left.Near > right.Near { false } else { left.Index < right.Index }
    }

    private func finiteQuadratic(value PathQuadratic) bool -> finite(value.X0) && finite(value.Y0) && finite(value.CX) && finite(value.CY)
      && finite(value.X1) && finite(value.Y1)


    private func quadraticMinimum(start float32, control float32, finish float32) float32 {
      var value = MathF.Min(start, finish)
      let denominator = start - 2.0F * control + finish
      if MathF.Abs(denominator) > 0.000001F {
        let t = (start - control) / denominator
        if t > 0.0F && t < 1.0F {
          let candidate = quadraticValue(start, control, finish, t)
          if candidate < value { value = candidate }
        }
      }
      return value
    }

    private func quadraticMaximum(start float32, control float32, finish float32) float32 {
      var value = MathF.Max(start, finish)
      let denominator = start - 2.0F * control + finish
      if MathF.Abs(denominator) > 0.000001F {
        let t = (start - control) / denominator
        if t > 0.0F && t < 1.0F {
          let candidate = quadraticValue(start, control, finish, t)
          if candidate > value { value = candidate }
        }
      }
      return value
    }

    private func quadraticValue(start float32, control float32, finish float32, t float32) float32 {
      let inverse = 1.0F - t
      return inverse * inverse * start + 2.0F * inverse * t * control + t * t * finish
    }

    private func midpoint(low float32, high float32) float32 -> low * 0.5F + high * 0.5F

    private func finite(value float32) bool -> !Single.IsNaN(value) && !Single.IsInfinity(value)
  }
}

internal data struct PathBandCandidate {
  internal var Index uint32
  internal var Near float32
  internal var Far float32
}

internal data struct PathCurveBounds {
  internal let MinimumX float32
  internal let MinimumY float32
  internal let MaximumX float32
  internal let MaximumY float32
}
