package Goo

import System
import System.Collections.Generic

internal data struct TextHit(Index int32, Affinity int32) { }

internal data struct TextHitPosition(Index int32, Affinity int32, X float32) {
  internal func Hit() TextHit -> TextHit(Index, Affinity)
}

internal data struct TextGlyphBox(LogicalStart int32, LogicalEnd int32, X0 float32, X1 float32) { }

internal data struct TextVisualCluster(LogicalStart int32, X0 float32, X1 float32) { }

internal class TextGeometry {
  private let upstream []float32
  private let downstream []float32
  private let stops []TextHitPosition
  private let boxes []TextGlyphBox
  private var selectionStart int32 = -1
  private var selectionEnd int32 = -1
  private var selectionRects []float32 = []float32{}

  private init(upstream []float32, downstream []float32, stops []TextHitPosition,
    boxes []TextGlyphBox) {
      this.upstream = upstream
      this.downstream = downstream
      this.stops = stops
      this.boxes = boxes
    }

  shared {
    @ThreadStatic
    private var analysisScratch UnicodeTextAnalysisScratch?

    internal func Build(text string, runs List[ShapedRun], width float32,
      rightToLeft bool) TextGeometry{
        let upstream = [text.Length + 1]float32
        let downstream = [text.Length + 1]float32
        for i in 0 ... upstream.Length {
          upstream[i] = Single.NaN
          downstream[i] = Single.NaN
        }
        var boxCount int32 = 0
        for run in runs { boxCount = boxCount + countRunClusters(run) }
        let boxes = [boxCount]TextGlyphBox
        var boxIndex int32 = 0
        let scratchOwner = AnalysisScratch()
        let scratch = scratchOwner.Rent(text.Length)
        try {
          for run in runs {
            AddRun(run, upstream, downstream, boxes, ref boxIndex,
              scratch.GraphemeScalars, scratch.GlyphStarts)
          }

          let fallback = rightToLeft ? width : 0.0F
          if Single.IsNaN(downstream[0]) { downstream[0] = fallback }
          if Single.IsNaN(upstream[text.Length]) {
            upstream[text.Length] = rightToLeft ? 0.0F : width
          }

          let boundaries = UnicodeGraphemes.Starts(text, scratch.GraphemeScalars,
            scratch.GlyphStarts)
          if boundaries.Count == 0 || boundaries[0] != 0 { boundaries.Insert(0, 0) }
          if boundaries[boundaries.Count - 1] != text.Length { boundaries.Add(text.Length) }

          var positionCount int32 = 0
          for boundary in boundaries {
            let up = upstream[boundary]
            let down = downstream[boundary]
            if !Single.IsNaN(up) { positionCount++ }
            if !Single.IsNaN(down) && (Single.IsNaN(up) || MathF.Abs(down - up) > 0.01F) {
              positionCount++
            }
          }
          let positions = [positionCount]TextHitPosition
          var positionIndex int32 = 0
          for boundary in boundaries {
            let up = upstream[boundary]
            let down = downstream[boundary]
            if !Single.IsNaN(up) {
              positions[positionIndex] = TextHitPosition(boundary, 0, up)
              positionIndex++
            }
            if !Single.IsNaN(down) && (Single.IsNaN(up) || MathF.Abs(down - up) > 0.01F) {
              positions[positionIndex] = TextHitPosition(boundary, 1, down)
              positionIndex++
            }
          }
          sortPositions(positions)

          return TextGeometry(upstream, downstream, positions, boxes)
        } finally {
          scratchOwner.Return(scratch)
        }
      }

    private func AnalysisScratch() UnicodeTextAnalysisScratch {
      if let current = analysisScratch { return current }
      let created = UnicodeTextAnalysisScratch()
      analysisScratch = created
      return created
    }

    internal func CaretX(text string, runs IReadOnlyList[ShapedRun], width float32,
      rightToLeft bool, index int32, affinity int32) float32{
        let position = Math.Clamp(index, 0, text.Length)
        let scratchOwner = AnalysisScratch()
        let scratch = scratchOwner.Rent(text.Length)
        try {
          var upstream = Single.NaN
          var downstream = Single.NaN
          directCaretCandidates(runs, position, ref upstream, ref downstream,
            scratch.GraphemeScalars, scratch.GlyphStarts)
          if position == 0 && Single.IsNaN(downstream) {
            downstream = rightToLeft ? width : 0.0F
          }
          if position == text.Length && Single.IsNaN(upstream) {
            upstream = rightToLeft ? 0.0F : width
          }
          let preferred = if affinity == 0 { upstream } else { downstream }
          if !Single.IsNaN(preferred) { return preferred }
          let alternate = if affinity == 0 { downstream } else { upstream }
          if !Single.IsNaN(alternate) { return alternate }

          var distance int32 = 1
          while distance <= text.Length {
            let left = position - distance
            if left >= 0 {
              var leftUpstream = Single.NaN
              var leftDownstream = Single.NaN
              directCaretCandidates(runs, left, ref leftUpstream, ref leftDownstream,
                scratch.GraphemeScalars, scratch.GlyphStarts)
              if !Single.IsNaN(leftDownstream) { return leftDownstream }
              if !Single.IsNaN(leftUpstream) { return leftUpstream }
            }
            let right = position + distance
            if right <= text.Length {
              var rightUpstream = Single.NaN
              var rightDownstream = Single.NaN
              directCaretCandidates(runs, right, ref rightUpstream, ref rightDownstream,
                scratch.GraphemeScalars, scratch.GlyphStarts)
              if !Single.IsNaN(rightUpstream) { return rightUpstream }
              if !Single.IsNaN(rightDownstream) { return rightDownstream }
            }
            distance++
          }
          return 0.0F
        } finally {
          scratchOwner.Return(scratch)
        }
      }
  }

