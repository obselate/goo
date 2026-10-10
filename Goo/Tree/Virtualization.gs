package Goo

import System
import System.Collections.Generic
import System.Runtime.CompilerServices

internal sealed class VirtualRetainedBlob : Blob {
  internal init(key string) {
    SetVirtualKey(key)
  }

  internal override func coreBlob() {
  }
}

internal data struct VirtualPlacement {
  internal var Index int32
  internal var X float32
  internal var Y float32
  internal var W float32
  internal var H float32
  internal var HasW bool
  internal var HasH bool
  internal var Item bool
}

internal data struct VirtualExtent {
  internal var Width float32
  internal var Height float32
}

internal data struct VirtualEntry {
  internal var Marker VirtualRetainedBlob
  internal var Placement VirtualPlacement
}

internal sealed class VirtualNodeState {
  private var current VirtualState?
  private var pending VirtualState?
  private var mounted Dictionary[string, VirtualEntry] = Dictionary[string, VirtualEntry](StringComparer.Ordinal)
  private var next Dictionary[string, VirtualEntry] = Dictionary[string, VirtualEntry](StringComparer.Ordinal)
  private let children List[Blob] = List[Blob]()
  private let viewport VirtualViewport = VirtualViewport()
  private let output VirtualOutput = VirtualOutput()
  private var originX float32
  private var originY float32
  private var listItems bool
  private var extent VirtualExtent
  private var count int32
  private var pendingExtent VirtualExtent
  private var pendingCount int32
  private var pendingOwner Node?
  private var pendingScroll bool
  private var pendingScrollX float32
  private var pendingScrollY float32
  private var pendingTargetX float32
  private var pendingTargetY float32

  internal func Prepare(n Node, source VirtualSource, items bool) IList[Blob] {
    Cancel()
    var state VirtualState?
    try {
      state = source.State(current)
    } catch (error Exception) {
      current?.Cancel()
      throw error
    }
    guard let selected = state else { throw InvalidOperationException("VirtualSource.State returned nil") }
    return realize(n, selected, items)
  }

  internal func NeedsRefresh(n Node) bool {
    guard let state = current else { return false }
    let previous = viewport.Bind(n)
    try {
      return state.NeedsRealize(viewport)
    } finally {
      viewport.Bind(previous)
    }
  }

  internal func PrepareRefresh(n Node) IList[Blob] {
    guard let state = current else { throw InvalidOperationException("Virtual state is unavailable") }
    Cancel()
    return realize(n, state, AccessibilityMetadata.Value(n)?.Role == AccessibilityRole.List)
  }

  internal func OffsetForKey(n Node, key string) Point? {
    guard let state = current else { return nil }
    let previous = viewport.Bind(n)
    try {
      guard let offset = state.OffsetOf(viewport, key) else { return nil }
      if !Double.IsFinite(offset.X) || !Double.IsFinite(offset.Y) { throw InvalidOperationException("Virtual item offset must be finite") }
      return Point{ X: Math.Max(0.0, offset.X), Y: Math.Max(0.0, offset.Y) }
    } finally {
      viewport.Bind(previous)
    }
  }

  internal func Extent() VirtualExtent ? -> if current == nil { nil } else { extent }
  internal func ItemCount() int32 ? -> if current == nil { nil } else { count }

  internal func Position(key string) int32? {
    if mounted.TryGetValue(key, out var entry) && !entry.Placement.Item { return entry.Placement.Index }
    return nil
  }

  private func realize(n Node, state VirtualState, items bool) IList[Blob] {
    pending = state
    originX = BoxGeometry.ContentLeft(n) - n.Rect.X
    originY = BoxGeometry.ContentTop(n) - n.Rect.Y
    listItems = items
    let previous = viewport.Bind(n)
    output.Bind(this)
    try {
      state.Realize(viewport, output)
      let size = output.ContentSize
      if !validExtent(size.Width) || !validExtent(size.Height) {
        throw InvalidOperationException("Virtual content size must be finite and nonnegative")
      }
      pendingExtent = VirtualExtent{ Width: float32(size.Width), Height: float32(size.Height) }
      pendingCount = output.ItemCount
      pendingOwner = n
      pendingScroll = false
      if let scroll = output.ScrollOffset {
        if !Double.IsFinite(scroll.X) || !Double.IsFinite(scroll.Y) { throw InvalidOperationException("Virtual scroll offset must be finite") }
        let x = Math.Max(0.0, scroll.X)
        let y = Math.Max(0.0, scroll.Y)
        pendingScroll = true
        pendingScrollX = float32(x)
        pendingScrollY = float32(y)
        pendingTargetX = float32(Math.Max(0.0, float64(n.ScrollTargetX) + x - float64(n.ScrollX)))
        pendingTargetY = if n.PinToBottom && !n.UserScrolled { float32(y) }
        else { float32(Math.Max(0.0, float64(n.ScrollTargetY) + y - float64(n.ScrollY))) }
      }
      return children
    } catch (error Exception) {
      Cancel()
      throw error
    } finally {
      output.Bind(nil)
      viewport.Bind(previous)
    }
  }

