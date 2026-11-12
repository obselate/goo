package Goo

import System
import System.Diagnostics

internal class StateFixtures {
  func BuilderScopeDependencyTransactionContract() bool {
    let cell = StateScopeFixtureCell()
    let window = Window{Root: cell, Width: 200, Height: 100}
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
    let window = Window{Root: cell, Width: 200, Height: 100}
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
    let window = Window{Root: Cell(), Width: 200, Height: 100}
    try {
      StateVerification.Override = nil
      if !DevTools.HasSessions && StateVerification.Enabled != Debugger.IsAttached { return false }
      using let diagnostics = DevTools.Attach(window)
      if !StateVerification.Enabled { return false }
      StateVerification.Enabled = false
      if StateVerification.Enabled { return false }
      StateVerification.Enabled = true
      return StateVerification.Enabled
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
        let window = Window{Root: StateVerificationFixtureCell(mode), Width: 200, Height: 100}
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
        let window = Window{Root: StateVerificationFixtureCell(mode), Width: 200, Height: 100}
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
    let window = Window{Root: cell, Width: 200, Height: 100, SmoothScrolling: false}
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

  private func containsText(node Node, text string) bool {
    if node.Content == text { return true }
    for index in 0 ... node.Children.Count {
      if containsText(node.Children[index], text) { return true }
    }
    return false
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
    return Virtual(StateVirtualFixtureSource(Rows)){Handle = Handle, Width = 200, Height = 60}
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
