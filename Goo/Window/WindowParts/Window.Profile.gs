package Goo

import System
import System.Collections.Generic
import System.Diagnostics
import System.Text

internal enum FrameProfileStage {
  Frame; Events; Input; Tree; Motion; Reconcile; Build; Diff; StyleResolve;
  Transitions; Layout; InputTree;
  Render; TargetBegin; Paint; CanvasFlush; TargetFlush; Present; Count
}

internal data struct FrameProfilePoint {
  internal var Ticks int64
  internal var Bytes int64
}

internal interface FrameProfileSink {
  prop Active bool { get }
  func Record(stage FrameProfileStage, ticks int64, bytes int64);
}

internal class FrameProfileTotal {
  internal var Ticks int64
  internal var Bytes int64
  internal var Calls int64

  internal func Reset() {
    Ticks = 0
    Bytes = 0
    Calls = 0
  }
}

internal class FrameProfiler {
  private let enabled bool
  private var sink FrameProfileSink? = nil
  private var totals List[FrameProfileTotal]?
  private var warmupFrames int32
  private var frames int32
  private var rendered int32
  private var styleResolveNodes int64

  internal prop Active bool{
    get {
      if enabled {
        return true
      }
      if let current = sink {
        return current.Active
      }
      return false
    }
  }

  internal prop Enabled bool{ get -> enabled }

  internal prop Sink FrameProfileSink? {
    get -> sink
    set -> sink = value
  }

  internal init() {
    enabled = Environment.GetEnvironmentVariable("GOO_FRAME_PROFILE") == "1"
    warmupFrames = 60
  }

  internal func Start() FrameProfilePoint -> FrameProfilePoint {
    Ticks: Stopwatch.GetTimestamp(),
    Bytes: GC.GetAllocatedBytesForCurrentThread(),
  }

  internal func Record(stage FrameProfileStage, start FrameProfilePoint) {
    if !Active { return }
    let elapsed = Elapsed(start)
    if enabled {
      Add(stage, elapsed.Ticks, elapsed.Bytes, 1)
    }
    if let current = sink {
      current.Record(stage, elapsed.Ticks, elapsed.Bytes)
    }
  }

  internal func Elapsed(start FrameProfilePoint) FrameProfilePoint -> FrameProfilePoint {
    Ticks: Stopwatch.GetTimestamp() - start.Ticks,
    Bytes: GC.GetAllocatedBytesForCurrentThread() - start.Bytes,
  }

  internal func RecordStyleResolveNodes(nodes int64) {
    if !enabled { return }
    styleResolveNodes = styleResolveNodes + nodes
  }

  internal func RecordReconcileSplit(
    start FrameProfilePoint,
    buildTicks int64,
    buildBytes int64,
    buildCalls int64,
    resolveTicks int64,
    resolveBytes int64,
    resolveCalls int64,) {
      if !Active { return }
      let elapsed = Elapsed(start)
      let diffTicks = elapsed.Ticks - buildTicks - resolveTicks
      let diffBytes = elapsed.Bytes - buildBytes - resolveBytes
      let safeDiffTicks = diffTicks < 0 ? 0 : diffTicks
      let safeDiffBytes = diffBytes < 0 ? 0 : diffBytes
      if enabled {
        Add(FrameProfileStage.Reconcile, elapsed.Ticks, elapsed.Bytes, 1)
        Add(FrameProfileStage.Build, buildTicks, buildBytes, buildCalls)
        Add(FrameProfileStage.StyleResolve, resolveTicks, resolveBytes, resolveCalls)
        Add(FrameProfileStage.Diff, safeDiffTicks, safeDiffBytes, 1)
      }
      if let current = sink {
        current.Record(FrameProfileStage.Reconcile, elapsed.Ticks, elapsed.Bytes)
        current.Record(FrameProfileStage.Build, buildTicks, buildBytes)
        current.Record(FrameProfileStage.StyleResolve, resolveTicks, resolveBytes)
        current.Record(FrameProfileStage.Diff, safeDiffTicks, safeDiffBytes)
      }
    }

  private func Add(stage FrameProfileStage, ticks int64, bytes int64, calls int64) {
    let values = totalsOrCreate()
    let total = values[int32(stage)]
    total.Ticks = total.Ticks + ticks
    total.Bytes = total.Bytes + bytes
    total.Calls = total.Calls + calls
  }

