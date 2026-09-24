package Goo

internal class ShapeGeometryFixtures {
  func LargeStrokeConstructionHasBoundedAllocation() bool {
    let builder = PathBuilder(0.0, 0.0, 1024.0, 64.0)
    for index in 0 ... 128 {
      builder.MoveTo(float64(index) * 8.0, 8.0).LineTo(float64(index) * 8.0 + 0.01, 8.0)
    }
    let path = builder.Build()
    let mapping = PathGeometry.Map(path, ShapeFit.Fill, 0.0F, 0.0F, 1024.0F, 64.0F)
    let cache = PathStrokeCache()
    let before = GC.GetAllocatedBytesForCurrentThread()
    let outline = cache.Resolve(path, mapping, 2.0F, StrokeCap.Round, StrokeJoin.Round, 4.0F, nil)
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
      StrokeCap.Butt, StrokeJoin.Miter, 4.0F, nil)
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
