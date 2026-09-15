package GooAsyncReadbackSmoke

import Goo
import System
import System.Diagnostics
import System.IO
import System.Threading

class QueueIsolationCell : Cell {
  internal let Root ElementHandle = ElementHandle{}

  private var service int32
  internal var BuildCount int32
  internal var PostedCount int32

  init() {
    service = 0
  }

  internal func RecordService() {
    PostedCount = PostedCount + 1
    service = service + 1
    Rebuild()
  }

  override func Build() Blob {
    BuildCount = BuildCount + 1
    return Container() {.Width: Length.Percent(100),.Height: Length.Percent(100),.Handle: Root,.Position: PositionType.Relative,.BackgroundColor: Color.Rgb(12, 20, 32),
      Container{
          Position: PositionType.Absolute,
          Left: 8,
          Top: 8,
          Width: 64,
          Height: 32,
          BackgroundColor: Color.Rgb(42, 112, 188),
        },
        Text{
          Position: PositionType.Absolute,
          Left: 8,
          Top: 48,
          Content: service.ToString(),
          Color: Color.Rgb(240, 244, 248),
      },
    }
  }
}

func QueueIsolationRequire(condition bool, message string) {
  if !condition {
    throw InvalidOperationException(message)
  }
}

func QueueIsolationPump(first Window, second Window, third Window, dt float64) {
  WindowReadbackTestFixture.Pump(first, dt)
  WindowReadbackTestFixture.Pump(second, dt)
  WindowReadbackTestFixture.Pump(third, dt)
}

func QueueIsolationDrain(first Window, second Window, third Window, timeoutMs int32) {
  let deadline = Stopwatch.GetTimestamp()
  +int64(float64(Stopwatch.Frequency) * float64(timeoutMs) / 1000.0)
  while Stopwatch.GetTimestamp() < deadline {
    QueueIsolationPump(first, second, third, 0.0)
    if !WindowReadbackTestFixture.RuntimeQueueWorkPending(first)
      && !WindowReadbackTestFixture.RuntimeQueueWorkPending(second)
      && !WindowReadbackTestFixture.RuntimeQueueWorkPending(third) {
        return
      }
    Thread.Yield()
  }
  throw InvalidOperationException("Runtime queue work did not drain within the timeout")
}

func QueueIsolationPost(window Window, cell QueueIsolationCell) {
  window.Post(func() { cell.RecordService() })
}

func QueueIsolationSerialCount(snapshot VulkanFrameSubmissionTestSnapshot) uint64 -> snapshot.Slot0Serial + snapshot.Slot1Serial

func QueueIsolationClose(window Window) {
  if window.IsOpen {
    window.RequestClose()
  }
}

