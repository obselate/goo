package Goo

import System
import System.Collections.Generic

internal class EmbeddedWindowBridge : WindowHost, VulkanSurfaceHost {
  private let host EmbeddedWindowHost
  internal let Owner Window
  private var closing bool
  private var textInputActive bool

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

  internal init(host EmbeddedWindowHost, window Window) {
    this.host = host
    Owner = window
  }
  public prop LogicalWidth int32{ get -> host.LogicalWidth }
  public prop LogicalHeight int32{ get -> host.LogicalHeight }
  public prop FramebufferWidth int32{ get -> host.FramebufferWidth }
  public prop FramebufferHeight int32{ get -> host.FramebufferHeight }
  public prop PreferRequestedFramebufferExtent bool{ get -> host.UsesRequestedFramebufferExtent() }
  public prop AllowInheritedCompositeAlpha bool{ get -> host.AllowsInheritedCompositeAlpha() }
  public prop X int32{ get -> 0 }
  public prop Y int32{ get -> 0 }
  public prop IsClosing bool{ get -> closing }
  public prop IsTextInputActive bool{ get -> textInputActive }
  public prop HasPendingEvents bool{ get -> false }
  public prop SchedulerPacingAvailable bool{ get -> false }
  public prop NativeResizable bool{ get -> false }
  public prop CanMove bool{ get -> false }
  public prop Transparent bool{ get -> Owner.Transparent }
  public prop VSync bool{ get -> Owner.VSync }
  public prop WindowHandle nint{ get -> host.NativeHandle() }

  public func PollEvents() { }
  public func WaitEvents(timeoutMs int32) { }
  public func ClearPendingEvents() { }
  public func MarkFrame(nowTicks float64) { }
  public func DeferFrame(nowTicks float64) { }
  public func IsFrameDue(nowTicks float64) bool -> true
  public func FrameWaitMilliseconds(nowTicks float64, fallbackMs int32) int32 -> fallbackMs
  public func RefreshMetricsIfChanged() { }
  public func RefreshDisplayPacing(reset bool) { }
  public func Wake() { host.Wake() }
  public func SetTitle(value string) { }
  public func SetSize(width int32, height int32) { }
  public func SetPosition(x int32, y int32) { }
  public func SetState(value WindowState) { }
  public func SetBorder(decorated bool, resizable bool) { }
  public func SetVSync(value bool) { }
  public func SetCursor(value Cursor) { host.ChangeCursor(value) }
  public func Show() { }
  public func StartTextInput() bool {
    textInputActive = host.BeginTextInput()
    return textInputActive
  }
  public func StopTextInput() {
    host.EndTextInput()
    textInputActive = false
  }
  public func SetImeArea(x int32, y int32, width int32, height int32, cursor int32) bool ->
  host.SetTextArea(x, y, width, height, cursor)
  public func GetClipboardText() string -> host.ClipboardText()
  public func SetClipboardText(value string) { host.CopyText(value) }
  public func BeginClose() { closing = true }
  public func Dispose() { host.Unbind() }
  public func LoadVulkanLibrary() bool -> host.LoadLoader()
  public func GetVulkanGetInstanceProcAddr() nint -> host.LookupLoader()
  public func UnloadVulkanLibrary() { host.UnloadLoader() }
  public func GetVulkanInstanceExtensions() []string -> host.InstanceExtensions()
  public func CreateVulkanSurface(instance nint, out surface uint64) bool -> host.CreateSurface(instance, out surface)
  public func DestroyVulkanSurface(instance nint, surface uint64) { host.DestroySurface(instance, surface) }
}
