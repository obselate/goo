package Goo

import System
import System.Collections.Generic

internal class ElementHandleFixtures {
  func LifecycleContract() bool {
    let owner = Window{}
    let handle = ElementHandle{}
    let rec = Reconciler{ Res: Resolver{} }
    var node = mount(rec, owner, Container{ Handle: handle, Key: "item", Width: 20, Height: 10 })
    if !handle.IsMounted { return false }
    node = diff(rec, owner, node, Container{ Handle: handle, Key: "item", Width: 30, Height: 10 })
    if !handle.IsMounted { return false }
    node = diff(rec, owner, node, Text{ Handle: handle, Key: "item", Content: "replacement" })
    if !handle.IsMounted { return false }
    node = diff(rec, owner, node, Text{ Key: "item", Content: "without-handle" })
    if handle.IsMounted { return false }
    node = diff(rec, owner, node, Text{ Handle: handle, Key: "item", Content: "reattached" })
    if !handle.IsMounted { return false }
    NodeLifecycle.DisposeTree(node)
    if handle.IsMounted || handle.Focus() || handle.Blur() || handle.ScrollTo(0.0, 0.0)
      || handle.ScrollIntoView() {
        return false
      }
    node = mount(rec, owner, Text{ Handle: handle, Key: "item", Content: "remounted" })
    let remounted = handle.IsMounted
    NodeLifecycle.DisposeTree(node)
    return remounted && !handle.IsMounted
  }

  func GeometryContract() bool {
    let handle = ElementHandle{}
    let owner = Window{}
    let root = mount(Reconciler{ Res: Resolver{} }, owner, Container{
      Handle: handle, Width: 100, Height: 80, Padding: 10, BorderWidth: 2,
    })
    Layout().Calculate(root, 100.0F, 80.0F)
    let border = handle.BorderBox
    let content = handle.ContentBox
    NodeLifecycle.DisposeTree(root)
    return border.X == 0.0 && border.Y == 0.0 && border.Width == 100.0 && border.Height == 80.0
      && content.X == 12.0 && content.Y == 12.0 && content.Width == 76.0 && content.Height == 56.0
      && handle.BorderBox.Width == 0.0 && handle.ContentBox.Height == 0.0
  }

  func FocusContract() bool {
    let owner = Window{}
    let first = ElementHandle{}
    let second = ElementHandle{}
    let root = mount(Reconciler{ Res: Resolver{} }, owner, Container() {
        Container{ Handle: first, Focusable: true },
        Container{ Handle: second, Focusable: true},
    })
    let focused = first.Focus() && first.Blur() && second.Focus() && !first.Blur()
    NodeLifecycle.DisposeTree(root)
    return focused && !second.IsMounted
  }

  func ScrollContract() bool {
    let rootHandle = ElementHandle{}
    let innerHandle = ElementHandle{}
    let childHandle = ElementHandle{}
    let owner = Window{}
    let root = mount(Reconciler{ Res: Resolver{} }, owner, Container() {.Handle: rootHandle,.Width: 100,.Height: 100,.OverflowY: Overflow.Scroll,
        Container{ Height: 120 },
        Container() {.Handle: innerHandle,.Height: 80,.OverflowY: Overflow.Scroll,
          Container{ Handle: childHandle, Height: 130},
      },
    })
    Layout().Calculate(root, 100.0F, 100.0F)
    let inner = root.Children[1]
    if !innerHandle.ScrollTo(0.0, 50.0) || inner.ScrollTargetY != 50.0F
      || innerHandle.ScrollOffset.Y != 0.0 {
        return false
      }
    if !childHandle.ScrollIntoView() || inner.ScrollTargetY != 50.0F
      || root.ScrollTargetY != 100.0F {
        return false
      }
    if !childHandle.ScrollIntoView() || inner.ScrollTargetY != 50.0F
      || root.ScrollTargetY != 100.0F {
        return false
    }
    NodeLifecycle.DisposeTree(root)
    if rootHandle.ScrollTo(0.0, 0.0) { return false }
    let gutterTarget = ElementHandle{}
    let gutterRoot = mount(Reconciler{ Res: Resolver{} }, owner, Container{
      Width: 100, Height: 100, Overflow: Overflow.Scroll,
      Scrollbar: Scrollbar{ Thickness: 10, Inset: 0, ReserveSpace: true },
      Container{ Width: 200, Height: 200, FlexShrink: 0 },
      Container{
        Handle: gutterTarget, Position: PositionType.Absolute,
        Left: 85, Top: 85, Width: 10, Height: 10,
      },
    })
    Layout().Calculate(gutterRoot, 100.0F, 100.0F)
    let visible = gutterTarget.ScrollIntoView()
      && gutterRoot.ScrollTargetX == 5.0F && gutterRoot.ScrollTargetY == 5.0F
    NodeLifecycle.DisposeTree(gutterRoot)
    return visible
  }

