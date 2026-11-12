package Goo

import System
import System.Diagnostics

internal class FrameBuildProbe {
  shared {
    internal let Enabled bool = Environment.GetEnvironmentVariable("GOO_FRAME_BUILD_PROBE") == "1"
    internal let CountsOnly bool = Environment.GetEnvironmentVariable("GOO_FRAME_BUILD_COUNTS_ONLY") == "1"
    internal let DisableWidthCache bool = Environment.GetEnvironmentVariable("GOO_FRAME_BUILD_DISABLE_WIDTH_CACHE") == "1"
    internal let Ticks []int64 = [1024]int64
    internal let Bytes []int64 = [1024]int64
    internal let Calls []int64 = [1024]int64
    internal var Shapes int64
    internal var CellBuilds int64
    internal var DropBuffer int64
    internal var DropManagedIdentity int64
    internal var DropNativeIdentity int64
    internal var DropGpuMetadata int64
    internal var FirstDroppedSource string?
    internal var FirstDroppedEvent uint64

    internal func Record(stage int32, ticks int64, bytes int64 = 0L) {
      if !Enabled { return }
      Ticks[stage] += ticks
      Bytes[stage] += bytes
      Calls[stage]++
    }

    internal func End(stage int32, start int64) {
      if start != 0L { Record(stage, Stopwatch.GetTimestamp() - start) }
    }

    internal func Reset() {
      Array.Clear(Ticks)
      Array.Clear(Bytes)
      Array.Clear(Calls)
      Shapes = 0L
      CellBuilds = 0L
      DropBuffer = 0L
      DropManagedIdentity = 0L
      DropNativeIdentity = 0L
      DropGpuMetadata = 0L
      FirstDroppedSource = nil
      FirstDroppedEvent = 0uL
    }
  }
}
