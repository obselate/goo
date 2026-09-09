package Goo

import System
import System.Collections.Generic
import System.Diagnostics
import System.Numerics
import System.Threading

internal class WindowScheduler {
  private const EventBudget int32 = 64
  private const DefaultWaitMs int32 = 250
  private let windows List[Window] = List[Window]()
  private let windowsGate object = Object()
  private var snapshot []Window = []Window{}
  private var snapshotCount int32
  private var nextWindow int32
  private var running bool

  private func EnsureSnapshotCapacity(required int32) {
    if required <= snapshot.Length {
      return
    }
    var capacity = snapshot.Length
    if capacity == 0 {
      capacity = 4
    }
    while capacity < required {
      if capacity > 1073741823 {
        capacity = required
      } else {
        capacity = capacity * 2
      }
    }
    snapshot = [capacity]Window
  }

  private func CaptureSnapshot() int32 {
    let count = windows.Count
    EnsureSnapshotCapacity(count)
    if count < snapshotCount {
      Array.Clear(snapshot, count, snapshotCount - count)
    }
    var index int32
    while index < count {
      snapshot[index] = windows[index]
      index = index + 1
    }
    snapshotCount = count
    return count
  }

  internal func Register(window Window) {
    lock windowsGate {
      if !windows.Contains(window) {
        windows.Add(window)
      }
    }
  }

  internal func Unregister(window Window) {
    lock windowsGate {
      let index = windows.IndexOf(window)
      if index < 0 {
        return
      }
      windows.RemoveAt(index)
      if windows.Count == 0 {
        nextWindow = 0
      } else if nextWindow >= windows.Count {
        nextWindow = 0
      }
    }
  }

  internal func RequestHotReload() {
    let pending = List[Window]()
    lock windowsGate { pending.AddRange(windows) }
    for window in pending { window.TryPost(window.RebuildAfterHotReload) }
  }

  internal func Run() {
    if running {
      throw InvalidOperationException("Window scheduler is already running")
    }
    running = true
    nextWindow = 0
    try {
      while true {
        let currentCount = CaptureSnapshot()
        if currentCount == 0 {
          break
        }
        var hasOpenWindow bool
        let now = float64(Stopwatch.GetTimestamp())
        var waitMs int32 = DefaultWaitMs
        var currentIndex int32
        while currentIndex < currentCount {
          let window = snapshot[currentIndex]
          if !window.IsOpen {
            currentIndex = currentIndex + 1
            continue
          }
          hasOpenWindow = true
          let candidate = window.SchedulerWaitMs(now)
          if candidate < waitMs {
            waitMs = candidate
          }
          currentIndex = currentIndex + 1
        }
        if !hasOpenWindow {
          break
        }
        if waitMs == 0 {
          SdlRuntime.PumpEvents(EventBudget)
        } else {
          SdlRuntime.WaitEventsBounded(waitMs, EventBudget)
        }
        let afterEventsCount = CaptureSnapshot()
        var afterEventsIndex int32
        while afterEventsIndex < afterEventsCount {
          let window = snapshot[afterEventsIndex]
          if window.IsOpen {
            window.RefreshSchedulerMetrics()
          }
          afterEventsIndex = afterEventsIndex + 1
        }
        let afterEventsNow = float64(Stopwatch.GetTimestamp())
        let count = afterEventsCount
        if count == 0 {
          break
        }
        let start = nextWindow % count
        var offset int32
        while offset < count {
          let window = snapshot[(start + offset) % count]
          if window.IsOpen {
            let service = window.SchedulerHasImmediateService() || window.SchedulerHasPendingQueueWork()
            let timed = window.SchedulerTimedServiceDue()
            let frameDue = window.SchedulerFrameDue(afterEventsNow)
            if service || timed || frameDue {
              window.SchedulerPump(afterEventsNow, frameDue)
            }
          }
          offset = offset + 1
        }
        nextWindow = (start + 1) % count
      }
    } finally {
      running = false
    }
  }
}

