package Goo

import System

internal data struct ScrollbarGutters {
  internal var Vertical float32
  internal var Horizontal float32
}

internal struct ScrollThumbGeometry {
  internal var Bounds Rect
  internal var TrackBounds Rect
  internal var HitBounds Rect
  internal var TrackStart float32
  internal var TrackLength float32
  internal var ThumbLength float32
  internal var Maximum float32
  internal var Vertical bool
}

internal func scrollRange(n Node) Point -> Point{
  X: float64(maxScrollX(n)),
  Y: float64(maxScrollY(n)),
}

internal func scrollViewportWidth(n Node) float32 ->
  MathF.Max(0.0F, BoxGeometry.ContentWidth(n) - verticalScrollbarGutter(n))

internal func scrollViewportHeight(n Node) float32 ->
  MathF.Max(0.0F, BoxGeometry.ContentHeight(n) - horizontalScrollbarGutter(n))

internal func verticalScrollbarGutter(n Node) float32 -> scrollbarGutters(n).Vertical

internal func horizontalScrollbarGutter(n Node) float32 -> scrollbarGutters(n).Horizontal

internal func scrollbarAlpha(n Node, vertical bool) float32 {
  let visibility = if vertical { n.ScrollbarVisibilityY } else { n.ScrollbarVisibilityX }
  let descriptor = if vertical { n.ScrollbarY } else { n.ScrollbarX }
  guard let current = descriptor else { return 0.0F }
  if current.Track == nil && current.Thumb == nil { return 0.0F }
  if visibility == ScrollbarVisibility.Hidden { return 0.0F }
  if vertical {
    if maxScrollY(n) <= 0.0F { return 0.0F }
  } else if maxScrollX(n) <= 0.0F { return 0.0F }
  return switch visibility {
    case ScrollbarVisibility.Always: 1.0F
    case ScrollbarVisibility.Hidden: 0.0F
    case _: clampScrollbarAlpha(ScrollState.Alpha(n, vertical))
  }
}

internal func scrollbarAlpha(n Node) float32 ->
  MathF.Max(scrollbarAlpha(n, true), scrollbarAlpha(n, false))

internal func verticalScrollThumb(n Node, out geometry ScrollThumbGeometry) bool {
  geometry = ScrollThumbGeometry{}
  guard let descriptor = n.ScrollbarY else { return false }
  if descriptor.Track == nil && descriptor.Thumb == nil { return false }
  if n.ScrollbarVisibilityY == ScrollbarVisibility.Hidden { return false }
  let maximum = maxScrollY(n)
  let viewport = scrollViewportHeight(n)
  if maximum <= 0.0F || viewport <= 0.0F || n.ContentH <= 0.0F { return false }
  let horizontalSlot = horizontalScrollbarSlot(n)
  let track = verticalTrackBounds(n, descriptor, horizontalSlot)
  if track.W <= 0.0F || track.H <= 0.0F { return false }
  var thumb = track.H * viewport / n.ContentH
  if thumb < float32(descriptor.MinThumbLength) { thumb = float32(descriptor.MinThumbLength) }
  if thumb > track.H { thumb = track.H }
  let travel = track.H - thumb
  let offset = maximum > 0.0F ? clampOffset(n.ScrollY, maximum) / maximum : 0.0F
  let bounds = Rect{
    X: track.X,
    Y: track.Y + travel * offset,
    W: track.W,
    H: thumb,
  }
  geometry = ScrollThumbGeometry{
    Bounds: bounds,
    TrackBounds: track,
    HitBounds: verticalHitBounds(n, descriptor, track),
    TrackStart: track.Y,
    TrackLength: track.H,
    ThumbLength: thumb,
    Maximum: maximum,
    Vertical: true,
  }
  return true
}

