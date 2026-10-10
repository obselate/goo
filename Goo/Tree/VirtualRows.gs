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
    return virtualRowsBlob(items, nil, estimate, itemKey, itemBuilder)
  }

/// Creates VirtualRows over a window of an append-only log, such as the latest lines of streaming output.
/// Entries never change once added, and between builds the window only drops entries from its start and
/// adds entries at its end, so an update costs time proportional to the entries dropped and added rather
/// than to the whole window. Any other change to the window rebuilds the list as VirtualRows does.
/// @param items The entries in the window, oldest first. The list may be the same instance on every build.
/// @param start The log position of `items[0]`. Positions count every entry ever added, so they only increase.
/// @param estimatedItemHeight A finite positive estimate used until a row is measured.
/// @param itemKey Stable, nonempty keys, unique across the whole log.
/// @param itemBuilder Builds one row; keep the same builder between builds so unchanged rows are reused.
/// @param pinToBottom Keeps the end of the log in view as entries change until the reader scrolls away from it.
/// Scrolling back to the end pins it again.
/// @typeparam T The immutable entry type.
/// @returns A vertical virtual collection with two overscan rows on either side and bounded measurement work.
public func VirtualLog[T](items IReadOnlyList[T], start int64, estimatedItemHeight float64,
  itemKey((T) -> string), itemBuilder((T) -> Blob), pinToBottom bool = false) Blob{
    if items == nil { throw ArgumentNullException("items") }
    if start < 0L { throw ArgumentOutOfRangeException("start", "Log positions must not be negative") }
    let estimate = virtualItemExtent(estimatedItemHeight, "estimatedItemHeight")
    if itemKey == nil { throw ArgumentNullException("itemKey") }
    if itemBuilder == nil { throw ArgumentNullException("itemBuilder") }
    let result = virtualRowsBlob(items, start, estimate, itemKey, itemBuilder)
    result.PinToBottom = pinToBottom
    return result
  }

internal func virtualRowsBlob[T](items IReadOnlyList[T], start int64?, estimate float32,
  itemKey((T) -> string), itemBuilder((T) -> Blob)) VirtualRowsBlob[T] -> VirtualRowsBlob[T](items, start, estimate, itemKey, itemBuilder) {
    Accessibility = Accessibility{ Role: AccessibilityRole.List },
    Position = PositionType.Relative,
    OverflowX = Overflow.Hidden,
    OverflowY = Overflow.Scroll,
  }

internal class VirtualRowsBlob[T] : VirtualBlobBase {
  private let items IReadOnlyList[T]
  private let start int64?
  private let estimate float32
  private let key((T) -> string)
  private let builder((T) -> Blob)
  internal init(items IReadOnlyList[T], start int64?, estimate float32, key((T) -> string), builder((T) -> Blob)) {
    this.items = items
    this.start = start
    this.estimate = estimate
    this.key = key
    this.builder = builder
  }
  internal override func Prepare(state VirtualNodeState, n Node) IList[Blob] -> state.PrepareRows(n, items, start, estimate, key, builder)
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
  // The log window the metadata holds, when the rows came from VirtualLog: positions [logStart, logEnd).
  private var logged bool
  private var logStart int64
  private var logEnd int64

  internal func Prepare(n Node, items IReadOnlyList[T], start int64?, estimate float32,
    itemKey((T) -> string), itemBuilder((T) -> Blob)) IList[Blob] -> prepare(n, items, start, estimate, itemKey, itemBuilder, false)

  internal override func PrepareRefresh(n Node) IList[Blob] {
    guard let items = source, let key = selector, let build = builder, let data = metadata else { throw InvalidOperationException("Measured virtual source is unavailable") }
    return prepare(n, items, nil, data.Estimate, key, build, true)
  }

