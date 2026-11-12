package Goo

import System
import System.Collections.Generic

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
  internal var ComponentType Type?
}

internal data struct VirtualAnchorNode {
  internal var Mount NodeMount
  internal var Y float32
}

internal data struct VirtualRowStorage {
  internal var Root Node
  internal var ComponentType Type
  internal var Nodes int32
  internal var Bytes int32
}

internal sealed class VirtualNodeState {
  private var current VirtualState?
  private var pending VirtualState?
  private var source VirtualSource?
  private var pendingSource VirtualSource?
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
  private var anchorNodes List[VirtualAnchorNode] = List[VirtualAnchorNode]()
  private var pendingAnchorNodes List[VirtualAnchorNode] = List[VirtualAnchorNode]()
  private var anchorKey string?
  private var pendingAnchorKey string?
  private var anchorScrollY float32
  private var scrollKey string?
  private var scrollAlignment ScrollAlignment
  private var scrollAnchor Point?
  private var requestedOffset Point
  private var waitingForKey bool
  private var settleScroll bool = true

  internal var Context ContextFrame?
  internal var Owner Window?
  internal var DeclaringCell Cell?
  internal var CallbackOwner Cell?
  private var contextReader ContextReader?
  private var contextDirty bool
  private var contextVersion int64
  private var pendingContextVersion int64
  private var pixelScale float32 = 1.0F
  private const MaximumRecycledRows int32 = 32
  private const MaximumRecycledBytes int32 = 1048576
  private const NodeStorageChargeBytes int32 = 2048
  private let recycledRows List[VirtualRowStorage] = List[VirtualRowStorage]()
  private let retiringRows List[VirtualRowStorage] = List[VirtualRowStorage]()
  private var recycledNodes int32
  private var recycledBytes int32
  private var retiringNodes int32
  private var retiringBytes int32
  private var recyclingRowsLimit int32
  private var recyclingNodesLimit int32

  internal prop RecycledRowCount int32 { get -> recycledRows.Count }
  internal prop RecycledNodeCount int32 { get -> recycledNodes }
  internal prop RecycledStorageBytes int32 { get -> recycledBytes }

  private func clearRecycledRows() {
    recycledRows.Clear()
    retiringRows.Clear()
    recycledNodes = 0
    recycledBytes = 0
    retiringNodes = 0
    retiringBytes = 0
  }

  private func updateRecyclingLimit(n Node) {
    recyclingRowsLimit = Math.Min(MaximumRecycledRows, n.Children.Count)
    recyclingNodesLimit = countNodes(n, MaximumRecycledBytes / NodeStorageChargeBytes) - 1
    while recycledRows.Count > recyclingRowsLimit || recycledNodes > recyclingNodesLimit {
      removeRecycledRow(recycledRows.Count - 1)
    }
    while retiringRows.Count + recycledRows.Count > recyclingRowsLimit
      || retiringNodes + recycledNodes > recyclingNodesLimit {
      let index = retiringRows.Count - 1
      if index < 0 { break }
      let row = retiringRows[index]
      retiringRows.RemoveAt(index)
      retiringNodes -= row.Nodes
      retiringBytes -= row.Bytes
    }
  }

  private func countNodes(n Node, limit int32) int32 {
    var count = 1
    for i in 0 ... n.Children.Count {
      if count >= limit { break }
      count += countNodes(n.Children[i], limit - count)
    }
    return count
  }

  private func chargeStorage(n Node, ref nodes int32, ref bytes int32) bool {
    if n.Kind == NodeKind.Entry || n.Kind == NodeKind.Editor
      || n.MountGeneration == uint64.MaxValue { return false }
    nodes++
    bytes += NodeStorageChargeBytes
    if bytes > MaximumRecycledBytes { return false }
    let children = n.Children
    if children is List[Node] {
      if children.Capacity > (MaximumRecycledBytes - bytes) / 8 { return false }
      bytes += children.Capacity == 0 ? 0 : 24 + children.Capacity * 8
    }
    if let yoga = n.Yoga {
      let yogaChildren = yoga.GetChildren()
      if yogaChildren is List[Facebook.Yoga.Node] {
        if yogaChildren.Capacity > (MaximumRecycledBytes - bytes) / 8 { return false }
        bytes += yogaChildren.Capacity == 0 ? 0 : 24 + yogaChildren.Capacity * 8
      }
    }
    if bytes > MaximumRecycledBytes { return false }
    for i in 0 ... n.Children.Count {
      if !chargeStorage(n.Children[i], ref nodes, ref bytes) { return false }
    }
    return true
  }

