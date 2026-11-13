package Goo

import System
import System.Diagnostics
import System.Collections.Generic
import System.Threading.Tasks

internal class StateFixtures {
  func CellBuildRejectsStateWritesContract() bool {
    let cell = StateRigorFixtureCell("build-write")
    let window = Window{Root: cell, Size: LayoutSize(200, 100)}
    try {
      try { window.UpdateTree() }
      catch (error InvalidOperationException) {
        return error.Message.Contains("State writes are not allowed during Build") && cell.Value.Value == 0
      }
      return false
    } finally { window.Close() }
  }

  func StateWritesRequireReaderThreadContract() bool {
    let cell = StateRigorFixtureCell("plain")
    let window = Window{Root: cell, Size: LayoutSize(200, 100)}
    try {
      window.UpdateTree()
      let rejected = Task.Run(() -> {
        try { cell.Value.Value = 1 }
        catch (error InvalidOperationException) { return error.Message.Contains("UI thread") }
        return false
      }).GetAwaiter().GetResult()
      if !rejected || cell.Value.Value != 0 || cell.IsDirty() { return false }
      cell.Value.Value = 2
      window.UpdateTree()
      return window.Tree?.Content == "2"
    } finally { window.Close() }
  }

  func StateOnlySchedulingAndMountedContract() bool {
    let previous = Application.VerifyState
    Application.VerifyState = false
    try {
      for mode in []string{"mounted-no-write", "mounted-write"} {
        StateRigorProbe.Builds = 0
        let window = Window{Root: StateRigorFixtureCell(mode), Size: LayoutSize(200, 100)}
        try {
          window.UpdateTree()
          window.UpdateTree()
          let expected = mode == "mounted-write" ? 2 : 1
          if StateRigorProbe.Builds != expected || window.Tree?.Content != (expected - 1).ToString() { return false }
        } finally { window.Close() }
      }
      return Window{Root: StateRigorFixtureCell("plain"), Size: LayoutSize(200, 100)}.StateOnlySchedulingForTest()
    } finally { Application.VerifyState = previous }
  }

  func InputChangedTracksOnlyBuildReadsContract() bool {
    let previous = Application.VerifyState
    Application.VerifyState = false
    StateRigorProbe.Builds = 0
    StateRigorProbe.Inputs = 0
    let child = StateInputRigorCell()
    let parent = StateInputRigorParent(child)
    let window = Window{Root: parent, Size: LayoutSize(200, 100)}
    try {
      window.UpdateTree()
      window.UpdateTree()
      if StateRigorProbe.Inputs != 1 || StateRigorProbe.Builds != 1 || window.Tree?.Content != "1:1" { return false }
      parent.Rebuild()
      window.UpdateTree()
      if StateRigorProbe.Inputs != 1 || StateRigorProbe.Builds != 1 { return false }
      parent.InputValue = 2
      parent.Rebuild()
      window.UpdateTree()
      window.UpdateTree()
      if StateRigorProbe.Inputs != 2 || StateRigorProbe.Builds != 2 || window.Tree?.Content != "2:2" { return false }
      child.Untracked.Value = 7
      window.UpdateTree()
      return StateRigorProbe.Inputs == 2 && StateRigorProbe.Builds == 2 && !parent.IsDirty() && !child.IsDirty()
    } finally {
      window.Close()
      Application.VerifyState = previous
    }
  }

  func UnsafeStatePayloadFallbackStaysPermanentContract() bool {
    let previous = Application.VerifyState
    Application.VerifyState = false
    StateRigorProbe.Builds = 0
    let cell = StateUnsafeRigorCell()
    let window = Window{Root: cell, Size: LayoutSize(200, 100)}
    try {
      window.UpdateTree()
      cell.RunOwnedAction(() -> cell.Values.Value.Add(7))
      window.UpdateTree()
      if StateRigorProbe.Builds != 2 || window.Tree?.Content != "1" { return false }
      cell.ReadUnsafe.Value = false
      window.UpdateTree()
      cell.ClearDirty()
      cell.RunOwnedAction(() -> {})
      window.UpdateTree()
      return StateRigorProbe.Builds == 4 && window.Tree?.Content == "safe"
    } finally {
      window.Close()
      Application.VerifyState = previous
    }
  }

