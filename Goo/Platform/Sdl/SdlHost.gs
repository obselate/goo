package Goo

import Hexa.NET.SDL3
import System
import System.Collections.Generic
import System.Diagnostics
import System.Runtime.InteropServices

internal unsafe partial class SdlHost : IDisposable, WindowHost, VulkanSurfaceHost, NativeDragHost, PinchInputHost {
  internal var CallbackContext WindowCallbackContext?
  private const MousePointerId int64 = 0L
  private const TouchMouseId uint32 = uint32.MaxValue
  private const PenMouseId uint32 = uint32.MaxValue - 1u
  private const MouseTouchId int64 = -1L
  private const PenTouchId int64 = -2L

  private let hitTest((int32, int32) -> WindowHitResult)
  private let hitTestRawDelegate SdlHostRawHitTest
  private let hitTestCallbackAddress nint
  private var window SDLWindowPtr = SDLWindowPtr.Null
  private var windowId uint32
  private var windowHandle nint
  private var windowDecorated bool = true
  private var windowsSmallIcon nint
  private var windowsLargeIcon nint
  private var disposed bool
  private var runtimeOwned bool
  private var vulkanOwned bool
  private var vsync bool
  private let pacing SdlFramePacing = SdlFramePacing()
  private var pendingEvents bool
  private var textInputActive bool
  private var hitTestEnabled bool
  private var pointerButtons PointerButtons
  private var pixelDensity float32
  private var lastDisplayScale float32
  private var pixelDensityChange bool
  private let touchPointers Dictionary[TouchContactKey, int64] =
  Dictionary[TouchContactKey, int64]()
  private var penPressures Dictionary[int64, float32]?
  private var nextTouchPointerId int64 = Int64.MinValue
  private var layerWindow WaylandLayerWindow?
  private var inputRegion WaylandInputRegion?
  private let lockWindow WaylandLockSurface?
  private let occlusionSupported bool

  internal init(title string, width int32, height int32, x int32, y int32,
    positionSet bool, state WindowState, decorated bool, resizable bool,
    transparent bool, vsync bool, hitTest((int32, int32) -> WindowHitResult),
    popupParent SdlHost? = nil, popupKind PopupKind = PopupKind.Menu, popupTimestamp uint64 = 0uL,
    popupAnchor ElementRect = default(ElementRect), popupPlacement PortalPlacement = PortalPlacement.BottomStart,
    popupScale float32 = 1.0F, layerOptions LayerWindowOptions? = nil,
    minWidth int32 = 0, minHeight int32 = 0, ownsVulkanPresentation bool = false,
    lockSurface WaylandLockSurface? = nil) {
      this.hitTest = hitTest
      lockWindow = lockSurface
      hitTestRawDelegate = HitTest
      hitTestCallbackAddress = Marshal.GetFunctionPointerForDelegate(hitTestRawDelegate)
      SdlRuntime.Acquire()
      runtimeOwned = true
      let driver = SDL.GetCurrentVideoDriverS()
      occlusionSupported = driver == "wayland" || driver == "cocoa" || driver == "x11"
      try {
        SdlRuntime.AcquireVulkan()
        vulkanOwned = true
        if let parent = popupParent {
          CreatePopup(parent, width, height, popupKind, popupTimestamp, popupAnchor, popupPlacement, popupScale)
        } else {
          waylandVulkanFrame = ownsVulkanPresentation && driver == "wayland" && lockWindow == nil
          CreateWindow(title, width, height, x, y, positionSet, minWidth, minHeight, decorated, transparent, layerOptions)
          waylandVulkanFrame = waylandVulkanFrame && SDL.GetBooleanProperty(SDL.GetWindowProperties(window),
            "Goo.Wayland.VulkanFrameAvailable.1", false)
        }
        windowId = SDL.GetWindowID(window)
        if windowId == 0u {
          ThrowSdl("SDL_GetWindowID")
        }
        windowHandle = SDL_GetWindowFromIdRaw(windowId)
        if windowHandle == nint(0) {
          ThrowSdl("SDL_GetWindowFromID")
        }
        if driver == "wayland" { waylandWindowProperties = NativeProperties(windowHandle) }
        SdlRuntime.Register(windowId, Dispatch)
        BindNativeFocus()
        if popupParent == nil && layerWindow == nil && lockWindow == nil {
          if OperatingSystem.IsWindows() {
            WindowsBackdrop.SetTransparent(WindowsHandle(), transparent)
          }
          SetBorder(decorated, resizable)
          ObserveNormalPlacement()
          SetState(state)
        }
        if layerWindow != nil && state != WindowState.Normal {
          throw NotSupportedException("Layer-shell windows do not support normal window states")
        }
        if lockWindow != nil && state != WindowState.Normal {
          throw NotSupportedException("Session lock windows do not support normal window states")
        }

        SetVSync(vsync)
        RefreshMetrics()
        if LogicalWidth > 0 && FramebufferWidth > 0 {
          pixelDensity = float32(FramebufferWidth) / float32(LogicalWidth)
        }
        lastDisplayScale = DisplayScale
        RefreshPosition()
        RefreshDisplayPacing(true)
      } catch (e Exception) {
        Dispose()
        rethrow
      }
    }

