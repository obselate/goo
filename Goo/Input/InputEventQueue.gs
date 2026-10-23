package Goo

import System
import System.Buffers
import System.Collections.Generic
import System.Diagnostics

internal data struct QueuedInputEvent {
  internal var IsPointer bool
  internal var IsFocusLost bool
  internal var IsFocusGained bool
  internal var Pointer QueuedPointerEvent
  internal var PointerFrame ([]QueuedPointerEvent)?
  internal var PointerFrameCount int32
  internal var Keyboard KeyboardEvent
}

internal class InputEventQueue {
  private let events Queue[QueuedInputEvent] = Queue[QueuedInputEvent]()
  private var draining bool
  internal prop IsDispatching bool{ get -> draining }
  internal prop HasPending bool{ get -> events.Count > 0 }

  internal func Add(value QueuedPointerEvent) {
    var received = value
    if received.ReceivedTime == 0.0 {
      received.ReceivedTime = float64(Stopwatch.GetTimestamp()) / float64(Stopwatch.Frequency)
    }
    events.Enqueue(QueuedInputEvent{ IsPointer: true, Pointer: received })
  }

  internal func AddPointerFrame(samples ReadOnlySpan[QueuedPointerEvent], scale float32) {
    if samples.Length == 0 { return }
    let buffer = ArrayPool[QueuedPointerEvent].Shared.Rent(samples.Length)
    let time = float64(Stopwatch.GetTimestamp()) / float64(Stopwatch.Frequency)
    var queued = false
    try {
      for i in 0 ... samples.Length {
        var sample = samples[i]
        sample.Kind = PointerEventKind.Move
        sample.X /= scale
        sample.Y /= scale
        sample.ReceivedTime = time
        buffer[i] = sample
      }
      events.Enqueue(QueuedInputEvent{
        IsPointer: true, PointerFrame: buffer, PointerFrameCount: samples.Length,
      })
      queued = true
    } finally {
      if !queued { ArrayPool[QueuedPointerEvent].Shared.Return(buffer) }
    }
  }

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
  internal func Clear() {
    while events.TryDequeue(out var value) {
      if let frame = value.PointerFrame { ArrayPool[QueuedPointerEvent].Shared.Return(frame) }
    }
  }
}
