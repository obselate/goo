package Goo

import System

/// Selects an interactive native popup or an input-transparent tooltip.
public enum PopupKind {
  /// Receives input and joins the owner's native popup grab chain.
  Menu;
  /// Does not receive keyboard or pointer input.
  Tooltip
}

/// Reports native popup creation without substituting an ordinary window.
public enum PopupStatus {
  /// Native creation and mapping were accepted, subject to compositor policy.
  Opened;
  /// The owner is closed or closing.
  Closed;
  /// The host does not provide the requested native popup operation.
  Unsupported;
  /// A Wayland menu requires an originating native input event.
  RequiresUserAction;
  /// Native creation or presentation initialization failed.
  Failed;
  /// The owner already has a popup or modal operation.
  Busy
}

/// Identifies why a complete native popup chain was dismissed.
public enum PopupDismissReason {
  /// The application requested dismissal.
  Programmatic;
  /// Escape dismissed the popup.
  Escape;
  /// Input outside the popup chain dismissed it.
  OutsideInteraction;
  /// Keyboard focus left the owner and popup chain.
  FocusLost;
  /// The owner became hidden.
  OwnerHidden;
  /// The owner closed.
  OwnerClosed;
  /// The compositor dismissed the popup without a more specific reason.
  PlatformDismissed
}

/// Contains a native popup creation outcome and owned failure detail.
public sealed class PopupResult {
  /// Gets the native creation outcome.
  public prop Status PopupStatus { get; private set; }

  /// Gets native failure detail, or an empty string.
  public prop Error string { get; private set; }

  internal init(status PopupStatus, error string = "") {
    Status = status
    Error = error
  }
}

/// Hosts one new Goo root in a transient native surface outside its owner's bounds.
/// Create a new root and PopupWindow for each opening. Portal ownership is unchanged.
public sealed partial class PopupWindow : IDisposable {
  private let owner Window
  private let window Window
  private let kind PopupKind
  private var disposed bool
  private var started bool
  private var announced bool
  private var closing bool
  private var reason PopupDismissReason
  private var previousFocus WeakReference?
  private var embeddedSurface EmbeddedPopupSurface?
  internal var NativeTimestamp uint64

  /// Creates a popup with an independent root and a desktop or Android owner.
  /// @param owner The open native owner on the same UI thread.
  /// @param root A root Cell not mounted in another window.
  /// @param kind Interactive menu or input-transparent tooltip.
  public init(owner Window, root Cell, kind PopupKind = PopupKind.Menu) {
    if owner == nil { throw ArgumentNullException("owner") }
    if root == nil { throw ArgumentNullException("root") }
    if kind != PopupKind.Menu && kind != PopupKind.Tooltip { throw ArgumentOutOfRangeException("kind") }
    owner.RequireElementHandleThread("PopupWindow")
    this.owner = owner
    this.kind = kind
    window = Window{ Root: root, Owner: owner, InitiallyVisible: false, Background: Color.Transparent }
    window.ConfigurePopup(this)
  }

  /// Creates a submenu whose native parent is another open popup.
  /// @param owner The open parent popup on the same UI thread.
  /// @param root A root Cell not mounted in another window.
  /// @param kind Interactive menu or input-transparent tooltip.
  public init(owner PopupWindow, root Cell, kind PopupKind = PopupKind.Menu) {
    if owner == nil { throw ArgumentNullException("owner") }
    if root == nil { throw ArgumentNullException("root") }
    if kind != PopupKind.Menu && kind != PopupKind.Tooltip { throw ArgumentOutOfRangeException("kind") }
    owner.requireUsable()
    this.owner = owner.window
    this.kind = kind
    window = Window{ Root: root, Owner: owner.window, InitiallyVisible: false, Background: Color.Transparent }
    window.ConfigurePopup(this)
  }

  /// Reports whether the surface is open, including deferred GPU retirement during close.
  public prop IsOpen bool { get -> window.IsOpen }

  /// Gets the current logical and framebuffer metrics on the owner thread.
  public prop Metrics WindowMetrics {
    get {
      owner.RequireElementHandleThread("PopupWindow.Metrics")
      return window.CurrentWindowMetrics()
    }
  }

  /// Runs once after the popup and all descendants release their native resources.
  public event Dismissed Action[PopupDismissReason]

  /// Opens a native popup relative to its parent's content rectangle in layout units.
  /// Wayland menus must open from native input or an active parent popup grab.
  /// @param anchor The finite parent-content anchor rectangle.
  /// @param width Requested positive content width in layout units.
  /// @param height Requested positive content height in layout units.
  /// @param placement Preferred side and alignment before native display constraints.
  /// @returns An explicit native creation result, never a top-level-window fallback.
  public func Open(anchor ElementRect, width int32, height int32,
    placement PortalPlacement = PortalPlacement.BottomStart) PopupResult {
    requireUsable()
    ValidatePlacement(anchor, width, height, placement)
    if started { throw InvalidOperationException("Create a new PopupWindow and root for each opening") }
    if !owner.PopupOwnerOpen { return PopupResult(PopupStatus.Closed) }
    if !owner.PopupOwnerSupported { return PopupResult(PopupStatus.Unsupported) }
    if !owner.IsVisible { return PopupResult(PopupStatus.Unsupported) }
    if owner.IsInputBlocked || owner.HasChildPopup { return PopupResult(PopupStatus.Busy) }
    NativeTimestamp = PopupInputContext.Timestamp
    closing = false
    reason = PopupDismissReason.Programmatic
    window.SetPopupPlacement(anchor, width, height, placement)
    if let focused = owner.PopupFocusedNode { previousFocus = WeakReference(focused) }
    started = true
    try {
      if let factory = owner.EmbeddedPopupFactory {
        let surface = factory(window, kind, Dismiss)
        embeddedSurface = surface
        let result = surface.Open(anchor, window.Width, window.Height, window.NativePopupPlacement)
        if result.Status != PopupStatus.Opened {
          surface.Dispose()
          embeddedSurface = nil
          return result
        }
      } else {
        window.Open()
        window.ShowNativePopup()
      }
      owner.SuspendPopupInput(kind)
      announced = true
      return PopupResult(PopupStatus.Opened)
    } catch (error PopupActivationException) {
      window.Close()
      return PopupResult(PopupStatus.RequiresUserAction, error.Message)
    } catch (error EntryPointNotFoundException) {
      window.Close()
      return PopupResult(PopupStatus.Unsupported, error.Message)
    } catch (error InvalidOperationException) {
      window.Close()
      return PopupResult(PopupStatus.Failed, error.Message)
    }
  }