  internal override func NeedsRefresh(n Node) bool {
    guard let data = metadata else { return false }
    if data.Width != BoxGeometry.ViewportWidth(n) || data.Gap != Gap(n) { return true }
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

  internal override func ItemCount() int32 -> metadata?.Count ?? 0
  internal override func NeedsContinuation(n Node) bool -> NeedsRefresh(n)
  internal override func Extent() VirtualExtent ? -> if metadata == nil { nil } else { VirtualExtent{Width: window.ContentW, Height: window.ContentH} }
  internal override func OffsetForKey(n Node, key string) Point? {
    guard let data = metadata else { return nil }
    if !data.TryIndex(key, out var index) { return nil }
    return Point{X: 0.0, Y: Math.Max(0.0, float64(window.OriginY) + data.Prefix(index))}
  }

  private func prepare(n Node, items IReadOnlyList[T], start int64?, estimate float32,
    key((T) -> string), build((T) -> Blob), refresh bool) IList[Blob]{
      Cancel()
      if n.FlexDirection != FlexDirection.Column || n.FlexWrap != FlexWrap.NoWrap {
        throw InvalidOperationException("VirtualRows supports only Column direction without wrapping")
      }
      if items.Count > 1000000 { throw ArgumentOutOfRangeException("items", "VirtualRows supports at most one million metadata entries") }
      let width = BoxGeometry.ViewportWidth(n)
      let gap = Gap(n)
      let sameBuilder = Object.Equals(builder, build)
      let old = metadata
      // Find the row at the top of the viewport before the log path changes the rows in place.
      var anchor = ""
      var oldIndex = 0
      var before = 0.0
      if let previous = old {
        if previous.Count > 0 {
          oldIndex = AnchorIndex(previous, n.ScrollY)
          anchor = previous.Row(oldIndex).Key
          before = float64(window.OriginY) + previous.Prefix(oldIndex)
        }
      }
      var data VirtualRowMetadata[T]
      var appended = false
      if refresh && old != nil && old.Width == width && old.Gap == gap {
        data = old
      } else if let position = start {
        if let rows = AppendLog(old, items, position, estimate, key, width, gap, sameBuilder) {
          data = rows
          appended = true
        } else { data = Snapshot(items, estimate, key, width, gap, sameBuilder) }
        logged = true
        logStart = position
        logEnd = position + int64(items.Count)
      } else if refresh && logged && old != nil {
        // The retained list may have changed since the log window was recorded, so keep the recorded rows.
        data = Snapshot(old.Items(), estimate, key, width, gap, sameBuilder)
      } else {
        data = Snapshot(items, estimate, key, width, gap, sameBuilder)
        logged = false
      }
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
      // A pinned list the reader has not scrolled stays at its end instead of keeping its top row in place.
      let pinned = n.PinToBottom && !n.UserScrolled
      if pinned {
        let whole = Window(n, data, 0.0, true)
        scroll = Math.Max(0.0, float64(whole.ContentH) - float64(BoxGeometry.ViewportHeight(n)))
      } else if anchor != "" && data.Count > 0 {
        // A log drops entries only from its start, so a missing anchor left with every entry before it and the
        // oldest remaining entry takes its place.
        let nextIndex = if data.TryIndex(anchor, out var found) { found }
        else { if appended { 0 } else { Math.Min(oldIndex, data.Count - 1) } }
        let after = float64(BoxGeometry.ContentTop(n) - n.Rect.Y) + Prefix(data, nextIndex, true)
        scroll = Math.Max(0.0, scroll + after - before)
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
        pendingTarget = if pinned { float32(scroll) }
        else { float32(Math.Max(0.0, float64(n.ScrollTargetY) + scroll - float64(n.ScrollY))) }
        hasPending = true
        return output
      } catch (error Exception) {
        Cancel()
        throw error
      }
    }

  private func AddRow(index int32, data VirtualRowMetadata[T], target VirtualWindow,
    build((T) -> Blob), sameBuilder bool) {
      let row = data.Row(index)
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
        output.Add(Container() {.Accessibility: Accessibility{Role: AccessibilityRole.ListItem, PositionInSet: index},.Key: row.Key,.Position: PositionType.Absolute,.Left: float64(placement.X),.Top: float64(placement.Y),.Width: float64(placement.W),.FlexShrink: 0.0,
            child,
        })
      }
    }

  private func Snapshot(items IReadOnlyList[T], estimate float32, key((T) -> string),
    width float32, gap float32, sameBuilder bool) VirtualRowMetadata[T]{
      let old = metadata
      var unchanged = old != nil && old.Count == items.Count && old.Width == width && old.Gap == gap && old.Estimate == estimate && sameBuilder
      if unchanged {
        let previous = old!!
        for i in 0 ... items.Count {
          let row = previous.Row(i)
          if !equality.Equals(row.Item, items[i]) || row.Key != key(items[i]) { unchanged = false
            break }
        }
        if unchanged { return previous }
      }
      let rows = [items.Count]VirtualRow[T]
      for i in 0 ... items.Count {
        let item = items[i]
        let id = key(item)
        var row = VirtualRow[T]{Item: item, Key: id, Height: estimate}
        if let previous = old {
          if previous.Width == width && previous.TryIndex(id, out var index) {
            let retained = previous.Row(index)
            // Keep the last height as an estimate while changed content is remeasured.
            row.Height = retained.Height
            row.Measured = retained.Measured && sameBuilder && equality.Equals(retained.Item, item)
          }
        }
        rows[i] = row
      }
      return VirtualRowMetadata[T](rows, width, gap, estimate)
    }

