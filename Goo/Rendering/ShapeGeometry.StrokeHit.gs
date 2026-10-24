package Goo

import System
import System.Runtime.CompilerServices

private class ShapeStrokeHitSource {
    internal var Curves[]PathQuadratic = []PathQuadratic{}
    internal var Owner VectorPathNormalizedOwner?
    internal var Path VectorPath = VectorPath.Empty
    internal var Revision uint64
    internal var Matrix Affine2D

    internal func Update(geometry PathGeometry, matrix Affine2D) {
        if Revision == geometry.GeometryRevision && Matrix.A == matrix.A && Matrix.B == matrix.B
        && Matrix.C == matrix.C && Matrix.D == matrix.D {
            return
        }
        Curves = GrowArray(Curves, 0, geometry.QuadraticCount, 16)
        for index in 0 ... geometry.QuadraticCount {
            let source = geometry.Quadratics[index]
            Curves[index] = PathGeometry.Quadratic(
                matrix.A * source.X0 + matrix.B * source.Y0,
                matrix.C * source.X0 + matrix.D * source.Y0,
                matrix.A * source.CX + matrix.B * source.CY,
                matrix.C * source.CX + matrix.D * source.CY,
                matrix.A * source.X1 + matrix.B * source.Y1,
                matrix.C * source.X1 + matrix.D * source.Y1
            )
        }
        if Owner == nil || Owner!!.Quadratics.Length < geometry.QuadraticCount
        || Owner!!.Contours.Length < geometry.ContourCount {
            let owner = VectorPathNormalizedOwner(Curves.Length, geometry.ContourCount, 0.0, 0.0, 1.0, 1.0)
            Owner = owner
            Path = VectorPath.CreateMutableNormalized(owner, 0.0, 0.0, 1.0, 1.0)
        }
        Owner!!.Update(Curves, geometry.QuadraticCount, geometry.Contours, geometry.ContourCount)
        Matrix = matrix
        Revision = geometry.GeometryRevision
    }
}

internal partial class ShapeGeometry {
    shared {
        private let strokeHitSources ConditionalWeakTable[VectorPathData, ShapeStrokeHitSource] =
        ConditionalWeakTable[VectorPathData, ShapeStrokeHitSource]()

        private func NonScalingStrokeHit(n Node, geometry ResolvedShapeGeometry, x float32, y float32) bool {
            guard let payload = geometry.Path.payload else {
                return false
            }
            let world = TransformGeometry.WindowMatrix(n)
            let mapping = geometry.Mapping
            let matrix = Affine2D{
                A: world.A * mapping.ScaleX,
                B: world.B * mapping.ScaleY,
                C: world.C * mapping.ScaleX,
                D: world.D * mapping.ScaleY,
            }
            let localX = (x - mapping.TranslateX) / mapping.ScaleX
            let localY = (y - mapping.TranslateY) / mapping.ScaleY
            let path = PathGeometry.For(geometry.Path)
            let extentX = geometry.StrokeExtent / MathF.Abs(mapping.ScaleX)
            let extentY = geometry.StrokeExtent / MathF.Abs(mapping.ScaleY)
            if localX < path.MinX - extentX || localX > path.MaxX + extentX
            || localY < path.MinY - extentY || localY > path.MaxY + extentY {
                return false
            }
            let source = strokeHitSources.GetValue(payload, (value) -> ShapeStrokeHitSource())
            lock (source) {
                source.Update(path, matrix)
                let outline = PathStrokeCache.Shared.Resolve(
                    source.Path,
                    PathMapping{Valid: true, ScaleX: 1.0F, ScaleY: 1.0F},
                    geometry.StrokeWidth,
                    n.ShapeStrokeCap,
                    n.ShapeStrokeJoin,
                    float32(n.MiterLimit),
                    n.Dashes,
                    n.StrokeStart,
                    n.StrokeEnd
                )
                return PathGeometry.For(outline).Contains(
                    matrix.A * localX + matrix.B * localY,
                    matrix.C * localX + matrix.D * localY,
                    FillRule.NonZero
                )
            }
        }
    }
}
