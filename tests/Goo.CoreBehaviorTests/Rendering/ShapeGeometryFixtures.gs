package Goo

internal class ShapeGeometryFixtures {
  func StrokeTrimUsesGlobalContourLengthAndHitGeometry() bool {
    let path = PathBuilder(0.0, 0.0, 100.0, 20.0)
      .MoveTo(10.0, 5.0).LineTo(50.0, 5.0)
      .MoveTo(10.0, 15.0).LineTo(50.0, 15.0).Build()
    let shape = Shape{ Path: path, Width: 100, Height: 20,
      BorderWidth: 2, BorderColor: Color.White,
      StrokeStart: 0.25, StrokeEnd: 0.75 }
    let node = Reconciler{Res: Resolver{}}.Mount(shape)
    node.Rect = Rect{ W: 100.0F, H: 20.0F }
    node.ShapeStrokeInset = false
    if ShapeGeometry.HitTest(node, 15.0F, 5.5F)
      || !ShapeGeometry.HitTest(node, 35.0F, 5.5F)
      || !ShapeGeometry.HitTest(node, 15.0F, 15.5F)
      || ShapeGeometry.HitTest(node, 45.0F, 15.5F) { return false }
    node.Dashes = DashPattern([]float64{ 5.0, 5.0 }, 0.0)
    return ShapeGeometry.HitTest(node, 32.0F, 5.5F)
      && !ShapeGeometry.HitTest(node, 37.0F, 5.5F)
      && ShapeGeometry.HitTest(node, 12.0F, 15.5F)
      && !ShapeGeometry.HitTest(node, 17.0F, 15.5F)
  }

  func StrokeTrimPreservesFillAndOpensPartialClosedContour() bool {
    let path = PathBuilder(0.0, 0.0, 100.0, 100.0)
      .MoveTo(10.0, 10.0).LineTo(90.0, 10.0)
      .LineTo(90.0, 90.0).LineTo(10.0, 90.0).Close().Build()
    let node = Node{
      Kind: NodeKind.Shape,
      Rect: Rect{ W: 100.0F, H: 100.0F },
      ShapePath: path,
      ShapeFit: ShapeFit.Fill,
      ShapeStrokeInset: false,
      BorderLeftWidth: Length{ Unit: LengthUnit.Px, Value: 2.0F },
      BorderLeftColor: Color.White,
      StrokeStart: 0.0,
      StrokeEnd: 0.5,
    }
    if !ShapeGeometry.HitTest(node, 50.0F, 9.5F)
      || ShapeGeometry.HitTest(node, 50.0F, 90.5F)
      || !ShapeGeometry.HitTest(node, 50.0F, 50.0F)
      || ShapeGeometry.HitTest(node, 9.5F, 10.0F) {
      return false
    }
    node.ShapeStrokeCap = StrokeCap.Round
    if !ShapeGeometry.HitTest(node, 9.5F, 10.0F) { return false }
    node.StrokeEnd = 0.0
    if ShapeGeometry.HitTest(node, 50.0F, 9.5F)
      || !ShapeGeometry.HitTest(node, 50.0F, 50.0F) { return false }
    node.StrokeEnd = 1.0
    return ShapeGeometry.HitTest(node, 50.0F, 90.5F)
  }

  func StrokeTrimKeepsFullyIncludedMiddleContourClosed() bool {
    let builder = PathBuilder(0.0, 0.0, 40.0, 10.0)
    builder.MoveTo(0.0, 0.0).LineTo(10.0, 0.0)
    builder.MoveTo(20.0, 0.0).LineTo(25.0, 0.0)
      .LineTo(25.0, 5.0).LineTo(20.0, 5.0).Close()
    builder.MoveTo(30.0, 0.0).LineTo(40.0, 0.0)
    let path = builder.Build()
    let square = PathBuilder(0.0, 0.0, 40.0, 10.0)
      .MoveTo(20.0, 0.0).LineTo(25.0, 0.0)
      .LineTo(25.0, 5.0).LineTo(20.0, 5.0).Close().Build()
    let mapping = PathGeometry.Map(path, ShapeFit.Fill, 0.0F, 0.0F, 40.0F, 10.0F)
    let cache = PathStrokeCache()
    let trimmed = cache.Resolve(path, mapping, 2.0F,
      StrokeCap.Round, StrokeJoin.Miter, 4.0F, nil, 0.25, 0.75)
    let complete = cache.Resolve(square, mapping, 2.0F,
      StrokeCap.Round, StrokeJoin.Miter, 4.0F, nil, 0.0, 1.0)
    return trimmed.CommandCount != 0
      && trimmed.CommandCount == complete.CommandCount
  }