  internal func CaptureRetirement(n Node) VirtualRowStorage? {
    if current == nil || pending != nil && pending != current { return nil }
    guard let owner = Owner, let key = n.Key else { return nil }
    if !mounted.TryGetValue(key, out var entry) { return nil }
    guard let type = entry.ComponentType else { return nil }
    if n.Children.Count != 1 || !owner.CanRecycleVirtualRow(n) { return nil }
    var nodes = 0
    var bytes = 0
    if !chargeStorage(n, ref nodes, ref bytes) { return nil }
    return VirtualRowStorage{Root: n, ComponentType: type, Nodes: nodes, Bytes: bytes}
  }

  internal func Quarantine(row VirtualRowStorage) {
    guard let owner = Owner else { return }
    if row.Nodes > recyclingNodesLimit || row.Bytes > MaximumRecycledBytes { return }
    while recycledRows.Count > 0 && (retiringRows.Count + recycledRows.Count >= recyclingRowsLimit
      || retiringNodes + recycledNodes + row.Nodes > recyclingNodesLimit
      || retiringBytes + recycledBytes + row.Bytes > MaximumRecycledBytes) {
      removeRecycledRow(recycledRows.Count - 1)
    }
    if retiringRows.Count >= recyclingRowsLimit || retiringNodes + row.Nodes > recyclingNodesLimit
      || retiringBytes + row.Bytes > MaximumRecycledBytes { return }
    retiringRows.Add(row)
    retiringNodes += row.Nodes
    retiringBytes += row.Bytes
    owner.QueueVirtualRetirements(this)
  }

  internal func FinishRetirements(owner Window) {
    if Owner != owner { return }
    try {
      while retiringRows.Count > 0 {
        let index = retiringRows.Count - 1
        let row = retiringRows[index]
        retiringRows.RemoveAt(index)
        retiringNodes -= row.Nodes
        retiringBytes -= row.Bytes
        if row.Root.Yoga?.GetOwner() != nil { continue }
        NodeLifecycle.ResetForReuse(row.Root)
        recycledRows.Add(row)
        recycledNodes += row.Nodes
        recycledBytes += row.Bytes
      }
    } catch (_ Exception) {
      clearRecycledRows()
      rethrow
    }
  }

  internal func TakeRecycledRow(type Type) Node? {
    if pending != nil && pending != current { return nil }
    var index = recycledRows.Count
    while index > 0 {
      index--
      let row = recycledRows[index]
      if row.ComponentType != type { continue }
      removeRecycledRow(index)
      return row.Root
    }
    return nil
  }

  private func removeRecycledRow(index int32) {
    let row = recycledRows[index]
    recycledRows.RemoveAt(index)
    recycledNodes -= row.Nodes
    recycledBytes -= row.Bytes
  }

  internal prop ContextVersion int64 { get -> contextVersion }

  internal func BindContext(frame ContextFrame?, owner Window?, callbackOwner Cell?) {
    let changed = Context != frame || Owner != owner || CallbackOwner != callbackOwner
    if changed { clearRecycledRows() }
    let rebound = Owner != nil
    Context = frame
    Owner = owner
    CallbackOwner = callbackOwner
    if let reader = contextReader {
      reader.Frame = frame
      reader.Window = owner
      if changed { reader.Refresh() }
    }
    if changed && rebound { InvalidateContext() }
  }

  internal func EnsureContextReader() ContextReader {
    contextReader ??= ContextReader{Window: Owner, Frame: Context, Virtual: this}
    contextReader!!.Begin()
    return contextReader!!
  }

  internal func InvalidateContext() {
    contextVersion++
    contextDirty = true
    Owner?.ContextVirtualInvalidated()
  }

