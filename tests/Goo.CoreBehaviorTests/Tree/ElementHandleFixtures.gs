package Goo

import System
import System.Collections.Generic

internal class ElementHandleFixtures {
  func ScrollToItemWithoutPresentationContract() bool {
    using let host = ElementHandleEmbeddedHost()
    host.Resize(100, 60, 100, 60)
    let cell = VirtualFixtureCell(1000)
    let window = Window{Root: cell}
    window.Attach(host)
    host.RenderFrame(0.016)
    if !cell.Handle.ScrollToItem("row-30") { return false }
    host.RenderFrame(0.016)
    if !cell.Handles[30].IsMounted || cell.Handles[0].IsMounted { return false }
    cell.Handle.JumpTo(0.0, 4000.0)
    host.RenderFrame(0.016)
    return cell.Handles[200].IsMounted && !cell.Handles[30].IsMounted
  }

  func DeferredVirtualScrollContract() bool {
    let cell = VirtualFixtureCell(1000)
    let window = Window{Root: cell, Width: 100, Height: 60}
    try {
      window.UpdateTree()
      cell.Builds.Clear()
      for offset in []float64{4000.0, 8000.0, 4000.0} {
        cell.Handle.JumpTo(0.0, offset)
        window.UpdateTree(0.01, 0.0, false)
        if cell.Builds.Count != 0 || !cell.Handles[0].IsMounted { return false }
      }
      window.UpdateTree(0.01, 0.01, true)
      if cell.Builds.Count != 5 || !cell.Handles[200].IsMounted || cell.Handles[0].IsMounted { return false }
      cell.Builds.Clear()
      cell.Handle.JumpTo(0.0, 12000.0)
      window.UpdateTree(0.01, 0.0, false)
      if cell.Builds.Count != 0 { return false }
      window.PlatformInput.PointerWheel(5.0F, 5.0F, 0.0F, -3.0F, KeyModifiers{})
      if cell.Builds.Count != 0 { return false }
      let bounds = cell.Handle.BorderBox
      if bounds.Height != 60.0 || cell.Builds.Count != 5 || !cell.Handles[600].IsMounted { return false }
      cell.Builds.Clear()
      cell.Handle.JumpTo(0.0, 16000.0)
      window.UpdateTree(0.01, 0.0, false)
      if cell.Builds.Count != 0 { return false }
      window.PlatformInput.PointerPress(0L, PointerDevice.Mouse, 5.0F, 5.0F,
        PointerButton.Primary, KeyModifiers{}, 1.0F)
      if cell.Builds.Count != 5 || cell.Handles[800].AttachedNode()?.Focused != true { return false }
      cell.Builds.Clear()
      cell.Items[800] = VirtualFixtureItem{Id: 800, Revision: 1}
      cell.Rebuild()
      window.UpdateTree(0.01, 0.0, false)
      if cell.Builds.Count != 1 || cell.Builds[0] != 800 { return false }
      cell.Handle.JumpTo(0.0, 18000.0)
      window.UpdateTree(0.01, 0.0, false)
      window.Close()
      window.FlushDeferredVirtualization()
      return cell.Disposes == 1 && !cell.Handles[800].IsMounted && window.Tree == nil
    } finally { window.Close() }
  }

  func ThrowingVirtualDisposalContract() bool {
    let node = Node{}
    let owner = VirtualNodeState()
    let first = ThrowingVirtualFixtureState{ Fail: true }
    let second = ThrowingVirtualFixtureState{}
    owner.Prepare(node, ThrowingVirtualFixtureSource{ Value: first }, false)
    owner.Commit()
    owner.Prepare(node, ThrowingVirtualFixtureSource{ Value: second }, false)
    try {
      owner.Commit()
      return false
    } catch (error InvalidOperationException) {
      if error != first.Failure { return false }
    }
    owner.Cancel()
    if second.Commits != 1 || second.Disposals != 0 { return false }
    owner.Dispose()
    if second.Disposals != 1 { return false }
    let parent = Node{}
    let child = Node{ Parent: parent }
    let sibling = Node{ Parent: parent }
    parent.Children.Add(child)
    parent.Children.Add(sibling)
    let attached = Virtualization.Configure(parent)
    attached.Prepare(parent, ThrowingVirtualFixtureSource{ Value: first }, false)
    attached.Commit()
    var failed = false
    try { NodeLifecycle.DisposeTree(parent) } catch (error InvalidOperationException) {
      failed = error == first.Failure
    }
    return failed && child.Retired && sibling.Retired && Virtualization.State(parent) == nil
  }

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

