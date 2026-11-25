package Goo

import System
import System.Collections.Generic
import System.Numerics

/// Identifies the requested state of a window.
public enum WindowState { Normal; Minimized; Maximized; Fullscreen }

/// Controls how Application.Run schedules frames that have visual demand.
public enum WindowFramePacing { Display; Uncapped }

/// Identifies input received by a window before routing.
public enum WindowInputKind {
  /// A pointer button or contact was pressed.
  PointerDown;
  /// A wheel event was received.
  Wheel;
  /// A physical key was pressed.
  KeyDown;
}

/// Identifies the selected Vulkan physical device type.
public enum RenderingDeviceKind {
  /// No rendering device is available.
  Unknown;
  /// An integrated GPU.
  IntegratedGpu;
  /// A discrete GPU.
  DiscreteGpu;
  /// A virtual GPU.
  VirtualGpu;
  /// A CPU renderer, including llvmpipe and lavapipe.
  Cpu;
  /// A device with another Vulkan physical device type.
  Other;
}

/// Describes the selected rendering device.
public data struct RenderingDeviceInfo {
  private var kind RenderingDeviceKind
  private var name string?

  /// Gets the selected physical device type, or Unknown when unavailable.
  public prop Kind RenderingDeviceKind{ get -> kind init -> kind = value }
  /// Gets the selected device name, or an empty string when unavailable.
  public prop Name string{ get -> name ?? "" init -> name = value }
}

/// Reports observed occlusion, not visibility or focus.
public enum WindowOcclusion {
  /// The host has not reported occlusion or does not support it.
  Unknown;
  /// The host reports that the window is not occluded.
  Unoccluded;
  /// The host reports that the window is occluded.
  Occluded;
}

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
public class WindowCapture {
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
  private var width int32
  private var height int32
  private var framebufferWidth int32
  private var framebufferHeight int32
  private var displayScaleX float64
  private var displayScaleY float64
  private var uiScale float64

  /// Gets the reported native logical width.
  public prop NativeWidth int32{ get -> width init -> width = value }
  /// Gets the reported native logical height.
  public prop NativeHeight int32{ get -> height init -> height = value }
  /// Gets the reported framebuffer width.
  public prop FramebufferWidth int32{ get -> framebufferWidth init -> framebufferWidth = value }
  /// Gets the reported framebuffer height.
  public prop FramebufferHeight int32{ get -> framebufferHeight init -> framebufferHeight = value }
  /// Gets the horizontal framebuffer-to-logical scale.
  public prop DisplayScaleX float64{ get -> displayScaleX init -> displayScaleX = value }
  /// Gets the vertical framebuffer-to-logical scale.
  public prop DisplayScaleY float64{ get -> displayScaleY init -> displayScaleY = value }
  /// Gets the retained UI scale. A default snapshot uses 1.
  public prop UiScale float64{ get -> uiScale == 0.0F ? 1.0F : uiScale init -> uiScale = value }
}

internal struct WindowNotifications {
  private event stateChanged Action[WindowState]
  private event keyPressed Action[Key, KeyModifiers]
  private event inputActivity Action[WindowInputKind]
  private event previewKeyPressed Func[Key, KeyModifiers, bool]
  private event focusChanged Action[bool]
  private event visibilityChanged Action[bool]
  private event occlusionChanged Action[WindowOcclusion]
  private event preferencesChanged Action[PlatformPreferences]
  private event presentationAccepted Action[WindowPresentationAccepted]
  private event captureCompleted Action
  private event displayChanged Action

  internal func AddStateChanged(callback Action[WindowState]) { stateChanged += callback }
  internal func RemoveStateChanged(callback Action[WindowState]) { stateChanged -= callback }
  internal func RaiseStateChanged(value WindowState) { stateChanged?.Invoke(value) }

  internal func AddKeyPressed(callback Action[Key, KeyModifiers]) { keyPressed += callback }
  internal func RemoveKeyPressed(callback Action[Key, KeyModifiers]) { keyPressed -= callback }
  internal prop KeyPressedCallbacks Action[Key, KeyModifiers]? { get -> keyPressed }

  internal func AddInputActivity(callback Action[WindowInputKind]) { inputActivity += callback }
  internal func RemoveInputActivity(callback Action[WindowInputKind]) { inputActivity -= callback }
  internal func RaiseInputActivity(kind WindowInputKind) { inputActivity?.Invoke(kind) }

