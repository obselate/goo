package Goo

import System
import System.Collections.Generic
import System.Runtime.CompilerServices

internal data struct PathQuadratic {
  internal let X0 float32
  internal let Y0 float32
  internal let CX float32
  internal let CY float32
  internal let X1 float32
  internal let Y1 float32
}

internal data struct PathContour {
  internal let Start int32
  internal let End int32
  internal let Closed bool
}

internal data struct PathEdge {
  internal let X0 float32
  internal let Y0 float32
  internal let X1 float32
  internal let Y1 float32
}

internal data struct PathMapping {
  internal let Valid bool
  internal let ScaleX float32
  internal let ScaleY float32
  internal let TranslateX float32
  internal let TranslateY float32
  internal let Left float32
  internal let Top float32
  internal let Width float32
  internal let Height float32
}

internal class PathGeometry {
  internal let Quadratics []PathQuadratic
  internal let Contours []PathContour
  internal var Edges []PathEdge
  internal var QuadraticCount int32
  internal var ContourCount int32
  internal var EdgeCount int32
  internal var GeometryRevision uint64
  internal var HasClosedContour bool
  internal var HasFillContour bool
  internal var MinX float32
  internal var MinY float32
  internal var MaxX float32
  internal var MaxY float32

  internal init(quadratics []PathQuadratic, contours []PathContour, edges []PathEdge,
    hasClosedContour bool, hasFillContour bool, minX float32, minY float32,
    maxX float32, maxY float32) {
      Quadratics = quadratics
      Contours = contours
      Edges = edges
      QuadraticCount = quadratics.Length
      ContourCount = contours.Length
      EdgeCount = edges.Length
      GeometryRevision = 1uL
      HasClosedContour = hasClosedContour
      HasFillContour = hasFillContour
      MinX = minX
      MinY = minY
      MaxX = maxX
      MaxY = maxY
    }

  private init(owner VectorPathNormalizedOwner) {
    Quadratics = owner.Quadratics
    Contours = owner.Contours
    Edges = [0]PathEdge
    QuadraticCount = owner.QuadraticCount
    ContourCount = owner.ContourCount
    Refresh(owner)
  }

