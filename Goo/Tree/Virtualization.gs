package Goo

import System
import System.Collections.Generic
import System.Runtime.CompilerServices

public func Virtual[T](items IReadOnlyList[T], itemWidth float64, itemHeight float64,
  itemKey((T) -> string), itemBuilder((T) -> Blob)) Blob{
    if items == nil { throw ArgumentNullException("items") }
    let width = virtualItemExtent(itemWidth, "itemWidth")
    let height = virtualItemExtent(itemHeight, "itemHeight")
    if itemKey == nil { throw ArgumentNullException("itemKey") }
    if itemBuilder == nil { throw ArgumentNullException("itemBuilder") }
    return VirtualBlob[T](items, width, height, itemKey, itemBuilder) {
      Position = PositionType.Relative,
      OverflowX = Overflow.Scroll,
      OverflowY = Overflow.Scroll,
    }
  }

internal open class VirtualBlobBase : Blob {
  internal open func Prepare(state VirtualNodeState, n Node) IList[Blob];

  internal override func coreBlob() {
  }
}

internal sealed class VirtualBlob[T] : VirtualBlobBase {
  private let items IReadOnlyList[T]
  private let itemWidth float32
  private let itemHeight float32
  private let itemKey((T) -> string)
  private let itemBuilder((T) -> Blob)

  internal init(source IReadOnlyList[T], width float32, height float32,
    key((T) -> string), builder((T) -> Blob)) {
      items = source
      itemWidth = width
      itemHeight = height
      itemKey = key
      itemBuilder = builder
    }

  internal override func Prepare(state VirtualNodeState, n Node) IList[Blob] ->
  state.Prepare(n, items, itemWidth, itemHeight, itemKey, itemBuilder)
}

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
}

internal data struct VirtualWindow {
  internal var Start int32
  internal var Count int32
  internal var ContentW float32
  internal var ContentH float32
  internal var Columns int32
  internal var Rows int32
  internal var OriginX float32
  internal var OriginY float32
  internal var ItemW float32
  internal var ItemH float32
  internal var RowGap float32
  internal var ColumnGap float32
  internal var Direction FlexDirection
  internal var Wrap FlexWrap
}

internal data struct VirtualExtent {
  internal var Width float32
  internal var Height float32
}

internal open class VirtualStorage {
  internal open func NeedsContinuation(n Node) bool -> false
  internal open func OffsetForKey(n Node, key string) Point ? -> nil
  internal open func NeedsRefresh(n Node) bool;
  internal open func PrepareRefresh(n Node) IList[Blob];
  internal open func Extent() VirtualExtent?;
  internal open func Commit();
  internal open func Cancel();
  internal open func Dispose();
}

internal data struct VirtualEntry[T] {
  internal var Item T
  internal var Marker VirtualRetainedBlob
  internal var Placement VirtualPlacement
}

internal sealed class VirtualStorage[T] : VirtualStorage {
  private var current Dictionary[string, VirtualEntry[T]]
  private var next Dictionary[string, VirtualEntry[T]]
  private let output List[Blob]
  private var source IReadOnlyList[T]?
  private var itemW float32
  private var itemH float32
  private var keySelector((T) -> string)?
  private var builder((T) -> Blob)?
  private let itemEquality EqualityComparer[T]
  private var pendingSource IReadOnlyList[T]?
  private var pendingItemW float32
  private var pendingItemH float32
  private var pendingKeySelector((T) -> string)?
  private var pendingBuilder((T) -> Blob)?
  private var currentWindow VirtualWindow
  private var pendingWindow VirtualWindow
  private var hasCurrentWindow bool
  private var hasPending bool

  internal init() {
    current = Dictionary[string, VirtualEntry[T]]()
    next = Dictionary[string, VirtualEntry[T]]()
    output = List[Blob]()
    itemEquality = EqualityComparer[T].Default
  }

  internal func Prepare(n Node, items IReadOnlyList[T], width float32, height float32,
    itemKey((T) -> string), itemBuilder((T) -> Blob)) IList[Blob] ->
  prepare(n, items, width, height, itemKey, itemBuilder)

  internal override func NeedsRefresh(n Node) bool {
    guard let items = source else { return false }
    let target = window(n, items.Count, itemW, itemH)
    return !hasCurrentWindow || !sameVirtualWindow(currentWindow, target)
  }

  internal override func OffsetForKey(n Node, key string) Point? {
    guard let items = source, let selectKey = keySelector else { return nil }
    for i in 0 ... items.Count {
      if selectKey(items[i]) == key {
        let placement = virtualPlacement(window(n, items.Count, itemW, itemH), i)
        return Point{X: float64(Math.Max(0.0F, placement.X)), Y: float64(Math.Max(0.0F, placement.Y))}
      }
    }
    return nil
  }