  func PortalVerificationAcceptsUnchangedDeclarationsContract() bool {
    let previous = Application.VerifyState
    Application.VerifyState = true
    try {
      for mode in []string{"scope", "dismiss", "scrim"} {
        let cell = StateRigorFixtureCell(mode)
        let window = Window{Root: cell, Size: LayoutSize(200, 100)}
        try {
          window.UpdateTree()
          window.UpdateTree()
          cell.RunOwnedAction(() -> {})
          window.UpdateTree()
          if !window.Tree!!.IsPortal { return false }
        } finally { window.Close() }
      }
      return true
    } finally { Application.VerifyState = previous }
  }

  func ContextChangeClearsPendingVerificationContract() bool {
    let previous = Application.VerifyState
    Application.VerifyState = true
    let cell = StateRigorFixtureCell("context")
    let window = Window{Root: cell, Size: LayoutSize(200, 100)}
    StateRigorProbe.Context.Set(window, 1)
    try {
      window.UpdateTree()
      window.UpdateTree()
      cell.RunOwnedAction(() -> {})
      StateRigorProbe.Context.Set(window, 2)
      window.UpdateTree()
      return window.Tree?.Content == "2"
    } finally {
      window.Close()
      Application.VerifyState = previous
    }
  }
  func ProviderChangeClearsPendingVerificationContract() bool {
    let previous = Application.VerifyState
    Application.VerifyState = true
    let child = StateRigorFixtureCell("context")
    let parent = StateContextRigorParent(child)
    let window = Window{Root: parent, Size: LayoutSize(200, 100)}
    try {
      window.UpdateTree()
      window.UpdateTree()
      child.RunOwnedAction(() -> { parent.Value.Value = 2 })
      window.UpdateTree()
      return window.Tree?.Content == "2"
    } finally {
      window.Close()
      Application.VerifyState = previous
    }
  }

  func FailedRootMountClearsReadsAndKeepsBuildErrorContract() bool {
    let cell = StateRigorFixtureCell("mount-failure")
    let window = Window{Root: cell, Size: LayoutSize(200, 100)}
    try {
      try { window.UpdateTree() }
      catch (error InvalidOperationException) {
        if error.Message != "Build failure" || !(error.Data["Goo.Cell.CancellationError"] is AggregateException) { return false }
        cell.ClearDirty()
        cell.Value.Value = 1
        return !cell.IsDirty()
      }
      return false
    } finally { window.Close() }
  }

  func BuilderScopeDependencyTransactionContract() bool {
    let cell = StateScopeFixtureCell()
    let window = Window{Root: cell, Size: LayoutSize(200, 100)}
    try {
      window.UpdateTree()
      cell.Value.Value = 1
      window.UpdateTree()
      if window.Tree?.Content != "1" || cell.Invalidations != 1 { return false }
      cell.Value.Value = 1
      if cell.Invalidations != 1 { return false }
      cell.Fail = true
      cell.Rebuild()
      var failed = false
      try { window.UpdateTree() } catch (_ InvalidOperationException) { failed = true }
      if !failed { return false }
      cell.Fail = false
      cell.Other.Value = 7
      if cell.Invalidations != 1 { return false }
      cell.Value.Value = 2
      window.UpdateTree()
      if window.Tree?.Content != "2" || cell.Invalidations != 2 { return false }
      cell.UseOther = true
      cell.Rebuild()
      window.UpdateTree()
      cell.Value.Value = 3
      if cell.Invalidations != 2 { return false }
      cell.Other.Value = 8
      window.UpdateTree()
      return window.Tree?.Content == "8" && cell.Invalidations == 3
    } finally {
      window.Close()
      let before = cell.Invalidations
      cell.Other.Value = 9
      if before != cell.Invalidations { throw InvalidOperationException("Disposed builder retained a State subscription.") }
    }
  }

