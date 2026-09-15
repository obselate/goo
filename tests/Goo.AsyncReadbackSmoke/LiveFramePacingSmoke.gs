package GooAsyncReadbackSmoke

import Goo
import System
import System.Diagnostics
import System.Threading

class FramePacingSimulation : Simulation {
  private let duration float64
  private let from float64
  private let to float64

  init(start float64, target float64) {
    duration = 0.5
    from = start
    to = target
  }

  public override func Position(elapsed float64) float64 {
    if elapsed <= 0.0 {
      return from
    }
    if elapsed >= duration {
      return to
    }
    return from + (to - from) * (elapsed / duration)
  }

  public override func Velocity(elapsed float64) float64 {
    if elapsed < 0.0 || elapsed >= duration {
      return 0.0
    }
    return (to - from) / duration
  }

  public override func Done(elapsed float64) bool -> elapsed >= duration
}

func FramePacingSpec(from float64, to float64, velocity float64) Simulation -> FramePacingSimulation(from, to)

class FramePacingActiveCell : Cell {
  private let phase Anim[float64]

  init() {
    phase = Animate(0.0)
    phase.To(1.0, FramePacingSpec)
  }

  override func Build() Blob {
    let value = phase.Value
    return Container{
      Width: Length.Percent(100),
      Height: Length.Percent(100),
      BackgroundColor: Color.Rgb(48 + int32(value * 160.0), 64, 112),
      Opacity: 0.5 + value * 0.5,
    }
  }
}

class FramePacingIdleCell : Cell {
  override func Build() Blob -> Container {
    Width: Length.Percent(100),
    Height: Length.Percent(100),
    BackgroundColor: Color.Rgb(32, 40, 56),
  }
}

func RunLiveFramePacingSmoke() {
  let activeRoot = FramePacingActiveCell{}
  let idleRoot = FramePacingIdleCell{}
  var worker Thread? = nil
  var captured int32 = 0
  var sampleTicks int64 = 0L
  var activeRate float64 = 0.0
  var activeSubmissions VulkanFrameSubmissionTestSnapshot
  var idleSubmissions VulkanFrameSubmissionTestSnapshot
  let activeWindow = Window{
    Title: "Goo Runtime active pacing gate",
    Width: 320,
    Height: 180,
    VSync: false,
    Root: activeRoot,
  }
  let idleWindow = Window{
    Title: "Goo Runtime idle pacing gate",
    Width: 320,
    Height: 180,
    VSync: true,
    Root: idleRoot,
  }
  try {
    activeWindow.Open()
    idleWindow.Open()
    let startTicks = Stopwatch.GetTimestamp()
    let closeWorker = Thread(func() {
      Thread.Sleep(550)
      activeWindow.Post(func() {
        activeSubmissions = WindowReadbackTestFixture.FrameSubmissions(activeWindow)
        idleSubmissions = WindowReadbackTestFixture.FrameSubmissions(idleWindow)
        activeRate = WindowReadbackTestFixture.PacingRefreshRate(activeWindow)
        sampleTicks = Stopwatch.GetTimestamp()
        Interlocked.Exchange(&captured, 1)
      })
      let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency
      while Interlocked.CompareExchange(&captured, 0, 0) == 0
        && Stopwatch.GetTimestamp() < deadline{
          Thread.Sleep(1)
        }
      activeWindow.RequestClose()
      idleWindow.RequestClose()
    })
    worker = closeWorker
    closeWorker.IsBackground = true
    closeWorker.Start()
    activeWindow.Run()
    closeWorker.Join()
    Require(Interlocked.CompareExchange(&captured, 0, 0) != 0,
      "Runtime live pacing gate did not capture pre-close submissions")
    Require(!activeWindow.IsOpen && !idleWindow.IsOpen,
      "Runtime live pacing gate windows did not close")
    let elapsedSeconds = float64(sampleTicks - startTicks) / float64(Stopwatch.Frequency)
    let activeCount = activeSubmissions.Slot0Serial + activeSubmissions.Slot1Serial
    let idleCount = idleSubmissions.Slot0Serial + idleSubmissions.Slot1Serial
    Require(activeRate > 0.0,
      "Runtime live pacing gate did not report a display refresh rate")
    let maximumActive = uint64(Math.Ceiling(elapsedSeconds * activeRate)) + 8uL
    Require(activeCount > 4uL,
      "Runtime live pacing gate active window did not submit enough frames")
    Require(activeCount <= maximumActive,
      "Runtime live pacing gate active submissions exceeded the display cadence")
    Require(idleCount <= 2uL,
      "Runtime live pacing gate idle window rendered after its initial frame")
    let elapsedMs = Math.Round(elapsedSeconds * 1000.0)
    Console.WriteLine("live-frame-pacing-smoke: active_vsync=0 elapsed_ms=" + elapsedMs.ToString()
      +" rate_hz=" + activeRate.ToString()
      +" active=" + activeCount.ToString()
      +" idle=" + idleCount.ToString()
      +" cap=" + maximumActive.ToString() + " close=1")
  } finally {
    if let current = worker {
      if current.IsAlive {
        activeWindow.RequestClose()
        idleWindow.RequestClose()
        current.Join()
      }
    }
    if activeWindow.IsOpen {
      activeWindow.RequestClose()
    }
    if idleWindow.IsOpen {
      idleWindow.RequestClose()
    }
  }
}