/// Hosts a Goo tree in a native window.
public partial class Window {
  private var schedulerLastTicks float64
  private var schedulerSimulationBank float64

  internal func RebuildAfterHotReload() {
    if !IsOpen { return }
    Root?.Rebuild()
    if let tree = node {
      let pending = Stack[Node]()
      pending.Push(tree)
      while pending.Count != 0 {
        let current = pending.Pop()
        var cell = current.Fiber
        while let mounted = cell {
          mounted.Rebuild()
          cell = mounted.directChild
        }
        for child in current.Children { pending.Push(child) }
      }
    }
  }

  shared {
    private let scheduler WindowScheduler = WindowScheduler()

    /// Configures process-wide application identity before SDL initialization.
    /// @param name human-readable application name
    /// @param version application version
    /// @param identifier unique reverse-domain identifier
    public func ConfigureApplication(name string, version string, identifier string) {
      SdlRuntime.ConfigureApplication(name, version, identifier)
    }

    internal func RegisterLiveWindow(window Window) {
      scheduler.Register(window)
    }

    internal func UnregisterLiveWindow(window Window) {
      scheduler.Unregister(window)
    }

    internal func RunLiveWindowScheduler() {
      scheduler.Run()
    }

    internal func RequestHotReload() {
      scheduler.RequestHotReload()
    }

  }

  private func requireUiThread(operation string) {
    if uiThreadBound {
      requireOpenThread(operation)
    }
  }

  private func requireOpenThread(operation string) {
    SdlRuntime.RequireMainThread(operation)
  }

  private func pushSize() {
    if let native = host {
      native.SetSize(width, height)
    }
  }

  private func pushPosition() {
    if let native = host {
      native.SetPosition(x, y)
    }
  }

  /// Creates the native window and returns this window.
  /// @returns this window after native initialization
  public func Open() Window {
    requireOpenThread("Window.Open")
    if IsOpen {
      WindowDiagnostics.AttachIfEnabled(this)
      return this
    }
    prepare()

    try {
      let native = SdlHost(
        Title,
        Width,
        Height,
        x,
        y,
        positionSet,
        State,
        decorated,
        resizable,
        transparent,
        VSync,
        func(px int32, py int32) WindowHitResult { return hitTest(px, py) })
      host = native
      let target = VulkanWindowTarget(native)
      windowTarget = target
      uiThreadBound = true
      configureHost(native)
      profiler.Sink = target.ProfileSink
      if !applyNativeResize(
        native.LogicalWidth,
        native.LogicalHeight,
        native.FramebufferWidth,
        native.FramebufferHeight) {
          throw InvalidOperationException("Window initialization could not create a render target")
        }
      x = native.X
      y = native.Y
      input.Attach(native)
      native.Show()
      IsOpen = true
      schedulerLastTicks = float64(Stopwatch.GetTimestamp())
      schedulerSimulationBank = 0.0
      Window.RegisterLiveWindow(this)
      WindowDiagnostics.AttachIfEnabled(this)
      return this
    } catch (e Exception) {
      try { Close() } catch (cleanup Exception) { }
      throw e
    }
  }

  private func configureHost(native WindowHost) {
    native.MetricsChanged += (logicalWidth int32, logicalHeight int32,
      nativeWidth int32, nativeHeight int32) -> {
        queueNativeMetrics(logicalWidth, logicalHeight, nativeWidth, nativeHeight)
      }
    native.StateChanged += (value WindowState) -> {
      state = value
      requestRender()
      notifications.RaiseStateChanged(State)
    }
    native.Moved += (px int32, py int32) -> {
      x = px
      y = py
    }
    native.FocusChanged += (hasFocus bool) -> {
      handleFocusChanged(hasFocus)
    }
    native.Exposed += () -> {
      requestRender()
    }
    native.CloseRequested += () -> {
      Interlocked.Exchange(&closeRequested, 1)
    }
  }

  internal func handleFocusChanged(hasFocus bool) {
    if IsFocused == hasFocus {
      return
    }
    IsFocused = hasFocus
    if !hasFocus {
      input.FocusLost(node, resolver)
      markDirtyAndRender()
    }
    notifications.RaiseFocusChanged(hasFocus)
  }

