package Goo

import System
import System.Collections.Generic
import System.Diagnostics
import System.Runtime.InteropServices
import Hexa.NET.SDL3

internal unsafe partial class SdlHost : IDisposable, WindowHost, VulkanSurfaceHost {
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
  private var disposed bool
  private var runtimeOwned bool
  private var vulkanOwned bool
  private var vsync bool
  private let pacing SdlFramePacing = SdlFramePacing()
  private var pendingEvents bool
  private var textInputActive bool
  private var hitTestEnabled bool
  private var pointerButtons PointerButtons
  private let touchPointers Dictionary[TouchContactKey, int64] =
  Dictionary[TouchContactKey, int64]()
  private var penPressures Dictionary[int64, float32]?
  private var nextTouchPointerId int64 = Int64.MinValue

  internal init(title string, width int32, height int32, x int32, y int32,
    positionSet bool, state WindowState, decorated bool, resizable bool,
    transparent bool, vsync bool, hitTest((int32, int32) -> WindowHitResult)) {
      this.hitTest = hitTest
      hitTestRawDelegate = HitTest
      hitTestCallbackAddress = Marshal.GetFunctionPointerForDelegate(hitTestRawDelegate)
      SdlRuntime.Acquire()
      runtimeOwned = true
      try {
        if !SdlRuntime.AcquireVulkan() {
          throw InvalidOperationException("SDL Vulkan loader initialization failed")
        }
        vulkanOwned = true
        CreateWindow(title, width, height, transparent)
        windowId = SDL.GetWindowID(window)
        if windowId == 0u {
          ThrowSdl("SDL_GetWindowID")
        }
        windowHandle = SDL_GetWindowFromIdRaw(windowId)
        if windowHandle == nint(0) {
          ThrowSdl("SDL_GetWindowFromID")
        }
        SdlRuntime.Register(windowId, Dispatch)
        if positionSet && CanMove {
          Require(SDL.SetWindowPosition(window, x, y), "SDL_SetWindowPosition")
        }
        SetBorder(decorated, resizable)
        SetState(state)
        SetVSync(vsync)
        RefreshMetrics()
        RefreshPosition()
        RefreshDisplayPacing(true)
      } catch (e Exception) {
        Dispose()
        throw e
      }
    }

  public event MetricsChanged Action[int32, int32, int32, int32]
  public event Moved Action[int32, int32]
  public event StateChanged Action[WindowState]
  public event FocusChanged Action[bool]
  public event CloseRequested Action
  public event Exposed Action
  public event PointerMoved Action[int64, PointerDevice, float32, float32,
    PointerButtons, float32, KeyModifiers]
  public event PointerPressed Action[int64, PointerDevice, float32, float32,
    PointerButton, PointerButtons, float32, KeyModifiers]
  public event PointerReleased Action[int64, PointerDevice, float32, float32,
    PointerButton, PointerButtons, float32, KeyModifiers]
  public event PointerCanceled Action[int64, PointerDevice]
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
      return (flags & unavailable) == 0uL
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

