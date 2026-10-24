package GooAndroidSmokeApp

import Android.App
import Android.Util
import Goo
import Goo.Android
import System
import System.Threading.Tasks

internal shared class AndroidNativeMenuSmoke {
    internal func TryRun(view GooView, ownerActivity Activity? = nil, relaunch bool = false) bool {
        if !view.IsAttachedToWindow || view.Width == 0 || view.Height == 0 {
            return false
        }
        if ownerActivity != nil {
            let reason = if relaunch { "activity-relaunch" } else { "activity-close" }
            let closing = NativeMenus.ShowContextMenuAsync(
                view.Window,
                Point(),
                []NativeMenuItem{NativeMenuItem{Id: "finish", Text: "Activity closes this menu"}}
            )
            closing.ContinueWith(
                (task Task[NativeMenuResult]) -> Log.Info(
                    "GooNativeMenus",
                    if task.Result.Status == NativeMenuStatus.OwnerClosed {
                        "passed " + reason
                    } else {
                        "failed " + reason + " " + task.Result.Status.ToString()
                    }
                )
            )
            view.PostDelayed(
                () -> {
                    if relaunch { ownerActivity.Recreate() } else { ownerActivity.Finish() }
                },
                500
            )
            return true
        }
        using let bar = NativeMenuBar(view.Window)
        Check(
            bar.SetItems([]NativeMenuItem{}).Status == NativeMenuStatus.Unsupported,
            "Android desktop bar must be unsupported"
        )
        let shortcut = NativeMenus.ShowContextMenuAsync(
            view.Window,
            Point(),
            []NativeMenuItem{
                NativeMenuItem{
                    Id: "shortcut",
                    Text: "Shortcut",
                    Shortcut: NativeMenuShortcut{Key: "s", Modifiers: KeyModifiers{Ctrl: true}}
                }
            }
        )
        Check(
            shortcut.IsCompleted && shortcut.Result.Status == NativeMenuStatus.Unsupported,
            "Android shortcuts must be rejected"
        )
        let selected = NativeMenus.ShowContextMenuAsync(
            view.Window,
            Point{X: 12.0, Y: 20.0},
            []NativeMenuItem{
                NativeMenuItem{
                    Id: "actions",
                    Text: "Actions",
                    Items: []NativeMenuItem{
                        NativeMenuItem{Id: "select", Text: "Select", Checked: true},
                        NativeMenuItem{Separator: true},
                        NativeMenuItem{Id: "disabled", Text: "Disabled", Enabled: false}
                    }
                }
            }
        )
        Check(
            NativeMenus
                .ShowContextMenuAsync(view.Window, Point(), []NativeMenuItem{})
                .Result
                .Status == NativeMenuStatus.Busy,
            "Conflicting context menu must be Busy"
        )
        Log.Info("GooNativeMenus", "selection-ready")
        selected.ContinueWith(
            (task Task[NativeMenuResult]) -> view.Post(
                () -> {
                    Check(
                        task.Result.Status == NativeMenuStatus.Success && task.Result.ItemId == "select",
                        "Native selection ID"
                    )
                    let cancelled = NativeMenus.ShowContextMenuAsync(
                        view.Window,
                        Point(),
                        []NativeMenuItem{NativeMenuItem{Id: "cancel", Text: "Cancel this menu with Back"}}
                    )
                    Log.Info("GooNativeMenus", "cancellation-ready")
                    cancelled.ContinueWith(
                        (result Task[NativeMenuResult]) -> view.Post(
                            () -> {
                                Check(
                                    result.Result.Status == NativeMenuStatus.Cancelled && result.Result.ItemId == "",
                                    "Native cancellation"
                                )
                                let closing = NativeMenus.ShowContextMenuAsync(
                                    view.Window,
                                    Point(),
                                    []NativeMenuItem{NativeMenuItem{Id: "close", Text: "Owner closes this menu"}}
                                )
                                view.Window.TryPost(() -> view.Window.RequestClose())
                                closing.ContinueWith(
                                    (closed Task[NativeMenuResult]) -> view.Post(
                                        () -> {
                                            Check(
                                                closed.Result.Status == NativeMenuStatus.OwnerClosed,
                                                "Owner-close completion"
                                            )
                                            Log.Info(
                                                "GooNativeMenus",
                                                "passed selection cancellation busy shortcuts owner-close"
                                            )
                                        }
                                    )
                                )
                            }
                        )
                    )
                }
            )
        )
        return true
    }

    private func Check(condition bool, message string) {
        if !condition {
            throw InvalidOperationException(message)
        }
    }
}