func RunQueueIsolationSmoke() {
  QueueIsolationRequire(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let firstRoot = QueueIsolationCell{}
  let secondRoot = QueueIsolationCell{}
  let thirdRoot = QueueIsolationCell{}
  let capturedError = StringWriter()
  let originalError = Console.Error
  var first Window? = nil
  var second Window? = nil
  var third Window? = nil
  var submitHoldVerified = false
  var presentHoldVerified = false
  var pendingWaitVerified = false
  var siblingServiceVerified = false
  var retryVerified = false
  var convergenceVerified = false
  var drainedBeforeClose = false
  var closed = false
  try {
    let openedFirst = Window{
      Title: "Goo Runtime queue isolation A",
      Width: 180,
      Height: 96,
      VSync: false,
      Root: firstRoot,
    }
    let openedSecond = Window{
      Title: "Goo Runtime queue isolation B",
      Width: 180,
      Height: 96,
      VSync: false,
      Root: secondRoot,
    }
    let openedThird = Window{
      Title: "Goo Runtime queue isolation C",
      Width: 180,
      Height: 96,
      VSync: false,
      Root: thirdRoot,
    }
    first = openedFirst
    second = openedSecond
    third = openedThird
    Console.SetError(capturedError)
    openedFirst.Open()
    openedSecond.Open()
    openedThird.Open()
    WindowReadbackTestFixture.ForceRender(openedFirst, 0.0)
    WindowReadbackTestFixture.ForceRender(openedSecond, 0.0)
    WindowReadbackTestFixture.ForceRender(openedThird, 0.0)
    QueueIsolationPump(openedFirst, openedSecond, openedThird, 0.0)
    QueueIsolationDrain(openedFirst, openedSecond, openedThird, 2000)
    QueueIsolationRequire(openedFirst.IsOpen && openedSecond.IsOpen && openedThird.IsOpen,
      "Runtime queue isolation did not open all windows")
    QueueIsolationRequire(firstRoot.Root.IsMounted
        && secondRoot.Root.IsMounted && thirdRoot.Root.IsMounted,
      "Runtime queue isolation retained root handle is not mounted")

    QueueIsolationPost(openedFirst, firstRoot)
    WindowReadbackTestFixture.ForceRender(openedFirst, 0.0)
    QueueIsolationDrain(openedFirst, openedSecond, openedThird, 2000)
    let firstBeforeSubmit = WindowReadbackTestFixture.FrameSubmissions(openedFirst)
    let secondBuildBeforeSubmit = secondRoot.BuildCount
    let thirdBuildBeforeSubmit = thirdRoot.BuildCount
    WindowReadbackTestFixture.SetForceFullRedraw(openedFirst, true)
    WindowReadbackTestFixture.RuntimeHoldNextQueueSubmit(openedFirst)
    WindowReadbackTestFixture.ForceRenderNonblocking(openedFirst, 0.0166666666666667)
    var submitHeld = false
    let submitDeadline = Stopwatch.GetTimestamp()
    +int64(float64(Stopwatch.Frequency) * 2.0)
    while Stopwatch.GetTimestamp() < submitDeadline {
      QueueIsolationPump(openedFirst, openedSecond, openedThird, 0.0)
      if WindowReadbackTestFixture.RuntimeWaitForHeldQueueCall(openedFirst, 10) {
        submitHeld = true
        break
      }
      Thread.Yield()
    }
    QueueIsolationRequire(submitHeld,
      "Runtime submit hold did not reach the queue worker: pending="
      +WindowReadbackTestFixture.RuntimeQueueWorkPending(openedFirst).ToString()
      +" submitCount="
      +WindowReadbackTestFixture.DiagnosticCounters(openedFirst).submitCount.ToString())
    let firstHeldSubmit = WindowReadbackTestFixture.FrameSubmissions(openedFirst)
    QueueIsolationRequire(
      QueueIsolationSerialCount(firstHeldSubmit)
      == QueueIsolationSerialCount(firstBeforeSubmit),
      "Runtime submit hold changed the target submission serial before release")
    var pump int32 = 0
    while pump < 4 {
      QueueIsolationPost(openedSecond, secondRoot)
      QueueIsolationPost(openedThird, thirdRoot)
      QueueIsolationPump(openedFirst, openedSecond, openedThird, 0.0)
      pump = pump + 1
    }
    QueueIsolationRequire(secondRoot.PostedCount > 0 && thirdRoot.PostedCount > 0,
      "Runtime submit hold blocked sibling posted UI service progress")
    QueueIsolationRequire(secondRoot.BuildCount > secondBuildBeforeSubmit
        && thirdRoot.BuildCount > thirdBuildBeforeSubmit
        && firstRoot.Root.IsMounted && secondRoot.Root.IsMounted
        && thirdRoot.Root.IsMounted,
      "Runtime submit hold did not retain sibling trees through posted rebuilds")
    siblingServiceVerified = true
    QueueIsolationRequire(
      QueueIsolationSerialCount(WindowReadbackTestFixture.FrameSubmissions(openedFirst))
      == QueueIsolationSerialCount(firstBeforeSubmit),
      "Runtime submit hold produced a duplicate target packet")
    submitHoldVerified = true
    WindowReadbackTestFixture.RuntimeReleaseHeldQueueCall()
    QueueIsolationDrain(openedFirst, openedSecond, openedThird, 2000)
    let firstAfterSubmit = WindowReadbackTestFixture.FrameSubmissions(openedFirst)
    QueueIsolationRequire(
      QueueIsolationSerialCount(firstAfterSubmit)
      > QueueIsolationSerialCount(firstBeforeSubmit),
      "Runtime submit hold did not converge after release")
    convergenceVerified = true

    QueueIsolationPost(openedFirst, firstRoot)
    WindowReadbackTestFixture.ForceRender(openedFirst, 0.0)
    QueueIsolationDrain(openedFirst, openedSecond, openedThird, 2000)
    let firstBeforePresent = WindowReadbackTestFixture.FrameSubmissions(openedFirst)
    let firstBuildBeforePresent = firstRoot.BuildCount
    let secondBuildBeforePresent = secondRoot.BuildCount
    let thirdBuildBeforePresent = thirdRoot.BuildCount
    WindowReadbackTestFixture.SetForceFullRedraw(openedFirst, true)
    WindowReadbackTestFixture.RuntimeHoldNextQueuePresent(openedFirst)
    WindowReadbackTestFixture.ForceRenderNonblocking(openedFirst, 0.0)
    var presentHeld = false
    let presentDeadline = Stopwatch.GetTimestamp()
    +int64(float64(Stopwatch.Frequency) * 2.0)
    while Stopwatch.GetTimestamp() < presentDeadline {
      QueueIsolationPump(openedFirst, openedSecond, openedThird, 0.0)
      if WindowReadbackTestFixture.RuntimeWaitForHeldQueueCall(openedFirst, 10) {
        presentHeld = true
        break
      }
      Thread.Yield()
    }
    QueueIsolationRequire(presentHeld,
      "Runtime present hold did not reach the queue worker")
    let pendingWait = WindowReadbackTestFixture.SchedulerWaitMs(openedFirst,
      float64(Stopwatch.GetTimestamp() + Stopwatch.Frequency))
    QueueIsolationRequire(pendingWait > 0,
      "Runtime present hold left the scheduler polling at 0 ms")
    pendingWaitVerified = true
    let firstHeldPresent = WindowReadbackTestFixture.FrameSubmissions(openedFirst)
    pump = 0
    while pump < 4 {
      QueueIsolationPost(openedSecond, secondRoot)
      QueueIsolationPost(openedThird, thirdRoot)
      QueueIsolationPump(openedFirst, openedSecond, openedThird, 0.0)
      pump = pump + 1
    }
    QueueIsolationRequire(secondRoot.PostedCount > 4 && thirdRoot.PostedCount > 4
        && secondRoot.BuildCount > secondBuildBeforePresent
        && thirdRoot.BuildCount > thirdBuildBeforePresent,
      "Runtime present hold blocked sibling UI service progress")
    QueueIsolationRequire(firstRoot.BuildCount == firstBuildBeforePresent,
      "Runtime present hold rebuilt the target without a released packet")
    QueueIsolationRequire(
      QueueIsolationSerialCount(WindowReadbackTestFixture.FrameSubmissions(openedFirst))
      == QueueIsolationSerialCount(firstHeldPresent),
      "Runtime present hold produced a duplicate target packet")
    presentHoldVerified = true
    WindowReadbackTestFixture.RuntimeReleaseHeldQueueCall()
    QueueIsolationDrain(openedFirst, openedSecond, openedThird, 2000)
    QueueIsolationRequire(
      QueueIsolationSerialCount(WindowReadbackTestFixture.FrameSubmissions(openedFirst))
      > QueueIsolationSerialCount(firstBeforePresent),
      "Runtime present hold did not converge after release")
    convergenceVerified = true

    QueueIsolationPost(openedFirst, firstRoot)
    WindowReadbackTestFixture.ForceRender(openedFirst, 0.0)
    QueueIsolationDrain(openedFirst, openedSecond, openedThird, 2000)
    let firstBeforeRetry = WindowReadbackTestFixture.FrameSubmissions(openedFirst)
    let deferredBefore = WindowReadbackTestFixture.RuntimeDeferredQueueEnqueueCount()
    WindowReadbackTestFixture.RuntimeDeferNextQueueEnqueue(openedFirst)
    WindowReadbackTestFixture.SetForceFullRedraw(openedFirst, true)
    WindowReadbackTestFixture.ForceRenderNonblocking(openedFirst, 0.0)
    let deferredTarget = deferredBefore + 1L
    let deferredDeadline = Stopwatch.GetTimestamp()
    +int64(float64(Stopwatch.Frequency) * 2.0)
    while Stopwatch.GetTimestamp() < deferredDeadline {
      let deferredCurrent = WindowReadbackTestFixture.RuntimeDeferredQueueEnqueueCount()
      if deferredCurrent >= deferredTarget {
        break
      }
      QueueIsolationPump(openedFirst, openedSecond, openedThird, 0.0)
      Thread.Yield()
    }
    let deferredAfter = WindowReadbackTestFixture.RuntimeDeferredQueueEnqueueCount()
    QueueIsolationRequire(deferredAfter == deferredBefore + 1L,
      "Runtime deferred queue enqueue was not consumed by the initial attempt")
    let retryDeadline = Stopwatch.GetTimestamp()
    +int64(float64(Stopwatch.Frequency) * 2.0)
    while Stopwatch.GetTimestamp() < retryDeadline {
      QueueIsolationPump(openedFirst, openedSecond, openedThird, 0.0)
      if !WindowReadbackTestFixture.RuntimeQueueWorkPending(openedFirst)
        && QueueIsolationSerialCount(WindowReadbackTestFixture.FrameSubmissions(openedFirst))
      > QueueIsolationSerialCount(firstBeforeRetry) {
        retryVerified = true
        break
      }
      Thread.Yield()
    }
    QueueIsolationRequire(retryVerified,
      "Runtime deferred queue enqueue did not retry and converge")
    QueueIsolationDrain(openedFirst, openedSecond, openedThird, 2000)
  } finally {
    WindowReadbackTestFixture.RuntimeReleaseHeldQueueCall()
    if let activeFirst = first {
      if let activeSecond = second {
        if let activeThird = third {
          try {
            QueueIsolationDrain(activeFirst, activeSecond, activeThird, 2000)
            drainedBeforeClose = true
          } catch (error Exception) {
          }
        }
      }
    }
    if let active = first { QueueIsolationClose(active) }
    if let active = second { QueueIsolationClose(active) }
    if let active = third { QueueIsolationClose(active) }
    let closeDeadline = Stopwatch.GetTimestamp()
    +int64(float64(Stopwatch.Frequency) * 2.0)
    while Stopwatch.GetTimestamp() < closeDeadline {
      if let active = first {
        if active.IsOpen { WindowReadbackTestFixture.Pump(active, 0.0) }
      }
      if let active = second {
        if active.IsOpen { WindowReadbackTestFixture.Pump(active, 0.0) }
      }
      if let active = third {
        if active.IsOpen { WindowReadbackTestFixture.Pump(active, 0.0) }
      }
      let firstClosed = if let active = first { !active.IsOpen } else { true }
      let secondClosed = if let active = second { !active.IsOpen } else { true }
      let thirdClosed = if let active = third { !active.IsOpen } else { true }
      if firstClosed && secondClosed && thirdClosed {
        closed = true
        break
      }
      Thread.Yield()
    }
    if let activeFirst = first {
      if let activeSecond = second {
        if let activeThird = third {
          drainedBeforeClose = !WindowReadbackTestFixture.RuntimeQueueWorkPending(activeFirst)
            && !WindowReadbackTestFixture.RuntimeQueueWorkPending(activeSecond)
            && !WindowReadbackTestFixture.RuntimeQueueWorkPending(activeThird)
        }
      }
    }
    Console.SetError(originalError)
  }
  let diagnostics = capturedError.ToString()
  ReadbackValidateCommonDiagnostics(diagnostics)
  QueueIsolationRequire(drainedBeforeClose && closed,
    "Runtime queue isolation did not drain queue work and close all windows")
  QueueIsolationRequire(submitHoldVerified && presentHoldVerified
      && pendingWaitVerified && siblingServiceVerified && retryVerified && convergenceVerified,
    "Runtime queue isolation gate did not complete all phases")
  let submitCount = DiagnosticCounter(diagnostics, "submitCount")
  let presentCount = DiagnosticCounter(diagnostics, "presentCount")
  let resultCount = DiagnosticCounter(diagnostics, "resultCount")
  Console.WriteLine("queue-isolation-smoke: submit_hold=1 present_hold=1 pending_wait=1"
    +" sibling_service=1 retry=1 convergence=1 close=1"
    +" submitCount=" + submitCount.ToString()
    +" presentCount=" + presentCount.ToString()
    +" resultCount=" + resultCount.ToString())
}
