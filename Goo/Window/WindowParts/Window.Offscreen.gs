package Goo

import System
import System.Collections.Generic
import System.Diagnostics
import System.Numerics
import System.Threading
import System.Threading.Tasks

/// Renders independent page cells without changing the visible window.
public partial class Window {
  private var offscreenViewport Vector2?
  private var offscreenSessions List[OffscreenRenderSession]?
  private var offscreenServiceTicks float64

  /// Creates a renderer lease from an open window. Returns NotReady before Open or after close.
  /// The lease does not require the window's presentation surface to remain attached.
  /// Pages complete in the window loop without calling Service while the window is open.
  /// @returns A session on Success, or an explicit renderer status.
  public func CreateOffscreenSession() OffscreenRenderSessionResult {
    requireUiThread("Window.CreateOffscreenSession")
    if !IsOpen || Closed.IsCancellationRequested {
      return OffscreenRenderSessionResult{ Status: OffscreenRenderStatus.NotReady }
    }
    guard let target = windowTarget as VulkanWindowTarget? else {
      return OffscreenRenderSessionResult{ Status: OffscreenRenderStatus.Unsupported }
    }
    let result = target.CreateOffscreenSession(Closed)
    if let session = result.Session {
      let sessions = offscreenSessions ?? List[OffscreenRenderSession]()
      offscreenSessions = sessions
      sessions.Add(session)
      session.SourceWindow = this
    }
    return result
  }

  internal func UnregisterOffscreenSession(session OffscreenRenderSession) {
    offscreenSessions?.Remove(session)
    session.SourceWindow = nil
  }

  internal func RequestOffscreenService() {
    if offscreenServiceTicks == 0.0 {
      offscreenServiceTicks = float64(Stopwatch.GetTimestamp()) + float64(Stopwatch.Frequency) / 1000.0
    }
    host?.Wake()
  }

  internal func nextOffscreenDeadlineSeconds() float64 {
    if let sessions = offscreenSessions {
      for session in sessions {
        if session.WorkPending {
          return (offscreenServiceTicks - float64(Stopwatch.GetTimestamp())) / float64(Stopwatch.Frequency)
        }
      }
    }
    return Double.PositiveInfinity
  }

  private func serviceOffscreenSessions() {
    guard let sessions = offscreenSessions else { return }
    var index int32
    while index < sessions.Count {
      let session = sessions[index]
      if session.WorkPending { session.Service() }
      if index < sessions.Count && Object.ReferenceEquals(sessions[index], session) { index++ }
    }
    offscreenServiceTicks = 0.0
    if nextOffscreenDeadlineSeconds() != Double.PositiveInfinity {
      offscreenServiceTicks = float64(Stopwatch.GetTimestamp()) + float64(Stopwatch.Frequency) / 1000.0
    }
  }

  private func prepareOffscreenSessionsClose() bool {
    guard let sessions = offscreenSessions else { return true }
    var ready = true
    var index int32
    while index < sessions.Count {
      let session = sessions[index]
      if !session.PrepareClose() { ready = false }
      if index < sessions.Count && Object.ReferenceEquals(sessions[index], session) { index++ }
    }
    if ready {
      for session in sessions { session.SourceWindow = nil }
      offscreenSessions = nil
      offscreenServiceTicks = 0.0
    }
    return ready
  }

  /// Renders a fresh, unattached cell at a separate layout size without resizing or presenting this window.
  /// Keep pumping the owner until completion. Pixels and new GPU allocations share MaxBytes.
  /// @param root The independent page content.
  /// @param options The logical viewport, pixel size, background and memory limit.
  /// @param cancellation Cancels the operation after in-flight GPU work is safe to release.
  /// @param reusable Previous pixels to reuse when the output size matches. Do not access them until completion.
  /// @returns Owned pixels or an explicit operation status.
  /// @exception InvalidOperationException when root is attached to a window.
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
    dpi = Vector2(float32(options.PixelWidth) / options.LogicalWidth, float32(options.PixelHeight) / options.LogicalHeight)
    if let theme = Environment.GetEnvironmentVariable("GOO_RENDER_THEME") {
      applyPreferences(PlatformPreferences{Theme: theme == "dark" ? SystemTheme.Dark : SystemTheme.Light})
    }
    UpdateTree()
  }
}

internal func validateOffscreenOptions(options OffscreenRenderOptions) {
  if !Single.IsFinite(options.LogicalWidth) || !Single.IsFinite(options.LogicalHeight)
    || options.LogicalWidth <= 0.0F || options.LogicalHeight <= 0.0F
    || options.LogicalWidth >= float32(Int32.MaxValue)
    || options.LogicalHeight >= float32(Int32.MaxValue) {
      throw ArgumentOutOfRangeException("options", "Logical dimensions must be finite and positive")
    }
  if options.PixelWidth == 0u || options.PixelHeight == 0u || options.MaxBytes <= 0 {
    throw ArgumentOutOfRangeException("options", "Pixel dimensions and MaxBytes must be positive")
  }
}