  func DashPhaseAndTrimReuseFlattenedContours() bool {
    let path = PathBuilder(0.0, 0.0, 100.0, 20.0)
      .MoveTo(10.0, 10.0).QuadraticTo(50.0, 0.0, 90.0, 10.0).Build()
    let mapping = PathGeometry.Map(path, ShapeFit.Fill, 0.0F, 0.0F, 100.0F, 20.0F)
    let cache = PathStrokeCache()
    let intervals = []float64{ 5.0, 5.0, 2.0 }
    let first = DashPattern(intervals, 0.0)
    intervals[0] = 100.0
    if first.Intervals.Count != 6 || first.Intervals[0] != 5.0
      || first.Intervals[3] != 5.0 { return false }
    let initial = cache.Resolve(path, mapping, 2.0F,
      StrokeCap.Round, StrokeJoin.Round, 4.0F, first, 0.0, 1.0)
    let flattened = cache.FlattenCount
    let shifted = cache.Resolve(path, mapping, 2.0F,
      StrokeCap.Round, StrokeJoin.Round, 4.0F,
      DashPattern([]float64{ 5.0, 5.0, 2.0 }, 3.0), 0.0, 1.0)
    let trimmed = cache.Resolve(path, mapping, 2.0F,
      StrokeCap.Round, StrokeJoin.Round, 4.0F, first, 0.25, 0.75)
    if flattened != 1 || cache.FlattenCount != flattened
      || initial.CommandCount == 0 || shifted.CommandCount == 0
      || trimmed.CommandCount == 0 { return false }
    let stretched = PathGeometry.Map(path, ShapeFit.Fill, 0.0F, 0.0F, 200.0F, 20.0F)
    cache.Resolve(path, stretched, 2.0F,
      StrokeCap.Round, StrokeJoin.Round, 4.0F, first, 0.0, 1.0)
    return cache.FlattenCount == flattened + 1
  }

  func InvalidStrokeTrimRejectsBeforeReconciliation() bool {
    var invalidRange = false
    try { Shape{ StrokeStart: -0.1 } }
    catch (error ArgumentOutOfRangeException) { invalidRange = true }
    if !invalidRange { return false }
    let reconciler = Reconciler{Res: Resolver{}}
    let node = reconciler.Mount(Shape{ StrokeStart: 0.2, StrokeEnd: 0.8 })
    var reversed = false
    try { reconciler.Diff(node, Shape{ StrokeStart: 0.9, StrokeEnd: 0.1 }) }
    catch (error ArgumentOutOfRangeException) { reversed = true }
    return reversed && node.StrokeStart == 0.2 && node.StrokeEnd == 0.8
  }

  func AnimatedDashPhaseHasBoundedAllocation() bool {
    let builder = PathBuilder(0.0, 0.0, 1024.0, 128.0)
    builder.MoveTo(0.0, 64.0)
    for index in 0 ... 128 {
      let x = float64(index) * 8.0
      builder.QuadraticTo(x + 4.0, if index % 2 == 0 { 24.0 } else { 104.0 },
        x + 8.0, 64.0)
    }
    let path = builder.Build()
    let mapping = PathGeometry.Map(path, ShapeFit.Fill, 0.0F, 0.0F, 1024.0F, 128.0F)
    let pattern = DashPattern([]float64{ 4.0, 4.0 }, 0.0)
    let cache = PathStrokeCache()
    cache.Resolve(path, mapping, 2.0F,
      StrokeCap.Round, StrokeJoin.Round, 4.0F, pattern, 0.0, 1.0)
    let flattened = cache.FlattenCount
    let before = GC.GetAllocatedBytesForCurrentThread()
    for phase in 1 ... 33 {
      pattern.SetOffset(float64(phase))
      let outline = cache.Resolve(path, mapping, 2.0F,
        StrokeCap.Round, StrokeJoin.Round, 4.0F, pattern, 0.0, 1.0)
      if outline.CommandCount == 0 { return false }
    }
    return flattened == 1 && cache.FlattenCount == flattened
      && GC.GetAllocatedBytesForCurrentThread() - before < 33554432L
  }

