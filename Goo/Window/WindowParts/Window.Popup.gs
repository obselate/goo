package Goo

import System

/// Hosts transient native popup roots and their owner-chain lifetime.
public partial class Window {
  private var popup PopupWindow?
  private var popupAnchor ElementRect
  private var popupPlacement PortalPlacement
  private var pendingPopupFocus WeakReference?
  internal var EmbeddedPopupFactory Func[Window, PopupKind, Action[PopupDismissReason], EmbeddedPopupSurface]?
  internal var PopupAvailableSize Func[LayoutSize]?

  internal prop PopupMaximum LayoutSize {
    get {
      if let available = PopupAvailableSize { return available() }
      let display = host?.GetCurrentDisplay()
      let area = display?.UsableBounds ?? display?.Bounds
      return LayoutSize((area?.Width ?? float64(NativeWidth)) / float64(UiScale),
        (area?.Height ?? float64(NativeHeight)) / float64(UiScale))
    }
  }
  internal prop NativePopupPlacement PortalPlacement { get -> popupPlacement }

  internal prop PopupOwnerOpen bool { get -> IsOpen && !NativeOwnerClosing }
  internal prop PopupOwnerSupported bool { get -> LayerShell == nil && (EmbeddedPopupFactory != nil || (embeddedHost == nil && host is SdlHost)) }
  internal prop PopupFocusedNode Node? { get -> input.FocusedNode() }

  internal prop HasChildPopup bool {
    get {
      guard let children = family?.Children else { return false }
      for child in children {
        if child.popup != nil && child.IsOpen { return true }
      }
      return false
    }
  }

  internal func ConfigurePopup(value PopupWindow) { popup = value }

  internal func SetPopupPlacement(anchor ElementRect, size LayoutSize,
    placement PortalPlacement) {
    popupAnchor = anchor
    popupPlacement = resolvePopupPlacement(placement)
    width = Math.Max(1, scaledSize(size.Width))
    height = Math.Max(1, scaledSize(size.Height))
    x = 0
    y = 0
    positionSet = true
  }

  private func createNativeHost() SdlHost {
    let parent = if popup != nil { Owner?.host as SdlHost? } else { nil }
    return SdlHost(Title, NativeWidth, NativeHeight, x, y, positionSet, State, decorated, resizable,
      transparent || backdrop == WindowBackdrop.Blur, VSync,
      (px int32, py int32) -> hitTest(px, py), parent, popup?.Kind ?? PopupKind.Menu,
      popup?.NativeTimestamp ?? 0uL, popupAnchor, popupPlacement, float32(UiScale), LayerShell,
      scaledSize(minWidth), scaledSize(minHeight))
  }

  internal func ShowNativePopup() {
    guard let native = host as SdlHost? else { throw InvalidOperationException("A desktop popup host is required") }
    native.ShowPopup()
    observeVisibility()
  }

  internal func UpdateNativePopup(anchor ElementRect, size LayoutSize,
    placement PortalPlacement, surface EmbeddedPopupSurface? = nil) WindowOperationResult {
    popupAnchor = anchor
    popupPlacement = resolvePopupPlacement(placement)
    if let embedded = surface {
      width = Math.Max(1, scaledSize(size.Width))
      height = Math.Max(1, scaledSize(size.Height))
      return embedded.UpdatePlacement(anchor, width, height, popupPlacement)
    }
    guard let native = host as SdlHost? else { return WindowOperationResult.Closed }
    return native.UpdatePopup(anchor, Math.Max(1, scaledSize(size.Width)), Math.Max(1, scaledSize(size.Height)), popupPlacement, float32(UiScale))
  }

  private func resolvePopupPlacement(placement PortalPlacement) PortalPlacement {
    if Owner?.node?.Direction != Direction.RightToLeft { return placement }
    return switch placement {
      case PortalPlacement.BottomStart: PortalPlacement.BottomEnd
      case PortalPlacement.BottomEnd: PortalPlacement.BottomStart
      case PortalPlacement.TopStart: PortalPlacement.TopEnd
      case PortalPlacement.TopEnd: PortalPlacement.TopStart
      case _: placement
    }
  }

  internal func SuspendPopupInput(kind PopupKind) {
    if kind == PopupKind.Tooltip { return }
    input.FocusLost(node, resolver)
    RefreshPlatformInput()
    accessibility?.MarkDirty()
    requestRender()
  }

  internal func RestorePopupInput(previous Node?) {
    if !PopupOwnerOpen || !IsVisible || IsInputBlocked { return }
    if embeddedHost != nil {
      if !IsFocused {
        pendingPopupFocus = if previous != nil { WeakReference(previous) } else { nil }
        return
      }
    } else {
      guard let native = host as SdlHost? else { return }
      if !native.HasPopupKeyboardFocus { return }
    }
    handleFocusChanged(true)
    if let focused = previous {
      if !focused.Retired { FocusElement(focused) }
    }
    RefreshPlatformInput()
    requestRender()
  }

  internal func DismissChildPopups(reason PopupDismissReason) {
    guard let children = family?.Children else { return }
    for child in children.ToArray() {
      child.popup?.Dismiss(reason)
    }
  }

  private func popupChainFocused() bool {
    if IsFocused { return true }
    guard let children = family?.Children else { return false }
    for child in children {
      if child.popup != nil && child.IsOpen && child.popupChainFocused() { return true }
    }
    return false
  }

  private func checkPopupDismissal() {
    if !PopupOwnerOpen {
      DismissChildPopups(PopupDismissReason.OwnerClosed)
    } else if !IsVisible {
      DismissChildPopups(PopupDismissReason.OwnerHidden)
    } else if IsInputBlocked {
      DismissChildPopups(PopupDismissReason.OutsideInteraction)
    } else if embeddedHost == nil && popup == nil && !popupChainFocused() {
      DismissChildMenus(PopupDismissReason.FocusLost)
    }
  }

  private func DismissChildMenus(reason PopupDismissReason) {
    guard let children = family?.Children else { return }
    for child in children.ToArray() {
      if child.popup?.Kind == PopupKind.Menu { child.popup?.Dismiss(reason) }
    }
  }
}
