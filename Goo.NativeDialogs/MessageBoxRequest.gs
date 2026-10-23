package Goo

import System
import System.Threading.Tasks

internal sealed partial class MessageBoxRequest {
    private let owner Window
    private let lease NativeModalLease
    private let options MessageBoxOptions
    private let completion TaskCompletionSource[MessageBoxResult] = TaskCompletionSource[MessageBoxResult](TaskCreationOptions.RunContinuationsAsynchronously)
    private var started bool
    private var finished bool
    private var nativeDialog IDisposable?
    internal prop Task Task[MessageBoxResult] { get -> completion.Task }

    internal init(owner Window, lease NativeModalLease, options MessageBoxOptions) {
        this.owner = owner
        this.lease = lease
        this.options = options
        lease.Closing = Closing
    }

    internal func Post() {
        if !owner.TryPost(Launch) { Finish(MessageBoxResult(MessageBoxStatus.OwnerClosed)) }
    }

    private func Closing() {
        if !started { Finish(MessageBoxResult(MessageBoxStatus.OwnerClosed)) }
        else { nativeDialog?.Dispose() }
    }

    private func Launch() {
        if finished { return }
        if lease.IsOwnerClosing {
            Finish(MessageBoxResult(MessageBoxStatus.OwnerClosed))
            return
        }
        started = true
        try { Show() }
        catch (error DllNotFoundException) { Finish(MessageBoxResult(MessageBoxStatus.Unsupported, error: error.Message)) }
        catch (error EntryPointNotFoundException) { Finish(MessageBoxResult(MessageBoxStatus.Unsupported, error: error.Message)) }
        catch (error Exception) { Finish(MessageBoxResult(MessageBoxStatus.Failed, error: error.Message)) }
    }

    private func Finish(result MessageBoxResult) {
        if finished { return }
        finished = true
        let closing = lease.IsOwnerClosing
        var outcome = result
        try {
            nativeDialog?.Dispose()
            nativeDialog = nil
            lease.Dispose()
        } catch (error Exception) {
            outcome = MessageBoxResult(MessageBoxStatus.Failed, error: error.Message)
        }
        completion.TrySetResult(if closing || !owner.IsOpen { MessageBoxResult(MessageBoxStatus.OwnerClosed) } else { outcome })
    }
}
