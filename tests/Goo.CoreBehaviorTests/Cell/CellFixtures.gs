package Goo

import System
import System.Numerics

import System.Threading
import System.Diagnostics
internal class CellFixtures {
  func MountedPlainFieldWritesRebuild() bool {
    let plain = MountedDefaultFixtureCell()
    let plainWindow = Window{Root: plain, Size: LayoutSize(200, 100)}
    try {
      plainWindow.UpdateTree()
      plainWindow.UpdateTree()
      if plain.Builds != 1 { return false }
    } finally { plainWindow.Close() }
    let cell = MountedMeasurementFixtureCell()
    let window = Window{Root: cell, Size: LayoutSize(200, 100)}
    try {
      window.UpdateTree()
      window.UpdateTree()
      window.UpdateTree()
      if cell.Builds != 2 || window.Tree?.Content != "w=120" { return false }
    } finally { window.Close() }
    let baseCall = MountedBaseCallFixtureCell()
    let baseWindow = Window{Root: baseCall, Size: LayoutSize(200, 100)}
    try {
      baseWindow.UpdateTree()
      baseWindow.UpdateTree()
      return baseCall.Builds == 1 && baseCall.Value == "after" && baseWindow.Tree?.Content == "before"
    } finally { baseWindow.Close() }
  }

  func ServicesBeforeWindowBinding() bool {
    let cell = LifecycleFixtureCell()
    var rejected int32
    try { let token = cell.Token } catch (_ InvalidOperationException) { rejected++ }
    try { cell.Request("load") } catch (_ InvalidOperationException) { rejected++ }
    if rejected != 2 || !cell.HostRejected() || cell.Enqueue(() -> {})
      || cell.Delay(0.0, () -> {}).IsActive || cell.Repeat(1.0, () -> {}).IsActive { return false }
    let window = Window{Root: cell, Size: LayoutSize(200, 100)}
    try {
      window.UpdateTree()
      return !cell.Token.IsCancellationRequested && !cell.Request("load").IsCancellationRequested
    } finally { window.Close() }
  }

  func SchedulingPhasesAndFailedMountsContract() bool ->
    Window{Root: SchedulingPhaseFixtureCell(), Size: LayoutSize(200, 100)}.SchedulingPhasesForTest()

  func LifecycleHooksAndRequestTokensContract() bool {
    let cell = LifecycleFixtureCell()
    if !cell.HostRejected() || cell.Enqueue(() -> {}) { return false }
    let window = Window{Root: cell, Size: LayoutSize(200, 100)}
    window.UpdateTree()
    let lifetime = cell.Token
    let first = cell.Request("load")
    let other = cell.Request("other")
    let latest = cell.Request("load")
    if cell.Mounts != 1 || !cell.MountGeometry || cell.Owner != window
      || !first.IsCancellationRequested || latest.IsCancellationRequested
      || other.IsCancellationRequested || lifetime.IsCancellationRequested { return false }
    cell.Replace = true
    cell.Rebuild()
    if !cell.Enqueue(() -> { cell.Calls++ }) { return false }
    window.UpdateTree()
    window.drainPostedActions()
    if cell.Calls != 1 || cell.Mounts != 1 || !cell.IsDirty() { return false }
    window.Close()
    return cell.Unmounts == 1 && cell.UnmountGeometry && cell.Disposals == 1
      && lifetime.IsCancellationRequested && latest.IsCancellationRequested && other.IsCancellationRequested
      && cell.HostRejected() && !cell.Enqueue(() -> { cell.Calls++ })
      && !cell.Delay(0.0, () -> {}).IsActive && !cell.Repeat(1.0, () -> {}).IsActive
  }

  func CellSchedulingAndTimerValidationContract() bool ->
    Window{Root: LifecycleFixtureCell(), Size: LayoutSize(200, 100)}.CellSchedulingForTest()

  func TypedFactoryStoresInputWithoutRecreatingCellContract() bool {
    let window = Window{}
    let rec = Reconciler{Res: Resolver{}, Owner: window}
    var calls int32
    let node = rec.Mount(Cell.Mount[int32, TypedFactoryFixtureCell]("page", 1, () -> {
      calls++
      return TypedFactoryFixtureCell("value")
    }))
    let cell = node.Fiber
    let updated = rec.Diff(node, Cell.Mount[int32, TypedFactoryFixtureCell]("page", 2, () -> {
      calls++
      return TypedFactoryFixtureCell("unused")
    }))
    let retained = updated.Fiber == cell && updated.Content == "value:2" && calls == 1
    NodeLifecycle.DisposeTree(updated)
    return retained
  }
  func ControlledEditorValueDuringBuildDoesNotRebuildOwner() bool {
    let document = TextDocument("initial")
    using let controller = TextEditorController(document)
    let cell = ControlledEditorValueCell(controller)
    let window = Window{ Root: cell, Size: LayoutSize(200, 100), }
    try {
      window.UpdateTree()
      cell.Value = "controlled"
      cell.Rebuild()
      window.UpdateTree()
      window.UpdateTree()
      return document.GetText() == "controlled" && cell.Changes == 1
        && cell.Builds == 2 && !cell.IsDirty()
    } finally {
      window.Close()
    }
  }

  func DeferredScopeAndMountFactoryCallbacksRebuildTheirAuthor() bool {
    for mode in []string{"scope", "nested", "factory", "input"} {
      let host = DeferredCallbackHost(mode)
      let driver = InputFixtureDriver(host, 200, 150)
      try {
        guard let tree = driver.Window.Tree else { return false }
        let target = tree.Children[1]
        driver.Press(target.Rect.X + 5, target.Rect.Y + 5)
        driver.Release(target.Rect.X + 5, target.Rect.Y + 5)
        driver.Update()
        if host.Count != 1 || host.Builds != 2
          || driver.Window.Tree?.Children[0].Content != "1" { return false }
        if (mode == "scope" || mode == "nested")
          && driver.Window.Tree?.Children[1].Rect.H != 31 { return false }
      } finally {
        driver.Window.Close()
      }
    }
    return true
  }

  func ScopeMountedChildCallbacksKeepTheirOwner() bool {
    let host = DeferredCallbackHost("child")
    let driver = InputFixtureDriver(host, 200, 150)
    try {
      guard let tree = driver.Window.Tree else { return false }
      let target = tree.Children[1]
      driver.Press(target.Rect.X + 5, target.Rect.Y + 5)
      driver.Release(target.Rect.X + 5, target.Rect.Y + 5)
      driver.Update()
      return host.Builds == 1 && host.Count == 0
        && host.Child.Builds == 2 && host.Child.Count == 1
        && driver.Window.Tree?.Children[1].Children[0].Content == "clicked:1"
    } finally {
      driver.Window.Close()
    }
  }

  func SlottedAndForwardedCallbacksRebuildOnlyTheirAuthor() bool {
    for cached in []bool{false, true} {
      let host = CallbackOriginHost{CacheContent: cached}
      let driver = InputFixtureDriver(host, 200, 150)
      for pass in 0 ... 2 {
        for index in 1 ... 3 {
          guard let tree = driver.Window.Tree else { return false }
          let target = tree.Children[index]
          let builds = host.Builds
          guard let sibling = tree.Children[3].Fiber as CallbackUnchangedCell? else { return false }
          let siblingBuilds = sibling.Builds
          let x = target.Rect.X + target.Rect.W * .5F
          let y = target.Rect.Y + target.Rect.H * .5F
          driver.Press(x, y)
          driver.Release(x, y)
          driver.Update()
          let expected = index == 1 ? "slot" : "forward:7:9:True"
          if host.Value != expected || host.Builds != builds + 1
            || driver.Window.Tree?.Children[0].Content != expected
            || sibling.Builds != siblingBuilds { return false }
        }
        host.MountKey = "remounted"
        host.Rebuild()
        driver.Update()
      }
    }
    return true
  }

