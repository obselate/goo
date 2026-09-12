package Goo

import System
import System.Collections.Generic
import System.Runtime.CompilerServices

internal func resolveShapeStrokeExtent(width float32, join StrokeJoin,
  miterLimit float32) float32{
    if !Single.IsNaN(width) && !Single.IsInfinity(width) && width > 0.0F {
      let half = width * 0.5F
      if join == StrokeJoin.Miter && miterLimit > 1.0F {
        let extent = half * miterLimit
        if !Single.IsNaN(extent) && !Single.IsInfinity(extent) {
          return extent
        }
        return Single.MaxValue
      }
      return half
    }
    return 0.0F
  }

internal data struct PathStrokePoint {
  internal var X float32
  internal var Y float32
}

private sealed class PathStrokePolyline {
  internal var Points List[PathStrokePoint]
  internal var Closed bool

  internal init() {
    Points = List[PathStrokePoint]()
    Closed = false
  }

  internal func Set(points List[PathStrokePoint], closed bool) {
    Points = points
    Closed = closed
  }
}

private sealed class PathStrokeSource {
  internal let Geometry PathGeometry

  internal init(geometry PathGeometry) {
    Geometry = geometry
  }
}

private sealed class PathStrokeSubpath {
  internal var Points List[PathStrokePoint]
  internal var Closed bool

  internal init() {
    Points = List[PathStrokePoint]()
    Closed = false
  }

  internal func Set(points List[PathStrokePoint], closed bool) {
    Points = points
    Closed = closed
  }
}

private sealed class PathStrokeScratch {
  internal let Commands List[VectorPathCommand]
  internal let PointLists List[List[PathStrokePoint]]
  internal let Polylines List[PathStrokePolyline]
  internal let Subpaths List[PathStrokeSubpath]
  internal let SubpathPool List[PathStrokeSubpath]
  internal let Polygon List[PathStrokePoint]
  internal var DashIntervals []float64
  internal var Tangents []PathStrokePoint
  internal var Normals []PathStrokePoint
  internal var OutputQuadratics []PathQuadratic
  internal var OutputContours []PathContour
  internal var PointCursor int32
  internal var PolylineCursor int32
  internal var SubpathCursor int32
  internal var OutputQuadraticCount int32
  internal var OutputContourCount int32

  internal init() {
    Commands = List[VectorPathCommand]()
    PointLists = List[List[PathStrokePoint]]()
    Polylines = List[PathStrokePolyline]()
    Subpaths = List[PathStrokeSubpath]()
    SubpathPool = List[PathStrokeSubpath]()
    Polygon = List[PathStrokePoint]()
    DashIntervals = []float64{}
    Tangents = []PathStrokePoint{}
    Normals = []PathStrokePoint{}
    OutputQuadratics = []PathQuadratic{}
    OutputContours = []PathContour{}
  }

  internal func Begin() {
    Commands.Clear()
    PointCursor = 0
    PolylineCursor = 0
    SubpathCursor = 0
    Subpaths.Clear()
    Polygon.Clear()
    OutputQuadraticCount = 0
    OutputContourCount = 0
  }

  internal func AcquirePoints() List[PathStrokePoint] {
    if PointCursor >= PointLists.Count {
      PointLists.Add(List[PathStrokePoint]())
    }
    let result = PointLists[PointCursor]
    result.Clear()
    PointCursor++
    return result
  }

  internal func AcquirePolyline(points List[PathStrokePoint], closed bool) PathStrokePolyline {
    if PolylineCursor >= Polylines.Count {
      Polylines.Add(PathStrokePolyline())
    }
    let result = Polylines[PolylineCursor]
    result.Set(points, closed)
    PolylineCursor++
    return result
  }

  internal func AcquireSubpath(points List[PathStrokePoint], closed bool) PathStrokeSubpath {
    if SubpathCursor >= SubpathPool.Count {
      SubpathPool.Add(PathStrokeSubpath())
    }
    let result = SubpathPool[SubpathCursor]
    result.Set(points, closed)
    SubpathCursor++
    return result
  }

  internal func EnsureDashIntervals(count int32) {
    if DashIntervals.Length >= count { return }
    DashIntervals = [count]float64
  }

  internal func EnsureSegments(count int32) {
    if Tangents.Length < count {
      Tangents = [count]PathStrokePoint
      Normals = [count]PathStrokePoint
    }
  }

  internal func EnsureOutput(curveCount int32, contourCount int32) {
    if OutputQuadratics.Length < curveCount {
      let previous = OutputQuadratics
      OutputQuadratics = [curveCount]PathQuadratic
      if OutputQuadraticCount > 0 {
        Array.Copy(previous, OutputQuadratics, OutputQuadraticCount)
      }
    }
    if OutputContours.Length < contourCount {
      let previous = OutputContours
      OutputContours = [contourCount]PathContour
      if OutputContourCount > 0 {
        Array.Copy(previous, OutputContours, OutputContourCount)
      }
    }
  }
}

private sealed class PathStrokeEntry {
  internal var ScaleX float32
  internal var ScaleY float32
  internal var Width float32
  internal var Cap StrokeCap
  internal var Join StrokeJoin
  internal var MiterLimit float32
  internal var Dashes DashPattern?
  internal var DashRevision uint64
  internal var GeometryRevision uint64
  internal var Path VectorPath
  internal var Owner VectorPathNormalizedOwner