  func DuplicateAndCellContract() bool {
    let owner = Window{}
    let duplicate = ElementHandle{}
    let rec = Reconciler{ Res: Resolver{} }
    var rejected = false
    try {
      mount(rec, owner, Container() {
        Text{ Handle: duplicate, Content: "first" },
        Text{ Handle: duplicate, Content: "second" },})
    } catch (error InvalidOperationException) {
      rejected = true
    }
    if !rejected || duplicate.IsMounted { return false }

    let rootHandle = ElementHandle{}
    let child = ElementHandle{}
    let existing = mount(rec, owner, Text{ Handle: rootHandle, Content: "existing" })
    rejected = false
    try {
      mount(rec, owner, Container() {.Handle: rootHandle, Text{ Handle: child, Content: "provisional" },})
    } catch (error InvalidOperationException) {
      rejected = true
    }
    if !rejected || !rootHandle.IsMounted || child.IsMounted {
      return false
    }
    NodeLifecycle.DisposeTree(existing)
    if rootHandle.IsMounted { return false }

    let nested = ElementHandle{}
    ElementHandleNestedCell.Target = nested
    let root = mount(rec, owner, Container() {
      Cell.Mount[ElementHandleNestedCell]("nested", nil),
    })
    let retained = nested.IsMounted
    NodeLifecycle.DisposeTree(root)
    ElementHandleNestedCell.Target = nil
    return retained && !nested.IsMounted
  }

  func PrimitiveMatrixContract() bool {
    let owner = Window{}
    let rec = Reconciler{ Res: Resolver{} }
    let button = ElementHandle{}
    let entry = ElementHandle{}
    let editor = ElementHandle{}
    let shape = ElementHandle{}
    let image = ElementHandle{}
    var node = mount(rec, owner, Button{ Handle: button })
    if !button.IsMounted { return false }
    NodeLifecycle.DisposeTree(node)
    node = mount(rec, owner, TextEntry{ Handle: entry })
    if !entry.IsMounted { return false }
    NodeLifecycle.DisposeTree(node)
    let document = TextDocument{}
    node = mount(rec, owner, TextEditor(TextEditorController(document)) {
      Handle = editor,
    })
    if !editor.IsMounted { return false }
    NodeLifecycle.DisposeTree(node)
    node = mount(rec, owner, Shape{ Handle: shape })
    if !shape.IsMounted { return false }
    NodeLifecycle.DisposeTree(node)
    node = mount(rec, owner, Image{ Handle: image })
    if !image.IsMounted { return false }
    NodeLifecycle.DisposeTree(node)
    return !button.IsMounted && !entry.IsMounted && !editor.IsMounted
      && !shape.IsMounted && !image.IsMounted
  }

  func RetiredTreeDoesNotRetainThroughHandle() bool {
    let handle = ElementHandle{}
    let weak = makeRetiredTree(handle)
    for i in 0 ... 3 {
      GC.Collect()
      GC.WaitForPendingFinalizers()
      GC.Collect()
      if !weak.IsAlive { return !handle.IsMounted }
    }
    return false
  }