  func InputEqualitySchedulesOneBuild() bool {
    CellInputFixtureCell.Builds = 0
    let rec = Reconciler{ Res: Resolver{} }
    let first = CellInputFixtureValue{ Label: "first", Count: 1 }
    let second = CellInputFixtureValue{ Label: "second", Count: 2 }
    var node = rec.Mount(cellInputFixture(first))
    if CellInputFixtureCell.Builds != 1 || node.Content != "first:1" {
      return false
    }
    node = rec.Diff(node, cellInputFixture(first))
    if CellInputFixtureCell.Builds != 1 {
      return false
    }
    node = rec.Diff(node, cellInputFixture(second))
    if CellInputFixtureCell.Builds != 2 || node.Content != "second:2" {
      return false
    }
    node = rec.Diff(node, cellInputFixture(second))
    return CellInputFixtureCell.Builds == 2
  }

  func SemanticInputEquivalenceKeepsNewestCallback() bool {
    CellCallbackInputFixtureCell.Builds = 0
    CellCallbackInputFixtureCell.Callback = ""
    CellCallbackInputFixtureCell.SnapshotWasStored = false
    let rec = Reconciler{ Res: Resolver{} }
    let first = CellCallbackInputFixtureValue{
      Label: "same",
      OnClick: () -> { CellCallbackInputFixtureCell.Callback = "first" },
    }
    let second = CellCallbackInputFixtureValue{
      Label: "same",
      OnClick: () -> { CellCallbackInputFixtureCell.Callback = "second" },
    }
    let changed = CellCallbackInputFixtureValue{
      Label: "changed",
      OnClick: () -> { CellCallbackInputFixtureCell.Callback = "changed" },
    }
    var node = rec.Mount(cellCallbackInputFixture(first))
    node = rec.Diff(node, cellCallbackInputFixture(second))
    if CellCallbackInputFixtureCell.Builds != 1 || !CellCallbackInputFixtureCell.SnapshotWasStored {
      return false
    }
    guard let action = node.OnClick else { return false }
    action()
    if CellCallbackInputFixtureCell.Callback != "second" {
      return false
    }
    node = rec.Diff(node, cellCallbackInputFixture(changed))
    guard let changedAction = node.OnClick else { return false }
    changedAction()
    return CellCallbackInputFixtureCell.Builds == 2
      && CellCallbackInputFixtureCell.Callback == "changed"
  }

  func ThrowingInputEquivalenceRetriesSameSnapshot() bool {
    CellThrowingInputFixtureCell.Builds = 0
    CellThrowingInputFixtureCell.ThrowOnce = false
    let rec = Reconciler{ Res: Resolver{} }
    let first = CellThrowingInputFixtureValue{ Label: "first" }
    let second = CellThrowingInputFixtureValue{ Label: "second" }
    var node = rec.Mount(cellThrowingInputFixture(first))
    CellThrowingInputFixtureCell.ThrowOnce = true
    var threw = false
    try {
      node = rec.Diff(node, cellThrowingInputFixture(second))
    } catch (error Exception) {
      threw = error.Message == "throw once"
    }
    if !threw || CellThrowingInputFixtureCell.Builds != 1 || node.Content != "first" {
      return false
    }
    node = rec.Diff(node, cellThrowingInputFixture(second))
    if CellThrowingInputFixtureCell.Builds != 2 || node.Content != "second" {
      return false
    }
    node = rec.Diff(node, cellThrowingInputFixture(second))
    return CellThrowingInputFixtureCell.Builds == 2 && node.Content == "second"
  }

  func DirtySiblingsRebuildOnceInOneUpdate() bool {
    let parent = CellSchedulingSiblingsParent{}
    let window = Window{ Root: parent, Size: LayoutSize(200, 100), }
    window.UpdateTree()
    guard let first = window.Tree else { return false }
    guard let left = first.Children[0].Fiber else { return false }
    guard let right = first.Children[1].Fiber else { return false }
    if left is CellSchedulingLeft {
      if right is CellSchedulingRight {
        let leftBefore = left.Builds
        let rightBefore = right.Builds
        left.RequestMany()
        right.RequestMany()
        window.UpdateTree()
        return left.Builds == leftBefore + 1 && right.Builds == rightBefore + 1
      }
    }
    return false
  }
  func DirtySiblingFailureResubmitsRemaining() bool {
    CellSchedulingRecoveryFirst.ThrowOnce = false
    let parent = CellSchedulingRecoveryParent{}
    let window = Window{ Root: parent, Size: LayoutSize(200, 100), }
    window.UpdateTree()
    guard let first = window.Tree else { return false }
    guard let left = first.Children[0].Fiber else { return false }
    guard let right = first.Children[1].Fiber else { return false }
    if left is CellSchedulingRecoveryFirst {
      if right is CellSchedulingRecoverySecond {
        let leftBefore = left.Builds
        let rightBefore = right.Builds
        left.Request()
        right.Request()
        CellSchedulingRecoveryFirst.ThrowOnce = true
        var threw = false
        try {
          window.UpdateTree()
        } catch (error Exception) {
          threw = error.StackTrace?.Contains("CellSchedulingRecoveryFirst.Build") == true
        }
        if !threw || left.Builds != leftBefore + 1 || right.Builds != rightBefore {
          return false
        }
        window.UpdateTree()
        if left.Builds != leftBefore + 2 || right.Builds != rightBefore + 1 {
          return false
        }
        window.UpdateTree()
        return left.Builds == leftBefore + 2 && right.Builds == rightBefore + 1
      }
    }
    return false
  }

  func RepeatedRebuildRequestsCoalesce() bool {
    let parent = CellSchedulingSiblingsParent{}
    let window = Window{ Root: parent, Size: LayoutSize(200, 100), }
    window.UpdateTree()
    guard let first = window.Tree else { return false }
    guard let child = first.Children[0].Fiber else { return false }
    if child is CellSchedulingLeft {
      let buildsBefore = child.Builds
      child.RequestMany()
      window.UpdateTree()
      window.UpdateTree()
      return child.Builds == buildsBefore + 1
    }
    return false
  }

  func DirectChildQueuesCanonicalParentOnce() bool {
    CellSchedulingDirectChild.Last = nil
    let parent = CellSchedulingDirectParent{}
    let window = Window{ Root: parent, Size: LayoutSize(100, 100), }
    window.UpdateTree()
    guard let child = CellSchedulingDirectChild.Last else { return false }
    let owner = Object()
    let generation = child.TryQueueCanonical(owner, out var childRoot)
    let duplicate = parent.TryQueueCanonical(owner, out var parentRoot)
    childRoot.ClearQueue(owner)
    return generation != 0
      && duplicate == 0
      && childRoot == parent
      && parentRoot == parent
  }

  func FailedDirectChildRebuildResubmitsCanonicalParent() bool {
    CellSchedulingDirectChild.Last = nil
    let parent = CellSchedulingDirectParent{}
    let window = Window{ Root: parent, Size: LayoutSize(100, 100), }
    window.UpdateTree()
    guard let child = CellSchedulingDirectChild.Last else { return false }
    let parentBefore = parent.Builds
    let childBefore = child.Builds
    child.RequestFailure()
    var threw = false
    try {
      window.UpdateTree()
    } catch (error InvalidOperationException) {
      threw = error.Message == "direct failure"
    }
    if !threw || parent.Builds != parentBefore || child.Builds != childBefore + 1 {
      return false
    }
    window.UpdateTree()
    window.UpdateTree()
    guard let node = window.Tree else { return false }
    return parent.Builds == parentBefore
      && child.Builds == childBefore + 2
      && node.Content == "direct"
  }

