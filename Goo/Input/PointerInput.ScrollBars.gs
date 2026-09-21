package Goo

import System.Runtime.CompilerServices

internal class PointerScrollDragState {
  internal var Target Node?
  internal var Vertical bool
  internal var GrabOffset float32
}

internal class PointerScrollHoverState {
  internal var Horizontal Node?
  internal var Vertical Node?
}

internal class PointerScrollbarPressState {
  internal var Target Node?
  internal var Vertical bool
  internal var Thumb bool
}

internal class PointerScrollDirtyState {
  internal var Dirty bool
}

internal class PointerScrollStates {
  shared {
    private let drags ConditionalWeakTable[PointerContact, PointerScrollDragState] =
    ConditionalWeakTable[PointerContact, PointerScrollDragState]()
    private let hovers ConditionalWeakTable[PointerInput, PointerScrollHoverState] =
    ConditionalWeakTable[PointerInput, PointerScrollHoverState]()
    private let presses ConditionalWeakTable[PointerContact, PointerScrollbarPressState] =
    ConditionalWeakTable[PointerContact, PointerScrollbarPressState]()
    private let dirty ConditionalWeakTable[PointerInput, PointerScrollDirtyState] =
    ConditionalWeakTable[PointerInput, PointerScrollDirtyState]()

    internal func Drag(contact PointerContact) PointerScrollDragState ? -> drags.TryGetValue(contact, out var state) ? state : nil

    internal func Hover(input PointerInput) PointerScrollHoverState ->
    hovers.GetOrCreateValue(input)

    internal func Press(contact PointerContact) PointerScrollbarPressState? ->
    presses.TryGetValue(contact, out var state) ? state : nil

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

    internal func BeginPress(contact PointerContact, target Node, vertical bool, thumb bool) {
      let state = presses.GetOrCreateValue(contact)
      state.Target = target
      state.Vertical = vertical
      state.Thumb = thumb
    }

    internal func EndPress(contact PointerContact) {
      presses.Remove(contact)
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

  internal func ResetScrollbars(resolver Resolver) {
    clearScrollDrag()
    clearScrollbarPartPress(resolver)
    clearScrollHover(true, resolver)
  }

  private func scrollDragState() PointerScrollDragState ? -> PointerScrollStates.Drag(current)

  private func hasScrollDrag() bool -> scrollDragState() != nil

  private func scrollbarPartPressState() PointerScrollbarPressState? ->
  PointerScrollStates.Press(current)

  private func scrollThumbAvailable(n Node, vertical bool) bool {
    guard let descriptor = if vertical { n.ScrollbarY } else { n.ScrollbarX } else {
      return false
    }
    if descriptor.Thumb == nil || n.Retired || !canReceiveInput(n)
      || (vertical ? n.ScrollbarVisibilityY : n.ScrollbarVisibilityX) == ScrollbarVisibility.Hidden {
        return false
      }
    if n.Kind == NodeKind.Editor {
      ScrollState.SyncEditor(n)
    }
    var geometry ScrollThumbGeometry
    return if vertical {
      verticalScrollThumb(n, out geometry)
    } else {
      horizontalScrollThumb(n, out geometry)
    }
  }

  private func tryBeginScrollInteraction(root Node, resolver Resolver,
    x float32, y float32) bool {
      if current.CaptureTarget != nil {
        return false
      }
      scratchChain.Clear()
      try {
        hitChainInto(root, x, y, scratchChain)
        if chainDisabled(scratchChain) { return false }
        for var i = scratchChain.Count; i > 0; i-- {
          let n = scratchChain[i - 1]
          if n.Retired || !canReceiveInput(n) { continue }
          if n.Kind == NodeKind.Editor { ScrollState.SyncEditor(n) }
          let point = TransformGeometry.WindowToNode(n, x, y)
          if !point.Valid { continue }
          if tryBeginScrollAxis(n, true, point.X, point.Y, resolver) {
            return true
          }
          if tryBeginScrollAxis(n, false, point.X, point.Y, resolver) {
            return true
          }
          if n.IsPortal { break }
        }
        return false
      } finally {
        scratchChain.Clear()
      }
    }

  private func tryBeginScrollAxis(n Node, vertical bool, x float32, y float32,
    resolver Resolver) bool {
      let descriptor = if vertical { n.ScrollbarY } else { n.ScrollbarX }
      guard let value = descriptor else { return false }
      let visibility = if vertical { n.ScrollbarVisibilityY } else { n.ScrollbarVisibilityX }
      if visibility == ScrollbarVisibility.Hidden
        || (value.Track == nil && value.Thumb == nil) {
          return false
        }
      var geometry ScrollThumbGeometry
      let available = if vertical {
        verticalScrollThumb(n, out geometry)
      } else {
        horizontalScrollThumb(n, out geometry)
      }
      if !available || !geometry.HitBounds.Contains(x, y) {
        return false
      }
      if ScrollState.Hover(n, vertical, true) {
        PointerScrollStates.MarkDirty(this)
      }
      if value.Thumb != nil && scrollThumbContains(n, geometry, x, y) {
        let grabOffset = vertical ? y - geometry.Bounds.Y : x - geometry.Bounds.X
        beginScrollDrag(n, vertical, grabOffset, resolver)
        return true
      }
      if value.Track != nil {
        let pointer = vertical ? y : x
        let thumb = vertical ? geometry.Bounds.Y : geometry.Bounds.X
        return beginScrollPage(n, vertical, pointer, pointer < thumb, resolver)
      }
      return false

    }

  private func beginScrollDrag(n Node, vertical bool, grabOffset float32,
    resolver Resolver) {
      clearScrollbarPress(resolver)
      current.ClickTarget = nil
      PointerScrollStates.Begin(current, n, vertical, grabOffset)
      PointerScrollStates.BeginPress(current, n, vertical, true)
      ScrollbarParts.SetPartPressed(n, vertical, true, true, resolver)
      ScrollState.Capture(n, vertical, true)
      PointerScrollStates.MarkDirty(this)
    }

  private func beginScrollPage(n Node, vertical bool,
    pointer float32, before bool, resolver Resolver) bool {
      let page = vertical ? scrollViewportHeight(n) : scrollViewportWidth(n)
      if page <= 0.0F {
        return false
      }
      let currentOffset = vertical ? n.ScrollY : n.ScrollX
      let target = before ? currentOffset - page : currentOffset + page
      if vertical {
        ScrollState.To(n, n.ScrollX, target, false)
      } else {
        ScrollState.To(n, target, n.ScrollY, false)
      }
      clearScrollbarPress(resolver)
      PointerScrollStates.BeginPress(current, n, vertical, false)
      ScrollbarParts.SetPartPressed(n, vertical, false, true, resolver)
      current.ClickTarget = nil
      PointerScrollStates.MarkDirty(this)
      return true
    }

  private func clearScrollbarPress(resolver Resolver) {
    clearPressChain(resolver)
    current.DragEntry = nil
    current.DragEditor = nil
    current.DragSelectionStarted = false
    clearDragCandidate()
  }

  private func clearScrollbarPartPress(resolver Resolver) {
    if let state = scrollbarPartPressState() {
      if let target = state.Target {
        ScrollbarParts.SetPartPressed(target, state.Vertical, state.Thumb, false, resolver)
      }
      PointerScrollStates.EndPress(current)
    }
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
    if n.Retired || !containsPath(tree, n) || !scrollThumbAvailable(n, state.Vertical) {
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
    let changed = ScrollState.To(n, nextX, nextY, true)
    if changed { PointerScrollStates.MarkDirty(this) }
    return true
  }

  private func clearScrollDrag() {
    if let state = scrollDragState() {
      if let target = state.Target {
        ScrollState.Capture(target, state.Vertical, false)
      }
      PointerScrollStates.End(current)
      PointerScrollStates.MarkDirty(this)
    }
  }

  private func clearScrollHover(reset bool, resolver Resolver) {
    let state = PointerScrollStates.Hover(this)
    var changed bool
    if let node = state.Horizontal {
      if reset {
        ScrollState.ResetActivity(node)
        changed = true
      } else {
        changed = ScrollState.Hover(node, false, false) || changed
      }
      ScrollbarParts.SetTrackHovered(node, false, false, resolver)
    }
    if let node = state.Vertical {
      if reset {
        ScrollState.ResetActivity(node)
        changed = true
      } else {
        changed = ScrollState.Hover(node, true, false) || changed
      }
      ScrollbarParts.SetTrackHovered(node, true, false, resolver)
    }
    state.Horizontal = nil
    state.Vertical = nil
    if changed {
      PointerScrollStates.MarkDirty(this)
    }
  }

  private func updateScrollHover(root Node?, x float32, y float32, resolver Resolver) bool {
    let state = PointerScrollStates.Hover(this)
    var horizontal Node?
    var vertical Node?
    scratchChain.Clear()
    if let tree = root {
      hitChainInto(tree, x, y, scratchChain)
      if !chainDisabled(scratchChain) {
        for var i = scratchChain.Count; i > 0; i-- {
          let n = scratchChain[i - 1]
          if n.Retired || !canReceiveInput(n) { continue }
          if n.Kind == NodeKind.Editor { ScrollState.SyncEditor(n) }
          let point = TransformGeometry.WindowToNode(n, x, y)
          if !point.Valid { continue }
          if vertical == nil {
            var geometry ScrollThumbGeometry
            if let descriptor = n.ScrollbarY {
              if n.ScrollbarVisibilityY != ScrollbarVisibility.Hidden
                && (descriptor.Track != nil || descriptor.Thumb != nil) {
                if verticalScrollThumb(n, out geometry)
                  && geometry.HitBounds.Contains(point.X, point.Y) {
                    vertical = n
                  }
              }
            }
          }
          if horizontal == nil {
            var geometry ScrollThumbGeometry
            if let descriptor = n.ScrollbarX {
              if n.ScrollbarVisibilityX != ScrollbarVisibility.Hidden
                && (descriptor.Track != nil || descriptor.Thumb != nil) {
                if horizontalScrollThumb(n, out geometry)
                  && geometry.HitBounds.Contains(point.X, point.Y) {
                    horizontal = n
                  }
              }
            }
          }
          if vertical != nil && horizontal != nil { break }
          if n.IsPortal { break }
        }
      }
    }
    scratchChain.Clear()
    var changed bool
    if state.Horizontal != horizontal {
      if let previous = state.Horizontal {
        changed = ScrollState.Hover(previous, false, false) || changed
        ScrollbarParts.SetTrackHovered(previous, false, false, resolver)
      }
      state.Horizontal = horizontal
      if let next = horizontal {
        changed = ScrollState.Hover(next, false, true) || changed
        ScrollbarParts.SetTrackHovered(next, false, true, resolver)
      }
    }
    if state.Vertical != vertical {
      if let previous = state.Vertical {
        changed = ScrollState.Hover(previous, true, false) || changed
        ScrollbarParts.SetTrackHovered(previous, true, false, resolver)
      }
      state.Vertical = vertical
      if let next = vertical {
        changed = ScrollState.Hover(next, true, true) || changed
        ScrollbarParts.SetTrackHovered(next, true, true, resolver)
      }
    }
    if changed {
      PointerScrollStates.MarkDirty(this)
    }
    return changed
  }
}