  func BuilderScopeIncrementalAndNestedContract() bool {
    let cell = StateScopeFixtureCell()
    let window = Window{Root: cell, Size: LayoutSize(200, 100)}
    using let outer = StateReadScope(cell, () -> cell.Rebuild())
    using let inner = StateReadScope(cell, () -> cell.Rebuild())
    let first = State[int32](0)
    let second = State[int32](0)
    try {
      window.UpdateTree()
      let previous = outer.Enter()
      let one = first.Value
      let nested = inner.Enter()
      let two = second.Value
      inner.Exit(nested, true)
      if StateReadScope.Current != outer { return false }
      outer.Exit(previous, true)
      if StateReadScope.Current != nil || Cell.StateReader != nil { return false }
      let incremental = outer.Enter(true)
      let three = second.Value
      outer.Exit(incremental, true)
      first.Value = 1
      if !cell.IsDirty() { return false }
      window.UpdateTree()
      second.Value = 1
      if !cell.IsDirty() { return false }
      window.UpdateTree()
      let replaced = outer.Enter()
      let four = second.Value
      outer.Exit(replaced, true)
      first.Value = 2
      return !cell.IsDirty() && one + two + three + four == 1
    } finally { window.Close() }
  }

  func VerificationSettingContract() bool {
    let previous = StateVerification.Override
    let window = Window{Root: Cell(), Size: LayoutSize(200, 100)}
    try {
      Application.VerifyState = nil
      if !DevTools.HasSessions && StateVerification.Enabled != Debugger.IsAttached { return false }
      using let diagnostics = DevTools.Attach(window)
      if !StateVerification.Enabled || Application.VerifyState != nil { return false }
      StateVerification.Enabled = false
      if StateVerification.Enabled { return false }
      StateVerification.Enabled = true
      Application.VerifyState = nil
      return StateVerification.Enabled && Application.VerifyState == nil
    } finally {
      window.Close()
      StateVerification.Override = previous
    }
  }
  func VerificationRejectsExternalReadsContract() bool {
    let previous = StateVerification.Override
    try {
      StateVerification.Enabled = true
      for mode in []string{"external", "unread", "clock"} {
        StateFixtureExternal.Value = 0
        let window = Window{Root: StateVerificationFixtureCell(mode), Size: LayoutSize(200, 100)}
        try {
          window.UpdateTree()
          var rejected = false
          try {
            window.PlatformInput.PointerMove(0, PointerDevice.Mouse, 10, 10, KeyModifiers{}, 0)
            window.UpdateTree()
          } catch (error InvalidOperationException) {
            rejected = error.Message.Contains("StateVerificationFixtureCell")
              && error.Message.Contains("without a tracked State write")
          }
          if !rejected { return false }
        } finally { window.Close() }
      }
      return true
    } finally { StateVerification.Override = previous }
  }

  func VerificationAcceptsTrackedAndEqualContract() bool {
    let previous = StateVerification.Override
    try {
      StateVerification.Enabled = true
      for mode in []string{"tracked", "equal"} {
        StateFixtureExternal.Value = 0
        let window = Window{Root: StateVerificationFixtureCell(mode), Size: LayoutSize(200, 100)}
        try {
          window.UpdateTree()
          window.PlatformInput.PointerMove(0, PointerDevice.Mouse, 10, 10, KeyModifiers{}, 0)
          window.UpdateTree()
          let expected = mode == "tracked" ? "1" : "0"
          if window.Tree?.Children[0].Content != expected { return false }
        } finally { window.Close() }
      }
      return true
    } finally { StateVerification.Override = previous }
  }
  func VirtualRetainedStateContract() bool {
    let cell = StateVirtualFixtureCell()
    let window = Window{Root: cell, Size: LayoutSize(200, 100), SmoothScrolling: false}
    try {
      window.UpdateTree()
      window.UpdateTree()
      let built = cell.Rows.Built
      let ownerBuilds = cell.Builds
      cell.Rows.Values[1].Value = 7
      window.UpdateTree()
      guard let tree = window.Tree else { return false }
      if cell.Rows.Built != built + 3 || cell.Builds != ownerBuilds || !containsText(tree, "1:7") {
        return false
      }
      let before = cell.Rows.Built
      cell.Rows.Values[9].Value = 9
      window.UpdateTree()
      if cell.Rows.Built != before { return false }
      ScrollState.To(cell.Handle.AttachedNode()!!, 0, 20, true, false)
      window.UpdateTree()
      if cell.Rows.Built != before + 1 { return false }
      let scrolled = cell.Rows.Built
      cell.Rows.Values[0].Value = 8
      window.UpdateTree()
      if cell.Rows.Built != scrolled + 3 { return false }
      cell.Rows.Values[0].Value = 10
      window.UpdateTree()
      return cell.Rows.Built == scrolled + 3
    } finally { window.Close() }
  }