  internal init(scaleX float32, scaleY float32, width float32, cap StrokeCap,
    join StrokeJoin, miterLimit float32, dashes DashPattern?, geometryRevision uint64,
    path VectorPath, owner VectorPathNormalizedOwner) {
      ScaleX = scaleX
      ScaleY = scaleY
      Width = width
      Cap = cap
      Join = join
      MiterLimit = miterLimit
      Dashes = dashes
      DashRevision = if let value = dashes { value.Revision } else { 0uL }
      GeometryRevision = geometryRevision
      Path = path
      Owner = owner
    }
}

internal sealed class PathStrokeCache {
  private const FlattenTolerance float32 = 0.25F
  private const PointTolerance float32 = 0.00001F
  private const MaximumFlattenDepth int32 = 12
  private const RoundStepRadians float32 = 0.19634955F
  private const MaximumEntriesPerSource int32 = 8

  shared {
    internal let Shared PathStrokeCache = PathStrokeCache()
  }

  private let entries ConditionalWeakTable[VectorPathData, List[PathStrokeEntry]]
  private let sources ConditionalWeakTable[VectorPathData, PathStrokeSource]
  private let gate object
  private let scratch PathStrokeScratch

  internal init() {
    entries = ConditionalWeakTable[VectorPathData, List[PathStrokeEntry]]()
    sources = ConditionalWeakTable[VectorPathData, PathStrokeSource]()
    gate = Object()
    scratch = PathStrokeScratch()
  }

  internal func Resolve(path VectorPath, mapping PathMapping, width float32,
    cap StrokeCap, join StrokeJoin, miterLimit float32, dashes DashPattern?) VectorPath{
      guard let data = path.payload else { return VectorPath.Empty }
      if !mapping.Valid || !Finite(mapping.ScaleX) || !Finite(mapping.ScaleY)
        || mapping.ScaleX <= 0.0F || mapping.ScaleY <= 0.0F
        || !Finite(width) || width <= 0.0F || !Finite(miterLimit) || miterLimit < 0.0F {
          return VectorPath.Empty
        }
      let mutable = data.NormalizedOwner != nil
      if mutable {
        lock (gate) {
          if entries.TryGetValue(data, out var retained) {
            if let hit = FindMutable(retained) {
              let sameStyle = SameStyle(hit, mapping.ScaleX, mapping.ScaleY,
                width, cap, join, miterLimit)
              let sameDash = hit.DashRevision == dashRevision(dashes)
              if sameStyle && sameDash && hit.GeometryRevision == data.GeometryRevision {
                return hit.Path
              }
              if !Build(path, data, mapping.ScaleX, mapping.ScaleY, width,
                cap, join, miterLimit, dashes) {
                  return VectorPath.Empty
                }
              hit.ScaleX = mapping.ScaleX
              hit.ScaleY = mapping.ScaleY
              hit.Width = width
              hit.Cap = cap
              hit.Join = join
              hit.MiterLimit = miterLimit
              hit.Dashes = dashes
              UpdateEntry(hit, path, data, dashes)
              return hit.Path
            }
          }
          if !Build(path, data, mapping.ScaleX, mapping.ScaleY, width,
            cap, join, miterLimit, dashes) {
              return VectorPath.Empty
            }
          let built = CreateOutputPath(path, scratch.OutputQuadraticCount,
            scratch.OutputContourCount)
          guard let owner = built.NormalizedOwner else { return VectorPath.Empty }
          let entry = PathStrokeEntry(mapping.ScaleX, mapping.ScaleY, width,
            cap, join, miterLimit, dashes, data.GeometryRevision, built, owner)
          UpdateEntry(entry, path, data, dashes)
          if entries.TryGetValue(data, out var bucket) {
            bucket.Add(entry)
          } else {
            let created = List[PathStrokeEntry]()
            created.Add(entry)
            entries.Add(data, created)
          }
          return built
        }
      }
      if entries.TryGetValue(data, out var existing) {
        if let hit = Find(existing, mapping.ScaleX, mapping.ScaleY, width,
          cap, join, miterLimit, dashes) {
            if hit.GeometryRevision == data.GeometryRevision
              && hit.DashRevision == dashRevision(dashes) {
                return hit.Path
              }
          }
      }
      lock (gate) {
        if entries.TryGetValue(data, out var retained) {
          if let hit = Find(retained, mapping.ScaleX, mapping.ScaleY, width,
            cap, join, miterLimit, dashes) {
              if !Build(path, data, mapping.ScaleX, mapping.ScaleY, width,
                cap, join, miterLimit, dashes) {
                  return VectorPath.Empty
                }
              UpdateEntry(hit, path, data, dashes)
              return hit.Path
            }
        }
        if !Build(path, data, mapping.ScaleX, mapping.ScaleY, width,
          cap, join, miterLimit, dashes) {
            return VectorPath.Empty
          }
        let built = CreateOutputPath(path, scratch.OutputQuadraticCount,
          scratch.OutputContourCount)
        guard let owner = built.NormalizedOwner else { return VectorPath.Empty }
        let entry = PathStrokeEntry(mapping.ScaleX, mapping.ScaleY, width,
          cap, join, miterLimit, dashes, data.GeometryRevision, built, owner)
        UpdateEntry(entry, path, data, dashes)
        if entries.TryGetValue(data, out var bucket) {
          if bucket.Count >= MaximumEntriesPerSource {
            bucket.RemoveAt(0)
          }
          bucket.Add(entry)
        } else {
          let created = List[PathStrokeEntry]()
          created.Add(entry)
          entries.Add(data, created)
        }
        return built
      }
    }

