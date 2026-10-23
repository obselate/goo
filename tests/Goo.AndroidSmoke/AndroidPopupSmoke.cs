using Android.Util;
using Goo;
using Goo.Android;
using GooAndroidSmoke;
using PopupWindow = Goo.PopupWindow;

namespace GooAndroidSmokeApp;

internal static class AndroidPopupSmoke
{
    internal static bool TryRun(GooView view)
    {
        if (!view.Window.IsVisible || view.Width <= 0 || view.Height <= 0)
            return false;
        var originalScale = view.Window.UiScale;
        var density = Math.Max(view.Resources?.DisplayMetrics?.Density ?? 1f, 0.1f);
        var stage = 0;
        var nestedClosed = false;
        var completed = false;
        PopupWindow? tooltip = null;
        PopupWindow? nested = null;
        view.Window.UiScale = 1.5f;
        view.Window.SetTimeout(() => Require(completed, "Android popup lifecycle timed out."), 15000);
        tooltip = new(view.Window, SmokeApplication.CreatePopupRoot(AttachTooltip), PopupKind.Tooltip);
        tooltip.Dismissed += reason =>
        {
            Require(reason == PopupDismissReason.Programmatic && nestedClosed && nested?.IsOpen == false,
                "Nested popup did not retire before its parent.");
            nested?.Dispose();
            tooltip.Dispose();
            OpenMenu();
        };
        Require(tooltip.Open(Anchor(8), 120, 80).Status == PopupStatus.Opened, "Tooltip did not open.");
        return true;

        int Logical(int size) => (int)Math.Round(Math.Ceiling(size * (double)density) / density);

        void AttachTooltip(Window shown)
        {
            shown.PresentationAccepted += _ =>
            {
                if (tooltip is not { } current || stage > 1)
                    return;
                var metrics = current.Metrics;
                if (stage == 0)
                {
                    Require(metrics.LogicalWidth == Logical(180) && metrics.LogicalHeight == Logical(120)
                        && metrics.FramebufferWidth > 0 && !shown.IsFocused, "Tooltip scale or passive rendering failed.");
                    stage = 1;
                    Require(current.UpdatePlacement(Anchor(12), 160, 90) == WindowOperationResult.Accepted,
                        "Popup placement update failed.");
                    return;
                }
                if (metrics.LogicalWidth != Logical(240) || metrics.LogicalHeight != Logical(135))
                    return;
                stage = 2;
                nested = new(current, SmokeApplication.CreatePopupRoot(child =>
                {
                    child.PresentationAccepted += _ =>
                    {
                        if (stage != 2)
                            return;
                        stage = 3;
                        current.Close();
                    };
                }), PopupKind.Tooltip);
                nested.Dismissed += reason =>
                {
                    Require(reason == PopupDismissReason.Programmatic, "Nested popup lost its dismissal reason.");
                    nestedClosed = true;
                };
                Require(nested.Open(Anchor(4), 60, 40).Status == PopupStatus.Opened, "Nested tooltip did not open.");
            };
        }

        void OpenMenu()
        {
            var menu = new PopupWindow(view.Window, SmokeApplication.CreatePopupRoot(AttachMenu), PopupKind.Menu);
            menu.Dismissed += reason =>
            {
                Require(reason == PopupDismissReason.OwnerHidden && !menu.IsOpen, "Owner pause left a native menu open.");
                menu.Dispose();
                view.Resume();
                view.Window.UiScale = originalScale;
                completed = true;
                Log.Info("GooPopupSmoke", "PASS tooltip_render scale placement nested_close menu_focus owner_pause teardown");
            };
            Require(menu.Open(Anchor(8), 120, 80).Status == PopupStatus.Opened, "Native menu popup did not open.");
        }

        void AttachMenu(Window shown)
        {
            var presented = false;
            shown.PresentationAccepted += _ =>
            {
                presented = true;
                PauseWhenReady();
            };
            shown.FocusChanged += _ => PauseWhenReady();
            void PauseWhenReady()
            {
                if (stage != 3 || !presented || !shown.IsFocused)
                    return;
                stage = 4;
                view.Pause();
            }
        }
    }

    private static ElementRect Anchor(double value) => new() { X = value, Y = value, Width = 4, Height = 4 };

    private static void Require(bool value, string message)
    {
        if (!value)
            throw new InvalidOperationException(message);
    }
}
