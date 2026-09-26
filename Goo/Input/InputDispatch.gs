package Goo

import System.Collections.Generic

internal class InputDispatchFrame {
  internal var Generation int64
  internal var PropagationStopped bool
  internal var DefaultPrevented bool
  internal init(generation int64, stopped bool, prevented bool) {
    Generation = generation
    PropagationStopped = stopped
    DefaultPrevented = prevented
  }
}

internal class InputDispatchControl {
  private var frames Stack[InputDispatchFrame]?
  internal var Active bool
  internal var Generation int64
  internal var PropagationStopped bool
  internal var DefaultPrevented bool

  internal func Begin(generation int64) {
    if Active {
      frames ??= Stack[InputDispatchFrame]()
      frames!!.Push(InputDispatchFrame(Generation, PropagationStopped, DefaultPrevented))
    }
    Generation = generation
    PropagationStopped = false
    DefaultPrevented = false
    Active = true
  }

  internal func Finish(generation int64) {
    if Active && Generation == generation {
      if frames != nil && frames!!.Count > 0 {
        let previous = frames!!.Pop()
        Generation = previous.Generation
        PropagationStopped = previous.PropagationStopped
        DefaultPrevented = previous.DefaultPrevented
      } else { Active = false }
    }
  }

  private func saved(generation int64) InputDispatchFrame? {
    if let stack = frames {
      for frame in stack { if frame.Generation == generation { return frame } }
    }
    return nil
  }

  internal func Stop(generation int64) {
    if Active && Generation == generation { PropagationStopped = true }
    else if let previous = saved(generation) { previous.PropagationStopped = true }
  }

  internal func Prevent(generation int64) {
    if Active && Generation == generation { DefaultPrevented = true }
    else if let previous = saved(generation) { previous.DefaultPrevented = true }
  }
}