  private func Find(values List[PathStrokeEntry], scaleX float32, scaleY float32,
    width float32, cap StrokeCap, join StrokeJoin, miterLimit float32,
    dashes DashPattern?) PathStrokeEntry? {
      var index int32 = 0
      while index < values.Count {
        let value = values[index]
        if value.ScaleX == scaleX && value.ScaleY == scaleY && value.Width == width
          && value.Cap == cap && value.Join == join && value.MiterLimit == miterLimit
          && (Object.ReferenceEquals(value.Dashes, dashes)
              || SameDashes(value.Dashes, dashes)) {
                return value
              }
        index++
      }
      return nil
    }

  private func FindMutable(values List[PathStrokeEntry]) PathStrokeEntry? {
    if values.Count == 0 { return nil }
    return values[0]
  }

  private func SameStyle(value PathStrokeEntry, scaleX float32, scaleY float32,
    width float32, cap StrokeCap, join StrokeJoin, miterLimit float32) bool -> value.ScaleX == scaleX && value.ScaleY == scaleY && value.Width == width
    && value.Cap == cap && value.Join == join && value.MiterLimit == miterLimit

  private func dashRevision(value DashPattern?) uint64 {
    if let pattern = value { return pattern.Revision }
    return 0uL
  }

  private func SameDashes(left DashPattern?, right DashPattern?) bool {
    let leftCount = if let value = left { value.Intervals.Count } else { 0 }
    let rightCount = if let value = right { value.Intervals.Count } else { 0 }
    if leftCount == 0 || rightCount == 0 {
      return leftCount == rightCount
    }
    guard let leftValue = left else { return false }
    guard let rightValue = right else { return false }
    if leftValue.Offset != rightValue.Offset {
      return false
    }
    var index int32 = 0
    while index < leftCount {
      if leftValue.Intervals[index] != rightValue.Intervals[index] {
        return false
      }
      index++
    }
    return true
  }

  private func Build(path VectorPath, data VectorPathData, scaleX float32, scaleY float32,
    width float32,
    cap StrokeCap, join StrokeJoin, miterLimit float32, dashes DashPattern?) bool{
      guard let source = SourceFor(path, data) else {
        return false
      }
      scratch.Begin()
      var contourIndex int32 = 0
      while contourIndex < source.Geometry.ContourCount {
        let contour = source.Geometry.Contours[contourIndex]
        guard let current = FlattenContour(source.Geometry, contour, scaleX, scaleY) else {
          return false
        }
        if !StrokeCoordinatesSafe(current.Points, width, join, miterLimit) {
          return false
        }
        let subpaths = SplitDashes(current, dashes)
        var subpathIndex int32 = 0
        while subpathIndex < subpaths.Count {
          AddStroke(subpaths[subpathIndex].Points,
            subpaths[subpathIndex].Closed,
            width, cap, join, miterLimit, scaleX, scaleY, scratch.Commands)
          subpathIndex++
        }
        contourIndex++
      }
      return NormalizeCommands(path)
    }

  private func CreateOutputPath(path VectorPath, curveCount int32,
    contourCount int32) VectorPath{
      let owner = VectorPathNormalizedOwner(curveCount, contourCount,
        path.ViewBoxX, path.ViewBoxY, path.ViewBoxWidth, path.ViewBoxHeight)
      owner.Update(scratch.OutputQuadratics, curveCount,
        scratch.OutputContours, contourCount)
      return VectorPath.CreateMutableNormalized(owner, path.ViewBoxX, path.ViewBoxY,
        path.ViewBoxWidth, path.ViewBoxHeight)
    }

  private func UpdateEntry(entry PathStrokeEntry, path VectorPath, data VectorPathData,
    dashes DashPattern?) {
      if entry.Owner.Quadratics.Length < scratch.OutputQuadraticCount
        || entry.Owner.Contours.Length < scratch.OutputContourCount{
          let next = CreateOutputPath(path, scratch.OutputQuadraticCount,
            scratch.OutputContourCount)
          guard let owner = next.NormalizedOwner else { return }
          entry.Path = next
          entry.Owner = owner
        } else {
          entry.Owner.Update(scratch.OutputQuadratics, scratch.OutputQuadraticCount,
            scratch.OutputContours, scratch.OutputContourCount)
        }
      entry.GeometryRevision = data.GeometryRevision
      entry.DashRevision = dashRevision(dashes)
    }

  private func NormalizeCommands(path VectorPath) bool {
    scratch.OutputQuadraticCount = 0
    scratch.OutputContourCount = 0
    if scratch.Commands.Count == 0 {
      scratch.EnsureOutput(0, 0)
      return true
    }
    var current = PathStrokePoint{}
    var first = PathStrokePoint{}
    var contourStart int32 = 0
    var hasContour = false
    var index int32 = 0
    while index < scratch.Commands.Count {
      let command = scratch.Commands[index]
      switch command.Kind {
        case VectorPathCommandKind.MoveTo {
          if hasContour {
            scratch.OutputContours[scratch.OutputContourCount] = PathContour{
              Start: contourStart,
              End: scratch.OutputQuadraticCount,
              Closed: false,
            }
            scratch.OutputContourCount++
          }
          guard let point = CommandPoint(command) else { return false }
          first = point
          current = point
          contourStart = scratch.OutputQuadraticCount
          hasContour = true
        }
        case VectorPathCommandKind.LineTo {
          if !hasContour { return false }
          guard let point = CommandPoint(command) else { return false }
          AppendOutputLine(current, point)
          current = point
        }
        case VectorPathCommandKind.Close {
          if !hasContour { return false }
          if !SamePoint(current, first) {
            AppendOutputLine(current, first)
          }
          scratch.OutputContours[scratch.OutputContourCount] = PathContour{
            Start: contourStart,
            End: scratch.OutputQuadraticCount,
            Closed: true,
          }
          scratch.OutputContourCount++
          hasContour = false
        }
        case _ { return false }
      }
      index++
    }
    if hasContour {
      scratch.OutputContours[scratch.OutputContourCount] = PathContour{
        Start: contourStart,
        End: scratch.OutputQuadraticCount,
        Closed: false,
      }
      scratch.OutputContourCount++
    }
    return scratch.OutputQuadraticCount == 0
      || scratch.OutputContourCount > 0
  }

