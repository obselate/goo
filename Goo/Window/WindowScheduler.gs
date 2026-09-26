package Goo

import System
import System.Collections.Generic
import System.Diagnostics

internal class WindowScheduler {
  private const EventBudget int32 = 64
  private const DefaultWaitMs int32 = 250
  private let windows List[Window] = List[Window]()
  private let windowsGate object = Object()
  private var snapshot []Window = []Window{}
  private var snapshotCount int32
  private var nextWindow int32
  private var running bool

  private func EnsureSnapshotCapacity(required int32) {
    if required <= snapshot.Length {
      return
    }
    var capacity = snapshot.Length
    if capacity == 0 {
      capacity = 4
    }
    while capacity < required {
      if capacity > 1073741823 {
        capacity = required
      } else {
        capacity = capacity * 2
      }
    }
    snapshot = [capacity]Window
  }

  private func CaptureSnapshot() int32 {
    let count = windows.Count
    EnsureSnapshotCapacity(count)
    if count < snapshotCount {
      Array.Clear(snapshot, count, snapshotCount - count)
    }
    var index int32
    while index < count {
      snapshot[index] = windows[index]
      index = index + 1
    }
    snapshotCount = count
    return count
  }

  internal func Register(window Window) {
    lock windowsGate {
      if !windows.Contains(window) {
        windows.Add(window)
      }
    }
  }

  internal func Unregister(window Window) {
    lock windowsGate {
      let index = windows.IndexOf(window)
      if index < 0 {
        return
      }
      windows.RemoveAt(index)
      if windows.Count == 0 {
        nextWindow = 0
      } else if nextWindow >= windows.Count {
        nextWindow = 0
      }
    }
  }

  internal func RequestHotReload() {
    let pending = List[Window]()
    lock windowsGate { pending.AddRange(windows) }
    for window in pending { window.TryPost(window.RebuildAfterHotReload) }
  }

  internal func Run() {
    if running {
      throw InvalidOperationException("Window scheduler is already running")
    }
    running = true
    nextWindow = 0
    try {
      while true {
        let currentCount = CaptureSnapshot()
        if currentCount == 0 {
          break
        }
        var hasOpenWindow bool
        let now = float64(Stopwatch.GetTimestamp())
        var waitMs int32 = DefaultWaitMs
        var currentIndex int32
        while currentIndex < currentCount {
          let window = snapshot[currentIndex]
          if !window.IsOpen || window.ExternallyDriven {
            currentIndex = currentIndex + 1
            continue
          }
          hasOpenWindow = true
          let candidate = window.SchedulerWaitMs(now)
          if candidate < waitMs {
            waitMs = candidate
          }
          currentIndex = currentIndex + 1
        }
        if !hasOpenWindow {
          break
        }
        if waitMs == 0 {
          SdlRuntime.PumpEvents(EventBudget)
        } else {
          SdlRuntime.WaitEventsBounded(waitMs, EventBudget)
        }
        let afterEventsCount = CaptureSnapshot()
        var afterEventsIndex int32
        while afterEventsIndex < afterEventsCount {
          let window = snapshot[afterEventsIndex]
          if window.IsOpen && !window.ExternallyDriven {
            window.RefreshSchedulerMetrics()
          }
          afterEventsIndex = afterEventsIndex + 1
        }
        let afterEventsNow = float64(Stopwatch.GetTimestamp())
        let count = afterEventsCount
        if count == 0 {
          break
        }
        let start = nextWindow % count
        var offset int32
        while offset < count {
          let window = snapshot[(start + offset) % count]
          if window.IsOpen && !window.ExternallyDriven {
            let service = window.SchedulerHasImmediateService() || window.SchedulerHasPendingQueueWork()
            let timed = window.SchedulerTimedServiceDue()
            let frameDue = window.SchedulerFrameDue(afterEventsNow)
            if service || timed || frameDue {
              window.SchedulerPump(afterEventsNow, frameDue)
            }
          }
          offset = offset + 1
        }
        nextWindow = (start + 1) % count
      }
    } finally {
      running = false
    }
  }
}
