package Goo

import System
import System.Diagnostics

internal class StateFixtures {
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
