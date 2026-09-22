package GooConsumerPerformance

import Goo
import System
import System.Diagnostics
import System.Globalization
import System.IO
import System.Threading

class ConsumerScene : Cell {
  override func Build() Blob -> Container{
    Width: Length.Percent(100),
    Height: Length.Percent(100),
    Padding: 32,
    Gap: 12,
    BackgroundColor: Color.Rgb(18, 24, 34),
    Text{
      Content: "Goo consumer performance",
      FontFamily: "Vend Sans",
      FontSize: 32,
      FontWeight: 400,
      Color: Color.White,
    },
    Text{
      Content: "NativeAOT and partial-trimmed JIT",
      FontFamily: "Vend Sans",
      FontSize: 18,
      FontWeight: 400,
      Color: Color.Rgb(142, 198, 255),
    },
  }
}

func Milliseconds(name string, fallback int32) int32 {
  let value = Environment.GetEnvironmentVariable(name)
  if value == nil || value == "" {
    return fallback
  }
  if !Int32.TryParse(value, out var parsed) || parsed < 0 {
    throw ArgumentOutOfRangeException(name)
  }
  return parsed
}

func WriteMemorySample(eventName string) {
  using let process = Process.GetCurrentProcess()
  process.Refresh()
  let gc = GC.GetGCMemoryInfo()
  let committed = if gc.Index == 0L {
    "null"
  } else {
    gc.TotalCommittedBytes.ToString(CultureInfo.InvariantCulture)
  }
  let gcHeapBytes = GC.GetTotalMemory(false)
  let privateBytes = process.PrivateMemorySize64
  let workingSetBytes = process.WorkingSet64
  let processCpuTicks = process.TotalProcessorTime.Ticks
  let ticks = Stopwatch.GetTimestamp()
  Console.WriteLine("{\"kind\":\"fixture\",\"event\":\"${eventName}\",\"ticks\":${ticks},\"frequency\":${Stopwatch.Frequency},\"processCpuTicks\":${processCpuTicks},\"gcIndex\":${gc.Index},\"gcHeapBytes\":${gcHeapBytes},\"gcCommittedBytes\":${committed},\"privateBytes\":${privateBytes},\"workingSetBytes\":${workingSetBytes}}")
  Console.Out.Flush()
}

func Main() {
  Window.ConfigureApplication(
    "Goo consumer performance",
    "1.0.0",
    "io.github.obselate.goo.consumer-performance")
  let fontPath = Path.Combine(AppContext.BaseDirectory, "VendSans-VariableFont_wght.ttf")
  using let font = FontSource("Vend Sans", 400, false, File.ReadAllBytes(fontPath))
  font.Register()
  let window = Window{
    Title: "Goo consumer performance",
    Width: 640,
    Height: 480,
    VSync: true,
    Root: ConsumerScene{},
  }
  window.MetricsChanged += (metrics WindowMetrics) -> {
    let scaleX = metrics.DisplayScaleX.ToString("R", CultureInfo.InvariantCulture)
    let scaleY = metrics.DisplayScaleY.ToString("R", CultureInfo.InvariantCulture)
    Console.WriteLine("{\"kind\":\"fixture\",\"event\":\"metrics\",\"ticks\":${Stopwatch.GetTimestamp()},\"frequency\":${Stopwatch.Frequency},\"logicalWidth\":${metrics.LogicalWidth},\"logicalHeight\":${metrics.LogicalHeight},\"framebufferWidth\":${metrics.FramebufferWidth},\"framebufferHeight\":${metrics.FramebufferHeight},\"displayScaleX\":${scaleX},\"displayScaleY\":${scaleY}}")
    Console.Out.Flush()
  }
  let readyDelayMs = Milliseconds("GOO_CONSUMER_READY_DELAY_MS", 750)
  let runMs = Milliseconds("GOO_CONSUMER_RUN_MS", 2000)
  let startupDeadlineMs = Milliseconds("GOO_CONSUMER_STARTUP_DEADLINE_MS", 0)
  let startupStart = Stopwatch.GetTimestamp()
  window.Open()
  Console.WriteLine("{\"kind\":\"fixture\",\"event\":\"window_open_return\",\"ticks\":${Stopwatch.GetTimestamp()},\"frequency\":${Stopwatch.Frequency}}")
  Console.Out.Flush()
  window.Pump(0.0)
  Console.WriteLine("{\"kind\":\"fixture\",\"event\":\"first_frame_pump_return\",\"ticks\":${Stopwatch.GetTimestamp()},\"frequency\":${Stopwatch.Frequency},\"meaning\":\"submission_attempt_not_successful_present\"}")
  Console.Out.Flush()
  let elapsedMs = int32((Stopwatch.GetTimestamp() - startupStart) * 1000L / Stopwatch.Frequency)
  let watcherRunMs = if startupDeadlineMs == 0 { runMs } else { startupDeadlineMs - elapsedMs }
  if watcherRunMs <= 0 {
    throw TimeoutException("First-frame submission attempt exhausted the startup deadline")
  }
  using let stopped = ManualResetEventSlim(false)
  let closer = Thread(() -> {
    if watcherRunMs <= readyDelayMs {
      if !stopped.Wait(watcherRunMs) {
        window.RequestClose()
      }
    } else if !stopped.Wait(readyDelayMs) {
      WriteMemorySample("idle_start")
      if !stopped.Wait(watcherRunMs - readyDelayMs) {
        WriteMemorySample("idle_end")
        window.RequestClose()
      }
    }
  })
  closer.IsBackground = true
  closer.Start()
  try {
    window.Run()
  } finally {
    stopped.Set()
    closer.Join()
  }
}
