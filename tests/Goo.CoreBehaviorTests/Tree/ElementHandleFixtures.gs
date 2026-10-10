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
    cell.Pin = true
    let window = Window{ Root: cell, Width: 100, Height: 60 }
    window.SmoothScrolling = false
    window.UpdateTree()
    // Content coordinates start at the content box, so padding is not part of the scroll range.
    if cell.Handle.ScrollRange.Y != 19960.0 || cell.Handle.ScrollOffset.Y != 19960.0 || !cell.Pinned
      || !cell.Handles[999].IsMounted
      || cell.Handles[999].BorderBox.Y - cell.Handle.BorderBox.Y != 30.0 { return false }

    // An item without a height takes it from its content, and the state reads the measured size.
    if !cell.First.Measured || cell.First.Key != "row-997" || cell.First.Size.Width != 80.0
      || cell.First.Size.Height != 13.0 { return false }

    if cell.Focused != -1 || !cell.Handles[998].Focus() { return false }
    window.UpdateTree()
    if cell.Focused != 1 { return false }

    // The scroll offset of a result applies together with its items.
    cell.Pin = false
    cell.Jump = Point{ X: 0.0, Y: 5000.0 }
    cell.Rebuild()
    window.UpdateTree()
    let moved = cell.Handle.ScrollOffset.Y == 5000.0 && cell.Handles[250].IsMounted && !cell.Pinned
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
  internal var Pin bool
  internal var Measure bool
  internal var Fresh bool
  internal var Jump Point?
  internal var Retain string?
  internal var Cancels int32
  internal var Disposes int32
  internal var Pinned bool
  internal var Focused int32
  internal var First VirtualChild

  init(count int32) {
    for i in 0 ... count { Items.Add(VirtualFixtureItem{ Id: i }) }
    for i in 0 ... count + 1 { Handles.Add(ElementHandle{}) }
  }

  override func Build() Blob -> Virtual(VirtualFixtureSource(this)) {
    Handle = Handle, Width = 100, Height = 60, Padding = Inset, PinToBottom = Pin,
    Accessibility = Accessibility{ Role: Role },
  }

  internal func BuildItem(item VirtualFixtureItem) Blob {
    Builds.Add(item.Id)
    return Container() {.Handle: Handles[item.Id],.Focusable: true,.Width: 75,.Height: 13,
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
    cell.Pinned = viewport.Pinned
    cell.Focused = viewport.FocusedChild
    if viewport.ChildCount > 0 { cell.First = viewport.Child(0) }
  }

  private func first(scroll float64, count int32) int32 -> Math.Clamp(int32(Math.Floor(scroll / 20.0)) - 1, 0, count)

  private func last(bottom float64, count int32, from int32) int32 ->
  Math.Clamp(int32(Math.Ceiling(bottom / 20.0)) + 1, from, count)
}
