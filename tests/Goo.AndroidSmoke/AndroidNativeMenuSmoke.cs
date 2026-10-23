using Android.App;
using Android.Util;
using Goo;
using Goo.Android;

namespace GooAndroidSmokeApp;

internal static class AndroidNativeMenuSmoke
{
    internal static bool TryRun(GooView view, Activity? finishActivity = null)
    {
        if (!view.IsAttachedToWindow || view.Width == 0 || view.Height == 0) return false;
        if (finishActivity is not null)
        {
            var closing = NativeMenus.ShowContextMenuAsync(view.Window, new Point(),
                [new NativeMenuItem { Id = "finish", Text = "Activity closes this menu" }]);
            closing.ContinueWith(task => Log.Info("GooNativeMenus", task.Result.Status == NativeMenuStatus.OwnerClosed
                ? "passed activity-close" : "failed activity-close " + task.Result.Status));
            view.PostDelayed(finishActivity.Finish, 500);
            return true;
        }
        using var bar = new NativeMenuBar(view.Window);
        Check(bar.SetItems([]).Status == NativeMenuStatus.Unsupported, "Android desktop bar must be unsupported");
        var shortcut = NativeMenus.ShowContextMenuAsync(view.Window, new Point(),
            [new NativeMenuItem { Id = "shortcut", Text = "Shortcut",
                Shortcut = new NativeMenuShortcut { Key = "s", Modifiers = new KeyModifiers { Ctrl = true } } }]);
        Check(shortcut.IsCompleted && shortcut.Result.Status == NativeMenuStatus.Unsupported,
            "Android shortcuts must be rejected");
        var selected = NativeMenus.ShowContextMenuAsync(view.Window, new Point { X = 12, Y = 20 },
            [new NativeMenuItem { Id = "actions", Text = "Actions", Items =
                [new NativeMenuItem { Id = "select", Text = "Select", Checked = true },
                    new NativeMenuItem { Separator = true },
                    new NativeMenuItem { Id = "disabled", Text = "Disabled", Enabled = false }] }]);
        Check(NativeMenus.ShowContextMenuAsync(view.Window, new Point(), []).Result.Status == NativeMenuStatus.Busy,
            "Conflicting context menu must be Busy");
        Log.Info("GooNativeMenus", "selection-ready");
        selected.ContinueWith(task => view.Post(() =>
        {
            Check(task.Result.Status == NativeMenuStatus.Success && task.Result.ItemId == "select", "Native selection ID");
            var cancelled = NativeMenus.ShowContextMenuAsync(view.Window, new Point(),
                [new NativeMenuItem { Id = "cancel", Text = "Cancel this menu with Back" }]);
            Log.Info("GooNativeMenus", "cancellation-ready");
            cancelled.ContinueWith(result => view.Post(() =>
            {
                Check(result.Result.Status == NativeMenuStatus.Cancelled && result.Result.ItemId == "", "Native cancellation");
                var closing = NativeMenus.ShowContextMenuAsync(view.Window, new Point(),
                    [new NativeMenuItem { Id = "close", Text = "Owner closes this menu" }]);
                view.Window.TryPost(() => view.Window.RequestClose());
                closing.ContinueWith(closed => view.Post(() =>
                {
                    Check(closed.Result.Status == NativeMenuStatus.OwnerClosed, "Owner-close completion");
                    Log.Info("GooNativeMenus", "passed selection cancellation busy shortcuts owner-close");
                }));
            }));
        }));
        return true;
    }

    private static void Check(bool condition, string message)
    {
        if (!condition) throw new InvalidOperationException(message);
    }
}
