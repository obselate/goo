package Goo

import System
import System.Collections.Generic
import System.Numerics

/// Identifies the requested state of a window.
public enum WindowState { Normal; Minimized; Maximized; Fullscreen }

/// Controls how Window.Run schedules frames that have visual demand.
public enum WindowFramePacing { Display; Uncapped }

/// Reports a successful queue-present handoff, not display scanout.
public data struct WindowPresentationAccepted {
  private var frameIndex uint64
  private var acceptedTicks int64

  /// Gets the one-based accepted presentation number for this window opening.
  public prop FrameIndex uint64{ get -> frameIndex init -> frameIndex = value }
  /// Gets the monotonic Stopwatch timestamp when Goo observed that acceptance.
  public prop AcceptedTicks int64{ get -> acceptedTicks init -> acceptedTicks = value }
}

/// Reports whether an asynchronous window capture request was accepted.
public enum WindowCaptureRequestStatus {
  Accepted;
  Busy;
  BudgetExceeded;
  NotReady;
  Failed;
  DeviceLost;
  Unsupported;
}

/// Owns RGBA8, sRGB, premultiplied pixels copied from a completed scene capture.
public sealed class WindowCapture {
  private let pixels []uint8
  private let width uint32
  private let height uint32
  private let rowBytes uint32

  /// Gets the captured width in pixels.
  public prop Width uint32{ get -> width }
  /// Gets the captured height in pixels.
  public prop Height uint32{ get -> height }
  /// Gets the row stride in bytes.
  public prop RowBytes uint32{ get -> rowBytes }
  /// Gets the caller-owned, top-left-origin RGBA8 pixel array.
  public prop Pixels []uint8{ get -> pixels }
  /// Reports that color channels are premultiplied by alpha.
  public prop Premultiplied bool{ get -> true }
  /// Reports that color channels use sRGB encoding.
  public prop SrgbEncoded bool{ get -> true }
  /// Reports that the first pixel is at the top left.
  public prop OriginTopLeft bool{ get -> true }

  internal init(result WindowReadbackResult, reusable WindowCapture? = nil) {
    width = result.Width
    height = result.Height
    rowBytes = result.RowBytes
    let reuse = reusable?.Pixels
    pixels = if reuse != nil && uint64(reuse.Length) == uint64(rowBytes) * uint64(height) {
      reuse
    } else {
      result.Pixels
    }
  }

  internal init(result VulkanReadbackResult) {
    width = result.Width
    height = result.Height
    rowBytes = result.RowBytes
    pixels = result.OwnedPixels
  }
}

internal enum WindowCaptureOwner { None; Public; Diagnostics }

/// Describes one stable window size and display-scale snapshot.
public data struct WindowMetrics {
  private var logicalWidth int32
  private var logicalHeight int32
  private var framebufferWidth int32
  private var framebufferHeight int32
  private var displayScaleX float64
  private var displayScaleY float64
  private var uiScale float32

  /// Gets the reported logical width.
  public prop LogicalWidth int32{ get -> logicalWidth init -> logicalWidth = value }
  /// Gets the reported logical height.
  public prop LogicalHeight int32{ get -> logicalHeight init -> logicalHeight = value }
  /// Gets the reported framebuffer width.
  public prop FramebufferWidth int32{ get -> framebufferWidth init -> framebufferWidth = value }
  /// Gets the reported framebuffer height.
  public prop FramebufferHeight int32{ get -> framebufferHeight init -> framebufferHeight = value }
  /// Gets the horizontal framebuffer-to-logical scale.
  public prop DisplayScaleX float64{ get -> displayScaleX init -> displayScaleX = value }
  /// Gets the vertical framebuffer-to-logical scale.
  public prop DisplayScaleY float64{ get -> displayScaleY init -> displayScaleY = value }
  /// Gets the retained UI scale. A default snapshot uses 1.
  public prop UiScale float32{ get -> uiScale == 0.0F ? 1.0F : uiScale init -> uiScale = value }
}

