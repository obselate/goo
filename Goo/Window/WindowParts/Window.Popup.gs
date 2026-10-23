package Goo

import System

/// Hosts transient native popup roots and their owner-chain lifetime.
public partial class Window {
  private var popup PopupWindow?
  private var popupAnchor ElementRect
  private var popupPlacement PortalPlacement

  internal prop PopupOwnerOpen bool { get -> IsOpen && host?.IsClosing != true && family?.Closing != true }
  internal prop PopupOwnerSupported bool { get -> embeddedHost == nil && host is SdlHost }
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

  internal func SetPopupPlacement(anchor ElementRect, contentWidth int32, contentHeight int32,
    placement PortalPlacement) {
    popupAnchor = anchor
    popupPlacement = resolvePopupPlacement(placement)
    width = scaledSize(contentWidth)
    height = scaledSize(contentHeight)
    x = 0
    y = 0
    positionSet = true
  }

  private func createNativeHost() SdlHost {
    let parent = if popup != nil { Owner?.host as SdlHost? } else { nil }
    return SdlHost(Title, Width, Height, x, y, positionSet, State, decorated, resizable,
      transparent || backdrop == WindowBackdrop.Blur, VSync,
      (px int32, py int32) -> hitTest(px, py), parent, popup?.Kind ?? PopupKind.Menu,
      popup?.NativeTimestamp ?? 0uL, popupAnchor, popupPlacement, UiScale)
  }

  internal func ShowNativePopup() {
    guard let native = host as SdlHost? else { throw InvalidOperationException("A desktop popup host is required") }
    native.ShowPopup()
    observeVisibility()
  }

  internal func UpdateNativePopup(anchor ElementRect, contentWidth int32, contentHeight int32,
    placement PortalPlacement) WindowOperationResult {
    guard let native = host as SdlHost? else { return WindowOperationResult.Closed }
    popupAnchor = anchor
    popupPlacement = resolvePopupPlacement(placement)
    return native.UpdatePopup(anchor, scaledSize(contentWidth), scaledSize(contentHeight), popupPlacement, UiScale)
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
    guard let native = host as SdlHost? else { return }
    if !native.HasPopupKeyboardFocus { return }
    handleFocusChanged(true)
    if let focused = previous {
      if !focused.Retired { FocusElement(focused) }
    }
    RefreshPlatformInput()
    requestRender()
  }

  internal func DismissChildPopups(reason PopupDismissReason) {
    guard let children = family?.Children else { return }
    for child in children {
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
    } else if popup == nil && !popupChainFocused() {
      DismissChildMenus(PopupDismissReason.FocusLost)
    }
  }

  private func DismissChildMenus(reason PopupDismissReason) {
    guard let children = family?.Children else { return }
    for child in children {
      if child.popup?.Kind == PopupKind.Menu { child.popup?.Dismiss(reason) }
    }
  }
}