  func DirtyParentRunsBeforeAndSubsumesDirtyChild() bool {
    CellSchedulingOrderParent.Trace = ""
    let parent = CellSchedulingOrderParent{}
    let window = Window{ Root: parent, Size: LayoutSize(200, 100), }
    window.UpdateTree()
    guard let first = window.Tree else { return false }
    guard let child = first.Children[0].Fiber else { return false }
    if child is CellSchedulingOrderChild {
      let parentBefore = parent.Builds
      let childBefore = child.Builds
      CellSchedulingOrderParent.Trace = ""
      child.Request()
      parent.Change("after")
      window.UpdateTree()
      guard let after = window.Tree else { return false }
      return parent.Builds == parentBefore + 1
        && child.Builds == childBefore + 1
        && CellSchedulingOrderParent.Trace == "PC"
        && after.Children[0].Content == "after"
    }
    return false
  }

  func RemovedQueuedCellIsNotRebuiltAndDisposesOnce() bool {
    CellSchedulingRemovalChild.Disposals = 0
    let parent = CellSchedulingRemovalParent{}
    let window = Window{ Root: parent, Size: LayoutSize(200, 100), }
    window.UpdateTree()
    guard let first = window.Tree else { return false }
    guard let child = first.Children[0].Fiber else { return false }
    if child is CellSchedulingRemovalChild {
      let childBefore = child.Builds
      child.RequestMany()
      parent.Remove()
      window.UpdateTree()
      guard let after = window.Tree else { return false }
      window.UpdateTree()
      return child.Builds == childBefore
        && CellSchedulingRemovalChild.Disposals == 1
        && after.Children.Count == 1
        && after.Children[0].Content == "removed"
    }
    return false
  }

  func RebuildRequestedDuringTransactionRunsOnNextUpdate() bool {
    CellSchedulingDeferredSecond.Last = nil
    let parent = CellSchedulingDeferredParent{}
    let window = Window{ Root: parent, Size: LayoutSize(200, 100), }
    window.UpdateTree()
    guard let first = window.Tree else { return false }
    guard let source = first.Children[0].Fiber else { return false }
    guard let target = first.Children[1].Fiber else { return false }
    if source is CellSchedulingDeferredFirst {
      if target is CellSchedulingDeferredSecond {
        let sourceBefore = source.Builds
        let targetBefore = target.Builds
        source.TriggerPeer()
        window.UpdateTree()
        if source.Builds != sourceBefore + 1 || target.Builds != targetBefore {
          return false
        }
        window.UpdateTree()
        return target.Builds == targetBefore + 1
      }
    }
    return false
  }

  func PostReportsQueueAcceptance() bool {
    var calls int32
    let window = Window{}
    if !window.Post(() -> { calls++ }) { return false }
    window.drainPostedActions()
    if calls != 1 { return false }
    window.Close()
    return !window.Post(() -> { calls++ }) && calls == 1
      && Window{}.DeferredCloseStopsPostsForTest() && Window{}.NativeModalCloseDrainsCompletionForTest(false)
      && Window{}.NativeModalCloseDrainsCompletionForTest(true)
  }

  func EmbeddedDetachWaitsForClosePreparation() bool ->
  Window{}.EmbeddedDetachWaitsForClosePreparationForTest()

  func DirectCompositionAddsNoRenderNode() bool {
    DirectChildCell.Last = nil
    let window = Window{ Root: DirectParentCell{}, Size: LayoutSize(100, 100), }
    window.UpdateTree()
    guard let node = window.Tree else { return false }
    guard let child = DirectChildCell.Last else { return false }
    if node.Kind != NodeKind.Text || node.Content != "direct:0" || node.Children.Count != 0 {
      return false
    }
    child.Change()
    window.UpdateTree()
    guard let after = window.Tree else { return false }
    return after.Kind == NodeKind.Text
      && after.Content == "direct:1"
      && after.Children.Count == 0
  }

  func DirectCompositionCallbacksRebuildRenderingCell() bool {
    let child = DirectCallbackCell{}
    let root = DirectCallbackParent(DirectCallbackParent(child))
    let window = Window{ Root: root, Size: LayoutSize(100, 100), }
    try {
      window.UpdateTree()
      guard let node = window.Tree else { return false }
      let input = window.PlatformInput
      input.PointerMove(1, PointerDevice.Mouse, 10.0F, 10.0F, KeyModifiers{}, 0.0F)
      input.PointerPress(1, PointerDevice.Mouse, 10.0F, 10.0F,
        PointerButton.Primary, KeyModifiers{}, 1.0F)
      input.PointerRelease(1, PointerDevice.Mouse, 10.0F, 10.0F,
        PointerButton.Primary, KeyModifiers{}, 0.0F)
      window.UpdateTree()
      window.UpdateTree()
      return window.Tree == node && node.Fiber == root
        && child.Count == 1 && child.Builds == 2
        && node.Children.Count == 1 && node.Children[0].Content == "clicked:1"
    } finally {
      window.Close()
    }
  }

  func DisposesEachUnmountedCellExactlyOnce() bool {
    KeyedDisposableCell.Disposals = 0
    PositionalDisposableCell.Disposals = 0
    ReplacementDisposableCell.Disposals = 0
    WindowDisposableCell.Disposals = 0

    let rec = Reconciler{ Res: Resolver{} }
    var keyed = rec.Mount(Container() {
        Cell.Mount[KeyedDisposableCell]("removed"),
        Text{ Key: "kept", Content: "kept" },
      })
    keyed = rec.Diff(keyed, Container() {
        Text{ Key: "kept", Content: "kept" },
      })

    var positional = rec.Mount(Container() {
        Text{ Content: "kept" },
        Cell.Mount[PositionalDisposableCell](),
      })
    positional = rec.Diff(positional, Container() {
        Text{ Content: "kept"},
    })

    var replacement = rec.Mount(Cell.Mount[ReplacementDisposableCell]("same"))
    replacement = rec.Diff(replacement, Cell.Mount[ReplacementOtherCell]("same"))

    let root = WindowDisposableCell{}
    let window = Window{ Root: root, Size: LayoutSize(100, 100), }
    window.UpdateTree()
    window.Close()
    window.Close()

    return KeyedDisposableCell.Disposals == 1
      && PositionalDisposableCell.Disposals == 1
      && ReplacementDisposableCell.Disposals == 1
      && WindowDisposableCell.Disposals == 1
  }

  func KeyedRetirementContinuesAfterDisposeFailures() bool {
    RetirementDisposableCell.Reset()
    let rec = Reconciler{ Res: Resolver{} }
    let root = rec.Mount(Container() {
      Cell.Mount[string, RetirementDisposableCell]("first", "first"),
      Cell.Mount[string, RetirementDisposableCell]("later", "later"),
      Text{ Key: "kept", Content: "kept" },
    })
    var message = ""
    try {
      rec.Diff(root, Container() {
        Text{ Key: "kept", Content: "kept" },})
    } catch (error Exception) {
      message = error.Message
    }
    return message == "retire-first"
      && root.Children.Count == 1
      && root.Children[0].Key == "kept"
      && RetirementDisposableCell.FirstDisposals == 1
      && RetirementDisposableCell.LaterDisposals == 1
  }

