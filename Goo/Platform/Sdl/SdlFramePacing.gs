package Goo

import System
import System.Diagnostics

internal class SdlFramePacing {
  shared {
    private var uncappedBenchmark bool

    internal func SetUncappedBenchmark(value bool) {
      uncappedBenchmark = value
    }

    internal prop UncappedBenchmark bool{ get -> uncappedBenchmark }
  }

  private var displayId uint32
  private var refreshRate float64
  private var intervalTicks float64
  private var nextDeadlineTicks float64
  private var retryDeadlineTicks float64
  private var hasValidSample bool

  internal prop DisplayId uint32{ get -> displayId }
  internal prop RefreshRate float64{ get -> refreshRate }
  internal prop HasValidSample bool{ get -> hasValidSample }

  internal init() {
    refreshRate = 60.0
    intervalTicks = float64(Stopwatch.Frequency) / refreshRate
  }

  internal func Refresh(display uint32, rate float64, nowTicks float64, reset bool) {
    let validSample = display != 0u && motionFinite(rate) && rate > 0.0
    var changed bool
    if validSample {
      changed = !hasValidSample || displayId != display || refreshRate != rate || intervalTicks <= 0.0
      displayId = display
      refreshRate = rate
      intervalTicks = float64(Stopwatch.Frequency) / rate
      hasValidSample = true
    } else {
      changed = !hasValidSample && intervalTicks <= 0.0
      if intervalTicks <= 0.0 {
        refreshRate = 60.0
        intervalTicks = float64(Stopwatch.Frequency) / refreshRate
      }
    }
    if reset || changed || nextDeadlineTicks <= 0.0 {
      nextDeadlineTicks = nowTicks
      retryDeadlineTicks = 0.0
    }
  }

  internal func IsDue(nowTicks float64) bool -> if retryDeadlineTicks > nowTicks { false } else { UncappedBenchmark || nextDeadlineTicks <= 0.0 || nextDeadlineTicks <= nowTicks }

  internal func WaitMilliseconds(nowTicks float64, fallbackMs int32) int32 {
    if retryDeadlineTicks > nowTicks {
      let remaining = retryDeadlineTicks - nowTicks
      let exactMs = remaining * 1000.0 / float64(Stopwatch.Frequency)
      let roundedMs = Math.Ceiling(exactMs)
      if roundedMs >= float64(fallbackMs) {
        return fallbackMs
      }
      let waitMs = int32(roundedMs)
      return waitMs < 1 ? 1 : waitMs
    }
    if IsDue(nowTicks) {
      return 0
    }
    let remaining = nextDeadlineTicks - nowTicks
    let exactMs = remaining * 1000.0 / float64(Stopwatch.Frequency)
    let roundedMs = Math.Ceiling(exactMs)
    if roundedMs >= float64(fallbackMs) {
      return fallbackMs
    }
    let waitMs = int32(roundedMs)
    return waitMs < 1 ? 1 : waitMs
  }

  internal func Defer(nowTicks float64) {
    let retryTicks = intervalTicks > 0.0
    ? intervalTicks : float64(Stopwatch.Frequency) / 60.0
    retryDeadlineTicks = nowTicks + retryTicks
  }

  internal func MarkFrame(nowTicks float64) {
    retryDeadlineTicks = 0.0
    if UncappedBenchmark {
      nextDeadlineTicks = nowTicks
      return
    }
    if intervalTicks <= 0.0 {
      nextDeadlineTicks = nowTicks
      return
    }
    if nextDeadlineTicks <= 0.0 {
      nextDeadlineTicks = nowTicks + intervalTicks
      return
    }
    if nextDeadlineTicks <= nowTicks {
      let periods = Math.Floor((nowTicks - nextDeadlineTicks) / intervalTicks) + 1.0
      nextDeadlineTicks = nextDeadlineTicks + periods * intervalTicks
    }
  }
}