  internal func RefreshPixelScale() {
    let scale = Owner?.RenderScale.X ?? 1.0F
    if scale == pixelScale { return }
    pixelScale = scale
    InvalidateContext()
  }

  internal func ContextAffected(source ContextFrame, lineageChanged bool) bool {
    var current = Context
    while let frame = current {
      if lineageChanged && frame == source { return true }
      if !lineageChanged && frame.Key == source.Key { return frame == source }
      current = frame.Parent
    }
    return !lineageChanged && Owner?.ContextValue(source.Key) == source
  }

  private func enterContext(stateCallback bool = false) ContextEnvironment ->
    ContextEnvironment.Enter(ContextEnvironment{Window: Owner, Frame: Context,
      Reader: contextReader, Virtual: this, StateCallback: stateCallback})
  internal func Prepare(n Node, source VirtualSource, items bool) IList[Blob] {
    Cancel()
    pendingSource = source
    contextReader?.BeginState()
    let previousContext = enterContext(true)
    try {
      var state VirtualState?
      try { state = source.State(current) }
      catch (_ Exception) {
        clearRecycledRows()
        current?.Cancel()
        contextReader?.Cancel()
        rethrow
      }
      guard let selected = state else { throw InvalidOperationException("${source.GetType().Name}.State returned nil: return a VirtualState instance for this Virtual element.") }
      if selected != current { clearRecycledRows() }
      return realize(n, selected, items)
    } finally { ContextEnvironment.Current = previousContext }
  }

  internal func NeedsRefresh(n Node) bool {
    guard let state = current else { return false }
    let previous = viewport.Bind(n)
    let previousContext = enterContext()
    contextReader?.Begin()
    try {
      let requested = state.NeedsRealize(viewport)
      let settling = needsScroll(n, state)
      let anchoring = Math.Abs(anchorDelta(n)) > 0.01F
      if !requested && !settling && !waitingForKey { scrollKey = nil }
      if !contextDirty && !requested && !settling && !anchoring { contextReader?.Commit(true) }
      return contextDirty || requested || settling || anchoring
    } catch (_ Exception) {
      contextReader?.Cancel()
      rethrow
    } finally {
      viewport.Bind(previous)
      ContextEnvironment.Current = previousContext
    }
  }

  internal func PrepareRefresh(n Node) IList[Blob] {
    guard let state = current else { throw InvalidOperationException("Virtual state is unavailable") }
    if contextDirty {
      if let retained = source {
        return Prepare(n, retained, AccessibilityMetadata.Value(n)?.Role == AccessibilityRole.List)
      }
    }
    Cancel(true)
    return realize(n, state, AccessibilityMetadata.Value(n)?.Role == AccessibilityRole.List)
  }

  internal func OffsetForKey(n Node, key string) Point? {
    guard let state = current else { return nil }
    let previous = viewport.Bind(n)
    let previousContext = enterContext()
    contextReader?.Begin()
    try {
      let offset = state.OffsetOf(viewport, key)
      if let value = offset {
        if !Double.IsFinite(value.X) || !Double.IsFinite(value.Y) {
          throw InvalidOperationException("Virtual item offset must be finite")
        }
      }
      contextReader?.Commit(true)
      return if let value = offset {
        Point{X: Math.Max(0.0, value.X), Y: Math.Max(0.0, value.Y)}
      } else { nil }
    } catch (error Exception) {
      contextReader?.Cancel()
      rethrow
    } finally {
      viewport.Bind(previous)
      ContextEnvironment.Current = previousContext
    }
  }

  internal func ScrollOffsetForKey(n Node, key string, alignment ScrollAlignment, anchor Point? = nil) Point? {
    guard let state = current else { return nil }
    let previous = viewport.Bind(n)
    let previousContext = enterContext()
    contextReader?.Begin()
    try {
      let result = itemOffset(n, state, key, alignment, anchor)
      contextReader?.Commit(true)
      return result
    } catch (error Exception) {
      contextReader?.Cancel()
      rethrow
    } finally {
      viewport.Bind(previous)
      ContextEnvironment.Current = previousContext
    }
  }

