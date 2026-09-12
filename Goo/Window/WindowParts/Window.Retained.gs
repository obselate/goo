package Goo

import System
import System.Threading

/// Hosts a Goo tree in a native window.
public partial class Window {
  private func acceptRetainedInvalidations() {
    lock retainedInvalidationGate {
      acceptingRetainedInvalidations = true
    }
  }

  private func stopRetainedInvalidations() {
    lock retainedInvalidationGate {
      acceptingRetainedInvalidations = false
      pendingRetainedEffects = ReconcileEffects.None
      Interlocked.Exchange(&pendingRetainedInvalidation, 0)
    }
  }

  private func enqueueRetainedInvalidation(e ReconcileEffects) {
    var wake = false
    lock retainedInvalidationGate {
      if !acceptingRetainedInvalidations {
        return
      }
      pendingRetainedEffects = combineEffects(pendingRetainedEffects, e)
      wake = Interlocked.Exchange(&pendingRetainedInvalidation, 1) == 0
    }
    if wake && (embeddedHost != nil || Environment.CurrentManagedThreadId != ownerThreadId) {
      host?.Wake()
    }
  }

  private func drainRetainedInvalidations() ReconcileEffects {
    lock retainedInvalidationGate {
      if !acceptingRetainedInvalidations {
        pendingRetainedEffects = ReconcileEffects.None
        Interlocked.Exchange(&pendingRetainedInvalidation, 0)
        return ReconcileEffects.None
      }
      let result = pendingRetainedEffects
      pendingRetainedEffects = ReconcileEffects.None
      Interlocked.Exchange(&pendingRetainedInvalidation, 0)
      return result
    }
  }
}