internal func horizontalScrollThumb(n Node, out geometry ScrollThumbGeometry) bool {
  geometry = ScrollThumbGeometry{}
  guard let descriptor = n.ScrollbarX else { return false }
  if descriptor.Track == nil && descriptor.Thumb == nil { return false }
  if n.ScrollbarVisibilityX == ScrollbarVisibility.Hidden { return false }
  let maximum = maxScrollX(n)
  let viewport = scrollViewportWidth(n)
  if maximum <= 0.0F || viewport <= 0.0F || n.ContentW <= 0.0F { return false }
  let verticalSlot = verticalScrollbarSlot(n)
  let track = horizontalTrackBounds(n, descriptor, verticalSlot)
  if track.W <= 0.0F || track.H <= 0.0F { return false }
  var thumb = track.W * viewport / n.ContentW
  if thumb < float32(descriptor.MinThumbLength) { thumb = float32(descriptor.MinThumbLength) }
  if thumb > track.W { thumb = track.W }
  let travel = track.W - thumb
  let offset = maximum > 0.0F ? clampOffset(n.ScrollX, maximum) / maximum : 0.0F
  let bounds = Rect{
    X: track.X + travel * offset,
    Y: track.Y,
    W: thumb,
    H: track.H,
  }
  geometry = ScrollThumbGeometry{
    Bounds: bounds,
    TrackBounds: track,
    HitBounds: horizontalHitBounds(n, descriptor, track),
    TrackStart: track.X,
    TrackLength: track.W,
    ThumbLength: thumb,
    Maximum: maximum,
    Vertical: false,
  }
  return true
}

internal func scrollThumbContains(n Node, geometry ScrollThumbGeometry,
  x float32, y float32) bool -> if geometry.Vertical {
    x >= geometry.HitBounds.X && x <= geometry.HitBounds.X + geometry.HitBounds.W
      && y >= geometry.Bounds.Y && y <= geometry.Bounds.Y + geometry.Bounds.H
  } else {
    x >= geometry.Bounds.X && x <= geometry.Bounds.X + geometry.Bounds.W
      && y >= geometry.HitBounds.Y && y <= geometry.HitBounds.Y + geometry.HitBounds.H
  }

internal func scrollOffsetFromThumb(geometry ScrollThumbGeometry, pointer float32,
  grabOffset float32) float32{
    let travel = geometry.TrackLength - geometry.ThumbLength
    if travel <= 0.0F || geometry.Maximum <= 0.0F { return 0.0F }
    let position = clampOffset(pointer - grabOffset - geometry.TrackStart, travel)
    return position / travel * geometry.Maximum
  }

private func scrollbarGutters(n Node) ScrollbarGutters {
  let width = BoxGeometry.ContentWidth(n)
  let height = BoxGeometry.ContentHeight(n)
  var vertical = 0.0F
  var horizontal = 0.0F
  var pass = 0
  while pass < 3 {
    let nextVertical = reservedVerticalGutter(n, width - vertical, height - horizontal)
    let nextHorizontal = reservedHorizontalGutter(n, width - vertical, height - horizontal)
    if nextVertical == vertical && nextHorizontal == horizontal { break }
    vertical = nextVertical
    horizontal = nextHorizontal
    pass++
  }
  return ScrollbarGutters{ Vertical: vertical, Horizontal: horizontal }
}

private func reservedVerticalSlot(n Node, width float32, height float32) float32 {
  guard let descriptor = n.ScrollbarY else { return 0.0F }
  if !descriptor.ReserveSpace || n.ScrollbarVisibilityY == ScrollbarVisibility.Hidden
    || !scrollAxisOverflowsY(n, height) { return 0.0F }
  return float32(descriptor.Thickness + descriptor.Inset)
}

private func reservedHorizontalSlot(n Node, width float32, height float32) float32 {
  guard let descriptor = n.ScrollbarX else { return 0.0F }
  if !descriptor.ReserveSpace || n.ScrollbarVisibilityX == ScrollbarVisibility.Hidden
    || !scrollAxisOverflowsX(n, width) { return 0.0F }
  return float32(descriptor.Thickness + descriptor.Inset)
}

private func reservedVerticalGutter(n Node, width float32, height float32) float32 ->
  MathF.Max(0.0F, reservedVerticalSlot(n, width, height) - BoxGeometry.PaddingRight(n))

private func reservedHorizontalGutter(n Node, width float32, height float32) float32 ->
  MathF.Max(0.0F, reservedHorizontalSlot(n, width, height) - BoxGeometry.PaddingBottom(n))

private func verticalScrollbarSlot(n Node) float32 {
  let gutters = scrollbarGutters(n)
  return reservedVerticalSlot(n,
    BoxGeometry.ContentWidth(n) - gutters.Vertical,
    BoxGeometry.ContentHeight(n) - gutters.Horizontal)
}

