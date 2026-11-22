package Goo

import Hexa.NET.SDL3
import System
import System.Collections.Generic
import System.Runtime.InteropServices
import System.Threading.Tasks

/// Owns a Wayland session lock on Goo's display connection, including an inherited WAYLAND_SOCKET.
/// Use this API on the UI thread. The app must authenticate the user before it requests unlock.
public unsafe class SessionLock : IDisposable {
    private let protocol WaylandSessionLock
    private let windows Dictionary[WindowDisplayId, Window] = Dictionary[WindowDisplayId, Window]()
    private let removedWindows List[Window] = List[Window]()
    private var factory Func[WindowDisplay, Window]?
    private var unlock TaskCompletionSource[bool]?
    private var running bool
    private var stopping bool
    private var disposed bool
    private var lockNotified bool
    private var unlockSent bool
    private var outputsChanged bool = true
    private var layoutChanged bool = true
    private var keymapChanged bool

    /// Opens the Wayland connection if needed and checks that the compositor supports session lock.
    /// @exception NotSupportedException when the host is not Wayland or the compositor does not advertise ext_session_lock_manager_v1.
    /// @exception InvalidOperationException when another SessionLock already owns the connection.
    public init() {
        if !OperatingSystem.IsLinux() { throw NotSupportedException("Session lock requires Wayland") }
        SdlRuntime.RequireMainThread("SessionLock")
        if SdlRuntime.LockSession != nil { throw InvalidOperationException("A session lock already owns the Wayland connection") }
        SdlRuntime.Acquire()
        try {
            if !SdlHost.IsWayland() { throw NotSupportedException("Session lock requires Wayland") }
            protocol = WaylandSessionLock(nint(SDL.GetPointerProperty(SDL.GetGlobalProperties(),
                "SDL.video.wayland.wl_display", nil)))
            SdlRuntime.LockSession = this
        } catch (_ Exception) {
            SdlRuntime.Release()
            rethrow
        }
    }

    /// Occurs when the compositor confirms that the session is locked.
    public event Locked Action?

    /// Occurs when the compositor rejects or ends this lock. It does not authorize an unlock request.
    public event Finished Action?

    /// Gets the current XKB layout name, or nil if the keyboard has no name or is unavailable.
    public prop KeyboardLayoutName string? { get; private set; }

    /// Occurs when the active XKB keyboard layout or keymap changes.
    public event KeyboardLayoutChanged Action?

    /// Requests the lock and runs the UI loop until unlock, compositor finish, or a lock window closes.
    /// Goo opens and closes one window per Wayland output, including outputs added or removed during the lock.
    /// @param createWindow Creates a fresh, visible, focusable desktop window for an output. The compositor sets its size.
    /// @exception InvalidOperationException when the compositor rejects the lock or the connection is lost.
    public func Run(createWindow Func[WindowDisplay, Window]) {
        SdlRuntime.RequireMainThread("SessionLock.Run")
        ObjectDisposedException.ThrowIf(disposed, this)
        if running { throw InvalidOperationException("The session lock is already running") }
        if createWindow == nil { throw ArgumentNullException("createWindow") }
        factory = createWindow
        running = true
        try {
            protocol.Start()
            RefreshOutputs()
            Window.RunLiveWindowScheduler(this)
        } catch (error Exception) {
            unlock?.TrySetException(error)
            rethrow
        } finally {
            running = false
            Dispose()
        }
    }

    /// Requests unlock. Call on the UI thread only after Locked and successful authentication.
    /// @returns A task that completes after the compositor processes unlock and lock surface removal.
    /// @exception InvalidOperationException when the compositor has not confirmed the lock or the lock has ended.
    public func UnlockAsync() Task {
        SdlRuntime.RequireMainThread("SessionLock.UnlockAsync")
        if !running || stopping || protocol.Finished || !protocol.Locked {
            throw InvalidOperationException("Only an active, confirmed session lock can be unlocked")
        }
        if unlock == nil {
            unlock = TaskCompletionSource[bool]()
            for (_, window) in windows { window.LockSurface!!.StopPresenting() }
            SdlRuntime.Wake()
        }
        return unlock!!.Task
    }