  func VirtualWriteDoesNotMaskVerificationWhenEnabledLaterContract() bool -> verifyScopeHistory(false)

  func VirtualWriteDoesNotMaskVerificationWhenEnabledContract() bool -> verifyScopeHistory(true)

  private func verifyScopeHistory(alreadyEnabled bool) bool {
    let previous = StateVerification.Override
    StateScopeHistoryValues.Value = 0
    StateScopeHistoryValues.Tracked = true
    StateVerification.Enabled = alreadyEnabled
    let cell = StateScopeHistoryCell()
    let window = Window{Root: cell, Size: LayoutSize(200, 100)}
    try {
      window.UpdateTree()
      window.UpdateTree()
      if alreadyEnabled { cell.WriteOutsideCallback() }
      else { window.PlatformInput.PointerMove(0, PointerDevice.Mouse, 10, 10, KeyModifiers{}, 0) }
      window.UpdateTree()
      let ownerTracked = cell.stateChanged
      StateVerification.Enabled = true
      StateScopeHistoryValues.Tracked = false
      var rejected = false
      try {
        window.PlatformInput.PointerMove(0, PointerDevice.Mouse, 11, 10, KeyModifiers{}, 0)
        window.UpdateTree()
      } catch (error InvalidOperationException) {
        rejected = error.Message.Contains("StateScopeHistoryCell")
          && error.Message.Contains("without a tracked State write")
      }
      return rejected && !ownerTracked
    } finally {
      window.Close()
      StateVerification.Override = previous
    }
  }

  func VirtualTrackedWritePassesVerificationContract() bool {
    let previous = StateVerification.Override
    StateScopeHistoryValues.Value = 0
    StateScopeHistoryValues.Tracked = true
    StateVerification.Enabled = true
    let window = Window{Root: StateScopeHistoryCell(), Size: LayoutSize(200, 100)}
    try {
      window.UpdateTree()
      window.UpdateTree()
      window.PlatformInput.PointerMove(0, PointerDevice.Mouse, 10, 10, KeyModifiers{}, 0)
      window.UpdateTree()
      return containsText(window.Tree!!, "row:1")
    } finally {
      window.Close()
      StateVerification.Override = previous
    }
  }

  private func containsText(node Node, text string) bool {
    if node.Content == text { return true }
    for index in 0 ... node.Children.Count {
      if containsText(node.Children[index], text) { return true }
    }
    return false
  }
}

internal class StateRigorProbe {
  shared {
    internal var Builds int32
    internal var Inputs int32
    internal let Context Goo.Context[int32] = Goo.Context[int32]()
  }
}

internal class StateRigorFixtureCell : Cell {
  internal let Value State[int32] = State[int32](0)
  private let mode string

  internal init(mode string) { this.mode = mode }
  internal func Enqueue(action Action) bool -> Post(action)
  internal func Delay(action Action) WindowTimer -> After(0, action)
  internal func Repeat(action Action) WindowTimer -> Every(1, action)

  protected override func Mounted() {
    if mode == "mounted-write" { Value.Value = 1 }
  }