  public event MetricsChanged Action[int32, int32, int32, int32]
  public event Moved Action[int32, int32]
  public event DisplayChanged Action
  public event StateChanged Action[WindowState]
  public event FocusChanged Action[bool]
  public event VisibilityChanged Action
  public event OcclusionChanged Action[WindowOcclusion]
  public event PreferencesChanged Action[PlatformPreferences]
  public event CloseRequested Action[WindowCloseReason]
  public event Closed Action?
  public event Exposed Action
  public event PointerMoved Action[int64, PointerDevice, float32, float32,
    PointerButtons, float32, KeyModifiers]
  public event PointerPressed Action[int64, PointerDevice, float32, float32,
    PointerButton, PointerButtons, float32, KeyModifiers]
  public event PointerReleased Action[int64, PointerDevice, float32, float32,
    PointerButton, PointerButtons, float32, KeyModifiers]
  public event PointerCanceled Action[int64, PointerDevice]
  public event PointerHoverInvalidated Action
  public event Wheel Action[float32, float32, float32, float32, KeyModifiers]
  public event KeyPressed Action[Key, KeyModifiers]
  public event KeyReleased Action[Key, KeyModifiers]
  public event TextEntered Action[string]
  public event TextEditing Action[string, int32, int32]
  public event TextEditingCandidates Action[IReadOnlyList[string], int32, bool]
  public event TextCompositionCanceled Action

  public prop LogicalWidth int32{ get; private set }
  public prop LogicalHeight int32{ get; private set }
  public prop FramebufferWidth int32{ get; private set }
  public prop FramebufferHeight int32{ get; private set }
  public prop DisplayScale float32{ get -> SDL.GetWindowDisplayScale(window) }
  public prop PixelDensity float32{ get -> SDL.GetWindowPixelDensity(window) }
  public prop X int32{ get; private set }
  public prop Y int32{ get; private set }
  public prop IsClosing bool{ get; private set }
  public prop IsTextInputActive bool{ get -> textInputActive }
  internal prop NativeWindow SDLWindowPtr{ get -> window }
  public prop Transparent bool{
    get {
      ThrowIfDisposed()
      return (SDL.GetWindowFlags(window) & uint64(SDLWindowFlags.Transparent)) != 0uL
    }
  }
  public prop VSync bool{ get -> vsync }
  internal prop FramePacing SdlFramePacing{ get -> pacing }
  public prop HasPendingEvents bool{ get -> pendingEvents }
  public prop SchedulerPacingAvailable bool{
    get {
      if disposed || IsClosing || FramebufferWidth <= 0 || FramebufferHeight <= 0 {
        return false
      }
      let flags = SDL.GetWindowFlags(window)
      let unavailable = uint64(SDLWindowFlags.Hidden | SDLWindowFlags.Minimized |
        SDLWindowFlags.Occluded)
      return (flags & unavailable) == 0uL && WaylandVulkanFrameReady()
    }
  }
  public prop WindowHandle nint{
    get {
      ThrowIfDisposed()
      return windowHandle
    }
  }
  public prop NativeResizable bool{
    get {
      ThrowIfDisposed()
      return (SDL.GetWindowFlags(window) & uint64(SDLWindowFlags.Resizable)) != 0uL
    }
  }
  public prop OutsideResizeBorder bool{ get; private set }

  shared {
    internal func IsWayland() bool -> String.Equals(SDL.GetCurrentVideoDriverS(), "wayland",
      StringComparison.OrdinalIgnoreCase)

    internal func BuildWindowFlags(transparent bool) SDLWindowFlags {
      var baseFlags = SDLWindowFlags.HighPixelDensity |
      SDLWindowFlags.Hidden | SDLWindowFlags.Resizable
      if !VulkanDrivers.ManualLoader { baseFlags = baseFlags | SDLWindowFlags.Vulkan }
      return transparent ? baseFlags | SDLWindowFlags.Transparent : baseFlags
    }

    internal func EvaluateHitTest(hitTest((int32, int32) -> WindowHitResult),
      x int32, y int32) SDLHitTestResult{
        try {
          return SdlHitTest(hitTest(x, y))
        } catch (e Exception) {
          return SDLHitTestResult.Normal
        }
      }

    internal func SdlHitTest(result WindowHitResult) SDLHitTestResult -> switch result {
      case WindowHitResult.Normal: SDLHitTestResult.Normal
      case WindowHitResult.Draggable: SDLHitTestResult.Draggable
      case WindowHitResult.TopLeft: SDLHitTestResult.ResizeTopleft
      case WindowHitResult.Top: SDLHitTestResult.ResizeTop
      case WindowHitResult.TopRight: SDLHitTestResult.ResizeTopright
      case WindowHitResult.Right: SDLHitTestResult.ResizeRight
      case WindowHitResult.BottomRight: SDLHitTestResult.ResizeBottomright
      case WindowHitResult.Bottom: SDLHitTestResult.ResizeBottom
      case WindowHitResult.BottomLeft: SDLHitTestResult.ResizeBottomleft
      case WindowHitResult.Left: SDLHitTestResult.ResizeLeft
      case _: SDLHitTestResult.Normal
    }

    @DllImport("user32.dll", EntryPoint: "DestroyIcon")
    private func DestroyWindowIcon(icon nint) int32;

    @DllImport("user32.dll")
    private func CreateIconFromResourceEx(bytes * uint8, length uint32, icon int32, version uint32,
      width int32, height int32, flags uint32) nint;

    @DllImport("user32.dll")
    private func GetDpiForWindow(window nint) uint32;

    @DllImport("user32.dll")
    private func GetSystemMetricsForDpi(index int32, dpi uint32) int32;

    @DllImport("user32.dll")
    private func GetSystemMetrics(index int32) int32;

    @DllImport("user32.dll")
    private func SendMessageW(window nint, message uint32, wparam nuint, lparam nint) nint;
  }

  public func PollEvents() {
    ThrowIfDisposed()
    SdlRuntime.PollEvents()
    ThrowNativeTransferFailure()
    if !disposed { RefreshMetricsIfChanged() }
  }