  func MutableStrokeGeometryReflattensOnRevision() bool {
    let owner = VectorPathNormalizedOwner(1, 1, 0.0, 0.0, 10.0, 10.0)
    let path = VectorPath.CreateMutableNormalized(owner, 0.0, 0.0, 10.0, 10.0)
    let contours = []PathContour{ PathGeometry.Contour(0, 1, false) }
    let initial = []PathQuadratic{
      PathGeometry.Quadratic(0.0F, 0.0F, 5.0F, 0.0F, 10.0F, 0.0F),
    }
    if !path.UpdateNormalized(initial, 1, contours, 1) { return false }
    let mapping = PathGeometry.Map(path, ShapeFit.Fill, 0.0F, 0.0F, 10.0F, 10.0F)
    let cache = PathStrokeCache()
    cache.Resolve(path, mapping, 2.0F,
      StrokeCap.Butt, StrokeJoin.Miter, 4.0F, nil, 0.0, 1.0)
    if cache.FlattenCount != 1 { return false }
    let updated = []PathQuadratic{
      PathGeometry.Quadratic(0.0F, 0.0F, 5.0F, 5.0F, 10.0F, 0.0F),
    }
    if !path.UpdateNormalized(updated, 1, contours, 1) { return false }
    let outline = cache.Resolve(path, mapping, 2.0F,
      StrokeCap.Butt, StrokeJoin.Miter, 4.0F, nil, 0.0, 1.0)
    return cache.FlattenCount == 2 && outline.CommandCount != 0
  }

  func LargeStrokeConstructionHasBoundedAllocation() bool {
    let builder = PathBuilder(0.0, 0.0, 1024.0, 64.0)
    for index in 0 ... 128 {
      builder.MoveTo(float64(index) * 8.0, 8.0).LineTo(float64(index) * 8.0 + 0.01, 8.0)
    }
    let path = builder.Build()
    let mapping = PathGeometry.Map(path, ShapeFit.Fill, 0.0F, 0.0F, 1024.0F, 64.0F)
    let cache = PathStrokeCache()
    let before = GC.GetAllocatedBytesForCurrentThread()
    let outline = cache.Resolve(path, mapping, 2.0F, StrokeCap.Round, StrokeJoin.Round, 4.0F, nil, 0.0, 1.0)
    let allocated = GC.GetAllocatedBytesForCurrentThread() - before
    return allocated < 67108864L && PathGeometry.For(outline).HasClosedContour
      && PathBandEncoder.Encode(outline).WordCount > 0
  }

  func RetainedPathReconciliationHasBoundedAllocation() bool {
    let builder = PathBuilder(0.0, 0.0, 1024.0, 64.0)
    for index in 0 ... 512 {
      builder.MoveTo(float64(index) * 2.0, 8.0).LineTo(float64(index) * 2.0 + 0.01, 8.0)
    }
    let path = builder.Build()
    let reconciler = Reconciler{Res: Resolver{}}
    let node = reconciler.Mount(Shape{Width: 1024, Height: 64, Path: path, BorderWidth: 2, BorderColor: Color.White})
    let next = Shape{Width: 1024, Height: 64, Path: path, BorderWidth: 2, BorderColor: Color.White}
    reconciler.Diff(node, next)
    let before = GC.GetAllocatedBytesForCurrentThread()
    for index in 0 ... 32 {
      reconciler.Diff(node, Shape{Width: 1024, Height: 64, Path: path, BorderWidth: 2, BorderColor: Color.White})
    }
    return GC.GetAllocatedBytesForCurrentThread() - before < 1048576L
      && node.ShapePath.Hash == path.Hash
  }

  func OpenContoursUseImplicitFillClosure() bool {
    let path = PathBuilder(0.0, 0.0, 10.0, 10.0).MoveTo(1.0, 1.0).LineTo(9.0, 1.0).LineTo(1.0, 9.0).Build()
    let geometry = PathGeometry.For(path)
    let encoding = PathBandEncoder.Encode(path)
    return !geometry.HasClosedContour
      && geometry.HasFillContour
      && geometry.EdgeCount == 3
      && geometry.Contains(2.0F, 2.0F, FillRule.NonZero)
      && !geometry.Contains(8.0F, 8.0F, FillRule.NonZero)
      && encoding.CurveCount == 3
      && encoding.WordCount > 0
  }

  func OpenContoursRemainOpenForStrokeConstruction() bool {
    let path = PathBuilder(0.0, 0.0, 10.0, 10.0).MoveTo(1.0, 5.0).LineTo(9.0, 5.0).Build()
    let mapping = PathGeometry.Map(path, ShapeFit.Fill, 0.0F, 0.0F, 100.0F, 100.0F)
    let outline = PathStrokeCache.Shared.Resolve(path, mapping, 2.0F,
      StrokeCap.Butt, StrokeJoin.Miter, 4.0F, nil, 0.0, 1.0)
    return !PathGeometry.For(path).HasClosedContour
      && outline.CommandCount != 0
      && PathGeometry.For(outline).HasClosedContour
  }

