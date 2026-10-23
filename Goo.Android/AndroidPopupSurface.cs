using Android.Graphics.Drawables;
using Android.Views;
using NativePopup = Android.Widget.PopupWindow;

namespace Goo.Android;

internal sealed class AndroidPopupSurface(
    GooView owner,
    global::Goo.Window window,
    PopupKind kind,
    Action<PopupDismissReason> dismissed) : EmbeddedPopupSurface
{
    private NativePopup? popup;
    private GooView? view;
    private bool disposed;

    public PopupResult Open(ElementRect anchor, int width, int height, PortalPlacement placement)
    {
        if (!ReferenceEquals(GooView.TryGetNativeOwner(owner.Window), owner))
            return new(PopupStatus.Unsupported);
        var pixelWidth = PixelSize(width);
        var pixelHeight = PixelSize(height);
        var position = Position(anchor, pixelWidth, pixelHeight, placement);
        try
        {
            view = new GooView(owner.Context!, window);
            popup = new NativePopup(view, pixelWidth, pixelHeight, kind == PopupKind.Menu)
            {
                Touchable = kind == PopupKind.Menu,
                OutsideTouchable = kind == PopupKind.Menu,
                ClippingEnabled = true
            };
            using var background = new ColorDrawable(global::Android.Graphics.Color.Transparent);
            popup.SetBackgroundDrawable(background);
            popup.DismissEvent += OnDismissed;
            popup.ShowAsDropDown(owner, position.X, position.Y, GravityFlags.Left);
            if (kind == PopupKind.Menu)
                view.RequestFocus();
            return new(PopupStatus.Opened);
        }
        catch (WindowManagerBadTokenException error)
        {
            Dispose();
            return new(PopupStatus.Failed, error.Message ?? "");
        }
        catch (WindowManagerInvalidDisplayException error)
        {
            Dispose();
            return new(PopupStatus.Failed, error.Message ?? "");
        }
    }

    public WindowOperationResult UpdatePlacement(ElementRect anchor, int width, int height, PortalPlacement placement)
    {
        if (disposed || popup?.IsShowing != true)
            return WindowOperationResult.Closed;
        if (!ReferenceEquals(GooView.TryGetNativeOwner(owner.Window), owner))
            return WindowOperationResult.Unsupported;
        var pixelWidth = PixelSize(width);
        var pixelHeight = PixelSize(height);
        var position = Position(anchor, pixelWidth, pixelHeight, placement);
        try
        {
            popup.Update(owner, position.X, position.Y, pixelWidth, pixelHeight);
            return WindowOperationResult.Accepted;
        }
        catch (WindowManagerBadTokenException)
        {
            return WindowOperationResult.Failed;
        }
        catch (WindowManagerInvalidDisplayException)
        {
            return WindowOperationResult.Failed;
        }
    }

    private int PixelSize(int logical)
    {
        var pixels = Math.Ceiling(logical * (double)owner.Density);
        if (pixels <= 0 || pixels > int.MaxValue)
            throw new ArgumentOutOfRangeException(nameof(logical));
        return (int)pixels;
    }

    private (int X, int Y) Position(ElementRect anchor, int width, int height, PortalPlacement placement)
    {
        var point = global::Goo.PopupWindow.PopupPosition(anchor, width, height, placement,
            owner.Window.UiScale * owner.Density);
        return ((int)point.X, checked((int)point.Y - owner.Height));
    }

    public void RequestClose()
    {
        if (!disposed)
            view?.PostPopupClose(Dispose);
    }

    private void OnDismissed(object? sender, EventArgs args)
    {
        if (!disposed)
            dismissed(PopupDismissReason.PlatformDismissed);
    }

    public void Dispose()
    {
        if (disposed)
            return;
        disposed = true;
        if (popup is { } native)
        {
            popup = null;
            native.DismissEvent -= OnDismissed;
            if (native.IsShowing)
                native.Dismiss();
            native.Dispose();
        }
        view?.Dispose();
        view = null;
    }
}