  shared {
    internal const MinimumTolerance float32 = 0.0000001F
    internal const RelativeTolerance float32 = 0.0001F
    internal const MaximumSubdivisionDepth int32 = 12

    internal func Quadratic(x0 float32, y0 float32, cx float32, cy float32,
      x1 float32, y1 float32) PathQuadratic -> PathQuadratic{ X0: x0, Y0: y0, CX: cx, CY: cy, X1: x1, Y1: y1 }

    internal func Contour(start int32, end int32, closed bool) PathContour -> PathContour { Start: start, End: end, Closed: closed }

    private let cache ConditionalWeakTable[VectorPathData, PathGeometry] =
    ConditionalWeakTable[VectorPathData, PathGeometry]()
    private let PathGeometryCacheLock object = Object()
    private let emptyGeometry PathGeometry = PathGeometry(
      []PathQuadratic{}, []PathContour{}, []PathEdge{}, false, false,
      0.0F, 0.0F, 0.0F, 0.0F)

    internal func For(path VectorPath) PathGeometry {
      guard let source = path.payload else { return emptyGeometry }
      if cache.TryGetValue(source, out var value) {
        if let owner = source.NormalizedOwner {
          if value.GeometryRevision != owner.GeometryRevision {
            lock (PathGeometryCacheLock) {
              if value.GeometryRevision != owner.GeometryRevision { value.Refresh(owner) }
            }
          }
        }
        return value
      }
      lock (PathGeometryCacheLock) {
        if cache.TryGetValue(source, out var retained) {
          if let owner = source.NormalizedOwner {
            if retained.GeometryRevision != owner.GeometryRevision {
              retained.Refresh(owner)
            }
          }
          return retained
        }
        let built = build(source)
        cache.Add(source, built)
        return built
      }
    }

    internal func Map(path VectorPath, fit ShapeFit, left float32, top float32,
      width float32, height float32) PathMapping{
        let viewBoxWidth = float32(path.ViewBoxWidth)
        let viewBoxHeight = float32(path.ViewBoxHeight)
        if width <= 0.0F || height <= 0.0F || viewBoxWidth <= 0.0F || viewBoxHeight <= 0.0F {
          return PathMapping{}
        }
        var scaleX = width / viewBoxWidth
        var scaleY = height / viewBoxHeight
        if fit == ShapeFit.Contain || fit == ShapeFit.Cover {
          let scale = if fit == ShapeFit.Contain {
            scaleX < scaleY ? scaleX : scaleY
          } else {
            scaleX > scaleY ? scaleX : scaleY
          }
          scaleX = scale
          scaleY = scale
        } else if fit == ShapeFit.None {
          scaleX = 1.0F
          scaleY = 1.0F
        }
        let translateX = left + (width - viewBoxWidth * scaleX) * 0.5F
        -float32(path.ViewBoxX) * scaleX
        let translateY = top + (height - viewBoxHeight * scaleY) * 0.5F
        -float32(path.ViewBoxY) * scaleY
        return PathMapping{
          Valid: finite(scaleX) && finite(scaleY) && finite(translateX) && finite(translateY),
          ScaleX: scaleX,
          ScaleY: scaleY,
          TranslateX: translateX,
          TranslateY: translateY,
          Left: left,
          Top: top,
          Width: width,
          Height: height,
        }
      }

    private func build(source VectorPathData) PathGeometry {
      if let owner = source.NormalizedOwner {
        return PathGeometry(owner)
      }
      guard let normalizedQuadratics = source.NormalizedQuadratics else {
        return buildCommands(source)
      }
      guard let normalizedContours = source.NormalizedContours else {
        return buildCommands(source)
      }
      return Create(normalizedQuadratics, normalizedContours)
    }

    private func buildCommands(source VectorPathData) PathGeometry {
      let builder = PathGeometryBuilder()
      for i in 0 ... source.Commands.Length {
        builder.Consume(source.Commands[i])
      }
      return builder.Build()
    }

    private func includePoint(ref minX float32, ref minY float32, ref maxX float32,
      ref maxY float32, ref hasPoint bool, x float32, y float32) {
        if !finite(x) || !finite(y) { return }
        if !hasPoint {
          minX = x
          minY = y
          maxX = x
          maxY = y
          hasPoint = true
          return
        }
        if x < minX { minX = x }
        if y < minY { minY = y }
        if x > maxX { maxX = x }
        if y > maxY { maxY = y }
      }

    private func quadraticValue(a float32, b float32, c float32, t float32) float32 -> (a * t + b) * t + c

    private func includeQuadratic(ref minX float32, ref minY float32, ref maxX float32,
      ref maxY float32, ref hasPoint bool, q PathQuadratic) {
        includePoint(ref minX, ref minY, ref maxX, ref maxY, ref hasPoint, q.X0, q.Y0)
        includePoint(ref minX, ref minY, ref maxX, ref maxY, ref hasPoint, q.X1, q.Y1)
        let ax = q.X0 - 2.0F * q.CX + q.X1
        let bx = 2.0F * (q.CX - q.X0)
        if MathF.Abs(ax) > 0.000001F {
          let tx = -bx / (2.0F * ax)
          if tx > 0.0F && tx < 1.0F {
            includePoint(ref minX, ref minY, ref maxX, ref maxY, ref hasPoint,
              quadraticValue(ax, bx, q.X0, tx), quadraticValue(
                q.Y0 - 2.0F * q.CY + q.Y1,
                2.0F * (q.CY - q.Y0), q.Y0, tx))
          }
        }
        let ay = q.Y0 - 2.0F * q.CY + q.Y1
        let by = 2.0F * (q.CY - q.Y0)
        if MathF.Abs(ay) > 0.000001F {
          let ty = -by / (2.0F * ay)
          if ty > 0.0F && ty < 1.0F {
            includePoint(ref minX, ref minY, ref maxX, ref maxY, ref hasPoint,
              quadraticValue(ax, bx, q.X0, ty), quadraticValue(ay, by, q.Y0, ty))
          }
        }
      }

    internal func Create(quadratics []PathQuadratic, contours []PathContour) PathGeometry {
      let edges = List[PathEdge]()
      var hasClosed = false
      var hasFill = false
      for i in 0 ... contours.Length {
        let contour = contours[i]
        if contour.End <= contour.Start { continue }
        hasFill = true
        if contour.Closed { hasClosed = true }
        for j in contour.Start ... contour.End {
          appendEdges(quadratics[j], edges)
        }
        if !contour.Closed {
          let first = quadratics[contour.Start]
          let last = quadratics[contour.End - 1]
          appendEdges(PathQuadratic{
            X0: last.X1,
            Y0: last.Y1,
            CX: (last.X1 + first.X0) * 0.5F,
            CY: (last.Y1 + first.Y0) * 0.5F,
            X1: first.X0,
            Y1: first.Y0,
          }, edges)
        }
      }

      var minX = 0.0F
      var minY = 0.0F
      var maxX = 0.0F
      var maxY = 0.0F
      var hasPoint = false
      for i in 0 ... quadratics.Length {
        includeQuadratic(ref minX, ref minY, ref maxX, ref maxY, ref hasPoint, quadratics[i])
      }
      if !hasPoint {
        minX = 0.0F
        minY = 0.0F
        maxX = 0.0F
        maxY = 0.0F
      }
      return PathGeometry(quadratics, contours, edges.ToArray(), hasClosed, hasFill,
        minX, minY, maxX, maxY)
    }

    private func appendEdges(q PathQuadratic, edges List[PathEdge]) {
      let scaleX = MathF.Max(MathF.Abs(q.CX - q.X0), MathF.Abs(q.X1 - q.CX))
      let scaleY = MathF.Max(MathF.Abs(q.CY - q.Y0), MathF.Abs(q.Y1 - q.CY))
      let scale = MathF.Max(scaleX, scaleY)
      let tolerance = MathF.Max(MinimumTolerance, scale * RelativeTolerance)
      appendQuadraticEdges(q.X0, q.Y0, q.CX, q.CY, q.X1, q.Y1,
        tolerance, 0, edges)
    }

    private func appendQuadraticEdges(x0 float32, y0 float32, cx float32, cy float32,
      x1 float32, y1 float32, tolerance float32, depth int32, edges List[PathEdge]) {
        let dx = x1 - x0
        let dy = y1 - y0
        let lengthSquared = dx * dx + dy * dy
        let controlX = cx - x0
        let controlY = cy - y0
        let toleranceSquared = tolerance * tolerance
        let flat = if lengthSquared > MinimumTolerance * MinimumTolerance {
          let cross = controlX * dy - controlY * dx
          let projection = controlX * dx + controlY * dy
          cross * cross <= toleranceSquared * lengthSquared
            && projection >= -tolerance * MathF.Sqrt(lengthSquared)
            && projection <= lengthSquared + tolerance * MathF.Sqrt(lengthSquared)
        } else {
          controlX * controlX + controlY * controlY <= toleranceSquared
        }
        if flat || depth >= MaximumSubdivisionDepth {
          if dx != 0.0F || dy != 0.0F {
            edges.Add(PathEdge{ X0: x0, Y0: y0, X1: x1, Y1: y1 })
          }
          return
        }

        let p01x = (x0 + cx) * 0.5F
        let p01y = (y0 + cy) * 0.5F
        let p12x = (cx + x1) * 0.5F
        let p12y = (cy + y1) * 0.5F
        let midX = (p01x + p12x) * 0.5F
        let midY = (p01y + p12y) * 0.5F
        appendQuadraticEdges(x0, y0, p01x, p01y, midX, midY,
          tolerance, depth + 1, edges)
        appendQuadraticEdges(midX, midY, p12x, p12y, x1, y1,
          tolerance, depth + 1, edges)
      }

    private func finite(value float32) bool -> !Single.IsNaN(value) && !Single.IsInfinity(value)
  }

