package Goo

internal class InputDispatchControl {
  internal var Active bool
  internal var Generation int64
  internal var PropagationStopped bool
  internal var DefaultPrevented bool

  internal func Begin(generation int64) {
    Generation = generation
    PropagationStopped = false
    DefaultPrevented = false
    Active = true
  }

  internal func Finish(generation int64) {
    if Active && Generation == generation {
      Active = false
    }
  }

  internal func Stop(generation int64) {
    if Active && Generation == generation {
      PropagationStopped = true
    }
  }

  internal func Prevent(generation int64) {
    if Active && Generation == generation {
      DefaultPrevented = true
    }
  }
}
