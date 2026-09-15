package GooAsyncReadbackSmoke

import Goo
import System
import System.Collections.Generic
import System.Diagnostics

data struct PrimitiveUploadBox {
  internal var Left float64
  internal var Top float64
  internal var Width float64
  internal var Height float64
  internal var Radius float64
  internal var Color Color
}

class PrimitiveUploadCell : Cell {
  shared {
    const BoxCount int32 = 1000
    const Columns int32 = 25
    const Rows int32 = 40
  }

  private let boxes []PrimitiveUploadBox

  init() {
    boxes = [BoxCount]PrimitiveUploadBox
    var index int32 = 0
    while index < BoxCount {
      let row = index / Columns
      let column = index % Columns
      let color = Color.Rgb(
        24 + (index % 8) * 12,
        56 + (column % 5) * 18,
        112 + (row % 6) * 16)
      boxes[index] = PrimitiveUploadBox{
        Left: float64(column) * 40.0,
        Top: float64(row) * 16.0,
        Width: 40.0,
        Height: 16.0,
        Radius: index % 2 == 0 ? 0.0 : 3.0,
        Color: color,
      }
      index = index + 1
    }
  }

  internal func Mutate(index int32) {
    boxes[index].Color = Color.Rgb(231, 93, 41)
    Rebuild()
  }

  internal func ApplyWorkload(workload string, frameOrdinal int32) {
    if workload == "sparse" {
      boxes[0].Color = PrimitiveUploadColor(0, frameOrdinal)
    } else if workload == "full" {
      var index int32 = 0
      while index < BoxCount {
        boxes[index].Color = PrimitiveUploadColor(index, frameOrdinal)
        index = index + 1
      }
    }
    Rebuild()
  }

  override func Build() Blob {
    let children = List[Blob](BoxCount)
    var index int32 = 0
    while index < BoxCount {
      let box = boxes[index]
      children.Add(Container{
        Position: PositionType.Absolute,
        Left: box.Left,
        Top: box.Top,
        Width: box.Width,
        Height: box.Height,
        BorderRadius: box.Radius,
        BackgroundColor: box.Color,
      })
      index = index + 1
    }
    return Container{
      Width: float64(Columns) * 40.0,
      Height: float64(Rows) * 16.0,
      Position: PositionType.Relative,
      BackgroundColor: Color.Transparent,
      Children: children,
    }
  }
}

func PrimitiveUploadColor(index int32, frameOrdinal int32) Color -> Color.Rgb(
  (frameOrdinal + index * 17) % 256,
  (frameOrdinal / 256 + index * 29) % 256,
  32 + (frameOrdinal + index * 37) % 224)

func PrimitiveUploadWorkload() string {
  let value = Environment.GetEnvironmentVariable("GOO_PRIMITIVE_UPLOAD_WORKLOAD") ?? "unchanged"
  Require(value == "unchanged" || value == "sparse" || value == "full",
    "GOO_PRIMITIVE_UPLOAD_WORKLOAD must be unchanged, sparse, or full")
  return value
}

func PrimitiveUploadSum(values []int64) int64 {
  var total int64 = 0L
  var index int32 = 0
  while index < values.Length {
    total = total + values[index]
    index = index + 1
  }
  return total
}

