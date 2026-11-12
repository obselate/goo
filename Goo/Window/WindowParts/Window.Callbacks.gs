package Goo

import System
import System.Collections.Generic
import System.Diagnostics
import System.Threading

internal data struct CallbackWork(Context WindowCallbackContext, Callback SendOrPostCallback, State object?)

internal sealed class WindowCallbackContext : SynchronizationContext {
  internal let Window Window
  internal let Owner Cell?

  internal init(window Window, owner Cell?) {
    Window = window
    Owner = owner
  }

  public override func CreateCopy() SynchronizationContext -> this
  public override func Post(callback SendOrPostCallback, state object?) {
    if callback == nil { throw ArgumentNullException("callback") }
    Window.QueueContinuation(CallbackWork(this, callback, state))
  }
  public override func OperationStarted() { Interlocked.Increment(&Window.callbackOperations) }
  public override func OperationCompleted() {
    Interlocked.Decrement(&Window.callbackOperations)
    Window.WakeCallbacks()
  }
}

internal struct CallbackScope : IDisposable {
  private let previous SynchronizationContext?
  private let installed bool

  internal init(context WindowCallbackContext) {
    previous = SynchronizationContext.Current
    installed = previous == nil || previous is WindowCallbackContext
    if installed { SynchronizationContext.SetSynchronizationContext(context) }
  }

  public func Dispose() {
    if installed { SynchronizationContext.SetSynchronizationContext(previous) }
  }
}

public partial class Window {
  internal var callbackClosing bool
  internal var callbackOperations int32
  private var callbackDeadline float64
  private var callbackLate bool
  private var callbackWorker bool
  private var callbackError Exception?
  private var callbackContext WindowCallbackContext?
  private let continuationGate object = Object()
  private var continuations Queue[CallbackWork]?
  private var closeDrainMs float64 = 2000.0

  /// Gets or sets the close drain bound in milliseconds. The default is 2000. Zero skips the wait.
  public prop CloseDrainMs float64 {
    get -> closeDrainMs
    set {
      if !Double.IsFinite(value) || value < 0.0 { throw ArgumentOutOfRangeException("value") }
      closeDrainMs = value
    }
  }

  internal func CallbackContext() WindowCallbackContext {
    callbackContext ??= WindowCallbackContext(this, nil)
    return callbackContext!!
  }

  internal func WakeCallbacks() { host?.Wake() }

  private func hasContinuations() bool {
    lock continuationGate { return (continuations?.Count ?? 0) != 0 }
  }

  internal func QueueContinuation(work CallbackWork) {
    var launch bool
    lock continuationGate {
      continuations ??= Queue[CallbackWork]()
      continuations!!.Enqueue(work)
      if callbackLate && !callbackWorker {
        callbackWorker = true
        launch = true
      }
    }
    if launch { go drainLateContinuations() }
    else { WakeCallbacks() }
  }

  internal func DrainContinuations() {
    var count int32
    lock continuationGate { count = continuations?.Count ?? 0 }
    for i in 0 ... count {
      var work CallbackWork
      lock continuationGate { work = continuations!!.Dequeue() }
      using let context = CallbackScope(work.Context)
      try { work.Callback(work.State) }
      catch (_ OperationCanceledException) { }
      catch (error Exception) {
        if !callbackClosing { rethrow }
        callbackError ??= error
      } finally {
        if !callbackClosing { work.Context.Owner?.RebuildAfterCallback() }
      }
    }
  }

  private func drainLateContinuations() {
    while true {
      var work CallbackWork
      lock continuationGate {
        if continuations!!.Count == 0 {
          callbackWorker = false
          return
        }
        work = continuations!!.Dequeue()
      }
      using let context = CallbackScope(work.Context)
      try { work.Callback(work.State) }
      catch (_ OperationCanceledException) { }
    }
  }

  private func beginCallbackClose() {
    callbackClosing = true
    clearTimers()
    stopPosts()
    host?.Hide()
    let tree = node
    node = nil
    Portals.Sync(nil, portalRoot)
    if let current = tree {
      callbackError = captureCleanupError(callbackError, () -> NodeLifecycle.DisposeTree(current))
    } else if let current = Root {
      callbackError = captureCleanupError(callbackError, () -> current.DisposeMounted())
    }
    closeFileDialog()
    cancelPendingTasks()
    callbackDeadline = float64(Stopwatch.GetTimestamp()) + CloseDrainMs * float64(Stopwatch.Frequency) / 1000.0
  }

  private func finishCallbackDrain() bool {
    lock continuationGate { if callbackLate { return true } }
    DrainContinuations()
    var launch bool
    lock continuationGate {
      if float64(Stopwatch.GetTimestamp()) < callbackDeadline
        && (Interlocked.CompareExchange(&callbackOperations, 0, 0) != 0 || (continuations?.Count ?? 0) != 0) {
        return false
      }
      callbackLate = true
      if (continuations?.Count ?? 0) != 0 && !callbackWorker {
        callbackWorker = true
        launch = true
      }
    }
    if launch { go drainLateContinuations() }
    return true
  }
}