  func NoHandleDiffBytes() int64 {
    let rec = Reconciler{ Res: Resolver{} }
    let blob = Container() {.Width: 100,.Height: 40, Text{ Content: "stable" },}
    let root = rec.Mount(blob)
    rec.Diff(root, blob)
    let before = GC.GetAllocatedBytesForCurrentThread()
    rec.Diff(root, blob)
    let bytes = GC.GetAllocatedBytesForCurrentThread() - before
    NodeLifecycle.DisposeTree(root)
    return bytes
  }

  func MetricsContract() bool {
    let cell = ElementMetricsFixtureCell{}
    let window = Window{ Root: cell, Width: 100, Height: 60 }
    let snapshots = List[ElementMetrics]()
    cell.Handle.MetricsChanged += func(value ElementMetrics) {
      snapshots.Add(value)
    }
    window.UpdateTree()
    if snapshots.Count != 1 {
      return false
    }
    let initial = snapshots[0]
    if !initial.IsMounted || initial.BorderBox.Width != 100.0 || initial.BorderBox.Height != 60.0
      || initial.ScrollOffset.Y != 0.0 {
        return false
      }
    window.UpdateTree()
    if snapshots.Count != 1 {
      return false
    }
    cell.Width = 120
    cell.Rebuild()
    window.UpdateTree()
    if snapshots.Count != 2 || snapshots[1].BorderBox.Width != 120.0 {
      return false
    }
    if !cell.Handle.ScrollTo(0.0, 40.0) {
      return false
    }
    window.UpdateTree(1.0)
    if snapshots.Count != 3 || snapshots[2].ScrollOffset.Y != 40.0 {
      return false
    }
    cell.Attached = false
    cell.Rebuild()
    window.UpdateTree()
    return snapshots.Count == 4 && !snapshots[3].IsMounted
  }

  func MetricsCallbackRebuildAndBatchContract() bool {
    let cell = ElementMetricsPairCell{}
    let window = Window{ Root: cell, Width: 100, Height: 60 }
    var firstCount int32
    var secondCount int32
    var subscribed bool
    cell.First.MetricsChanged += func(value ElementMetrics) {
      firstCount = firstCount + 1
      cell.Width = 140
      cell.Rebuild()
      if !subscribed {
        subscribed = true
        cell.Second.MetricsChanged += func(next ElementMetrics) {
          secondCount = secondCount + 1
        }
      }
    }
    window.UpdateTree()
    if firstCount != 1 || secondCount != 0 {
      return false
    }
    window.UpdateTree()
    return firstCount == 2 && secondCount == 1
  }

  func MetricsCloseContract() bool {
    let cell = ElementMetricsFixtureCell{}
    let window = Window{ Root: cell, Width: 100, Height: 60 }
    let snapshots = List[ElementMetrics]()
    cell.Handle.MetricsChanged += func(value ElementMetrics) {
      snapshots.Add(value)
    }
    window.UpdateTree()
    window.Close()
    return snapshots.Count == 2 && snapshots[0].IsMounted && !snapshots[1].IsMounted
  }