  public func WaitEvents(timeoutMs int32) {
    ThrowIfDisposed()
    SdlRuntime.WaitEvents(timeoutMs)
    ThrowNativeTransferFailure()
    if !disposed { RefreshMetricsIfChanged() }
  }

  public func ClearPendingEvents() {
    pendingEvents = false
  }

  public func MarkFrame(nowTicks float64) {
    pacing.MarkFrame(nowTicks)
  }

  public func DeferFrame(nowTicks float64) {
    pacing.Defer(nowTicks)
  }

  public func IsFrameDue(nowTicks float64) bool -> pacing.IsDue(nowTicks)

  public func FrameWaitMilliseconds(nowTicks float64, fallbackMs int32) int32 ->
  pacing.WaitMilliseconds(nowTicks, fallbackMs)

  public func RefreshDisplayPacing(reset bool) {
    if disposed || window.IsNull {
      return
    }
    let display = SDL.GetDisplayForWindow(window)
    var rate float64
    if display != 0u {
      let mode = SDL.GetCurrentDisplayMode(display)
      if !mode.IsNull {
        let numerator = int64(mode.RefreshRateNumerator)
        let denominator = int64(mode.RefreshRateDenominator)
        if numerator > 0 && denominator > 0 {
          rate = float64(numerator) / float64(denominator)
        } else {
          rate = float64(mode.RefreshRate)
        }
      }
    }
    pacing.Refresh(display, rate, float64(Stopwatch.GetTimestamp()), reset)
  }

  internal func RefreshDisplayPacingForDisplay(displayId uint32) {
    if disposed || window.IsNull {
      return
    }
    let currentDisplay = SDL.GetDisplayForWindow(window)
    if displayId == 0u || currentDisplay == 0u || currentDisplay == displayId ||
    pacing.DisplayId == displayId{
      RefreshDisplayPacing(true)
    }
    if PresentsStillImage && (layerWindow?.Output?.NativeValue ?? currentDisplay) == displayId {
      DisplayChanged?.Invoke()
    }
  }

  public func Wake() {
    if disposed {
      return
    }
    SdlRuntime.Wake()
  }

  internal prop PresentsStillImage bool { get -> layerWindow?.PresentsStillImage == true }
  internal prop StillImagePending bool { get -> layerWindow?.StillImagePending == true }

  internal prop StillImagePreparationReady bool { get -> layerWindow?.StillImagePreparationReady == true }
  internal func FinishStillImagePreparation() bool -> layerWindow?.FinishStillImagePreparation() != false

  internal func SetStillImage(source LayerWindowImage?, background Color, owner Window) bool {
    let properties = SDL.GetWindowProperties(window)
    let viewport = nint(SDL.GetPointerProperty(properties, "SDL.window.wayland.viewport", nil))
    let alpha = if Transparent { background.A } else { 1.0F }
    let pixel = (uint32(MathF.Round(alpha * 255.0F)) << 24)
      | (uint32(MathF.Round(background.R * alpha * 255.0F)) << 16)
      | (uint32(MathF.Round(background.G * alpha * 255.0F)) << 8)
      | uint32(MathF.Round(background.B * alpha * 255.0F))
    return layerWindow?.SetStillImage(this, viewport, source, pixel, owner) == true
  }

  internal func StopStillImage() { layerWindow?.StopStillImage() }

  internal func PresentStillImage() bool -> layerWindow?.PresentStillImage() == true

  internal func StillImageOutputPixels() (int32, int32) {
    let display = layerWindow?.Output?.NativeValue ?? SDL.GetDisplayForWindow(window)
    let mode = SDL.GetDesktopDisplayMode(display)
    if mode.IsNull { return (0, 0) }
    let density = float64(mode.PixelDensity)
    return (int32(Math.Round(mode.W * density)), int32(Math.Round(mode.H * density)))
  }

  public func SetTitle(value string) {
    ThrowIfDisposed()
    Require(SDL.SetWindowTitle(window, value), "SDL_SetWindowTitle")
  }

  public func SetSize(width int32, height int32) {
    ThrowIfDisposed()
    Require(SDL.SetWindowSize(window, width, height), "SDL_SetWindowSize")
  }

  internal prop IsPointerOnlyLayer bool {
    get -> layerWindow?.KeyboardInteractivity == LayerWindowKeyboardInteractivity.None
  }

  internal func SupportsLayerGeometry(geometry LayerWindowOptions) bool -> layerWindow!!.SupportsGeometry(geometry)
  internal func SetLayerGeometry(geometry LayerWindowOptions, holdForConfigure bool = false) ->
    layerWindow!!.SetGeometry(geometry, holdForConfigure)

  internal func SupportsInputRegion() bool ->
    waylandWindowProperties != 0u && lockWindow == nil && popupParent == nil && !PresentsStillImage

  internal func SetInputRegion(rectangles [] ? ElementRect) bool {
    if inputRegion == nil {
      if rectangles == nil { return false }
      let properties = SDL.GetWindowProperties(window)
      inputRegion = WaylandInputRegion(
        nint(SDL.GetPointerProperty(properties, "SDL.window.wayland.display", nil)),
        nint(SDL.GetPointerProperty(properties, "SDL.window.wayland.surface", nil)))
    }
    return inputRegion!!.Set(rectangles)
  }

  public func SetMinimumSize(width int32, height int32) {
    ThrowIfDisposed()
    if layerWindow != nil || lockWindow != nil { return }
    Require(SDL.SetWindowMinimumSize(window, width, height), "SDL_SetWindowMinimumSize")
  }

  public func SetMaximumSize(width int32, height int32) {
    ThrowIfDisposed()
    if layerWindow != nil || lockWindow != nil { return }
    Require(SDL.SetWindowMaximumSize(window, width, height), "SDL_SetWindowMaximumSize")
  }