internal struct WindowNotifications {
  private event stateChanged Action[WindowState]
  private event keyPressed Action[Key, KeyModifiers]
  private event previewKeyPressed Func[Key, KeyModifiers, bool]
  private var previewKeyPressedCallbacks ([]Delegate)?
  private event focusChanged Action[bool]
  private event visibilityChanged Action[bool]
  private event preferencesChanged Action[PlatformPreferences]
  private event presentationAccepted Action[WindowPresentationAccepted]
  private event displayChanged Action

  internal func AddStateChanged(callback Action[WindowState]) { stateChanged += callback }
  internal func RemoveStateChanged(callback Action[WindowState]) { stateChanged -= callback }
  internal func RaiseStateChanged(value WindowState) { stateChanged?.Invoke(value) }

  internal func AddKeyPressed(callback Action[Key, KeyModifiers]) { keyPressed += callback }
  internal func RemoveKeyPressed(callback Action[Key, KeyModifiers]) { keyPressed -= callback }
  internal prop KeyPressedCallbacks Action[Key, KeyModifiers]? { get -> keyPressed }

  internal func AddPreviewKeyPressed(callback Func[Key, KeyModifiers, bool]) {
    previewKeyPressed += callback
    previewKeyPressedCallbacks = previewKeyPressed?.GetInvocationList()
  }
  internal func RemovePreviewKeyPressed(callback Func[Key, KeyModifiers, bool]) {
    previewKeyPressed -= callback
    previewKeyPressedCallbacks = previewKeyPressed?.GetInvocationList()
  }
  internal func PreviewKeyPress(key Key, modifiers KeyModifiers) bool {
    guard let callbacks = previewKeyPressedCallbacks else { return false }
    for callback in callbacks {
      let handler = (callback as Func[Key, KeyModifiers, bool])!!
      if handler(key, modifiers) { return true }
    }
    return false
  }

  internal func AddFocusChanged(callback Action[bool]) { focusChanged += callback }
  internal func RemoveFocusChanged(callback Action[bool]) { focusChanged -= callback }
  internal func RaiseFocusChanged(value bool) { focusChanged?.Invoke(value) }
  internal func AddVisibilityChanged(callback Action[bool]) { visibilityChanged += callback }
  internal func RemoveVisibilityChanged(callback Action[bool]) { visibilityChanged -= callback }
  internal func RaiseVisibilityChanged(value bool) { visibilityChanged?.Invoke(value) }
  internal func AddPreferencesChanged(callback Action[PlatformPreferences]) { preferencesChanged += callback }
  internal func RemovePreferencesChanged(callback Action[PlatformPreferences]) { preferencesChanged -= callback }
  internal func RaisePreferencesChanged(value PlatformPreferences) { preferencesChanged?.Invoke(value) }
  internal prop HasPresentationAcceptedCallbacks bool{ get -> presentationAccepted != nil }
  internal func AddPresentationAccepted(callback Action[WindowPresentationAccepted]) { presentationAccepted += callback }
  internal func RemovePresentationAccepted(callback Action[WindowPresentationAccepted]) { presentationAccepted -= callback }
  internal func RaisePresentationAccepted(value WindowPresentationAccepted) { presentationAccepted?.Invoke(value) }
  internal func AddDisplayChanged(callback Action) { displayChanged += callback }
  internal func RemoveDisplayChanged(callback Action) { displayChanged -= callback }
  internal func RaiseDisplayChanged() { displayChanged?.Invoke() }
}

