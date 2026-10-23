package Goo

import System
import System.Threading

internal enum NativeModalStatus { Accepted; Busy; OwnerClosed }

internal sealed class NativeModalLease : IDisposable {
    private var owner Window?
    internal let SDLWindow nint
    internal var Closing Action?
    internal prop IsOwnerClosing bool { get -> owner == nil || owner!!.NativeOwnerClosing }

    internal init(owner Window, window nint) {
        this.owner = owner
        SDLWindow = window
    }

    public func Dispose() {
        guard let current = owner else { return }
        current.RequireNativeServiceThread()
        owner = nil
        Closing = nil
        current.EndNativeModal(this)
    }
}

/// Hosts owner-modal operations from optional native service packages.
public partial class Window {
    private var nativeModal NativeModalLease?
    private var nativeModalFocus WeakReference?
    private var nativeModalClosePending bool
    private var nativeWindowGeneration int64
    internal var NativeWindowClosing Action?
    internal prop NativeWindowGeneration int64 { get -> nativeWindowGeneration }
    internal prop NativeOwnerClosing bool { get -> nativeModalClosePending || !IsOpen || host?.IsClosing == true
        || family?.Closing == true || Interlocked.CompareExchange(&closeRequested, 0, 0) != 0 }

    internal func RequireNativeServiceThread() -> requireUiThread("Native window service")

    internal func BorrowNativeWindow() nint {
        RequireNativeServiceThread()
        if !IsOpen { throw InvalidOperationException("A native service requires an open owner") }
        return (host as SdlHost)?.WindowHandle ?? 0
    }

    internal func BeginNativeModal(out status NativeModalStatus) NativeModalLease? {
        RequireNativeServiceThread()
        if !IsOpen { throw InvalidOperationException("A native service requires an open owner") }
        if NativeOwnerClosing {
            status = NativeModalStatus.OwnerClosed
            return nil
        }
        if IsInputBlocked {
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
        if let focused = input.FocusedNode() { nativeModalFocus = WeakReference(focused) }
        input.Reset(node, resolver)
        input.FocusLost(node, resolver)
        RefreshPlatformInput()
        accessibility?.MarkDirty()
        requestRender()
        status = NativeModalStatus.Accepted
        return lease
    }

    internal func EndNativeModal(lease NativeModalLease) {
        if !Object.ReferenceEquals(nativeModal, lease) { return }
        nativeModal = nil
        let previous = nativeModalFocus
        nativeModalFocus = nil
        host?.PollEvents()
        input.Reset(node, resolver)
        if IsFocused { input.FocusGained() }
        if nativeModalClosePending || drainCloseRequest() {
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