  internal func AddPreviewKeyPressed(callback Func[Key, KeyModifiers, bool]) { previewKeyPressed += callback }
  internal func RemovePreviewKeyPressed(callback Func[Key, KeyModifiers, bool]) { previewKeyPressed -= callback }
  internal func PreviewKeyPress(key Key, modifiers KeyModifiers) bool {
    for handler in Delegate.EnumerateInvocationList[Func[Key, KeyModifiers, bool]](previewKeyPressed) {
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
  internal func AddOcclusionChanged(callback Action[WindowOcclusion]) { occlusionChanged += callback }
  internal func RemoveOcclusionChanged(callback Action[WindowOcclusion]) { occlusionChanged -= callback }
  internal func RaiseOcclusionChanged(value WindowOcclusion) { occlusionChanged?.Invoke(value) }
  internal func AddPreferencesChanged(callback Action[PlatformPreferences]) { preferencesChanged += callback }
  internal func RemovePreferencesChanged(callback Action[PlatformPreferences]) { preferencesChanged -= callback }
  internal func RaisePreferencesChanged(value PlatformPreferences) { preferencesChanged?.Invoke(value) }
  internal prop HasPresentationAcceptedCallbacks bool{ get -> presentationAccepted != nil }
  internal func AddPresentationAccepted(callback Action[WindowPresentationAccepted]) { presentationAccepted += callback }
  internal func RemovePresentationAccepted(callback Action[WindowPresentationAccepted]) { presentationAccepted -= callback }
  internal func RaisePresentationAccepted(value WindowPresentationAccepted) { presentationAccepted?.Invoke(value) }
  internal func AddCaptureCompleted(callback Action) { captureCompleted += callback }
  internal func RemoveCaptureCompleted(callback Action) { captureCompleted -= callback }
  internal func RaiseCaptureCompleted() { captureCompleted?.Invoke() }
  internal func AddDisplayChanged(callback Action) { displayChanged += callback }
  internal func RemoveDisplayChanged(callback Action) { displayChanged -= callback }
  internal func RaiseDisplayChanged() { displayChanged?.Invoke() }
}

/// Hosts a Goo tree on one process-wide UI thread.
/// After Open or Attach, only Post and RequestClose are safe from another thread.
/// Each instance has one lifetime. Create a new Window after closing.
/// State, IsFocused, Size, NativeWidth, NativeHeight, UiScale, PixelScale, Preferences and Modifiers track reads in Build and retained builders.
/// Other mutable window getters keep automatic callback rebuilding.
public partial class Window {
  /// Configures this window as a Wayland layer-shell surface before Open.
  /// Unsupported platforms and compositors fail without a normal-window fallback.
  /// Use SetLayerGeometry to request new geometry after Open. This property keeps the initial options.
  public prop LayerShell LayerWindowOptions? { get; init; }
  internal var LockSurface WaylandLockSurface?
  internal prop IsPointerOnlyLayer bool { get -> (host as SdlHost?)?.IsPointerOnlyLayer == true }

  private var pendingLayerGeometry LayerWindowOptions?
  private var pendingLayerGeometryHold bool

  /// Requests new anchors, size, margins, exclusive zone and keyboard interactivity for an open layer window.
  /// Layer, namespace and output must match LayerShell. The compositor controls the final size.
  /// Requests made while hidden apply on the next Show.
  /// A size change from a layout metrics callback keeps the previous buffer until the next configure.
  /// @param geometry the new options, with sizes and margins in compositor logical units
  /// @returns Accepted if queued or submitted, Closed if not open, or Unsupported for another window type,
  /// a change to a fixed option, or a keyboard policy the compositor does not support
  /// @exception ArgumentException when the options are invalid.
  public func SetLayerGeometry(geometry LayerWindowOptions) WindowOperationResult {
    requireUiThread("Window.SetLayerGeometry")
    if !IsOpen || host?.IsClosing == true { return WindowOperationResult.Closed }
    guard let native = host as SdlHost? else { return WindowOperationResult.Unsupported }
    if !native.IsLayerWindow { return WindowOperationResult.Unsupported }
    ArgumentNullException.ThrowIfNull(geometry)
    if !native.SupportsLayerGeometry(geometry) { return WindowOperationResult.Unsupported }
    geometry.Validate("geometry")
    if windowTarget?.QueueWorkPending == true {
      pendingLayerGeometry = geometry
      pendingLayerGeometryHold = flushingMetricsBeforeRender
    } else {
      pendingLayerGeometry = nil
      native.SetLayerGeometry(geometry, flushingMetricsBeforeRender)
    }
    return WindowOperationResult.Accepted
  }

  /// Sets the input region for an open Wayland toplevel or layer-shell window.
  /// The compositor applies the region when the next frame is committed.
  /// @param rectangles the union of rectangles in surface-local logical pixels, rounded out to whole pixels.
  /// Null restores the full surface. An empty array disables pointer and touch input.
  /// @returns Accepted if queued, Closed if not open, or Unsupported for other window types and platforms.
  /// @exception ArgumentException when a rectangle has a nonfinite coordinate or a negative size.
  public func SetInputRegion(rectangles [] ? ElementRect) WindowOperationResult {
    requireUiThread("Window.SetInputRegion")
    if !IsOpen || host?.IsClosing == true { return WindowOperationResult.Closed }
    guard let native = host as SdlHost? else { return WindowOperationResult.Unsupported }
    if !native.SupportsInputRegion() { return WindowOperationResult.Unsupported }
    if let values = rectangles {
      for rect in values {
        if !Double.IsFinite(rect.X) || !Double.IsFinite(rect.Y) || !Double.IsFinite(rect.Width)
          || !Double.IsFinite(rect.Height) || rect.Width < 0.0 || rect.Height < 0.0 {
          throw ArgumentException("Input rectangles require finite coordinates and nonnegative sizes", "rectangles")
        }
      }
    }
    if native.SetInputRegion(rectangles) { requestRender() }
    return WindowOperationResult.Accepted
  }

  /// Gets the selected rendering device, or Unknown with an empty name before Open or when unavailable.
  public prop RenderingDevice RenderingDeviceInfo{
    get -> ReadUntrackedWindowValue((windowTarget as VulkanWindowTarget?)?.RenderingDevice ?? default(RenderingDeviceInfo))
  }

  /// Gets or sets the window clear color. The default is white.
  public prop Background Color{
    get -> ReadUntrackedWindowValue(background)
    set(v) -> SetColors(v, foreground)
  }
  /// Gets or sets the inherited root text color. The default is black.
  public prop Foreground Color{
    get -> ReadUntrackedWindowValue(foreground)
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
    get -> ReadUntrackedWindowValue(iconPng)
    init -> iconPng = value
  }
  /// Configures additional native window icon sizes. If IconPng is unset, the first PNG is the primary icon.
  /// Each PNG is decoded when opening and has a 1024 pixel edge limit.
  /// Windows chooses the closest size for each icon slot. Wayland uses the primary icon as the base size.
  public prop IconPngs [][]uint8 {
    get -> ReadUntrackedWindowValue(iconPngs)
    init -> iconPngs = value
  }
  /// Reports whether the window is open.
  public prop IsOpen bool{ get -> ReadUntrackedWindowValue(isOpen); private set -> isOpen = value }
  private var isOpen bool
  internal prop Tree Node? { get -> node }
  internal prop DiagnosticsSession DevToolsSession? { get -> diagnosticsSession }
  /// Gets or sets per-window GPU presentation synchronization.
  /// True selects FIFO. False prefers Immediate, then Mailbox, then FIFO on every device.
  /// Application.Run pacing is controlled separately by FramePacing.
  public prop VSync bool{
    get -> ReadUntrackedWindowValue(vsync)
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

  /// Gets or sets the frame pacing used by Application.Run. Uncapped still honors
  /// GPU queue readiness and the selected presentation mode.
  public prop FramePacing WindowFramePacing{
    get -> ReadUntrackedWindowValue(framePacing)
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
      Cell.ObserveUntrackedRead()
      return windowTarget?.QueueWorkPending == true
    }
  }

  /// Gets or sets the window title.
  public prop Title string{
    get -> ReadUntrackedWindowValue(title)
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

  /// Gets or sets the client size in layout units. Native assignments multiply by UiScale and round once.
  /// The native host's observed size is authoritative after Open.
  public prop Size LayoutSize{
    get -> TrackWindowValue(&trackedSize, CurrentSize)
    set(value) {
      requireUiThread("Window.Size")
      if !Double.IsFinite(value.Width) || !Double.IsFinite(value.Height) || value.Width < 0.0 || value.Height < 0.0 {
        throw ArgumentOutOfRangeException("value")
      }
      if CurrentSize == value { return }
      if host != nil && LayerShell != nil { throw NotSupportedException("Layer-shell sizes are configured by the compositor") }
      if host == nil {
        requestedSize = value
      } else {
        width = scaledSize(value.Width)
        height = scaledSize(value.Height)
        pushSize()
      }
      MetricSubscriptions.MarkWindowDirty(this)
      requestRender()
    }
  }

  private prop CurrentSize LayoutSize {
    get -> requestedSize ?? LayoutSize(float64(host?.LogicalWidth ?? width) / float64(EffectiveUiScale),
      float64(host?.LogicalHeight ?? height) / float64(EffectiveUiScale))
  }

  /// Gets the observed client width in native logical units.
  public prop NativeWidth int32{ get -> TrackWindowValue(&trackedWidth, host?.LogicalWidth ?? width) }

  /// Gets the observed client height in native logical units.
  public prop NativeHeight int32{ get -> TrackWindowValue(&trackedHeight, host?.LogicalHeight ?? height) }

  // positionSet distinguishes an explicit (0,0) request.
  /// Gets or sets the requested horizontal position.
  public prop X int32{
    get -> ReadUntrackedWindowValue(x)
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
    get -> ReadUntrackedWindowValue(y)
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
    get -> TrackWindowValue(&trackedState, state)
    set(v) {
      requireUiThread("Window.State")
      if state == v {
        return
      }
      if let native = host {
        native.SetState(v)
      }
      state = v
      trackedState?.Sync(v)
    }
  }

  /// Gets or sets per-pixel alpha for the first Open. An open window is unchanged.
  /// If Vulkan cannot provide transparency, the window opens opaque.
  public prop Transparent bool{
    get -> ReadUntrackedWindowValue(transparent)
    set(v) {
      requireUiThread("Window.Transparent")
      transparent = v
    }
  }

  /// Reports whether the window presents with per-pixel alpha.
  /// False until the presentation surface is ready.
  public prop IsTransparent bool {
    get -> ReadUntrackedWindowValue((windowTarget as VulkanWindowTarget?)?.IsTransparent == true)
  }

  /// Gets or sets whether the system draws window decorations.
  public prop Decorated bool{
    get -> ReadUntrackedWindowValue(decorated)
    set(v) {
      requireUiThread("Window.Decorated")
      if decorated == v {
        return
      }
      if let native = host {
        native.SetBorder(v, resizable)
      }
      decorated = v
    }
  }

  /// Gets or sets whether the user can resize the window.
  public prop Resizable bool{
    get -> ReadUntrackedWindowValue(resizable)
    set(v) {
      requireUiThread("Window.Resizable")
      if resizable == v {
        return
      }
      if let native = host {
        native.SetBorder(decorated, v)
      }
      resizable = v
    }
  }

  /// Gets or sets the undecorated edge resize band inside the window, in logical pixels multiplied by UiScale. The default is 8.
  /// Windows and Wayland with the Goo SDL build resize from an outside border and from inside corner squares of ResizeBand size.
  /// macOS uses the AppKit resize area instead.
  /// Where an inside edge band is used, controls with OnClick and scrollbars take the pointer in that band. Corners extend max(2 * ResizeBand, 16) along each edge.
  public prop ResizeBand float64{
    get -> ReadUntrackedWindowValue(resizeBand)
    set(v) {
      requireUiThread("Window.ResizeBand")
      if !Double.IsFinite(v) || v < 0.0F {
        throw ArgumentOutOfRangeException("value")
      }
      resizeBand = v
    }
  }

  /// Reports whether the window holds native input focus.
  public prop IsFocused bool{
    get -> TrackWindowValue(&trackedFocus, isFocused)
    private set(value) {
      isFocused = value
      trackedFocus?.Sync(value)
    }
  }

  private var isFocused bool

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
  /// Occurs once per received pointer down, wheel, or key down before routing, including consumed and modal input.
  /// Callbacks run on the window UI thread without invalidating Cells.
  public event InputActivity Action[WindowInputKind]{
    add{
      requireUiThread("Window.InputActivity")
      notifications.AddInputActivity(value)
    }
    remove{
      requireUiThread("Window.InputActivity")
      notifications.RemoveInputActivity(value)
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
    get -> ReadUntrackedWindowValue(onClosing)
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

  /// Occurs once on the UI thread when an accepted public capture completes or fails.
  /// Call PollCapture to take the result or throw the failure.
  /// Does not occur if PollCapture already took the result or failure.
  public event CaptureCompleted Action{
    add{
      requireUiThread("Window.CaptureCompleted")
      notifications.AddCaptureCompleted(value)
    }
    remove{
      requireUiThread("Window.CaptureCompleted")
      notifications.RemoveCaptureCompleted(value)
    }
  }

  /// Gets clipboard services for this window's UI thread.
  public prop Clipboard WindowClipboard { get -> clipboard ??= WindowClipboard(this) }
  private var clipboard WindowClipboard?

  /// Reports whether programmatic window movement is available.
  public prop CanMove bool{
    get {
      requireUiThread("Window.CanMove")
      Cell.ObserveUntrackedRead()
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
  private let fiberBatch List[DirtyFiber]
  private let childDiffScratch ChildDiffScratch
  private var cellTransactionActive bool
  private var renderDirty bool
  private var memoryPressureWaiting bool
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
  internal prop PaintMotionPump MotionPump { get -> motionPump }
  private func wakePaintMotion() { enqueueRetainedInvalidation(ReconcileEffects.Paint) }
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
  private var captureStatus WindowReadbackPollStatus
  private var reusableCapture WindowCapture?
  private var title string
  private var background Color
  private var foreground Color
  private var foregroundPending bool
  private var root Cell?
  private var iconPng [] ? uint8
  private var iconPngs [][]uint8 = Array.Empty[[]uint8]()
  private var width int32
  private var height int32
  private var x int32
  private var y int32
  private var positionSet bool
  private var decorated bool
  private var resizable bool
  private var transparent bool
  private var resizeBand float64
  private var closeRequested int32
  private var postedActions Queue[WindowPostedWork]?
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
    fiberBatch = List[DirtyFiber]()
    childDiffScratch = ChildDiffScratch()
    portalRoot = Node{Kind: NodeKind.Container, HitTestSelf: false}
    layout = Layout()
    resolver = Resolver{Owner: this}
    profiler = FrameProfiler()
    motionPump = MotionPump(this)
    motionPump.Wake = requestReconcile
    motionPump.PaintWake = wakePaintMotion

    input = InputCoordinator(this)

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
      captureStatus = WindowReadbackPollStatus.NotReady
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
  /// Handle CaptureCompleted or call PollCapture on the UI thread.
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
      captureStatus = WindowReadbackPollStatus.NotReady
      return WindowReadbackRequestStatus.Accepted
    }
    return status
  }

  internal func SchedulerHasPendingPublicCapture() bool -> captureOwner == WindowCaptureOwner.Public
    && captureStatus == WindowReadbackPollStatus.NotReady
    && (!capturePending || windowTarget?.QueueWorkPending != true && (IsVisible || firstShowPending()))

  private func advanceCapture() bool {
    guard let target = windowTarget else { return false }
    if capturePending && !target.QueueWorkPending
      && startCapture(target, captureOwner) != WindowReadbackRequestStatus.Accepted {
      captureStatus = WindowReadbackPollStatus.Failed
      return captureOwner == WindowCaptureOwner.Public
    }
    if captureOwner != WindowCaptureOwner.Public || capturePending
      || captureStatus != WindowReadbackPollStatus.NotReady { return false }
    captureStatus = target.PollCapture()
    return captureStatus != WindowReadbackPollStatus.NotReady
  }

  private func takeCaptureFailure() {
    if captureStatus != WindowReadbackPollStatus.Failed { return }
    captureStatus = WindowReadbackPollStatus.NotReady
    captureOwner = WindowCaptureOwner.None
    reusableCapture = nil
    System.Runtime.ExceptionServices.ExceptionDispatchInfo.Capture(windowTarget?.CaptureFailure ?? InvalidOperationException("Goo capture readback failed")).Throw()
  }

  /// Takes a completed capture, or returns nil while it is pending.
  /// Failed readback throws and releases this request's ownership.
  public func PollCapture() WindowCapture? {
    requireUiThread("Window.PollCapture")
    if captureOwner != WindowCaptureOwner.Public || capturePending { return nil }
    guard let target = windowTarget else {
      captureOwner = WindowCaptureOwner.None
      reusableCapture = nil
      return nil
    }
    if captureStatus == WindowReadbackPollStatus.NotReady { captureStatus = target.PollCapture() }
    if captureStatus == WindowReadbackPollStatus.NotReady { return nil }
    takeCaptureFailure()
    captureOwner = WindowCaptureOwner.None
    let reusable = reusableCapture
    reusableCapture = nil
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
    let status = startCapture(target, WindowCaptureOwner.Diagnostics)
    if status == WindowReadbackRequestStatus.Failed {
      System.Runtime.ExceptionServices.ExceptionDispatchInfo.Capture(target.CaptureFailure ?? InvalidOperationException("Goo capture readback failed")).Throw()
    }
    return status
  }

  internal func PollDiagnosticsCapture() WindowReadbackResult? {
    if captureOwner != WindowCaptureOwner.Diagnostics { return nil }
    takeCaptureFailure()
    guard let target = windowTarget else { return nil }
    let result = target.PollCapture()
    if result == WindowReadbackPollStatus.NotReady { return nil }
    captureOwner = WindowCaptureOwner.None
    if result == WindowReadbackPollStatus.Failed {
      System.Runtime.ExceptionServices.ExceptionDispatchInfo.Capture(target.CaptureFailure ?? InvalidOperationException("Goo capture readback failed")).Throw()
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