/// Hosts a Goo tree on one process-wide UI thread.
/// After Open or Attach, only Post and RequestClose are safe from another thread.
public partial class Window {
  /// Gets or sets the window clear color. The default is white.
  public prop Background Color{
    get -> background
    set(v) -> SetColors(v, foreground)
  }
  /// Gets or sets the inherited root text color. The default is black.
  public prop Foreground Color{
    get -> foreground
    set(v) -> SetColors(background, v)
  }
  /// Sets the clear and inherited root text colors together on the owner thread.
  /// Explicit element colors take precedence over the inherited foreground.
  /// @param background The window clear color.
  /// @param foreground The inherited root text color.
  /// @exception InvalidOperationException when called off the owner thread after Open or Attach.
  public func SetColors(background Color, foreground Color) {
    requireUiThread("Window.SetColors")
    if this.background == background && this.foreground == foreground { return }
    let foregroundChanged = this.foreground != foreground
    this.background = background
    this.foreground = foreground
    if foregroundChanged && node != nil {
      foregroundPending = true
    }
    requestRender()
    host?.Wake()
  }
  /// Gets the root cell.
  public prop Root Cell? {
    get -> root
    init -> root = value
  }
  /// Configures PNG bytes for the native window icon in the Window initializer before Open.
  /// The icon is decoded when opening, has a 1024 pixel edge limit, and requires no external file.
  public prop IconPng [] ? uint8 {
    get -> iconPng
    init -> iconPng = value
  }
  /// Reports whether the window is open.
  public prop IsOpen bool{ get; private set; }
  internal prop Tree Node? { get -> node }
  internal prop DiagnosticsSession DevToolsSession? { get -> diagnosticsSession }
  /// Gets or sets per-window GPU presentation synchronization.
  /// True requests FIFO. Software Vulkan devices prefer Immediate, then Mailbox, then FIFO.
  /// False prefers Immediate, then Mailbox, then FIFO on every device.
  /// Window.Run pacing is controlled separately by FramePacing.
  public prop VSync bool{
    get -> vsync
    set(v) {
      requireUiThread("Window.VSync")
      if vsync == v {
        return
      }
      vsync = v
      if let native = host {
        native.SetVSync(v)
      }
      windowTarget?.SetVSync(v)
    }
  }

  /// Gets or sets the frame pacing used by Window.Run. Uncapped still honors
  /// GPU queue readiness and the selected presentation mode.
  public prop FramePacing WindowFramePacing{
    get -> framePacing
    set(v) {
      requireUiThread("Window.FramePacing")
      if v != WindowFramePacing.Display && v != WindowFramePacing.Uncapped {
        throw ArgumentOutOfRangeException("v")
      }
      if framePacing == v { return }
      framePacing = v
      host?.Wake()
    }
  }

  /// Reports whether the native target has pending GPU submit or present work.
  /// Use Pump(0) to service pending work without advancing the simulation.
  public prop QueueWorkPending bool{
    get {
      requireUiThread("Window.QueueWorkPending")
      return windowTarget?.QueueWorkPending == true
    }
  }

  /// Gets or sets the window title.
  public prop Title string{
    get -> title
    set(v) {
      requireUiThread("Window.Title")
      if title == v {
        return
      }
      title = v
      if let native = host {
        native.SetTitle(v)
      }
      if let adapter = accessibility?.Adapter as NativeAccessibilityAdapter? { RequestNativeAccessibilityDelivery(adapter) }
    }
  }

  /// Gets or sets the window width.
  public prop Width int32{
    get -> width
    set(v) {
      requireUiThread("Window.Width")
      if width == v {
        return
      }
      width = v
      pushSize()
      MetricSubscriptions.MarkWindowDirty(this)
      requestRender()
    }
  }

  /// Gets or sets the window height.
  public prop Height int32{
    get -> height
    set(v) {
      requireUiThread("Window.Height")
      if height == v {
        return
      }
      height = v
      pushSize()
      MetricSubscriptions.MarkWindowDirty(this)
      requestRender()
    }
  }

  // positionSet distinguishes an explicit (0,0) request.
  /// Gets or sets the requested horizontal position.
  public prop X int32{
    get -> x
    set(v) {
      requireUiThread("Window.X")
      positionSet = true
      if x == v {
        return
      }
      x = v
      pushPosition()
    }
  }

  /// Gets or sets the requested vertical position.
  public prop Y int32{
    get -> y
    set(v) {
      requireUiThread("Window.Y")
      positionSet = true
      if y == v {
        return
      }
      y = v
      pushPosition()
    }
  }

  /// Gets or sets the window state.
  public prop State WindowState{
    get -> state
    set(v) {
      requireUiThread("Window.State")
      if state == v {
        return
      }
      if let native = host {
        native.SetState(v)
      }
      state = v
    }
  }