  /// Queues an idempotent close request. This is safe from any thread.
  public func RequestClose() {
    if Interlocked.Exchange(&closeRequested, 1) == 0 {
      host?.Wake()
    }
  }

  // One decision per queued request: native close, Alt+F4, and RequestClose
  // all land here; nil OnClosing closes, false vetoes.
  internal func drainCloseRequest() bool {
    if Interlocked.Exchange(&closeRequested, 0) == 0 {
      return false
    }
    guard let handler = OnClosing else {
      return true
    }
    return handler()
  }

  /// Processes one frame with the specified elapsed time.
  /// @param dt elapsed seconds since the previous frame
  public func Pump(dt float64) {
    requireUiThread("Window.Pump")
    schedulerSimulationBank = 0.0
    pumpCore(dt, true, true, dt)
    schedulerLastTicks = float64(Stopwatch.GetTimestamp())
  }

  internal func PumpScheduled(dt float64) {
    requireUiThread("Window scheduled pump")
    schedulerSimulationBank = 0.0
    pumpCore(dt, false, true, dt)
    schedulerLastTicks = float64(Stopwatch.GetTimestamp())
  }

  internal func SchedulerPump(nowTicks float64, frameAllowed bool) {
    requireUiThread("Window scheduled pump")
    var dt float64
    if schedulerLastTicks > 0.0 {
      dt = (nowTicks - schedulerLastTicks) / float64(Stopwatch.Frequency)
      if dt < 0.0 {
        dt = 0.0
      }
    }
    schedulerLastTicks = nowTicks
    var simulationDt float64
    if frameAllowed {
      simulationDt = schedulerSimulationBank + dt
      schedulerSimulationBank = 0.0
    } else {
      schedulerSimulationBank = schedulerSimulationBank + dt
    }
    pumpCore(dt, false, frameAllowed, simulationDt)
  }