  internal func CaretX(index int32, affinity int32) float32 {
    let position = Math.Clamp(index, 0, upstream.Length - 1)
    let preferred = if affinity == 0 { upstream[position] } else { downstream[position] }
    if !Single.IsNaN(preferred) { return preferred }
    let alternate = if affinity == 0 { downstream[position] } else { upstream[position] }
    if !Single.IsNaN(alternate) { return alternate }

    var distance int32 = 1
    while distance < upstream.Length {
      let left = position - distance
      if left >= 0 {
        let x = if !Single.IsNaN(downstream[left]) { downstream[left] } else { upstream[left] }
        if !Single.IsNaN(x) { return x }
      }
      let right = position + distance
      if right < upstream.Length {
        let x = if !Single.IsNaN(upstream[right]) { upstream[right] } else { downstream[right] }
        if !Single.IsNaN(x) { return x }
      }
      distance++
    }
    return 0.0F
  }

  internal func HitTest(x float32, inside bool = false) TextHit {
    if stops.Length == 0 { return TextHit(0, 1) }
    if Single.IsNaN(x) || Single.IsInfinity(x) { return stops[0].Hit() }
    if inside {
      for box in boxes {
        if x >= box.X0 && x < box.X1 { return TextHit(box.LogicalStart, 0) }
      }
    }
    let upper = lowerBoundTextStops(stops, x)
    if upper == 0 { return stops[0].Hit() }
    if upper == stops.Length { return stops[lowerBoundTextStops(stops, stops[upper - 1].X)].Hit() }
    let leftX = stops[upper - 1].X
    let left = lowerBoundTextStops(stops, leftX)
    let leftDistance = MathF.Abs(leftX - x)
    let rightDistance = MathF.Abs(stops[upper].X - x)
    return if rightDistance < leftDistance { stops[upper].Hit() } else { stops[left].Hit() }
  }

  internal func Move(index int32, affinity int32, delta int32) TextHit {
    if stops.Length == 0 || delta == 0 { return TextHit(index, affinity) }
    let current = findStop(index, affinity)
    let next = Math.Clamp(current + Math.Sign(delta), 0, stops.Length - 1)
    return stops[next].Hit()
  }