  internal func Add(item VirtualItem) {
    let key = item.Key
    if String.IsNullOrEmpty(key) { throw InvalidOperationException("Virtual item keys must be nonempty") }
    if next.ContainsKey(key) { throw InvalidOperationException("Virtual item keys must be unique") }
    if !Double.IsFinite(item.X) || !Double.IsFinite(item.Y) { throw InvalidOperationException("Virtual item position must be finite") }
    var placement = VirtualPlacement{
      Index: item.Index,
      X: float32(float64(originX) + item.X),
      Y: float32(float64(originY) + item.Y),
      Item: listItems,
    }
    if let width = item.Width {
      if !validExtent(width) { throw InvalidOperationException("Virtual item size must be finite and nonnegative") }
      placement.W = float32(width)
      placement.HasW = true
    }
    if let height = item.Height {
      if !validExtent(height) { throw InvalidOperationException("Virtual item size must be finite and nonnegative") }
      placement.H = float32(height)
      placement.HasH = true
    }
    var marker VirtualRetainedBlob
    var same = false
    if mounted.TryGetValue(key, out var previous) {
      marker = previous.Marker
      same = sameVirtualPlacement(previous.Placement, placement)
    } else {
      if item.Content == nil { throw InvalidOperationException("Virtual item without content is not mounted") }
      marker = VirtualRetainedBlob(key)
    }
    next.Add(key, VirtualEntry{ Marker: marker, Placement: placement })
    if let content = item.Content {
      children.Add(virtualWrapper(key, virtualItem(content, key), placement))
    } else if same {
      children.Add(marker)
    } else {
      children.Add(virtualWrapper(key, marker, placement))
    }
  }

  internal func Commit() {
    guard let state = pending, let owner = pendingOwner else {
      throw InvalidOperationException("Virtual state was not prepared")
    }
    state.Commit()
    let old = mounted
    mounted = next
    next = old
    next.Clear()
    children.Clear()
    extent = pendingExtent
    count = pendingCount
    if pendingScroll {
      owner.ScrollX = pendingScrollX
      owner.ScrollY = pendingScrollY
      owner.ScrollTargetX = pendingTargetX
      owner.ScrollTargetY = pendingTargetY
    }
    if let previous = current {
      if previous != state { previous.Dispose() }
    }
    current = state
    pending = nil
    pendingOwner = nil
  }

  internal func Cancel() {
    next.Clear()
    children.Clear()
    pendingOwner = nil
    guard let state = pending else { return }
    pending = nil
    state.Cancel()
    if state != current { state.Dispose() }
  }

  internal func Dispose() {
    Cancel()
    mounted.Clear()
    if let state = current {
      current = nil
      state.Dispose()
    }
  }
}

internal func validExtent(value float64) bool -> Double.IsFinite(value) && value >= 0.0 && value <= float64(Single.MaxValue)

internal func virtualWrapper(key string, child Blob, placement VirtualPlacement) Blob {
  let width Length = if placement.HasW { float64(placement.W) } else { Length.Auto }
  let height Length = if placement.HasH { float64(placement.H) } else { Length.Auto }
  let accessibility Accessibility? = if placement.Item { Accessibility{ Role: AccessibilityRole.ListItem, PositionInSet: placement.Index } } else { nil }
  return Container() {.Accessibility: accessibility,.Key: key,.Position: PositionType.Absolute,.Left: float64(placement.X),.Top: float64(placement.Y),.Width: width,.Height: height,.FlexShrink: 0.0,
    child,
  }
}

internal func virtualGap(specific Length, fallback Length, basis float32) float32 {
  if specific.HasMagnitude { return virtualLength(specific, basis) }
  return if fallback.HasMagnitude { virtualLength(fallback, basis) } else { 0.0F }
}

internal func virtualLength(value Length, basis float32) float32 ->
value.IsPercent ? basis * float32(value.Magnitude) / 100.0F : float32(value.Magnitude)

internal func sameVirtualPlacement(left VirtualPlacement, right VirtualPlacement) bool ->
left.Index == right.Index && left.X == right.X && left.Y == right.Y
  && left.W == right.W && left.H == right.H && left.HasW == right.HasW && left.HasH == right.HasH
  && left.Item == right.Item

internal func virtualItem(item Blob, key string) Blob {
  if let authored = item.Key {
    if authored != key {
      throw InvalidOperationException("Virtual item content has a key that differs from the item key")
    }
  } else {
    item.SetVirtualKey(key)
  }
  return item
}

internal class Virtualization {
  shared {
    private let values ConditionalWeakTable[Node, VirtualNodeState] =
    ConditionalWeakTable[Node, VirtualNodeState]()

    internal func State(n Node) VirtualNodeState? -> if values.TryGetValue(n, out var state) { state } else { nil }

    internal func Configure(n Node) VirtualNodeState {
      if let state = State(n) { return state }
      let created = VirtualNodeState()
      values.Add(n, created)
      return created
    }

    internal func Refresh(n Node, rec Reconciler) bool {
      guard let state = State(n) else { return false }
      if !state.NeedsRefresh(n) { return false }
      try {
        let children = state.PrepareRefresh(n)
        rec.diffChildren(n, children)
        state.Commit()
        rec.MarkEffects(ReconcileEffects.Layout | ReconcileEffects.Paint)
        return true
      } catch (error Exception) {
        state.Cancel()
        throw error
      }
    }

    internal func ContentExtent(n Node) VirtualExtent ? -> State(n)?.Extent()

    internal func Position(n Node) int32? {
      guard let wrapper = n.Parent, let key = wrapper.Key, let owner = wrapper.Parent else { return nil }
      return State(owner)?.Position(key)
    }

    internal func Dispose(n Node) {
      if let state = State(n) {
        state.Dispose()
        values.Remove(n)
      }
    }
  }
}
