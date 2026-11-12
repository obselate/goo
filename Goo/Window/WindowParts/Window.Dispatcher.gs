package Goo

import System
import System.Collections.Generic
import System.Threading
import System.Threading.Tasks

/// Hosts a Goo tree in a native window.
public partial class Window {
  private var closedSource CancellationTokenSource?
  private var nativeClosed bool
  private var pendingTaskSource CancellationTokenSource?
  private var presentationWaiters List[TaskCompletionSource[WindowPresentationAccepted]]?

  internal func PendingTaskToken() CancellationToken {
    lock cellQueueGate {
      if !acceptingPosts { return CancellationToken(true) }
      pendingTaskSource ??= CancellationTokenSource()
      return pendingTaskSource!!.Token
    }
  }

  private func cancelPendingTasks() {
    var source CancellationTokenSource?
    lock cellQueueGate { source = pendingTaskSource }
    source?.Cancel()
  }

  /// Queues an action on the UI thread and awaits its result or exception.
  /// @param action action to run
  /// @param cancellationToken cancels pending dispatch
  /// @returns the pending dispatch task
  public func InvokeAsync(action Action, cancellationToken CancellationToken = default(CancellationToken)) Task {
    if action == nil { throw ArgumentNullException("action") }
    return InvokeAsync[bool](() -> {
      action()
      return true
    }, cancellationToken)
  }

  /// Queues a function on the UI thread and awaits its result or exception.
  /// @typeparam T result type
  /// @param action function to run
  /// @param cancellationToken cancels pending dispatch
  /// @returns the function result
  public async func InvokeAsync[T any](action Func[T], cancellationToken CancellationToken = default(CancellationToken)) Task[T] {
    if action == nil { throw ArgumentNullException("action") }
    using let cancellation = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, PendingTaskToken())
    let token = cancellation.Token
    let completion = TaskCompletionSource[T](TaskCreationOptions.RunContinuationsAsynchronously)
    using let registration = token.Register(() -> { completion.TrySetCanceled(token) })
    if !token.IsCancellationRequested {
      if !Post(() -> {
        if token.IsCancellationRequested { return }
        try { completion.TrySetResult(action()) }
        catch (error OperationCanceledException) { completion.TrySetCanceled() }
        catch (error Exception) { completion.TrySetException(error) }
      }) { completion.TrySetCanceled() }
    }
    return await completion.Task.ConfigureAwait(false)
  }

  /// Requests a frame and awaits its next accepted presentation, not display scanout.
  /// Call this on the UI thread. Closing the window cancels the task.
  /// @param cancellationToken cancels the wait
  /// @returns the next presentation receipt
  public async func NextPresentationAsync(cancellationToken CancellationToken = default(CancellationToken)) Task[WindowPresentationAccepted] {
    requireUiThread("Window.NextPresentationAsync")
    using let cancellation = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, PendingTaskToken())
    let token = cancellation.Token
    let completion = TaskCompletionSource[WindowPresentationAccepted](TaskCreationOptions.RunContinuationsAsynchronously)
    using let registration = token.Register(() -> { completion.TrySetCanceled(token) })
    lock cellQueueGate {
      if !token.IsCancellationRequested {
        presentationWaiters ??= List[TaskCompletionSource[WindowPresentationAccepted]]()
        presentationWaiters!!.Add(completion)
      }
    }
    if !token.IsCancellationRequested { requestRender() }
    try { return await completion.Task.ConfigureAwait(false) }
    finally {
      lock cellQueueGate { presentationWaiters?.Remove(completion) }
    }
  }

  private func completePresentationWaiters(receipt WindowPresentationAccepted) {
    lock cellQueueGate {
      guard let waiters = presentationWaiters else { return }
      for waiter in waiters { waiter.TrySetResult(receipt) }
      waiters.Clear()
    }
  }

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

  /// Attempts to queue an action for the UI thread.
  /// A successful enqueue can still be discarded if teardown begins before the action runs.
  /// @param action action to run during a later Pump
  /// @returns True when the action was accepted into the queue.
  public func Post(action Action) bool {
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

  private func hasPostedActions() bool -> Interlocked.CompareExchange(&pendingPostedActions, 0, 0) != 0 || hasContinuations()

  internal func drainPostedActions() {
    using let context = CallbackScope(CallbackContext())
    DrainContinuations()
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
          if !queue.TryDequeue(out action) { return }
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