  private func CommandPoint(command VectorPathCommand) PathStrokePoint? {
    if !Finite64(command.X1) || !Finite64(command.Y1)
      || command.X1 > float64(Single.MaxValue) || command.X1 < -float64(Single.MaxValue)
      || command.Y1 > float64(Single.MaxValue) || command.Y1 < -float64(Single.MaxValue) {
        return nil
      }
    return PathStrokePoint{ X: float32(command.X1), Y: float32(command.Y1) }
  }

  private func AppendOutputLine(first PathStrokePoint, last PathStrokePoint) {
    scratch.EnsureOutput(scratch.OutputQuadraticCount + 1,
      scratch.OutputContourCount + 1)
    scratch.OutputQuadratics[scratch.OutputQuadraticCount] = PathQuadratic{
      X0: first.X,
      Y0: first.Y,
      CX: first.X + (last.X - first.X) * 0.5F,
      CY: first.Y + (last.Y - first.Y) * 0.5F,
      X1: last.X,
      Y1: last.Y,
    }
    scratch.OutputQuadraticCount++
  }

  private func SourceFor(path VectorPath, data VectorPathData) PathStrokeSource? {
    let geometry = PathGeometry.For(path)
    if sources.TryGetValue(data, out var existing) {
      return existing
    }
    if geometry == nil || geometry.QuadraticCount == 0 {
      return nil
    }
    let source = PathStrokeSource(geometry)
    sources.Add(data, source)
    return source
  }

  private func StrokeCoordinatesSafe(points List[PathStrokePoint], width float32,
    join StrokeJoin, miterLimit float32) bool{
      var multiplier float64 = 1.0
      if join == StrokeJoin.Miter && miterLimit > 1.0F {
        multiplier = float64(miterLimit)
      }
      let extent = float64(width) * 0.5 * multiplier
      let limit = float64(Single.MaxValue)
      if !Finite64(extent) || extent < 0.0 || extent >= limit {
        return false
      }
      let maximum = limit - extent
      var index int32 = 0
      while index < points.Count {
        let x = float64(points[index].X)
        let y = float64(points[index].Y)
        if !Finite64(x) || !Finite64(y)
          || x > maximum || x < -maximum || y > maximum || y < -maximum{
            return false
          }
        index++
      }
      return true
    }

  private func FlattenContour(geometry PathGeometry, contour PathContour,
    scaleX float32, scaleY float32) PathStrokePolyline? {
      if contour.Start < 0 || contour.End <= contour.Start
        || contour.End > geometry.QuadraticCount{
          return nil
        }
      let points = scratch.AcquirePoints()
      var index = contour.Start
      while index < contour.End {
        let value = geometry.Quadratics[index]
        if !Finite(value.X0) || !Finite(value.Y0) || !Finite(value.CX)
          || !Finite(value.CY) || !Finite(value.X1) || !Finite(value.Y1) {
            return nil
          }
        guard let first = ScaledPoint(value.X0, value.Y0, scaleX, scaleY) else {
          return nil
        }
        guard let control = ScaledPoint(value.CX, value.CY, scaleX, scaleY) else {
          return nil
        }
        guard let last = ScaledPoint(value.X1, value.Y1, scaleX, scaleY) else {
          return nil
        }
        if index == contour.Start {
          AddPoint(points, first)
        }
        if !AppendQuadratic(points, first, control, last, 0) {
          return nil
        }
        index++
      }
      if contour.Closed && points.Count > 1
        && SamePoint(points[0], points[points.Count - 1]) {
          points.RemoveAt(points.Count - 1)
        }
      if points.Count < 2 {
        return nil
      }
      return scratch.AcquirePolyline(points, contour.Closed)
    }