  func KeyedRollbackContinuesAfterDisposeFailures() bool {
    let root = KeyedRollbackParent{}
    let window = Window{ Root: root, Size: LayoutSize(100, 100), }
    try {
      window.UpdateTree()
      let original = root.Handle.AttachedNode()
      guard let before = window.Tree else { return false }
      let retained = before.Children[0]
      guard let changed = retained.Fiber as KeyedRollbackChangingCell? else { return false }
      root.Fail = true
      root.Rebuild()
      var failure Exception?
      try {
        window.UpdateTree()
      } catch (error Exception) {
        failure = error
      }
      guard let node = window.Tree else { return false }
      return failure == root.Failure
        && root.First.Disposals == 1 && root.Second.Disposals == 1
        && !root.First.Handle.IsMounted && !root.Second.Handle.IsMounted
        && changed.Child.Disposals == 1 && !changed.Child.Handle.IsMounted
        && changed.Handle.AttachedNode() == retained && retained.Fiber == changed
        && original != nil && root.Handle.AttachedNode() == original
        && node.Children.Count == 2 && node.Children[0] == retained && node.Children[1] == original
    } finally {
      window.Close()
    }
  }

  func PositionalRetirementContinuesAfterDisposeFailures() bool {
    RetirementDisposableCell.Reset()
    let rec = Reconciler{ Res: Resolver{} }
    let root = rec.Mount(Container() {
      Text{ Content: "kept" },
      Cell.Mount[string, RetirementDisposableCell](nil, "first"),
      Cell.Mount[string, RetirementDisposableCell](nil, "later"),
    })
    var message = ""
    try {
      rec.Diff(root, Container() {
        Text{ Content: "kept" },})
    } catch (error Exception) {
      message = error.Message
    }
    return message == "retire-first"
      && root.Children.Count == 1
      && root.Children[0].Content == "kept"
      && RetirementDisposableCell.FirstDisposals == 1
      && RetirementDisposableCell.LaterDisposals == 1
  }

  func WindowCloseCompletesAfterCleanupFailures() bool {
    RetirementDisposableCell.Reset()
    let window = Window{ Root: WindowCleanupParent{}, Size: LayoutSize(100, 100), }
    window.UpdateTree()
    var metricCalls int32
    window.MetricsChanged += func(metrics WindowMetrics) {
      metricCalls++
      throw InvalidOperationException("metrics-later")
    }
    MetricSubscriptions.MarkWindowDirty(window)
    var message = ""
    try {
      window.Close()
    } catch (error Exception) {
      message = error.Message
    }
    MetricSubscriptions.MarkWindowDirty(window)
    var flushThrew = false
    try {
      MetricSubscriptions.Flush(window)
    } catch (error Exception) {
      flushThrew = true
    }
    var secondCloseThrew = false
    try {
      window.Close()
    } catch (error Exception) {
      secondCloseThrew = true
    }
    return message == "retire-first"
      && window.Tree == nil
      && !window.IsOpen
      && RetirementDisposableCell.FirstDisposals == 1
      && RetirementDisposableCell.LaterDisposals == 1
      && metricCalls == 1
      && !flushThrew
      && !secondCloseThrew
  }

  func FactorySubtypeRetainsAcrossKeyedReorderAndIndependentRebuild() bool {
    FactorySubtypeCell.Reset()
    let first = FactorySubtypeCell("first")
    let second = FactorySubtypeCell("second")
    let rec = Reconciler{ Res: Resolver{} }
    var root = rec.Mount(Container() {
      Cell.Mount[FactoryBaseCell]("first", () -> {
        FactorySubtypeCell.InitialFactoryCalls++
        return first
      }),
      Cell.Mount[FactoryBaseCell]("second", () -> {
        FactorySubtypeCell.InitialFactoryCalls++
        return second
      }),
    })
    root = rec.Diff(root, Container() {
      Cell.Mount[FactoryBaseCell]("second", () -> {
        FactorySubtypeCell.ReplacementFactoryCalls++
        return FactorySubtypeCell("unused")
      }),
      Cell.Mount[FactoryBaseCell]("first", () -> {
        FactorySubtypeCell.ReplacementFactoryCalls++
        return FactorySubtypeCell("unused")
      }),
      })
    if FactorySubtypeCell.InitialFactoryCalls != 2
      || FactorySubtypeCell.ReplacementFactoryCalls != 0
      || root.Children[0].Fiber != second
      || root.Children[1].Fiber != first{
        return false
      }
    first.Change()
    rec.RebuildFiber(root.Children[1], first)
    return root.Children[0].Content == "second:0"
      && root.Children[1].Content == "first:1"
      && first.Builds == 2
      && second.Builds == 1
  }

  func FactoryKeyChangeRemountsAndDisposes() bool {
    FactorySubtypeCell.Reset()
    let rec = Reconciler{ Res: Resolver{} }
    var node = rec.Mount(Cell.Mount[FactoryBaseCell]("first", () -> FactorySubtypeCell("first")))
    let first = node.Fiber
    node = rec.Diff(node, Cell.Mount[FactoryBaseCell]("second", () -> FactorySubtypeCell("second")))
    return first != node.Fiber
      && node.Content == "second:0"
      && FactorySubtypeCell.Disposals == 1
  }

  func FactoryRejectsReusedAndDisposedInstancesWithoutCorruption() bool {
    FactorySubtypeCell.Reset()
    let rec = Reconciler{ Res: Resolver{} }
    let shared = FactorySubtypeCell("shared")
    let mounted = rec.Mount(Cell.Mount[FactoryBaseCell]("shared", () -> shared))
    var reusedRejected = false
    try {
      rec.Mount(Cell.Mount[FactoryBaseCell]("other", () -> shared))
    } catch (error InvalidOperationException) {
      reusedRejected = true
    }
    if !reusedRejected || shared.disposed || mounted.Fiber != shared || mounted.Content != "shared:0" {
      return false
    }
    rec.Diff(mounted, Text{ Content: "retired" })
    if !shared.disposed || FactorySubtypeCell.Disposals != 1 {
      return false
    }
    var disposedRejected = false
    try {
      rec.Mount(Cell.Mount[FactoryBaseCell]("disposed", () -> shared))
    } catch (error InvalidOperationException) {
      disposedRejected = true
    }
    return disposedRejected && FactorySubtypeCell.Disposals == 1
  }

  func FactoryBuildFailurePreservesPriorMount() bool {
    FactorySubtypeCell.Reset()
    FactoryThrowCell.Disposals = 0
    let rec = Reconciler{ Res: Resolver{} }
    let prior = FactorySubtypeCell("prior")
    let node = rec.Mount(Cell.Mount[FactoryBaseCell]("prior", () -> prior))
    var threw = false
    try {
      rec.Diff(node, Cell.Mount[FactoryBaseCell]("replacement", () -> FactoryThrowCell{}))
    } catch (error InvalidOperationException) {
      threw = error.Message == "factory build failure"
        && error.StackTrace?.Contains("FactoryThrowCell.Build") == true
    }
    return threw
      && node.Fiber == prior
      && node.Content == "prior:0"
      && !prior.disposed
      && FactorySubtypeCell.Disposals == 0
      && FactoryThrowCell.Disposals == 1
  }

  func MountFactoryBlob(blob Blob) {
    let rec = Reconciler{ Res: Resolver{} }
    rec.Mount(blob)
  }