  private func Refresh(owner VectorPathNormalizedOwner) {
    QuadraticCount = owner.QuadraticCount
    ContourCount = owner.ContourCount
    HasClosedContour = false
    HasFillContour = false
    var minX = 0.0F
    var minY = 0.0F
    var maxX = 0.0F
    var maxY = 0.0F
    var hasPoint = false
    var index int32 = 0
    while index < QuadraticCount {
      includeQuadratic(ref minX, ref minY, ref maxX, ref maxY, ref hasPoint,
        Quadratics[index])
      index++
    }
    EdgeCount = 0
    index = 0
    while index < ContourCount {
      let contour = Contours[index]
      if contour.End <= contour.Start {
        index++
        continue
      }
      HasFillContour = true
      var curveIndex = contour.Start
      while curveIndex < contour.End {
        appendOwnerEdges(Quadratics[curveIndex])
        curveIndex++
      }
      if contour.Closed {
        HasClosedContour = true
      } else {
        let first = Quadratics[contour.Start]
        let last = Quadratics[contour.End - 1]
        appendOwnerEdges(PathQuadratic{
          X0: last.X1,
          Y0: last.Y1,
          CX: (last.X1 + first.X0) * 0.5F,
          CY: (last.Y1 + first.Y0) * 0.5F,
          X1: first.X0,
          Y1: first.Y0,
        })
      }
      index++
    }
    if !hasPoint {
      minX = 0.0F
      minY = 0.0F
      maxX = 0.0F
      maxY = 0.0F
    }
    MinX = minX
    MinY = minY
    MaxX = maxX
    MaxY = maxY
    GeometryRevision = owner.GeometryRevision
  }

