package GooAsyncReadbackSmoke

import Goo
import System
import System.Threading

class QueueWakeCell : Cell {
  override func Build() Blob -> Container {
    Width: Length.Percent(100),
    Height: Length.Percent(100),
    BackgroundColor: Color.Rgb(32, 40, 56),
  }
}

func RunQueueWakeSmoke() {
  for phase in 0 ... 2 {
    let window = Window{
      Title: "Goo queue completion wake",
      Width: 180,
      Height: 96,
      VSync: true,
      Root: QueueWakeCell{},
    }
    var captured = false
    var pending = true
    var worker Thread? = nil
    try {
      window.Open()
      WindowReadbackTestFixture.ForceRender(window, 0.0)
      WindowReadbackTestFixture.StabilizeNativeMetrics(window)
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
      WindowReadbackTestFixture.DeferSchedulerFrame(window, 1.0)
      Require(WindowReadbackTestFixture.SchedulerWaitMs(window, 0.0) > 0,
        "A held queue must leave the scheduler able to sleep")
      let release = Thread(() -> {
        Thread.Sleep(20)
        WindowReadbackTestFixture.RuntimeReleaseHeldQueueCall()
        Thread.Sleep(80)
        window.Post(() -> {
          pending = WindowReadbackTestFixture.RuntimeQueueWorkPending(window)
          captured = true
          window.RequestClose()
        })
      })
      worker = release
      release.IsBackground = true
      release.Start()
      window.Run()
      release.Join()
      Require(captured && !pending,
        "Queue completion waited for the next frame or idle timeout: phase " + phase.ToString())
    } finally {
      WindowReadbackTestFixture.RuntimeReleaseHeldQueueCall()
      worker?.Join()
      if window.IsOpen {
        window.RequestClose()
        window.Run()
      }
    }
  }
  Console.WriteLine("queue-wake-smoke: submit=1 present=1 frame_deadline_independent=1 blocking_wait=1")
}