  func RootMountRetriesAfterInitialBuildFailure() bool {
    let root = FactoryRootRetryCell{}
    let window = Window{ Root: root, Size: LayoutSize(100, 100), }
    var threw = false
    try {
      window.UpdateTree()
    } catch (error InvalidOperationException) {
      threw = error.Message == "root build failure"
        && error.StackTrace?.Contains("FactoryRootRetryCell.Build") == true
    }
    if !threw || window.Tree != nil { return false }
    window.UpdateTree()
    return window.Tree?.Content == "recovered" && root.Builds == 2
  }

  func FactoryRejectsCurrentlyBuildingRootWithoutCorruption() bool {
    let root = FactoryRecursiveRootCell{}
    let window = Window{ Root: root, Size: LayoutSize(100, 100), }
    var failures int32
    for _ in 0 ... 2 {
      try {
        window.UpdateTree()
      } catch (error InvalidOperationException) {
        if error.Message == "Cell FactoryRecursiveRootCell is already mounted or being mounted: return a fresh Cell instance for each Cell.Mount factory call." {
          failures++
        }
      }
    }
    return failures == 2 && root.Builds == 2 && !root.disposed && window.Tree == nil
  }
}

internal class TypedFactoryFixtureCell : Cell[int32] {
  private let prefix string
  init(prefix string) { this.prefix = prefix }
  protected override func Build(input int32) Blob -> Text{Content: "$prefix:$input"}
}

internal class LifecycleFixtureCell : Cell, IDisposable {
  internal let Handle ElementHandle = ElementHandle()
  internal var Mounts int32
  internal var Unmounts int32
  internal var Disposals int32
  internal var Calls int32
  internal var MountGeometry bool
  internal var UnmountGeometry bool
  internal var Replace bool

  internal prop Owner Window { get -> Host }
  internal prop Token CancellationToken { get -> Lifetime }
  internal func Request(name string) CancellationToken -> Latest(name)
  internal func Enqueue(action Action) bool -> Post(action)
  internal func Delay(milliseconds float64, action Action) WindowTimer -> After(milliseconds, action)
  internal func Repeat(milliseconds float64, action Action) WindowTimer -> Every(milliseconds, action)

  internal func HostRejected() bool {
    try { let owner = Host } catch (error InvalidOperationException) {
      return error.Message.Contains("LifecycleFixtureCell")
    }
    return false
  }

  protected override func Mounted() {
    Mounts++
    MountGeometry = Handle.IsMounted && Handle.BorderBox.Width == 200 && Host.Root == this
  }

  protected override func Unmounting() {
    Unmounts++
    UnmountGeometry = Handle.IsMounted && !Lifetime.IsCancellationRequested && Host.Root == this
  }

  func Dispose() { Disposals++ }

  override func Build() Blob -> Replace
    ? Container{Handle: Handle, Width: Percent(100), Height: 20, Text("changed")}
    : Text{Handle: Handle, Width: Percent(100), Height: 20, Content: "initial"}
}

internal class SchedulingPhaseFixtureCell : Cell[int32] {
  internal var Scheduled int32
  internal var Rejected int32
  internal var Calls int32
  internal var Fail bool
  internal var ReadAllowed bool
  internal prop Token CancellationToken { get -> Lifetime }

  private func Schedule() {
    if Post(() -> { Calls++ }) { Scheduled++ }
    if After(0.0, () -> { Calls++ }).IsActive { Scheduled++ }
    using let timer = Every(1.0, () -> { Calls++ })
    if timer.IsActive { Scheduled++ }
  }

  protected override func InputChanged(input int32) { Schedule() }
  protected override func Mounted() { Schedule() }

  protected override func Build(input int32) Blob {
    ReadAllowed = Host != nil && !Lifetime.IsCancellationRequested
    try { Post(() -> {}) } catch (_ InvalidOperationException) { Rejected++ }
    try { After(0.0, () -> {}) } catch (_ InvalidOperationException) { Rejected++ }
    try { Every(1.0, () -> {}) } catch (_ InvalidOperationException) { Rejected++ }
    if Fail { throw InvalidOperationException("phase build failure") }
    return Text{Content: input.ToString()}
  }
}

public partial class Window {
  internal func SchedulingPhasesForTest() bool {
    IsOpen = true
    let cell = cast[SchedulingPhaseFixtureCell](Root!!)
    try {
      cell.BindContext(nil, this)
      cell.SetInput(1)
      UpdateTree()
      drainTimers(float64(Stopwatch.GetTimestamp()) + float64(Stopwatch.Frequency))
      drainPostedActions()
      if cell.Scheduled != 6 || cell.Rejected != 3 || cell.Calls != 4 || !cell.ReadAllowed { return false }
      let failed = SchedulingPhaseFixtureCell{Fail: true}
      let rec = Reconciler{Owner: this, Res: resolver}
      try {
        rec.Mount(Cell.Mount[int32, SchedulingPhaseFixtureCell]("failed", 1, () -> failed))
        return false
      } catch (error InvalidOperationException) {
        if error.Message != "phase build failure" { return false }
      }
      drainTimers(float64(Stopwatch.GetTimestamp()) + float64(Stopwatch.Frequency))
      drainPostedActions()
      if !failed.disposed || failed.Calls != 0 || failed.Scheduled != 3 || !failed.Token.IsCancellationRequested {
        return false
      }
      let retryCell = SchedulingPhaseFixtureCell{Fail: true}
      let retry = Window{Root: retryCell, Size: LayoutSize(200, 100)}
      retry.IsOpen = true
      try {
        retryCell.BindContext(nil, retry)
        retryCell.SetInput(1)
        let oldToken = retryCell.Token
        try {
          retry.UpdateTree()
          return false
        } catch (error InvalidOperationException) {
          if error.Message != "phase build failure" { return false }
        }
        if !oldToken.IsCancellationRequested || retryCell.disposed { return false }
        retryCell.Fail = false
        retry.UpdateTree()
        retry.drainTimers(float64(Stopwatch.GetTimestamp()) + float64(Stopwatch.Frequency))
        retry.drainPostedActions()
        return retryCell.Calls == 2 && !retryCell.Token.IsCancellationRequested
      } finally { retry.Close() }
    } finally { Close() }
  }

  internal func CellSchedulingForTest() bool {
    IsOpen = true
    let cell = cast[LifecycleFixtureCell](Root!!)
    try {
      UpdateTree()
      using let buildScope = StateReadScope(cell, () -> {})
      let previous = buildScope.Enter()
      var scopeRejections int32
      try {
        try { cell.Enqueue(() -> {}) } catch (_ InvalidOperationException) { scopeRejections++ }
        try { cell.Delay(0.0, () -> {}) } catch (_ InvalidOperationException) { scopeRejections++ }
        try { cell.Repeat(1.0, () -> {}) } catch (_ InvalidOperationException) { scopeRejections++ }
      } finally { buildScope.Exit(previous, true) }
      if scopeRejections != 3 { return false }
      for value in []float64{Double.NaN, Double.PositiveInfinity, -1.0} {
        var rejected int32
        try { After(value, () -> {}) } catch (_ ArgumentOutOfRangeException) { rejected++ }
        try { Every(value, () -> {}) } catch (_ ArgumentOutOfRangeException) { rejected++ }
        if rejected != 2 { return false }
      }
      try {
        Every(0.0, () -> {})
        return false
      } catch (_ ArgumentOutOfRangeException) {}
      let once = cell.Delay(0.0, () -> { cell.Calls++ })
      let repeating = cell.Repeat(1.0, () -> { cell.Calls++ })
      drainTimers(float64(Stopwatch.GetTimestamp()) + float64(Stopwatch.Frequency))
      if once.IsActive || !repeating.IsActive || cell.Calls != 2 || !cell.IsDirty() { return false }
      repeating.Dispose()
      cell.ClearDirty()
      let throwing = cell.Delay(0.0, () -> { throw InvalidOperationException("timer failure") })
      var threw = false
      try {
        drainTimers(float64(Stopwatch.GetTimestamp()) + float64(Stopwatch.Frequency))
      } catch (error InvalidOperationException) { threw = error.Message == "timer failure" }
      if !threw || throwing.IsActive || !cell.IsDirty() { return false }
      let pending = cell.Delay(0.0, () -> { cell.Calls++ })
      if !cell.Enqueue(() -> { cell.Calls++ }) { return false }
      NodeLifecycle.DisposeTree(node!!)
      drainTimers(float64(Stopwatch.GetTimestamp()) + float64(Stopwatch.Frequency))
      drainPostedActions()
      if pending.IsActive || cell.Calls != 2 { return false }
      Close()
      drainPostedActions()
      return !pending.IsActive && cell.Calls == 2 && !After(0.0, () -> {}).IsActive
    } finally { Close() }
  }
}

