package GooAndroidSmokeApp

import Android.Util
import Goo
import Goo.Android
import GooAndroidSmoke
import PopupWindow = Goo.PopupWindow
import System

internal shared class AndroidPopupSmoke {
    internal func TryRun(view GooView) bool {
        if !view.Window.IsVisible || view.Width <= 0 || view.Height <= 0 {
            return false
        }
        let originalScale = view.Window.UiScale
        let density = Math.Max(view.Resources?.DisplayMetrics?.Density ?? 1f, 0.1f)
        var stage = 0
        let AttachMenu = (shown Window) -> {
            var presented = false
            let PauseWhenReady = () -> {
                if stage != 3 || !presented || !shown.IsFocused {
                    return
                }
                stage = 4
                view.Pause()
            }
            shown.PresentationAccepted += (_ WindowPresentationAccepted) -> {
                presented = true
                PauseWhenReady()
            }
            shown.FocusChanged += (_ bool) -> PauseWhenReady()
        }
        var nestedClosed = false
        var completed = false
        let OpenMenu = () -> {
            let menu = PopupWindow(view.Window, SmokeApplication.CreatePopupRoot(AttachMenu), PopupKind.Menu)
            menu.Dismissed += (reason PopupDismissReason) -> {
                Require(
                    reason == PopupDismissReason.OwnerHidden && !menu.IsOpen,
                    "Owner pause left a native menu open."
                )
                menu.Dispose()
                view.Resume()
                view.Window.UiScale = originalScale
                completed = true
                Log.Info(
                    "GooPopupSmoke",
                    "PASS tooltip_render scale placement nested_close menu_focus owner_pause teardown"
                )
            }
            Require(menu.Open(Anchor(8.0), 120, 80).Status == PopupStatus.Opened, "Native menu popup did not open.")
        }
        var tooltip PopupWindow? = nil
        var nested PopupWindow? = nil
        let Logical = (size int32) -> int32(
            Math.Round(Math.Ceiling(float64(size) * float64(density)) / float64(density))
        )
        let AttachTooltip Action[Window] = (shown Window) -> {
            shown.PresentationAccepted += (_ WindowPresentationAccepted) -> {
                if tooltip is not{} current || stage > 1 {
                    return
                }
                let metrics = current.Metrics
                if stage == 0 {
                    Require(
                        metrics.LogicalWidth == Logical(180) &&
                            metrics.LogicalHeight == Logical(120) &&
                            metrics.FramebufferWidth > 0 &&
                            !shown.IsFocused,
                        "Tooltip scale or passive rendering failed."
                    )
                    stage = 1
                    Require(
                        current.UpdatePlacement(Anchor(12.0), 160, 90) == WindowOperationResult.Accepted,
                        "Popup placement update failed."
                    )
                    return
                }
                if metrics.LogicalWidth != Logical(240) || metrics.LogicalHeight != Logical(135) {
                    return
                }
                stage = 2
                nested = PopupWindow(
                    current,
                    SmokeApplication.CreatePopupRoot(
                        (child Window) -> {
                            child.PresentationAccepted += (_ WindowPresentationAccepted) -> {
                                if stage != 2 {
                                    return
                                }
                                stage = 3
                                current.Close()
                            }
                        }
                    ),
                    PopupKind.Tooltip
                )
                nested.Dismissed += (reason PopupDismissReason) -> {
                    Require(reason == PopupDismissReason.Programmatic, "Nested popup lost its dismissal reason.")
                    nestedClosed = true
                }
                Require(nested.Open(Anchor(4.0), 60, 40).Status == PopupStatus.Opened, "Nested tooltip did not open.")
            }
        }
        view.Window.UiScale = 1.5f
        view.Window.SetTimeout(() -> Require(completed, "Android popup lifecycle timed out."), 15000.0)
        tooltip = PopupWindow(view.Window, SmokeApplication.CreatePopupRoot(AttachTooltip), PopupKind.Tooltip)
        tooltip.Dismissed += (reason PopupDismissReason) -> {
            Require(
                reason == PopupDismissReason.Programmatic && nestedClosed && nested?.IsOpen == false,
                "Nested popup did not retire before its parent."
            )
            nested?.Dispose()
            tooltip!!.Dispose()
            OpenMenu()
        }
        Require(tooltip.Open(Anchor(8.0), 120, 80).Status == PopupStatus.Opened, "Tooltip did not open.")
        return true
    }

    private func Anchor(value float64) ElementRect -> ElementRect{X: value, Y: value, Width: 4.0, Height: 4.0}

    private func Require(value bool, message string) {
        if !value {
            throw InvalidOperationException(message)
        }
    }
}