  private func appendOwnerEdges(q PathQuadratic) {
    let scaleX = MathF.Max(MathF.Abs(q.CX - q.X0), MathF.Abs(q.X1 - q.CX))
    let scaleY = MathF.Max(MathF.Abs(q.CY - q.Y0), MathF.Abs(q.Y1 - q.CY))
    let scale = MathF.Max(scaleX, scaleY)
    let tolerance = MathF.Max(PathGeometry.MinimumTolerance, scale * PathGeometry.RelativeTolerance)
    appendOwnerQuadraticEdges(q.X0, q.Y0, q.CX, q.CY, q.X1, q.Y1, tolerance, 0)
  }

  private func appendOwnerQuadraticEdges(x0 float32, y0 float32, cx float32, cy float32,
    x1 float32, y1 float32, tolerance float32, depth int32) {
      let dx = x1 - x0
      let dy = y1 - y0
      let lengthSquared = dx * dx + dy * dy
      let controlX = cx - x0
      let controlY = cy - y0
      let toleranceSquared = tolerance * tolerance
      let flat = if lengthSquared > PathGeometry.MinimumTolerance * PathGeometry.MinimumTolerance {
        let cross = controlX * dy - controlY * dx
        let projection = controlX * dx + controlY * dy
        cross * cross <= toleranceSquared * lengthSquared
          && projection >= -tolerance * MathF.Sqrt(lengthSquared)
          && projection <= lengthSquared + tolerance * MathF.Sqrt(lengthSquared)
      } else {
        controlX * controlX + controlY * controlY <= toleranceSquared
      }
      if flat || depth >= PathGeometry.MaximumSubdivisionDepth {
        if dx != 0.0F || dy != 0.0F {
          ensureEdgeCapacity(EdgeCount + 1)
          Edges[EdgeCount] = PathEdge{ X0: x0, Y0: y0, X1: x1, Y1: y1 }
          EdgeCount++
        }
        return
      }
      let p01x = (x0 + cx) * 0.5F
      let p01y = (y0 + cy) * 0.5F
      let p12x = (cx + x1) * 0.5F
      let p12y = (cy + y1) * 0.5F
      let midX = (p01x + p12x) * 0.5F
      let midY = (p01y + p12y) * 0.5F
      appendOwnerQuadraticEdges(x0, y0, p01x, p01y, midX, midY, tolerance, depth + 1)
      appendOwnerQuadraticEdges(midX, midY, p12x, p12y, x1, y1, tolerance, depth + 1)
    }

  private func ensureEdgeCapacity(required int32) {
    if required <= Edges.Length { return }
    var capacity = Edges.Length
    if capacity == 0 { capacity = 16 }
    while capacity < required {
      if capacity > Int32.MaxValue / 2 {
        capacity = required
      } else {
        capacity = capacity * 2
      }
    }
    let next = [capacity]PathEdge
    if EdgeCount > 0 { Array.Copy(Edges, next, EdgeCount) }
    Edges = next
  }