  shared {
    internal func IsWayland() bool -> String.Equals(SDL.GetCurrentVideoDriverS(), "wayland",
      StringComparison.OrdinalIgnoreCase)

    internal func BuildWindowFlags(transparent bool) SDLWindowFlags {
      let baseFlags = SDLWindowFlags.HighPixelDensity |
      SDLWindowFlags.Hidden | SDLWindowFlags.Resizable | SDLWindowFlags.Vulkan
      return transparent ? baseFlags | SDLWindowFlags.Transparent : baseFlags
    }

    internal func EvaluateHitTest(hitTest((int32, int32) -> WindowHitResult),
      x int32, y int32) SDLHitTestResult{
        try {
          return switch hitTest(x, y) {
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
        } catch (e Exception) {
          return SDLHitTestResult.Normal
        }
      }
  }

  public func PollEvents() {
    ThrowIfDisposed()
    SdlRuntime.PollEvents()
    RefreshMetricsIfChanged()
  }

  public func WaitEvents(timeoutMs int32) {
    ThrowIfDisposed()
    SdlRuntime.WaitEvents(timeoutMs)
    RefreshMetricsIfChanged()
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
  }

  public func Wake() {
    if disposed {
      return
    }
    SdlRuntime.Wake()
  }

  public func SetTitle(value string) {
    ThrowIfDisposed()
    Require(SDL.SetWindowTitle(window, value), "SDL_SetWindowTitle")
  }

  public func SetSize(width int32, height int32) {
    ThrowIfDisposed()
    Require(SDL.SetWindowSize(window, width, height), "SDL_SetWindowSize")
  }

  public func SetPosition(x int32, y int32) {
    ThrowIfDisposed()
    if CanMove {
      Require(SDL.SetWindowPosition(window, x, y), "SDL_SetWindowPosition")
    }
  }

  public func SetState(value WindowState) {
    ThrowIfDisposed()
    if value == WindowState.Normal || value == WindowState.Minimized ||
    value == WindowState.Maximized{
      Require(SDL.SetWindowFullscreen(window, false), "SDL_SetWindowFullscreen")
    }
    switch value {
      case WindowState.Normal { Require(SDL.RestoreWindow(window), "SDL_RestoreWindow") }
      case WindowState.Minimized { Require(SDL.MinimizeWindow(window), "SDL_MinimizeWindow") }
      case WindowState.Maximized { Require(SDL.MaximizeWindow(window), "SDL_MaximizeWindow") }
      case WindowState.Fullscreen { Require(SDL.SetWindowFullscreen(window, true), "SDL_SetWindowFullscreen") }
      case _ { throw ArgumentOutOfRangeException("value") }
    }
  }

  public func RequestActivation() WindowActivationResult {
    if disposed || IsClosing { return WindowActivationResult.Closed }
    let flags = SDL.GetWindowFlags(window)
    if (flags & uint64(SDLWindowFlags.Minimized)) != 0uL && !SDL.RestoreWindow(window) {
      return WindowActivationResult.Failed
    }
    if (flags & uint64(SDLWindowFlags.Hidden)) != 0uL && !SDL.ShowWindow(window) {
      return WindowActivationResult.Failed
    }
    return SDL.RaiseWindow(window) ? WindowActivationResult.Accepted : WindowActivationResult.Failed
  }

  public func SetBorder(decorated bool, resizable bool) {
    ThrowIfDisposed()
    if !decorated {
      EnableHitTest()
    }
    Require(SDL.SetWindowBordered(window, decorated), "SDL_SetWindowBordered")
    Require(SDL.SetWindowResizable(window, resizable), "SDL_SetWindowResizable")
    if decorated {
      DisableHitTest()
    }
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

  public func Show() {
    ThrowIfDisposed()
    Require(SDL.ShowWindow(window), "SDL_ShowWindow")
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

  public func GetClipboardText() string {
    ThrowIfDisposed()
    return SDL.GetClipboardTextS() ?? ""
  }

  public func SetClipboardText(value string) {
    ThrowIfDisposed()
    Require(SDL.SetClipboardText(value), "SDL_SetClipboardText")
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
    disposed = true
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
      SDL.DestroyWindow(window)
      window = SDLWindowPtr.Null
      windowHandle = nint(0)
    }
    if vulkanOwned {
      vulkanOwned = false
      SdlRuntime.ReleaseVulkan()
    }
    if runtimeOwned {
      runtimeOwned = false
      SdlRuntime.Release()
    }
  }

  public prop CanMove bool{
    get {
      ThrowIfDisposed()
      return !IsWayland()
    }
  }

  private func CreateWindow(title string, width int32, height int32, transparent bool) {
    let flags = BuildWindowFlags(transparent)
    window = SDL.CreateWindow(title, width, height, uint64(flags))
    if window.IsNull {
      ThrowSdl("SDL_CreateWindow")
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
    RefreshLogical()
    RefreshFramebuffer()
  }

  public func RefreshMetricsIfChanged() {
    let logicalWidth = LogicalWidth
    let logicalHeight = LogicalHeight
    let framebufferWidth = FramebufferWidth
    let framebufferHeight = FramebufferHeight
    RefreshMetrics()
    RefreshDisplayPacing(false)
    if logicalWidth != LogicalWidth || logicalHeight != LogicalHeight ||
    framebufferWidth != FramebufferWidth || framebufferHeight != FramebufferHeight{
      RaiseMetrics()
    }
  }

  private func RefreshLogical() {
    var width int32 = 0
    var height int32 = 0
    Require(SDL.GetWindowSize(window, &width, &height), "SDL_GetWindowSize")
    LogicalWidth = width
    LogicalHeight = height
  }

  private func RefreshFramebuffer() {
    var width int32 = 0
    var height int32 = 0
    Require(SDL.GetWindowSizeInPixels(window, &width, &height), "SDL_GetWindowSizeInPixels")
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
    MetricsChanged?.Invoke(LogicalWidth, LogicalHeight, FramebufferWidth, FramebufferHeight)
  }

  private func RequestClose() {
    if IsClosing {
      return
    }
    CloseRequested?.Invoke()
  }

  private func HitTest(nativeWindow nint, pointAddress nint, userData nint) SDLHitTestResult {
    if !hitTestEnabled {
      return SDLHitTestResult.Normal
    }
    let point = *SdlHostPoint(pointAddress)
    return EvaluateHitTest(hitTest, point -> X, point -> Y)
  }

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
