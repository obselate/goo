package GooAsyncReadbackSmoke

import System
import System.Diagnostics
import System.Threading
import Goo

func IdleDelta(after uint64, before uint64) uint64 -> after >= before ? after - before : uint64.MaxValue

func IdleDurationMs() int32 {
  let value = Environment.GetEnvironmentVariable("GOO_IDLE_DURATION_MS")
  if value == nil || value.Length == 0 {
    return 60000
  }
  let parsed = Int32.Parse(value)
  Require(parsed >= 1000, "GOO_IDLE_DURATION_MS must be at least 1000")
  return parsed
}

func IdleWarmupMs() int32 {
  let value = Environment.GetEnvironmentVariable("GOO_IDLE_WARMUP_MS")
  if value == nil || value.Length == 0 {
    return 3000
  }
  let parsed = Int32.Parse(value)
  Require(parsed >= 1000, "GOO_IDLE_WARMUP_MS must be at least 1000")
  return parsed
}

func RunIdleSmoke() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let durationMs = IdleDurationMs()
  let warmupMs = IdleWarmupMs()
  let opened = Window{
    Title: "Goo Idle true idle gate",
    Width: 1280,
    Height: 720,
    VSync: false,
    Root: Cell{},
  }
  var beforeCaptured int32 = 0
  var afterCaptured int32 = 0
  var before VulkanDiagnosticCounterSnapshot
  var after VulkanDiagnosticCounterSnapshot
  var mainAllocatedBefore int64
  var mainAllocatedAfter int64
  var wallBefore int64
  var wallAfter int64
  var cpuBefore int64
  var cpuAfter int64
  let process = Process.GetCurrentProcess()
  let captureBefore = func() {
    before = WindowReadbackTestFixture.DiagnosticCounters(opened)
    mainAllocatedBefore = GC.GetAllocatedBytesForCurrentThread()
    cpuBefore = process.TotalProcessorTime.Ticks
    wallBefore = Stopwatch.GetTimestamp()
    Interlocked.Exchange(&beforeCaptured, 1)
  }
  let captureAfter = func() {
    after = WindowReadbackTestFixture.DiagnosticCounters(opened)
    mainAllocatedAfter = GC.GetAllocatedBytesForCurrentThread()
    wallAfter = Stopwatch.GetTimestamp()
    cpuAfter = process.TotalProcessorTime.Ticks
    Interlocked.Exchange(&afterCaptured, 1)
  }
  let closeWorker = Thread(func() {
    Thread.Sleep(warmupMs)
    opened.Post(captureBefore)
    let beforeDeadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 5L
    while Interlocked.CompareExchange(&beforeCaptured, 0, 0) == 0
      && Stopwatch.GetTimestamp() < beforeDeadline{
        Thread.Sleep(1)
      }
    Thread.Sleep(durationMs)
    opened.Post(captureAfter)
    let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 5L
    while Interlocked.CompareExchange(&afterCaptured, 0, 0) == 0
      && Stopwatch.GetTimestamp() < deadline{
        Thread.Sleep(1)
      }
    opened.RequestClose()
  })
  closeWorker.IsBackground = true
  try {
    opened.Open()
    closeWorker.Start()
    opened.Run()
    closeWorker.Join()
    Require(Interlocked.CompareExchange(&beforeCaptured, 0, 0) != 0,
      "Idle gate did not capture the post-warm state")
    Require(Interlocked.CompareExchange(&afterCaptured, 0, 0) != 0,
      "Idle gate did not capture the pre-close state")
    Require(!opened.IsOpen, "Idle gate window did not close")
  } finally {
    if opened.IsOpen {
      opened.RequestClose()
    }
    if closeWorker.IsAlive {
      closeWorker.Join()
    }
  }
  let elapsedSeconds = float64(wallAfter - wallBefore) / float64(Stopwatch.Frequency)
  let cpuSeconds = float64(cpuAfter - cpuBefore) / float64(TimeSpan.TicksPerSecond)
  let cpuPercentOneCore = cpuSeconds / elapsedSeconds * 100.0
  let managedThreadBytes = mainAllocatedAfter - mainAllocatedBefore
  Console.WriteLine("idle-observed: duration_ms="
    +Math.Round(elapsedSeconds * 1000.0).ToString()
    +" cpu_one_core_percent=" + cpuPercentOneCore.ToString("F4")
    +" rebuild=" + IdleDelta(after.rebuildCount, before.rebuildCount).ToString()
    +" layout=" + IdleDelta(after.layoutCount, before.layoutCount).ToString()
    +" plan=" + IdleDelta(after.planCompileCount, before.planCompileCount).ToString()
    +" upload=" + IdleDelta(after.uploadCount, before.uploadCount).ToString()
    +" record=" + IdleDelta(after.recordCount, before.recordCount).ToString()
    +" submit=" + IdleDelta(after.submitCount, before.submitCount).ToString()
    +" present=" + IdleDelta(after.presentCount, before.presentCount).ToString()
    +" diagnostic_managed_B="
    +IdleDelta(after.managedAllocatedBytes, before.managedAllocatedBytes).ToString()
    +" main_managed_B=" + managedThreadBytes.ToString()
    +" objects=" + IdleDelta(after.vulkanObjectAllocationCount,
      before.vulkanObjectAllocationCount).ToString()
    +" device_memory=" + IdleDelta(after.vulkanDeviceMemoryAllocationCount,
      before.vulkanDeviceMemoryAllocationCount).ToString())
  Require(elapsedSeconds >= float64(durationMs) / 1000.0,
    "Idle observation ended early")
  Require(IdleDelta(after.rebuildCount, before.rebuildCount) == 0uL,
    "Idle rebuilt the tree")
  Require(IdleDelta(after.layoutCount, before.layoutCount) == 0uL,
    "Idle performed layout")
  Require(IdleDelta(after.planCompileCount, before.planCompileCount) == 0uL,
    "Idle compiled a render plan")
  Require(IdleDelta(after.uploadCount, before.uploadCount) == 0uL,
    "Idle uploaded resources")
  Require(IdleDelta(after.recordCount, before.recordCount) == 0uL,
    "Idle recorded commands")
  Require(IdleDelta(after.submitCount, before.submitCount) == 0uL,
    "Idle submitted GPU work")
  Require(IdleDelta(after.presentCount, before.presentCount) == 0uL,
    "Idle presented a frame")
  Require(IdleDelta(after.managedAllocatedBytes, before.managedAllocatedBytes) == 0uL,
    "Idle diagnostics recorded managed allocation")
  Require(IdleDelta(after.vulkanObjectAllocationCount,
    before.vulkanObjectAllocationCount) == 0uL,
    "Idle created a Vulkan object")
  Require(IdleDelta(after.vulkanDeviceMemoryAllocationCount,
    before.vulkanDeviceMemoryAllocationCount) == 0uL,
    "Idle allocated Vulkan device memory")
  Require(managedThreadBytes == 0L,
    "Idle allocated on the UI thread")
  Require(cpuPercentOneCore < 0.5,
    "Idle used at least 0.5 percent of one CPU core")
  Console.WriteLine("idle: duration_ms="
    +Math.Round(elapsedSeconds * 1000.0).ToString()
    +" cpu_one_core_percent=" + cpuPercentOneCore.ToString("F4")
    +" rebuild=0 layout=0 plan=0 upload=0 record=0 submit=0 present=0"
    +" managed_B=0 objects=0 device_memory=0 close=1")
}