  private func AppendQuadratic(points List[PathStrokePoint], first PathStrokePoint,
    control PathStrokePoint, last PathStrokePoint, depth int32) bool{
      let dx = float64(last.X) - float64(first.X)
      let dy = float64(last.Y) - float64(first.Y)
      let lengthSquared = dx * dx + dy * dy
      let controlX = float64(control.X) - float64(first.X)
      let controlY = float64(control.Y) - float64(first.Y)
      let cross = controlX * dy - controlY * dx
      let tolerance = float64(FlattenTolerance)
      let flat = if lengthSquared > float64(PointTolerance) * float64(PointTolerance) {
        cross * cross <= tolerance * tolerance * lengthSquared
      } else {
        controlX * controlX + controlY * controlY <= tolerance * tolerance
      }
      if flat || depth >= MaximumFlattenDepth {
        AddPoint(points, last)
        return true
      }
      let firstControlX = (float64(first.X) + float64(control.X)) * 0.5
      let firstControlY = (float64(first.Y) + float64(control.Y)) * 0.5
      let secondControlX = (float64(control.X) + float64(last.X)) * 0.5
      let secondControlY = (float64(control.Y) + float64(last.Y)) * 0.5
      let middleX = (firstControlX + secondControlX) * 0.5
      let middleY = (firstControlY + secondControlY) * 0.5
      if !Finite64(firstControlX) || !Finite64(firstControlY)
        || !Finite64(secondControlX) || !Finite64(secondControlY)
        || !Finite64(middleX) || !Finite64(middleY)
        || firstControlX > float64(Single.MaxValue)
        || firstControlX < -float64(Single.MaxValue)
        || firstControlY > float64(Single.MaxValue)
        || firstControlY < -float64(Single.MaxValue)
        || secondControlX > float64(Single.MaxValue)
        || secondControlX < -float64(Single.MaxValue)
        || secondControlY > float64(Single.MaxValue)
        || secondControlY < -float64(Single.MaxValue)
        || middleX > float64(Single.MaxValue)
        || middleX < -float64(Single.MaxValue)
        || middleY > float64(Single.MaxValue)
        || middleY < -float64(Single.MaxValue) {
          return false
        }
      let firstControl = PathStrokePoint{
        X: float32(firstControlX),
        Y: float32(firstControlY),
      }
      let secondControl = PathStrokePoint{
        X: float32(secondControlX),
        Y: float32(secondControlY),
      }
      let middle = PathStrokePoint{
        X: float32(middleX),
        Y: float32(middleY),
      }
      return AppendQuadratic(points, first, firstControl, middle, depth + 1)
        && AppendQuadratic(points, middle, secondControl, last, depth + 1)
    }

  private func ScaledPoint(x float32, y float32, scaleX float32,
    scaleY float32) PathStrokePoint? {
      let scaledX = float64(x) * float64(scaleX)
      let scaledY = float64(y) * float64(scaleY)
      if !Finite64(scaledX) || !Finite64(scaledY)
        || scaledX > float64(Single.MaxValue) || scaledX < -float64(Single.MaxValue)
        || scaledY > float64(Single.MaxValue) || scaledY < -float64(Single.MaxValue) {
          return nil
        }
      let point = PathStrokePoint{ X: float32(scaledX), Y: float32(scaledY) }
      if !Finite(point.X) || !Finite(point.Y) {
        return nil
      }
      return point
    }

  private func AddPoint(points List[PathStrokePoint], value PathStrokePoint) {
    if !Finite(value.X) || !Finite(value.Y) {
      return
    }
    if points.Count != 0 && SamePoint(points[points.Count - 1], value) {
      return
    }
    points.Add(value)
  }

  private func SplitDashes(polyline PathStrokePolyline, dashes DashPattern?) List[PathStrokeSubpath] {
    let result = scratch.Subpaths
    result.Clear()
    scratch.SubpathCursor = 0
    let intervalCount = if let value = dashes { value.Intervals.Count } else { 0 }
    if intervalCount == 0 {
      result.Add(scratch.AcquireSubpath(polyline.Points, polyline.Closed))
      return result
    }
    guard let pattern = dashes else { return result }
    scratch.EnsureDashIntervals(intervalCount)
    let intervals = scratch.DashIntervals
    var total float64 = 0.0
    var index int32 = 0
    while index < intervalCount {
      let value = pattern.Intervals[index]
      if Double.IsNaN(value) || Double.IsInfinity(value) || value < 0.0 {
        return result
      }
      intervals[index] = value
      total = total + value
      index++
    }
    if Double.IsNaN(total) || Double.IsInfinity(total) || total <= 0.0 {
      result.Add(scratch.AcquireSubpath(polyline.Points, polyline.Closed))
      return result
    }
    var phase = pattern.Offset % total
    if phase < 0.0 { phase = phase + total }
    var state = StartDash(intervals, phase)
    let edgeCount = polyline.Closed ? polyline.Points.Count : polyline.Points.Count - 1
    var active List[PathStrokePoint]? = nil
    var hadOffDistance bool = false
    var edgeIndex int32 = 0
    while edgeIndex < edgeCount {
      let first = polyline.Points[edgeIndex]
      let lastIndex = edgeIndex + 1 == polyline.Points.Count ? 0 : edgeIndex + 1
      let last = polyline.Points[lastIndex]
      let dx = float64(last.X) - float64(first.X)
      let dy = float64(last.Y) - float64(first.Y)
      let length = Math.Sqrt(dx * dx + dy * dy)
      if length > 0.0 {
        var distance float64 = 0.0
        while distance < length {
          if state.Remaining <= 0.0 {
            state = AdvanceDash(state, intervals)
          }
          let available = length - distance
          let step = available < state.Remaining ? available : state.Remaining
          if step <= 0.0 {
            distance = length
            break
          }
          let nextDistance = distance + step
          let start = Interpolate(first, last, float32(distance / length))
          let finish = Interpolate(first, last, float32(nextDistance / length))
          if state.On {
            if active == nil {
              active = scratch.AcquirePoints()
              active.Add(start)
            } else {
              AddPoint(active, start)
            }
            AddPoint(active, finish)
          } else {
            hadOffDistance = true
          }
          state.Remaining = state.Remaining - step
          if nextDistance <= distance {
            distance = length
            break
          }
          distance = nextDistance
          if state.Remaining <= 0.0 {
            let wasOn = state.On
            state = AdvanceDash(state, intervals)
            if wasOn && !state.On && active != nil {
              result.Add(scratch.AcquireSubpath(active, false))
              active = nil
            }
          }
        }
      }
      edgeIndex++
    }
    if active != nil && active.Count > 1 {
      result.Add(scratch.AcquireSubpath(active, false))
    }
    if polyline.Closed && result.Count == 1 && !hadOffDistance {
      let only = result[0].Points
      if only.Count > 1 && SamePoint(only[0], polyline.Points[0])
        && SamePoint(only[only.Count - 1], polyline.Points[0]) {
          result[0].Set(only, true)
        }
    }
    if polyline.Closed && result.Count > 1 {
      let firstResult = result[0].Points
      let lastResult = result[result.Count - 1].Points
      if SamePoint(firstResult[0], polyline.Points[0])
        && SamePoint(lastResult[lastResult.Count - 1], polyline.Points[0]) {
          let merged = scratch.AcquirePoints()
          var lastIndex int32 = 0
          while lastIndex < lastResult.Count {
            merged.Add(lastResult[lastIndex])
            lastIndex++
          }
          var firstIndex int32 = 0
          while firstIndex < firstResult.Count {
            AddPoint(merged, firstResult[firstIndex])
            firstIndex++
          }
          let mergedSubpath = scratch.AcquireSubpath(merged, false)
          let originalCount = result.Count
          result[0] = mergedSubpath
          while result.Count > originalCount - 1 {
            result.RemoveAt(result.Count - 1)
          }
        }
    }
    return result
  }

