package GooPackageSmoke

import Goo
import System
import System.Diagnostics
import System.Globalization

func WindowsQualificationNanoseconds(ticks int64) int64 ->
int64(float64(ticks) * 1000000000.0 / float64(Stopwatch.Frequency))

func WindowsQualificationPercentile(values []int64, percentile float64) int64 {
  let sorted = [values.Length]int64
  Array.Copy(values, sorted, values.Length)
  Array.Sort(sorted)
  let rawIndex = int32(Math.Ceiling(float64(sorted.Length) * percentile)) - 1
  let index = if rawIndex < 0 {
    0
  } else if rawIndex >= sorted.Length {
    sorted.Length - 1
  } else {
    rawIndex
  }
  return sorted[index]
}

func WindowsQualificationMaximum(values []int64) int64 {
  var maximum int64
  var index int32
  while index < values.Length {
    if values[index] > maximum {
      maximum = values[index]
    }
    index++
  }
  return maximum
}

func RunWindowsQualification() {
  let warmupCount int32 = 32
  let sampleCount int32 = 240
  let frameNanoseconds = [sampleCount]int64
  let frameAllocations = [sampleCount]int64
  let root = SmokeCell{}
  let window = Window{
    Title: "Goo Windows qualification",
    Width: 1280,
    Height: 720,
    VSync: false,
    Root: root,
  }
  window.Open()
  var warmupIndex int32
  while warmupIndex < warmupCount {
    root.TextValue = if warmupIndex % 2 == 0 {
      "Goo Windows qualification A"
    } else {
      "Goo Windows qualification B"
    }
    root.Rebuild()
    window.Pump(0.00833333333333333)
    warmupIndex++
  }
  if !window.IsOpen {
    throw InvalidOperationException("Windows qualification window closed during warmup")
  }
  GC.Collect()
  GC.WaitForPendingFinalizers()
  GC.Collect()
  let sampleStart = Stopwatch.GetTimestamp()
  var sampleIndex int32
  while sampleIndex < sampleCount {
    let allocatedBefore = GC.GetAllocatedBytesForCurrentThread()
    let frameStart = Stopwatch.GetTimestamp()
    root.TextValue = if sampleIndex % 2 == 0 {
      "Goo Windows qualification A"
    } else {
      "Goo Windows qualification B"
    }
    root.Rebuild()
    window.Pump(0.00833333333333333)
    let frameEnd = Stopwatch.GetTimestamp()
    let allocatedAfter = GC.GetAllocatedBytesForCurrentThread()
    frameNanoseconds[sampleIndex] = WindowsQualificationNanoseconds(frameEnd - frameStart)
    frameAllocations[sampleIndex] = allocatedAfter - allocatedBefore
    sampleIndex++
  }
  let sampleEnd = Stopwatch.GetTimestamp()
  if !CloseWindow(window) {
    throw InvalidOperationException("Windows qualification window did not close")
  }
  let elapsedSeconds = float64(sampleEnd - sampleStart) / float64(Stopwatch.Frequency)
  let throughput = float64(sampleCount) / elapsedSeconds
  Console.WriteLine("windows-qualification: warmup=" + warmupCount.ToString()
    +" samples=" + sampleCount.ToString()
    +" frame_p50_ns=" + WindowsQualificationPercentile(frameNanoseconds, 0.50).ToString()
    +" frame_p95_ns=" + WindowsQualificationPercentile(frameNanoseconds, 0.95).ToString()
    +" frame_p99_ns=" + WindowsQualificationPercentile(frameNanoseconds, 0.99).ToString()
    +" frame_max_ns=" + WindowsQualificationMaximum(frameNanoseconds).ToString()
    +" alloc_p50_B=" + WindowsQualificationPercentile(frameAllocations, 0.50).ToString()
    +" alloc_p95_B=" + WindowsQualificationPercentile(frameAllocations, 0.95).ToString()
    +" alloc_max_B=" + WindowsQualificationMaximum(frameAllocations).ToString()
    +" throughput_fps=" + throughput.ToString("F3", CultureInfo.InvariantCulture)
    +" close=1")
}
