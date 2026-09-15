package Goo

import Facebook.Yoga
import System
import System.Collections.Generic

/// Creates a vertically scrolling virtual list whose retained rows are measured at the available content width.
/// @param items Immutable row values; replace changed values and rebuild the owning Cell after collection changes.
/// @param estimatedItemHeight A finite positive estimate used until a row is measured.
/// @param itemKey Stable, nonempty keys, unique across the whole collection.
/// @param itemBuilder Builds one row; all render dependencies should participate in item equality or builder identity.
/// @typeparam T The immutable row value type.
/// @returns A vertical virtual collection with two overscan rows on either side and bounded measurement work.
public func VirtualRows[T](items IReadOnlyList[T], estimatedItemHeight float64,
  itemKey((T) -> string), itemBuilder((T) -> Blob)) Blob{
    if items == nil { throw ArgumentNullException("items") }
    let estimate = virtualItemExtent(estimatedItemHeight, "estimatedItemHeight")
    if itemKey == nil { throw ArgumentNullException("itemKey") }
    if itemBuilder == nil { throw ArgumentNullException("itemBuilder") }
    return VirtualRowsBlob[T](items, estimate, itemKey, itemBuilder) {
      Position = PositionType.Relative,
      OverflowX = Overflow.Hidden,
      OverflowY = Overflow.Scroll,
    }
  }

internal class VirtualRowsBlob[T] : VirtualBlobBase {
  private let items IReadOnlyList[T]
  private let estimate float32
  private let key((T) -> string)
  private let builder((T) -> Blob)
  internal init(items IReadOnlyList[T], estimate float32, key((T) -> string), builder((T) -> Blob)) {
    this.items = items
    this.estimate = estimate
    this.key = key
    this.builder = builder
  }
  internal override func Prepare(state VirtualNodeState, n Node) IList[Blob] -> state.PrepareRows(n, items, estimate, key, builder)
}

internal class VirtualRowsStorage[T] : VirtualStorage {
  private let equality EqualityComparer[T] = EqualityComparer[T].Default
  private var current Dictionary[string, VirtualEntry[T]] = Dictionary[string, VirtualEntry[T]](StringComparer.Ordinal)
  private var next Dictionary[string, VirtualEntry[T]] = Dictionary[string, VirtualEntry[T]](StringComparer.Ordinal)
  private let output List[Blob] = List[Blob]()
  private let measurements List[VirtualRowMeasurement] = List[VirtualRowMeasurement](128)
  private var metadata VirtualRowMetadata[T]?
  private var source IReadOnlyList[T]?
  private var selector((T) -> string)?
  private var builder((T) -> Blob)?
  private var window VirtualWindow
  private var pendingMetadata VirtualRowMetadata[T]?
  private var pendingSource IReadOnlyList[T]?
  private var pendingSelector((T) -> string)?
  private var pendingBuilder((T) -> Blob)?
  private var pendingWindow VirtualWindow
  private var pendingOwner Node?
  private var pendingScroll float32
  private var pendingTarget float32
  private var hasPending bool

  internal func Prepare(n Node, items IReadOnlyList[T], estimate float32,
    itemKey((T) -> string), itemBuilder((T) -> Blob)) IList[Blob] -> prepare(n, items, estimate, itemKey, itemBuilder, false)

  internal override func PrepareRefresh(n Node) IList[Blob] {
    guard let items = source, let key = selector, let build = builder, let data = metadata else { throw InvalidOperationException("Measured virtual source is unavailable") }
    return prepare(n, items, data.Estimate, key, build, true)
  }

  internal override func NeedsRefresh(n Node) bool {
    guard let data = metadata else { return false }
    if data.Width != BoxGeometry.ContentWidth(n) || data.Gap != Gap(n) { return true }
    let target = Window(n, data, float64(n.ScrollY), false)
    if !sameVirtualWindow(window, target) { return true }
    let focused = FocusedIndex(n, data)
    let expectedCount = target.Count + (if focused >= 0 && (focused < target.Start || focused >= target.Start + target.Count) { 1 } else { 0 })
    if current.Count != expectedCount { return true }
    for i in 0 ... n.Children.Count {
      let child = n.Children[i]
      if NeedsMeasurement(child, data, out var index, out var height) { return true }
    }
    return false
  }