    /// Closes any lock windows and releases this owner without authorizing unlock.
    public func Dispose() {
        if disposed { return }
        SdlRuntime.RequireMainThread("SessionLock.Dispose")
        stopping = true
        if running {
            SdlRuntime.Wake()
            return
        }
        disposed = true
        if unlock?.Task.IsCompleted == false {
            unlock!!.TrySetException(InvalidOperationException("The session lock ended before unlock was acknowledged"))
        }
        var closeError Exception?
        try {
            for (_, window) in windows { closeError = CloseWindow(window, closeError) }
            for window in removedWindows { closeError = CloseWindow(window, closeError) }
        } finally {
            windows.Clear()
            removedWindows.Clear()
            factory = nil
            SdlRuntime.LockSession = nil
            try { protocol.Dispose() } finally { SdlRuntime.Release() }
        }
        if let error = closeError { System.Runtime.ExceptionServices.ExceptionDispatchInfo.Capture(error).Throw() }
    }

    internal func HandleEvent(eventType SDLEventType) {
        if eventType == SDLEventType.DisplayAdded || eventType == SDLEventType.DisplayRemoved { outputsChanged = true }
        if eventType == SDLEventType.KeymapChanged { keymapChanged = true }
        if eventType == SDLEventType.KeymapChanged || eventType == SDLEventType.WindowFocusGained ||
            eventType == SDLEventType.WindowFocusLost || eventType == SDLEventType.KeyboardAdded ||
            eventType == SDLEventType.KeyboardRemoved { layoutChanged = true }
    }

    internal func Service() bool {
        if stopping { return false }
        protocol.Pump()
        if protocol.Finished {
            if !protocol.Locked { protocol.Reject() }
            Finished?.Invoke()
            if !protocol.Locked { throw InvalidOperationException("The Wayland compositor rejected the session lock") }
            return false
        }
        if protocol.Synced {
            unlock!!.TrySetResult(true)
            return false
        }
        if unlock != nil {
            if !unlockSent && !HasPendingPresentation() {
                protocol.Unlock()
                for (_, window) in windows { window.LockSurface!!.Dispose() }
                protocol.BeginSync()
                unlockSent = true
            }
            return true
        }
        if outputsChanged { RefreshOutputs() }
        if layoutChanged {
            layoutChanged = false
            let name = Marshal.PtrToStringUTF8(GetKeyboardLayoutName())
            let changed = keymapChanged || name != KeyboardLayoutName
            keymapChanged = false
            KeyboardLayoutName = name
            if changed { KeyboardLayoutChanged?.Invoke() }
        }
        if protocol.Locked && !lockNotified {
            lockNotified = true
            Locked?.Invoke()
        }
        if removedWindows.Count != 0 { removedWindows.RemoveAll((window Window) -> !window.IsOpen) }
        for (_, window) in windows {
            if !window.IsOpen || window.callbackClosing { return false }
        }
        return !stopping
    }

    private func HasPendingPresentation() bool {
        for (_, window) in windows {
            if window.SchedulerHasPendingQueueWork() { return true }
        }
        for window in removedWindows {
            if window.IsOpen { return true }
        }
        return false
    }

    private func RefreshOutputs() {
        outputsChanged = false
        let outputs = SdlHost.ReadDisplays()
        for (id, window) in windows {
            var connected bool
            for output in outputs {
                if output.Id == id {
                    connected = true
                    break
                }
            }
            if connected { continue }
            windows.Remove(id)
            window.Close()
            if window.IsOpen { removedWindows.Add(window) }
        }
        for output in outputs {
            if windows.ContainsKey(output.Id) { continue }
            let window = factory!!(output)
            if window == nil || window.IsOpen || window.callbackClosing || window.LockSurface != nil ||
                window.LayerShell != nil || window.Owner != nil || !window.InitiallyVisible || !window.Focusable {
                throw InvalidOperationException("A session lock window must be a fresh, visible, focusable desktop window")
            }
            window.LockSurface = WaylandLockSurface(protocol, output.Id)
            windows.Add(output.Id, window)
            window.Open()
        }
    }

    shared {
        private func CloseWindow(window Window, firstError Exception?) Exception? {
            try {
                window.CloseAfterRun()
            } catch (error Exception) {
                return firstError ?? error
            } finally { window.LockSurface?.Dispose() }
            return firstError
        }

        @DllImport("SDL3", EntryPoint: "Goo_GetWaylandKeyboardLayoutName", CallingConvention: CallingConvention.Cdecl)
        private func GetKeyboardLayoutName() nint;
    }
}