  internal func LineEdge(end bool) TextHit -> if end { TextHit(upstream.Length - 1, 0) } else { TextHit(0, 1) }

  internal func Collapse(index int32, affinity int32, anchorIndex int32, anchorAffinity int32,
    delta int32) TextHit{
      let segments = SelectionRects(index, anchorIndex)
      if segments.Length != 0 {
        return HitTest(if delta < 0 { segments[0] } else { segments[segments.Length - 1] })
      }
      let caretX = CaretX(index, affinity)
      let anchorX = CaretX(anchorIndex, anchorAffinity)
      if delta < 0 {
        return if caretX <= anchorX { TextHit(index, affinity) }
        else { TextHit(anchorIndex, anchorAffinity) }
      }
      return if caretX >= anchorX { TextHit(index, affinity) }
      else { TextHit(anchorIndex, anchorAffinity) }
    }

  internal func SelectionRects(start int32, end int32) []float32 {
    var from = start
    var to = end
    normalizeSelection(ref from, ref to)
    if from == to { return []float32{} }
    lock (this) {
      if from == selectionStart && to == selectionEnd { return selectionRects }
      let empty = stackalloc[0]float32
      var required int32
      TraverseSelection(from, to, 0, empty, out required)
      if required == 0 {
        selectionStart = from
        selectionEnd = to
        selectionRects = []float32{}
        return selectionRects
      }
      let result = [required * 2]float32
      let destination = Span[float32](result)
      var copied int32
      TraverseSelection(from, to, 0, destination, out copied)
      selectionStart = from
      selectionEnd = to
      selectionRects = result
      return selectionRects
    }
  }

  internal func SelectionRectCount(start int32, end int32) int32 {
    var from = start
    var to = end
    normalizeSelection(ref from, ref to)
    if from == to { return 0 }
    let empty = stackalloc[0]float32
    var required int32
    TraverseSelection(from, to, 0, empty, out required)
    return required
  }

  internal func CopySelectionRects(start int32, end int32, rectOffset int32,
    destination Span[float32]) int32{
      var from = start
      var to = end
      normalizeSelection(ref from, ref to)
      if from == to || destination.Length < 2 { return 0 }
      var required int32
      return TraverseSelection(from, to, rectOffset, destination, out required)
    }

  private func TraverseSelection(start int32, end int32, rectOffset int32,
    destination Span[float32], out required int32) int32{
      var rectIndex int32 = 0
      var written int32 = 0
      var hasSegment = false
      var x0 = 0.0F
      var x1 = 0.0F
      for box in boxes {
        if box.LogicalStart >= end || box.LogicalEnd <= start || box.X1 <= box.X0 { continue }
        if !hasSegment {
          x0 = box.X0
          x1 = box.X1
          hasSegment = true
        } else if box.X0 <= x1 + 0.01F {
          x1 = MathF.Max(x1, box.X1)
        } else {
          if rectIndex >= rectOffset && written + 1 < destination.Length {
            destination[written] = x0
            destination[written + 1] = x1
            written = written + 2
          }
          rectIndex++
          x0 = box.X0
          x1 = box.X1
        }
      }
      if hasSegment && rectIndex >= rectOffset && written + 1 < destination.Length {
        destination[written] = x0
        destination[written + 1] = x1
        written = written + 2
      }
      if hasSegment { rectIndex = rectIndex + 1 }
      required = rectIndex
      return written
    }

  private func normalizeSelection(ref start int32, ref end int32) {
    start = Math.Clamp(start, 0, upstream.Length - 1)
    end = Math.Clamp(end, 0, upstream.Length - 1)
    if end < start {
      let value = start
      start = end
      end = value
    }
  }