  internal func RequestScroll(key string, alignment ScrollAlignment, anchor Point?, offset Point) {
    scrollKey = key
    scrollAlignment = alignment
    scrollAnchor = anchor
    requestedOffset = offset
    waitingForKey = false
    settleScroll = true
  }

  internal func RequestPendingScroll(key string, alignment ScrollAlignment, settle bool, offset Point) {
    RequestScroll(key, alignment, nil, offset)
    waitingForKey = true
    settleScroll = settle
  }

  internal prop IsWaitingForKey bool { get -> waitingForKey && scrollKey != nil }

  internal func CancelScroll() {
    scrollKey = nil
    waitingForKey = false
  }

  internal prop IsScrollSettling bool { get -> scrollKey != nil }

  internal func VisibleAnchor(n Node) VirtualScrollAnchor? {
    let left = BoxGeometry.ContentLeft(n)
    let right = left + BoxGeometry.ViewportWidth(n)
    let top = BoxGeometry.ContentTop(n)
    let bottom = top + BoxGeometry.ViewportHeight(n)
    var first Node?
    var firstBounds TransformBounds
    for i in 0 ... n.Children.Count {
      let child = n.Children[i]
      let bounds = TransformGeometry.BoundsToNode(child, n)
      if bounds.H > 0.0F && bounds.W > 0.0F && bounds.Y < bottom && bounds.Y + bounds.H > top
        && bounds.X < right && bounds.X + bounds.W > left {
        if first == nil || bounds.Y < firstBounds.Y
          || (bounds.Y == firstBounds.Y && bounds.X < firstBounds.X) {
            first = child
            firstBounds = bounds
          }
      }
    }
    guard let child = first, let key = child.Key else { return nil }
    return VirtualScrollAnchor{Key: key, Offset: Point{
      X: float64(firstBounds.X - left),
      Y: float64(firstBounds.Y - top),
    }}
  }

  private func itemOffset(n Node, state VirtualState, key string, alignment ScrollAlignment, anchor Point?) Point? {
    guard let bounds = state.BoundsOf(viewport, key) else { return nil }
    if !Double.IsFinite(bounds.X) || !Double.IsFinite(bounds.Y)
      || !validExtent(bounds.Width) || !validExtent(bounds.Height) {
      throw InvalidOperationException("Virtual item bounds must be finite")
    }
    let fraction = alignment == ScrollAlignment.Center ? 0.5 : alignment == ScrollAlignment.End ? 1.0 : 0.0
    var x = bounds.X - (anchor?.X ?? (viewport.Size.Width - bounds.Width) * fraction)
    var y = bounds.Y - (anchor?.Y ?? (viewport.Size.Height - bounds.Height) * fraction)
    if alignment == ScrollAlignment.Nearest {
      x = nearestOffset(float64(n.ScrollX), bounds.X, bounds.Width, viewport.Size.Width)
      y = nearestOffset(float64(n.ScrollY), bounds.Y, bounds.Height, viewport.Size.Height)
    }
    let size = output.ContentSize
    let width = pending == state ? size.Width : float64(extent.Width)
    let height = pending == state ? size.Height : float64(extent.Height)
    return Point{
      X: Math.Clamp(x, 0.0, Math.Max(0.0, width - viewport.Size.Width)),
      Y: Math.Clamp(y, 0.0, Math.Max(0.0, height - viewport.Size.Height)),
    }
  }

  private func nearestOffset(offset float64, start float64, size float64, viewport float64) float64 {
    let end = start + size - viewport
    if size > viewport { return Math.Clamp(offset, start, end) }
    return Math.Clamp(offset, end, start)
  }

  private func needsScroll(n Node, state VirtualState) bool {
    guard let key = scrollKey else { return false }
    if Math.Abs(float64(n.ScrollX) - requestedOffset.X) > 0.01
      || Math.Abs(float64(n.ScrollY) - requestedOffset.Y) > 0.01 {
      scrollKey = nil
      return false
    }
    guard let target = itemOffset(n, state, key, scrollAlignment, scrollAnchor) else {
      if !waitingForKey { scrollKey = nil }
      return false
    }
    return waitingForKey || Math.Abs(target.X - float64(n.ScrollX)) > 0.01
      || Math.Abs(target.Y - float64(n.ScrollY)) > 0.01
  }

