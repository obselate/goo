package Goo.Android

import Android.Graphics
import Android.Graphics.Drawables
import Android.Views
import Goo
import NativePopup = Android.Widget.PopupWindow
import System

internal class AndroidPopupSurface(
    owner GooView,
    window Goo.Window,
    kind PopupKind,
    dismissed(PopupDismissReason) -> void
) : EmbeddedPopupSurface {
    private var popup NativePopup?
    private var view GooView?
    private var disposed bool

    func Open(anchor ElementRect, width int32, height int32, placement PortalPlacement) PopupResult {
        if !object.ReferenceEquals(GooView.TryGetNativeOwner(owner.Window), owner) {
            return PopupResult(PopupStatus.Unsupported)
        }
        let pixelWidth = PixelSize(width)
        let pixelHeight = PixelSize(height)
        let position = Position(anchor, pixelWidth, pixelHeight, placement)
        try {
            view = GooView(owner.Context!!, window)
            popup = NativePopup(view, pixelWidth, pixelHeight, kind == PopupKind.Menu){
                Touchable = kind == PopupKind.Menu,
                OutsideTouchable = kind == PopupKind.Menu,
                ClippingEnabled = true
            }
            using let background = ColorDrawable(Android.Graphics.Color.Transparent)
            popup!!.SetBackgroundDrawable(background)
            this.popup!!.DismissEvent += OnDismissed
            popup!!.ShowAsDropDown(owner, position.X, position.Y, GravityFlags.Left)
            if kind == PopupKind.Menu {
                view!!.RequestFocus()
            }
            return PopupResult(PopupStatus.Opened)
        } catch (error WindowManagerBadTokenException) {
            Dispose()
            return PopupResult(PopupStatus.Failed, error.Message ?? "")
        } catch (error WindowManagerInvalidDisplayException) {
            Dispose()
            return PopupResult(PopupStatus.Failed, error.Message ?? "")
        }
    }

    func UpdatePlacement(
        anchor ElementRect,
        width int32,
        height int32,
        placement PortalPlacement
    ) WindowOperationResult {
        if disposed || popup?.IsShowing != true {
            return WindowOperationResult.Closed
        }
        if !object.ReferenceEquals(GooView.TryGetNativeOwner(owner.Window), owner) {
            return WindowOperationResult.Unsupported
        }
        let pixelWidth = PixelSize(width)
        let pixelHeight = PixelSize(height)
        let position = Position(anchor, pixelWidth, pixelHeight, placement)
        try {
            popup!!.Update(owner, position.X, position.Y, pixelWidth, pixelHeight)
            return WindowOperationResult.Accepted
        } catch (WindowManagerBadTokenException) {
            return WindowOperationResult.Failed
        } catch (WindowManagerInvalidDisplayException) {
            return WindowOperationResult.Failed
        }
    }

    private func PixelSize(logical int32) int32 {
        let pixels = Math.Ceiling(float64(logical) * float64(owner.Density))
        if pixels <= float64(0.0) || pixels > float64(int32.MaxValue) {
            throw ArgumentOutOfRangeException("logical")
        }
        return int32(pixels)
    }

    private func Position(anchor ElementRect, width int32, height int32, placement PortalPlacement)(X int32, Y int32) {
        let point = Goo.PopupWindow.PopupPosition(
            anchor,
            width,
            height,
            placement,
            owner.Window.UiScale * owner.Density
        )
        return (int32(point.X), checked(int32(point.Y) - owner.Height))
    }

    func RequestClose() {
        if !disposed {
            view?.PostPopupClose(Dispose)
        }
    }

    private func OnDismissed(sender object?, args EventArgs) {
        if !disposed {
            dismissed(PopupDismissReason.PlatformDismissed)
        }
    }

    func Dispose() {
        if disposed {
            return
        }
        disposed = true
        if popup is {} native {
            popup = nil
            native.DismissEvent -= OnDismissed
            if native.IsShowing {
                native.Dismiss()
            }
            native.Dispose()
        }
        if view is {Parent: ViewGroup parent} child {
            parent.RemoveView(child)
        }
        if let current = view {
            IDisposable(current).Dispose()
        }
        view = nil
    }
}
