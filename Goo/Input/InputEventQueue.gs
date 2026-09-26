package Goo

import System.Collections.Generic

internal data struct QueuedInputEvent {
  internal var IsPointer bool
  internal var IsFocusLost bool
  internal var IsFocusGained bool
  internal var Pointer QueuedPointerEvent
  internal var Keyboard KeyboardEvent
}

internal class InputEventQueue {
  private let events Queue[QueuedInputEvent] = Queue[QueuedInputEvent]()
  private var draining bool
  internal prop IsDispatching bool{ get -> draining }
  internal prop HasPending bool{ get -> events.Count > 0 }

  internal func Add(value QueuedPointerEvent) ->
    events.Enqueue(QueuedInputEvent{ IsPointer: true, Pointer: value })

  internal func Add(value KeyboardEvent) ->
    events.Enqueue(QueuedInputEvent{ Keyboard: value })

  internal func AddFocusLost() -> events.Enqueue(QueuedInputEvent{ IsFocusLost: true })
  internal func AddFocusGained() -> events.Enqueue(QueuedInputEvent{ IsFocusGained: true })

  internal func Begin() bool {
    if draining { return false }
    draining = true
    return true
  }

  internal func Take(out value QueuedInputEvent) bool -> events.TryDequeue(out value)
  internal func Finish() -> draining = false
  internal func Clear() -> events.Clear()
}