  private func anchorDelta(n Node) float32 {
    if anchorKey == nil || n.ScrollY == 0.0F || Math.Abs(n.ScrollY - anchorScrollY) > 0.01F { return 0.0F }
    for i in 0 ... n.Children.Count {
      let child = n.Children[i]
      if child.Key != anchorKey { continue }
      for j in 0 ... anchorNodes.Count {
        let entry = anchorNodes[j]
        guard let retained = entry.Mount.Current else { continue }
        var parent = retained.Parent
        while let candidate = parent {
          if candidate == child {
            let bounds = TransformGeometry.BoundsToNode(retained, child)
            return bounds.Y - child.Rect.Y - entry.Y
          }
          parent = candidate.Parent
        }
      }
      break
    }
    return 0.0F
  }

  private func captureAnchor(n Node, key string?) {
    pendingAnchorNodes.Clear()
    pendingAnchorKey = key
    if key == nil { return }
    for i in 0 ... n.Children.Count {
      let child = n.Children[i]
      if child.Key == key {
        let top = BoxGeometry.ContentTop(n)
        captureDescendants(child, child, n, top, top + BoxGeometry.ViewportHeight(n))
        break
      }
    }
  }

  private func captureDescendants(n Node, owner Node, viewport Node, top float32, bottom float32) {
    if n.Children.Count == 0 {
      let bounds = TransformGeometry.BoundsToNode(n, viewport)
      if bounds.H > 0.0F && bounds.Y < bottom && bounds.Y + bounds.H > top {
        let local = TransformGeometry.BoundsToNode(n, owner)
        pendingAnchorNodes.Add(VirtualAnchorNode{Mount: NodeMount(n), Y: local.Y - owner.Rect.Y})
      }
      return
    }
    for i in 0 ... n.Children.Count { captureDescendants(n.Children[i], owner, viewport, top, bottom) }
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
    contextReader?.Begin()
    let previousContext = enterContext()
    pendingContextVersion = contextVersion
    output.Bind(this)
    try {
      state.Realize(viewport, output)
      let delta = anchorDelta(n)
      if let key = scrollKey {
        if let target = itemOffset(n, state, key, scrollAlignment, scrollAnchor) {
          output.ScrollOffset = target
          waitingForKey = false
          if !settleScroll { scrollKey = nil }
        } else if !waitingForKey { scrollKey = nil }
        captureAnchor(n, nil)
      } else {
        if output.AnchorKey == anchorKey && Math.Abs(delta) > 0.01F {
          let offset = output.ScrollOffset ?? viewport.ScrollOffset
          output.ScrollOffset = Point{X: offset.X, Y: Math.Max(0.0, offset.Y + float64(delta))}
        }
        captureAnchor(n, output.AnchorKey)
      }
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
        pendingTargetY = float32(Math.Max(0.0, float64(n.ScrollTargetY) + y - float64(n.ScrollY)))
      }
      return children
    } catch (error Exception) {
      Cancel()
      rethrow
    } finally {
      output.Bind(nil)
      viewport.Bind(previous)
      ContextEnvironment.Current = previousContext
    }
  }

  internal func Add(item VirtualItem) {
    let key = item.Key
    if String.IsNullOrEmpty(key) {
      throw InvalidOperationException("Missing virtual item key in ${DeclaringCell?.GetType().Name ?? "<no Cell>"}.Build, ${pending?.GetType().Name}.Realize item ${item.Index}: assign a stable nonempty key to every VirtualItem (Goo best practices rule 10).")
    }
    if next.ContainsKey(key) {
      let childType = if let content = item.Content {
        if content is CellElement { content.CellType.Name } else { content.GetType().Name }
      } else { next[key].ComponentType?.Name ?? "retained content" }
      throw InvalidOperationException("Duplicate virtual item key '$key' in ${DeclaringCell?.GetType().Name ?? "<no Cell>"}.Build, ${pending?.GetType().Name}.Realize item ${item.Index} ($childType): assign a stable unique key to each VirtualItem (Goo best practices rule 10).")
    }
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
    var componentType Type?
    if let content = item.Content {
      componentType = if content is CellElement { content.CellType } else { content.GetType() }
    }
    var same = false
    if mounted.TryGetValue(key, out var previous) {
      marker = previous.Marker
      same = sameVirtualPlacement(previous.Placement, placement)
      componentType ??= previous.ComponentType
    } else {
      if item.Content == nil { throw InvalidOperationException("Virtual item '$key' at index ${item.Index} in ${pending?.GetType().Name}.Realize has no mounted content: supply Content when the key is first realized.") }
      marker = VirtualRetainedBlob(key)
    }
    next.Add(key, VirtualEntry{ Marker: marker, Placement: placement, ComponentType: componentType })
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
    updateRecyclingLimit(owner)
    contextDirty = contextVersion != pendingContextVersion
    contextReader?.Commit()
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
    anchorKey = pendingAnchorKey
    anchorScrollY = owner.ScrollY
    let previousAnchors = anchorNodes
    anchorNodes = pendingAnchorNodes
    pendingAnchorNodes = previousAnchors
    pendingAnchorNodes.Clear()
    if scrollKey != nil { requestedOffset = Point{X: float64(owner.ScrollX), Y: float64(owner.ScrollY)} }
    let previous = current
    current = state
    pending = nil
    if let prepared = pendingSource { source = prepared }
    pendingSource = nil
    pendingOwner = nil
    if let previous = previous {
      if previous != state { previous.Dispose() }
    }
  }

  internal func Cancel(preserveReads bool = false) {
    if pending != nil { clearRecycledRows() }
    if !preserveReads { contextReader?.Cancel() }
    pendingSource = nil
    next.Clear()
    children.Clear()
    pendingOwner = nil
    pendingAnchorNodes.Clear()
    pendingAnchorKey = nil
    guard let state = pending else { return }
    pending = nil
    state.Cancel()
    if state != current { state.Dispose() }
  }

  internal func Dispose() {
    clearRecycledRows()
    Cancel()
    contextReader?.Dispose()
    contextReader = nil
    Context = nil
    Owner = nil
    source = nil
    mounted.Clear()
    anchorNodes.Clear()
    scrollKey = nil
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
      throw InvalidOperationException("Virtual item '$key' has ${item.GetType().Name} content keyed '$authored': remove the content key or make it equal to the VirtualItem key.")
    }
  } else {
    item.SetVirtualKey(key)
  }
  return item
}

