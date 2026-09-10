package Goo

import System
import System.Collections.Generic
import System.Numerics

/// Identifies the requested state of a window.
public enum WindowState { Normal; Minimized; Maximized; Fullscreen }

/// Describes one stable window size and display-scale snapshot.
public data struct WindowMetrics {
  private var logicalWidth int32
  private var logicalHeight int32
  private var framebufferWidth int32
  private var framebufferHeight int32
  private var displayScaleX float64
  private var displayScaleY float64

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
}

internal struct WindowNotifications {
  private event stateChanged Action[WindowState]
  private event keyPressed Action[Key, KeyModifiers]
  private event focusChanged Action[bool]

  internal func AddStateChanged(callback Action[WindowState]) { stateChanged += callback }
  internal func RemoveStateChanged(callback Action[WindowState]) { stateChanged -= callback }
  internal func RaiseStateChanged(value WindowState) { stateChanged?.Invoke(value) }

  internal func AddKeyPressed(callback Action[Key, KeyModifiers]) { keyPressed += callback }
  internal func RemoveKeyPressed(callback Action[Key, KeyModifiers]) { keyPressed -= callback }
  internal prop KeyPressedCallbacks Action[Key, KeyModifiers]? { get -> keyPressed }
  internal func RaiseKeyPressed(key Key, modifiers KeyModifiers) {
    keyPressed?.Invoke(key, modifiers)
  }

  internal func AddFocusChanged(callback Action[bool]) { focusChanged += callback }
  internal func RemoveFocusChanged(callback Action[bool]) { focusChanged -= callback }
  internal func RaiseFocusChanged(value bool) { focusChanged?.Invoke(value) }
}

/// Hosts a Goo tree on one process-wide UI thread.
/// After Open or Attach, only Post and RequestClose are safe from another thread.
public partial class Window {
  /// Gets or sets the window clear color.
  public prop Background Color{
    get -> background
    set(v) {
      requireUiThread("Window.Background")
      if background == v {
        return
      }
      background = v
      requestRender()
    }
  }
  /// Gets the root cell.
  public prop Root Cell? {
    get -> root
    init -> root = value
  }
  /// Reports whether the window is open.
  public prop IsOpen bool{ get; private set; }
  internal prop Tree Node? { get -> node }
  internal prop DiagnosticsSession DevToolsSession? { get -> diagnosticsSession }
  /// Gets or sets per-window GPU presentation synchronization.
  /// True requests FIFO. Software Vulkan devices prefer Immediate, then Mailbox, then FIFO.
  /// False prefers Immediate, then Mailbox, then FIFO on every device.
  /// Window.Run applies internal display-rate pacing for either value.
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
      state = v
      if let native = host {
        native.SetState(v)
      }
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
  /// Gets or sets the close-request handler. Return false to veto closure.
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

  /// Gets the current native clipboard text on the window UI thread.
  /// An empty result can mean an empty clipboard or native copy failure.
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
  private var title string
  private var background Color
  private var root Cell?
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
    Background = Color.Black
    vsync = true
    decorated = true
    resizable = true
    resizeBand = 8.0F
    postedActions = nil
    pendingPostedActions = 0
    acceptingPosts = true
    dirty = true
    pendingRebuild = 0
    pendingPaintResourceInvalidation = 0
    retainedInvalidationGate = Object()
    pendingRetainedEffects = ReconcileEffects.None
    pendingRetainedInvalidation = 0
    acceptingRetainedInvalidations = true
    imageCompletionGate = Object()
    pendingImageCompletions = List[ImageCompletionWork]()
    imageCompletionBatch = List[ImageCompletionWork]()
    acceptingImageCompletions = true
    pendingImageCompletion = 0
    pendingReconcileEffects = ReconcileEffects.None
    renderDirty = true
    cellQueueGate = Object()
    pendingCells = List[DirtyCellSubmission]()
    deferredCells = List[DirtyCellSubmission]()
    cellBatch = List[DirtyCellSubmission]()
    fiberBatch = List[Cell]()
    imageCompletionHook = nil
    retainedInvalidationHook = nil
    childDiffScratch = ChildDiffScratch()
    layout = Layout()
    resolver = Resolver{}
    profiler = FrameProfiler()
    motionPump = MotionPump()
    motionPump.Wake = requestReconcile

    input = InputCoordinator()
    diagnosticsSession = nil
    accessibility = nil

    dpi = Vector2(1.0F, 1.0F)
  }

  internal func AttachDiagnostics() DevToolsSession {
    requireUiThread("Window.AttachDiagnostics")
    if let current = DiagnosticsSession {
      return current
    }
    let session = DevToolsSession(this)
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

  internal func RequestDiagnosticsCapture() WindowReadbackRequestStatus {
    guard let target = windowTarget else { return WindowReadbackRequestStatus.NotReady }
    return target.RequestCapture(node, Background, dpi)
  }

  internal func PollDiagnosticsCapture() WindowReadbackResult? {
    guard let target = windowTarget else { return nil }
    let result = target.PollCapture()
    if result == WindowReadbackPollStatus.Failed {
      throw InvalidOperationException("Goo capture readback failed")
    }
    return target.TakeCaptureResult()
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