  internal override func NeedsContinuation(n Node) bool -> NeedsRefresh(n)
  internal override func Extent() VirtualExtent ? -> if metadata == nil { nil } else { VirtualExtent{Width: window.ContentW, Height: window.ContentH} }
  internal override func OffsetForKey(n Node, key string) Point? {
    guard let data = metadata else { return nil }
    if !data.Indices.TryGetValue(key, out var index) { return nil }
    return Point{X: 0.0, Y: Math.Max(0.0, float64(window.OriginY) + data.Index.Prefix(index))}
  }

  private func prepare(n Node, items IReadOnlyList[T], estimate float32,
    key((T) -> string), build((T) -> Blob), refresh bool) IList[Blob]{
      Cancel()
      if n.FlexDirection != FlexDirection.Column || n.FlexWrap != FlexWrap.NoWrap {
        throw InvalidOperationException("VirtualRows supports only Column direction without wrapping")
      }
      if items.Count > 1000000 { throw ArgumentOutOfRangeException("items", "VirtualRows supports at most one million metadata entries") }
      let width = BoxGeometry.ContentWidth(n)
      let gap = Gap(n)
      let sameBuilder = Object.Equals(builder, build)
      let old = metadata
      let data = if refresh && old != nil && old.Width == width && old.Gap == gap { old }
      else { Snapshot(items, estimate, key, width, gap, sameBuilder) }
      pendingMetadata = data
      if Object.ReferenceEquals(old, data) && width > 0.0F {
        for i in 0 ... n.Children.Count {
          let child = n.Children[i]
          if measurements.Count == 128 { break }
          if NeedsMeasurement(child, data, out var index, out var height) {
            measurements.Add(VirtualRowMeasurement{Index: index, Height: height})
          }
        }
      }
      var scroll = float64(n.ScrollY)
      if let previous = old {
        if previous.Rows.Length > 0 && data.Rows.Length > 0 {
          let oldIndex = AnchorIndex(previous, n.ScrollY)
          let anchor = previous.Rows[oldIndex].Key
          let nextIndex = if data.Indices.TryGetValue(anchor, out var found) { found } else { Math.Min(oldIndex, data.Rows.Length - 1) }
          let before = float64(window.OriginY) + previous.Index.Prefix(oldIndex)
          let after = float64(BoxGeometry.ContentTop(n) - n.Rect.Y) + Prefix(data, nextIndex, true)
          scroll = Math.Max(0.0, scroll + after - before)
        }
      }
      let target = Window(n, data, scroll, true)
      if target.Count > 4096 { throw InvalidOperationException("VirtualRows viewport exceeds the 4096-row realization budget") }
      try {
        let focused = FocusedIndex(n, data)
        if focused >= 0 && focused < target.Start { AddRow(focused, data, target, build, sameBuilder) }
        for index in target.Start ... target.Start + target.Count { AddRow(index, data, target, build, sameBuilder) }
        if focused >= target.Start + target.Count { AddRow(focused, data, target, build, sameBuilder) }
        pendingSource = items
        pendingSelector = key
        pendingBuilder = build
        pendingWindow = target
        pendingOwner = n
        pendingScroll = float32(scroll)
        pendingTarget = float32(Math.Max(0.0, float64(n.ScrollTargetY) + scroll - float64(n.ScrollY)))
        hasPending = true
        return output
      } catch (error Exception) {
        Cancel()
        throw error
      }
    }

