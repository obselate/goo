package Goo

import System
import Goo.Android

internal sealed class AndroidMessageBox {
    shared {
        internal func Show(owner Window, options MessageBoxOptions, complete Action[MessageBoxResult]) IDisposable? {
            let ids = [options.Buttons.Count]int32
            let labels = [options.Buttons.Count]string
            for i in 0 ... ids.Length {
                ids[i] = options.Buttons[i].Id
                labels[i] = options.Buttons[i].Text
            }
            return NativeMessageBox.Show(owner, options.Title, options.Message, int32(options.Icon), ids, labels,
                (status int32, id int32, error string) -> {
                    let outcome = switch status {
                        case 0: MessageBoxStatus.Success
                        case 1: MessageBoxStatus.Cancelled
                        case 2: MessageBoxStatus.OwnerClosed
                        default: MessageBoxStatus.Failed
                    }
                    complete(MessageBoxResult(outcome, id, error))
                })
        }
    }
}
