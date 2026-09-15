package Goo

import Facebook.Yoga

internal data struct ResolvedShapeGeometry {
  internal let Content Rect
  internal let Mapping PathMapping
  internal let Path VectorPath
  internal let StrokeWidth float32
  internal let StrokeExtent float32
  internal let StrokeVisible bool
}

internal class ShapeGeometry {
  shared {
    internal func Resolve(n Node, bounds Rect) ResolvedShapeGeometry {
      let strokeWidth = n.BorderLeftWidth.Px
      let strokeInset = if n.ShapeStrokeInset { strokeWidth } else { 0.0F }
      let halfStroke = strokeInset * 0.5F
      let left = resolveEdgePadding(n, YGEdge.Left, bounds.W)
      let top = resolveEdgePadding(n, YGEdge.Top, bounds.W)
      let right = resolveEdgePadding(n, YGEdge.Right, bounds.W)
      let bottom = resolveEdgePadding(n, YGEdge.Bottom, bounds.W)
      let content = Rect{
        X: bounds.X + left + halfStroke,
        Y: bounds.Y + top + halfStroke,
        W: bounds.W - left - right - strokeInset,
        H: bounds.H - top - bottom - strokeInset,
      }
      let mapping = PathGeometry.Map(n.ShapePath, n.ShapeFit, content.X, content.Y, content.W, content.H)
      let path = mapping.Valid
      ? PathRoundedCache.Shared.Resolve(n.ShapePath, mapping, n.ShapeCornerRadius) : VectorPath.Empty
      return ResolvedShapeGeometry{
        Content: content,
        Mapping: mapping,
        Path: path,
        StrokeWidth: strokeWidth,
        StrokeExtent: resolveShapeStrokeExtent(strokeWidth, n.ShapeStrokeJoin, float32(n.MiterLimit)),
        StrokeVisible: strokeWidth > 0.0F && n.BorderLeftColor.A > 0.0F,
      }
    }

    internal func Stroke(n Node, geometry ResolvedShapeGeometry) VectorPath {
      if !geometry.StrokeVisible || geometry.Path.CommandCount == 0 {
        return VectorPath.Empty
      }
      return PathStrokeCache.Shared.Resolve(
        geometry.Path,
        geometry.Mapping,
        geometry.StrokeWidth,
        n.ShapeStrokeCap,
        n.ShapeStrokeJoin,
        float32(n.MiterLimit),
        n.Dashes)
    }

    internal func HitTest(n Node, x float32, y float32) bool {
      let geometry = Resolve(n, n.Rect)
      let content = geometry.Content
      let extent = geometry.StrokeExtent
      if content.W <= 0.0F || content.H <= 0.0F
        || x < content.X - extent || y < content.Y - extent
        || x >= content.X + content.W + extent || y >= content.Y + content.H + extent{
          return !PathGeometry.For(n.ShapePath).HasFillContour && geometry.StrokeWidth <= 0.0F
        }
      let mapping = geometry.Mapping
      if !mapping.Valid || mapping.ScaleX == 0.0F || mapping.ScaleY == 0.0F {
        return !PathGeometry.For(n.ShapePath).HasFillContour && geometry.StrokeWidth <= 0.0F
      }
      if geometry.Path.CommandCount == 0 {
        return !PathGeometry.For(n.ShapePath).HasFillContour && !geometry.StrokeVisible
      }
      let localX = (x - mapping.TranslateX) / mapping.ScaleX
      let localY = (y - mapping.TranslateY) / mapping.ScaleY
      let fillHit = PathGeometry.For(geometry.Path).Contains(localX, localY, n.ShapeFillRule)
      if !geometry.StrokeVisible {
        return fillHit
      }
      let outline = Stroke(n, geometry)
      let strokeHit = outline.CommandCount != 0
        && PathGeometry.For(outline).Contains(localX, localY, FillRule.NonZero)
      return fillHit || strokeHit
    }

  }
}
