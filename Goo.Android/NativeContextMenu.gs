package Goo.Android

import Android.App
import Android.Content
import Android.Views
import Java.Lang
import System
import System.Collections.Generic
import SystemException_2 = System.Exception

internal data class AndroidNativeMenuRow(
    Id string,
    Text string,
    Enabled bool,
    Checked bool,
    Separator bool,
    Items[]AndroidNativeMenuRow
) : IEquatable[AndroidNativeMenuRow] { }

internal enum AndroidContextMenuStatus {
    Success,
    Cancelled,
    Unsupported,
    OwnerClosed,
    Failed
}

internal class NativeContextMenu : Java
    .Lang
    .Object,
View.IOnCreateContextMenuListener,
IMenuItemOnMenuItemClickListener {
    private let view GooView
    private let activity GooActivity
    private let rows[]AndroidNativeMenuRow
    private let complete(AndroidContextMenuStatus, string, string) -> void
    private let ids Dictionary[int32, string] = Dictionary[int32, string]()
    private var selected string = ""
    private var error string = ""
    private var ended bool

    private init(
        view GooView,
        activity GooActivity,
        rows[]AndroidNativeMenuRow,
        complete(AndroidContextMenuStatus, string, string) -> void
    ) {
        this.view = view
        this.activity = activity
        this.rows = rows
        this.complete = complete
    }

    func OnCreateContextMenu(menu IContextMenu?, source View?, info IContextMenuContextMenuInfo?) {
        if ended || menu == nil || source != view {
            return
        }
        try {
            Populate(menu, rows)
        } catch (exception SystemException_2) {
            error = exception.Message
            activity.CloseContextMenu()
        }
    }

    private func Populate(menu IMenu, items[]AndroidNativeMenuRow) {
        menu.SetGroupDividerEnabled(true)
        var group = 0
        for row in items {
            if row.Separator {
                group++
                continue
            }
            let id = ids.Count + 1
            ids.Add(id, row.Id)
            var item IMenuItem
            if row.Items.Length != 0 {
                let submenu = menu.AddSubMenu(group, id, IMenu.None, row.Text)!!
                item = submenu.Item!!
                Populate(submenu, row.Items)
            } else {
                item = menu.Add(group, id, IMenu.None, row.Text)!!
            }
            item.SetEnabled(row.Enabled)
            item.SetCheckable(row.Checked)
            item.SetChecked(row.Checked)
            if row.Items.Length == 0 {
                item.SetOnMenuItemClickListener(this)
            }
        }
    }

    func OnMenuItemClick(item IMenuItem?) bool {
        if ended || item == nil || !item.IsEnabled || !ids.TryGetValue(item.ItemId, out var id) {
            return false
        }
        selected = id
        return true
    }

    internal func Closed() {
        if activity.IsFinishing || activity.IsDestroyed {
            End(AndroidContextMenuStatus.OwnerClosed, "")
            return
        }
        End(
            if error != "" {
                AndroidContextMenuStatus.Failed
            } else {
                (
                    if selected != "" {
                        AndroidContextMenuStatus.Success
                    } else {
                        AndroidContextMenuStatus.Cancelled
                    }
                )
            },
            error
        )
    }

    internal func OwnerClosed() {
        if ended {
            return
        }
        End(AndroidContextMenuStatus.OwnerClosed, "")
        activity.CloseContextMenu()
    }

    private func End(status AndroidContextMenuStatus, detail string) {
        if ended {
            return
        }
        ended = true
        if view.NativeContextMenu == this {
            this.view.NativeContextMenu = nil
            view.SetOnCreateContextMenuListener(nil)
        }
        complete(
            status,
            if status == AndroidContextMenuStatus.Success {
                selected
            } else {
                ""
            },
            detail
        )
        Dispose()
    }

    shared {
        internal func Show(
            view GooView,
            x float32,
            y float32,
            rows[]AndroidNativeMenuRow,
            complete(AndroidContextMenuStatus, string, string) -> void
        ) NativeContextMenu? {
            var context Context? = view.Context
            while context is ContextWrapper wrapper && !(context is Activity) && wrapper.BaseContext != context {
                context = wrapper.BaseContext
            }
            if context is not GooActivity activity || !activity.OwnsNativeContextMenu(view) {
                complete(AndroidContextMenuStatus.Unsupported, "", "The Activity does not forward context-menu closure")
                return nil
            }
            if activity.IsFinishing || activity.IsDestroyed || GooView.TryGetNativeOwner(view.Window) != view {
                complete(AndroidContextMenuStatus.OwnerClosed, "", "")
                return nil
            }
            let session = NativeContextMenu(view, activity, rows, complete)
            view.NativeContextMenu = session
            view.SetOnCreateContextMenuListener(session)
            try {
                if !view.ShowContextMenu(x * view.Density, y * view.Density) {
                    session.End(AndroidContextMenuStatus.Failed, "Android did not open the context menu")
                }
            } catch (exception RuntimeException) {
                session.End(AndroidContextMenuStatus.Failed, exception.Message ?? "Android context menu failed")
            }
            return if session.ended {
                default(NativeContextMenu?)
            } else {
                session
            }
        }
    }
}