  private func findStop(index int32, affinity int32) int32 {
    var fallback int32 = -1
    var i int32 = 0
    while i < stops.Length {
      if stops[i].Index == index {
        if stops[i].Affinity == affinity { return i }
        if fallback == -1 { fallback = i }
      }
      i++
    }
    if fallback != -1 { return fallback }
    let x = CaretX(index, affinity)
    var nearest int32 = 0
    var distance = MathF.Abs(stops[0].X - x)
    i = 1
    while i < stops.Length {
      let next = MathF.Abs(stops[i].X - x)
      if next < distance {
        nearest = i
        distance = next
      }
      i++
    }
    return nearest
  }

}

internal func sortPositions(values []TextHitPosition) {
  var i int32 = 1
  while i < values.Length {
    let value = values[i]
    var j = i
    while j > 0 && comparePositions(values[j - 1], value) > 0 {
      values[j] = values[j - 1]
      j--
    }
    values[j] = value
    i++
  }
}

internal func comparePositions(left TextHitPosition, right TextHitPosition) int32 {
  let x = left.X.CompareTo(right.X)
  if x != 0 { return x }
  let index = left.Index.CompareTo(right.Index)
  return if index != 0 { index } else { left.Affinity.CompareTo(right.Affinity) }
}

internal func lowerBoundTextStops(values []TextHitPosition, x float32) int32 {
  var low int32 = 0
  var high = values.Length
  while low < high {
    let middle = low + (high - low) / 2
    if values[middle].X < x {
      low = middle + 1
    } else {
      high = middle
    }
  }
  return low
}

internal func countRunClusters(run ShapedRun) int32 {
  var count int32 = 0
  var glyph int32 = 0
  while glyph < run.Clusters.Length {
    let cluster = run.Clusters[glyph]
    glyph++
    while glyph < run.Clusters.Length && run.Clusters[glyph] == cluster { glyph++ }
    count++
  }
  return count
}

internal func directCaretCandidates(runs IReadOnlyList[ShapedRun], position int32,
  ref upstream float32, ref downstream float32,
  scalars List[UnicodeGraphemeScalar], graphemeStarts List[int32]) {
    for run in runs {
      let local = position - run.LogicalStart
      if local < 0 || local > run.Text.Length || run.Clusters.Length == 0 { continue }
      var exactGlyph int32 = -1
      var exactNext int32 = -1
      var priorStart int32 = -1
      var priorGlyph int32 = -1
      var priorNext int32 = -1
      var glyph int32 = 0
      while glyph < run.Clusters.Length {
        let start = int32(run.Clusters[glyph])
        var next = glyph + 1
        while next < run.Clusters.Length && run.Clusters[next] == run.Clusters[glyph] { next++ }
        if start == local && exactGlyph < 0 {
          exactGlyph = glyph
          exactNext = next
        }
        if start < local && start > priorStart {
          priorStart = start
          priorGlyph = glyph
          priorNext = next
        }
        glyph = next
      }
      if exactGlyph >= 0 {
        setIfNaN(ref downstream, directClusterX(run, exactGlyph, exactNext, 0.0F))
      }
      if priorGlyph < 0 { continue }
      var priorEnd = run.Text.Length
      glyph = 0
      while glyph < run.Clusters.Length {
        let start = int32(run.Clusters[glyph])
        if start > priorStart && start < priorEnd { priorEnd = start }
        glyph++
        while glyph < run.Clusters.Length && run.Clusters[glyph] == run.Clusters[glyph - 1] {
          glyph++
        }
      }
      if local > priorEnd { continue }
      if local == priorEnd {
        setIfNaN(ref upstream, directClusterX(run, priorGlyph, priorNext, 1.0F))
        continue
      }
      UnicodeGraphemes.Starts(run.Text, scalars, graphemeStarts)
      var interiorCount int32 = 0
      var selectedSegment int32 = -1
      for boundary in graphemeStarts {
        if boundary <= priorStart || boundary >= priorEnd { continue }
        interiorCount++
        if boundary == local { selectedSegment = interiorCount }
      }
      if selectedSegment < 0 { continue }
      let ratio = float32(selectedSegment) / float32(interiorCount + 1)
      let x = directClusterX(run, priorGlyph, priorNext, ratio)
      setIfNaN(ref upstream, x)
      setIfNaN(ref downstream, x)
    }
  }