  internal func Contains(x float32, y float32, rule FillRule) bool {
    if !HasFillContour || EdgeCount == 0 || !finitePoint(x) || !finitePoint(y)
      || x < MinX || x > MaxX || y < MinY || y > MaxY{
        return false
      }
    var winding int32 = 0
    var parity bool = false
    for i in 0 ... EdgeCount {
      let edge = Edges[i]
      if pointOnEdge(edge, x, y) { return true }
      if edge.Y0 <= y && edge.Y1 > y {
        let atX = edge.X0 + (y - edge.Y0) * (edge.X1 - edge.X0) / (edge.Y1 - edge.Y0)
        if atX > x {
          parity = !parity
          winding++
        }
      } else if edge.Y1 <= y && edge.Y0 > y {
        let atX = edge.X1 + (y - edge.Y1) * (edge.X0 - edge.X1) / (edge.Y0 - edge.Y1)
        if atX > x {
          parity = !parity
          winding--
        }
      }
    }
    return rule == FillRule.EvenOdd ? parity : winding != 0
  }

  private func pointOnEdge(edge PathEdge, x float32, y float32) bool {
    let dx = edge.X1 - edge.X0
    let dy = edge.Y1 - edge.Y0
    let px = x - edge.X0
    let py = y - edge.Y0
    let lengthSquared = dx * dx + dy * dy
    let minimumSquared = MinimumTolerance * MinimumTolerance
    if lengthSquared <= minimumSquared {
      return px * px + py * py <= minimumSquared
    }
    let length = MathF.Sqrt(lengthSquared)
    let tolerance = MinimumTolerance + RelativeTolerance * length
    let cross = px * dy - py * dx
    if MathF.Abs(cross) > tolerance * length { return false }
    let projection = px * dx + py * dy
    let projectedTolerance = tolerance * length
    return projection >= -projectedTolerance
      && projection <= lengthSquared + projectedTolerance
  }

  private func finitePoint(value float32) bool -> !Single.IsNaN(value) && !Single.IsInfinity(value)
}

internal class PathGeometryBuilder {
  private let quadratics List[PathQuadratic]
  private let contours List[PathContour]
  private var active bool
  private var closed bool
  private var contourStart int32
  private var currentX float32
  private var currentY float32
  private var startX float32
  private var startY float32

  internal init() {
    quadratics = List[PathQuadratic]()
    contours = List[PathContour]()
  }

  internal func Consume(command VectorPathCommand) {
    switch command.Kind {
      case VectorPathCommandKind.MoveTo { moveTo(float32(command.X1), float32(command.Y1)) }
      case VectorPathCommandKind.LineTo { lineTo(float32(command.X1), float32(command.Y1)) }
      case VectorPathCommandKind.QuadraticTo {
        quadraticTo(float32(command.X1), float32(command.Y1),
          float32(command.X2), float32(command.Y2))
      }
      case VectorPathCommandKind.CubicTo {
        cubicTo(float32(command.X1), float32(command.Y1), float32(command.X2), float32(command.Y2),
          float32(command.X3), float32(command.Y3))
      }
      case VectorPathCommandKind.ArcTo {
        arcTo(float32(command.RadiusX), float32(command.RadiusY),
          float32(command.RotationDegrees), command.LargeArc, command.SweepClockwise,
          float32(command.X1), float32(command.Y1))
      }
      case VectorPathCommandKind.Close { closePath() }
      default { }
    }
  }

  internal func Build() PathGeometry {
    finishContour()
    return PathGeometry.Create(quadratics.ToArray(), contours.ToArray())
  }

  private func moveTo(x float32, y float32) {
    finishContour()
    active = true
    closed = false
    contourStart = quadratics.Count
    currentX = x
    currentY = y
    startX = x
    startY = y
  }

  private func lineTo(x float32, y float32) {
    if !active { return }
    addQuadratic(currentX, currentY, (currentX + x) * 0.5F, (currentY + y) * 0.5F, x, y)
    currentX = x
    currentY = y
  }

