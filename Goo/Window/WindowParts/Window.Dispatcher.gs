package Goo

import System
import System.Collections.Generic
import System.Threading

/// Hosts a Goo tree in a native window.
public partial class Window {
  private var closedSource CancellationTokenSource?
  private var nativeClosed bool

  /// Gets a token cancelled after this window's native teardown finishes or fails.
  /// Posted work stops earlier and can be discarded while the window is closing.
  public prop Closed CancellationToken{
    get {
      lock cellQueueGate {
        if nativeClosed { return CancellationToken(true) }
        closedSource ??= CancellationTokenSource()
        return closedSource!!.Token
      }
    }
  }

  /// Queues an action for the UI thread.
  /// @param action action to run during the next Pump
  public func Post(action Action) {
    if !TryPost(action) {
      throw InvalidOperationException("Window.Post is unavailable after teardown")
    }
  }

  /// Attempts to queue an action for the UI thread.
  /// A successful enqueue can still be discarded if teardown begins before the action runs.
  /// @param action action to run during a later Pump
  /// @returns True when the action was accepted into the queue.
  public func TryPost(action Action) bool {
    if action == nil { throw ArgumentNullException("action") }
    var wake = false
    lock cellQueueGate {
      if !acceptingPosts {
        return false
      }
      if postedActions == nil { postedActions = Queue[Action]() }
      let queue = postedActions!!
      let wasEmpty = queue.Count == 0
      queue.Enqueue(action)
      wake = wasEmpty && Interlocked.Exchange(&pendingPostedActions, 1) == 0
    }
    if wake {
      host?.Wake()
    }
    return true
  }

  private func stopPosts() {
    lock cellQueueGate {
      acceptingPosts = false
      postedActions?.Clear()
      postedActions = nil
      Interlocked.Exchange(&pendingPostedActions, 0)
    }
  }

  private func completeClose() {
    var cancellation CancellationTokenSource?
    lock cellQueueGate {
      nativeClosed = true
      cancellation = closedSource
    }
    cancellation?.Cancel()
  }

  private func hasPostedActions() bool -> Interlocked.CompareExchange(&pendingPostedActions, 0, 0) != 0

  internal func drainPostedActions() {
    var count int32
    var hasBatch bool
    lock cellQueueGate {
      if let queue = postedActions {
        count = queue.Count
        hasBatch = count != 0
      } else {
        count = 0
        hasBatch = false
      }
      if !hasBatch {
        Interlocked.Exchange(&pendingPostedActions, 0)
      }
    }
    if !hasBatch {
      return
    }
    try {
      for i in 0 ... count {
        var action Action
        lock cellQueueGate {
          guard let queue = postedActions else { return }
          action = queue.Dequeue()
        }
        action()
      }
    } finally {
      lock cellQueueGate {
        if let queue = postedActions {
          if queue.Count == 0 {
            Interlocked.Exchange(&pendingPostedActions, 0)
          } else {
            Interlocked.Exchange(&pendingPostedActions, 1)
          }
        } else {
          Interlocked.Exchange(&pendingPostedActions, 0)
        }
      }
    }
  }
}