  func VirtualContract() bool {
    let cell = VirtualFixtureCell(1000, false)
    let semantics = AccessibilityTestAdapter{}
    let window = Window{ Root: cell, Width: 100, Height: 60 }
    window.AccessibilityAdapter = semantics
    window.UpdateTree()
    guard let root = window.Tree else { return false }
    let listInvalid = root.Children.Count <= 0 || root.Children.Count > 5
      || cell.Builds.Count > 5 || cell.Handle.ScrollRange.Y != 19940.0
      || !cell.Handles[0].IsMounted || semantics.Tree?.Root?.SizeOfSet != 1000
      || semantics.Tree?.Root?.Children[0].PositionInSet != 0
    if listInvalid {
      return false
    }

    cell.Builds.Clear()
    window.UpdateTree()
    if cell.Builds.Count != 0 { return false }
    if !cell.Handle.JumpTo(0.0, 10000.0) { return false }
    window.UpdateTree()
    let movedInvalid = root.Children.Count <= 0 || root.Children.Count > 5
      || cell.Builds.Count > 5 || cell.Handles[0].IsMounted
      || !cell.Handles[500].IsMounted || semantics.Tree?.Root?.Children[0].PositionInSet != 499
    if movedInvalid {
      return false
    }

    cell.Builds.Clear()
    cell.Items[500] = VirtualFixtureItem{ Id: 500, Revision: 1 }
    cell.Rebuild()
    window.UpdateTree()
    if cell.Builds.Count != 1 || cell.Builds[0] != 500 { return false }
    cell.Items.Add(VirtualFixtureItem{ Id: 1000 })
    window.UpdateTree()
    if cell.Handle.ScrollRange.Y != 19960.0 || semantics.Tree?.Root?.SizeOfSet != 1001 { return false }
    window.Close()
    if Virtualization.State(root) != nil || cell.Handles[500].IsMounted { return false }

    let gridCell = VirtualFixtureCell(1000, true)
    let gridWindow = Window{ Root: gridCell, Width: 100, Height: 60 }
    gridWindow.UpdateTree()
    guard let gridRoot = gridWindow.Tree else { return false }
    if gridRoot.Children.Count <= 0 || gridRoot.Children.Count > 25
      || gridCell.Builds.Count > 25 || gridCell.Handle.ScrollRange.Y != 3940.0 {
        return false
      }
    if !gridCell.Handle.JumpTo(0.0, 2000.0) { return false }
    gridCell.Builds.Clear()
    gridWindow.UpdateTree()
    let gridBounded = gridRoot.Children.Count > 0 && gridRoot.Children.Count <= 25
      && gridCell.Builds.Count <= 25 && gridCell.Handles[500].IsMounted
    gridWindow.Close()
    return gridBounded && Virtualization.State(gridRoot) == nil
  }

  func VirtualRowsContract() bool {
    let cell = VirtualRowsFixtureCell(1000)
    let semantics = AccessibilityTestAdapter{}
    let window = Window{ Root: cell, Width: 100, Height: 60 }
    window.AccessibilityAdapter = semantics
    window.UpdateTree()
    guard let root = window.Tree else { return false }
    if root.Children.Count <= 0 || root.Children.Count > 8 || cell.Builds.Count > 8
      || cell.Handle.ScrollRange.Y != 19940.0 || !cell.Handles[0].IsMounted { return false }
    if !cell.Handle.JumpTo(0.0, 10000.0) { return false }
    window.UpdateTree()
    if !cell.Handles[500].IsMounted || cell.Handles[0].IsMounted { return false }
    cell.Builds.Clear()
    cell.Items[501] = VirtualFixtureItem{ Id: 501, Revision: 1 }
    cell.Rebuild()
    window.UpdateTree()
    if cell.Builds.Count != 1 || cell.Builds[0] != 501 { return false }
    cell.Items.Add(VirtualFixtureItem{ Id: 1000 })
    cell.Rebuild()
    window.UpdateTree()
    let grown = cell.Handle.ScrollRange.Y == 19960.0 && cell.Handles[500].IsMounted
      && semantics.Tree?.Root?.SizeOfSet == 1001
    window.Close()
    return grown && Virtualization.State(root) == nil
  }

  func VirtualRowsDroppedAnchorShowsOldestContract() bool {
    let cell = VirtualRowsFixtureCell(1000)
    let window = Window{ Root: cell, Width: 100, Height: 60 }
    window.UpdateTree()
    if !cell.Handle.JumpTo(0.0, 10010.0) { return false }
    window.UpdateTree()
    if !cell.Handles[500].IsMounted { return false }

    // The reader's row and every row before it leave the list, so the oldest remaining row takes its place.
    cell.Items.RemoveRange(0, 600)
    for id in 1000 ... 1600 { cell.Items.Add(VirtualFixtureItem{ Id: id }) }
    cell.Rebuild()
    window.UpdateTree()
    let oldest = cell.Handles[600].IsMounted && cell.Handle.ScrollOffset.Y == 10.0
    window.Close()
    return oldest
  }

