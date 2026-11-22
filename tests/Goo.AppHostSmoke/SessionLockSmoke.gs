package GooAppHostSmoke

import Goo
import System
import System.Collections.Generic
import System.IO
import System.Linq

internal shared class SessionLockSmoke {
    internal func Run(mode string, root string) {
        if mode == "session-lock-absent" {
            try {
                using let session = SessionLock()
                throw InvalidOperationException("The lock manager was unexpectedly available")
            } catch (error NotSupportedException) {
                if !error.Message.Contains("ext_session_lock_manager_v1") { rethrow }
            }
            return
        }

        using let session = SessionLock()
        let windows = Dictionary[int32, Window]()
        var locked int32
        var finished int32
        var unlockRequested bool
        var keyboardChanges int32
        session.Finished += () -> { finished++ }
        session.KeyboardLayoutChanged += () -> {
            if let name = session.KeyboardLayoutName {
                keyboardChanges++
                File.WriteAllText(Path.Combine(root, "layout-" + keyboardChanges.ToString()), name)
            }
        }
        session.Locked += () -> {
            locked++
            if mode == "session-lock-denied" {
                throw InvalidOperationException("The competing lock was unexpectedly accepted")
            }
            let initial = windows.Values.First()
            initial.Every(16.0, () -> {
                for entry in windows {
                    if !entry.Value.IsOpen {
                        File.WriteAllText(Path.Combine(root, "removed-" + entry.Key.ToString()), "closed")
                    }
                }
                if mode == "session-lock-close" && File.Exists(Path.Combine(root, "close")) {
                    initial.RequestClose()
                }
                if mode == "session-lock-unlock" && !unlockRequested && File.Exists(Path.Combine(root, "unlock")) {
                    unlockRequested = true
                    ReportUnlock(session, root)
                }
            })
            File.WriteAllText(Path.Combine(root, "locked"), "locked")
        }

        try {
            session.Run(_ -> {
                let window = Window{Size: LayoutSize(320, 200), Background: Color.Black, Root: Cell()}
                let index = windows.Count + 1
                windows.Add(index, window)
                window.PresentationAccepted += _ -> File.WriteAllText(Path.Combine(root, "output-" + index.ToString()),
                    "${window.NativeWidth}x${window.NativeHeight}")
                return window
            })
        } catch (error InvalidOperationException) {
            if mode == "session-lock-denied" && finished == 1 && locked == 0 &&
                error.Message.Contains("rejected the session lock") { return }
            rethrow
        }
        if locked != 1 || finished != 0 || (mode == "session-lock-unlock" && !File.Exists(Path.Combine(root, "unlocked"))) {
            throw InvalidOperationException("Session lock events or unlock completion did not match the request")
        }
    }

    private async func ReportUnlock(session SessionLock, root string) void {
        await session.UnlockAsync()
        File.WriteAllText(Path.Combine(root, "unlocked"), "unlocked")
    }
}