  private func quadraticTo(cx float32, cy float32, x float32, y float32) {
    if !active { return }
    addQuadratic(currentX, currentY, cx, cy, x, y)
    currentX = x
    currentY = y
  }

  private func cubicTo(c1x float32, c1y float32, c2x float32, c2y float32,
    x float32, y float32) {
      if !active { return }
      appendCubicQuadratics(PathPoint{ X: currentX, Y: currentY },
        PathPoint{ X: c1x, Y: c1y }, PathPoint{ X: c2x, Y: c2y },
        PathPoint{ X: x, Y: y }, 0)
      currentX = x
      currentY = y
    }

  private func appendCubicQuadratics(p0 PathPoint, p1 PathPoint, p2 PathPoint,
    p3 PathPoint, depth int32) {
      let qx = 0.75F * (p1.X + p2.X) - 0.25F * (p0.X + p3.X)
      let qy = 0.75F * (p1.Y + p2.Y) - 0.25F * (p0.Y + p3.Y)
      let tolerance = cubicTolerance(p0, p1, p2, p3)
      let error = MathF.Max(cubicQuadraticError(p0.X, p1.X, p2.X, p3.X, qx),
        cubicQuadraticError(p0.Y, p1.Y, p2.Y, p3.Y, qy))
      if error <= tolerance || depth >= PathGeometry.MaximumSubdivisionDepth {
        addQuadratic(p0.X, p0.Y, qx, qy, p3.X, p3.Y)
        return
      }

      let p01 = midpoint(p0, p1)
      let p12 = midpoint(p1, p2)
      let p23 = midpoint(p2, p3)
      let p012 = midpoint(p01, p12)
      let p123 = midpoint(p12, p23)
      let middle = midpoint(p012, p123)
      appendCubicQuadratics(p0, p01, p012, middle, depth + 1)
      appendCubicQuadratics(middle, p123, p23, p3, depth + 1)
    }

  private func cubicTolerance(p0 PathPoint, p1 PathPoint, p2 PathPoint,
    p3 PathPoint) float32{
      let scaleX = MathF.Max(MathF.Max(MathF.Abs(p1.X - p0.X), MathF.Abs(p2.X - p1.X)),
        MathF.Abs(p3.X - p2.X))
      let scaleY = MathF.Max(MathF.Max(MathF.Abs(p1.Y - p0.Y), MathF.Abs(p2.Y - p1.Y)),
        MathF.Abs(p3.Y - p2.Y))
      let spanX = MathF.Abs(p3.X - p0.X)
      let spanY = MathF.Abs(p3.Y - p0.Y)
      let scale = MathF.Max(MathF.Max(scaleX, scaleY), MathF.Max(spanX, spanY))
      return MathF.Max(PathGeometry.MinimumTolerance, scale * PathGeometry.RelativeTolerance)
    }

  private func cubicQuadraticError(p0 float32, p1 float32, p2 float32,
    p3 float32, quadraticControl float32) float32{
      let cubicControl1 = p0 + (quadraticControl - p0) * (2.0F / 3.0F)
      let cubicControl2 = p3 + (quadraticControl - p3) * (2.0F / 3.0F)
      return MathF.Max(MathF.Abs(p1 - cubicControl1), MathF.Abs(p2 - cubicControl2))
    }

  private func midpoint(a PathPoint, b PathPoint) PathPoint -> PathPoint { X: (a.X + b.X) * 0.5F, Y: (a.Y + b.Y) * 0.5F }