  func VirtualRowsPinsToBottomContract() bool {
    let cell = VirtualRowsFixtureCell(1000)
    cell.Pin = true
    let window = Window{ Root: cell, Width: 100, Height: 60 }
    window.SmoothScrolling = false
    window.UpdateTree()
    if cell.Handle.ScrollOffset.Y != 19940.0 || !cell.Handles[999].IsMounted { return false }

    // Dropping and appending rows keeps a pinned list at its end.
    cell.Items.RemoveRange(0, 10)
    for id in 1000 ... 1010 { cell.Items.Add(VirtualFixtureItem{ Id: id }) }
    cell.Rebuild()
    window.UpdateTree()
    if cell.Handle.ScrollOffset.Y != 19940.0 || !cell.Handles[1009].IsMounted { return false }

    // A reader who scrolls back stays on their rows while the list changes.
    if !cell.Handle.ScrollTo(0.0, 5000.0) { return false }
    window.UpdateTree(0.016)
    if cell.Handle.ScrollOffset.Y != 5000.0 { return false }
    cell.Items.RemoveRange(0, 10)
    for id in 1010 ... 1020 { cell.Items.Add(VirtualFixtureItem{ Id: id }) }
    cell.Rebuild()
    window.UpdateTree()
    if cell.Handle.ScrollOffset.Y != 4800.0 { return false }

    // Returning to the end pins the list again.
    if !cell.Handle.JumpTo(0.0, 19940.0) { return false }
    window.UpdateTree()
    cell.Items.RemoveRange(0, 10)
    for id in 1020 ... 1030 { cell.Items.Add(VirtualFixtureItem{ Id: id }) }
    cell.Rebuild()
    window.UpdateTree()
    if cell.Handle.ScrollOffset.Y != 19940.0 || !cell.Handles[1029].IsMounted { return false }

    // A list that empties after the reader scrolled back follows its new rows.
    if !cell.Handle.JumpTo(0.0, 0.0) { return false }
    window.UpdateTree()
    cell.Items.Clear()
    cell.Rebuild()
    window.UpdateTree()
    for id in 1030 ... 1100 { cell.Items.Add(VirtualFixtureItem{ Id: id }) }
    cell.Rebuild()
    window.UpdateTree()
    let pinned = cell.Handle.ScrollOffset.Y == 1340.0 && cell.Handles[1099].IsMounted
    window.Close()
    return pinned
  }