  /// Gets or sets next-open per-pixel alpha. An open window is unchanged.
  /// Transparency requires the GPU renderer.
  public prop Transparent bool{
    get -> transparent
    set(v) {
      requireUiThread("Window.Transparent")
      transparent = v
    }
  }

  /// Gets or sets whether the system draws window decorations.
  public prop Decorated bool{
    get -> decorated
    set(v) {
      requireUiThread("Window.Decorated")
      if decorated == v {
        return
      }
      decorated = v
      if let native = host {
        native.SetBorder(decorated, resizable)
      }
    }
  }

  /// Gets or sets whether the user can resize the window.
  public prop Resizable bool{
    get -> resizable
    set(v) {
      requireUiThread("Window.Resizable")
      if resizable == v {
        return
      }
      resizable = v
      if let native = host {
        native.SetBorder(decorated, resizable)
      }
    }
  }

  /// Gets or sets the undecorated edge resize band in logical pixels.
  public prop ResizeBand float32{
    get -> resizeBand
    set(v) {
      requireUiThread("Window.ResizeBand")
      if !Single.IsFinite(v) || v < 0.0F {
        throw ArgumentOutOfRangeException("value")
      }
      resizeBand = v
    }
  }

  /// Reports whether the window currently holds native input focus.
  public prop IsFocused bool{ get; private set; }

  /// Occurs after the native window reports a new window state.
  public event StateChanged Action[WindowState]{
    add{
      requireUiThread("Window.StateChanged")
      notifications.AddStateChanged(value)
    }
    remove{
      requireUiThread("Window.StateChanged")
      notifications.RemoveStateChanged(value)
    }
  }
  /// Occurs for each physical key press before focused-element routing.
  public event KeyPressed Action[Key, KeyModifiers]{
    add{
      requireUiThread("Window.KeyPressed")
      notifications.AddKeyPressed(value)
    }
    remove{
      requireUiThread("Window.KeyPressed")
      notifications.RemoveKeyPressed(value)
    }
  }
  /// Occurs before KeyPressed and focused-element routing, including in modal scopes.
  /// Return true to consume the key and stop later preview handlers.
  public event PreviewKeyPressed Func[Key, KeyModifiers, bool]{
    add{
      requireUiThread("Window.PreviewKeyPressed")
      notifications.AddPreviewKeyPressed(value)
    }
    remove{
      requireUiThread("Window.PreviewKeyPressed")
      notifications.RemovePreviewKeyPressed(value)
    }
  }
  /// Gets or sets the close-request handler. Return false to veto closure.
  /// OS termination bypasses this handler.
  /// Accepted requests do not invoke the handler again while teardown finishes.
  public prop OnClosing(() -> bool)? {
    get -> onClosing
    set(v) {
      requireUiThread("Window.OnClosing")
      onClosing = v
    }
  }
  /// Occurs after the native window focus state changes.
  public event FocusChanged Action[bool]{
    add{
      requireUiThread("Window.FocusChanged")
      notifications.AddFocusChanged(value)
    }
    remove{
      requireUiThread("Window.FocusChanged")
      notifications.RemoveFocusChanged(value)
    }
  }

  /// Occurs after the native window reports a new stable size or display scale.
  /// Callbacks run on the window UI thread after native metrics and layout settle.
  public event MetricsChanged Action[WindowMetrics]{
    add{ MetricSubscriptions.AddWindow(this, value) }
    remove{ MetricSubscriptions.RemoveWindow(this, value) }
  }

  /// Occurs on the UI thread through the posted-action queue after Vulkan
  /// accepts a present request.
  /// Acceptance does not establish a display scanout time.
  public event PresentationAccepted Action[WindowPresentationAccepted]{
    add{
      requireUiThread("Window.PresentationAccepted")
      notifications.AddPresentationAccepted(value)
    }
    remove{
      requireUiThread("Window.PresentationAccepted")
      notifications.RemovePresentationAccepted(value)
    }
  }

  /// Gets the current native clipboard text on the window UI thread.
  /// An empty result can mean an empty clipboard, native copy failure, or text exceeding 16 MiB of UTF-8.
  /// @exception InvalidOperationException when the window is not open.
  public func GetClipboardText() string {
    requireUiThread("Window.GetClipboardText")
    if !IsOpen { throw InvalidOperationException("Clipboard access requires an open window") }
    guard let native = host else {
      throw InvalidOperationException("Clipboard access requires an open window")
    }
    return native.GetClipboardText()
  }

