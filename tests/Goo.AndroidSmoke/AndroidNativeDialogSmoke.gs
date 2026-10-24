package GooAndroidSmokeApp

import Android.Util
import Goo
import Goo.Android
import System

internal shared class AndroidNativeDialogSmoke {
    internal async func Run(view GooView) {
        try {
            let owner = view.Window
            let Options = (buttons ...MessageBoxButton) -> {
                return MessageBoxOptions{
                    Title: "Goo native dialog smoke",
                    Message: "Native AlertDialog verification",
                    Buttons: buttons
                }
            }
            let choose = MessageBoxButton{Id: 17, Text: "CHOOSE17"}
            let cancel = MessageBoxButton{Id: 29, Text: "CANCEL29"}
            let options = Options(choose, cancel)
            Log.Info("GooNativeDialogs", "stage:choose17")
            var result = await NativeDialogs.ShowMessageBoxAsync(owner, options)
            Require(result, MessageBoxStatus.Success, 17)
            Log.Info("GooNativeDialogs", "stage:cancel29")
            result = await NativeDialogs.ShowMessageBoxAsync(owner, options)
            Require(result, MessageBoxStatus.Success, 29)
            Log.Info("GooNativeDialogs", "stage:back")
            result = await NativeDialogs.ShowMessageBoxAsync(owner, options)
            Require(result, MessageBoxStatus.Cancelled)
            result = await NativeDialogs.ShowMessageBoxAsync(
                owner,
                Options(choose, cancel, MessageBoxButton{Id: 3, Text: "Three"}, MessageBoxButton{Id: 4, Text: "Four"})
            )
            Require(result, MessageBoxStatus.Unsupported)
            result = await NativeDialogs.ShowMessageBoxAsync(
                owner,
                Options(MessageBoxButton{Id: 5, Text: "Default", Default: true})
            )
            Require(result, MessageBoxStatus.Unsupported)
            let pending = NativeDialogs.ShowMessageBoxAsync(owner, options)
            Require(await NativeDialogs.ShowMessageBoxAsync(owner, options), MessageBoxStatus.Busy)
            view.PostDelayed(owner.RequestClose, 200)
            Require(await pending, MessageBoxStatus.OwnerClosed)
            Log.Info("GooNativeDialogs", "PASS:selection,cancel-button,back,unsupported,busy,owner-close")
        } catch (error Exception) {
            Log.Error("GooNativeDialogs", "FAIL:" + error.ToString())
            rethrow
        }
    }

    private func Require(result MessageBoxResult, status MessageBoxStatus, id int32 = -1) {
        if result.Status != status || result.ButtonId != id {
            throw InvalidOperationException(
                "Expected $status/$id, received ${result.Status}/${result.ButtonId}: ${result.Error}"
            )
        }
    }
}