  private func StartDash(intervals []float64, phase float64) PathDashState {
    var index int32 = 0
    var remainingPhase = phase
    var guardCount int32 = 0
    while guardCount < intervals.Length * 2 {
      let value = intervals[index]
      if value > 0.0 && remainingPhase < value {
        return PathDashState{
          Index: index,
          Remaining: value - remainingPhase,
          On: index % 2 == 0,
        }
      }
      if value > 0.0 { remainingPhase = remainingPhase - value }
      index = index + 1 == intervals.Length ? 0 : index + 1
      guardCount++
    }
    return PathDashState{ Index: 0, Remaining: intervals[0], On: true }
  }

  private func AdvanceDash(state PathDashState, intervals []float64) PathDashState {
    var index = state.Index + 1 == intervals.Length ? 0 : state.Index + 1
    var guardCount int32 = 0
    while guardCount < intervals.Length * 2 {
      if intervals[index] > 0.0 {
        return PathDashState{
          Index: index,
          Remaining: intervals[index],
          On: index % 2 == 0,
        }
      }
      index = index + 1 == intervals.Length ? 0 : index + 1
      guardCount++
    }
    return PathDashState{ Index: index, Remaining: intervals[index], On: index % 2 == 0 }
  }

  private func Interpolate(first PathStrokePoint, last PathStrokePoint,
    amount float32) PathStrokePoint -> PathStrokePoint{
      X: first.X + (last.X - first.X) * amount,
      Y: first.Y + (last.Y - first.Y) * amount,
    }

  private func AddStroke(points List[PathStrokePoint], closed bool, width float32,
    cap StrokeCap, join StrokeJoin, miterLimit float32, scaleX float32, scaleY float32,
    commands List[VectorPathCommand]) {
      let cleaned = CleanPoints(points, closed)
      if cleaned.Count < 2 {
        return
      }
      let actualClosed = closed && cleaned.Count >= 3
      let half = width * 0.5F
      let segmentCount = actualClosed ? cleaned.Count : cleaned.Count - 1
      scratch.EnsureSegments(segmentCount)
      let tangents = scratch.Tangents
      let normals = scratch.Normals
      var segmentIndex int32 = 0
      while segmentIndex < segmentCount {
        let first = cleaned[segmentIndex]
        let lastIndex = segmentIndex + 1 == cleaned.Count ? 0 : segmentIndex + 1
        let last = cleaned[lastIndex]
        let dx = last.X - first.X
        let dy = last.Y - first.Y
        let length = MathF.Sqrt(dx * dx + dy * dy)
        if length <= PointTolerance {
          tangents[segmentIndex] = PathStrokePoint{}
          normals[segmentIndex] = PathStrokePoint{}
        } else {
          let tangent = PathStrokePoint{ X: dx / length, Y: dy / length }
          tangents[segmentIndex] = tangent
          normals[segmentIndex] = PathStrokePoint{ X: -tangent.Y, Y: tangent.X }
        }
        segmentIndex++
      }
      segmentIndex = 0
      while segmentIndex < segmentCount {
        let first = cleaned[segmentIndex]
        let lastIndex = segmentIndex + 1 == cleaned.Count ? 0 : segmentIndex + 1
        let last = cleaned[lastIndex]
        let tangent = tangents[segmentIndex]
        if LengthSquared(tangent) > 0.0F {
          var start = first
          var finish = last
          if !actualClosed && segmentIndex == 0 && cap == StrokeCap.Square {
            start = Offset(start, tangent, -half)
          }
          if !actualClosed && segmentIndex == segmentCount - 1 && cap == StrokeCap.Square {
            finish = Offset(finish, tangent, half)
          }
          let normal = normals[segmentIndex]
          let polygon = scratch.Polygon
          polygon.Clear()
          polygon.Add(Offset(start, normal, half))
          polygon.Add(Offset(finish, normal, half))
          polygon.Add(Offset(finish, normal, -half))
          polygon.Add(Offset(start, normal, -half))
          AddPolygon(commands, polygon, scaleX, scaleY)
        }
        segmentIndex++
      }
      let firstJoin = actualClosed ? 0 : 1
      let lastJoin = actualClosed ? cleaned.Count : cleaned.Count - 1
      var joinIndex = firstJoin
      while joinIndex < lastJoin {
        let previousSegment = joinIndex == 0 ? segmentCount - 1 : joinIndex - 1
        let nextSegment = joinIndex == cleaned.Count - 1 ? 0 : joinIndex
        let tangentBefore = tangents[previousSegment]
        let tangentAfter = tangents[nextSegment]
        if LengthSquared(tangentBefore) > 0.0F && LengthSquared(tangentAfter) > 0.0F {
          let turn = Cross(tangentBefore, tangentAfter)
          let direction = Dot(tangentBefore, tangentAfter)
          if MathF.Abs(turn) <= PointTolerance {
            if direction < 0.0F {
              AddReversalJoin(cleaned[joinIndex], tangentBefore, tangentAfter,
                half, join, commands, scaleX, scaleY)
            }
          } else {
            let outerSide = turn > 0.0F ? -1.0F : 1.0F
            AddJoin(cleaned[joinIndex], tangentBefore, tangentAfter, half,
              join, miterLimit, outerSide, commands, scaleX, scaleY)
            AddInnerJoin(cleaned[joinIndex], tangentBefore, tangentAfter, half,
              -outerSide, commands, scaleX, scaleY)
          }
        }
        joinIndex++
      }
      if !actualClosed && cap == StrokeCap.Round {
        AddCap(cleaned[0], tangents[0], half, true, commands, scaleX, scaleY)
        AddCap(cleaned[cleaned.Count - 1], tangents[segmentCount - 1], half,
          false, commands, scaleX, scaleY)
      }
    }