func RunPrimitiveUploadBenchmark() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  Environment.SetEnvironmentVariable("GOO_FRAME_PROFILE", "1")
  let warmup = EnvironmentCount("GOO_PRIMITIVE_UPLOAD_WARMUP", 300, 2000)
  let samples = EnvironmentCount("GOO_PRIMITIVE_UPLOAD_SAMPLES", 2000, 10000)
  Require(samples > 0, "GOO_PRIMITIVE_UPLOAD_SAMPLES must be positive")
  let workload = PrimitiveUploadWorkload()
  let root = PrimitiveUploadCell{}
  let frameTicks = [samples]int64
  let frameAllocations = [samples]int64
  var sawSlot0 bool = false
  var sawSlot1 bool = false
  var measuredStartPrimitive VulkanPrimitiveFrameRetentionTestSnapshot{}
  var finalPrimitive VulkanPrimitiveFrameRetentionTestSnapshot{}
  var window Window? = nil
  try {
    let opened = Window{
      Title: "Goo Retained primitive staging benchmark",
      Width: 1000,
      Height: 640,
      Background: Color.Transparent,
      VSync: false,
      Root: root,
    }
    window = opened
    opened.Open()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    var warmIndex int32 = 0
    while warmIndex < warmup || !sawSlot0 || !sawSlot1 {
      root.ApplyWorkload(workload, warmIndex + 1)
      WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
      let warmPrimitive = WindowReadbackTestFixture.PrimitiveFrameRetention(opened)
      if warmPrimitive.SlotIndex == 0 {
        sawSlot0 = true
      } else if warmPrimitive.SlotIndex == 1 {
        sawSlot1 = true
      }
      warmIndex = warmIndex + 1
      if warmIndex > warmup + 8 && (!sawSlot0 || !sawSlot1) {
        throw InvalidOperationException("Retained primitive staging did not observe both frame slots")
      }
    }
    measuredStartPrimitive = WindowReadbackTestFixture.PrimitiveFrameRetention(opened)
    var sampleIndex int32 = 0
    while sampleIndex < samples {
      let beforeBytes = GC.GetAllocatedBytesForCurrentThread()
      let start = Stopwatch.GetTimestamp()
      root.ApplyWorkload(workload, warmIndex + sampleIndex + 1)
      WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
      let end = Stopwatch.GetTimestamp()
      let afterBytes = GC.GetAllocatedBytesForCurrentThread()
      frameTicks[sampleIndex] = end - start
      frameAllocations[sampleIndex] = afterBytes - beforeBytes
      finalPrimitive = WindowReadbackTestFixture.PrimitiveFrameRetention(opened)
      if finalPrimitive.SlotIndex == 0 {
        sawSlot0 = true
      } else if finalPrimitive.SlotIndex == 1 {
        sawSlot1 = true
      }
      sampleIndex = sampleIndex + 1
    }
    Require(finalPrimitive.RecordCount == PrimitiveUploadCell.BoxCount,
      "Retained primitive staging emitted an unexpected record count "
      +finalPrimitive.RecordCount.ToString())
    Require(finalPrimitive.ByteCount
      == uint64(PrimitiveUploadCell.BoxCount) * 128uL,
      "Retained primitive staging emitted an unexpected byte count")
    opened.RequestClose()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    Require(!opened.IsOpen, "Retained primitive staging window did not close")
  } finally {
    if let active = window {
      if active.IsOpen {
        active.RequestClose()
        WindowReadbackTestFixture.ForceRender(active, 0.0)
      }
    }
  }
  let frameNs = [samples]int64
  var index int32 = 0
  while index < samples {
    frameNs[index] = TicksToNanoseconds(frameTicks[index])
    index = index + 1
  }
  let allocationTotal = PrimitiveUploadSum(frameAllocations)
  let allocationPerFrame = allocationTotal / int64(samples)
  let measuredCpuWrittenBytes = finalPrimitive.TotalCpuWrittenBytes
  -measuredStartPrimitive.TotalCpuWrittenBytes
  let measuredCpuComparedBytes = finalPrimitive.TotalCpuComparedBytes
  -measuredStartPrimitive.TotalCpuComparedBytes
  let measuredSubmittedTransferBytes = finalPrimitive.TotalSubmittedTransferBytes
  -measuredStartPrimitive.TotalSubmittedTransferBytes
  let measuredCpuWriteOperations = finalPrimitive.TotalCpuWriteOperations
  -measuredStartPrimitive.TotalCpuWriteOperations
  let measuredDirtyRecords = finalPrimitive.TotalDirtyRecordCount
  -measuredStartPrimitive.TotalDirtyRecordCount
  let expectedDirtyRecords = if workload == "unchanged" {
    0uL
  } else if workload == "sparse" {
    uint64(samples)
  } else {
    uint64(samples) * uint64(PrimitiveUploadCell.BoxCount)
  }
  Require(measuredDirtyRecords == expectedDirtyRecords,
    "Retained primitive staging measured an unexpected dirty record count "
    +measuredDirtyRecords.ToString())
  let bothSlots = sawSlot0 && sawSlot1
  Console.WriteLine("retained-primitive-staging: samples=" + samples.ToString()
    +" workload=" + workload
    +" record_count=" + finalPrimitive.RecordCount.ToString()
    +" byte_count=" + finalPrimitive.ByteCount.ToString()
    +" primitive_records=" + finalPrimitive.RecordCount.ToString()
    +" primitive_bytes=" + finalPrimitive.ByteCount.ToString()
    +" p50_ns=" + Percentile(frameNs, 0.50).ToString()
    +" p95_ns=" + Percentile(frameNs, 0.95).ToString()
    +" p99_ns=" + Percentile(frameNs, 0.99).ToString()
    +" max_ns=" + Maximum(frameNs).ToString()
    +" alloc_B_frame=" + allocationPerFrame.ToString()
    +" alloc_total_B=" + allocationTotal.ToString()
    +" alloc_p50_B=" + Percentile(frameAllocations, 0.50).ToString()
    +" alloc_p99_B=" + Percentile(frameAllocations, 0.99).ToString()
    +" measured_cpu_written_B=" + measuredCpuWrittenBytes.ToString()
    +" measured_cpu_compared_B=" + measuredCpuComparedBytes.ToString()
    +" measured_submitted_transfer_B=" + measuredSubmittedTransferBytes.ToString()
    +" measured_cpu_write_operations=" + measuredCpuWriteOperations.ToString()
    +" measured_dirty_records=" + measuredDirtyRecords.ToString()
    +" planned_transfer_B=" + finalPrimitive.PlannedTransferBytes.ToString()
    +" skipped_transfer_B=" + finalPrimitive.SkippedTransferBytes.ToString()
    +" dirty=" + finalPrimitive.DirtyRecordCount.ToString()
    +" ranges=" + finalPrimitive.UploadRangeCount.ToString()
    +" full_upload=" + (finalPrimitive.FullUpload ? "1" : "0")
    +" cpu_write_operations=" + finalPrimitive.CpuWriteOperations.ToString()
    +" native_flush_calls=" + finalPrimitive.NativeFlushCalls.ToString()
    +" retained_reuse=" + finalPrimitive.RetainedReuse.ToString()
    +" primitive_planned_transfer=" + finalPrimitive.PlannedTransferBytes.ToString()
    +" primitive_skipped_transfer=" + finalPrimitive.SkippedTransferBytes.ToString()
    +" primitive_dirty_records=" + finalPrimitive.DirtyRecordCount.ToString()
    +" primitive_upload_ranges=" + finalPrimitive.UploadRangeCount.ToString()
    +" primitive_full_upload=" + (finalPrimitive.FullUpload ? "1" : "0")
    +" primitive_cpu_write_operations=" + finalPrimitive.CpuWriteOperations.ToString()
    +" primitive_native_flush_calls=" + finalPrimitive.NativeFlushCalls.ToString()
    +" primitive_retained_reuse=" + finalPrimitive.RetainedReuse.ToString()
    +" total_planned_transfer_B=" + finalPrimitive.TotalPlannedTransferBytes.ToString()
    +" total_skipped_transfer_B=" + finalPrimitive.TotalSkippedTransferBytes.ToString()
    +" total_dirty=" + finalPrimitive.TotalDirtyRecordCount.ToString()
    +" total_ranges=" + finalPrimitive.TotalUploadRangeCount.ToString()
    +" total_full_upload=" + finalPrimitive.TotalFullUploads.ToString()
    +" total_cpu_write_operations=" + finalPrimitive.TotalCpuWriteOperations.ToString()
    +" total_native_flush_calls=" + finalPrimitive.TotalNativeFlushCalls.ToString()
    +" total_retained_reuse=" + finalPrimitive.TotalRetainedReuse.ToString()
    +" cpu_written_bytes=" + finalPrimitive.CpuWrittenBytes.ToString()
    +" total_cpu_written_bytes=" + finalPrimitive.TotalCpuWrittenBytes.ToString()
    +" cpu_compared_bytes=" + finalPrimitive.CpuComparedBytes.ToString()
    +" total_cpu_compared_bytes=" + finalPrimitive.TotalCpuComparedBytes.ToString()
    +" history_copied_bytes=" + finalPrimitive.HistoryCopiedBytes.ToString()
    +" total_history_copied_bytes=" + finalPrimitive.TotalHistoryCopiedBytes.ToString()
    +" flush_requests=" + finalPrimitive.FlushRequests.ToString()
    +" total_flush_requests=" + finalPrimitive.TotalFlushRequests.ToString()
    +" submitted_transfer_bytes=" + finalPrimitive.SubmittedTransferBytes.ToString()
    +" total_submitted_transfer_bytes=" + finalPrimitive.TotalSubmittedTransferBytes.ToString()
    +" recorded_copy_commands=" + finalPrimitive.RecordedCopyCommands.ToString()
    +" total_recorded_copy_commands=" + finalPrimitive.TotalRecordedCopyCommands.ToString()
    +" recorded_barriers=" + finalPrimitive.RecordedBarriers.ToString()
    +" total_recorded_barriers=" + finalPrimitive.TotalRecordedBarriers.ToString()
    +" slot0=" + (sawSlot0 ? "1" : "0")
    +" slot1=" + (sawSlot1 ? "1" : "0")
    +" both_slots=" + (bothSlots ? "1" : "0")
    +" both_slots_observed=" + (bothSlots ? "1" : "0")
    +" close=1")
}