  func VirtualRowsShiftContract() bool {
    let cell = VirtualRowsFixtureCell(1000)
    let window = Window{ Root: cell, Width: 100, Height: 60 }
    window.UpdateTree()
    guard let root = window.Tree else { return false }
    if cell.Handle.ScrollRange.Y != 19940.0 || !cell.Handles[0].IsMounted { return false }
    if !cell.Handle.JumpTo(0.0, 10000.0) { return false }
    window.UpdateTree()
    if !cell.Handles[500].IsMounted { return false }

    // Dropping ten entries and adding ten keeps the same rows in view without rebuilding them, and reads
    // keys only for the added entries.
    cell.Builds.Clear()
    cell.KeyCalls = 0
    cell.Items.RemoveRange(0, 10)
    for id in 1000 ... 1010 { cell.Items.Add(VirtualFixtureItem{ Id: id }) }
    cell.Rebuild()
    window.UpdateTree()
    if cell.KeyCalls != 10 || cell.Builds.Count != 0 || !cell.Handles[500].IsMounted
      || cell.Handle.ScrollRange.Y != 19940.0 || cell.Handle.ScrollOffset.Y != 9800.0 { return false }

    // A list that keeps no retained row replaces them all.
    cell.Items.Clear()
    for id in 1500 ... 1503 { cell.Items.Add(VirtualFixtureItem{ Id: id }) }
    cell.Rebuild()
    window.UpdateTree()
    if cell.Handle.ScrollRange.Y != 0.0 || !cell.Handles[1500].IsMounted || cell.Handles[500].IsMounted { return false }

    // Appending past the slot capacity compacts the rows, and the newest entry is still reachable by key.
    for id in 1503 ... 1600 {
      cell.Items.Add(VirtualFixtureItem{ Id: id })
      cell.Rebuild()
      window.UpdateTree()
    }
    if cell.Handle.ScrollRange.Y != 1940.0 || !cell.Handle.ScrollToItem("row-1599") { return false }
    window.UpdateTree()
    if !cell.Handles[1599].IsMounted || cell.Handle.ScrollOffset.Y != 1940.0 { return false }

    // A repeated key fails the build and leaves the rows usable.
    cell.Items.Add(VirtualFixtureItem{ Id: 1599 })
    cell.Rebuild()
    var rejected = false
    try { window.UpdateTree() } catch (error InvalidOperationException) { rejected = true }
    cell.Items.RemoveAt(cell.Items.Count - 1)
    cell.Items.Add(VirtualFixtureItem{ Id: 1600 })
    cell.Rebuild()
    window.UpdateTree()
    if !rejected || cell.Handle.ScrollRange.Y != 1960.0 { return false }

    // A list that restores earlier rows rebuilds the rows instead.
    cell.Items.Clear()
    for id in 0 ... 5 { cell.Items.Add(VirtualFixtureItem{ Id: id }) }
    cell.Rebuild()
    window.UpdateTree()
    let rebuilt = cell.Handle.ScrollRange.Y == 40.0 && cell.Handles[0].IsMounted
    window.Close()
    return rebuilt && Virtualization.State(root) == nil
  }

  func VirtualExtentValidationContract() bool {
    let items = List[int32]()
    var zeroRejected = false
    var nonFiniteRejected = false
    var overflowRejected = false
    try {
      Virtual(items, 0.0, 20.0,
        (item int32) -> item.ToString(), (item int32) -> Container{})
    } catch (error ArgumentOutOfRangeException) {
      zeroRejected = error.ParamName == "itemWidth"
    }
    try {
      Virtual(items, 20.0, Double.NaN,
        (item int32) -> item.ToString(), (item int32) -> Container{})
    } catch (error ArgumentOutOfRangeException) {
      nonFiniteRejected = error.ParamName == "itemHeight"
    }
    try {
      Virtual(items, Double.MaxValue, 20.0,
        (item int32) -> item.ToString(), (item int32) -> Container{})
    } catch (error ArgumentOutOfRangeException) {
      overflowRejected = error.ParamName == "itemWidth"
    }
    return zeroRejected && nonFiniteRejected && overflowRejected
  }

  func HandleNoSubscriptionDiffBytes() int64 {
    let handle = ElementHandle{}
    let rec = Reconciler{ Res: Resolver{} }
    let blob = Container{ Handle: handle, Width: 100, Height: 40 }
    let root = rec.Mount(blob)
    rec.Diff(root, blob)
    let before = GC.GetAllocatedBytesForCurrentThread()
    rec.Diff(root, blob)
    let bytes = GC.GetAllocatedBytesForCurrentThread() - before
    NodeLifecycle.DisposeTree(root)
    return bytes
  }

  func HandleNoSubscriptionFrameBytes() int64 {
    let cell = ElementMetricsFixtureCell{}
    let window = Window{ Root: cell, Width: 100, Height: 60 }
    window.UpdateTree()
    let before = GC.GetAllocatedBytesForCurrentThread()
    window.UpdateTree()
    let bytes = GC.GetAllocatedBytesForCurrentThread() - before
    window.Close()
    return bytes
  }

