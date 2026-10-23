package Goo

import System
import System.Threading
import System.Threading.Tasks

/// Holds a shared renderer alive without owning a native presentation surface.
/// Create, render, service and dispose it on the creating thread. Service while awaiting page completion.
public sealed class OffscreenRenderSession : IDisposable {
  private let target VulkanWindowTarget
  private let closed CancellationToken
  private let threadId int32
  private var disposed bool

  internal init(target VulkanWindowTarget, closed CancellationToken) {
    this.target = target
    this.closed = closed
    threadId = Environment.CurrentManagedThreadId
  }

  /// Renders a fresh page. The session remains usable while its source window has no presentation surface.
  /// @param root Independent, unattached page content.
  /// @param options Logical viewport, output pixels, background and allocation limit.
  /// @param cancellation Cancels after in-flight GPU work is safe to release.
  /// @param reusable Previous pixels to reuse when the output size matches.
  /// @returns Owned pixels or an explicit render status.
  public func RenderAsync(root Cell, options OffscreenRenderOptions, cancellation CancellationToken,
    reusable WindowCapture? = nil) Task[OffscreenRenderResult] {
      requireThread()
      if root == nil { throw ArgumentNullException("root") }
      validateOffscreenOptions(options)
      return target.RenderOffscreenAsync(root, options, cancellation, closed, reusable)
    }

  /// Consumes completed GPU work and starts a queued page without presenting a native window.
  public func Service() {
    requireThread()
    target.PollQueueCompletion()
  }

  /// Cancels pending pages, waits for safe GPU cleanup and releases this session's runtime lease.
  public func Dispose() {
    if disposed { return }
    requireThread()
    while !target.PrepareClose() {
      target.PollQueueCompletion()
      Thread.Yield()
    }
    target.Dispose()
    disposed = true
  }

  private func requireThread() {
    if disposed { throw ObjectDisposedException("OffscreenRenderSession") }
    if Environment.CurrentManagedThreadId != threadId {
      throw InvalidOperationException("Use the offscreen render session on its creating thread")
    }
  }
}

/// Contains Status, a Session on Success and Error detail on failure.
public data struct OffscreenRenderSessionResult(Status OffscreenRenderStatus,
  Session OffscreenRenderSession?, Error string) { }
