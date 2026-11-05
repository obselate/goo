package Goo

import System
import System.Collections.Generic
import System.Threading

internal data struct ImageCompletionWork {
  internal var Mount NodeMount
  internal var Token object
}

/// Hosts a Goo tree in a native window.
public partial class Window {
  private func acceptImageCompletions() {
    lock imageCompletionGate {
      acceptingImageCompletions = true
    }
  }

  private func stopImageCompletions() {
    lock imageCompletionGate {
      acceptingImageCompletions = false
      pendingImageCompletions.Clear()
      Interlocked.Exchange(&pendingImageCompletion, 0)
    }
  }

  private func enqueueImageCompletion(n Node, token object) {
    guard let source = token as ImageSourceBindingToken else { return }
    if source.Binding.Mount.Captured != n { return }
    var wake = false
    lock imageCompletionGate {
      if !acceptingImageCompletions {
        return
      }
      pendingImageCompletions.Add(ImageCompletionWork{ Mount: source.Binding.Mount, Token: token })
      wake = Interlocked.Exchange(&pendingImageCompletion, 1) == 0
    }
    if wake {
      host?.Wake()
    }
  }

  private func drainImageCompletions() ReconcileEffects {
    imageCompletionBatch.Clear()
    lock imageCompletionGate {
      if !acceptingImageCompletions {
        pendingImageCompletions.Clear()
        Interlocked.Exchange(&pendingImageCompletion, 0)
        return ReconcileEffects.None
      }
      if pendingImageCompletions.Count == 0 {
        Interlocked.Exchange(&pendingImageCompletion, 0)
        return ReconcileEffects.None
      }
      imageCompletionBatch.AddRange(pendingImageCompletions)
      pendingImageCompletions.Clear()
      Interlocked.Exchange(&pendingImageCompletion, 0)
    }

    var effects = ReconcileEffects.None
    var next int32 = 0
    try {
      while next < imageCompletionBatch.Count {
        let work = imageCompletionBatch[next]
        next++
        guard let n = work.Mount.Current else { continue }
        if n.Kind != NodeKind.Image || !ImageLayouts.IsCurrent(n, work.Token) {
          continue
        }
        if ImageLayouts.Refresh(n) {
          effects = combineEffects(effects, ReconcileEffects.Content)
          effects = combineEffects(effects, ReconcileEffects.Layout)
          effects = combineEffects(effects, ReconcileEffects.Paint)
        }
      }
    } catch (error Exception) {
      var wake = false
      lock imageCompletionGate {
        if acceptingImageCompletions {
          var i = next - 1
          while i < imageCompletionBatch.Count {
            pendingImageCompletions.Add(imageCompletionBatch[i])
            i++
          }
          wake = Interlocked.Exchange(&pendingImageCompletion, 1) == 0
        }
      }
      pendingReconcileEffects = combineEffects(pendingReconcileEffects, effects)
      if wake {
        if let native = host {
          native.Wake()
        }
      }
      throw error
    } finally {
      imageCompletionBatch.Clear()
    }
    return effects
  }
}
