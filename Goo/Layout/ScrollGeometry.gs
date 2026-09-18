package Goo

import System
import System.Runtime.CompilerServices

internal class ScrollbarVisibilityValue {
  internal var Value ScrollbarVisibility
}

internal class ScrollbarVisibilities {
  shared {
    private let values ConditionalWeakTable[Node, ScrollbarVisibilityValue] =
    ConditionalWeakTable[Node, ScrollbarVisibilityValue]()

    internal func Get(n Node) ScrollbarVisibility -> values.TryGetValue(n, out var current)
    ? current.Value : ScrollbarVisibility.Auto

    internal func Set(n Node, value ScrollbarVisibility) {
      if value == ScrollbarVisibility.Auto {
        values.Remove(n)
        return
      }
      values.GetOrCreateValue(n).Value = value
    }
  }
}

internal struct ScrollThumbGeometry {
  internal var Bounds Rect
  internal var TrackStart float32
  internal var TrackLength float32
  internal var ThumbLength float32
  internal var Maximum float32
  internal var Vertical bool
}

internal func scrollRange(n Node) Point -> Point {
  X: float64(maxScrollX(n)),
  Y: float64(maxScrollY(n)),
}

internal func verticalScrollThumb(n Node, out geometry ScrollThumbGeometry) bool {
  geometry = ScrollThumbGeometry{}
  let maximum = maxScrollY(n)
  let viewport = n.Rect.H
  if maximum <= 0.0F || viewport <= 0.0F || n.ContentH <= 0.0F { return false }
  let track = viewport - 4.0F
  if track <= 0.0F { return false }
  var thumb = track * viewport / n.ContentH
  if thumb < 24.0F { thumb = 24.0F }
  if thumb > track { thumb = track }
  let travel = track - thumb
  let offset = maximum > 0.0F ? n.ScrollY / maximum : 0.0F
  let width = n.Rect.W < 4.0F ? n.Rect.W : 4.0F
  let cross = n.Rect.W > 6.0F ? n.Rect.W - 6.0F : 0.0F
  geometry = ScrollThumbGeometry{
    Bounds: Rect{
      X: n.Rect.X + cross,
      Y: n.Rect.Y + 2.0F + travel * offset,
      W: width,
      H: thumb,
    },
    TrackStart: n.Rect.Y + 2.0F,
    TrackLength: track,
    ThumbLength: thumb,
    Maximum: maximum,
    Vertical: true,
  }
  return true
}

internal func horizontalScrollThumb(n Node, out geometry ScrollThumbGeometry) bool {
  geometry = ScrollThumbGeometry{}
  let maximum = maxScrollX(n)
  let viewport = n.Rect.W
  if maximum <= 0.0F || viewport <= 0.0F || n.ContentW <= 0.0F { return false }
  let track = viewport - 4.0F
  if track <= 0.0F { return false }
  var thumb = track * viewport / n.ContentW
  if thumb < 24.0F { thumb = 24.0F }
  if thumb > track { thumb = track }
  let travel = track - thumb
  let offset = maximum > 0.0F ? n.ScrollX / maximum : 0.0F
  let height = n.Rect.H < 4.0F ? n.Rect.H : 4.0F
  let cross = n.Rect.H > 6.0F ? n.Rect.H - 6.0F : 0.0F
  geometry = ScrollThumbGeometry{
    Bounds: Rect{
      X: n.Rect.X + 2.0F + travel * offset,
      Y: n.Rect.Y + cross,
      W: thumb,
      H: height,
    },
    TrackStart: n.Rect.X + 2.0F,
    TrackLength: track,
    ThumbLength: thumb,
    Maximum: maximum,
  }
  return true
}

internal func scrollbarAlpha(n Node) float32 -> switch n.ScrollbarVisibility {
  case ScrollbarVisibility.Always: 1.0F
  case ScrollbarVisibility.Hidden: 0.0F
  case _: clampScrollbarAlpha(n.ScrollBarAlpha)
}

internal func scrollThumbContains(n Node, geometry ScrollThumbGeometry,
  x float32, y float32) bool{
    let bounds = geometry.Bounds
    if geometry.Vertical {
      let left = MathF.Max(n.Rect.X, bounds.X - 4.0F)
      let right = MathF.Min(n.Rect.X + n.Rect.W, bounds.X + bounds.W + 2.0F)
      return x >= left && x < right && y >= bounds.Y && y < bounds.Y + bounds.H
    }
    let top = MathF.Max(n.Rect.Y, bounds.Y - 4.0F)
    let bottom = MathF.Min(n.Rect.Y + n.Rect.H, bounds.Y + bounds.H + 2.0F)
    return x >= bounds.X && x < bounds.X + bounds.W && y >= top && y < bottom
  }

internal func scrollOffsetFromThumb(geometry ScrollThumbGeometry, pointer float32,
  grabOffset float32) float32{
    let travel = geometry.TrackLength - geometry.ThumbLength
    if travel <= 0.0F || geometry.Maximum <= 0.0F { return 0.0F }
    let position = clampOffset(pointer - grabOffset - geometry.TrackStart, travel)
    return position / travel * geometry.Maximum
  }

private func clampScrollbarAlpha(value float32) float32 {
  if value <= 0.0F { return 0.0F }
  return if value >= 1.0F { 1.0F } else { value }
}
