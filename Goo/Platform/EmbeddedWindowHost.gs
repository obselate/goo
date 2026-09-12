package Goo

import System

/// Connects a host-owned viewport and frame loop to an ordinary Goo window.
/// All calls except RequestFrame run on the thread that attaches the window.
public open class EmbeddedWindowHost : IDisposable {
  internal var Bridge EmbeddedWindowBridge?
  private var disposed bool
  private var logicalWidth int32
  private var logicalHeight int32
  private var framebufferWidth int32
  private var framebufferHeight int32
  private var suspended bool

  /// Gets the attached Goo window, or nil after disposal.
  public prop Window Window? { get -> Bridge?.Owner }
  /// Reports whether a Vulkan presentation surface is attached.
  public prop IsPresentationAttached bool{ get -> Window?.EmbeddedPresentationAttached == true }
  /// Reports whether frame simulation and presentation are suspended.
  public prop IsSuspended bool{ get -> suspended }
  /// Gets seconds until frame service is needed, or positive infinity while idle.
  public prop NextFrameDelaySeconds float64{
    get {
      RequireOwnerThread()
      return Window?.EmbeddedFrameDelay(suspended) ?? Double.PositiveInfinity
    }
  }

  /// Reports content size in logical units and the corresponding framebuffer pixels.
  public func Resize(width int32, height int32, pixelWidth int32, pixelHeight int32) {
    RequireOwnerThread()
    if width < 0 || height < 0 || pixelWidth < 0 || pixelHeight < 0 {
      throw ArgumentOutOfRangeException("width", "Viewport dimensions cannot be negative")
    }
    logicalWidth = width
    logicalHeight = height
    framebufferWidth = pixelWidth
    framebufferHeight = pixelHeight
    Window?.queueNativeMetrics(width, height, pixelWidth, pixelHeight)
    RequestFrame()
  }

  /// Creates presentation resources for the current native surface without remounting Cells.
  public func AttachPresentation() {
    RequireOwnerThread()
    RequireWindow().AttachEmbeddedPresentation()
    RequestFrame()
  }

  /// Releases presentation resources and waits for submitted GPU work to finish.
  /// The retained tree remains mounted and may be attached to a replacement surface.
  public func DetachPresentation() {
    RequireOwnerThread()
    Window?.DetachEmbeddedPresentation()
  }

  /// Advances a completed graphics submission into presentation without
  /// simulating, rendering, or consuming presentation completion.
  /// Returns true when a completed submission was consumed.
  public func ServicePendingSubmission() bool {
    RequireOwnerThread()
    return Window?.ServiceEmbeddedPendingSubmission() == true
  }

  /// Processes queued work and one externally timed frame without polling native events.
  public func RenderFrame(dt float64) {
    RequireOwnerThread()
    RequireWindow().PumpEmbedded(dt, suspended)
  }

  /// Reports whether the viewport has native input focus.
  public func SetFocused(value bool) {
    RequireOwnerThread()
    RequireWindow().handleFocusChanged(value)
    RequestFrame()
  }

  /// Pauses simulation and presentation and cancels transient input state.
  public func Suspend() {
    RequireOwnerThread()
    if suspended { return }
    suspended = true
    Window?.handleFocusChanged(false)
  }

  /// Resumes frame service without applying elapsed background time to animations.
  public func Resume() {
    RequireOwnerThread()
    if !suspended { return }
    suspended = false
    Window?.ResetEmbeddedClock()
    RequestFrame()
  }

  /// Closes the attached window and releases its retained and presentation resources.
  public func Dispose() {
    if disposed { return }
    RequireOwnerThread()
    if let window = Window {
      window.DetachEmbeddedPresentation()
      window.Close()
    }
    disposed = true
    Bridge = nil
  }

