package Goo

import System
import System.Buffers
import System.Collections.Generic
import System.Diagnostics

internal data struct QueuedInputEvent {
  internal var IsPointer bool
  internal var IsFocusLost bool
  internal var IsFocusGained bool
  internal var NativeTimestamp uint64
  internal var Pointer QueuedPointerEvent
  internal var PointerFrame ([]QueuedPointerEvent)?
  internal var PointerFrameCount int32
  internal var Keyboard KeyboardEvent
}

internal class InputEventQueue {
  private let owner Window?
  private let events Queue[QueuedInputEvent] = Queue[QueuedInputEvent]()
  private var draining bool
  internal prop IsDispatching bool{ get -> draining }
  internal prop HasPending bool{ get -> events.Count > 0 }

  internal init(owner Window? = nil) { this.owner = owner }

  internal func Add(value QueuedPointerEvent) {
    if owner?.NativeInputSuppressed == true { return }
    var received = value
    if received.ReceivedTime == 0.0 {
      received.ReceivedTime = float64(Stopwatch.GetTimestamp()) / float64(Stopwatch.Frequency)
    }
    events.Enqueue(QueuedInputEvent{ IsPointer: true, Pointer: received, NativeTimestamp: PopupInputContext.Timestamp })
    if received.Kind == PointerEventKind.Press { owner?.NotifyInputActivity(WindowInputKind.PointerDown) }
    else if received.Kind == PointerEventKind.Wheel { owner?.NotifyInputActivity(WindowInputKind.Wheel) }
  }

  internal func AddPointerFrame(samples ReadOnlySpan[QueuedPointerEvent], scale float32) {
    if owner?.NativeInputSuppressed == true { return }
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
        IsPointer: true, PointerFrame: buffer, PointerFrameCount: samples.Length, NativeTimestamp: PopupInputContext.Timestamp,
      })
      queued = true
    } finally {
      if !queued { ArrayPool[QueuedPointerEvent].Shared.Return(buffer) }
    }
  }

  internal func Add(value KeyboardEvent) {
    if owner?.NativeInputSuppressed == true { return }
    events.Enqueue(QueuedInputEvent{ Keyboard: value, NativeTimestamp: PopupInputContext.Timestamp })
    if value.Kind == KeyboardEventKind.Press { owner?.NotifyInputActivity(WindowInputKind.KeyDown) }
  }

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
