package Goo

import System
import System.Collections.Generic
import System.Diagnostics
import System.Threading

internal data struct CallbackWork(Context WindowCallbackContext, Callback SendOrPostCallback, State object?)

internal sealed class WindowCallbackContext : SynchronizationContext {
  internal let Window Window
  internal let Owner Cell?
  internal let HostContext SynchronizationContext?
  private var hostedContext WindowCallbackContext?

  internal init(window Window, owner Cell?, hostContext SynchronizationContext? = nil) {
    Window = window
    Owner = owner
    HostContext = hostContext
  }

  public override func CreateCopy() SynchronizationContext {
    guard let host = HostContext else { return this }
    let copy = host.CreateCopy()
    return copy == host ? this : WindowCallbackContext(Window, Owner, copy)
  }

  internal func ForHost(previous SynchronizationContext?) WindowCallbackContext {
    if HostContext != nil { return this }
    let host = if previous is WindowCallbackContext current { current.HostContext } else { previous }
    if host == nil { return this }
    if hostedContext?.HostContext != host { hostedContext = WindowCallbackContext(Window, Owner, host) }
    return hostedContext!!
  }

  public override func Post(callback SendOrPostCallback, state object?) {
    if callback == nil { throw ArgumentNullException("callback") }
    Window.QueueContinuation(CallbackWork(this, callback, state))
  }
  public override func OperationStarted() {
    Interlocked.Increment(&Window.callbackOperations)
    HostContext?.OperationStarted()
  }
  public override func OperationCompleted() {
    Interlocked.Decrement(&Window.callbackOperations)
    Window.WakeCallbacks()
    HostContext?.OperationCompleted()
  }
}

internal struct CallbackScope : IDisposable {
  private let previous SynchronizationContext?
  private let installed bool

  internal init(context WindowCallbackContext?) {
    previous = SynchronizationContext.Current
    installed = context != nil
    if installed { SynchronizationContext.SetSynchronizationContext(context!!.ForHost(previous)) }
  }

  public func Dispose() {
    if installed { SynchronizationContext.SetSynchronizationContext(previous) }
  }
}

/// Hosts a Goo tree in a native window.
public partial class Window {
  internal var callbackClosing bool
  internal var callbackOperations int32
  private var callbackDeadline float64
  private var callbackDrainReady bool
  private var callbackWasVisible bool
  private var callbackLate bool
  private var callbackWorker bool
  private var callbackError Exception?
  private var callbackContext WindowCallbackContext?
  private let continuationGate object = Object()
  private var continuations Queue[CallbackWork]?
  private var continuationDrain Action?
  private var hostContinuationDrain SendOrPostCallback?
  private var closeDrainMs float64 = 2000.0

  /// Gets or sets the close drain bound in milliseconds. The default is 2000. Zero skips the wait.
  /// Closing stops UI work and cancels Cell lifetimes before draining async handlers on the UI thread.
  /// After this bound, continuations run on a serialized background queue. They must not access UI state.
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

  internal func WakeCallbacks() {
    lock continuationGate { Monitor.PulseAll(continuationGate) }
    host?.Wake()
  }

  private func hasContinuations() bool {
    lock continuationGate { return (continuations?.Count ?? 0) != 0 }
  }

  internal func QueueContinuation(work CallbackWork) {
    var launch bool
    var dispatch Action?
    var hostDispatch SendOrPostCallback?
    lock continuationGate {
      continuations ??= Queue[CallbackWork]()
      continuations!!.Enqueue(work)
      if callbackLate && !callbackWorker {
        callbackWorker = true
        launch = true
      } else if !callbackLate && !callbackClosing {
        continuationDrain ??= () -> DrainContinuations(1)
        dispatch = continuationDrain
        if work.Context.HostContext != nil {
          hostContinuationDrain ??= state -> {
            using let context = CallbackScope(CallbackContext().ForHost(cast[WindowCallbackContext](state)))
            drainPostedActions()
          }
          hostDispatch = hostContinuationDrain
        }
      }
    }
    if launch { go drainLateContinuations() }
    else if let action = dispatch {
      if !Post(action) { WakeCallbacks() }
      else if let callback = hostDispatch { work.Context.HostContext!!.Post(callback, work.Context) }
    } else { WakeCallbacks() }
  }

  internal func DrainContinuations(countLimit int32 = Int32.MaxValue) {
    var count int32
    lock continuationGate {
      if callbackLate { return }
      count = Math.Min(continuations?.Count ?? 0, countLimit)
    }
    for i in 0 ... count {
      if callbackClosing && float64(Stopwatch.GetTimestamp()) >= callbackDeadline {
        return
      }
      var work CallbackWork
      lock continuationGate {
        if callbackLate || !continuations!!.TryDequeue(out work) { return }
      }
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

  internal func DrainCloseCallbacks() {
    while callbackClosing && callbackDrainReady && !callbackLate {
      lock continuationGate {
        if (continuations?.Count ?? 0) == 0 && Interlocked.CompareExchange(&callbackOperations, 0, 0) != 0 {
          Monitor.Wait(continuationGate, Math.Max(1, SchedulerWaitMs(float64(Stopwatch.GetTimestamp()))))
        }
      }
      Close()
    }
  }

  private func beginCallbackClose() {
    callbackClosing = true
    callbackWasVisible = observedVisible
    clearTimers()
    stopPosts()
    callbackError = captureCleanupError(callbackError, () -> { host?.Hide() })
    callbackError = captureCleanupError(callbackError, () -> { closeOwnedWindows() })
    let tree = node
    callbackError = captureCleanupError(callbackError, () -> Portals.Sync(nil, portalRoot))
    if let current = tree {
      callbackError = captureCleanupError(callbackError, () -> NodeLifecycle.DisposeTree(current))
    } else if let current = Root {
      callbackError = captureCleanupError(callbackError, () -> current.DisposeMounted())
    }
    node = nil
    callbackError = captureCleanupError(callbackError, cancelPendingTasks)
    callbackError = captureCleanupError(callbackError, () -> { closeFileDialog() })
    callbackDeadline = float64(Stopwatch.GetTimestamp()) + CloseDrainMs * float64(Stopwatch.Frequency) / 1000.0
    callbackDrainReady = true
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
