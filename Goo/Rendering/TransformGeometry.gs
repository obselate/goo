package Goo

import Facebook.Yoga
import System

internal data struct TransformPoint {
  internal var Valid bool
  internal var X float32
  internal var Y float32
}

internal data struct Affine2D {
  internal var A float32
  internal var B float32
  internal var C float32
  internal var D float32
  internal var TX float32
  internal var TY float32
}

internal data struct TransformBounds {
  internal var X float32
  internal var Y float32
  internal var W float32
  internal var H float32
}

internal data struct ScrollTranslation {
  internal var X float32
  internal var Y float32
  internal var PixelX float32
  internal var PixelY float32
}

internal class TransformGeometry {
  shared {
    internal func Matrix(n Node) Affine2D {
      let state = Transforming.Get(n)
      let authored = if let value = state { authoredMatrix(n, value) }
      else { Affine2D{ A: 1.0F, D: 1.0F } }
      guard let value = state, let viewport = value.Viewport else { return authored }
      guard let parent = n.Parent else { return authored }
      let nativeWidth = float32(viewport.NativeWidth)
      let nativeHeight = float32(viewport.NativeHeight)
      let destinationWidth = parent.Rect.W
      let destinationHeight = parent.Rect.H
      if !finite(nativeWidth) || !finite(nativeHeight)
        || nativeWidth <= 0.0F || nativeHeight <= 0.0F
        || !finite(destinationWidth) || !finite(destinationHeight)
        || destinationWidth <= 0.0F || destinationHeight <= 0.0F {
          return Affine2D{}
        }
      var scaleX = destinationWidth / nativeWidth
      var scaleY = destinationHeight / nativeHeight
      switch viewport.Fit {
        case ShapeFit.Contain {
          let scale = scaleX < scaleY ? scaleX : scaleY
          scaleX = scale
          scaleY = scale
        }
        case ShapeFit.Cover {
          let scale = scaleX > scaleY ? scaleX : scaleY
          scaleX = scale
          scaleY = scale
        }
        case ShapeFit.None {
          scaleX = 1.0F
          scaleY = 1.0F
        }
        default { }
      }
      let offsetX = parent.Rect.X + (destinationWidth - nativeWidth * scaleX) * 0.5F
      let offsetY = parent.Rect.Y + (destinationHeight - nativeHeight * scaleY) * 0.5F
      let viewportTransform = Affine2D{
        A: scaleX,
        D: scaleY,
        TX: offsetX - scaleX * n.Rect.X,
        TY: offsetY - scaleY * n.Rect.Y,
      }
      return compose(viewportTransform, authored)
    }

    internal func WindowMatrix(n Node) Affine2D {
      let local = Matrix(n)
      if n.IsPortal { return local }
      guard let parent = n.Parent else { return local }
      let outer = WindowMatrix(parent)
      var result = compose(outer, local)
      if (parent.PlacedScrollX != 0.0F || parent.PlacedScrollY != 0.0F)
        && !ScrollbarParts.ActiveChildren(parent).Contains(n) {
        let offset = ScrollOffset(parent, outer,
          parent.Kind == NodeKind.Editor && n.EditorSlotBlock ? 0.0F : parent.PlacedScrollX,
          parent.PlacedScrollY)
        result.TX -= offset.X
        result.TY -= offset.Y
      }
      return result
    }

    internal func PixelDensity(n Node) float32 {
      if let yoga = n.Yoga {
        if let config = YGNodeAPI.YGNodeGetConfig(yoga) {
          let scale = YGConfigAPI.YGConfigGetPointScaleFactor(config)
          if scale > 0.0F && finite(scale) { return scale }
        }
      }
      return 1.0F
    }

    internal func ScrollOffset(n Node, window Affine2D) ScrollTranslation ->
      ScrollOffset(n, window, n.PlacedScrollX, n.PlacedScrollY)

    internal func ScrollOffset(n Node, window Affine2D, x float32, y float32) ScrollTranslation {
      if x == 0.0F && y == 0.0F { return ScrollTranslation{} }
      let scale = PixelDensity(n)
      let pixelX = MathF.Round((window.A * x + window.B * y) * scale)
      let pixelY = MathF.Round((window.C * x + window.D * y) * scale)
      return ScrollTranslation{X: pixelX / scale, Y: pixelY / scale, PixelX: pixelX, PixelY: pixelY}
    }

    internal func ContentPoint(n Node, x float32, y float32, verticalOnly bool = false) TransformPoint ->
      ContentPoint(n, x, y, verticalOnly ? 0.0F : n.PlacedScrollX, n.PlacedScrollY)

    internal func ContentPoint(n Node, x float32, y float32,
      scrollX float32, scrollY float32) TransformPoint {
      if scrollX == 0.0F && scrollY == 0.0F {
        return TransformPoint{ Valid: true, X: x, Y: y }
      }
      let window = WindowMatrix(n)
      let offset = ScrollOffset(n, window, scrollX, scrollY)
      let determinant = window.A * window.D - window.B * window.C
      if !finite(determinant) || MathF.Abs(determinant) <= 0.000000000001F {
        return TransformPoint{}
      }
      return TransformPoint{
        Valid: true,
        X: x + (window.D * offset.X - window.B * offset.Y) / determinant,
        Y: y + (-window.C * offset.X + window.A * offset.Y) / determinant,
      }
    }

    private func authoredMatrix(n Node, value TransformValue) Affine2D {
      // Fixed pipeline: scale, then skew, then rotation (translation applies last).
      let sx = value.Scale * value.ScaleX
      let sy = value.Scale * value.ScaleY
      let a = (value.Cos - value.Sin * value.TanY) * sx
      let b = (value.Cos * value.TanX - value.Sin) * sy
      let c = (value.Sin + value.Cos * value.TanY) * sx
      let d = (value.Sin * value.TanX + value.Cos) * sy
      let ox = n.Rect.X + resolve(value.OriginX, n.Rect.W)
      let oy = n.Rect.Y + resolve(value.OriginY, n.Rect.H)
      let tx = resolve(value.TranslateX, n.Rect.W)
      let ty = resolve(value.TranslateY, n.Rect.H)
      return Affine2D{
        A: a, B: b, C: c, D: d,
        TX: ox + tx - a * ox - b * oy,
        TY: oy + ty - c * ox - d * oy,
      }
    }

    private func compose(outer Affine2D, inner Affine2D) Affine2D -> Affine2D {
      A: outer.A * inner.A + outer.B * inner.C,
      B: outer.A * inner.B + outer.B * inner.D,
      C: outer.C * inner.A + outer.D * inner.C,
      D: outer.C * inner.B + outer.D * inner.D,
      TX: outer.A * inner.TX + outer.B * inner.TY + outer.TX,
      TY: outer.C * inner.TX + outer.D * inner.TY + outer.TY,
    }

    internal func Unmap(n Node, x float32, y float32) TransformPoint {
      if !n.HasVisualTransform {
        return TransformPoint{ Valid: true, X: x, Y: y }
      }
      return unmap(Matrix(n), x, y)
    }

    private func unmap(m Affine2D, x float32, y float32) TransformPoint {
      let determinant = m.A * m.D - m.B * m.C
      if !finite(determinant) || MathF.Abs(determinant) <= 0.000000000001F {
        return TransformPoint{}
      }
      let px = x - m.TX
      let py = y - m.TY
      let mappedX = (m.D * px - m.B * py) / determinant
      let mappedY = (-m.C * px + m.A * py) / determinant
      if !finite(mappedX) || !finite(mappedY) { return TransformPoint{} }
      return TransformPoint{ Valid: true, X: mappedX, Y: mappedY }
    }

    internal func Map(n Node, x float32, y float32) TransformPoint {
      if !n.HasVisualTransform {
        return TransformPoint{ Valid: true, X: x, Y: y }
      }
      return MapAffinePoint(Matrix(n), x, y)
    }

    private func MapAffinePoint(m Affine2D, x float32, y float32) TransformPoint {
      let mappedX = m.A * x + m.B * y + m.TX
      let mappedY = m.C * x + m.D * y + m.TY
      if !finite(mappedX) || !finite(mappedY) { return TransformPoint{} }
      return TransformPoint{ Valid: true, X: mappedX, Y: mappedY }
    }

    private func InheritedScrollOffset(n Node) ScrollTranslation {
      var result ScrollTranslation
      var current = n
      while let parent = current.Parent {
        if current.IsPortal { break }
        if (parent.PlacedScrollX != 0.0F || parent.PlacedScrollY != 0.0F)
          && !ScrollbarParts.ActiveChildren(parent).Contains(current) {
            let offset = ScrollOffset(parent, WindowMatrix(parent),
              parent.Kind == NodeKind.Editor && current.EditorSlotBlock ? 0.0F : parent.PlacedScrollX,
              parent.PlacedScrollY)
            result.X += offset.X
            result.Y += offset.Y
          }
        current = parent
      }
      return result
    }

    private func unmapWindow(n Node, x float32, y float32) TransformPoint {
      if n.IsPortal { return Unmap(n, x, y) }
      let point = if let parent = n.Parent { unmapWindow(parent, x, y) }
      else { TransformPoint{Valid: true, X: x, Y: y} }
      return !point.Valid ? point : Unmap(n, point.X, point.Y)
    }

    private func mapWindow(n Node, x float32, y float32) TransformPoint {
      let point = Map(n, x, y)
      if !point.Valid || n.IsPortal { return point }
      return if let parent = n.Parent { mapWindow(parent, point.X, point.Y) } else { point }
    }

    internal func WindowToNode(n Node, x float32, y float32) TransformPoint {
      let offset = InheritedScrollOffset(n)
      return offset.X == 0.0F && offset.Y == 0.0F
        ? unmapWindow(n, x, y) : unmapWindow(n, x + offset.X, y + offset.Y)
    }

    internal func NodeToWindow(n Node, x float32, y float32) TransformPoint {
      var point = mapWindow(n, x, y)
      if !point.Valid { return point }
      let offset = InheritedScrollOffset(n)
      if offset.X != 0.0F { point.X -= offset.X }
      if offset.Y != 0.0F { point.Y -= offset.Y }
      return point
    }

    internal func BoundsToWindow(n Node) TransformBounds -> BoundsToWindow(n, n.Rect.X, n.Rect.Y, n.Rect.W, n.Rect.H)

    internal func BoundsToWindow(n Node, x float32, y float32, width float32,
      height float32) TransformBounds{
        let p0 = mapWindow(n, x, y)
        let p1 = mapWindow(n, x + width, y)
        let p2 = mapWindow(n, x, y + height)
        let p3 = mapWindow(n, x + width, y + height)
        if !p0.Valid || !p1.Valid || !p2.Valid || !p3.Valid {
          return TransformBounds{ X: x, Y: y, W: width, H: height }
        }
        let left = min4(p0.X, p1.X, p2.X, p3.X)
        let top = min4(p0.Y, p1.Y, p2.Y, p3.Y)
        let right = max4(p0.X, p1.X, p2.X, p3.X)
        let bottom = max4(p0.Y, p1.Y, p2.Y, p3.Y)
        var result = TransformBounds{ X: left, Y: top, W: right - left, H: bottom - top }
        let offset = InheritedScrollOffset(n)
        if offset.X != 0.0F { result.X -= offset.X }
        if offset.Y != 0.0F { result.Y -= offset.Y }
        return result
      }

    internal func BoundsToNode(n Node, target Node, windowX float32 = 0.0F,
      windowY float32 = 0.0F) TransformBounds {
      if n.Parent == target && !n.IsPortal && !n.HasVisualTransform
        && windowX == 0.0F && windowY == 0.0F {
          let offset = ScrollbarParts.ActiveChildren(target).Contains(n)
            ? TransformPoint{Valid: true}
            : ContentPoint(target, 0.0F, 0.0F, target.Kind == NodeKind.Editor && n.EditorSlotBlock)
          return TransformBounds{X: n.Rect.X - offset.X, Y: n.Rect.Y - offset.Y,
            W: n.Rect.W, H: n.Rect.H}
        }
      var p0 = NodeToWindow(n, n.Rect.X, n.Rect.Y)
      var p1 = NodeToWindow(n, n.Rect.X + n.Rect.W, n.Rect.Y)
      var p2 = NodeToWindow(n, n.Rect.X, n.Rect.Y + n.Rect.H)
      var p3 = NodeToWindow(n, n.Rect.X + n.Rect.W, n.Rect.Y + n.Rect.H)
      if p0.Valid && p1.Valid && p2.Valid && p3.Valid {
        p0 = WindowToNode(target, p0.X + windowX, p0.Y + windowY)
        p1 = WindowToNode(target, p1.X + windowX, p1.Y + windowY)
        p2 = WindowToNode(target, p2.X + windowX, p2.Y + windowY)
        p3 = WindowToNode(target, p3.X + windowX, p3.Y + windowY)
        if p0.Valid && p1.Valid && p2.Valid && p3.Valid {
          let left = min4(p0.X, p1.X, p2.X, p3.X)
          let top = min4(p0.Y, p1.Y, p2.Y, p3.Y)
          let right = max4(p0.X, p1.X, p2.X, p3.X)
          let bottom = max4(p0.Y, p1.Y, p2.Y, p3.Y)
          return TransformBounds{X: left, Y: top, W: right - left, H: bottom - top}
        }
      }
      return TransformBounds{X: n.Rect.X, Y: n.Rect.Y, W: n.Rect.W, H: n.Rect.H}
    }

    private func finite(value float32) bool -> !Single.IsNaN(value) && !Single.IsInfinity(value)

    private func resolve(value Length, basis float32) float32 -> value.Unit == LengthUnit.Percent ? basis * value.Value / 100.0F : value.Value

    internal func min4(a float32, b float32, c float32, d float32) float32 {
      var result = a < b ? a : b
      if c < result { result = c }
      if d < result { result = d }
      return result
    }

    internal func max4(a float32, b float32, c float32, d float32) float32 {
      var result = a > b ? a : b
      if c > result { result = c }
      if d > result { result = d }
      return result
    }

    internal func VisibleBoundsToWindow(n Node, border ElementRect,
      width float64, height float64) ElementRect? {
      var left = Math.Max(0.0, border.X)
      var top = Math.Max(0.0, border.Y)
      var right = Math.Min(width, border.X + border.Width)
      var bottom = Math.Min(height, border.Y + border.Height)
      if right <= left || bottom <= top { return nil }
      var current Node? = n
      var child Node? = nil
      while let ancestor = current {
        if !ancestor.HasClipPath && (child == nil || ancestor.OverflowX == Overflow.Visible
          && ancestor.OverflowY == Overflow.Visible && ancestor.Kind != NodeKind.Editor
          && verticalScrollbarGutter(ancestor) == 0.0F && horizontalScrollbarGutter(ancestor) == 0.0F) {
            if ancestor.IsPortal { break }
            child = ancestor
            current = ancestor.Parent
            continue
          }
        let first = WindowToNode(ancestor, float32(left), float32(top))
        let second = WindowToNode(ancestor, float32(right), float32(top))
        let third = WindowToNode(ancestor, float32(left), float32(bottom))
        let fourth = WindowToNode(ancestor, float32(right), float32(bottom))
        if !first.Valid || !second.Valid || !third.Valid || !fourth.Valid { return nil }
        var x = min4(first.X, second.X, third.X, fourth.X)
        var y = min4(first.Y, second.Y, third.Y, fourth.Y)
        var endX = max4(first.X, second.X, third.X, fourth.X)
        var endY = max4(first.Y, second.Y, third.Y, fourth.Y)
        if let descendant = child {
          if ancestor.OverflowX != Overflow.Visible {
            x = MathF.Max(x, ancestor.Rect.X)
            endX = MathF.Min(endX, ancestor.Rect.X + ancestor.Rect.W)
          }
          if ancestor.OverflowY != Overflow.Visible {
            y = MathF.Max(y, ancestor.Rect.Y)
            endY = MathF.Min(endY, ancestor.Rect.Y + ancestor.Rect.H)
          }
          if !ScrollbarParts.ActiveChildren(ancestor).Contains(descendant) {
            if ancestor.Kind == NodeKind.Editor || verticalScrollbarGutter(ancestor) > 0.0F {
              endX = MathF.Min(endX, BoxGeometry.ContentLeft(ancestor) + scrollViewportWidth(ancestor))
            }
            if ancestor.Kind == NodeKind.Editor || horizontalScrollbarGutter(ancestor) > 0.0F {
              endY = MathF.Min(endY, BoxGeometry.ContentTop(ancestor) + scrollViewportHeight(ancestor))
            }
            if ancestor.Kind == NodeKind.Editor {
              x = MathF.Max(x, BoxGeometry.ContentLeft(ancestor))
              y = MathF.Max(y, BoxGeometry.ContentTop(ancestor))
            }
          }
        }
        if let clip = ClipPaths.Get(ancestor) {
          let mapping = PathGeometry.Map(clip.Path, clip.Fit,
            ancestor.Rect.X, ancestor.Rect.Y, ancestor.Rect.W, ancestor.Rect.H)
          let geometry = PathGeometry.For(clip.Path)
          if !mapping.Valid || !geometry.HasFillContour { return nil }
          x = MathF.Max(x, MathF.Max(ancestor.Rect.X, geometry.MinX * mapping.ScaleX + mapping.TranslateX))
          y = MathF.Max(y, MathF.Max(ancestor.Rect.Y, geometry.MinY * mapping.ScaleY + mapping.TranslateY))
          endX = MathF.Min(endX, MathF.Min(ancestor.Rect.X + ancestor.Rect.W,
            geometry.MaxX * mapping.ScaleX + mapping.TranslateX))
          endY = MathF.Min(endY, MathF.Min(ancestor.Rect.Y + ancestor.Rect.H,
            geometry.MaxY * mapping.ScaleY + mapping.TranslateY))
        }
        if endX <= x || endY <= y { return nil }
        let mapped = BoundsToWindow(ancestor, x, y, endX - x, endY - y)
        left = Math.Max(left, float64(mapped.X))
        top = Math.Max(top, float64(mapped.Y))
        right = Math.Min(right, float64(mapped.X + mapped.W))
        bottom = Math.Min(bottom, float64(mapped.Y + mapped.H))
        if right <= left || bottom <= top { return nil }
        if ancestor.IsPortal { break }
        child = ancestor
        current = ancestor.Parent
      }
      return ElementRect{ X: left, Y: top, Width: right - left, Height: bottom - top }
    }
  }
}