  /// Schedules frame service on the owner thread. The framework may call this from any thread.
  protected open func RequestFrame();
  /// Loads or retains the platform Vulkan loader.
  protected open func LoadVulkanLibrary() bool;
  /// Returns the Vulkan global procedure lookup address.
  protected open func GetVulkanGetInstanceProcAddr() nint;
  /// Releases the loader reference acquired by LoadVulkanLibrary.
  protected open func UnloadVulkanLibrary();
  /// Returns the Vulkan instance extensions needed by this native surface.
  protected open func GetVulkanInstanceExtensions() []string;
  /// Creates a Vulkan surface owned by Goo for the supplied instance.
  protected open func CreateVulkanSurface(instance nint, out surface uint64) bool;
  /// Destroys a Vulkan surface previously created for the supplied instance.
  protected open func DestroyVulkanSurface(instance nint, surface uint64);
  /// Returns the native viewport handle used for diagnostics.
  protected open func GetNativeHandle() nint -> nint(0)
  /// Uses the requested framebuffer extent when the native WSI permits scaling.
  protected open func PreferRequestedFramebufferExtent() bool -> false

  /// Allows inherited Vulkan alpha when the native compositor has configured premultiplied transparency.
  protected open func AllowInheritedCompositeAlpha() bool -> false
  /// Starts the platform text input session and reports whether it is active.
  protected open func StartTextInput() bool -> false
  /// Stops the platform text input session.
  protected open func StopTextInput() { }
  /// Updates the text caret area in logical viewport units.
  protected open func SetImeArea(x int32, y int32, width int32, height int32, cursor int32) bool -> false
  /// Gets plain text from the platform clipboard.
  protected open func GetClipboardText() string -> ""
  /// Stores plain text in the platform clipboard.
  protected open func SetClipboardText(value string) { }
  /// Updates the pointer cursor when the platform supports one.
  protected open func SetCursor(value Cursor) { }

  internal prop LogicalWidth int32{ get -> logicalWidth }
  internal prop LogicalHeight int32{ get -> logicalHeight }
  internal prop FramebufferWidth int32{ get -> framebufferWidth }
  internal prop FramebufferHeight int32{ get -> framebufferHeight }
  internal func Bind(window Window) EmbeddedWindowBridge {
    if disposed { throw ObjectDisposedException("EmbeddedWindowHost") }
    if Bridge != nil { throw InvalidOperationException("Host already has an attached window") }
    let bridge = EmbeddedWindowBridge(this, window)
    Bridge = bridge
    return bridge
  }
  internal func Unbind() { Bridge = nil }
  internal func RequireOwnerThread() {
    if disposed { throw ObjectDisposedException("EmbeddedWindowHost") }
    Window?.RequireEmbeddedThread()
  }
  private func RequireWindow() Window {
    guard let window = Window else { throw InvalidOperationException("Attach a Window before using the host") }
    return window
  }
  internal func Wake() { RequestFrame() }
  internal func LoadLoader() bool -> LoadVulkanLibrary()
  internal func LookupLoader() nint -> GetVulkanGetInstanceProcAddr()
  internal func UnloadLoader() { UnloadVulkanLibrary() }
  internal func InstanceExtensions() []string -> GetVulkanInstanceExtensions()
  internal func CreateSurface(instance nint, out surface uint64) bool -> CreateVulkanSurface(instance, out surface)
  internal func DestroySurface(instance nint, surface uint64) { DestroyVulkanSurface(instance, surface) }
  internal func NativeHandle() nint -> GetNativeHandle()
  internal func UsesRequestedFramebufferExtent() bool -> PreferRequestedFramebufferExtent()
  internal func AllowsInheritedCompositeAlpha() bool -> AllowInheritedCompositeAlpha()
  internal func BeginTextInput() bool -> StartTextInput()
  internal func EndTextInput() { StopTextInput() }
  internal func SetTextArea(x int32, y int32, width int32, height int32, cursor int32) bool ->
  SetImeArea(x, y, width, height, cursor)
  internal func ClipboardText() string -> GetClipboardText()
  internal func CopyText(value string) { SetClipboardText(value) }
  internal func ChangeCursor(value Cursor) { SetCursor(value) }
}
