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
  internal var Foreground Color = Color.Black

  shared {
    /// Creates a renderer without a native window or presentation surface.
    /// @returns A session on Success, or an explicit renderer status and error.
    public func Create() OffscreenRenderSessionResult {
      try {
        return OffscreenRenderSessionResult{Status: OffscreenRenderStatus.Success,
          Session: OffscreenRenderSession(VulkanWindowTarget(VulkanHeadlessHost()), CancellationToken.None)}
      } catch (error Exception) {
        return OffscreenRenderSessionResult{Status: OffscreenRenderStatus.Failed, Error: error.Message}
      }
    }
  }

  internal init(target VulkanWindowTarget, closed CancellationToken) {
    this.target = target
    this.closed = closed
    threadId = Environment.CurrentManagedThreadId
  }

  /// Renders a fresh page at the logical-to-pixel render scale, including fractional scales.
  /// The session remains usable without its source window's presentation surface. Failed results retain the error detail.
  /// @param root Independent, unattached page content.
  /// @param options Logical viewport, output pixels, background and allocation limit.
  /// @param cancellation Cancels after in-flight GPU work is safe to release.
  /// @param reusable Previous pixels to reuse when the output size matches.
  /// @returns Owned pixels or an explicit render status.
  /// @exception InvalidOperationException when root is attached to a window.
  public func RenderAsync(root Cell, options OffscreenRenderOptions, cancellation CancellationToken,
    reusable WindowCapture? = nil) Task[OffscreenRenderResult] {
      requireThread()
      if root == nil { throw ArgumentNullException("root") }
      validateOffscreenOptions(options)
      return target.RenderOffscreenAsync(root, options, cancellation, closed, reusable, Foreground)
    }

  /// Consumes completed GPU work and starts a queued page without presenting a native window.
  public func Service() {
    requireThread()
    VulkanDeviceRecoveryCoordinator.ServiceQueueCompletions(target)
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