  public func SetPosition(x int32, y int32) {
    ThrowIfDisposed()
    if CanMove {
      Require(SDL.SetWindowPosition(window, x, y), "SDL_SetWindowPosition")
    }
  }

  public func SetState(value WindowState) {
    ThrowIfDisposed()
    if layerWindow != nil { throw NotSupportedException("Layer-shell windows do not support normal window states") }
    if lockWindow != nil { throw NotSupportedException("Session lock windows do not support normal window states") }
    if value == WindowState.Normal || value == WindowState.Minimized ||
    value == WindowState.Maximized{
      Require(SDL.SetWindowFullscreen(window, false), "SDL_SetWindowFullscreen")
      if OperatingSystem.IsWindows() {
        WindowsBackdrop.SetFullscreen(WindowsHandle(), false, windowDecorated)
      }
    }
    switch value {
      case WindowState.Normal { Require(SDL.RestoreWindow(window), "SDL_RestoreWindow") }
      case WindowState.Minimized { Require(SDL.MinimizeWindow(window), "SDL_MinimizeWindow") }
      case WindowState.Maximized { Require(SDL.MaximizeWindow(window), "SDL_MaximizeWindow") }
      case WindowState.Fullscreen { Require(EnterNativeFullscreen(), "SDL_SetWindowFullscreen") }
      case _ { throw ArgumentOutOfRangeException("value") }
    }
  }

  private func EnterNativeFullscreen() bool {
    if OperatingSystem.IsWindows() {
      let hwnd = WindowsHandle()
      let wasFullscreen = WindowsBackdrop.IsFullscreen(hwnd)
      WindowsBackdrop.SetFullscreen(hwnd, true, windowDecorated)
      if !SDL.SetWindowFullscreen(window, true) {
        if !wasFullscreen { WindowsBackdrop.SetFullscreen(hwnd, false, windowDecorated) }
        return false
      }
      WindowsBackdrop.EnsureFullscreenBounds(hwnd)
      return true
    }
    return SDL.SetWindowFullscreen(window, true)
  }

  public func RequestActivation() WindowOperationResult {
    if disposed || IsClosing { return WindowOperationResult.Closed }
    if lockWindow != nil {
      return SDL.ShowWindow(window) ? WindowOperationResult.Accepted : WindowOperationResult.Failed
    }
    if let layer = layerWindow {
      if let target = layer.Output {
        if !HasDisplay(target.NativeValue) {
          CloseRequested?.Invoke(WindowCloseReason.Terminating)
          return WindowOperationResult.Closed
        }
      }
      if !SDL.ShowWindow(window) { return WindowOperationResult.Failed }
      layer.Show()
      RefreshMetricsIfChanged()
      VisibilityChanged?.Invoke()
      return WindowOperationResult.Accepted
    }
    if OperatingSystem.IsLinux() && Application.CurrentActivationToken != nil {
      if !SDL.SetStringProperty(SDL.GetWindowProperties(window), "Goo.Wayland.ActivationToken.1",
        Application.CurrentActivationToken!!) { return WindowOperationResult.Failed }
    }
    if deferFirstShow {
      firstShowRequested = true
      Wake()
      return WindowOperationResult.Accepted
    }
    let flags = SDL.GetWindowFlags(window)
    if (flags & uint64(SDLWindowFlags.Minimized)) != 0uL && !SDL.RestoreWindow(window) {
      return WindowOperationResult.Failed
    }
    if (flags & uint64(SDLWindowFlags.Hidden)) != 0uL {
      firstShowMapping = true
      if !SDL.ShowWindow(window) { return WindowOperationResult.Failed }
    }
    return SDL.RaiseWindow(window) ? WindowOperationResult.Accepted : WindowOperationResult.Failed
  }

  public func SetBorder(decorated bool, resizable bool) {
    ThrowIfDisposed()
    if layerWindow != nil { throw NotSupportedException("Layer-shell windows do not support window decorations") }
    if lockWindow != nil { throw NotSupportedException("Session lock windows do not support window decorations") }
    windowDecorated = decorated
    if !decorated {
      EnableHitTest()
    }
    let windowsFrame = OperatingSystem.IsWindows() && !decorated && resizable
    RefreshLogical()
    let width = LogicalWidth
    let height = LogicalHeight
    Require(SDL.SetWindowBordered(window, decorated || windowsFrame), "SDL_SetWindowBordered")
    Require(SDL.SetWindowResizable(window, resizable), "SDL_SetWindowResizable")
    if contentUnderTitlebar { MacBackdrop.SetContentUnderTitlebar(macWindow, true) }
    if decorated && !contentUnderTitlebar {
      DisableHitTest()
    }
    if OperatingSystem.IsWindows() {
      let hwnd = WindowsHandle()
      let fullscreen = WindowsBackdrop.IsFullscreen(hwnd)
      WindowsBackdrop.SetCaption(hwnd, decorated)
      if !fullscreen {
        Require(SDL.SetWindowSize(window, width, height), "SDL_SetWindowSize")
      }
    }
    let outside = !decorated && resizable
    var waylandBorder = false
    if IsWayland() {
      try { waylandBorder = Goo_SetWindowResizeBorderRaw(windowHandle, outside ? 12 : 0) != uint8(0) }
      catch (_ EntryPointNotFoundException) { }
    }
    OutsideResizeBorder = outside && (waylandBorder || windowsFrame || OperatingSystem.IsMacOS())
  }

  public func SetVSync(value bool) {
    ThrowIfDisposed()
    vsync = value
  }