  internal override func PrepareRefresh(n Node) IList[Blob] {
    guard let items = source, let itemKey = keySelector, let itemBuilder = builder else {
      throw InvalidOperationException("Virtual source is unavailable")
    }
    return prepare(n, items, itemW, itemH, itemKey, itemBuilder)
  }

  internal override func Extent() VirtualExtent? {
    if !hasCurrentWindow { return nil }
    return VirtualExtent{ Width: currentWindow.ContentW, Height: currentWindow.ContentH }
  }

  private func prepare(n Node, items IReadOnlyList[T], width float32, height float32,
    itemKey((T) -> string), itemBuilder((T) -> Blob)) IList[Blob]{
      Cancel()
      let target = window(n, items.Count, width, height)
      try {
        var offset int32
        while offset < target.Count {
          let index = target.Start + offset
          let item = items[index]
          let key = itemKey(item)
          if String.IsNullOrEmpty(key) {
            throw InvalidOperationException("Virtual item keys must be non-empty")
          }
          if next.ContainsKey(key) {
            throw InvalidOperationException("Virtual item keys must be unique")
          }

          let placement = virtualPlacement(target, index)
          var marker VirtualRetainedBlob
          var unchanged = false
          var samePlacement = false
          if current.TryGetValue(key, out var previous) {
            marker = previous.Marker
            unchanged = itemEquality.Equals(previous.Item, item)
            samePlacement = sameVirtualPlacement(previous.Placement, placement)
          } else {
            marker = VirtualRetainedBlob(key)
          }
          next.Add(key, VirtualEntry[T]{
            Item: item,
            Marker: marker,
            Placement: placement,
          })

          if unchanged && samePlacement {
            output.Add(marker)
          } else {
            let child = unchanged ? marker : virtualItem(itemBuilder(item), key)
            output.Add(virtualWrapper(key, child, placement))
          }
          offset++
        }
        pendingSource = items
        pendingItemW = width
        pendingItemH = height
        pendingKeySelector = itemKey
        pendingBuilder = itemBuilder
        pendingWindow = target
        hasPending = true
        return output
      } catch (error Exception) {
        Cancel()
        throw error
      }
    }

  private func window(n Node, count int32, width float32, height float32) VirtualWindow {
    if count <= 0 {
      return VirtualWindow{ Direction: n.FlexDirection, Wrap: n.FlexWrap }
    }

    let viewportW = TextLayouts.ContentWidth(n)
    let viewportH = TextLayouts.ContentHeight(n)
    let originX = TextLayouts.ContentLeft(n) - n.Rect.X
    let originY = TextLayouts.ContentTop(n) - n.Rect.Y
    let rowGap = virtualGap(n.RowGap, n.Gap, viewportW)
    let columnGap = virtualGap(n.ColumnGap, n.Gap, viewportW)
    let rowFlow = n.FlexDirection == FlexDirection.Row
      || n.FlexDirection == FlexDirection.RowReverse
    let wrapped = n.FlexWrap != FlexWrap.NoWrap
    var columns = 1
    var rows = 1
    if wrapped && rowFlow {
      columns = virtualLineCapacity(viewportW, width, columnGap)
      rows = virtualCeiling(count, columns)
    } else if wrapped {
      rows = virtualLineCapacity(viewportH, height, rowGap)
      columns = virtualCeiling(count, rows)
    } else if rowFlow {
      columns = count
    } else {
      rows = count
    }

    let lineCount = wrapped ? (rowFlow ? rows : columns) : count
    let scroll = rowFlow && !wrapped ? n.ScrollX : !rowFlow && !wrapped ? n.ScrollY : rowFlow ? n.ScrollY : n.ScrollX
    let viewport = rowFlow && !wrapped ? viewportW : !rowFlow && !wrapped ? viewportH : rowFlow ? viewportH : viewportW
    let lineSize = rowFlow && !wrapped ? width : !rowFlow && !wrapped ? height : rowFlow ? height : width
    let lineGap = rowFlow && !wrapped ? columnGap : !rowFlow && !wrapped ? rowGap : rowFlow ? rowGap : columnGap
    let lineOrigin = rowFlow && !wrapped ? originX : !rowFlow && !wrapped ? originY : rowFlow ? originY : originX
    let lineWindow = virtualLineWindow(lineCount, scroll, viewport, lineOrigin,
      lineSize + lineGap, n.FlexWrap == FlexWrap.WrapReverse || (!wrapped
          && (n.FlexDirection == FlexDirection.RowReverse
              || n.FlexDirection == FlexDirection.ColumnReverse)))
    var start = lineWindow.Start
    var visibleCount = lineWindow.Count
    if wrapped {
      let perLine = rowFlow ? columns : rows
      start = lineWindow.Start * perLine
      let end = Math.Min(count, (lineWindow.Start + lineWindow.Count) * perLine)
      visibleCount = end - start
    }

    let usedColumns = Math.Min(count, columns)
    let usedRows = Math.Min(count, rows)
    let contentW = originX + virtualSpan(usedColumns, width, columnGap)
    let contentH = originY + virtualSpan(usedRows, height, rowGap)
    return VirtualWindow{
      Start: start,
      Count: visibleCount,
      ContentW: contentW,
      ContentH: contentH,
      Columns: columns,
      Rows: rows,
      OriginX: originX,
      OriginY: originY,
      ItemW: width,
      ItemH: height,
      RowGap: rowGap,
      ColumnGap: columnGap,
      Direction: n.FlexDirection,
      Wrap: n.FlexWrap,
    }
  }