internal func directClusterX(run ShapedRun, glyph int32, next int32, ratio float32) float32 {
  let first = if glyph == 0 { run.VisualStart } else { run.Points[glyph].X }
  let last = if next < run.Clusters.Length { run.Points[next].X } else { run.VisualEnd }
  let x0 = MathF.Min(first, last)
  let x1 = MathF.Max(first, last)
  return if run.RightToLeft { x1 - (x1 - x0) * ratio }
  else { x0 + (x1 - x0) * ratio }
}

internal func AddRun(run ShapedRun, upstream []float32, downstream []float32,
  boxes []TextGlyphBox, ref boxIndex int32, scalars List[UnicodeGraphemeScalar],
  graphemeStarts List[int32]) {
    if run.Text.Length == 0 { return }
    let visualClusters = List[TextVisualCluster](run.Clusters.Length)
    var glyph int32 = 0
    while glyph < run.Clusters.Length {
      let cluster = int32(run.Clusters[glyph])
      var next = glyph + 1
      while next < run.Clusters.Length && run.Clusters[next] == run.Clusters[glyph] { next++ }
      let x0 = if glyph == 0 { run.VisualStart } else { run.Points[glyph].X }
      let x1 = if next < run.Clusters.Length { run.Points[next].X } else { run.VisualEnd }
      visualClusters.Add(TextVisualCluster(cluster, MathF.Min(x0, x1), MathF.Max(x0, x1)))
      glyph = next
    }

    let logicalClusters = List[int32](visualClusters.Count)
    for cluster in visualClusters {
      var exists = false
      for value in logicalClusters {
        if value == cluster.LogicalStart {
          exists = true
          break
        }
      }
      if !exists { logicalClusters.Add(cluster.LogicalStart) }
    }
    var order int32 = 1
    while order < logicalClusters.Count {
      let value = logicalClusters[order]
      var index = order
      while index > 0 && logicalClusters[index - 1] > value {
        logicalClusters[index] = logicalClusters[index - 1]
        index--
      }
      logicalClusters[index] = value
      order++
    }

    UnicodeGraphemes.Starts(run.Text, scalars, graphemeStarts)
    for cluster in visualClusters {
      var logical int32 = 0
      while logical < logicalClusters.Count && logicalClusters[logical] != cluster.LogicalStart { logical++ }
      let localEnd = if logical + 1 < logicalClusters.Count
      { logicalClusters[logical + 1] } else { run.Text.Length }
      var firstInterior int32 = 0
      while firstInterior < graphemeStarts.Count
        && graphemeStarts[firstInterior] <= cluster.LogicalStart{ firstInterior++ }
      var afterInterior = firstInterior
      while afterInterior < graphemeStarts.Count
        && graphemeStarts[afterInterior] < localEnd{ afterInterior++ }
      let segmentCount = afterInterior - firstInterior + 1
      var i int32 = 0
      while i <= segmentCount {
        let local = if i == 0 { cluster.LogicalStart }
        else if i == segmentCount { localEnd }
        else { graphemeStarts[firstInterior + i - 1] }
        let ratio = float32(i) / float32(segmentCount)
        let x = if run.RightToLeft
        { cluster.X1 - (cluster.X1 - cluster.X0) * ratio }
        else { cluster.X0 + (cluster.X1 - cluster.X0) * ratio }
        let absolute = run.LogicalStart + local
        if i == 0 { setIfNaN(ref downstream[absolute], x) }
        else if i == segmentCount { setIfNaN(ref upstream[absolute], x) }
        else {
          setIfNaN(ref upstream[absolute], x)
          setIfNaN(ref downstream[absolute], x)
        }
        i++
      }
      boxes[boxIndex] = TextGlyphBox(run.LogicalStart + cluster.LogicalStart,
        run.LogicalStart + localEnd, cluster.X0, cluster.X1)
      boxIndex++
    }
  }

internal func setIfNaN(ref target float32, value float32) {
  if Single.IsNaN(target) { target = value }
}
