package GooAsyncReadbackSmoke

import Goo
import System
import System.Threading

class QueueWakeCell : Cell {
  internal var Builds int32
  override func Build() Blob {
    Builds++
    return Container {
      Width: Percent(100),
      Height: Percent(100),
      BackgroundColor: Color.Rgb(32, 40, 56),
    }
  }
}

func RunQueueWakeSmoke() {
  for phase in 0 ... 2 {
    let root = QueueWakeCell{}
    let window = Window{
      Title: "Goo queue completion wake",
      Width: 180,
      Height: 96,
      VSync: true,
      Root: root,
    }
    var worker Thread? = nil
    try {
      window.Open()
      WindowReadbackTestFixture.ForceRender(window, 0.0)
      WindowReadbackTestFixture.StabilizeNativeMetrics(window)
      window.Background = Color.Rgb(20, 30, 40)
      WindowReadbackTestFixture.DeferSchedulerFrame(window, 1.0)
      Require(!WindowReadbackTestFixture.SchedulerFrameDue(window, 0.0),
        "Display pacing ignored the deferred display frame")
      window.FramePacing = WindowFramePacing.Uncapped
      Require(WindowReadbackTestFixture.SchedulerFrameDue(window, 0.0),
        "Uncapped pacing still waited for the display frame")
      window.FramePacing = WindowFramePacing.Display
      if phase == 0 {
        WindowReadbackTestFixture.RuntimeHoldNextQueueSubmit(window)
      } else {
        WindowReadbackTestFixture.RuntimeHoldNextQueuePresent(window)
      }
      WindowReadbackTestFixture.ForceRenderNonblocking(window, 0.0)
      var held = false
      for attempt in 0 ... 100 {
        WindowReadbackTestFixture.Pump(window, 0.0)
        if WindowReadbackTestFixture.RuntimeWaitForHeldQueueCall(window, 10) {
          held = true
          break
        }
      }
      Require(held, "Queue completion wake did not reach the held worker")
      WindowReadbackTestFixture.Pump(window, 0.0)
      WindowReadbackTestFixture.DeferSchedulerFrame(window, 30.0)
      Require(WindowReadbackTestFixture.SchedulerWaitMs(window, 0.0) > 0,
        "A held queue must leave the scheduler able to sleep")
      let builds = root.Builds
      window.RequestClose()
      root.Rebuild()
      WindowReadbackTestFixture.Pump(window, 0.0)
      Require(window.IsOpen && root.Builds == builds,
        "A deferred close admitted another tree update")
      let release = Thread(() -> WindowReadbackTestFixture.RuntimeReleaseHeldQueueCall())
      worker = release
      release.IsBackground = true
      release.Start()
      let captured = WindowReadbackTestFixture.AwaitQueueCompletionWake(window, 5000)
      let pending = WindowReadbackTestFixture.RuntimeQueueWorkPending(window)
      release.Join()
      Require(captured && !pending,
        "Queue completion waited for the next frame or idle timeout: phase " + phase.ToString())
      let deadline = Environment.TickCount64 + 10000
      while window.IsOpen && Environment.TickCount64 < deadline {
        window.Pump(0.0)
        Thread.Yield()
      }
      Require(!window.IsOpen, "A deferred close did not drain after queue completion")
    } finally {
      WindowReadbackTestFixture.RuntimeReleaseHeldQueueCall()
      worker?.Join()
      if window.IsOpen {
        window.RequestClose()
        window.Run()
      }
    }
  }
  Console.WriteLine("queue-wake-smoke: submit=1 present=1 frame_deadline_independent=1 blocking_wait=1 close_pending=2 deferred_build=0")
}
