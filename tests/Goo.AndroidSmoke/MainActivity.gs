package GooAndroidSmokeApp

import Android.App
import Android.Content.PM
import Android.Util
import Goo
import Goo.Android
import GooAndroidSmoke
import System

@Activity(
    Name = "org.goo.androidsmoke.MainActivity",
    Label = "Goo Vulkan smoke",
    MainLauncher = true,
    Exported = true,
    ConfigurationChanges = ConfigChanges.Density | ConfigChanges.SmallestScreenSize | ConfigChanges.ScreenSize | ConfigChanges.ScreenLayout | ConfigChanges.Orientation | ConfigChanges.KeyboardHidden
)
class MainActivity : GooActivity {
    private var inputSmokeStarted bool
    private var menuSmokeStarted bool
    private var nativeDialogSmokeStarted bool
    private var popupSmokeStarted bool
    internal prop NativeView GooView -> GooView
    protected override func CreateWindow() Window -> if Intent?.GetBooleanExtra("goo.gesture_smoke", false) == true {
        Window{Root: GestureCheckScene(), Background: Color.Rgb(17, 24, 39)}
    } else {
        SmokeApplication.CreateWindow()
    }

    protected override func OnResume() {
        base.OnResume()
        if !popupSmokeStarted && Intent?.GetBooleanExtra("goo.popup_smoke", false) == true {
            popupSmokeStarted = true
            GooView.PostDelayed(() -> RunPopupSmoke(0), 100)
        } else if !inputSmokeStarted && Intent?.GetBooleanExtra("goo.input_smoke", false) == true {
            inputSmokeStarted = true
            GooView.PostDelayed(() -> RunInputSmoke(0), 100)
        }
        if !nativeDialogSmokeStarted && Intent?.GetBooleanExtra("goo.native_dialogs_smoke", false) == true {
            nativeDialogSmokeStarted = true
            GooView.PostDelayed(() -> RunNativeDialogSmoke(0), 100)
        }
        if !menuSmokeStarted && Intent?.GetBooleanExtra("goo.native_menu_smoke", false) == true {
            menuSmokeStarted = true
            GooView.PostDelayed(() -> RunMenuSmoke(0), 100)
        }
    }

    protected override func OnDestroy() {
        base.OnDestroy()
        if Intent?.GetBooleanExtra("goo.native_menu_destroy", false) == true {
            Log.Info("GooNativeMenus", "activity-destroyed")
        }
    }

    private async func RunNativeDialogSmoke(attempt int32) void {
        if IsFinishing || IsDestroyed {
            return
        }
        if !GooView.Window.IsVisible {
            if attempt >= 100 {
                throw InvalidOperationException("Android native dialog smoke did not receive a visible owner.")
            }
            GooView.PostDelayed(() -> RunNativeDialogSmoke(attempt + 1), 100)
            return
        }
        await AndroidNativeDialogSmoke.Run(GooView)
    }

    private func RunInputSmoke(attempt int32) {
        if IsFinishing || IsDestroyed {
            return
        }
        if AndroidInputSmoke.TryRun(GooView) {
            return
        }
        if attempt >= 100 {
            throw InvalidOperationException("Android input smoke did not receive a mounted editor.")
        }
        GooView.PostDelayed(() -> RunInputSmoke(attempt + 1), 100)
    }

    private func RunMenuSmoke(attempt int32) {
        if IsFinishing || IsDestroyed {
            return
        }
        if AndroidNativeMenuSmoke.TryRun(
            GooView,
            if Intent?.GetBooleanExtra("goo.native_menu_destroy", false) == true {
                this
            } else {
                default(MainActivity?)
            }
        ) {
            return
        }
        if attempt >= 100 {
            throw InvalidOperationException("Android native menu owner did not attach.")
        }
        GooView.PostDelayed(() -> RunMenuSmoke(attempt + 1), 100)
    }

    private func RunPopupSmoke(attempt int32) {
        if IsFinishing || IsDestroyed {
            return
        }
        if AndroidPopupSmoke.TryRun(GooView) {
            return
        }
        if attempt >= 100 {
            throw InvalidOperationException("Android popup smoke did not receive a presentation surface.")
        }
        GooView.PostDelayed(() -> RunPopupSmoke(attempt + 1), 100)
    }
}
