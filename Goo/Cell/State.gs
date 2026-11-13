package Goo

import System
import System.Collections.Generic
import System.Threading

internal class StateDependency {
  private var readers List[object]?
  private var threadId int32
  private let safePayload bool

  internal init(safePayload bool) { this.safePayload = safePayload }

  internal func IsSafePayload() bool -> safePayload

  shared {
    internal func SafePayload(type Type) bool ->
      type.IsPrimitive || type.IsEnum || type == typeof(string) || type == typeof(ElementHandle)

    internal func Reader() object? {
      if let cell = Cell.StateReader { return cell }
      if let builderScope = StateReadScope.Current { return builderScope }
      return ContextEnvironment.StateReader
    }

    internal func CheckWrite(dependency StateDependency?) {
      let owner = if let value = dependency { Volatile.Read(&value.threadId) } else { 0 }
      if owner != 0 && Environment.CurrentManagedThreadId != owner {
        throw InvalidOperationException("State writes require the UI thread of its first reader.")
      }
      if Cell.StateReader != nil || StateReadScope.Current != nil || ContextEnvironment.StateReader != nil {
        throw InvalidOperationException("State writes are not allowed during Build.")
      }
    }
  }

  internal func AddReader(reader object) {
    let current = Environment.CurrentManagedThreadId
    var owner = Volatile.Read(&threadId)
    if owner == 0 { owner = Interlocked.CompareExchange(&threadId, current, 0) }
    if owner != 0 && owner != current {
      throw InvalidOperationException("State cannot be read by Cells on different UI threads.")
    }
    readers ??= List[object]()
    readers!!.Add(reader)
  }

  internal func RemoveReader(reader object) { readers?.Remove(reader) }

  internal func Read(reader object) {
    if reader is Cell { reader.ReadState(this) }
    else if reader is StateReadScope { reader.ReadState(this) }
  }

  internal func Changed() {
    guard let cells = readers else { return }
    for index in 0 ... cells.Count {
      let reader = cells[index]
      if reader is Cell { reader.RebuildFromState() }
      else if reader is StateReadScope { reader.RebuildFromState() }
    }
  }
}

/// Holds a value that invalidates the Cells and retained builders that read it.
public class State[T any] {
  private var current T
  private var dependency StateDependency?

  /// Creates state with an initial value.
  public init(initial T) { current = initial }

  /// Gets or sets the value. Reads in Build and retained builders subscribe their owner.
  /// Equal writes do nothing. Changed writes invalidate the subscribed readers.
  /// Writes during Build throw. After its first reader, writes require that reader's UI thread.
  public prop Value T {
    get {
      if let reader = StateDependency.Reader() {
        var tracked = Volatile.Read(&dependency)
        if tracked == nil {
          let created = StateDependency(StateDependency.SafePayload(typeof(T)))
          tracked = Interlocked.CompareExchange(&dependency, created, nil) ?? created
        }
        tracked.Read(reader)
      }
      return current
    }
    set {
      StateDependency.CheckWrite(Volatile.Read(&dependency))
      if EqualityComparer[T].Default.Equals(current, value) { return }
      current = value
      dependency?.Changed()
    }
  }

  /// Returns the text of the current value.
  public override func ToString() string -> if let text = Value?.ToString() { text } else { "" }

  /// Converts state to its current value.
  public func operator implicit(value State[T]) T -> value.Value
}