  private func AddRow(index int32, data VirtualRowMetadata[T], target VirtualWindow,
    build((T) -> Blob), sameBuilder bool) {
      let row = data.Rows[index]
      var height = row.Height
      for i in 0 ... measurements.Count { let value = measurements[i]
        if value.Index == index { height = value.Height
          break } }
      let placement = VirtualPlacement{
        Index: index, X: target.OriginX, Y: float32(float64(target.OriginY) + Prefix(data, index, true)),
        W: data.Width, H: height,
      }
      var marker VirtualRetainedBlob
      var unchanged = false
      var samePlacement = false
      if current.TryGetValue(row.Key, out var previous) {
        marker = previous.Marker
        unchanged = sameBuilder && equality.Equals(previous.Item, row.Item)
        samePlacement = sameVirtualPlacement(previous.Placement, placement)
      } else { marker = VirtualRetainedBlob(row.Key) }
      next.Add(row.Key, VirtualEntry[T]{Item: row.Item, Marker: marker, Placement: placement})
      if unchanged && samePlacement { output.Add(marker) }
      else {
        let child = if unchanged { marker } else { virtualItem(build(row.Item), row.Key) }
        output.Add(Container() {.Key: row.Key,.Position: PositionType.Absolute,.Left: float64(placement.X),.Top: float64(placement.Y),.Width: float64(placement.W),.FlexShrink: 0.0,
            child,
        })
      }
    }

  private func Snapshot(items IReadOnlyList[T], estimate float32, key((T) -> string),
    width float32, gap float32, sameBuilder bool) VirtualRowMetadata[T]{
      let old = metadata
      var unchanged = old != nil && old.Rows.Length == items.Count && old.Width == width && old.Gap == gap && old.Estimate == estimate && sameBuilder
      if unchanged {
        let previous = old!!
        for i in 0 ... items.Count {
          if !equality.Equals(previous.Rows[i].Item, items[i]) || previous.Rows[i].Key != key(items[i]) { unchanged = false
            break }
        }
        if unchanged { return previous }
      }
      let rows = [items.Count]VirtualRow[T]
      let indices = Dictionary[string, int32](items.Count, StringComparer.Ordinal)
      for i in 0 ... items.Count {
        let item = items[i]
        let id = key(item)
        if String.IsNullOrEmpty(id) || !indices.TryAdd(id, i) { throw InvalidOperationException("VirtualRows keys must be nonempty and unique across the collection") }
        var row = VirtualRow[T]{Item: item, Key: id, Height: estimate}
        if let previous = old {
          if sameBuilder && previous.Width == width && previous.Indices.TryGetValue(id, out var index) {
            let retained = previous.Rows[index]
            if retained.Measured && equality.Equals(retained.Item, item) {
              row.Height = retained.Height
              row.Measured = true
            }
          }
        }
        rows[i] = row
      }
      return VirtualRowMetadata[T](rows, indices, width, gap, estimate)
    }

  private func Prefix(data VirtualRowMetadata[T], count int32, pending bool) float64 {
    var result = data.Index.Prefix(count)
    if pending {
      for i in 0 ... measurements.Count {
        let value = measurements[i]
        if value.Index < count { result += float64(value.Height) - float64(data.Rows[value.Index].Height) }
      }
    }
    return result
  }

  private func AnchorIndex(data VirtualRowMetadata[T], scroll float32) int32 {
    // Match the float32 coordinates used by layout and ScrollToItem at exact row boundaries.
    var low = 0
    var high = data.Rows.Length - 1
    while low < high {
      let middle = low + (high - low + 1) / 2
      let top = float32(float64(window.OriginY) + data.Index.Prefix(middle))
      if top <= scroll { low = middle }
      else { high = middle - 1 }
    }
    return low
  }

  private func Find(data VirtualRowMetadata[T], offset float64, pending bool) int32 {
    if !pending || measurements.Count == 0 { return data.Index.Find(offset) }
    var low = 0
    var high = data.Rows.Length
    while low < high {
      let middle = low + (high - low + 1) / 2
      if Prefix(data, middle, true) <= offset { low = middle }
      else { high = middle - 1 }
    }
    return Math.Min(low, Math.Max(0, data.Rows.Length - 1))
  }

