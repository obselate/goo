package Goo

import System
import System.Diagnostics
import Facebook.Yoga

internal struct HistoryPreparationProfile : IDisposable {
  private let stage int32
  private let start int64
  private let bytes int64
  private let active bool

  shared {
    private let names[]string = []string{"ResetForReuse", "LogicalRows", "VirtualRange", "VirtualAnchor", "StyleFlush", "YogaChildren", "SceneDirty", "RetireRows", "ResetMetadata", "ResetDefaults", "ResetYoga"}
    private let ticks[]int64 = [11]int64
    private let allocations[]int64 = [11]int64
    private let calls[]int64 = [11]int64
    private let depths[]int32 = [11]int32

    internal func Flush() {
      guard let recorder = FrameRecorder.Current, let profiler = FrameProfiler.Current else { return }
      let now = Stopwatch.GetTimestamp() - recorder.Origin
      for i in 0 ... names.Length {
        recorder.Publish(FrameTraceRecord{
          Kind: FrameTraceKind.Counter, Ticks: now, Context: profiler.Context,
          Name: names[i], Source: "history.tree.inclusive", Unit: "stopwatch-ticks,bytes",
          Value0: uint64(ticks[i]), Value1: uint64(allocations[i]), Validity: "diagnostic",
        })
        ticks[i] = 0L
        allocations[i] = 0L
        calls[i] = 0L
      }
      recorder.Counter("YogaRemove", "history.tree.native", uint64(YGNodeAPI.HistoryRemovalTicks), Stopwatch.GetTimestamp(), unit: "stopwatch-ticks", context: profiler.Context)
      recorder.Counter("YogaInsert", "history.tree.native", uint64(YGNodeAPI.HistoryInsertionTicks), Stopwatch.GetTimestamp(), unit: "stopwatch-ticks", context: profiler.Context)
      YGNodeAPI.HistoryRemovalTicks = 0L
      YGNodeAPI.HistoryInsertionTicks = 0L
    }
  }

  internal init(stage int32) {
    this.stage = stage
    active = FrameRecorder.Current != nil
    start = active ? Stopwatch.GetTimestamp() : 0L
    bytes = active ? GC.GetAllocatedBytesForCurrentThread() : 0L
    if active { depths[stage]++ }
  }

  public func Dispose() {
    if !active { return }
    depths[stage]--
    if depths[stage] != 0 { return }
    ticks[stage] += Stopwatch.GetTimestamp() - start
    allocations[stage] += GC.GetAllocatedBytesForCurrentThread() - bytes
    calls[stage]++
  }
}