internal class Virtualization {
  shared {
    internal func State(n Node) VirtualNodeState? -> n.RetainedVirtualState

    internal func Configure(n Node) VirtualNodeState {
      if let state = State(n) { return state }
      let created = VirtualNodeState()
      n.RetainedVirtualState = created
      return created
    }

    internal func Refresh(n Node, rec Reconciler) bool {
      guard let state = State(n) else { return false }
      if !state.NeedsRefresh(n) { return false }
      let previousContext = rec.Context
      rec.Context = state.Context
      try {
        let children = state.PrepareRefresh(n)
        rec.diffChildren(n, children)
        state.Commit()
        rec.MarkEffects(ReconcileEffects.Layout | ReconcileEffects.Paint)
        return true
      } catch (error Exception) {
        state.Cancel()
        rethrow
      } finally { rec.Context = previousContext }
    }

    internal func ContentExtent(n Node) VirtualExtent ? -> State(n)?.Extent()

    internal func Position(n Node) int32? {
      guard let wrapper = n.Parent, let key = wrapper.Key, let owner = wrapper.Parent else { return nil }
      return State(owner)?.Position(key)
    }

    internal func ItemCount(n Node) int32? {
      if let state = State(n) { return state.ItemCount() }
      guard let parent = n.Parent else { return nil }
      if n.Key != nil {
        if let state = State(parent) { return state.ItemCount() }
      }
      guard let key = parent.Key, let owner = parent.Parent, let state = State(owner) else { return nil }
      return state.Position(key) != nil ? state.ItemCount() : nil
    }

    internal func Dispose(n Node) {
      if let state = State(n) {
        n.RetainedVirtualState = nil
        state.Dispose()
      }
    }
  }
}
