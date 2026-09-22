package Goo

import System
import System.Collections.Generic
import System.Diagnostics

/// A cancellable callback scheduled on a Window's UI thread.
public sealed class WindowTimer : IDisposable {
    private let owner Window
    private let callback Action
    private let periodTicks float64
    internal var DueTicks float64
    private var active bool

    internal init(window Window, action Action, delayMs float64, intervalMs float64) {
        owner = window
        callback = action
        periodTicks = intervalMs * float64(Stopwatch.Frequency) / 1000.0
        DueTicks = float64(Stopwatch.GetTimestamp())
        + delayMs * float64(Stopwatch.Frequency) / 1000.0
        active = true
    }

    /// Reports whether the callback remains scheduled.
    public prop IsActive bool {
        get -> active
    }

    /// Cancels the callback. Call this on the Window's UI thread.
    public func Dispose() {
        if !active {
            return
        }
        active = false
        owner.RemoveTimer(this)
    }

    internal func Cancel() {
        active = false
    }

    internal func Fire(nowTicks float64) {
        if !active {
            return
        }
        if periodTicks <= 0.0 {
            active = false
        } else {
            let elapsed = Math.Max(0.0, nowTicks - DueTicks)
            DueTicks = DueTicks + (Math.Floor(elapsed / periodTicks) + 1.0) * periodTicks
        }
        callback()
    }
}

/// Hosts a Goo tree in a native window.
public partial class Window {
    private let timers List[WindowTimer] = List[WindowTimer]()
    private let timerBatch List[WindowTimer] = List[WindowTimer]()

    /// Runs a callback once on the UI thread after the delay.
    public func SetTimeout(callback Action, delayMs float64) WindowTimer {
        validateTimer(callback, delayMs, false)
        return addTimer(callback, delayMs, 0.0)
    }

    /// Runs a callback repeatedly on the UI thread at the requested interval.
    public func SetInterval(callback Action, intervalMs float64) WindowTimer {
        validateTimer(callback, intervalMs, true)
        return addTimer(callback, intervalMs, intervalMs)
    }

    private func validateTimer(callback Action, milliseconds float64, repeating bool) {
        requireUiThread("Window timer")
        if !IsOpen {
            throw InvalidOperationException("Window timers require an open window")
        }
        if callback == nil {
            throw ArgumentNullException("callback")
        }
        if !Double.IsFinite(milliseconds) || milliseconds < 0.0 || (repeating && milliseconds == 0.0) {
            throw ArgumentOutOfRangeException("milliseconds")
        }
    }

    private func addTimer(callback Action, delayMs float64, intervalMs float64) WindowTimer {
        let timer = WindowTimer(this, callback, delayMs, intervalMs)
        timers.Add(timer)
        host?.Wake()
        return timer
    }

    internal func RemoveTimer(timer WindowTimer) {
        requireUiThread("WindowTimer.Dispose")
        timers.Remove(timer)
    }

    private func drainTimers(nowTicks float64) {
        timerBatch.Clear()
        for i in 0 ... timers.Count {
            let timer = timers[i]
            if timer.IsActive && timer.DueTicks <= nowTicks {
                timerBatch.Add(timer)
            }
        }
        try {
            var i int32
            while i < timerBatch.Count && IsOpen {
                timerBatch[i].Fire(nowTicks)
                i++
            }
        } finally {
            timerBatch.Clear()
            var i = timers.Count - 1
            while i >= 0 {
                if !timers[i].IsActive {
                    timers.RemoveAt(i)
                }
                i--
            }
        }
    }

    private func nextTimerDeadlineSeconds() float64 {
        let now = float64(Stopwatch.GetTimestamp())
        var deadline = Double.PositiveInfinity
        for i in 0 ... timers.Count {
            let timer = timers[i]
            if timer.IsActive {
                let candidate = (timer.DueTicks - now) / float64(Stopwatch.Frequency)
                if candidate < deadline {
                    deadline = candidate
                }
            }
        }
        return deadline
    }

    private func clearTimers() {
        for i in 0 ... timers.Count {
            timers[i].Cancel()
        }
        timers.Clear()
        timerBatch.Clear()
    }
}