  func MutableOpenContoursRefreshImplicitFillClosure() bool {
    let owner = VectorPathNormalizedOwner(3, 1, 0.0, 0.0, 10.0, 10.0)
    let path = VectorPath.CreateMutableNormalized(owner, 0.0, 0.0, 10.0, 10.0)
    let initial = []PathQuadratic{
      PathGeometry.Quadratic(1.0F, 1.0F, 5.0F, 1.0F, 9.0F, 1.0F),
      PathGeometry.Quadratic(9.0F, 1.0F, 5.0F, 5.0F, 1.0F, 9.0F),
      PathGeometry.Quadratic(1.0F, 9.0F, 1.0F, 5.0F, 1.0F, 1.0F),
    }
    let contours = []PathContour{ PathGeometry.Contour(0, 3, false) }
    if !path.UpdateNormalized(initial, 3, contours, 1) { return false }
    let geometry = PathGeometry.For(path)
    if geometry.HasClosedContour || !geometry.HasFillContour || geometry.EdgeCount != 3
      || !geometry.Contains(2.0F, 2.0F, FillRule.NonZero) {
        return false
      }
    let updated = []PathQuadratic{
      PathGeometry.Quadratic(1.0F, 1.0F, 5.0F, 1.0F, 9.0F, 1.0F),
      PathGeometry.Quadratic(9.0F, 1.0F, 9.0F, 5.0F, 9.0F, 9.0F),
      PathGeometry.Quadratic(9.0F, 9.0F, 5.0F, 5.0F, 1.0F, 1.0F),
    }
    if !path.UpdateNormalized(updated, 3, contours, 1) { return false }
    let refreshed = PathGeometry.For(path)
    return Object.ReferenceEquals(geometry, refreshed)
      && refreshed.EdgeCount == 3
      && refreshed.Contains(8.0F, 3.0F, FillRule.NonZero)
      && !refreshed.Contains(2.0F, 8.0F, FillRule.NonZero)
  }

  func GeneratedStrokeMappingUsesFullShapeBounds() bool {
    let path = PathBuilder(0.0, 0.0, 10.0, 10.0).MoveTo(2.0, 2.0).LineTo(8.0, 2.0).LineTo(8.0, 8.0).LineTo(2.0, 8.0).Close().Build()
    let node = Node{
      Kind: NodeKind.Shape,
      ShapePath: path,
      ShapeFit: ShapeFit.Fill,
      Rect: Rect{ W: 100.0F, H: 100.0F },
      BorderLeftWidth: Length{ Unit: LengthUnit.Px, Value: 20.0F },
      BorderLeftColor: Color.White,
      ShapeStrokeInset: false,
    }
    if !ShapeGeometry.HitTest(node, 15.0F, 50.0F) { return false }
    node.ShapeStrokeInset = true
    return !ShapeGeometry.HitTest(node, 15.0F, 50.0F)
  }

  func VectorViewportPreservesTranslationAndMapsShapeHits() bool {
    let root = Node{
      Kind: NodeKind.Container,
      Rect: Rect{ X: 10.0F, Y: 20.0F, W: 300.0F, H: 100.0F },
      HitTestSelf: false,
    }
    let viewport = Node{
      Kind: NodeKind.Container,
      Rect: Rect{ X: 10.0F, Y: 20.0F, W: 100.0F, H: 50.0F },
      Parent: root,
      HitTestSelf: false,
    }
    root.Children.Add(viewport)
    let shape = Node{
      Kind: NodeKind.Shape,
      Rect: Rect{ X: 10.0F, Y: 20.0F, W: 100.0F, H: 50.0F },
      Parent: viewport,
      ShapePath: PathBuilder(0.0, 0.0, 100.0, 50.0).MoveTo(0.0, 0.0).LineTo(100.0, 0.0).LineTo(100.0, 50.0).LineTo(0.0, 50.0).Close().Build(),
    }
    viewport.Children.Add(shape)
    Transforming.SetTranslateX(viewport, Length{ Unit: LengthUnit.Px, Value: 5.0F })
    Transforming.SetVectorViewport(viewport, VectorViewport{
      NativeWidth: 100.0,
      NativeHeight: 50.0,
      Fit: ShapeFit.Contain,
    })
    let mapped = TransformGeometry.Map(viewport, 10.0F, 20.0F)
    if !mapped.Valid || mapped.X != 70.0F || mapped.Y != 20.0F
      || Transforming.TranslateX(viewport).Value != 5.0F
      || !viewport.HasVisualTransform{
        return false
      }
    let hit = hitTopmost(root, 170.0F, 70.0F)
    guard let target = hit else { return false }
    if target != shape || hitTopmost(root, 50.0F, 70.0F) != nil {
      return false
    }
    Transforming.SetVectorViewport(viewport, nil)
    let restored = TransformGeometry.Map(viewport, 10.0F, 20.0F)
    return restored.Valid && restored.X == 15.0F && restored.Y == 20.0F
      && Transforming.TranslateX(viewport).Value == 5.0F
      && viewport.HasTransformState && viewport.HasVisualTransform
  }
}