  private func pumpCore(dt float64, waitForEvents bool, frameAllowed bool,
    simulationDt float64) {
      if !motionFinite(dt) || dt < 0.0 {
        throw ArgumentOutOfRangeException("dt")
      }
      if !motionFinite(simulationDt) || simulationDt < 0.0 {
        throw ArgumentOutOfRangeException("simulationDt")
      }
      guard let native = host else {
        return
      }
      let queueCompletedAtEntry = windowTarget?.PollQueueCompletion() == true
      if native.IsClosing {
        if windowTarget?.PrepareClose() == false {
          native.Wake()
          return
        }
        Close()
        return
      }
      if !IsOpen {
        return
      }
      let profiling = profiler.Active
      let frameProfile = profiling ? profiler.Start() : FrameProfilePoint{}
      let eventsProfile = profiling ? profiler.Start() : FrameProfilePoint{}
      if waitForEvents {
        if hasDemand() {
          native.PollEvents()
        } else {
          native.WaitEvents(idleWaitMs())
        }
      }
      let repeatStartTicks = Stopwatch.GetTimestamp()
      if !native.IsClosing && drainCloseRequest() {
        if windowTarget?.PrepareClose() == false {
          Interlocked.Exchange(&closeRequested, 1)
        } else {
          stopPosts()
          native.BeginClose()
        }
      }
      if native.IsClosing || !IsOpen {
        try {
          Close()
        } finally {
          if profiling {
            profiler.Record(FrameProfileStage.Events, eventsProfile)
            profiler.EndFrame(frameProfile, false)
          }
        }
        return
      }
      consumeNativeMetrics()
      if !IsOpen {
        if profiling {
          profiler.Record(FrameProfileStage.Events, eventsProfile)
          profiler.EndFrame(frameProfile, false)
        }
        return
      }
      native.ClearPendingEvents()
      if profiling {
        profiler.Record(FrameProfileStage.Events, eventsProfile)
      }

      // Pump drains each fixed Post batch here, after close decisions and before input.
      drainPostedActions()

      // Drain returns true only for visually relevant input; bare moves stay quiet.
      let inputProfile = profiling ? profiler.Start() : FrameProfilePoint{}
      let inputChanged = input.Drain(node, resolver, timeS,
        notifications.KeyPressedCallbacks, repeatStartTicks)
      if profiling {
        profiler.Record(FrameProfileStage.Input, inputProfile)
      }
      if inputChanged {
        accessibility?.MarkDirty()
        resolver.VisualDirty = true
      }
      if input.ConsumeScrollRectsDirty() {
        pendingReconcileEffects = combineEffects(pendingReconcileEffects,
          ReconcileEffects.Paint | ReconcileEffects.Input | ReconcileEffects.Rect
          | ReconcileEffects.Accessibility)
      }
      // dt can carry a stale idle wait (up to 250 ms) plus whatever this call's
      // own poll/wait consumed. Nothing was ticking while asleep (hasDemand()
      // was false), so nothing loses banked motion; without this clamp, an
      // anim/transition/scroll retarget started by the very input that just
      // woke us would take its first (and sometimes only) step across the
      // whole stale gap instead of animating. timeS (and so input's
      // double-click clock) must NOT be clamped, or it runs slow while idle
      // and misreads two far-apart clicks as a double-click -- only the
      // simulation step is bounded; UpdateTree's wallDt/simDt split keeps them
      // separate.
      let stepDt = frameAllowed ? Math.Min(simulationDt, 1.0 / 30.0) : 0.0
      let treeProfile = profiling ? profiler.Start() : FrameProfilePoint{}
      UpdateTree(dt, stepDt)
      if profiling {
        profiler.Record(FrameProfileStage.Tree, treeProfile)
      }
      native.SetCursor(input.CurrentCursor())
      let queueCompleted = queueCompletedAtEntry || windowTarget?.PollQueueCompletion() == true
      var rendered = false
      if queueCompleted {
        markFrameRendered()
        rendered = true
        native.MarkFrame(float64(Stopwatch.GetTimestamp()))
      }
      let frameNeeded = needsRenderFrame(resolver.VisualDirty)
      if frameAllowed && frameNeeded && windowTarget?.QueueWorkPending != true {
        let renderProfile = profiling ? profiler.Start() : FrameProfilePoint{}
        let currentProfile = profiling ? profiler.Start() : FrameProfilePoint{}
        windowTarget?.BeginFrame()
        if profiling {
          profiler.Record(FrameProfileStage.TargetBegin, currentProfile)
        }
        renderFrame()
        let swapProfile = profiling ? profiler.Start() : FrameProfilePoint{}
        windowTarget?.Present()
        if profiling {
          profiler.Record(FrameProfileStage.Present, swapProfile)
          profiler.Record(FrameProfileStage.Render, renderProfile)
        }
        let submitted = windowTarget?.LastFrameSubmitted == true
        if submitted {
          markFrameRendered()
          rendered = true
          native.MarkFrame(float64(Stopwatch.GetTimestamp()))
        } else {
          native.DeferFrame(float64(Stopwatch.GetTimestamp()))
        }
      }
      if profiling {
        profiler.EndFrame(frameProfile, rendered)
      }
    }

  // One source of truth for "may I sleep": a running Anim, a mid-transition
  // Resolver field, an already-requested render, a not-yet-drained rebuild,
  // or scroll glide/scrollbar fade still settling. Any of these means Pump
  // must keep spinning; none of them means it is safe to block in the window host.
  // Caret blink and key repeat are deliberately NOT here: unlike the sources
  // above, they never terminate on their own (a focus caret keeps "wanting"
  // a tick for as long as it's focused), so folding them into demand would
  // latch Pump into an unpaced, unrendered poll spin instead of a bounded
  // sleep. idleWaitMs() below is where their timing actually gets honored.
  private func hasDemand() bool -> motionPump.Active || resolver.Animating.Count > 0
    || shaderPlaybackDemand() || renderDirty || pendingRebuild != 0
    || pendingImageCompletion != 0 || pendingRetainedInvalidation != 0 || hasScrollDemand()
    || accessibility?.HasDemand == true || hasPostedActions() || MetricSubscriptions.HasDemand(this)
    || windowTarget?.NeedsRender == true || windowTarget?.QueueWorkPending == true
    || Interlocked.CompareExchange(&closeRequested, 0, 0) != 0
    || host?.IsClosing == true

