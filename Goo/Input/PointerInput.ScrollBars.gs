package Goo

import System.Runtime.CompilerServices

internal class PointerScrollDragState {
  internal var Target Node?
  internal var Vertical bool
  internal var GrabOffset float32
}

internal class PointerScrollDirtyState {
  internal var Dirty bool
}

internal class PointerScrollStates {
  shared {
    private let drags ConditionalWeakTable[PointerContact, PointerScrollDragState] =
    ConditionalWeakTable[PointerContact, PointerScrollDragState]()
    private let dirty ConditionalWeakTable[PointerInput, PointerScrollDirtyState] =
    ConditionalWeakTable[PointerInput, PointerScrollDirtyState]()

    internal func Drag(contact PointerContact) PointerScrollDragState ? -> drags.TryGetValue(contact, out var state) ? state : nil

    internal func Begin(contact PointerContact, target Node, vertical bool,
      grabOffset float32) {
        let state = drags.GetOrCreateValue(contact)
        state.Target = target
        state.Vertical = vertical
        state.GrabOffset = grabOffset
      }

    internal func End(contact PointerContact) {
      drags.Remove(contact)
    }

    internal func MarkDirty(input PointerInput) {
      dirty.GetOrCreateValue(input).Dirty = true
    }

    internal func ConsumeDirty(input PointerInput) bool {
      if !dirty.TryGetValue(input, out var state) || !state.Dirty { return false }
      state.Dirty = false
      return true
    }
  }
}

internal partial class PointerInput {
  internal func ConsumeScrollRectsDirty() bool -> PointerScrollStates.ConsumeDirty(this)

  private func scrollDragState() PointerScrollDragState ? -> PointerScrollStates.Drag(current)

  private func hasScrollDrag() bool -> scrollDragState() != nil

  private func scrollThumbAvailable(n Node) bool {
    if n.ScrollbarVisibility == ScrollbarVisibility.Hidden { return false }
    if n.Kind == NodeKind.Editor { TextEditorLayouts.SyncScroll(n) }
    var geometry ScrollThumbGeometry
    return verticalScrollThumb(n, out geometry)
      || horizontalScrollThumb(n, out geometry)
  }

  private func tryBeginScrollDrag(root Node, resolver Resolver, x float32, y float32) bool {
    scratchChain.Clear()
    try {
      hitChainInto(root, x, y, scratchChain)
      if chainDisabled(scratchChain) { return false }
      for var i = scratchChain.Count; i > 0; i-- {
        let n = scratchChain[i - 1]
        if scrollbarAlpha(n) <= 0.0F { continue }
        if n.Kind == NodeKind.Editor { TextEditorLayouts.SyncScroll(n) }
        let point = TransformGeometry.WindowToNode(n, x, y)
        if !point.Valid { continue }
        var geometry ScrollThumbGeometry
        if verticalScrollThumb(n, out geometry)
          && scrollThumbContains(n, geometry, point.X, point.Y) {
            beginScrollDrag(n, true, point.Y - geometry.Bounds.Y, resolver)
            return true
          }
        if horizontalScrollThumb(n, out geometry)
          && scrollThumbContains(n, geometry, point.X, point.Y) {
            beginScrollDrag(n, false, point.X - geometry.Bounds.X, resolver)
            return true
          }
      }
      return false
    } finally {
      scratchChain.Clear()
    }
  }

  private func beginScrollDrag(n Node, vertical bool, grabOffset float32,
    resolver Resolver) {
      clearPressChain(resolver)
      current.ClickTarget = nil
      current.DragEntry = nil
      current.DragEditor = nil
      current.DragEditorStarted = false
      PointerScrollStates.Begin(current, n, vertical, grabOffset)
      n.ScrollIdle = 0.0F
      n.ScrollBarAlpha = 1.0F
    }

  private func updateScrollDrag(root Node?, x float32, y float32) bool {
    guard let tree = root else {
      clearScrollDrag()
      return false
    }
    guard let state = scrollDragState() else {
      clearScrollDrag()
      return false
    }
    guard let n = state.Target else {
      clearScrollDrag()
      return false
    }
    if n.Retired || !containsPath(tree, n) || !scrollThumbAvailable(n) {
      clearScrollDrag()
      return false
    }
    let point = TransformGeometry.WindowToNode(n, x, y)
    if !point.Valid {
      clearScrollDrag()
      return false
    }
    var geometry ScrollThumbGeometry
    let available = if state.Vertical {
      verticalScrollThumb(n, out geometry)
    } else {
      horizontalScrollThumb(n, out geometry)
    }
    if !available {
      clearScrollDrag()
      return false
    }
    let pointer = state.Vertical ? point.Y : point.X
    let offset = scrollOffsetFromThumb(geometry, pointer, state.GrabOffset)
    let nextX = state.Vertical ? n.ScrollX : offset
    let nextY = state.Vertical ? offset : n.ScrollY
    let changed = setImmediateScroll(n, nextX, nextY)
    if changed { PointerScrollStates.MarkDirty(this) }
    return true
  }

  private func clearScrollDrag() {
    PointerScrollStates.End(current)
  }
}