  private func Window(n Node, data VirtualRowMetadata[T], scroll float64, pending bool) VirtualWindow {
    let height = BoxGeometry.ContentHeight(n)
    let x = BoxGeometry.ContentLeft(n) - n.Rect.X
    let y = BoxGeometry.ContentTop(n) - n.Rect.Y
    let count = data.Rows.Length
    let start = if count == 0 { 0 } else { Math.Max(0, Find(data, Math.Max(0.0, scroll - float64(y)), pending) - 2) }
    let end = if count == 0 { 0 } else { Math.Min(count, Find(data, Math.Max(0.0, scroll + float64(height) - float64(y)), pending) + 3) }
    let total = Math.Max(0.0, Prefix(data, count, pending) - (if count > 0 { float64(data.Gap) } else { 0.0 }))
    let contentHeight = float64(y) + total + float64(Math.Max(0.0F, n.Rect.H - height - y))
    if !Double.IsFinite(contentHeight) || contentHeight > float64(Single.MaxValue) { throw InvalidOperationException("VirtualRows content extent exceeds finite layout coordinates") }
    return VirtualWindow{Start: start, Count: Math.Max(0, end - start), ContentW: x + data.Width,
      ContentH: float32(contentHeight), OriginX: x, OriginY: y, ItemW: data.Width,
      ItemH: height, RowGap: data.Gap, Direction: FlexDirection.Column, Wrap: FlexWrap.NoWrap}
  }

  private func Gap(n Node) float32 -> Math.Max(0.0F, virtualGap(n.RowGap, n.Gap, BoxGeometry.ContentWidth(n)))

  private func NeedsMeasurement(child Node, data VirtualRowMetadata[T], out index int32, out height float32) bool {
    index = -1
    height = 0.0F
    guard let key = child.Key, let yoga = child.Yoga else { return false }
    if YGNodeAPI.YGNodeIsDirty(yoga) || !data.Indices.TryGetValue(key, out index) { return false }
    height = child.Rect.H
    if !Single.IsFinite(height) || height < 0.0F { throw InvalidOperationException("Virtual row measured an invalid height") }
    let row = data.Rows[index]
    return !row.Measured || Math.Abs(row.Height - height) > 0.01F
  }

  private func FocusedIndex(n Node, data VirtualRowMetadata[T]) int32 {
    for i in 0 ... n.Children.Count {
      let child = n.Children[i]
      if HasFocus(child) {
        guard let key = child.Key else { continue }
        if data.Indices.TryGetValue(key, out var index) { return index }
      }
    }
    return -1
  }
  private func HasFocus(n Node) bool {
    if n.Focused { return true }
    for i in 0 ... n.Children.Count { if HasFocus(n.Children[i]) { return true } }
    return false
  }

  internal override func Commit() {
    guard let data = pendingMetadata, let owner = pendingOwner else { throw InvalidOperationException("VirtualRows state was not prepared") }
    if !hasPending { throw InvalidOperationException("VirtualRows state was not prepared") }
    for i in 0 ... measurements.Count {
      let value = measurements[i]
      var row = data.Rows[value.Index]
      data.Index.Add(value.Index, float64(value.Height) - float64(row.Height))
      row.Height = value.Height
      row.Measured = true
      data.Rows[value.Index] = row
    }
    metadata = data
    source = pendingSource
    selector = pendingSelector
    builder = pendingBuilder
    window = pendingWindow
    owner.ScrollY = pendingScroll
    owner.ScrollTargetY = pendingTarget
    let previous = current
    current = next
    next = previous
    Cancel()
  }

  internal override func Cancel() {
    next.Clear()
    output.Clear()
    measurements.Clear()
    pendingMetadata = nil
    pendingSource = nil
    pendingSelector = nil
    pendingBuilder = nil
    pendingOwner = nil
    hasPending = false
  }
  internal override func Dispose() {
    Cancel()
    current.Clear()
    metadata = nil
    source = nil
    selector = nil
    builder = nil
  }
}