  public func SetCursor(value Cursor) {
    ThrowIfDisposed()
    if SDL.GetMouseFocus() != window {
      return
    }
    SdlRuntime.SetCursor(value)
  }

  public func StartTextInput() bool {
    ThrowIfDisposed()
    if textInputActive {
      return true
    }
    if !SDL.StartTextInput(window) {
      return false
    }
    textInputActive = true
    return true
  }

  public func StopTextInput() {
    ThrowIfDisposed()
    if !textInputActive {
      return
    }
    Require(SDL.StopTextInput(window), "SDL_StopTextInput")
    textInputActive = false
  }

  public func SetImeArea(x int32, y int32, width int32, height int32, cursor int32) bool {
    ThrowIfDisposed()
    if !textInputActive {
      return false
    }
    var area = SDLRect(x, y, width, height)
    return SDL.SetTextInputArea(window, &area, cursor)
  }

  public func GetClipboardText() ClipboardTextResult {
    ThrowIfDisposed()
    SDL.ClearError()
    let native = SDL.GetClipboardText()
    try {
      let error = SDL.GetErrorS()
      if !String.IsNullOrEmpty(error) { return ClipboardTextResult(ClipboardReadStatus.Failed, error: error) }
      let text = ClipboardTransfer.BoundedUtf8(nint(native), ClipboardTransfer.MaxTextBytes)
      return ClipboardTextResult(if text.Length == 0 { ClipboardReadStatus.Empty } else { ClipboardReadStatus.Success }, text)
    } catch (error ClipboardLimitException) {
      return ClipboardTextResult(ClipboardReadStatus.TooLarge, error: error.Message)
    } catch (error Exception) {
      return ClipboardTextResult(ClipboardReadStatus.Failed, error: error.Message)
    } finally { SDL.Free(native) }
  }

  public func SetClipboardText(value string) ClipboardWriteResult {
    ThrowIfDisposed()
    SDL.ClearError()
    return if SDL.SetClipboardText(value) { ClipboardWriteResult(DataTransferStatus.Success) }
      else { ClipboardWriteResult(DataTransferStatus.Failed, SDL.GetErrorS()) }
  }

  public func BeginClose() {
    ThrowIfDisposed()
    IsClosing = true
  }

  public func Dispose() {
    if disposed {
      return
    }
    SdlRuntime.RequireMainThread("SdlHost.Dispose")
    CancelNativeDrag()
    if nativeDrag?.WindowsSource != nil {
      windowsDragDisposePending = true
      return
    }
    try {
      windowsDrop?.Dispose()
      windowsDrop = nil
      ReleasePreferencePortal()
      nativeBackdrop?.Dispose()
      nativeBackdrop = nil
      BackdropAvailable = false
      inputRegion?.Dispose()
      layerWindow?.Dispose()
      layerWindow = nil
      lockWindow?.Dispose()
      disposed = true
      SdlTitlebarHooks.Unbind(this)
      UnbindNativeFocus()
      if windowId != 0u {
        SdlRuntime.Unregister(windowId)
        windowId = 0u
      }
      if textInputActive && !window.IsNull {
        SDL.StopTextInput(window)
        textInputActive = false
      }
      if hitTestEnabled && !window.IsNull {
        hitTestEnabled = false
        SDL_SetWindowHitTestRaw(windowHandle, nint(0), nint(0))
      }
      if !window.IsNull {
        let windowsHwnd = if OperatingSystem.IsWindows() { WindowsHandle() } else { nint(0) }
        if OperatingSystem.IsMacOS() {
          SDL.SyncWindow(window)
          if (SDL.GetWindowFlags(window) & uint64(SDLWindowFlags.Fullscreen)) != 0uL {
            SDL.SetWindowFullscreen(window, false)
            SDL.SyncWindow(window)
          }
        }
        if OperatingSystem.IsWindows() && popupParent != nil && popupKind == PopupKind.Menu {
          SDL.HideWindow(window)
        }
        SDL.DestroyWindow(window)
        if windowsHwnd != nint(0) { WindowsBackdrop.ClearWindow(windowsHwnd) }
        window = SDLWindowPtr.Null
        windowHandle = nint(0)
      }
      if windowsSmallIcon != nint(0) { DestroyWindowIcon(windowsSmallIcon) }
      if windowsLargeIcon != nint(0) { DestroyWindowIcon(windowsLargeIcon) }
      if vulkanOwned {
        vulkanOwned = false
        SdlRuntime.ReleaseVulkan()
      }
      if runtimeOwned {
        runtimeOwned = false
        SdlRuntime.Release()
      }
    } finally {
      let closed = Closed
      Closed = nil
      closed?.Invoke()
    }
  }

  public prop CanMove bool{
    get {
      ThrowIfDisposed()
      return !IsWayland()
    }
  }