  internal func EndFrame(start FrameProfilePoint, didRender bool) {
    if !enabled { return }
    Record(FrameProfileStage.Frame, start)
    if warmupFrames > 0 {
      warmupFrames--
      Reset()
      return
    }
    frames++
    if didRender {
      rendered++
    }
    if frames >= 240 {
      Report()
      Reset()
    }
  }

  private func Report() {
    let reconcileCalls = callCount(FrameProfileStage.Reconcile)
    let buildCalls = callCount(FrameProfileStage.Build)
    let diffCalls = callCount(FrameProfileStage.Diff)
    let styleResolveCalls = callCount(FrameProfileStage.StyleResolve)
    let layoutCalls = callCount(FrameProfileStage.Layout)
    let paintCalls = callCount(FrameProfileStage.Paint)
    Console.WriteLine("[goo.profile] frames=$frames rendered=$rendered calls(reconcile/build/diff/layout/paint)=$reconcileCalls/$buildCalls/$diffCalls/$layoutCalls/$paintCalls")
    let styleEntriesPerFrame = countPerFrame(styleResolveCalls)
    let styleNodesPerFrame = countPerFrame(styleResolveNodes)
    Console.WriteLine("[goo.profile.reconcile_style] total(entry/node)=$styleResolveCalls/$styleResolveNodes per_frame(entry/node)=$styleEntriesPerFrame/$styleNodesPerFrame")

    let sb = StringBuilder()
    sb.Append("[goo.profile.time_ms/frame] total=").Append(time(FrameProfileStage.Frame))
    for i in int32(FrameProfileStage.Events) ... int32(FrameProfileStage.Count) {
      let stage = FrameProfileStage(i)
      sb.Append(" ").Append(stageName(stage)).Append("=").Append(time(stage))
    }
    Console.WriteLine(sb.ToString())

    sb.Clear()
    sb.Append("[goo.profile.alloc_B/frame] total=").Append(bytes(FrameProfileStage.Frame))
    for i in int32(FrameProfileStage.Events) ... int32(FrameProfileStage.Count) {
      let stage = FrameProfileStage(i)
      sb.Append(" ").Append(stageName(stage)).Append("=").Append(bytes(stage))
    }
    Console.WriteLine(sb.ToString())
  }

  private func stageName(stage FrameProfileStage) string -> switch stage {
    case FrameProfileStage.Events: "events"
    case FrameProfileStage.Input: "input"
    case FrameProfileStage.Tree: "tree"
    case FrameProfileStage.Motion: "motion"
    case FrameProfileStage.Reconcile: "reconcile"
    case FrameProfileStage.Build: "build"
    case FrameProfileStage.Diff: "diff"
    case FrameProfileStage.StyleResolve: "style_resolve"
    case FrameProfileStage.Transitions: "transitions"
    case FrameProfileStage.Layout: "layout"
    case FrameProfileStage.InputTree: "input_tree"
    case FrameProfileStage.Render: "render"
    case FrameProfileStage.TargetBegin: "target_begin"
    case FrameProfileStage.Paint: "paint"
    case FrameProfileStage.CanvasFlush: "canvas_flush"
    case FrameProfileStage.TargetFlush: "target_flush"
    case FrameProfileStage.Present: "present"
    default: ""
  }

  private func time(stage FrameProfileStage) string {
    if frames == 0 {
      return "0.000"
    }
    if let values = totals {
      let ticks = values[int32(stage)].Ticks
      let value = float64(ticks) * 1000.0 / float64(Stopwatch.Frequency) / float64(frames)
      return value.ToString("F3")
    }
    return "0.000"
  }

  private func bytes(stage FrameProfileStage) int64 {
    if frames == 0 {
      return 0
    }
    if let values = totals {
      return values[int32(stage)].Bytes / int64(frames)
    }
    return 0
  }

  private func callCount(stage FrameProfileStage) int64 {
    if let values = totals {
      return values[int32(stage)].Calls
    }
    return 0
  }

  private func countPerFrame(value int64) string {
    if frames == 0 {
      return "0.00"
    }
    return (float64(value) / float64(frames)).ToString("F2")
  }

  private func Reset() {
    frames = 0
    rendered = 0
    styleResolveNodes = 0
    if let values = totals {
      for total in values {
        total.Reset()
      }
    }
  }

  private func totalsOrCreate() List[FrameProfileTotal] {
    if let values = totals { return values }
    let values = List[FrameProfileTotal]()
    for i in 0 ... int32(FrameProfileStage.Count) {
      values.Add(FrameProfileTotal())
    }
    totals = values
    return values
  }
}