  internal override func Commit() {
    if !hasPending {
      throw InvalidOperationException("Virtual state was not prepared")
    }
    let old = current
    current = next
    next = old
    next.Clear()
    output.Clear()
    source = pendingSource
    itemW = pendingItemW
    itemH = pendingItemH
    keySelector = pendingKeySelector
    builder = pendingBuilder
    currentWindow = pendingWindow
    hasCurrentWindow = true
    clearPending()
  }

  internal override func Cancel() {
    next.Clear()
    output.Clear()
    clearPending()
  }

  private func clearPending() {
    pendingSource = nil
    pendingKeySelector = nil
    pendingBuilder = nil
    hasPending = false
  }

  internal override func Dispose() {
    current.Clear()
    next.Clear()
    output.Clear()
    source = nil
    keySelector = nil
    builder = nil
    clearPending()
  }
}

internal sealed class VirtualNodeState {
  private var current VirtualStorage?
  private var pending VirtualStorage?

  internal func PrepareRows[T](n Node, items IReadOnlyList[T], estimate float32,
    itemKey((T) -> string), itemBuilder((T) -> Blob)) IList[Blob]{
      let storage = (current as VirtualRowsStorage[T]) ?? VirtualRowsStorage[T]()
      try {
        let result = storage.Prepare(n, items, estimate, itemKey, itemBuilder)
        pending = storage
        return result
      } catch (error Exception) {
        storage.Cancel()
        pending = nil
        throw error
      }
    }
  internal func NeedsContinuation(n Node) bool -> current?.NeedsContinuation(n) ?? false
  internal func OffsetForKey(n Node, key string) Point ? -> current?.OffsetForKey(n, key)

  internal func Prepare[T](n Node, items IReadOnlyList[T], itemWidth float32,
    itemHeight float32, itemKey((T) -> string), itemBuilder((T) -> Blob)) IList[Blob]{
      var storage VirtualStorage[T]
      if let existing = current as VirtualStorage[T] {
        storage = existing
      } else {
        storage = VirtualStorage[T]()
      }
      try {
        let result = storage.Prepare(n, items, itemWidth, itemHeight, itemKey, itemBuilder)
        pending = storage
        return result
      } catch (error Exception) {
        storage.Cancel()
        pending = nil
        throw error
      }
    }

  internal func NeedsRefresh(n Node) bool -> current?.NeedsRefresh(n) ?? false

  internal func PrepareRefresh(n Node) IList[Blob] {
    guard let storage = current else {
      throw InvalidOperationException("Virtual state is unavailable")
    }
    let result = storage.PrepareRefresh(n)
    pending = storage
    return result
  }

  internal func Extent() VirtualExtent ? -> current?.Extent()

  internal func Commit() {
    guard let storage = pending else {
      throw InvalidOperationException("Virtual state was not prepared")
    }
    storage.Commit()
    if let previous = current {
      if previous != storage { previous.Dispose() }
    }
    current = storage
    pending = nil
  }

  internal func Cancel() {
    if let storage = pending {
      storage.Cancel()
      pending = nil
    }
  }

  internal func Dispose() {
    if let storage = pending {
      storage.Dispose()
    }
    if let storage = current {
      if storage != pending { storage.Dispose() }
    }
    pending = nil
    current = nil
  }
}

internal func virtualWrapper(key string, child Blob, placement VirtualPlacement) Blob -> Container {
  Key: key,
  Position: PositionType.Absolute,
  Left: float64(placement.X),
  Top: float64(placement.Y),
  Width: float64(placement.W),
  Height: float64(placement.H),
  FlexShrink: 0.0,
  Children: { child },
}