  func NestedScrollIntoViewKeepsTargetBounds() bool {
    for start in []float32{ 0.0F, 463.0F } {
      let target = ElementHandle{}
      let owner = Window{}
      let root = mount(Reconciler{ Res: Resolver{} }, owner, Container{
        Width: 387, Height: 100, OverflowY: Overflow.Scroll,
        Container{ Height: 120, FlexShrink: 0 },
        Container{ Width: 387, Height: 80, FlexShrink: 0, OverflowX: Overflow.Scroll,
          Container{ Width: 850, Height: 80, FlexShrink: 0, OverflowY: Overflow.Scroll,
            Container{ Height: 500, FlexShrink: 0 },
            TextEntry{ Handle: target, Width: 126, Height: 20, MarginStart: 250, FlexShrink: 0 },
          },
        },
        Container{ Height: 600, FlexShrink: 0 },
      })
      let layout = Layout()
      layout.Calculate(root, 387.0F, 100.0F)
      let horizontal = root.Children[1]
      let body = horizontal.Children[0]
      let entry = body.Children[1]
      ScrollState.To(horizontal, start, 0.0F, true)
      layout.RefreshRects(root)
      let expectedX = start == 0.0F ? 0.0F : 250.0F
      for repeat in 0 ... 2 {
        if !target.ScrollIntoView() || horizontal.ScrollTargetX != expectedX
          || body.ScrollTargetY != 440.0F || root.ScrollTargetY != 100.0F {
            return false
          }
      }
      ScrollState.To(body, 0.0F, body.ScrollTargetY, true)
      ScrollState.To(horizontal, horizontal.ScrollTargetX, 0.0F, true)
      ScrollState.To(root, 0.0F, root.ScrollTargetY, true)
      layout.RefreshRects(root)
      if entry.Rect.X < horizontal.Rect.X || entry.Rect.X + entry.Rect.W > horizontal.Rect.X + 387.0F
        || entry.Rect.Y < body.Rect.Y || entry.Rect.Y + entry.Rect.H > 100.0F
        || !target.ScrollIntoView() || horizontal.ScrollTargetX != expectedX {
          return false
        }
      NodeLifecycle.DisposeTree(root)
    }
    return true
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

  func MetricsScrollFollowerUpdatesRectsInSameFrame() bool {
    let cell = SynchronizedScrollFixtureCell()
    let window = Window{ Root: cell, Width: 120, Height: 60 }
    cell.Leader.MetricsChanged += (value ElementMetrics) -> {
      if value.IsMounted { cell.Follower.JumpTo(value.ScrollOffset.X, 0) }
    }
    try {
      window.UpdateTree()
      let initial = cell.LeaderChild.BorderBox.X
      if !cell.Leader.JumpTo(48, 0) || cell.LeaderChild.BorderBox.X != initial {
        return false
      }
      window.UpdateTree()
      if cell.FollowerChild.BorderBox.X != cell.LeaderChild.BorderBox.X {
        return false
      }
      cell.Leader.ScrollTo(192, 0)
      for frame in 0 ... 24 {
        window.UpdateTree(.016)
        if cell.Follower.ScrollOffset.X != cell.Leader.ScrollOffset.X
          || cell.FollowerChild.BorderBox.X != cell.LeaderChild.BorderBox.X {
          return false
        }
      }
      return cell.Leader.ScrollOffset.X > 190
    } finally {
      window.Close()
    }
  }

  func MetricsTailFollowContract() bool {
    let cell = ElementMetricsFixtureCell{}
    let window = Window{ Root: cell, Width: 100, Height: 60 }
    var follow = true
    var lastRange = -1.0
    cell.Handle.MetricsChanged += value -> {
      if !value.IsMounted { return }
      if follow && lastRange != value.ScrollRange.Y {
        cell.Handle.JumpTo(0, value.ScrollRange.Y)
      } else {
        follow = value.ScrollOffset.Y >= value.ScrollRange.Y - 0.5
      }
      lastRange = value.ScrollRange.Y
    }
    try {
      window.UpdateTree()
      if cell.Handle.ScrollOffset.Y != 140 { return false }
      cell.ContentHeight = 300
      cell.Rebuild()
      window.UpdateTree()
      if cell.Handle.ScrollOffset.Y != 240 { return false }
      cell.Handle.JumpTo(0, 100)
      window.UpdateTree()
      cell.ContentHeight = 400
      cell.Rebuild()
      window.UpdateTree()
      if follow || cell.Handle.ScrollOffset.Y != 100 { return false }
      cell.ContentHeight = 20
      cell.Rebuild()
      window.UpdateTree()
      cell.ContentHeight = 500
      cell.Rebuild()
      window.UpdateTree()
      return follow && cell.Handle.ScrollOffset.Y == 440
    } finally {
      window.Close()
    }
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
    let cell = VirtualFixtureCell(1000)
    let semantics = AccessibilityTestAdapter{}
    let window = Window{ Root: cell, Width: 100, Height: 60 }
    window.AccessibilityAdapter = semantics
    window.UpdateTree()
    guard let root = window.Tree else { return false }
    // Only the items that the state places are mounted, and the content size sets the scroll range.
    if root.Children.Count != 4 || cell.Builds.Count != 4 || cell.Handle.ScrollRange.Y != 19940.0
      || !cell.Handles[0].IsMounted || semantics.Tree?.Root?.SizeOfSet != 1000
      || semantics.Tree?.Root?.Children[0].Role != AccessibilityRole.ListItem
      || semantics.Tree?.Root?.Children[0].PositionInSet != 0 { return false }

    // A frame without a change builds nothing.
    cell.Builds.Clear()
    window.UpdateTree()
    if cell.Builds.Count != 0 { return false }

    // A scroll realizes the new items in the same frame.
    if !cell.Handle.JumpTo(0.0, 10000.0) { return false }
    window.UpdateTree()
    if root.Children.Count != 5 || cell.Builds.Count != 5 || cell.Handles[0].IsMounted
      || !cell.Handles[500].IsMounted || semantics.Tree?.Root?.Children[0].PositionInSet != 499 { return false }

    // An item without content keeps its mounted content.
    cell.Builds.Clear()
    cell.Items[500] = VirtualFixtureItem{ Id: 500, Revision: 1 }
    cell.Rebuild()
    window.UpdateTree()
    if cell.Builds.Count != 1 || cell.Builds[0] != 500 { return false }

    // NeedsRealize picks up a change that no build announced.
    cell.Items.Add(VirtualFixtureItem{ Id: 1000 })
    window.UpdateTree()
    if cell.Handle.ScrollRange.Y != 19960.0 || semantics.Tree?.Root?.SizeOfSet != 1001 { return false }

    if !cell.Handle.ScrollToItem("row-900") || cell.Handle.ScrollToItem("row-missing") { return false }
    window.UpdateTree()
    if cell.Handle.ScrollOffset.Y != 18000.0 || !cell.Handles[900].IsMounted { return false }

    // With another role, items have no role and the content gets the item position.
    cell.Role = AccessibilityRole.Tree
    cell.Rebuild()
    window.UpdateTree()
    if semantics.Tree?.Root?.Role != AccessibilityRole.Tree
      || semantics.Tree?.Root?.Children[0].Role != AccessibilityRole.Generic
      || semantics.Tree?.Root?.Children[0].PositionInSet != 899 { return false }
    window.Close()
    return Virtualization.State(root) == nil && !cell.Handles[900].IsMounted && cell.Disposes == 1
  }

  func VirtualViewportContract() bool {
    let cell = VirtualFixtureCell(1000)
    cell.Inset = 10
    cell.Measure = true
    cell.Jump = Point{ X: 0, Y: 19960 }
    let window = Window{ Root: cell, Width: 100, Height: 60 }
    window.SmoothScrolling = false
    window.UpdateTree()
    // Content coordinates start at the content box, so padding is not part of the scroll range.
    if cell.Handle.ScrollRange.Y != 19960.0 || cell.Handle.ScrollOffset.Y != 19960.0
      || !cell.Handles[999].IsMounted
      || cell.Handles[999].BorderBox.Y - cell.Handle.BorderBox.Y != 30.0 { return false }

    // An item without a height takes it from its content, and the state reads the measured size.
    if !cell.First.Measured || cell.First.Key != "row-997" || cell.First.Size.Width != 80.0
      || cell.First.Size.Height != 13.0 { return false }

    cell.RowHeight = 37.0
    cell.Items[997] = VirtualFixtureItem{ Id: 997, Revision: 1 }
    cell.Rebuild()
    window.UpdateTree()
    if !cell.First.Measured || cell.First.Size.Height != 37.0 { return false }

    if cell.Focused != -1 || !cell.Handles[998].Focus() { return false }
    window.UpdateTree()
    if cell.Focused != 1 { return false }

    // The scroll offset of a result applies together with its items.
    cell.Jump = Point{ X: 0.0, Y: 5000.0 }
    cell.Rebuild()
    window.UpdateTree()
    let moved = cell.Handle.ScrollOffset.Y == 5000.0 && cell.Handles[250].IsMounted
    window.Close()
    return moved
  }

  func VirtualTransactionContract() bool {
    let cell = VirtualFixtureCell(10)
    let window = Window{ Root: cell, Width: 100, Height: 60 }
    window.UpdateTree()

    // A repeated key fails the build and cancels the state.
    cell.Items.Insert(1, VirtualFixtureItem{ Id: 0 })
    cell.Rebuild()
    var repeated = false
    try { window.UpdateTree() } catch (error InvalidOperationException) { repeated = true }
    cell.Items.RemoveAt(1)
    if !repeated || cell.Cancels != 1 { return false }

    // An item without content must be mounted.
    cell.Retain = "row-missing"
    cell.Rebuild()
    var unmounted = false
    try { window.UpdateTree() } catch (error InvalidOperationException) { unmounted = true }
    cell.Retain = nil
    if !unmounted || cell.Cancels != 2 { return false }

    // The mounted items stay usable, and a different state replaces and disposes the retained one.
    cell.Builds.Clear()
    cell.Fresh = true
    cell.Rebuild()
    window.UpdateTree()
    let replaced = cell.Disposes == 1 && cell.Builds.Count == 4 && cell.Handles[0].IsMounted
    window.Close()
    return replaced && cell.Disposes == 2
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

internal class ElementHandleEmbeddedHost : EmbeddedWindowHost {
  protected override func RequestFrame() { }
  protected override func LoadVulkanLibrary() bool -> throw NotSupportedException()
  protected override func GetVulkanGetInstanceProcAddr() nint -> throw NotSupportedException()
  protected override func UnloadVulkanLibrary() { throw NotSupportedException() }
  protected override func GetVulkanInstanceExtensions() []string -> throw NotSupportedException()
  protected override func CreateVulkanSurface(instance nint, out surface uint64) bool {
    throw NotSupportedException()
  }
  protected override func DestroyVulkanSurface(instance nint, surface uint64) { throw NotSupportedException() }
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
  internal var ContentHeight int32 = 200

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
      Container{ Height: ContentHeight },
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

internal class SynchronizedScrollFixtureCell : Cell {
  internal let Leader ElementHandle = ElementHandle()
  internal let Follower ElementHandle = ElementHandle()
  internal let LeaderChild ElementHandle = ElementHandle()
  internal let FollowerChild ElementHandle = ElementHandle()

  override func Build() Blob -> Container() {
    Container{
      Handle: Follower, Width: 120, Height: 30, FlexShrink: 0, OverflowX: Overflow.Scroll,
      Container{ Handle: FollowerChild, Width: 600, Height: 30, FlexShrink: 0 },
    },
    Container{
      Handle: Leader, Width: 120, Height: 30, FlexShrink: 0, OverflowX: Overflow.Scroll,
      Container{ Handle: LeaderChild, Width: 600, Height: 30, FlexShrink: 0 },
    },
  }
}

internal data struct VirtualFixtureItem {
  internal var Id int32
  internal var Revision int32
}

internal class VirtualFixtureCell : Cell {
  internal let Items List[VirtualFixtureItem] = List[VirtualFixtureItem]()
  internal let Builds List[int32] = List[int32]()
  internal let Handles List[ElementHandle] = List[ElementHandle]()
  internal let Handle ElementHandle = ElementHandle{}
  internal var Inset int32
  internal var Role AccessibilityRole = AccessibilityRole.List
  internal var Measure bool
  internal var Fresh bool
  internal var Jump Point?
  internal var Retain string?
  internal var Cancels int32
  internal var Disposes int32
  internal var Focused int32
  internal var First VirtualChild
  internal var RowHeight float64 = 13.0

  init(count int32) {
    for i in 0 ... count { Items.Add(VirtualFixtureItem{ Id: i }) }
    for i in 0 ... count + 1 { Handles.Add(ElementHandle{}) }
  }

  override func Build() Blob -> Virtual(VirtualFixtureSource(this)) {
    Handle = Handle, Width = 100, Height = 60, Padding = Inset,
    Accessibility = Accessibility{ Role: Role },
  }

  internal func BuildItem(item VirtualFixtureItem) Blob {
    Builds.Add(item.Id)
    return Container() {.Handle: Handles[item.Id],.Focusable: true,.Width: 75,.Height: RowHeight,
      Text{ Content: "row ${item.Id}:${item.Revision}"},
    }
  }
}

internal class VirtualFixtureSource : VirtualSource {
  private let cell VirtualFixtureCell
  internal init(cell VirtualFixtureCell) { this.cell = cell }

  public func State(current VirtualState?) VirtualState {
    if !cell.Fresh {
      if let state = current as VirtualFixtureState { return state }
    }
    cell.Fresh = false
    return VirtualFixtureState(cell)
  }
}

// Places rows of height 20 in a column, with one row of overscan on each side.
internal class VirtualFixtureState : VirtualState {
  private let cell VirtualFixtureCell
  private var current Dictionary[string, VirtualFixtureItem] = Dictionary[string, VirtualFixtureItem]()
  private var next Dictionary[string, VirtualFixtureItem] = Dictionary[string, VirtualFixtureItem]()
  private var start int32
  private var end int32
  private var total int32
  private var pendingStart int32
  private var pendingEnd int32
  internal init(cell VirtualFixtureCell) { this.cell = cell }

  public override func Realize(viewport VirtualViewport, output VirtualOutput) {
    next.Clear()
    observe(viewport)
    var scroll = viewport.ScrollOffset.Y
    if let jump = cell.Jump {
      scroll = jump.Y
      output.ScrollOffset = jump
      cell.Jump = nil
    }
    let size = viewport.Size
    let count = cell.Items.Count
    let height float64? = if cell.Measure { nil } else { 20.0 }
    pendingStart = first(scroll, count)
    pendingEnd = last(scroll + size.Height, count, pendingStart)
    for index in pendingStart ... pendingEnd {
      let item = cell.Items[index]
      let key = "row-${item.Id}"
      var content Blob?
      if !current.TryGetValue(key, out var previous) || previous.Revision != item.Revision {
        content = cell.BuildItem(item)
      }
      output.Add(VirtualItem{ Key: key, Index: index, Y: float64(index) * 20.0, Width: size.Width, Height: height, Content: content })
      next[key] = item
    }
    if let key = cell.Retain { output.Add(VirtualItem{ Key: key, Index: count }) }
    output.ContentSize = LayoutSize{ Width: size.Width, Height: float64(count) * 20.0 }
    output.ItemCount = count
  }

  public override func NeedsRealize(viewport VirtualViewport) bool {
    observe(viewport)
    let count = cell.Items.Count
    let scroll = viewport.ScrollOffset.Y
    let from = first(scroll, count)
    return count != total || from != start || last(scroll + viewport.Size.Height, count, from) != end
  }

  public override func OffsetOf(viewport VirtualViewport, key string) Point? {
    for i in 0 ... cell.Items.Count {
      if "row-${cell.Items[i].Id}" == key { return Point{ X: 0.0, Y: float64(i) * 20.0 } }
    }
    return nil
  }

  public override func Commit() {
    let old = current
    current = next
    next = old
    start = pendingStart
    end = pendingEnd
    total = cell.Items.Count
  }

  public override func Cancel() {
    cell.Cancels++
    next.Clear()
  }

  public override func Dispose() {
    cell.Disposes++
    current.Clear()
  }

  private func observe(viewport VirtualViewport) {
    cell.Focused = viewport.FocusedChild
    if viewport.ChildCount > 0 { cell.First = viewport.Child(0) }
  }

  private func first(scroll float64, count int32) int32 -> Math.Clamp(int32(Math.Floor(scroll / 20.0)) - 1, 0, count)

  private func last(bottom float64, count int32, from int32) int32 ->
  Math.Clamp(int32(Math.Ceiling(bottom / 20.0)) + 1, from, count)
}

internal class ThrowingVirtualFixtureSource : VirtualSource {
  internal var Value VirtualState
  public func State(current VirtualState?) VirtualState -> Value
}

internal class ThrowingVirtualFixtureState : VirtualState {
  internal var Fail bool
  internal var Commits int32
  internal var Disposals int32
  internal let Failure InvalidOperationException = InvalidOperationException("retire failed")
  public override func Realize(viewport VirtualViewport, output VirtualOutput) { }
  public override func NeedsRealize(viewport VirtualViewport) bool -> false
  public override func Commit() { Commits++ }
  public override func Dispose() {
    Disposals++
    if Fail { throw Failure }
  }
}
