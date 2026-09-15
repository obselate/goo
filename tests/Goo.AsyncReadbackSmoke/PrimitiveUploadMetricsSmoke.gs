package GooAsyncReadbackSmoke

import Goo
import System

func CheckPrimitiveMetrics(stats VulkanPrimitiveFrameRetentionTestSnapshot,
  changed int32, full bool, label string) {
    let bytes = uint64(changed) * 128uL
    Require(stats.RecordCount == 1000 && stats.CpuWrittenBytes == 128000uL
        && stats.CpuWriteOperations == 1000uL, label + " CPU writes records=" + stats.RecordCount.ToString()
      +" bytes=" + stats.CpuWrittenBytes.ToString() + " operations=" + stats.CpuWriteOperations.ToString())
    Require(stats.FullUpload == full && stats.DirtyRecordCount == changed
        && stats.PlannedTransferBytes == bytes && stats.SubmittedTransferBytes == bytes
        && stats.HistoryCopiedBytes == bytes, label + " transfer and history bytes")
    Require(stats.SkippedTransferBytes == 128000uL - bytes, label + " skipped transfers")
    let commands = changed > 0 ? 1uL : 0uL
    Require(stats.RecordedCopyCommands == commands && stats.RecordedBarriers == commands
        && stats.FlushRequests == commands && stats.NativeFlushCalls <= stats.FlushRequests,
      label + " native operations")
    if full {
      Require(stats.CpuComparedBytes == 0uL, label + " full comparison")
    } else if changed == 0 {
      Require(stats.CpuComparedBytes == 128000uL, label + " unchanged comparison")
    } else {
      Require(stats.CpuComparedBytes > 127872uL && stats.CpuComparedBytes <= 128000uL,
        label + " sparse comparison")
    }
    Console.WriteLine("primitive-metrics: " + label
      +" cpu_written=" + stats.CpuWrittenBytes.ToString()
      +" cpu_compared=" + stats.CpuComparedBytes.ToString()
      +" planned=" + stats.PlannedTransferBytes.ToString()
      +" submitted=" + stats.SubmittedTransferBytes.ToString()
      +" flush_requests=" + stats.FlushRequests.ToString()
      +" native_flush_calls=" + stats.NativeFlushCalls.ToString())
  }

func RunPrimitiveUploadMetricsSmoke() {
  let root = PrimitiveUploadCell{}
  let window = Window{
    Title: "Goo primitive upload metrics",
    Width: 1000, Height: 640, VSync: false, Root: root, Background: Color.Transparent,
  }
  try {
    window.Open()
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    CheckPrimitiveMetrics(WindowReadbackTestFixture.PrimitiveFrameRetention(window),
      1000, true, "full")
    for index in 0 ... 4 {
      WindowReadbackTestFixture.ForceRender(window, 0.0166666666666667)
    }
    CheckPrimitiveMetrics(WindowReadbackTestFixture.PrimitiveFrameRetention(window),
      0, false, "unchanged")
    root.Mutate(0)
    WindowReadbackTestFixture.ForceRender(window, 0.0166666666666667)
    CheckPrimitiveMetrics(WindowReadbackTestFixture.PrimitiveFrameRetention(window),
      1, false, "sparse")
    for index in 0 ... 4 {
      WindowReadbackTestFixture.ForceRender(window, 0.0166666666666667)
    }
    let before = WindowReadbackTestFixture.PrimitiveFrameRetention(window)
    let partial = WindowReadbackTestFixture.AbortPrimitiveMetrics(window, false)
    Require(partial.CpuWrittenBytes == 136uL && partial.CpuWriteOperations == 2uL
        && partial.PlannedTransferBytes == 0uL && partial.SubmittedTransferBytes == 0uL
        && partial.TotalCpuWrittenBytes == before.TotalCpuWrittenBytes + 136uL
        && partial.TotalSubmittedTransferBytes == before.TotalSubmittedTransferBytes,
      "Partial abort must retain CPU costs without submitting bytes")
    let aborted = WindowReadbackTestFixture.AbortPrimitiveMetrics(window, true)
    Require(aborted.CpuWrittenBytes == 128008uL && aborted.CpuWriteOperations == 1001uL
        && aborted.PlannedTransferBytes == 128008uL && aborted.SubmittedTransferBytes == 0uL
        && aborted.RecordedCopyCommands == 0uL && aborted.RecordedBarriers == 0uL
        && aborted.HistoryCopiedBytes == 0uL
        && aborted.TotalCpuWrittenBytes == partial.TotalCpuWrittenBytes + 128008uL
        && aborted.TotalPlannedTransferBytes == partial.TotalPlannedTransferBytes + 128008uL
        && aborted.TotalSubmittedTransferBytes == partial.TotalSubmittedTransferBytes,
      "Prepared abort must retain CPU and planned costs without submitting bytes")
    for index in 0 ... 3 {
      WindowReadbackTestFixture.ForceRender(window, 0.0166666666666667)
      CheckPrimitiveMetrics(WindowReadbackTestFixture.PrimitiveFrameRetention(window),
        0, false, "after_abort")
    }
    WindowReadbackTestFixture.VerifyFlushMetrics(window)
    Console.WriteLine("primitive-metrics: partial_abort=1 prepared_abort=1 effect_tail=1 history_preserved=1 flush_branch_calls=1")
  } finally {
    if window.IsOpen {
      window.RequestClose()
      WindowReadbackTestFixture.ForceRender(window, 0.0)
    }
  }
}
