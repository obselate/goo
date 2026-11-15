package Goo

import System

internal class PathBuilderFixtures {
  func PrimitivesAppendClosedContoursInViewBoxCoordinates() bool {
    let builder = PathBuilder(2.0, 3.0, 100.0, 100.0)
    if builder.Rectangle(10.0, 20.0, 30.0, 40.0) != builder
      || builder.Ellipse(10.0, 20.0, 30.0, 40.0) != builder
      || builder.RoundedRectangle(10.0, 20.0, 30.0, 40.0, 50.0) != builder {
      return false
    }
    let expected = PathBuilder(2.0, 3.0, 100.0, 100.0)
      .MoveTo(10.0, 20.0).LineTo(40.0, 20.0).LineTo(40.0, 60.0).LineTo(10.0, 60.0).Close()
      .MoveTo(10.0, 40.0).ArcTo(15.0, 20.0, 0.0, false, true, 40.0, 40.0)
      .ArcTo(15.0, 20.0, 0.0, false, true, 10.0, 40.0).Close()
      .MoveTo(25.0, 20.0).LineTo(25.0, 20.0)
      .ArcTo(15.0, 15.0, 0.0, false, true, 40.0, 35.0).LineTo(40.0, 45.0)
      .ArcTo(15.0, 15.0, 0.0, false, true, 25.0, 60.0).LineTo(25.0, 60.0)
      .ArcTo(15.0, 15.0, 0.0, false, true, 10.0, 45.0).LineTo(10.0, 35.0)
      .ArcTo(15.0, 15.0, 0.0, false, true, 25.0, 20.0).Close().Build()
    let path = builder.Build()
    if !path.Equals(expected) || PathGeometry.For(path).ContourCount != 3
      || !PathBuilder().RoundedRectangle(0.0, 0.0, 1.0, 1.0, 0.0).Build()
        .Equals(PathBuilder().Rectangle(0.0, 0.0, 1.0, 1.0).Build()) {
      return false
    }
    try { builder.Ellipse(0.0, 0.0, -1.0, 1.0) }
    catch (_ ArgumentOutOfRangeException) { return builder.Build().Equals(path) }
    return false
  }

  func ResetPreservesPublishedPathAndClearsContour() bool {
    let builder = PathBuilder(2.0, 3.0, 10.0, 20.0)
    let first = builder.MoveTo(2.0, 3.0).LineTo(12.0, 3.0).Build()
    let firstHash = first.Hash
    let repeated = builder.Build()
    let extended = builder.LineTo(12.0, 13.0).Build()
    let extendedGeometry = PathGeometry.For(extended)
    if repeated.Hash != firstHash || PathGeometry.For(repeated).QuadraticCount != 1
      || extendedGeometry.QuadraticCount != 2
      || extendedGeometry.Quadratics[1].X1 != 12.0F
      || extendedGeometry.Quadratics[1].Y1 != 13.0F { return false }
    if !Object.ReferenceEquals(builder, builder.Reset()) { return false }
    builder.MoveTo(5.0, 6.0).Reset()
    var rejected = false
    try {
      builder.LineTo(5.0, 6.0)
    } catch (error InvalidOperationException) {
      rejected = true
    }
    if !rejected { return false }
    let second = builder.MoveTo(2.0, 3.0).LineTo(2.0, 13.0).Build()
    let firstGeometry = PathGeometry.For(first)
    let secondGeometry = PathGeometry.For(second)
    return first.Hash == firstHash
      && firstGeometry.QuadraticCount == 1
      && firstGeometry.Quadratics[0].X1 == 12.0F
      && firstGeometry.Quadratics[0].Y1 == 3.0F
      && secondGeometry.QuadraticCount == 1
      && secondGeometry.Quadratics[0].X1 == 2.0F
      && secondGeometry.Quadratics[0].Y1 == 13.0F
      && second.ViewBoxX == 2.0 && second.ViewBoxY == 3.0
      && second.ViewBoxWidth == 10.0 && second.ViewBoxHeight == 20.0
  }
}