  // Applies a log window's change to the current rows in place: drops the entries that left its start and
  // appends the entries added at its end. Returns nil when the rows cannot be updated that way.
  private func AppendLog(old VirtualRowMetadata[T]?, items IReadOnlyList[T], start int64, estimate float32,
    key((T) -> string), width float32, gap float32, sameBuilder bool) VirtualRowMetadata[T]?{
      guard let data = old else { return nil }
      let end = start + int64(items.Count)
      if !logged || !sameBuilder || data.Width != width || data.Gap != gap || data.Estimate != estimate
        || start < logStart || end < logEnd || int64(data.Count) != logEnd - logStart {
          return nil
        }
      let dropped = int32(Math.Min(start - logStart, int64(data.Count)))
      let first = int32(Math.Max(logEnd, start) - start)
      // Check every new key before changing anything, so a failed build leaves the rows intact.
      let added = [items.Count - first]VirtualRow[T]
      let seen = HashSet[string](added.Length, StringComparer.Ordinal)
      for i in 0 ... added.Length {
        let item = items[first + i]
        let id = key(item)
        if String.IsNullOrEmpty(id) || !seen.Add(id) { throw InvalidOperationException("VirtualRows keys must be nonempty and unique across the collection") }
        if data.Contains(id) {
          if !data.TryIndex(id, out var position) || position >= dropped { throw InvalidOperationException("VirtualRows keys must be nonempty and unique across the collection") }
        }
        added[i] = VirtualRow[T]{Item: item, Key: id, Height: estimate}
      }
      data.DropFirst(dropped)
      for row in added { data.Append(row) }
      return data
    }

  private func Prefix(data VirtualRowMetadata[T], count int32, pending bool) float64 {
    var result = data.Prefix(count)
    if pending {
      for i in 0 ... measurements.Count {
        let value = measurements[i]
        if value.Index < count { result += float64(value.Height) - float64(data.Row(value.Index).Height) }
      }
    }
    return result
  }

  private func AnchorIndex(data VirtualRowMetadata[T], scroll float32) int32 {
    // Match the float32 coordinates used by layout and ScrollToItem at exact row boundaries.
    var low = 0
    var high = data.Count - 1
    while low < high {
      let middle = low + (high - low + 1) / 2
      let top = float32(float64(window.OriginY) + data.Prefix(middle))
      if top <= scroll { low = middle }
      else { high = middle - 1 }
    }
    return low
  }

  private func Find(data VirtualRowMetadata[T], offset float64, pending bool) int32 {
    if !pending || measurements.Count == 0 { return data.Find(offset) }
    var low = 0
    var high = data.Count
    while low < high {
      let middle = low + (high - low + 1) / 2
      if Prefix(data, middle, true) <= offset { low = middle }
      else { high = middle - 1 }
    }
    return Math.Min(low, Math.Max(0, data.Count - 1))
  }

  private func Window(n Node, data VirtualRowMetadata[T], scroll float64, pending bool) VirtualWindow {
    let height = BoxGeometry.ViewportHeight(n)
    let x = BoxGeometry.ContentLeft(n) - n.Rect.X
    let y = BoxGeometry.ContentTop(n) - n.Rect.Y
    let count = data.Count
    let start = if count == 0 { 0 } else { Math.Max(0, Find(data, Math.Max(0.0, scroll - float64(y)), pending) - 2) }
    let end = if count == 0 { 0 } else { Math.Min(count, Find(data, Math.Max(0.0, scroll + float64(height) - float64(y)), pending) + 3) }
    let total = Math.Max(0.0, Prefix(data, count, pending) - (if count > 0 { float64(data.Gap) } else { 0.0 }))
    let contentHeight = float64(y) + total + float64(Math.Max(0.0F, n.Rect.H - height - y))
    if !Double.IsFinite(contentHeight) || contentHeight > float64(Single.MaxValue) { throw InvalidOperationException("VirtualRows content extent exceeds finite layout coordinates") }
    return VirtualWindow{Start: start, Count: Math.Max(0, end - start), ContentW: x + data.Width,
      ContentH: float32(contentHeight), OriginX: x, OriginY: y, ItemW: data.Width,
      ItemH: height, RowGap: data.Gap, Direction: FlexDirection.Column, Wrap: FlexWrap.NoWrap}
  }

  private func Gap(n Node) float32 -> Math.Max(0.0F, virtualGap(n.RowGap, n.Gap, BoxGeometry.ViewportWidth(n)))

  private func NeedsMeasurement(child Node, data VirtualRowMetadata[T], out index int32, out height float32) bool {
    index = -1
    height = 0.0F
    guard let key = child.Key, let yoga = child.Yoga else { return false }
    if YGNodeAPI.YGNodeIsDirty(yoga) || !data.TryIndex(key, out index) { return false }
    height = child.Rect.H
    if !Single.IsFinite(height) || height < 0.0F { throw InvalidOperationException("Virtual row measured an invalid height") }
    let row = data.Row(index)
    return !row.Measured || Math.Abs(row.Height - height) > 0.01F
  }

  private func FocusedIndex(n Node, data VirtualRowMetadata[T]) int32 {
    for i in 0 ... n.Children.Count {
      let child = n.Children[i]
      if HasFocus(child) {
        guard let key = child.Key else { continue }
        if data.TryIndex(key, out var index) { return index }
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
      data.Measure(value.Index, value.Height)
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
