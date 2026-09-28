package Goo

import System

internal class PathBuilderFixtures {
  func ResetPreservesPublishedPathAndClearsContour() bool {
    let builder = PathBuilder(2.0, 3.0, 10.0, 20.0)
    let first = builder.MoveTo(2.0, 3.0).LineTo(12.0, 3.0).Build()
    let firstHash = first.Hash
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
