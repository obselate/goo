package Goo

import System
import System.Diagnostics

public class GridScrollFrames {
  shared {
    private let countsOnly bool = Environment.GetEnvironmentVariable("GOO_FRAME_BUILD_COUNTS_ONLY") == "1"
    private let recorder FrameRecorder? = countsOnly ? nil : FrameRecorder.Start(Guid.NewGuid(), FrameRecorder.DefaultBufferBytes)
    private let profiler FrameProfiler = FrameProfiler()
    private var afterSeq int64

    public func Step(window Window, scroll Action, sample bool, renderReady bool = true, coalesce bool = false) {
      if countsOnly {
        let shapes = FrameBuildProbe.Shapes
        let builds = FrameBuildProbe.CellBuilds
        scroll()
        window.UpdateTree(0.01, renderReady ? 0.01 : 0.0, !coalesce || renderReady)
        if sample {
          Console.WriteLine("{\"counter\":\"text.shape.calls\",\"value\":${FrameBuildProbe.Shapes - shapes},\"accepted\":${renderReady ? 1 : 0}}")
          Console.WriteLine("{\"counter\":\"cell.build.calls\",\"value\":${FrameBuildProbe.CellBuilds - builds},\"accepted\":${renderReady ? 1 : 0}}")
        }
        return
      }
      guard let recording = recorder else { throw InvalidOperationException("Frame recorder is unavailable") }
      profiler.BeginPump()
      let gc0 = GC.CollectionCount(0)
      let start = profiler.Start()
      scroll()
      let changed = window.UpdateTree(0.01, renderReady ? 0.01 : 0.0, !coalesce || renderReady)
      profiler.EndFrame(start, renderReady, !renderReady)
      let collections = GC.CollectionCount(0) - gc0
      let records = recording.Read(afterSeq, 32768, out var next, out var more, out var state, out var dropped)
      afterSeq = next
      if dropped != 0L || more { throw InvalidOperationException("Benchmark trace overflow") }
      if sample {
        for record in records {
          if record.Kind == FrameTraceKind.Counter && record.Source == "cpu.work" {
            Console.WriteLine("{\"counter\":\"${record.Name}\",\"value\":${record.Value0 ?? 0uL},\"accepted\":${renderReady ? 1 : 0}}")
          }
        }
      }
      if !sample || !changed { return }
      for record in records {
        if record.Kind != FrameTraceKind.Duration || record.Source != "cpu.phase" { continue }
        let stage = FrameProfileStage(int32(record.EventId))
        let ms = float64(record.EndTicks - record.Ticks) * 1000.0 / float64(Stopwatch.Frequency)
        Console.WriteLine("{\"stage\":\"${stage}\",\"ms\":${ms},\"bytes\":${record.AllocatedBytes ?? 0L},\"gc\":${stage == FrameProfileStage.Frame ? collections : 0}}")
      }
    }
  }
}