  public override func Build() Blob {
    StateRigorProbe.Builds++
    let value = Value.Value
    if mode == "build-write" { Value.Value = 1 }
    if mode == "mount-failure" {
      Lifetime.Register(() -> { throw InvalidOperationException("Cancellation failure") })
      throw InvalidOperationException("Build failure")
    }
    if mode == "scope" { return Portal{FocusScope: FocusScopeOptions{Modal: true}, Text("scope")} }
    if mode == "dismiss" { return Portal{OnDismiss: _ -> {}, Text("dismiss")} }
    if mode == "scrim" { return Portal{Scrim: Color.Black, Text("scrim")} }
    return Text(mode == "context" ? StateRigorProbe.Context.Read().ToString() : value.ToString())
  }
}

internal class StateInputRigorCell : Cell[int32] {
  internal let Untracked State[int32] = State[int32](0)
  private let value State[int32] = State[int32](0)

  protected override func InputChanged(input int32) {
    StateRigorProbe.Inputs++
    let ignored = Untracked.Value
    value.Value = input
  }

  protected override func Build(input int32) Blob {
    StateRigorProbe.Builds++
    return Text("$input:${value.Value}")
  }
}

internal class StateInputRigorParent : Cell {
  private let child StateInputRigorCell
  internal var InputValue int32 = 1
  internal init(child StateInputRigorCell) { this.child = child }
  public override func Build() Blob -> Cell.Mount[int32, StateInputRigorCell](nil, InputValue, () -> child)
}

internal class StateUnsafeRigorCell : Cell {
  internal let ReadUnsafe State[bool] = State[bool](true)
  internal prop Values State[List[int32]] { get -> StateUnsafeRigorValues.Values }
  public override func Build() Blob {
    StateRigorProbe.Builds++
    return Text(ReadUnsafe.Value ? Values.Value.Count.ToString() : "safe")
  }
}

internal class StateUnsafeRigorValues {
  shared { internal let Values State[List[int32]] = State[List[int32]](List[int32]()) }
}

public partial class Window {
  internal func StateOnlySchedulingForTest() bool {
    IsOpen = true
    StateRigorProbe.Builds = 0
    let cell = cast[StateRigorFixtureCell](Root!!)
    try {
      UpdateTree()
      if !cell.Enqueue(() -> {}) { return false }
      drainPostedActions()
      UpdateTree()
      if StateRigorProbe.Builds != 1 { return false }
      using let once = cell.Delay(() -> {})
      drainTimers(float64(Stopwatch.GetTimestamp()) + float64(Stopwatch.Frequency))
      UpdateTree()
      if StateRigorProbe.Builds != 1 || once.IsActive { return false }
      using let repeat = cell.Repeat(() -> {})
      drainTimers(float64(Stopwatch.GetTimestamp()) + float64(Stopwatch.Frequency))
      UpdateTree()
      if StateRigorProbe.Builds != 1 || !repeat.IsActive { return false }
      cell.Enqueue(() -> { cell.Value.Value = 1 })
      drainPostedActions()
      UpdateTree()
      return StateRigorProbe.Builds == 2 && Tree?.Content == "1"
    } finally { Close() }
  }
}

internal class StateScopeFixtureCell : Cell, IDisposable {
  internal let Value State[int32] = State[int32](0)
  internal let Other State[int32] = State[int32](0)
  internal var Invalidations int32
  internal var Fail bool
  internal var UseOther bool
  private let builderScope StateReadScope

  init() {
    builderScope = StateReadScope(this, () -> {
      Invalidations++
      Rebuild()
    })
  }

  public override func Build() Blob {
    let previous = builderScope.Enter()
    var succeeded = false
    try {
      if Fail {
        let observed = Other.Value
        throw InvalidOperationException("Failed builder after reading $observed.")
      }
      let value = UseOther ? Other.Value : Value.Value
      let result = Text{Content: value.ToString()}
      succeeded = true
      return result
    } finally { builderScope.Exit(previous, succeeded) }
  }

  public func Dispose() { builderScope.Dispose() }
}

internal class StateFixtureExternal {
  shared { internal var Value int32 }
}

internal class StateVerificationFixtureCell : Cell {
  private let value State[int32] = State[int32](0)
  private let unread State[int32] = State[int32](0)
  private let mode string

  init(mode string) { this.mode = mode }