  func MetricsNotificationBytes() int64 {
    let cell = ElementMetricsFixtureCell{}
    let window = Window{ Root: cell, Width: 100, Height: 60 }
    cell.Handle.MetricsChanged += func(value ElementMetrics) {
    }
    window.UpdateTree()
    cell.Handle.ScrollTo(0.0, 20.0)
    window.UpdateTree(1.0)
    cell.Handle.ScrollTo(0.0, 40.0)
    let before = GC.GetAllocatedBytesForCurrentThread()
    window.UpdateTree(1.0)
    let bytes = GC.GetAllocatedBytesForCurrentThread() - before
    window.Close()
    return bytes
  }

  func KeyedRollbackRestoresHandle() bool {
    let handle = ElementHandle{}
    ElementHandleRollbackCell.Target = handle
    let owner = Window{}
    let rec = Reconciler{ Res: Resolver{} }
    let root = mount(rec, owner, Container() {
      Cell.Mount[ElementHandleRollbackCell]("a", nil),
      Text{ Key: "b", Content: "stable" },})
    if !handle.IsMounted { return false }
    var rejected = false
    try {
      diff(rec, owner, root, Container() {
        Text{ Key: "a", Handle: handle, Content: "replacement" },
        Text{ Key: "b", Handle: handle, Content: "duplicate" },
      })
    } catch (error InvalidOperationException) {
      rejected = true
    }
    let restored = rejected && handle.IsMounted
    NodeLifecycle.DisposeTree(root)
    ElementHandleRollbackCell.Target = nil
    return restored && !handle.IsMounted
  }

  func KeyedSiblingMoveContract() bool {
    let owner = Window{}
    let handle = ElementHandle{}
    let rec = Reconciler{ Res: Resolver{} }
    var root = mount(rec, owner, Container() {
      Text{ Key: "owner", Handle: handle, Content: "owner" },
      Text{ Key: "receiver", Content: "receiver" },
    })
    root = diff(rec, owner, root, Container() {
      Text{ Key: "receiver", Handle: handle, Content: "receiver" },
      Text{ Key: "owner", Content: "owner" },
      })
    let moved = handle.IsMounted && ElementHandles.Owns(root.Children[0], handle)
      && !ElementHandles.Owns(root.Children[1], handle)
    NodeLifecycle.DisposeTree(root)
    return moved && !handle.IsMounted
  }

  func OwnerScopeFailureContract() bool {
    let duplicate = ElementHandle{}
    ElementHandleFailureCell.Target = duplicate
    let window = Window{ Root: ElementHandleFailureCell{} }
    var rejected = false
    try {
      window.UpdateTree()
    } catch (error InvalidOperationException) {
      rejected = true
    }
    ElementHandleFailureCell.Target = nil
    let probe = ElementHandle{}
    let node = Reconciler{ Res: Resolver{} }.Mount(Container{ Handle: probe, Focusable: true })
    let leaked = probe.Focus()
    NodeLifecycle.DisposeTree(node)
    return rejected && !leaked
  }

  private func mount(rec Reconciler, owner Window, b Blob) Node ->
  Reconciler{Res: rec.Res, Owner: owner}.Mount(b)

  private func diff(rec Reconciler, owner Window, n Node, b Blob) Node ->
  Reconciler{Res: rec.Res, Owner: owner}.Diff(n, b)

  private func makeRetiredTree(handle ElementHandle) WeakReference {
    let owner = Window{}
    let root = mount(Reconciler{ Res: Resolver{} }, owner, Container() {.Handle: handle, Text{ Content: "retired"},
    })
    let weak = WeakReference(root)
    NodeLifecycle.DisposeTree(root)
    return weak
  }
}

internal class ElementHandleNestedCell : Cell {
  shared { var Target ElementHandle? }

  override func Build() Blob -> Text { Handle: Target, Content: "nested" }
}

internal class ElementHandleRollbackCell : Cell {
  shared { var Target ElementHandle? }

  override func Build() Blob -> Text { Handle: Target, Content: "rollback" }
}

internal class ElementHandleFailureCell : Cell {
  shared { var Target ElementHandle? }