  private func CreateWindow(title string, width int32, height int32, x int32, y int32,
    positionSet bool, minWidth int32, minHeight int32, decorated bool, transparent bool, layerOptions LayerWindowOptions?) {
    var flags = BuildWindowFlags(transparent && lockWindow == nil)
    if !decorated || lockWindow != nil { flags = flags | SDLWindowFlags.Borderless }
    if lockWindow != nil { flags = flags & ~SDLWindowFlags.HighPixelDensity }
    if layerOptions != nil || lockWindow != nil {
      layerOptions?.Validate()
      if !IsWayland() {
        throw NotSupportedException(layerOptions != nil ? "Layer-shell windows require Wayland"
          : "Session lock windows require Wayland")
      }
      let properties = SDL.CreateProperties()
      if properties == 0u { ThrowSdl("SDL_CreateProperties") }
      try {
        Require(SDL.SetStringProperty(properties, "SDL.window.create.title", title), "SDL_SetStringProperty")
        Require(SDL.SetNumberProperty(properties, "SDL.window.create.width", Math.Max(1, layerOptions?.Width ?? width)), "SDL_SetNumberProperty")
        Require(SDL.SetNumberProperty(properties, "SDL.window.create.height", Math.Max(1, layerOptions?.Height ?? height)), "SDL_SetNumberProperty")
        Require(SDL.SetNumberProperty(properties, "SDL.window.create.flags", int64(flags)), "SDL_SetNumberProperty")
        Require(SDL.SetBooleanProperty(properties, "SDL.window.create.wayland.surface_role_custom", true), "SDL_SetBooleanProperty")
        if waylandVulkanFrame {
          Require(SDL.SetBooleanProperty(properties, "Goo.Wayland.VulkanFrame.1", true), "SDL_SetBooleanProperty")
        }
        if lockWindow != nil {
          Require(SDL.SetBooleanProperty(properties, "Goo.Wayland.SessionLockSurface.1", true), "SDL_SetBooleanProperty")
        }
        window = SDL.CreateWindowWithProperties(properties)
      } finally { SDL.DestroyProperties(properties) }
      if window.IsNull { ThrowSdl("SDL_CreateWindowWithProperties") }
      let native = SDL.GetWindowProperties(window)
      let display = nint(SDL.GetPointerProperty(native, "SDL.window.wayland.display", nil))
      let surface = nint(SDL.GetPointerProperty(native, "SDL.window.wayland.surface", nil))
      if let options = layerOptions {
        let output = if let target = options.Output { ReadWaylandOutput(target) } else { nint(0) }
        layerWindow = WaylandLayerWindow(display, surface, output, options, ApplyCustomSize,
          () -> CloseRequested?.Invoke(WindowCloseReason.Terminating))
      } else if let role = lockWindow {
        role.Attach(display, surface, ReadWaylandOutput(role.Output))
      }
    } else {
      var requested = ElementRect{ X: x, Y: y, Width: width, Height: height }
      var scaledMinWidth = minWidth
      var scaledMinHeight = minHeight
      var displayId = SDL.GetPrimaryDisplay()
      if positionSet {
        let rect = SDLRect{ X: x, Y: y, W: width, H: height }
        displayId = SDL.GetDisplayForRect(in rect)
      }
      let displayContentScale = SDL.GetDisplayContentScale(displayId)
      let mode = SDL.GetDesktopDisplayMode(displayId)
      let modeDensity = !mode.IsNull && mode.PixelDensity > 0.0F ? mode.PixelDensity : 1.0F
      let initialContentScale = ResolveContentScale(1, 1, 1, 1, displayContentScale, modeDensity)
      if initialContentScale != 1.0 {
        requested = ElementRect{
          X: requested.X,
          Y: requested.Y,
          Width: Math.Max(1.0, Math.Round(requested.Width * initialContentScale)),
          Height: Math.Max(1.0, Math.Round(requested.Height * initialContentScale)),
        }
        if scaledMinWidth > 0 { scaledMinWidth = Math.Max(1, int32(Math.Round(float64(scaledMinWidth) * initialContentScale))) }
        if scaledMinHeight > 0 { scaledMinHeight = Math.Max(1, int32(Math.Round(float64(scaledMinHeight) * initialContentScale))) }
      }
      var bounds = requested
      let usable = ReadDisplay(displayId)?.UsableBounds
      if let area = usable {
        bounds = ConstrainInitialBounds(requested, scaledMinWidth, scaledMinHeight, positionSet, area)
      }
      let properties = SDL.CreateProperties()
      if properties == 0u { ThrowSdl("SDL_CreateProperties") }
      try {
        Require(SDL.SetStringProperty(properties, "SDL.window.create.title", title), "SDL_SetStringProperty")
        Require(SDL.SetNumberProperty(properties, "SDL.window.create.width", int64(bounds.Width)), "SDL_SetNumberProperty")
        Require(SDL.SetNumberProperty(properties, "SDL.window.create.height", int64(bounds.Height)), "SDL_SetNumberProperty")
        Require(SDL.SetNumberProperty(properties, "SDL.window.create.x", int64(bounds.X)), "SDL_SetNumberProperty")
        Require(SDL.SetNumberProperty(properties, "SDL.window.create.y", int64(bounds.Y)), "SDL_SetNumberProperty")
        Require(SDL.SetNumberProperty(properties, "SDL.window.create.flags", int64(flags)), "SDL_SetNumberProperty")
        if waylandVulkanFrame {
          Require(SDL.SetBooleanProperty(properties, "Goo.Wayland.VulkanFrame.1", true), "SDL_SetBooleanProperty")
        }
        window = SDL.CreateWindowWithProperties(properties)
      } finally { SDL.DestroyProperties(properties) }
      if window.IsNull { ThrowSdl("SDL_CreateWindowWithProperties") }
      if decorated && !IsWayland() {
        if let area = usable { ConstrainFrame(requested, minWidth, minHeight, positionSet, area) }
      }
    }
  }

  private func ConstrainFrame(requested ElementRect, minWidth int32, minHeight int32, positionSet bool, usable ElementRect) {
    var top int32 = 0
    var left int32 = 0
    var bottom int32 = 0
    var right int32 = 0
    if !SDL.GetWindowBordersSize(window, &top, &left, &bottom, &right) { return }
    if top == 0 && left == 0 && bottom == 0 && right == 0 { return }
    let framed = ElementRect{ X: usable.X + float64(left), Y: usable.Y + float64(top),
      Width: usable.Width - float64(left + right), Height: usable.Height - float64(top + bottom) }
    let bounds = ConstrainInitialBounds(requested, minWidth, minHeight, positionSet, framed)
    Require(SDL.SetWindowPosition(window, int32(bounds.X), int32(bounds.Y)), "SDL_SetWindowPosition")
    Require(SDL.SetWindowSize(window, int32(bounds.Width), int32(bounds.Height)), "SDL_SetWindowSize")
  }