  private func CleanPoints(points List[PathStrokePoint], closed bool) List[PathStrokePoint] {
    let result = scratch.AcquirePoints()
    var index int32 = 0
    while index < points.Count {
      AddPoint(result, points[index])
      index++
    }
    if closed && result.Count > 1 && SamePoint(result[0], result[result.Count - 1]) {
      result.RemoveAt(result.Count - 1)
    }
    return result
  }

  private func AddJoin(center PathStrokePoint, tangentBefore PathStrokePoint,
    tangentAfter PathStrokePoint, half float32, join StrokeJoin, miterLimit float32,
    side float32, commands List[VectorPathCommand], scaleX float32, scaleY float32) {
      let normalBefore = PathStrokePoint{
        X: -tangentBefore.Y * side,
        Y: tangentBefore.X * side,
      }
      let normalAfter = PathStrokePoint{
        X: -tangentAfter.Y * side,
        Y: tangentAfter.X * side,
      }
      let previous = Offset(center, normalBefore, half)
      let next = Offset(center, normalAfter, half)
      if SamePoint(previous, next) {
        return
      }
      if join == StrokeJoin.Round {
        AddRoundJoin(center, previous, next, half, commands, scaleX, scaleY)
        return
      }
      if join == StrokeJoin.Miter {
        let denominator = Cross(tangentBefore, tangentAfter)
        if MathF.Abs(denominator) > PointTolerance {
          let delta = Difference(next, previous)
          let distance = Cross(delta, tangentAfter) / denominator
          let miter = Add(previous, Scale(tangentBefore, distance))
          let miterLength = MathF.Sqrt(LengthSquared(Difference(miter, center)))
          if Finite(miterLength) && miterLength <= half * miterLimit
            && miterLimit > 0.0F {
              let polygon = scratch.Polygon
              polygon.Clear()
              polygon.Add(center)
              polygon.Add(previous)
              polygon.Add(miter)
              polygon.Add(next)
              AddPolygon(commands, polygon, scaleX, scaleY)
              return
            }
        }
      }
      let bevel = scratch.Polygon
      bevel.Clear()
      bevel.Add(center)
      bevel.Add(previous)
      bevel.Add(next)
      AddPolygon(commands, bevel, scaleX, scaleY)
    }

  private func AddInnerJoin(center PathStrokePoint, tangentBefore PathStrokePoint,
    tangentAfter PathStrokePoint, half float32, side float32,
    commands List[VectorPathCommand], scaleX float32, scaleY float32) {
      let previous = Offset(center, PathStrokePoint{
        X: -tangentBefore.Y * side,
        Y: tangentBefore.X * side,
      }, half)
      let next = Offset(center, PathStrokePoint{
        X: -tangentAfter.Y * side,
        Y: tangentAfter.X * side,
      }, half)
      if SamePoint(previous, next) {
        return
      }
      let polygon = scratch.Polygon
      polygon.Clear()
      polygon.Add(center)
      polygon.Add(previous)
      polygon.Add(next)
      AddPolygon(commands, polygon, scaleX, scaleY)
    }

  private func AddReversalJoin(center PathStrokePoint, tangentBefore PathStrokePoint,
    tangentAfter PathStrokePoint, half float32, join StrokeJoin,
    commands List[VectorPathCommand], scaleX float32, scaleY float32) {
      if join == StrokeJoin.Round {
        AddJoin(center, tangentBefore, tangentAfter, half, join, 0.0F, 1.0F,
          commands, scaleX, scaleY)
        AddJoin(center, tangentBefore, tangentAfter, half, join, 0.0F, -1.0F,
          commands, scaleX, scaleY)
        return
      }
      AddInnerJoin(center, tangentBefore, tangentAfter, half, 1.0F,
        commands, scaleX, scaleY)
      AddInnerJoin(center, tangentBefore, tangentAfter, half, -1.0F,
        commands, scaleX, scaleY)
    }