internal func virtualPlacement(window VirtualWindow, index int32) VirtualPlacement {
  let rowFlow = window.Direction == FlexDirection.Row
    || window.Direction == FlexDirection.RowReverse
  let wrapped = window.Wrap != FlexWrap.NoWrap
  var column int32
  var row int32
  if wrapped && rowFlow {
    row = index / window.Columns
    column = index % window.Columns
    if window.Direction == FlexDirection.RowReverse {
      column = window.Columns - 1 - column
    }
    if window.Wrap == FlexWrap.WrapReverse {
      row = window.Rows - 1 - row
    }
  } else if wrapped {
    column = index / window.Rows
    row = index % window.Rows
    if window.Direction == FlexDirection.ColumnReverse {
      row = window.Rows - 1 - row
    }
    if window.Wrap == FlexWrap.WrapReverse {
      column = window.Columns - 1 - column
    }
  } else if rowFlow {
    column = window.Direction == FlexDirection.RowReverse
    ? window.Columns - 1 - index : index
  } else {
    row = window.Direction == FlexDirection.ColumnReverse
    ? window.Rows - 1 - index : index
  }
  return VirtualPlacement{
    Index: index,
    X: window.OriginX + float32(column) * (window.ItemW + window.ColumnGap),
    Y: window.OriginY + float32(row) * (window.ItemH + window.RowGap),
    W: window.ItemW,
    H: window.ItemH,
  }
}

internal func virtualGap(specific Length, fallback Length, basis float32) float32 {
  if specific.HasMagnitude { return virtualLength(specific, basis) }
  if fallback.HasMagnitude { return virtualLength(fallback, basis) }
  return 0.0F
}

internal func virtualLength(value Length, basis float32) float32 ->
value.IsPercent ? basis * float32(value.Magnitude) / 100.0F : float32(value.Magnitude)

internal func virtualLineCapacity(viewport float32, item float32, gap float32) int32 {
  if item <= 0.0F { return 1 }
  let capacity = int32(MathF.Floor((viewport + gap) / (item + gap)))
  return capacity > 0 ? capacity : 1
}

internal func virtualCeiling(value int32, divisor int32) int32 ->
value / divisor + (value % divisor == 0 ? 0 : 1)

internal func virtualSpan(count int32, item float32, gap float32) float32 {
  if count <= 0 { return 0.0F }
  return float32(count) * item + float32(count - 1) * gap
}

internal data struct VirtualLineWindow {
  internal var Start int32
  internal var Count int32
}

internal func virtualLineWindow(count int32, scroll float32, viewport float32,
  origin float32, stride float32, reverse bool) VirtualLineWindow{
    if count <= 0 || stride <= 0.0F {
      return VirtualLineWindow{}
    }
    var first = int32(MathF.Floor((scroll - origin) / stride)) - 1
    var end = int32(MathF.Ceiling((scroll + viewport - origin) / stride)) + 1
    if first < 0 { first = 0 }
    if end < 0 { end = 0 }
    if first > count { first = count }
    if end > count { end = count }
    if end < first { end = first }
    if reverse {
      return VirtualLineWindow{ Start: count - end, Count: end - first }
    }
    return VirtualLineWindow{ Start: first, Count: end - first }
  }

internal func sameVirtualPlacement(left VirtualPlacement, right VirtualPlacement) bool ->
left.Index == right.Index && left.X == right.X && left.Y == right.Y
  && left.W == right.W && left.H == right.H

internal func sameVirtualWindow(left VirtualWindow, right VirtualWindow) bool ->
left.Start == right.Start && left.Count == right.Count
  && left.ContentW == right.ContentW && left.ContentH == right.ContentH
  && left.Columns == right.Columns && left.Rows == right.Rows
  && left.OriginX == right.OriginX && left.OriginY == right.OriginY
  && left.ItemW == right.ItemW && left.ItemH == right.ItemH
  && left.RowGap == right.RowGap && left.ColumnGap == right.ColumnGap
  && left.Direction == right.Direction && left.Wrap == right.Wrap

internal func virtualItemExtent(value float64, name string) float32 {
  if Double.IsNaN(value) || Double.IsInfinity(value) || value <= 0.0 {
    throw ArgumentOutOfRangeException(name)
  }
  let extent = float32(value)
  if Single.IsInfinity(extent) { throw ArgumentOutOfRangeException(name) }
  return extent
}

internal func virtualItem(item Blob, key string) Blob {
  if item == nil {
    throw InvalidOperationException("Virtual item builder returned nil")
  }
  if let authored = item.Key {
    if authored != key {
      throw InvalidOperationException("Virtual item key conflicts with itemKey")
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

    internal func State(n Node) VirtualNodeState? {
      if values.TryGetValue(n, out var state) { return state }
      return nil
    }

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

    internal func Dispose(n Node) {
      if let state = State(n) {
        state.Dispose()
        values.Remove(n)
      }
    }
  }
}