private func horizontalScrollbarSlot(n Node) float32 {
  let gutters = scrollbarGutters(n)
  return reservedHorizontalSlot(n,
    BoxGeometry.ContentWidth(n) - gutters.Vertical,
    BoxGeometry.ContentHeight(n) - gutters.Horizontal)
}

private func scrollAxisOverflowsX(n Node, viewport float32) bool ->
  viewport > 0.0F && n.ContentW > viewport &&
  (n.OverflowX == Overflow.Scroll || n.Kind == NodeKind.Editor)

private func scrollAxisOverflowsY(n Node, viewport float32) bool ->
  viewport > 0.0F && n.ContentH > viewport &&
  (n.OverflowY == Overflow.Scroll || n.Kind == NodeKind.Editor)

private func verticalTrackBounds(n Node, descriptor Scrollbar, horizontalSlot float32) Rect {
  let paddingX = BoxGeometry.PaddingEdgeLeft(n)
  let paddingY = BoxGeometry.PaddingEdgeTop(n)
  let paddingWidth = BoxGeometry.PaddingEdgeWidth(n)
  let paddingHeight = BoxGeometry.PaddingEdgeHeight(n)
  let right = MathF.Max(paddingX,
    paddingX + paddingWidth - float32(descriptor.Inset))
  let left = MathF.Max(paddingX, right - float32(descriptor.Thickness))
  let top = MathF.Min(paddingY + paddingHeight,
    paddingY + float32(descriptor.Inset))
  let bottom = MathF.Max(paddingY,
    paddingY + paddingHeight - float32(descriptor.Inset) - horizontalSlot)
  return Rect{ X: left, Y: top, W: MathF.Max(0.0F, right - left), H: MathF.Max(0.0F, bottom - top) }
}

private func horizontalTrackBounds(n Node, descriptor Scrollbar, verticalSlot float32) Rect {
  let paddingX = BoxGeometry.PaddingEdgeLeft(n)
  let paddingY = BoxGeometry.PaddingEdgeTop(n)
  let paddingWidth = BoxGeometry.PaddingEdgeWidth(n)
  let paddingHeight = BoxGeometry.PaddingEdgeHeight(n)
  let left = MathF.Min(paddingX + paddingWidth,
    paddingX + float32(descriptor.Inset))
  let right = MathF.Max(paddingX,
    paddingX + paddingWidth - float32(descriptor.Inset) - verticalSlot)
  let bottom = MathF.Max(paddingY,
    paddingY + paddingHeight - float32(descriptor.Inset))
  let top = MathF.Max(paddingY, bottom - float32(descriptor.Thickness))
  return Rect{ X: left, Y: top, W: MathF.Max(0.0F, right - left), H: MathF.Max(0.0F, bottom - top) }
}

private func verticalHitBounds(n Node, descriptor Scrollbar, bounds Rect) Rect {
  let thickness = float32(descriptor.HitThickness)
  let center = bounds.X + bounds.W * 0.5F
  let paddingX = BoxGeometry.PaddingEdgeLeft(n)
  let left = MathF.Max(paddingX, center - thickness * 0.5F)
  let right = MathF.Min(paddingX + BoxGeometry.PaddingEdgeWidth(n),
    center + thickness * 0.5F)
  return Rect{ X: left, Y: bounds.Y, W: MathF.Max(0.0F, right - left), H: bounds.H }
}

private func horizontalHitBounds(n Node, descriptor Scrollbar, bounds Rect) Rect {
  let thickness = float32(descriptor.HitThickness)
  let center = bounds.Y + bounds.H * 0.5F
  let paddingY = BoxGeometry.PaddingEdgeTop(n)
  let top = MathF.Max(paddingY, center - thickness * 0.5F)
  let bottom = MathF.Min(paddingY + BoxGeometry.PaddingEdgeHeight(n),
    center + thickness * 0.5F)
  return Rect{ X: bounds.X, Y: top, W: bounds.W, H: MathF.Max(0.0F, bottom - top) }
}

private func clampScrollbarAlpha(value float32) float32 {
  if value <= 0.0F { return 0.0F }
  return if value >= 1.0F { 1.0F } else { value }
}