  private func AddRoundJoin(center PathStrokePoint, previous PathStrokePoint,
    next PathStrokePoint, half float32, commands List[VectorPathCommand],
    scaleX float32, scaleY float32) {
      let startAngle = MathF.Atan2(previous.Y - center.Y, previous.X - center.X)
      var delta = MathF.Atan2(next.Y - center.Y, next.X - center.X) - startAngle
      while delta > MathF.PI { delta = delta - MathF.PI * 2.0F }
      while delta < -MathF.PI { delta = delta + MathF.PI * 2.0F }
      let stepCount = int32(MathF.Ceiling(MathF.Abs(delta) / RoundStepRadians))
      let steps = stepCount <= 0 ? 1 : stepCount
      let polygon = scratch.Polygon
      polygon.Clear()
      polygon.Add(center)
      var index int32 = 0
      while index <= steps {
        let angle = startAngle + delta * float32(index) / float32(steps)
        polygon.Add(PathStrokePoint{
          X: center.X + MathF.Cos(angle) * half,
          Y: center.Y + MathF.Sin(angle) * half,
        })
        index++
      }
      AddPolygon(commands, polygon, scaleX, scaleY)
    }

  private func AddCap(center PathStrokePoint, tangent PathStrokePoint, half float32,
    start bool, commands List[VectorPathCommand], scaleX float32, scaleY float32) {
      let normal = PathStrokePoint{ X: -tangent.Y, Y: tangent.X }
      let outward = start ? Scale(tangent, -1.0F) : tangent
      let polygon = scratch.Polygon
      polygon.Clear()
      polygon.Add(center)
      var index int32 = 0
      let steps int32 = 16
      while index <= steps {
        let angle = MathF.PI * float32(index) / float32(steps)
        let radial = Scale(normal, MathF.Cos(angle) * half)
        let forward = Scale(outward, MathF.Sin(angle) * half)
        polygon.Add(Add(center, Add(radial, forward)))
        index++
      }
      AddPolygon(commands, polygon, scaleX, scaleY)
    }

  private func AddPolygon(commands List[VectorPathCommand], values List[PathStrokePoint],
    scaleX float32, scaleY float32) {
      if values.Count < 3 {
        return
      }
      var area float32 = 0.0F
      var index int32 = 0
      while index < values.Count {
        let next = index + 1 == values.Count ? 0 : index + 1
        area = area + values[index].X * values[next].Y
        -values[next].X * values[index].Y
        index++
      }
      if !Finite(area) || MathF.Abs(area) <= PointTolerance {
        return
      }
      let inverseX = 1.0F / scaleX
      let inverseY = 1.0F / scaleY
      let first = area >= 0.0F ? values[0] : values[values.Count - 1]
      commands.Add(VectorPathCommand{
        Kind: VectorPathCommandKind.MoveTo,
        X1: float64(first.X * inverseX),
        Y1: float64(first.Y * inverseY),
      })
      if area >= 0.0F {
        index = 1
        while index < values.Count {
          let value = values[index]
          commands.Add(VectorPathCommand{
            Kind: VectorPathCommandKind.LineTo,
            X1: float64(value.X * inverseX),
            Y1: float64(value.Y * inverseY),
          })
          index++
        }
      } else {
        index = values.Count - 2
        while index >= 0 {
          let value = values[index]
          commands.Add(VectorPathCommand{
            Kind: VectorPathCommandKind.LineTo,
            X1: float64(value.X * inverseX),
            Y1: float64(value.Y * inverseY),
          })
          index--
        }
      }
      commands.Add(VectorPathCommand{ Kind: VectorPathCommandKind.Close })
    }

  private func Offset(value PathStrokePoint, direction PathStrokePoint,
    amount float32) PathStrokePoint -> PathStrokePoint{
      X: value.X + direction.X * amount,
      Y: value.Y + direction.Y * amount,
    }

  private func Add(left PathStrokePoint, right PathStrokePoint) PathStrokePoint -> PathStrokePoint { X: left.X + right.X, Y: left.Y + right.Y }

  private func Difference(left PathStrokePoint, right PathStrokePoint) PathStrokePoint -> PathStrokePoint { X: left.X - right.X, Y: left.Y - right.Y }

  private func Scale(value PathStrokePoint, amount float32) PathStrokePoint -> PathStrokePoint { X: value.X * amount, Y: value.Y * amount }

  private func Cross(left PathStrokePoint, right PathStrokePoint) float32 -> left.X * right.Y - left.Y * right.X

  private func Dot(left PathStrokePoint, right PathStrokePoint) float32 -> left.X * right.X + left.Y * right.Y

  private func LengthSquared(value PathStrokePoint) float32 -> value.X * value.X + value.Y * value.Y

  private func SamePoint(left PathStrokePoint, right PathStrokePoint) bool -> MathF.Abs(left.X - right.X) <= PointTolerance
    && MathF.Abs(left.Y - right.Y) <= PointTolerance

  private func Finite(value float32) bool -> !Single.IsNaN(value) && !Single.IsInfinity(value)

  private func Finite64(value float64) bool -> !Double.IsNaN(value) && !Double.IsInfinity(value)
}

internal data struct PathDashState {
  internal var Index int32
  internal var Remaining float64
  internal var On bool
}