  /// Updates requested size and parent-local placement without changing the root.
  /// @param anchor The finite parent-content anchor rectangle.
  /// @param width Requested positive content width in layout units.
  /// @param height Requested positive content height in layout units.
  /// @param placement Preferred side and alignment before native display constraints.
  /// @returns Accepted, Closed, Unsupported or Failed from the native operation.
  public func UpdatePlacement(anchor ElementRect, width int32, height int32,
    placement PortalPlacement = PortalPlacement.BottomStart) WindowOperationResult {
    requireUsable()
    ValidatePlacement(anchor, width, height, placement)
    if !IsOpen || closing { return WindowOperationResult.Closed }
    return window.UpdateNativePopup(anchor, width, height, placement, embeddedSurface)
  }

  /// Requests descendant-first dismissal. GPU retirement can defer native destruction.
  public func Close() { Dismiss(PopupDismissReason.Programmatic) }

  /// Requests dismissal and prevents this instance from reopening.
  public func Dispose() {
    owner.RequireElementHandleThread("PopupWindow.Dispose")
    if disposed { return }
    disposed = true
    Dismiss(PopupDismissReason.Programmatic)
  }

  private func requireUsable() {
    owner.RequireElementHandleThread("PopupWindow")
    if disposed { throw ObjectDisposedException("PopupWindow") }
  }

  internal prop Kind PopupKind { get -> kind }

  internal func Dismiss(value PopupDismissReason) {
    owner.RequireElementHandleThread("PopupWindow.Close")
    if !IsOpen || closing { return }
    closing = true
    reason = value
    window.RequestClose()
    window.DismissChildPopups(value)
    embeddedSurface?.RequestClose()
  }

  internal func CompleteDismissal() {
    let focus = previousFocus?.Target as Node?
    previousFocus = nil
    let surface = embeddedSurface
    embeddedSurface = nil
    surface?.Dispose()
    if !announced { return }
    announced = false
    if kind == PopupKind.Menu { owner.RestorePopupInput(focus) }
    Dismissed?.Invoke(reason)
  }

  shared {
    internal func PopupCoordinate(value float64, scale float32) int32 {
      let result = Math.Round(value * float64(scale))
      if result < float64(Int32.MinValue) || result > float64(Int32.MaxValue) {
        throw ArgumentOutOfRangeException("anchor", "Scaled popup coordinates exceed the native range")
      }
      return int32(result)
    }

    internal func PopupPosition(anchor ElementRect, width int32, height int32,
      placement PortalPlacement, scale float32) Point {
      let left = PopupCoordinate(anchor.X, scale)
      let top = PopupCoordinate(anchor.Y, scale)
      let anchorWidth = PopupCoordinate(anchor.Width, scale)
      let anchorHeight = PopupCoordinate(anchor.Height, scale)
      let x = switch placement {
        case PortalPlacement.Bottom or PortalPlacement.Top: float64(left) + (float64(anchorWidth) - width) / 2.0
        case PortalPlacement.BottomEnd or PortalPlacement.TopEnd: float64(left) + anchorWidth - width
        case PortalPlacement.RightStart or PortalPlacement.Right or PortalPlacement.RightEnd: float64(left) + anchorWidth
        case PortalPlacement.LeftStart or PortalPlacement.Left or PortalPlacement.LeftEnd: float64(left) - width
        case _: float64(left)
      }
      let y = switch placement {
        case PortalPlacement.TopStart or PortalPlacement.Top or PortalPlacement.TopEnd: float64(top) - height
        case PortalPlacement.Right or PortalPlacement.Left: float64(top) + (float64(anchorHeight) - height) / 2.0
        case PortalPlacement.RightEnd or PortalPlacement.LeftEnd: float64(top) + anchorHeight - height
        case PortalPlacement.RightStart or PortalPlacement.LeftStart: float64(top)
        case _: float64(top) + anchorHeight
      }
      return Point{ X: PopupCoordinate(x, 1.0F), Y: PopupCoordinate(y, 1.0F) }
    }

    internal func ValidatePlacement(anchor ElementRect, width int32, height int32, placement PortalPlacement) {
      if !Double.IsFinite(anchor.X) || !Double.IsFinite(anchor.Y) || !Double.IsFinite(anchor.Width)
        || !Double.IsFinite(anchor.Height) || anchor.Width < 0.0 || anchor.Height < 0.0 {
        throw ArgumentOutOfRangeException("anchor")
      }
      if width <= 0 || height <= 0 { throw ArgumentOutOfRangeException("width") }
      if !validPortalPlacement(placement) { throw ArgumentOutOfRangeException("placement") }
    }
  }
}

internal class PopupActivationException : InvalidOperationException {
  internal init(message string) : base(message) { }
}