  /// Sets the native clipboard text on the window UI thread.
  /// Native set failures throw.
  /// @exception InvalidOperationException when the window is not open.
  public func SetClipboardText(value string) {
    requireUiThread("Window.SetClipboardText")
    if value == nil { throw ArgumentNullException("value") }
    if !IsOpen { throw InvalidOperationException("Clipboard access requires an open window") }
    guard let native = host else {
      throw InvalidOperationException("Clipboard access requires an open window")
    }
    native.SetClipboardText(value)
  }

  /// Reports whether programmatic window movement is available.
  public prop CanMove bool{
    get {
      requireUiThread("Window.CanMove")
      return if let native = host { native.CanMove } else { false }
    }
  }

  private var node Node?
  private let portalRoot Node
  private var dirty bool
  private var pendingReconcileEffects ReconcileEffects
  private var pendingRebuild int32
  private var pendingPaintResourceInvalidation int32
  private let retainedInvalidationGate object
  private var pendingRetainedEffects ReconcileEffects
  private var pendingRetainedInvalidation int32
  private var acceptingRetainedInvalidations bool
  private let imageCompletionGate object
  private let pendingImageCompletions List[ImageCompletionWork]
  private let imageCompletionBatch List[ImageCompletionWork]
  private var acceptingImageCompletions bool
  private var pendingImageCompletion int32
  private let cellQueueGate object
  private let pendingCells List[DirtyCellSubmission]
  private let deferredCells List[DirtyCellSubmission]
  private let cellBatch List[DirtyCellSubmission]
  private let fiberBatch List[Cell]
  private let childDiffScratch ChildDiffScratch
  private var cellTransactionActive bool
  private var renderDirty bool
  private var hookInstalled bool
  private var paintResourceHook Action?
  private var shaderEffectInvalidatedHook Action?
  private var imageCompletionHook((Node, object) -> void)?
  private var retainedInvalidationHook Action[ReconcileEffects]?
  private var cellHook Action[Cell]?
  private var layout Layout
  private var resolver Resolver
  private let profiler FrameProfiler
  private let motionPump MotionPump
  private var timeS float64

  private var input InputCoordinator
  private var diagnosticsSession DevToolsSession?
  private var accessibility AccessibilityManager?
  private var host WindowHost?
  private var windowTarget WindowRenderTarget?
  private var dpi Vector2

  private var pendingMetrics bool
  private var pendingLogicalWidth int32
  private var pendingLogicalHeight int32
  private var pendingFramebufferWidth int32
  private var pendingFramebufferHeight int32
  private var framebufferWidth int32
  private var framebufferHeight int32

  private var state WindowState
  private var vsync bool
  private var framePacing WindowFramePacing
  private var flushingMetricsBeforeRender bool
  private var metricsFlushThreadId int32
  private var acceptedFrameIndex uint64
  private var presentationAcceptedHook Action[int64]?
  private var captureOwner WindowCaptureOwner
  private var capturePending bool
  private var captureFailed bool
  private var reusableCapture WindowCapture?
  private var title string
  private var background Color
  private var foreground Color
  private var foregroundPending bool
  private var root Cell?
  private var iconPng [] ? uint8
  private var width int32
  private var height int32
  private var x int32
  private var y int32
  private var positionSet bool
  private var decorated bool
  private var resizable bool
  private var transparent bool
  private var resizeBand float32
  private var closeRequested int32
  private var postedActions Queue[Action]?
  private var pendingPostedActions int32
  private var acceptingPosts bool
  private var uiThreadBound bool
  private var notifications WindowNotifications
  private var onClosing(() -> bool)?