internal open class FactoryBaseCell : Cell {
}

internal class FactorySubtypeCell : FactoryBaseCell, IDisposable {
  shared {
    internal var InitialFactoryCalls int32
    internal var ReplacementFactoryCalls int32
    internal var Disposals int32

    internal func Reset() {
      InitialFactoryCalls = 0
      ReplacementFactoryCalls = 0
      Disposals = 0
    }
  }

  private let label string
  private var count int32
  internal var Builds int32

  init(label string) { this.label = label }

  internal func Change() {
    count++
    Rebuild()
  }

  func Dispose() { Disposals++ }

  override func Build() Blob {
    Builds++
    return Text{ Content: "$label:$count" }
  }
}

internal class FactoryThrowCell : FactoryBaseCell, IDisposable {
  shared { internal var Disposals int32 }
  func Dispose() { Disposals++ }
  override func Build() Blob {
    throw InvalidOperationException("factory build failure")
  }
}

internal class FactoryRootRetryCell : Cell {
  internal var Builds int32

  override func Build() Blob {
    Builds++
    if Builds == 1 {
      throw InvalidOperationException("root build failure")
    }
    return Text{ Content: "recovered" }
  }
}

internal class FactoryRecursiveRootCell : FactoryBaseCell {
  internal var Builds int32

  override func Build() Blob {
    Builds++
    return Cell.Mount[FactoryBaseCell](nil, () -> this)
  }
}

internal data struct CellInputFixtureValue {
  internal var Label string
  internal var Count int32
}

internal func cellInputFixture(input CellInputFixtureValue) Blob -> Cell.Mount[CellInputFixtureValue, CellInputFixtureCell](nil, input)

internal class CellInputFixtureCell : Cell[CellInputFixtureValue] {
  shared { internal var Builds int32 }

  override func Build() Blob {
    Builds = Builds + 1
    return Text{ Content: "${Input.Label}:${Input.Count}" }
  }
}

internal data struct CellCallbackInputFixtureValue {
  internal var Label string
  internal var OnClick Action
}

internal func cellCallbackInputFixture(input CellCallbackInputFixtureValue) Blob -> Cell.Mount[CellCallbackInputFixtureValue, CellCallbackInputFixtureCell](nil, input)

internal open class CellCallbackInputFixtureCell : Cell[CellCallbackInputFixtureValue] {
  shared {
    internal var Builds int32
    internal var Callback string
    internal var SnapshotWasStored bool
  }

  protected override func ShouldRebuild(previous CellCallbackInputFixtureValue, next CellCallbackInputFixtureValue) bool {
    SnapshotWasStored = Input.Label == next.Label
    return previous.Label != next.Label
  }

  override func Build() Blob {
    Builds = Builds + 1
    return Container{ OnClick: () -> { Input.OnClick() } }
  }
}

internal data struct CellThrowingInputFixtureValue {
  internal var Label string
}

internal func cellThrowingInputFixture(input CellThrowingInputFixtureValue) Blob -> Cell.Mount[CellThrowingInputFixtureValue, CellThrowingInputFixtureCell](nil, input)

internal open class CellThrowingInputFixtureCell : Cell[CellThrowingInputFixtureValue] {
  shared {
    internal var Builds int32
    internal var ThrowOnce bool
  }

  protected override func ShouldRebuild(previous CellThrowingInputFixtureValue, next CellThrowingInputFixtureValue) bool {
    if ThrowOnce {
      ThrowOnce = false
      throw InvalidOperationException("throw once")
    }
    return previous.Label != next.Label
  }

  override func Build() Blob {
    Builds = Builds + 1
    return Text{ Content: Input.Label }
  }
}

internal class CellSchedulingSiblingsParent : Cell {
  override func Build() Blob -> Container() {
    Cell.Mount[CellSchedulingLeft]("left"),
    Cell.Mount[CellSchedulingRight]("right"),
  }
}

internal class CellSchedulingLeft : Cell {
  internal var Builds int32

  internal func RequestMany() {
    Rebuild()
    Rebuild()
    Rebuild()
  }

  override func Build() Blob {
    Builds = Builds + 1
    return Text{ Content: "left" }
  }
}

internal class CellSchedulingRight : Cell {
  internal var Builds int32

  internal func RequestMany() {
    Rebuild()
    Rebuild()
    Rebuild()
  }

  override func Build() Blob {
    Builds = Builds + 1
    return Text{ Content: "right" }
  }
}

internal class CellSchedulingDirectParent : Cell {
  internal var Builds int32

  override func Build() Blob {
    Builds++
    return Cell.Mount[CellSchedulingDirectChild](nil)
  }
}

internal class CellSchedulingDirectChild : Cell {
  shared { internal var Last CellSchedulingDirectChild? }
  internal var Builds int32
  private var fail bool

  init() { Last = this }

  internal func RequestFailure() {
    fail = true
    Rebuild()
  }

  override func Build() Blob {
    Builds++
    if fail {
      fail = false
      throw InvalidOperationException("direct failure")
    }
    return Text{ Content: "direct" }
  }
}

internal class CellSchedulingRecoveryParent : Cell {
  override func Build() Blob -> Container() {
    Cell.Mount[CellSchedulingRecoveryFirst]("first"),
    Cell.Mount[CellSchedulingRecoverySecond]("second"),
  }
}

internal class CellSchedulingRecoveryFirst : Cell {
  shared { internal var ThrowOnce bool }
  internal var Builds int32

  internal func Request() { Rebuild() }

  override func Build() Blob {
    Builds = Builds + 1
    if ThrowOnce {
      ThrowOnce = false
      throw InvalidOperationException("recovery fixture")
    }
    return Text{ Content: "first" }
  }
}

internal class CellSchedulingRecoverySecond : Cell {
  internal var Builds int32

  internal func Request() { Rebuild() }

  override func Build() Blob {
    Builds = Builds + 1
    return Text{ Content: "second" }
  }
}

internal class CellSchedulingOrderParent : Cell {
  shared { internal var Trace string }
  internal var Builds int32
  private var label string

  init() { label = "before" }

  internal func Change(value string) {
    label = value
    Rebuild()
  }

  override func Build() Blob {
    Builds = Builds + 1
    Trace = Trace + "P"
    return Container() {
      Cell.Mount[CellSchedulingOrderInput, CellSchedulingOrderChild](
        nil,
        CellSchedulingOrderInput{ Label: label }),
    }
  }
}

internal data struct CellSchedulingOrderInput {
  internal var Label string
}

