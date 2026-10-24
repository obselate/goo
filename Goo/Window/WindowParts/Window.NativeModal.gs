package Goo

import System
import System.Threading
import System.Threading.Tasks

internal enum NativeModalStatus { Accepted; Busy; OwnerClosed }

internal sealed class NativeModalLease : IDisposable {
    private var owner Window?
    private var completion Action?
    internal let SDLWindow nint
    internal var Closing Action?
    internal prop IsOwnerClosing bool { get -> owner == nil || owner!!.NativeOwnerClosing }
    internal prop HasCompletion bool { get -> completion != nil }

    internal init(owner Window, window nint) {
        this.owner = owner
        SDLWindow = window
    }

    internal func PostCompletion(action Action) {
        guard let current = owner else { return }
        current.RequireNativeServiceThread()
        completion = action
        current.WakeNativeModalCompletion()
    }

    internal func DrainCompletion() {
        let action = completion
        completion = nil
        action?.Invoke()
    }

    public func Dispose() {
        guard let current = owner else { return }
        current.RequireNativeServiceThread()
        owner = nil
        Closing = nil
        completion = nil
        current.EndNativeModal(this)
    }
}

/// Coordinates first-party native owner lifetimes and modal input.
public partial class Window {
    private var nativeModal NativeModalLease?
    private var nativeModalFocus WeakReference?
    private var nativeModalClosePending bool
    private var nativeWindowGeneration int64
    internal var NativeWindowClosing Action?
    internal var NativeMessageBox Func[Window, MessageBoxOptions, Action[MessageBoxResult], IDisposable?]?
    internal var NativeContextMenu Func[Window, Point, NativeMenuSnapshot, Task[NativeMenuResult]]?
    internal prop NativeWindowGeneration int64 { get -> nativeWindowGeneration }
    internal prop NativeOwnerClosing bool { get -> nativeModalClosePending || !IsOpen || host?.IsClosing == true
        || family?.Closing == true || Interlocked.CompareExchange(&closeRequested, 0, 0) != 0 }

    internal func RequireNativeServiceThread() -> requireUiThread("Native window service")
    internal func WakeNativeModalCompletion() -> host?.Wake()

    internal func BorrowNativeWindow() nint {
        RequireNativeServiceThread()
        if !IsOpen { throw InvalidOperationException("A native service requires an open owner") }
        return (host as SdlHost)?.WindowHandle ?? 0
    }

    internal func BeginNativeModal(out status NativeModalStatus) NativeModalLease? {
        status = NativeModalStatus.OwnerClosed
        RequireNativeServiceThread()
        if !IsOpen { throw InvalidOperationException("A native service requires an open owner") }
        if NativeOwnerClosing {
            return nil
        }
        var root = this
        while root.Owner != nil { root = root.Owner!! }
        if IsInputBlocked || root.hasNativeModalInTree() {
            status = NativeModalStatus.Busy
            return nil
        }
        if HasChildPopup {
            DismissChildPopups(PopupDismissReason.OutsideInteraction)
            status = NativeModalStatus.Busy
            return nil
        }
        let lease = NativeModalLease(this, BorrowNativeWindow())
        nativeModal = lease
        try {
            if let focused = input.FocusedNode() { nativeModalFocus = WeakReference(focused) }
            input.Reset(node, resolver)
            input.FocusLost(node, resolver)
            RefreshPlatformInput()
            accessibility?.MarkDirty()
            requestRender()
            status = NativeModalStatus.Accepted
            return lease
        } catch (_ Exception) {
            nativeModal = nil
            nativeModalFocus = nil
            rethrow
        }
    }

    internal func EndNativeModal(lease NativeModalLease) {
        if !Object.ReferenceEquals(nativeModal, lease) { return }
        nativeModal = nil
        let previous = nativeModalFocus
        nativeModalFocus = nil
        host?.PollEvents()
        input.Reset(node, resolver)
        if IsFocused { input.FocusGained() }
        if nativeModalClosePending || host?.IsClosing == true || drainCloseRequest() {
            nativeModalClosePending = false
            Close()
            return
        }
        RefreshPlatformInput()
        accessibility?.MarkDirty()
        if IsOpen && IsVisible && IsFocused && !IsInputBlocked {
            if let focused = previous?.Target as Node? {
                if !focused.Retired { FocusElement(focused) }
            }
            requestRender()
        }
    }

    private func hasNativeModalInTree() bool {
        if nativeModal != nil { return true }
        if let children = family?.Children {
            for child in children { if child.hasNativeModalInTree() { return true } }
        }
        return false
    }

    private func closeNativeModal() bool {
        if let lease = nativeModal {
            if !nativeModalClosePending {
                nativeModalClosePending = true
                lease.Closing?.Invoke()
            }
            if family?.Dialog != nil { closeFileDialog() }
            return false
        }
        let closing = NativeWindowClosing
        NativeWindowClosing = nil
        nativeWindowGeneration++
        closing?.Invoke()
        return true
    }
}