  private func arcTo(rxInput float32, ryInput float32, rotationDegrees float32,
    largeArc bool, sweep bool, x float32, y float32) {
      if !active { return }
      if currentX == x && currentY == y { return }
      let rx = MathF.Abs(rxInput)
      let ry = MathF.Abs(ryInput)
      if rx <= 0.0F || ry <= 0.0F {
        lineTo(x, y)
        return
      }

      let phi = (rotationDegrees % 360.0F) * MathF.PI / 180.0F
      let cosPhi = MathF.Cos(phi)
      let sinPhi = MathF.Sin(phi)
      let halfDx = (currentX - x) * 0.5F
      let halfDy = (currentY - y) * 0.5F
      let xPrime = cosPhi * halfDx + sinPhi * halfDy
      let yPrime = -sinPhi * halfDx + cosPhi * halfDy
      let rxSquared = rx * rx
      let rySquared = ry * ry
      let xPrimeSquared = xPrime * xPrime
      let yPrimeSquared = yPrime * yPrime
      let lambda = xPrimeSquared / rxSquared + yPrimeSquared / rySquared
      let scaledRx = if lambda > 1.0F { rx * MathF.Sqrt(lambda) } else { rx }
      let scaledRy = if lambda > 1.0F { ry * MathF.Sqrt(lambda) } else { ry }
      let scaledRxSquared = scaledRx * scaledRx
      let scaledRySquared = scaledRy * scaledRy
      let denominator = scaledRxSquared * yPrimeSquared + scaledRySquared * xPrimeSquared
      let numerator = scaledRxSquared * scaledRySquared - denominator
      let ratio = if denominator <= 0.0F { 0.0F } else { MathF.Max(0.0F, numerator / denominator) }
      let sign = largeArc == sweep ? -1.0F : 1.0F
      let factor = sign * MathF.Sqrt(ratio)
      let centerPrimeX = factor * scaledRx * yPrime / scaledRy
      let centerPrimeY = -factor * scaledRy * xPrime / scaledRx
      let midpointX = (currentX + x) * 0.5F
      let midpointY = (currentY + y) * 0.5F
      let centerX = cosPhi * centerPrimeX - sinPhi * centerPrimeY + midpointX
      let centerY = sinPhi * centerPrimeX + cosPhi * centerPrimeY + midpointY
      let unitStartX = (xPrime - centerPrimeX) / scaledRx
      let unitStartY = (yPrime - centerPrimeY) / scaledRy
      let unitEndX = (-xPrime - centerPrimeX) / scaledRx
      let unitEndY = (-yPrime - centerPrimeY) / scaledRy
      let startAngle = MathF.Atan2(unitStartY, unitStartX)
      var delta = MathF.Atan2(unitStartX * unitEndY - unitStartY * unitEndX,
        unitStartX * unitEndX + unitStartY * unitEndY)
      if sweep && delta < 0.0F {
        delta = delta + 2.0F * MathF.PI
      }
      if !sweep && delta > 0.0F {
        delta = delta - 2.0F * MathF.PI
      }
      let count = int32(MathF.Ceiling(MathF.Abs(delta) / (0.5F * MathF.PI)))
      if count <= 0 {
        lineTo(x, y)
        return
      }
      let step = delta / float32(count)
      var previousX = currentX
      var previousY = currentY
      for i in 0 ... count {
        let angle0 = startAngle + step * float32(i)
        let angle1 = if i + 1 == count { startAngle + delta } else { angle0 + step }
        let endpoint = ellipsePoint(centerX, centerY, scaledRx, scaledRy, cosPhi, sinPhi, angle1)
        let endX = i + 1 == count ? x : endpoint.X
        let endY = i + 1 == count ? y : endpoint.Y
        appendArcQuadratics(centerX, centerY, scaledRx, scaledRy, cosPhi, sinPhi,
          angle0, angle1, PathPoint{ X: previousX, Y: previousY },
          PathPoint{ X: endX, Y: endY }, 0)
        previousX = endX
        previousY = endY
      }
      currentX = x
      currentY = y
    }

  private func appendArcQuadratics(centerX float32, centerY float32, rx float32, ry float32,
    cosPhi float32, sinPhi float32, angle0 float32, angle1 float32,
    p0 PathPoint, p1 PathPoint, depth int32) {
      let control = arcControl(p0, rx, ry, cosPhi, sinPhi, angle0, angle1 - angle0)
      let tolerance = arcTolerance(p0, control, p1)
      let error = arcQuadraticError(centerX, centerY, rx, ry, cosPhi, sinPhi,
        angle0, angle1, p0, control, p1)
      if error <= tolerance || depth >= PathGeometry.MaximumSubdivisionDepth {
        addQuadratic(p0.X, p0.Y, control.X, control.Y, p1.X, p1.Y)
        return
      }

      let middleAngle = (angle0 + angle1) * 0.5F
      let middle = ellipsePoint(centerX, centerY, rx, ry, cosPhi, sinPhi, middleAngle)
      appendArcQuadratics(centerX, centerY, rx, ry, cosPhi, sinPhi,
        angle0, middleAngle, p0, middle, depth + 1)
      appendArcQuadratics(centerX, centerY, rx, ry, cosPhi, sinPhi,
        middleAngle, angle1, middle, p1, depth + 1)
    }