internal class CellSchedulingOrderChild : Cell[CellSchedulingOrderInput] {
  internal var Builds int32

  internal func Request() { Rebuild() }

  override func Build() Blob {
    Builds = Builds + 1
    CellSchedulingOrderParent.Trace = CellSchedulingOrderParent.Trace + "C"
    return Text{ Content: Input.Label }
  }
}

internal class CellSchedulingRemovalParent : Cell {
  private var showChild bool

  init() { showChild = true }

  internal func Remove() {
    showChild = false
    Rebuild()
  }

  override func Build() Blob {
    if showChild {
      return Container() {
        Cell.Mount[CellSchedulingRemovalChild](),
      } }
    return Container() { Text{ Content: "removed" },}
  }
}

internal class CellSchedulingRemovalChild : Cell, IDisposable {
  shared { internal var Disposals int32 }
  internal var Builds int32

  internal func RequestMany() {
    Rebuild()
    Rebuild()
    Rebuild()
  }

  func Dispose() { Disposals = Disposals + 1 }

  override func Build() Blob {
    Builds = Builds + 1
    return Text{ Content: "child" }
  }
}

internal class CellSchedulingDeferredParent : Cell {
  override func Build() Blob -> Container() {
    Cell.Mount[CellSchedulingDeferredFirst]("first"),
    Cell.Mount[CellSchedulingDeferredSecond]("second"),
  }
}

internal class CellSchedulingDeferredFirst : Cell {
  internal var Builds int32
  private var triggerPeer bool

  internal func TriggerPeer() {
    triggerPeer = true
    Rebuild()
  }

  override func Build() Blob {
    Builds = Builds + 1
    if triggerPeer {
      triggerPeer = false
      if let peer = CellSchedulingDeferredSecond.Last {
        peer.Request()
      }
    }
    return Text{ Content: "first" }
  }
}

internal class CellSchedulingDeferredSecond : Cell {
  shared { internal var Last CellSchedulingDeferredSecond? }
  internal var Builds int32

  init() { Last = this }

  internal func Request() { Rebuild() }

  override func Build() Blob {
    Builds = Builds + 1
    return Text{ Content: "second" }
  }
}

internal class DirectParentCell : Cell {
  override func Build() Blob -> Cell.Mount[DirectChildCell](nil)
}

internal class DirectChildCell : Cell {
  shared { internal var Last DirectChildCell? }
  private var count int32

  init() {
    Last = this
  }

  internal func Change() {
    count = count + 1
    Rebuild()
  }

  override func Build() Blob -> Text { Content: "direct:$count" }
}

internal class DirectCallbackParent : Cell {
  private let child Cell

  init(child Cell) { this.child = child }

  override func Build() Blob -> Cell.Mount[Cell](nil, () -> child)
}

internal class DirectCallbackCell : Cell {
  internal var Count int32
  internal var Builds int32

  override func Build() Blob {
    Builds++
    return Button{
      Width: 100,
      Height: 100,
      OnClick: () -> { Count++ },
      Text{ Content: "clicked:$Count" },
    }
  }
}

internal class KeyedRollbackParent : Cell {
  internal let Handle ElementHandle = ElementHandle{}
  internal let First KeyedRollbackDisposableCell = KeyedRollbackDisposableCell(true)
  internal let Second KeyedRollbackDisposableCell = KeyedRollbackDisposableCell(false)
  internal let Failure Exception = InvalidOperationException("mount failed")
  internal var Fail bool

  override func Build() Blob {
    if !Fail {
      return Container() {
        Cell.Mount[bool, KeyedRollbackChangingCell]("replacement", false),
        Text{ Key: "keep", Handle: Handle, Content: "kept" },
      }
    }
    return Container() {
      Cell.Mount[bool, KeyedRollbackChangingCell]("replacement", true),
      Text{ Key: "moved", Handle: Handle, Content: "moved" },
      Cell.Mount[KeyedRollbackDisposableCell]("first", () -> First),
      Cell.Mount[KeyedRollbackDisposableCell]("second", () -> Second),
      Cell.Mount[KeyedRollbackFailureCell]("failure", () -> KeyedRollbackFailureCell(Failure)),
    }
  }
}

internal class KeyedRollbackChangingCell : Cell[bool] {
  internal let Handle ElementHandle = ElementHandle{}
  internal let Child KeyedRollbackDisposableCell = KeyedRollbackDisposableCell(true)

  override func Build() Blob {
    if !Input { return Text{ Handle: Handle, Content: "original" } }
    return Container{
      Handle: Handle,
      Cell.Mount[KeyedRollbackDisposableCell](nil, () -> Child),
    }
  }
}

internal class KeyedRollbackDisposableCell : Cell, IDisposable {
  internal let Handle ElementHandle = ElementHandle{}
  internal var Disposals int32
  private let fail bool

  init(fail bool) { this.fail = fail }

  override func Build() Blob -> Container{ Handle: Handle, Width: 10, Height: 10 }

  func Dispose() {
    Disposals++
    if fail { throw InvalidOperationException("dispose failed") }
  }
}

internal class KeyedRollbackFailureCell : Cell {
  private let failure Exception

  init(failure Exception) { this.failure = failure }

  override func Build() Blob { throw failure }
}

internal class KeyedDisposableCell : Cell, IDisposable {
  shared { internal var Disposals int32 }
  func Dispose() { Disposals = Disposals + 1 }
  override func Build() Blob -> Text { Content: "keyed" }
}

internal class PositionalDisposableCell : Cell, IDisposable {
  shared { internal var Disposals int32 }
  func Dispose() { Disposals = Disposals + 1 }
  override func Build() Blob -> Text { Content: "positional" }
}

internal class ReplacementDisposableCell : Cell, IDisposable {
  shared { internal var Disposals int32 }
  func Dispose() { Disposals = Disposals + 1 }
  override func Build() Blob -> Text { Content: "replacement" }
}

internal class ReplacementOtherCell : Cell {
  override func Build() Blob -> Text { Content: "other" }
}

internal class WindowDisposableCell : Cell, IDisposable {
  shared { internal var Disposals int32 }
  func Dispose() { Disposals = Disposals + 1 }
  override func Build() Blob -> Text { Content: "window" }
}

internal class RetirementDisposableCell : Cell[string], IDisposable {
  shared {
    internal var FirstDisposals int32
    internal var LaterDisposals int32

    internal func Reset() {
      FirstDisposals = 0
      LaterDisposals = 0
    }
  }

  func Dispose() {
    if Input == "first" {
      FirstDisposals++
    } else {
      LaterDisposals++
    }
    throw InvalidOperationException("retire-$Input")
  }

  override func Build() Blob -> Text { Content: Input }
}

internal class WindowCleanupParent : Cell {
  override func Build() Blob -> Container() {
    Cell.Mount[string, RetirementDisposableCell]("first", "first"),
    Cell.Mount[string, RetirementDisposableCell]("later", "later"),
  } }

public partial class Window {
  internal func NativeModalCloseDrainsCompletionForTest(scheduled bool) bool {
    host = EmbeddedWindowBridge(ElementHandleEmbeddedHost(), this)
    IsOpen = true
    let lease = NativeModalLease(this, nint(0))
    nativeModal = lease
    var completed = false
    lease.Closing = () -> lease.PostCompletion(() -> {
      completed = true
      lease.Dispose()
    })
    if scheduled {
      host!!.BeginClose()
      PumpScheduled(0.0)
    } else {
      Close()
    }
    return completed && !IsOpen
  }

