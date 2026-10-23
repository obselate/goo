package Goo

import System
import System.Numerics
import System.Threading
import System.Threading.Tasks

/// Renders independent page cells without changing the visible window.
public partial class Window {
  private var offscreenViewport Vector2?

  /// Creates a renderer lease before opening native UI that can remove this window's presentation surface.
  /// @returns A session on Success, or an explicit renderer status.
  public func CreateOffscreenSession() OffscreenRenderSessionResult {
    requireUiThread("Window.CreateOffscreenSession")
    if !IsOpen || Closed.IsCancellationRequested {
      return OffscreenRenderSessionResult{ Status: OffscreenRenderStatus.NotReady }
    }
    guard let target = windowTarget as VulkanWindowTarget? else {
      return OffscreenRenderSessionResult{ Status: OffscreenRenderStatus.Unsupported }
    }
    return target.CreateOffscreenSession(Closed)
  }

  /// Renders a fresh, unattached cell at a separate layout size without resizing or presenting this window.
  /// Keep pumping the owner until completion. Pixels and new GPU allocations share MaxBytes.
  /// @param root The independent page content.
  /// @param options The logical viewport, pixel size, background and memory limit.
  /// @param cancellation Cancels the operation after in-flight GPU work is safe to release.
  /// @param reusable Previous pixels to reuse when the output size matches. Do not access them until completion.
  /// @returns Owned pixels or an explicit operation status.
  public func RenderOffscreenAsync(root Cell, options OffscreenRenderOptions,
    cancellation CancellationToken, reusable WindowCapture? = nil) Task[OffscreenRenderResult] {
      requireUiThread("Window.RenderOffscreenAsync")
      if root == nil { throw ArgumentNullException("root") }
      validateOffscreenOptions(options)
      if cancellation.IsCancellationRequested || Closed.IsCancellationRequested {
        return Task.FromResult(OffscreenRenderResult{ Status: OffscreenRenderStatus.Cancelled })
      }
      if !IsOpen {
        return Task.FromResult(OffscreenRenderResult{ Status: OffscreenRenderStatus.NotReady })
      }
      guard let target = windowTarget as VulkanWindowTarget? else {
        return Task.FromResult(OffscreenRenderResult{ Status: OffscreenRenderStatus.Unsupported })
      }
      return target.RenderOffscreenAsync(root, options, cancellation, Closed, reusable)
    }

  internal func PrepareOffscreenPage(options OffscreenRenderOptions) {
    offscreenViewport = Vector2(options.LogicalWidth, options.LogicalHeight)
    UpdateTree()
  }
}

internal func validateOffscreenOptions(options OffscreenRenderOptions) {
  if !Single.IsFinite(options.LogicalWidth) || !Single.IsFinite(options.LogicalHeight)
    || options.LogicalWidth <= 0.0F || options.LogicalHeight <= 0.0F
    || options.LogicalWidth > float32(Int32.MaxValue - 1)
    || options.LogicalHeight > float32(Int32.MaxValue - 1) {
      throw ArgumentOutOfRangeException("options", "Logical dimensions must be finite and positive")
    }
  if options.PixelWidth == 0u || options.PixelHeight == 0u || options.MaxBytes <= 0 {
    throw ArgumentOutOfRangeException("options", "Pixel dimensions and MaxBytes must be positive")
  }
}