  private func ApplyCustomSize(width int32, height int32) {
    Require(SDL.SetWindowSize(window, width, height), "SDL_SetWindowSize")
    pixelDensityChange = true
    pendingEvents = true
  }

  private func ReadWaylandOutput(target WindowDisplayId) nint {
    if !HasDisplay(target.NativeValue) { throw ArgumentException("The Wayland target display is unavailable") }
    let output = nint(SDL.GetPointerProperty(SDL.GetDisplayProperties(target.NativeValue), "SDL.display.wayland.wl_output", nil))
    if output == nint(0) { throw NotSupportedException("The target display has no Wayland output") }
    return output
  }

  internal func SetIconPng(primary [] ? uint8, additional [][]uint8) {
    ThrowIfDisposed()
    let firstAlternate = if primary == nil { 1 } else { 0 }
    let bytes = primary ?? additional[0]
    if firstAlternate < additional.Length && OperatingSystem.IsWindows() {
      let handle = GetNativeWindowHandle()
      if handle.Kind == NativeWindowKind.Win32 {
        SetWindowsIcons(handle.Handle, bytes, additional, firstAlternate)
        return
      }
    }

    using let image = RasterImageDecoder.DecodeIconPng(bytes)
    let format = if BitConverter.IsLittleEndian { SDLPixelFormat.Abgr8888 } else { SDLPixelFormat.Rgba8888 }
    let surface = SDL.CreateSurfaceFrom(image.Width, image.Height, format, image.Pointer, image.Width * 4)
    if surface.IsNull { ThrowSdl("SDL_CreateSurfaceFrom") }
    try {
      for index in firstAlternate ... additional.Length {
        using let alternate = RasterImageDecoder.DecodeIconPng(additional[index])
        let copy = SDL.CreateSurface(alternate.Width, alternate.Height, format)
        if copy.IsNull { ThrowSdl("SDL_CreateSurface") }
        try {
          let stride = alternate.Width * 4
          let pixels = *uint8(copy.Pixels)
          for y in 0 ... alternate.Height {
            alternate.Pixels.Slice(y * stride, stride).CopyTo(Span[uint8](pixels + y * copy.Pitch, stride))
          }
          Require(SDL.AddSurfaceAlternateImage(surface, copy), "SDL_AddSurfaceAlternateImage")
        } finally { SDL.DestroySurface(copy) }
      }
      if !SDL.SetWindowIcon(window, surface) {
        let error = SDL.GetErrorS()
        if !IsWayland() || !error.Contains("xdg_toplevel_icon_v1 protocol not supported", StringComparison.Ordinal) {
          throw InvalidOperationException("SDL_SetWindowIcon failed: " + error)
        }
      }
    } finally { SDL.DestroySurface(surface) }
  }

  private func SetWindowsIcons(hwnd nint, primary []uint8, additional [][]uint8, firstAlternate int32) {
    let dpi = if OperatingSystem.IsWindowsVersionAtLeast(10, 0, 14393) { GetDpiForWindow(hwnd) } else { 0u }
    let smallWidth = WindowsIconMetric(49, dpi)
    let smallHeight = WindowsIconMetric(50, dpi)
    let largeWidth = WindowsIconMetric(11, dpi)
    let largeHeight = WindowsIconMetric(12, dpi)
    let images = [additional.Length - firstAlternate + 1]NativeImage?
    var small = 0
    var large = 0
    var smallDistance = Int64.MaxValue
    var largeDistance = Int64.MaxValue

    try {
      for index in 0 ... images.Length {
        let png = if index == 0 { primary } else { additional[firstAlternate + index - 1] }
        let image = RasterImageDecoder.DecodeIconPng(png)
        images[index] = image
        let toSmall = IconDistance(image, smallWidth, smallHeight)
        let toLarge = IconDistance(image, largeWidth, largeHeight)
        if toSmall < smallDistance {
          small = index
          smallDistance = toSmall
        }
        if toLarge < largeDistance {
          large = index
          largeDistance = toLarge
        }
      }

      let smallPng = EncodeWindowsIcon(images[small]!!)
      let largePng = if small == large { smallPng } else { EncodeWindowsIcon(images[large]!!) }
      windowsSmallIcon = CreateWindowsIcon(smallPng, smallWidth, smallHeight)
      windowsLargeIcon = CreateWindowsIcon(largePng, largeWidth, largeHeight)
      const setIcon uint32 = 0x0080u
      SendMessageW(hwnd, setIcon, nuint(0), windowsSmallIcon)
      SendMessageW(hwnd, setIcon, nuint(1), windowsLargeIcon)
    } finally {
      for image in images { image?.Dispose() }
    }
  }

  private func IconDistance(image NativeImage, width int32, height int32) int64 {
    let dx = int64(image.Width) - width
    let dy = int64(image.Height) - height
    return dx * dx + dy * dy
  }

  private func WindowsIconMetric(index int32, dpi uint32) int32 ->
    if dpi != 0u { GetSystemMetricsForDpi(index, dpi) } else { GetSystemMetrics(index) }

  private func EncodeWindowsIcon(image NativeImage) []uint8 ->
    ImageSource.EncodePng(image.Width, image.Height, image.Pixels, false, Int32.MaxValue)