  override func Build() Blob {
    let text = mode == "clock" ? Stopwatch.GetTimestamp().ToString()
      : (value.Value + StateFixtureExternal.Value).ToString()
    let result = Container{Width: 200, Height: 100, OnPointerMove: Move}
    result.Add(Text{Content: text})
    return result
  }

  private func Move(event PointerEvent) {
    if mode == "external" || mode == "unread" { StateFixtureExternal.Value++ }
    if mode == "unread" { unread.Value++ }
    if mode == "tracked" { value.Value++ }
  }
}

internal class StateVirtualFixtureCell : Cell {
  internal let Handle ElementHandle = ElementHandle()
  internal let Rows StateVirtualFixtureRows = StateVirtualFixtureRows()
  internal var Builds int32

  override func Build() Blob {
    Builds++
    return Virtual{Source: StateVirtualFixtureSource(Rows), Handle: Handle, Width: 200, Height: 60}
  }
}

internal class StateVirtualFixtureSource(rows StateVirtualFixtureRows) : VirtualSource {
  public func State(current VirtualState?) VirtualState -> rows
}

internal class StateVirtualFixtureRows : VirtualState {
  internal let Values []State[int32] = [1000]State[int32]
  internal var Built int32
  private var first int32 = -1
  private var nextFirst int32
  private var version int64 = -1
  private var nextVersion int64

  init() {
    for index in 0 ... Values.Length { Values[index] = State[int32](0) }
  }

  public override func Realize(viewport VirtualViewport, output VirtualOutput) {
    nextFirst = int32(viewport.ScrollOffset.Y / 20)
    nextVersion = viewport.ContextVersion
    for index in nextFirst ... nextFirst + 3 {
      var content Blob?
      if nextVersion != version || index < first || index >= first + 3 {
        Built++
        content = Text{Content: "$index:${Values[index].Value}"}
      }
      output.Add(VirtualItem{Key: "row-$index", Index: index, Y: float64(index * 20),
        Width: 200, Height: 20, Content: content})
    }
    output.ContentSize = LayoutSize(200, 20000)
    output.ItemCount = 1000
  }

  public override func NeedsRealize(viewport VirtualViewport) bool ->
    int32(viewport.ScrollOffset.Y / 20) != first

  public override func Commit() {
    first = nextFirst
    version = nextVersion
  }
}

internal class StateScopeHistoryValues {
  shared {
    internal var Value int32
    internal var Tracked bool
  }
}

internal class StateScopeHistoryCell : Cell {
  private let value State[int32] = State[int32](0)

  internal func WriteOutsideCallback() { value.Value++ }

  override func Build() Blob {
    let result = Container{Width: 200, Height: 100, OnPointerMove: Move}
    result.Add(Text{Content: StateScopeHistoryValues.Value.ToString()})
    result.Add(Virtual{Source: StateScopeHistorySource(value), Width: 200, Height: 20})
    return result
  }

  private func Move(event PointerEvent) {
    if StateScopeHistoryValues.Tracked { value.Value++ }
    else { StateScopeHistoryValues.Value++ }
  }
}

internal class StateScopeHistorySource(value State[int32]) : VirtualSource {
  public func State(current VirtualState?) VirtualState -> current ?? StateScopeHistoryRows(value)
}

internal class StateScopeHistoryRows(value State[int32]) : VirtualState {
  public override func Realize(viewport VirtualViewport, output VirtualOutput) {
    output.Add(VirtualItem{Key: "row", Index: 0, Width: 200, Height: 20,
      Content: Text{Content: "row:${value.Value}"}})
    output.ContentSize = LayoutSize(200, 20)
    output.ItemCount = 1
  }

  public override func NeedsRealize(viewport VirtualViewport) bool -> false
}

internal class StateContextRigorParent : Cell {
  internal let Value State[int32] = State[int32](1)
  private let child StateRigorFixtureCell
  internal init(child StateRigorFixtureCell) { this.child = child }
  public override func Build() Blob ->
    StateRigorProbe.Context.Scope(Value.Value, () -> Cell.Mount[StateRigorFixtureCell](nil, () -> child))
}
