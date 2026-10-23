package GooPackageSmoke

import Goo
import System

func RunNativeDialogsSmoke() {
    let owner = Window{ Title: "Native dialog owner", Width: 160, Height: 90, Root: Cell{} }
    let options = MessageBoxOptions{ Title: "Native dialog smoke", Buttons: []MessageBoxButton{
        MessageBoxButton{ Id: 7, Text: "Accept", Default: true },
        MessageBoxButton{ Id: 9, Text: "Cancel", Cancel: true },
    } }
    try {
        owner.Open()
        owner.Pump(0.0)
        let pending = NativeDialogs.ShowMessageBoxAsync(owner, options)
        if OperatingSystem.IsLinux() {
            if !pending.IsCompleted || pending.Result.Status != MessageBoxStatus.Unsupported
                || pending.Result.ButtonId != -1 || owner.IsInputBlocked {
                throw InvalidOperationException("Wayland must reject owned message boxes without blocking the owner")
            }
        } else {
            if pending.IsCompleted || !owner.IsInputBlocked {
                throw InvalidOperationException("Native display must be posted after the modal lease is acquired")
            }
            let busy = NativeDialogs.ShowMessageBoxAsync(owner, options).Result
            if busy.Status != MessageBoxStatus.Busy || busy.ButtonId != -1 {
                throw InvalidOperationException("An accepted native modal operation must block a second operation")
            }
            var callbackRan = false
            owner.Post(() -> { callbackRan = true })
            if !CloseWindow(owner) || !pending.IsCompleted || pending.Result.Status != MessageBoxStatus.OwnerClosed
                || pending.Result.ButtonId != -1 || callbackRan {
                throw InvalidOperationException("Owner close must complete the pending box before queued application actions")
            }
        }
    } finally {
        if !CloseWindow(owner) { throw InvalidOperationException("Native dialog smoke owner did not close") }
    }
    Console.WriteLine("native-dialogs: owned platform result and modal launch lifetime passed")
}
