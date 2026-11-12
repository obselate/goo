package Goo

import System
import System.Collections.Generic
import System.Threading

public abstract class StateDependency {
  private var readers List[Cell]?
  private var threadId int32

  internal open func IsSafePayload() bool -> false

  internal func CheckWrite() {
    let owner = Volatile.Read(&threadId)
    if owner != 0 && Environment.CurrentManagedThreadId != owner {
      throw InvalidOperationException("State writes require the UI thread of its first reader.")
    }
    if Cell.StateReader != nil || ContextEnvironment.StateReader != nil {
      throw InvalidOperationException("State writes are not allowed during Build.")
    }
  }

  internal func AddReader(cell Cell) {
    let current = Environment.CurrentManagedThreadId
    var owner = Volatile.Read(&threadId)
    if owner == 0 { owner = Interlocked.CompareExchange(&threadId, current, 0) }
    if owner != 0 && owner != current {
      throw InvalidOperationException("State cannot be read by Cells on different UI threads.")
    }
    readers ??= List[Cell]()
    readers!!.Add(cell)
  }

  internal func RemoveReader(cell Cell) { readers?.Remove(cell) }

  internal func Read() {
    if let reader = Cell.StateReader {
      reader.ReadState(this)
      return
    }
    ContextEnvironment.StateReader?.ReadState(this)
  }

  internal func Changed() {
    guard let cells = readers else { return }
    for index in 0 ... cells.Count { cells[index].Rebuild() }
  }
}

public class State[T any] : StateDependency {
  private var current T

  public init(initial T) { current = initial }

  internal override func IsSafePayload() bool ->
    typeof(T).IsPrimitive || typeof(T).IsEnum || typeof(T) == typeof(string) || typeof(T) == typeof(ElementHandle)

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

  public override func ToString() string -> if let text = Value?.ToString() { text } else { "" }

  public func operator implicit(value State[T]) T -> value.Value
}
