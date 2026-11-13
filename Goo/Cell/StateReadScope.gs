package Goo

import System
import System.Collections.Generic

internal data struct StateReadFrame {
  internal var Cell Cell?
  internal var Scope StateReadScope?
}

internal sealed class StateReadScope : IDisposable {
  private let owner Cell?
  private let invalidated Action
  private let threadId int32 = Environment.CurrentManagedThreadId
  private var reads List[StateDependency]?
  private var pending List[StateDependency]?
  private var preserving bool
  private var reading bool
  private var disposed bool
  internal var StateChanged bool

  internal init(owner Cell?, invalidated Action) {
    this.owner = owner
    this.invalidated = invalidated
  }

  shared {
    @ThreadStatic
    internal var Current StateReadScope?
  }

  internal func Enter(preserveReads bool = false) StateReadFrame {
    if disposed || reading { throw InvalidOperationException("State read scope is disposed or already active.") }
    if Environment.CurrentManagedThreadId != threadId {
      throw InvalidOperationException("State read scopes require their owning UI thread.")
    }
    let previous = StateReadFrame{Cell: Cell.StateReader, Scope: Current}
    preserving = preserveReads
    reading = true
    Cell.StateReader = nil
    Current = this
    return previous
  }

  internal func Exit(previous StateReadFrame, succeeded bool) {
    if !reading || Current != this { throw InvalidOperationException("State read scopes must exit in reverse entry order.") }
    try {
      if succeeded && !preserving {
        if let old = reads {
          for index in 0 ... old.Count {
            let state = old[index]
            if pending?.Contains(state) != true { state.RemoveReader(this) }
          }
        }
        let old = reads
        reads = pending
        pending = old
      } else if let observed = pending {
        for index in 0 ... observed.Count {
          let state = observed[index]
          if reads?.Contains(state) == true { continue }
          if succeeded {
            reads ??= List[StateDependency]()
            reads!!.Add(state)
          } else { state.RemoveReader(this) }
        }
      }
      pending?.Clear()
    } finally {
      reading = false
      Current = previous.Scope
      Cell.StateReader = previous.Cell
    }
  }

  internal func ReadState(state StateDependency) {
    pending ??= List[StateDependency]()
    if pending!!.Contains(state) { return }
    if reads?.Contains(state) != true { state.AddReader(this) }
    pending!!.Add(state)
    if !state.IsSafePayload() { ObserveUntrackedRead() }
  }

  internal func ObserveUntrackedRead() { owner?.RegisterUntrackedScope(this) }

  internal func RebuildFromState() {
    StateChanged = true
    Rebuild()
  }

  public func Rebuild() {
    if !disposed { invalidated() }
  }

  public func Dispose() {
    if disposed { return }
    if reading { throw InvalidOperationException("Cannot dispose an active State read scope.") }
    disposed = true
    if let old = reads {
      for index in 0 ... old.Count { old[index].RemoveReader(this) }
    }
    if let observed = pending {
      for index in 0 ... observed.Count { observed[index].RemoveReader(this) }
    }
    reads = nil
    pending = nil
    owner?.UnregisterUntrackedScope(this)
  }
}