  private func arcControl(p0 PathPoint, rx float32, ry float32,
    cosPhi float32, sinPhi float32, angle float32, delta float32) PathPoint{
      let tangentX = -rx * MathF.Sin(angle)
      let tangentY = ry * MathF.Cos(angle)
      let factor = MathF.Tan(delta * 0.5F)
      return PathPoint{
        X: p0.X + factor * (cosPhi * tangentX - sinPhi * tangentY),
        Y: p0.Y + factor * (sinPhi * tangentX + cosPhi * tangentY),
      }
    }

  private func arcTolerance(p0 PathPoint, control PathPoint, p1 PathPoint) float32 {
    let scaleX = MathF.Max(MathF.Abs(control.X - p0.X), MathF.Abs(p1.X - control.X))
    let scaleY = MathF.Max(MathF.Abs(control.Y - p0.Y), MathF.Abs(p1.Y - control.Y))
    let scale = MathF.Max(scaleX, scaleY)
    return MathF.Max(PathGeometry.MinimumTolerance, scale * PathGeometry.RelativeTolerance)
  }

  private func arcQuadraticError(centerX float32, centerY float32, rx float32, ry float32,
    cosPhi float32, sinPhi float32, angle0 float32, angle1 float32,
    p0 PathPoint, control PathPoint, p1 PathPoint) float32{
      let span = angle1 - angle0
      let quarter = arcPointError(centerX, centerY, rx, ry, cosPhi, sinPhi,
        angle0 + span * 0.25F, p0, control, p1, 0.25F)
      let half = arcPointError(centerX, centerY, rx, ry, cosPhi, sinPhi,
        angle0 + span * 0.5F, p0, control, p1, 0.5F)
      let threeQuarter = arcPointError(centerX, centerY, rx, ry, cosPhi, sinPhi,
        angle0 + span * 0.75F, p0, control, p1, 0.75F)
      return MathF.Max(quarter, MathF.Max(half, threeQuarter))
    }

  private func arcPointError(centerX float32, centerY float32, rx float32, ry float32,
    cosPhi float32, sinPhi float32, angle float32, p0 PathPoint,
    control PathPoint, p1 PathPoint, t float32) float32{
      let expected = ellipsePoint(centerX, centerY, rx, ry, cosPhi, sinPhi, angle)
      let inverse = 1.0F - t
      let actual = PathPoint{
        X: inverse * inverse * p0.X + 2.0F * inverse * t * control.X + t * t * p1.X,
        Y: inverse * inverse * p0.Y + 2.0F * inverse * t * control.Y + t * t * p1.Y,
      }
      return MathF.Max(MathF.Abs(expected.X - actual.X), MathF.Abs(expected.Y - actual.Y))
    }

  private func ellipsePoint(centerX float32, centerY float32, rx float32, ry float32,
    cosPhi float32, sinPhi float32, angle float32) PathPoint{
      let localX = rx * MathF.Cos(angle)
      let localY = ry * MathF.Sin(angle)
      return PathPoint{
        X: centerX + cosPhi * localX - sinPhi * localY,
        Y: centerY + sinPhi * localX + cosPhi * localY,
      }
    }

  private func addQuadratic(x0 float32, y0 float32, cx float32, cy float32,
    x1 float32, y1 float32) {
      quadratics.Add(PathQuadratic{ X0: x0, Y0: y0, CX: cx, CY: cy, X1: x1, Y1: y1 })
    }

  private func closePath() {
    if !active { return }
    if currentX != startX || currentY != startY {
      lineTo(startX, startY)
    }
    closed = true
    finishContour()
  }

  private func finishContour() {
    if !active { return }
    contours.Add(PathContour{ Start: contourStart, End: quadratics.Count, Closed: closed })
    active = false
  }

}

internal data struct PathPoint {
  internal let X float32
  internal let Y float32
}
