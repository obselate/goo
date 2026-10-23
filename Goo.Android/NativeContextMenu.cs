using Android.App;
using Android.Content;
using Android.Views;

namespace Goo.Android;

internal sealed record AndroidNativeMenuRow(string Id, string Text, bool Enabled, bool Checked,
    bool Separator, AndroidNativeMenuRow[] Items);

internal enum AndroidContextMenuStatus { Success, Cancelled, Unsupported, OwnerClosed, Failed }

internal sealed class NativeContextMenu : Java.Lang.Object, View.IOnCreateContextMenuListener,
    IMenuItemOnMenuItemClickListener
{
    private readonly GooView view;
    private readonly GooActivity activity;
    private readonly AndroidNativeMenuRow[] rows;
    private readonly Action<AndroidContextMenuStatus, string, string> complete;
    private readonly Dictionary<int, string> ids = [];
    private string selected = "";
    private string error = "";
    private bool ended;

    private NativeContextMenu(GooView view, GooActivity activity, AndroidNativeMenuRow[] rows,
        Action<AndroidContextMenuStatus, string, string> complete)
    {
        this.view = view;
        this.activity = activity;
        this.rows = rows;
        this.complete = complete;
    }

    internal static NativeContextMenu? Show(GooView view, float x, float y, AndroidNativeMenuRow[] rows,
        Action<AndroidContextMenuStatus, string, string> complete)
    {
        Context? context = view.Context;
        while (context is ContextWrapper wrapper && context is not Activity && wrapper.BaseContext != context)
            context = wrapper.BaseContext;
        if (context is not GooActivity activity || !activity.OwnsNativeContextMenu(view))
        {
            complete(AndroidContextMenuStatus.Unsupported, "", "The Activity does not forward context-menu closure");
            return null;
        }
        if (activity.IsFinishing || activity.IsDestroyed || GooView.TryGetNativeOwner(view.Window) != view)
        {
            complete(AndroidContextMenuStatus.OwnerClosed, "", "");
            return null;
        }
        var session = new NativeContextMenu(view, activity, rows, complete);
        view.NativeContextMenu = session;
        view.SetOnCreateContextMenuListener(session);
        try
        {
            if (!view.ShowContextMenu(x * view.Density, y * view.Density))
                session.End(AndroidContextMenuStatus.Failed, "Android did not open the context menu");
        }
        catch (Java.Lang.RuntimeException exception)
        {
            session.End(AndroidContextMenuStatus.Failed, exception.Message ?? "Android context menu failed");
        }
        return session.ended ? null : session;
    }

    public void OnCreateContextMenu(IContextMenu? menu, View? source, IContextMenuContextMenuInfo? info)
    {
        if (ended || menu is null || source != view) return;
        try { Populate(menu, rows); }
        catch (Exception exception)
        {
            error = exception.Message;
            activity.CloseContextMenu();
        }
    }

    private void Populate(IMenu menu, AndroidNativeMenuRow[] items)
    {
        menu.SetGroupDividerEnabled(true);
        var group = 0;
        foreach (var row in items)
        {
            if (row.Separator) { group++; continue; }
            var id = ids.Count + 1;
            ids.Add(id, row.Id);
            IMenuItem item;
            if (row.Items.Length != 0)
            {
                var submenu = menu.AddSubMenu(group, id, IMenu.None, row.Text)!;
                item = submenu.Item!;
                Populate(submenu, row.Items);
            }
            else { item = menu.Add(group, id, IMenu.None, row.Text)!; }
            item.SetEnabled(row.Enabled);
            item.SetCheckable(row.Checked);
            item.SetChecked(row.Checked);
            if (row.Items.Length == 0) item.SetOnMenuItemClickListener(this);
        }
    }

    public bool OnMenuItemClick(IMenuItem? item)
    {
        if (ended || item is null || !item.IsEnabled || !ids.TryGetValue(item.ItemId, out var id)) return false;
        selected = id;
        return true;
    }

    internal void Closed()
    {
        if (activity.IsFinishing || activity.IsDestroyed) { End(AndroidContextMenuStatus.OwnerClosed, ""); return; }
        End(error != "" ? AndroidContextMenuStatus.Failed
            : selected != "" ? AndroidContextMenuStatus.Success : AndroidContextMenuStatus.Cancelled, error);
    }

    internal void OwnerClosed()
    {
        if (ended) return;
        End(AndroidContextMenuStatus.OwnerClosed, "");
        activity.CloseContextMenu();
    }

    private void End(AndroidContextMenuStatus status, string detail)
    {
        if (ended) return;
        ended = true;
        if (view.NativeContextMenu == this)
        {
            view.NativeContextMenu = null;
            view.SetOnCreateContextMenuListener(null);
        }
        complete(status, status == AndroidContextMenuStatus.Success ? selected : "", detail);
        Dispose();
    }
}