  /// Creates a window with default configuration.
  public init() {
    title = ""
    background = Color.White
    foreground = Color.Black
    vsync = true
    framePacing = WindowFramePacing.Display
    decorated = true
    resizable = true
    resizeBand = 8.0F
    acceptingPosts = true
    dirty = true
    retainedInvalidationGate = Object()
    pendingRetainedEffects = ReconcileEffects.None
    acceptingRetainedInvalidations = true
    imageCompletionGate = Object()
    pendingImageCompletions = List[ImageCompletionWork]()
    imageCompletionBatch = List[ImageCompletionWork]()
    acceptingImageCompletions = true
    pendingReconcileEffects = ReconcileEffects.None
    renderDirty = true
    cellQueueGate = Object()
    pendingCells = List[DirtyCellSubmission]()
    deferredCells = List[DirtyCellSubmission]()
    cellBatch = List[DirtyCellSubmission]()
    fiberBatch = List[Cell]()
    childDiffScratch = ChildDiffScratch()
    portalRoot = Node{Kind: NodeKind.Container, HitTestSelf: false}
    layout = Layout()
    resolver = Resolver{Owner: this}
    profiler = FrameProfiler()
    motionPump = MotionPump()
    motionPump.Wake = requestReconcile

    input = InputCoordinator()

    dpi = Vector2(1.0F, 1.0F)
  }

  internal func AttachDiagnostics(allowInput bool = false) DevToolsSession {
    requireUiThread("Window.AttachDiagnostics")
    if let current = DiagnosticsSession {
      if allowInput { current.EnableInput() }
      return current
    }
    let session = DevToolsSession(this, allowInput)
    diagnosticsSession = session
    resolver.DebugOverrides = session.OverrideStore
    input.SetDiagnostics(
      func(root Node?, kind PointerEventKind, x float32, y float32, button PointerButton) bool {
        if let current = DiagnosticsSession { return current.PointerEvent(root, kind, x, y, button) }
        return false
      },
      func(key Key, modifiers KeyModifiers) bool {
        if let current = DiagnosticsSession { return current.KeyEvent(key) }
        return false
      })
    DevTools.Register(session)
    requestRender()
    host?.Wake()
    return session
  }

  internal func ClearDiagnostics(session DevToolsSession) {
    if DiagnosticsSession != session {
      return
    }
    diagnosticsSession = nil
    if captureOwner == WindowCaptureOwner.Diagnostics {
      captureOwner = WindowCaptureOwner.None
      capturePending = false
      captureFailed = false
    }
    resolver.DebugOverrides = nil
    input.SetDiagnostics(nil, nil)
    requestRender()
  }

  internal func RequestDiagnosticsFrame() {
    requestRender()
    host?.Wake()
  }

  internal func ResetInputForDiagnostics() {
    input.Reset(node, resolver)
  }

  /// Starts an asynchronous offscreen replay of the current scene. This may
  /// submit a native present and does not sample a specific display scanout.
  /// Call PollCapture on the UI thread until it returns pixels.
  public func RequestCapture() WindowCaptureRequestStatus -> RequestCapture(nil)

  /// Reuses a previous capture's caller-owned pixels when its size matches.
  /// Do not access or reuse those pixels until PollCapture completes this request.
  /// A changed capture size allocates an independent pixel array.
  public func RequestCapture(reusable WindowCapture?) WindowCaptureRequestStatus {
    requireUiThread("Window.RequestCapture")
    if !IsOpen { return WindowCaptureRequestStatus.NotReady }
    if embeddedHost != nil { return WindowCaptureRequestStatus.Unsupported }
    guard let target = windowTarget else { return WindowCaptureRequestStatus.NotReady }
    if captureOwner != WindowCaptureOwner.None { return WindowCaptureRequestStatus.Busy }
    reusableCapture = reusable
    let status = captureRequestStatus(startCapture(target, WindowCaptureOwner.Public))
    if status != WindowCaptureRequestStatus.Accepted {
      reusableCapture = nil
    }
    return status
  }

  private func startCapture(target WindowRenderTarget, owner WindowCaptureOwner) WindowReadbackRequestStatus {
    FlushDeferredVirtualization()
    if windowTarget != target { return WindowReadbackRequestStatus.NotReady }
    if target.PollCapture() == WindowReadbackPollStatus.Complete { target.TakeCaptureResult() }
    flushForeground()
    let status = target.RequestCapture(node, portalRoot, RenderBackground, RenderScale, reusableCapture?.Pixels)
    capturePending = status == WindowReadbackRequestStatus.Busy || status == WindowReadbackRequestStatus.NotReady
    if status == WindowReadbackRequestStatus.Accepted || capturePending {
      captureOwner = owner
      return WindowReadbackRequestStatus.Accepted
    }
    return status
  }