  internal func SchedulerHasImmediateService() bool -> host?.HasPendingEvents == true || hasPostedActions()
    || Interlocked.CompareExchange(&closeRequested, 0, 0) != 0
    || host?.IsClosing == true

  internal func SchedulerHasPendingQueueWork() bool -> windowTarget?.QueueWorkPending == true

  internal func SchedulerFrameDue(nowTicks float64) bool {
    guard let native = host else {
      return false
    }
    return hasDemand() && native.SchedulerPacingAvailable &&
    native.IsFrameDue(nowTicks)
  }

  internal func SchedulerWaitMs(nowTicks float64) int32 {
    if SchedulerHasImmediateService() {
      return 0
    }
    let idle = idleWaitMs()
    let demand = hasDemand()
    let timed = SchedulerTimedServiceDue()
    if timed {
      return 0
    }
    if windowTarget?.QueueWorkPending == true {
      return idle
    }
    if !demand {
      return idle
    }
    guard let native = host else {
      return idle
    }
    if !native.SchedulerPacingAvailable {
      return idle
    }
    let pacingWait = native.FrameWaitMilliseconds(nowTicks, idle)
    return pacingWait < idle ? pacingWait : idle
  }

  internal func SchedulerTimedServiceDue() bool -> input.NextTickDeadlineSeconds() <= 0.0

  internal func RefreshSchedulerMetrics() {
    host?.RefreshMetricsIfChanged()
  }

  // The idle wait timeout: 250ms by default, shortened to land on the next
  // caret blink or key-repeat edge when one is due sooner, so a focused,
  // otherwise-idle window still blocks (near-0 CPU) instead of polling, but
  // wakes itself in time to render each blink transition.
  private func idleWaitMs() int32 {
    let deadline = Math.Min(0.25, input.NextTickDeadlineSeconds())
    let ms = int32(Math.Ceiling(deadline * 1000.0))
    return ms < 1 ? 1 : ms
  }

  private func hasScrollDemand() bool {
    guard let n = node else {
      return false
    }
    let scrollers = layout.ScrollNodes(n)
    for i in 0 ... scrollers.Count {
      let s = scrollers[i]
      if s.ScrollX != s.ScrollTargetX || s.ScrollY != s.ScrollTargetY
        || (s.ScrollbarVisibility == ScrollbarVisibility.Auto && s.ScrollBarAlpha > 0.0F) {
          return true
        }
    }
    return false
  }

  private func shaderPlaybackDemand() bool {
    guard let root = node else { return false }
    return ShaderEffectStyles.TreeHasPlaying(root)
  }

  /// Opens the window and processes frames until all open Goo windows close.
  public func Run() {
    requireOpenThread("Window.Run")
    Open()
    try {
      Window.RunLiveWindowScheduler()
    } finally {
      while IsOpen {
        Close()
        if IsOpen {
          Thread.Yield()
        }
      }
    }
  }

  private func captureCleanupError(firstError Exception?, action Action) Exception? {
    try {
      action()
    } catch (error Exception) {
      if firstError == nil {
        return error
      }
    }
    return firstError
  }

