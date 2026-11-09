package GooAsyncReadbackSmoke

import Goo
import System
import System.IO
import System.Threading

class PathAtlasGrowthCell : Cell {
  internal var Boxes int32

  override func Build() Blob {
    let root = Container{
      Width: Percent(100),
      Height: Percent(100),
      Shape{
        Width: Percent(100),
        Height: Percent(100),
        Path: PendingPathReadinessCell.CoveredPath,
        Fit: ShapeFit.Fill,
        BackgroundColor: Color.White,
      },
    }
    for index in 0 ... Boxes {
      root.Children.Add(Container{
        Position: PositionType.Absolute,
        Left: index % 180,
        Top: index / 180,
        Width: 1,
        Height: 1,
        BackgroundColor: Color.White,
      })
    }
    return root
  }
}

func RunPathAtlasGrowthSmoke() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let capturedError = StringWriter()
  let originalError = Console.Error
  Console.SetError(capturedError)
  try {
    for mode in 0 ... 3 {
      let builder = PathBuilder().MoveTo(1.0, 0.5)
      for index in 1 ... 9000 {
        let angle = float64(index) * Math.PI * 2.0 / 9000.0
        builder.LineTo(0.5 + Math.Cos(angle) * 0.5, 0.5 + Math.Sin(angle) * 0.5)
      }
      let firstRoot = PathAtlasGrowthCell{}
      let secondRoot = PendingPathReadinessCell(PendingPathReadinessCell.CoveredPath)
      let first = Window{
        Title: "Goo path atlas recorded use",
        Width: 180,
        Height: 120,
        VSync: false,
        Root: firstRoot,
      }
      let second = Window{
        Title: "Goo path atlas growth",
        Width: 180,
        Height: 120,
        VSync: false,
        Root: secondRoot,
      }
      try {
        first.Open()
        second.Open()
        WindowReadbackTestFixture.StabilizeNativeMetrics(first)
        WindowReadbackTestFixture.ForceRender(second, 0.0)
        for frame in 0 ... 4 { WindowReadbackTestFixture.ForceRender(first, 0.0) }
        guard let target = WindowReadbackTestFixture.CaptureTarget(first) else {
          throw InvalidOperationException("Path atlas fixture target is unavailable")
        }
        let serial = target.GraphicsTimelineForTest().LastEnqueuedSerial
        let completionDeadline = Environment.TickCount64 + 10000
        while target.GraphicsTimelineForTest().CompletedSerial < serial
          && Environment.TickCount64 < completionDeadline { Thread.Yield() }
        Require(target.GraphicsTimelineForTest().CompletedSerial >= serial,
          "Path atlas fixture could not complete its warm-up submissions")

        secondRoot.clip = builder.Close().Build()
        secondRoot.Rebuild()
        WindowReadbackTestFixture.UpdateTreeOnly(second, 0.0)
        let initial = WindowReadbackTestFixture.PathResources(first)
        Require(initial.WordCapacity == 65536uL && !initial.UploadPending,
          "Path atlas fixture did not start with a resident 262144-byte atlas")

        first.Background = Color.Rgb(24, 32, 48)
        WindowReadbackTestFixture.SetForceFullRedraw(first, true)
        let deadline = Environment.TickCount64 + 10000
        if mode == 2 {
          let pressureBefore = WindowReadbackTestFixture.DiagnosticCounters(first).memoryPressureCount
          firstRoot.Boxes = 4000
          firstRoot.Rebuild()
          target.FailMemoryAllocationsForTest(2)
          while WindowReadbackTestFixture.DiagnosticCounters(first).memoryPressureCount == pressureBefore
            && Environment.TickCount64 < deadline {
            WindowReadbackTestFixture.ForceRenderNonblocking(first, 0.0)
            Thread.Yield()
          }
          target.FailMemoryAllocationsForTest(0)
          Require(WindowReadbackTestFixture.DiagnosticCounters(first).memoryPressureCount > pressureBefore
              && !WindowReadbackTestFixture.RuntimeQueueWorkPending(first),
            "Path atlas fixture did not abandon a recorded frame under memory pressure")
        } else {
          if mode == 1 {
            WindowReadbackTestFixture.RuntimeDeferNextQueueEnqueue(first)
          } else {
            WindowReadbackTestFixture.RuntimeHoldNextQueueSubmit(first)
          }
          while !WindowReadbackTestFixture.RuntimeQueueWorkPending(first)
            && Environment.TickCount64 < deadline {
            WindowReadbackTestFixture.ForceRenderNonblocking(first, 0.0)
            Thread.Yield()
          }
          Require(WindowReadbackTestFixture.RuntimeQueueWorkPending(first),
            "Path atlas fixture did not retain an unmarked command buffer")
          if mode == 0 {
            Require(WindowReadbackTestFixture.RuntimeWaitForHeldQueueCall(first, 10000),
              "Path atlas fixture did not hold the queued submission")
          }

          WindowReadbackTestFixture.CompilePathProbe(second, second)
          Require(WindowReadbackTestFixture.PathResources(first).GrowthCount == initial.GrowthCount,
            "The shared path atlas was replaced while another window's frame still used it")

          WindowReadbackTestFixture.RuntimeReleaseHeldQueueCall()
          WindowReadbackTestFixture.DrainWindowQueue(first, 10000)
        }

        WindowReadbackTestFixture.CompilePathProbe(second, second)
        let grown = WindowReadbackTestFixture.PathResources(first)
        Require(grown.GrowthCount > initial.GrowthCount && grown.WordCapacity > initial.WordCapacity,
          "The shared path atlas did not grow after the other window's frame was submitted or abandoned")
      } finally {
        WindowReadbackTestFixture.RuntimeReleaseHeldQueueCall()
        if first.IsOpen {
          WindowReadbackTestFixture.DrainWindowQueue(first, 10000)
          first.RequestClose()
          WindowReadbackTestFixture.Pump(first, 0.0)
        }
        if second.IsOpen {
          second.RequestClose()
          WindowReadbackTestFixture.Pump(second, 0.0)
        }
      }
    }
  } finally {
    Console.SetError(originalError)
  }
  ReadbackValidateCommonDiagnostics(capturedError.ToString())
  Console.WriteLine("path-atlas-growth-smoke: queued=1 enqueue_deferred=1 abandoned=1 validation_errors=0")
}