  internal func DeferredCloseStopsPostsForTest() bool {
    Size = LayoutSize(100, 100)
    let pending = DeferredCloseTarget()
    host = EmbeddedWindowBridge(ElementHandleEmbeddedHost(), this)
    windowTarget = pending
    IsOpen = true
    var calls = 0
    Post(() -> { calls++ })
    RequestClose()
    try {
      PumpScheduled(0.0)
      return pending.CloseChecks > 0 && IsOpen && calls == 0 && !Post(() -> { calls++ })
    } finally {
      windowTarget = nil
      Close()
    }
  }

  internal func EmbeddedDetachWaitsForClosePreparationForTest() bool {
    let pending = DeferredCloseTarget{QueuePending: false, CloseAfterChecks: 3}
    windowTarget = pending
    DetachEmbeddedPresentation()
    return pending.Disposed && pending.CloseChecks == 3 && windowTarget == nil
  }
}

internal class DeferredCloseTarget : WindowRenderTarget {
  internal var CloseChecks int32
  internal var QueuePending bool = true
  internal var CloseAfterChecks int32 = int32.MaxValue
  internal var Disposed bool
  public event PresentationAccepted Action[int64]
  public prop ProfileSink FrameProfileSink { get -> throw NotSupportedException() }
  public prop NeedsRender bool { get -> false }
  public prop MemoryPressureWaiting bool { get -> false }
  public prop LastFrameSubmitted bool { get -> false }
  public prop QueueWorkPending bool { get -> QueuePending }
  public prop RetirementWorkPending bool { get -> true }
  public func PrepareClose() bool {
    CloseChecks++
    return CloseChecks >= CloseAfterChecks
  }
  public func SetVSync(value bool) { }
  public func SetHidden(value bool) { }
  public func BeginFrame() { }
  public func Render(root Node?, portalRoot Node?, background Color, dpi Vector2, overlay DiagnosticOverlay?) { }
  public func Present() { }
  public func ServicePendingSubmission() bool -> false
  public func PollQueueCompletion() bool -> false
  public func Resize(width int32, height int32) bool -> true
  public func RequestCapture(root Node?, portalRoot Node?, background Color, dpi Vector2,
    reusablePixels([]uint8)? = nil) WindowReadbackRequestStatus -> WindowReadbackRequestStatus.NotReady
  public func PollCapture() WindowReadbackPollStatus -> WindowReadbackPollStatus.NotReady
  public prop CaptureFailure Exception? { get -> nil }
  public func TakeCaptureResult() WindowReadbackResult? -> nil
  public func Dispose() {
    if CloseChecks < CloseAfterChecks {
      throw InvalidOperationException("Presentation was disposed before close preparation completed")
    }
    Disposed = true
  }
}

internal data struct CallbackSlotInput {
  internal var Content Blob
}

internal open class CallbackSlotCell : Cell[CallbackSlotInput] {
  protected override func Build(input CallbackSlotInput) Blob -> input.Content
}

internal data struct CallbackForwardInput {
  internal var Click Action
  internal var Change Action[int32]
  internal var Pair Action[int32, int32]
  internal var Result Func[int32, bool]
}

internal open class CallbackForwardCell : Cell[CallbackForwardInput] {
  protected override func Build(input CallbackForwardInput) Blob -> Button{
    Width: 100, Height: 30, OnClick: Forward,
  }

  private func Forward() {
    InvokeInputCallback(Input.Click)
    InvokeInputCallback(Input.Change, 7)
    InvokeInputCallback(Input.Pair, 4, 5)
    if !InvokeInputCallback(Input.Result, 9, false) { throw InvalidOperationException("Callback result was lost") }
  }
}

internal open class CallbackUnchangedCell : Cell {
  internal var Builds int32
  override func Build() Blob {
    Builds++
    return Container{Height: 10}
  }
}

internal class CallbackOriginHost : Cell {
  internal var Builds int32
  internal var Value string = ""
  internal var MountKey string = "initial"
  internal var CacheContent bool
  private var cachedContent Blob?

  override func Build() Blob {
    Builds++
    let content = cachedContent ?? Button{Width: 100, Height: 30, OnClick: () -> Value = "slot"}
    if CacheContent { cachedContent = content }
    return Container{
      FlexDirection: FlexDirection.Column,
      Text{Content: Value, Height: 20},
      Cell.Mount[CallbackSlotInput, CallbackSlotCell](MountKey, CallbackSlotInput{
        Content: content,
      }),
      Cell.Mount[CallbackForwardInput, CallbackForwardCell]("forward", CallbackForwardInput{
        Click: () -> Value = "forward",
        Change: value -> Value += ":" + value.ToString(),
        Pair: (first, second) -> Value += ":" + (first + second).ToString(),
        Result: value -> {
          Value += ":" + (value == 9).ToString()
          return true
        },
      }),
      Cell.Mount[CallbackUnchangedCell]("unchanged"),
    }
  }
}

internal class ControlledEditorValueCell : Cell {
  private let controller TextEditorController
  internal var Value string = "initial"
  internal var Builds int32
  internal var Changes int32

  init(controller TextEditorController) { this.controller = controller }

  override func Build() Blob {
    Builds++
    let document = controller.Document
    if document.GetText() != Value {
      document.Apply(TextChange(TextRange(0, document.Length), Value))
    }
    return TextEditor(){ Controller = controller,
      Width = 200,
      Height = 100,
      OnChange = change -> { Changes++ },
    }
  }
}

internal class DeferredCallbackHost : Cell {
  private let key Context[int32] = Context[int32]()
  private let mode string
  internal var Count int32
  internal var Builds int32
  internal let Child DirectCallbackCell = DirectCallbackCell()

  init(mode string) { this.mode = mode }

  override func Build() Blob {
    Builds++
    let content = switch mode {
      case "factory": Cell.Mount[DeferredCallbackContent](nil, () -> DeferredCallbackContent(Content()))
      case "input": Cell.Mount[Blob, DeferredCallbackInput](nil, Content())
      case "child": key.Scope(Count, () -> Cell.Mount[DirectCallbackCell](nil, () -> Child))
      case _: key.Scope(Count, () -> mode == "nested" ? key.Scope(key.Read(), Content) : Content())
    }
    return Container() {
      Text{Content: Count.ToString(), Height: 20},
      content,
    }
  }

  private func Content() Blob -> Button{
    Width: 100,
    Height: 30 + (mode == "factory" || mode == "input" ? Count : key.Read()),
    OnClick: () -> { Count++ },
  }
}

internal class DeferredCallbackContent : Cell {
  internal var Content Blob?
  init(content Blob? = nil) { Content = content }
  override func Build() Blob -> Content!!
}

internal class MountedDefaultFixtureCell : Cell {
  internal var Builds int32
  override func Build() Blob {
    Builds++
    return Text{Content: "plain"}
  }
}

internal class MountedMeasurementFixtureCell : Cell {
  private let handle ElementHandle = ElementHandle()
  private var width float64 = -1.0
  internal var Builds int32
  protected override func Mounted() { width = handle.BorderBox.Width }
  override func Build() Blob {
    Builds++
    return Text{Handle: handle, Width: 120, Height: 20, Content: "w=$width"}
  }
}

internal class DeferredCallbackInput : Cell[Blob] {
  protected override func Build(input Blob) Blob -> input
}

internal class MountedBaseCallFixtureCell : Cell {
  internal var Builds int32
  internal var Value string = "before"
  protected override func Mounted() {
    base.Mounted()
    Value = "after"
  }
  override func Build() Blob {
    Builds++
    return Text{Content: Value}
  }
}