  internal func teardownNative() {
    requireUiThread("Window teardown")
    var firstError Exception?
    firstError = captureCleanupError(firstError, () -> stopPosts())
    firstError = captureCleanupError(firstError, () -> input.Reset(node, resolver))
    firstError = captureCleanupError(firstError, () -> input.Dispose())

    let target = windowTarget
    let native = host
    profiler.Sink = nil
    windowTarget = nil
    host = nil
    schedulerLastTicks = 0.0
    schedulerSimulationBank = 0.0
    framebufferWidth = 0
    framebufferHeight = 0
    pendingMetrics = false
    pendingLogicalWidth = 0
    pendingLogicalHeight = 0
    pendingFramebufferWidth = 0
    pendingFramebufferHeight = 0
    IsOpen = false
    renderDirty = true
    Interlocked.Exchange(&closeRequested, 0)
    IsFocused = false

    if let current = target {
      firstError = captureCleanupError(firstError, () -> current.Dispose())
    }
    if let current = native {
      firstError = captureCleanupError(firstError, () -> current.Dispose())
    }
    if let error = firstError {
      throw error
    }
  }

  internal func Close() {
    requireUiThread("Window.Close")
    if windowTarget?.PrepareClose() == false {
      host?.Wake()
      return
    }
    Window.UnregisterLiveWindow(this)
    var firstError Exception?
    firstError = captureCleanupError(firstError, () -> stopPosts())
    firstError = captureCleanupError(firstError, () -> stopImageCompletions())
    firstError = captureCleanupError(firstError, () -> stopRetainedInvalidations())
    if let session = DiagnosticsSession {
      firstError = captureCleanupError(firstError, () -> session.WindowClosed())
    }
    firstError = captureCleanupError(firstError, () -> teardownNative())

    let tree = node
    node = nil
    if let current = tree {
      firstError = captureCleanupError(firstError, () -> TextLayouts.DisposeTree(current))
    }
    firstError = captureCleanupError(firstError, () -> MetricSubscriptions.Flush(this))
    firstError = captureCleanupError(firstError, () -> MetricSubscriptions.ClearWindow(this))
    firstError = captureCleanupError(firstError, () -> motionPump.Clear())
    pendingRebuild = 0
    pendingPaintResourceInvalidation = 0
    lock cellQueueGate {
      cellTransactionActive = false
      pendingCells.Clear()
      deferredCells.Clear()
      cellBatch.Clear()
      fiberBatch.Clear()
    }
    paintResourceHook = nil
    shaderEffectInvalidatedHook = nil
    imageCompletionHook = nil
    retainedInvalidationHook = nil
    resolver.PaintResourceInvalidated = nil
    resolver.ShaderEffectInvalidated = nil
    cellHook = nil
    hookInstalled = false
    if let error = firstError {
      throw error
    }
  }

  private func renderFrame() {
    if let target = windowTarget {
      let paintProfile = profiler.Active ? profiler.Start() : FrameProfilePoint{}
      target.Render(node, Background, dpi, DiagnosticsSession?.Overlay)
      if profiler.Active {
        profiler.Record(FrameProfileStage.Paint, paintProfile)
      }
    }
  }

  private func consumeNativeMetrics() {
    if !pendingMetrics {
      return
    }
    pendingMetrics = false
    if !applyNativeResize(
      pendingLogicalWidth,
      pendingLogicalHeight,
      pendingFramebufferWidth,
      pendingFramebufferHeight) {
        Close()
      }
  }

  private func applyNativeResize(logicalWidth int32, logicalHeight int32,
    newFramebufferWidth int32, newFramebufferHeight int32) bool{
      let framebufferValid = newFramebufferWidth > 0 && newFramebufferHeight > 0
      HandleResize(logicalWidth, logicalHeight, framebufferValid)
      guard let target = windowTarget else {
        return false
      }
      if !target.Resize(newFramebufferWidth, newFramebufferHeight) {
        return false
      }
      framebufferWidth = newFramebufferWidth
      framebufferHeight = newFramebufferHeight
      if framebufferValid {
        dpi = DpiScale(logicalWidth, logicalHeight, newFramebufferWidth, newFramebufferHeight)
      }
      return true
    }
}

internal func DpiScale(width int32, height int32, fbWidth int32, fbHeight int32) Vector2 {
  if width <= 0 || height <= 0 || fbWidth <= 0 || fbHeight <= 0 {
    return Vector2(1.0F, 1.0F)
  }
  return Vector2(float32(fbWidth) / float32(width), float32(fbHeight) / float32(height))
}
