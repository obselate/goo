package Goo

import System
import System.Collections.Generic
import System.Threading

/// Base type of tracked Cell state.
public abstract class StateDependency {
  private var readers List[object]?
  private var threadId int32

  internal open func IsSafePayload() bool -> false

  internal func CheckWrite() {
    let owner = Volatile.Read(&threadId)
    if owner != 0 && Environment.CurrentManagedThreadId != owner {
      throw InvalidOperationException("State writes require the UI thread of its first reader.")
    }
    if Cell.StateReader != nil || StateReadScope.Current != nil || ContextEnvironment.StateReader != nil {
      throw InvalidOperationException("State writes are not allowed during Build.")
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

  internal func Read() {
    if let reader = Cell.StateReader {
      reader.ReadState(this)
      return
    }
    if let builderScope = StateReadScope.Current {
      builderScope.ReadState(this)
      return
    }
    ContextEnvironment.StateReader?.ReadState(this)
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
public class State[T any] : StateDependency {
  private var current T

  /// Creates state with an initial value.
  public init(initial T) { current = initial }

  internal override func IsSafePayload() bool ->
    typeof(T).IsPrimitive || typeof(T).IsEnum || typeof(T) == typeof(string) || typeof(T) == typeof(ElementHandle)

  /// Gets or sets the value. Reads in Build and retained builders subscribe their owner.
  /// Equal writes do nothing. Changed writes invalidate the subscribed readers.
  /// Writes during Build throw. After its first reader, state requires that reader's UI thread.
  public prop Value T {
    get {
      Read()
      return current
    }
    set {
      CheckWrite()
      if EqualityComparer[T].Default.Equals(current, value) { return }
      current = value
      Changed()
    }
  }

  /// Returns the text of the current value.
  public override func ToString() string -> if let text = Value?.ToString() { text } else { "" }

  /// Converts state to its current value.
  public func operator implicit(value State[T]) T -> value.Value
}