  override func Build() Blob -> Container() {
    Text{ Handle: Target, Content: "first" },
    Text{ Handle: Target, Content: "second" },
  }
}

internal class ElementMetricsFixtureCell : Cell {
  internal let Handle ElementHandle
  internal var Width int32
  internal var Attached bool

  init() {
    Handle = ElementHandle{}
    Width = 100
    Attached = true
  }

  override func Build() Blob {
    if !Attached {
      return Container{ Width: Width, Height: 60 }
    }
    return Container() {.Handle: Handle,.Width: Width,.Height: 60,.OverflowY: Overflow.Scroll,
      Container{ Height: 200 },
    }
  }
}

internal class ElementMetricsPairCell : Cell {
  internal let First ElementHandle
  internal let Second ElementHandle
  internal var Width int32

  init() {
    First = ElementHandle{}
    Second = ElementHandle{}
    Width = 100
  }

  override func Build() Blob -> Container() {
    Container{ Handle: First, Width: Width, Height: 30 },
    Container{ Handle: Second, Width: 100, Height: 30 },
  }
}

internal class VirtualFixtureCell : Cell {
  internal let Items List[VirtualFixtureItem]
  internal let Builds List[int32]
  internal let Handles List[ElementHandle]
  internal let Handle ElementHandle
  private let grid bool

  init(count int32, isGrid bool) {
    Items = List[VirtualFixtureItem]()
    Builds = List[int32]()
    Handles = List[ElementHandle]()
    Handle = ElementHandle{}
    grid = isGrid
    for i in 0 ... count {
      Items.Add(VirtualFixtureItem{ Id: i })
      Handles.Add(ElementHandle{})
    }
  }

  override func Build() Blob {
    if grid {
      return Virtual(
        Items,
        20.0,
        20.0,
        (item VirtualFixtureItem) -> "row-${item.Id}",
        (item VirtualFixtureItem) -> buildItem(item)) {
          Handle = Handle,
          Width = 100,
          Height = 60,
          FlexDirection = FlexDirection.Row,
          FlexWrap = FlexWrap.Wrap,
        }
    }
    return Virtual(
      Items,
      100.0,
      20.0,
      (item VirtualFixtureItem) -> "row-${item.Id}",
      (item VirtualFixtureItem) -> buildItem(item)) {
        Handle = Handle,
        Width = 100,
        Height = 60,
      }
  }

  private func buildItem(item VirtualFixtureItem) Blob {
    Builds.Add(item.Id)
    return Container() {.Handle: Handles[item.Id],.Width: grid ? 17 : 75,.Height: 13,
      Text{ Content: "row ${item.Id}:${item.Revision}"},
    }
  }
}

internal data struct VirtualFixtureItem {
  internal var Id int32
  internal var Revision int32
}

internal class VirtualRowsFixtureCell : Cell {
  internal let Items List[VirtualFixtureItem]
  internal let Builds List[int32]
  internal let Handles List[ElementHandle]
  internal let Handle ElementHandle
  internal var KeyCalls int32
  internal var Pin bool
  private let key((VirtualFixtureItem) -> string)
  private let build((VirtualFixtureItem) -> Blob)

  init(count int32) {
    Items = List[VirtualFixtureItem]()
    Builds = List[int32]()
    Handles = List[ElementHandle]()
    Handle = ElementHandle{}
    for i in 0 ... count { Items.Add(VirtualFixtureItem{ Id: i }) }
    for i in 0 ... 2000 { Handles.Add(ElementHandle{}) }
    key = (item VirtualFixtureItem) -> {
      KeyCalls++
      return "row-${item.Id}"
    }
    build = (item VirtualFixtureItem) -> {
      Builds.Add(item.Id)
      return Container() {.Handle: Handles[item.Id],.Width: 75,.Height: 20,
        Text{ Content: "row ${item.Id}:${item.Revision}"},
      }
    }
  }

  override func Build() Blob -> VirtualRows(Items, 20.0, key, build, Pin) { Handle = Handle, Width = 100, Height = 60 }
}