  internal func advanceCapture() {
    guard let target = windowTarget else { return }
    if !capturePending || target.QueueWorkPending { return }
    if startCapture(target, captureOwner) != WindowReadbackRequestStatus.Accepted { captureFailed = true }
  }

  private func takeCaptureFailure() {
    if !captureFailed { return }
    captureFailed = false
    captureOwner = WindowCaptureOwner.None
    reusableCapture = nil
    throw InvalidOperationException("Goo capture readback failed")
  }

  /// Takes a completed capture, or returns nil while it is pending.
  /// Failed readback throws and releases this request's ownership.
  public func PollCapture() WindowCapture? {
    requireUiThread("Window.PollCapture")
    if captureOwner != WindowCaptureOwner.Public { return nil }
    takeCaptureFailure()
    guard let target = windowTarget else {
      captureOwner = WindowCaptureOwner.None
      reusableCapture = nil
      return nil
    }
    let status = target.PollCapture()
    if status == WindowReadbackPollStatus.NotReady { return nil }
    captureOwner = WindowCaptureOwner.None
    let reusable = reusableCapture
    reusableCapture = nil
    if status == WindowReadbackPollStatus.Failed {
      throw InvalidOperationException("Goo capture readback failed")
    }
    guard let result = target.TakeCaptureResult() else {
      throw InvalidOperationException("Goo capture result was unavailable")
    }
    return WindowCapture(result, reusable)
  }

  private func captureRequestStatus(value WindowReadbackRequestStatus)
  WindowCaptureRequestStatus -> switch value {
    case WindowReadbackRequestStatus.Accepted: WindowCaptureRequestStatus.Accepted
    case WindowReadbackRequestStatus.Busy: WindowCaptureRequestStatus.Busy
    case WindowReadbackRequestStatus.BudgetExceeded: WindowCaptureRequestStatus.BudgetExceeded
    case WindowReadbackRequestStatus.NotReady: WindowCaptureRequestStatus.NotReady
    case WindowReadbackRequestStatus.Failed: WindowCaptureRequestStatus.Failed
    case WindowReadbackRequestStatus.DeviceLost: WindowCaptureRequestStatus.DeviceLost
  }

  internal func RequestDiagnosticsCapture() WindowReadbackRequestStatus {
    if captureOwner != WindowCaptureOwner.None { return WindowReadbackRequestStatus.Busy }
    guard let target = windowTarget else { return WindowReadbackRequestStatus.NotReady }
    return startCapture(target, WindowCaptureOwner.Diagnostics)
  }

  internal func PollDiagnosticsCapture() WindowReadbackResult? {
    if captureOwner != WindowCaptureOwner.Diagnostics { return nil }
    takeCaptureFailure()
    guard let target = windowTarget else { return nil }
    let result = target.PollCapture()
    if result == WindowReadbackPollStatus.NotReady { return nil }
    captureOwner = WindowCaptureOwner.None
    if result == WindowReadbackPollStatus.Failed {
      throw InvalidOperationException("Goo capture readback failed")
    }
    guard let capture = target.TakeCaptureResult() else {
      throw InvalidOperationException("Goo capture result was unavailable")
    }
    return capture
  }

  internal func RequestDiagnosticsRebuild() {
    if let cell = Root {
      cell.Rebuild()
    }
    requestReconcile()
    requestRender()
    host?.Wake()
  }

  internal func InvalidateDiagnosticsOverride(n Node) {
    resolver.Invalidate(n, false)
  }

  internal func CompleteDiagnosticsOverrideReset(n Node, fields IEnumerable[StyleField]) {
    for field in fields {
      if inheritable(field) { resolver.PropagateDebugInheritance(n, field) }
      resolver.RecordDebugResolvedChange(field)
    }
  }
}