  private func CreateWindowsIcon(png []uint8, width int32, height int32) nint {
    fixed bytes * uint8 = png {
      let handle = CreateIconFromResourceEx(bytes, uint32(png.Length), 1, 0x00030000u, width, height, 0u)
      if handle == nint(0) { throw InvalidOperationException("CreateIconFromResourceEx failed") }
      return handle
    }
  }

  private func EnableHitTest() {
    if hitTestEnabled {
      return
    }
    Require(SDL_SetWindowHitTestRaw(windowHandle, hitTestCallbackAddress, nint(0)) != uint8(0),
      "SDL_SetWindowHitTest")
    hitTestEnabled = true
  }

  private func DisableHitTest() {
    if !hitTestEnabled {
      return
    }
    Require(SDL_SetWindowHitTestRaw(windowHandle, nint(0), nint(0)) != uint8(0),
      "SDL_SetWindowHitTest")
    hitTestEnabled = false
  }

  private func RefreshMetrics() {
    if contentUnderTitlebar && !MacBackdrop.HasFullSizeContent(macWindow) {
      MacBackdrop.SetContentUnderTitlebar(macWindow, true)
    }
    RefreshLogical()
    RefreshFramebuffer()
    RefreshTitlebarControls()
  }

  public func RefreshMetricsIfChanged() {
    let layerVisible = layerWindow?.Visible
    layerWindow?.Pump()
    if layerVisible != layerWindow?.Visible { VisibilityChanged?.Invoke() }
    if let role = lockWindow {
      if role.TakeResize(out var width, out var height) {
        ApplyCustomSize(width, height)
        VisibilityChanged?.Invoke()
        Exposed?.Invoke()
      }
    }
    RefreshPreferences(false)
    RefreshBackdrop()
    let logicalWidth = LogicalWidth
    let logicalHeight = LogicalHeight
    let framebufferWidth = FramebufferWidth
    let framebufferHeight = FramebufferHeight
    RefreshMetrics()
    RefreshDisplayPacing(false)
    let currentDisplayScale = DisplayScale
    let displayScaleChanged = MathF.Abs(currentDisplayScale - lastDisplayScale) > 0.001F
    if displayScaleChanged {
      lastDisplayScale = currentDisplayScale
      pixelDensityChange = true
    }
    if displayScaleChanged || logicalWidth != LogicalWidth || logicalHeight != LogicalHeight ||
    framebufferWidth != FramebufferWidth || framebufferHeight != FramebufferHeight{
      RaiseMetrics()
      if layerWindow != nil { Exposed?.Invoke() }
    }
  }

  private func RefreshLogical() {
    var width int32 = 0
    var height int32 = 0
    Require(SDL.GetWindowSize(window, &width, &height), "SDL_GetWindowSize")
    if contentUnderTitlebar && macWindow != nint(0) {
      let bounds = MacBackdrop.ContentBounds(macWindow)
      width = int32(Math.Round(bounds.Width))
      height = int32(Math.Round(bounds.Height))
    }
    LogicalWidth = width
    LogicalHeight = height
  }

  private func RefreshFramebuffer() {
    var width int32 = 0
    var height int32 = 0
    Require(SDL.GetWindowSizeInPixels(window, &width, &height), "SDL_GetWindowSizeInPixels")
    if contentUnderTitlebar && macWindow != nint(0) {
      let bounds = MacBackdrop.ContentBounds(macWindow, true)
      width = int32(Math.Round(bounds.Width))
      height = int32(Math.Round(bounds.Height))
    }
    FramebufferWidth = width
    FramebufferHeight = height
  }

  private func RefreshPosition() {
    var x int32 = 0
    var y int32 = 0
    Require(SDL.GetWindowPosition(window, &x, &y), "SDL_GetWindowPosition")
    X = x
    Y = y
  }

  private func RaiseMetrics() {
    RefreshBackdrop()
    if LogicalWidth > 100 && LogicalHeight > 100 &&
    FramebufferWidth > 0 && FramebufferHeight > 0 {
      let densityX = float32(FramebufferWidth) / float32(LogicalWidth)
      let densityY = float32(FramebufferHeight) / float32(LogicalHeight)
      if Math.Abs(densityX - densityY) > 0.1F ||
      pixelDensity > 0.0F && !pixelDensityChange && Math.Abs(densityX - pixelDensity) > 0.1F {
        return
      }
      pixelDensity = densityX
      pixelDensityChange = false
    }
    MetricsChanged?.Invoke(LogicalWidth, LogicalHeight, FramebufferWidth, FramebufferHeight)
  }

  private func RequestClose(reason WindowCloseReason = WindowCloseReason.WindowRequest) {
    if IsClosing {
      return
    }
    CloseRequested?.Invoke(reason)
  }

  private func HitTest(nativeWindow nint, pointAddress nint, userData nint) SDLHitTestResult {
    if !hitTestEnabled || pointerButtons != PointerButtons.None ||
    SDL.GetMouseState(nil, nil) != 0u {
      return SDLHitTestResult.Normal
    }
    let point = *SdlHostPoint(pointAddress)
    return EvaluateHitTest(hitTest, point -> X, point -> Y)
  }

  private func WindowsHandle() nint ->
    if windowHandle == nint(0) { nint(0) } else { BackdropPointer(BackdropProperties(windowHandle), "SDL.window.win32.hwnd", nint(0)) }

  private func ThrowIfDisposed() {
    SdlRuntime.RequireMainThread("SdlHost.")
    if disposed {
      throw ObjectDisposedException("SdlHost")
    }
  }

  private func Require(result bool, operation string) {
    if !result {
      ThrowSdl(operation)
    }
  }

  private func ThrowSdl(operation string) {
    throw InvalidOperationException(operation + " failed: " + SDL.GetErrorS())
  }
}
